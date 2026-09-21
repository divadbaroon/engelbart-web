import type { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/projects";
import { getRepo } from "@/lib/repos-server";
import { getRun } from "@/lib/sandbox-server";
import { isSandboxLive } from "@/lib/sandbox";
import { getModelCall, getTrace } from "@/app/workspace/[workspaceId]/trace-actions";
import { isBartModel } from "@/lib/bart/models";
import { MAX_MESSAGE_CHARS, refsIn, type BartEvent, type BartRequest, type MessageContext, type SelectionRef } from "@/lib/bart/protocol";
import { traceModel, type TraceModel } from "@/lib/bart/grounding";
import { buildIndex } from "@/lib/semantics/lookup";
import { mapsOf, toStoredSemantics, SEMANTIC_COLUMNS, type SemanticRow, type StoredSemantics } from "@/lib/semantics/model";
import { SYSTEM_PROMPT, situationBlock } from "@/lib/bart/prompt";
import { TOOLS, runTool, toolLabel, type ToolContext } from "@/lib/bart/tools";
import { redactor } from "@/lib/bart/repo";
import { appendMessage, createThread, threadInProject, threadMessages } from "@/lib/bart/store";
import { RECORDING_COLUMNS, scopeTrace, toRecording, windowOf, type Recording, type RecordingRow } from "@/lib/trace/recording";
import { ANNOTATION_COLUMNS, toAnnotation, type Annotation, type AnnotationRow } from "@/lib/annotations/model";
import { readingForRun } from "@/lib/activity/profile/lookup";
import { BLIND_READING, type Reading } from "@/lib/activity/reading";

// One turn with Bart. The browser sends the question and what is in the
// middle of the workspace by id; the server assembles the situation,
// lets the model fetch what it needs with tools, streams the answer as
// server-sent events, and saves both messages to the thread. Nothing
// from the trace or the repository leaves the server except what a tool
// returns to the model. No segment config: the project runs with
// cacheComponents, which forbids it; Node is the default runtime, and
// the hosting platform's function timeout bounds a turn.

const MAX_ROUNDS = 8;         // tool rounds in one turn
const HISTORY = 30;           // prior messages sent along
const MAX_TOKENS = 4096;

type Body = Partial<BartRequest>;
const PANEL_ERROR = (message: string, status: number) => Response.json({ error: message }, { status });

function selectionRef(v: unknown): SelectionRef | null {
  if (!v || typeof v !== "object") return null;
  const { stageId, callId, episodeId } = v as { stageId?: unknown; callId?: unknown; episodeId?: unknown };
  const s = typeof stageId === "string" ? stageId : null, c = typeof callId === "string" ? callId : null;
  // Which reading of that moment was chosen. An identity, like the other
  // two: it is looked up in the route's own reading of the run's events,
  // so an unknown one simply does not match and the first reading leads.
  const e = typeof episodeId === "string" ? episodeId : null;
  return s || c ? { stageId: s, callId: c, episodeId: e } : null;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try { body = await req.json(); } catch { return PANEL_ERROR("Malformed request.", 400); }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return PANEL_ERROR("Nothing to ask.", 400);
  if (message.length > MAX_MESSAGE_CHARS) return PANEL_ERROR(`Keep a message under ${MAX_MESSAGE_CHARS.toLocaleString("en-US")} characters.`, 413);
  if (!isBartModel(body.model)) return PANEL_ERROR("That model is not on Bart's list.", 400);
  const model = body.model;
  if (typeof body.projectId !== "string" || !isUuid(body.projectId)) return PANEL_ERROR("No workspace.", 400);
  const projectId = body.projectId;
  const repoId = typeof body.repoId === "string" && isUuid(body.repoId) ? body.repoId : null;
  const runId = typeof body.runId === "string" && isUuid(body.runId) ? body.runId : null;
  const selection = selectionRef(body.selection);
  const recordingId = typeof body.recordingId === "string" && isUuid(body.recordingId) ? body.recordingId : null;
  const annotationId = typeof body.annotationId === "string" && isUuid(body.annotationId) ? body.annotationId : null;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) return PANEL_ERROR("You are not signed in.", 401);

  let client: Anthropic;
  try { client = new Anthropic(); } catch { return PANEL_ERROR("Bart's model key is not configured on the server (ANTHROPIC_API_KEY).", 503); }

  // The thread, the repository and the run, all through row-level security.
  let threadId: string;
  try {
    if (typeof body.threadId === "string" && isUuid(body.threadId)) {
      if (!(await threadInProject(body.threadId, projectId))) return PANEL_ERROR("That conversation is not in this workspace.", 404);
      threadId = body.threadId;
    } else threadId = (await createThread(projectId)).id;
  } catch (err) { return PANEL_ERROR(err instanceof Error ? err.message : String(err), 500); }

  const repo = repoId ? await getRepo(projectId, repoId).catch(() => null) : null;
  const run = repo && runId ? await getRun(runId).catch(() => null) : null;
  const runOk = run && run.repoId === repo?.id ? run : null;
  // The recording open in the Trace tab, if it is this run's: the trace
  // tools then read inside it unless asked for the whole run.
  let recording: Recording | null = null;
  if (recordingId && runOk) {
    const { data } = await supabase.from("engelbart_recordings").select(RECORDING_COLUMNS).eq("id", recordingId).maybeSingle();
    const rec = data ? toRecording(data as RecordingRow) : null;
    recording = rec && rec.runId === runOk.id ? rec : null;
  }
  // The note the person asked about, if it is this repository's. A note
  // belongs to a repository, not to a run, so it is checked against the
  // repository and nothing else; one that does not belong is dropped from
  // the context, so what is saved with the message is what was actually
  // authorised rather than what was claimed.
  let annotation: Annotation | null = null;
  if (annotationId && repo) {
    const { data } = await supabase.from("engelbart_annotations").select(ANNOTATION_COLUMNS).eq("id", annotationId).maybeSingle();
    const note = data ? toAnnotation(data as AnnotationRow) : null;
    annotation = note && note.repoId === repo.id ? note : null;
  }
  const context: MessageContext = { runId: runOk?.id ?? null, repoId: repo?.id ?? null, selection, recordingId: recording?.id ?? null, annotationId: annotation?.id ?? null };

  // What has been read about this application's interfaces, once per
  // turn. It is the repository's, like the notes, and it is filtered here
  // for the same reason: a project holds several repositories and the
  // read policy is the project's. The error is kept so a missing table
  // reads as what it is rather than as an application nobody has read.
  let readings: Promise<{ readings: StoredSemantics[]; error: string | null }> | null = null;
  const semantics = () => (readings ??= (async () => {
    if (!repo) return { readings: [], error: null };
    const { data, error } = await supabase.from("engelbart_ui_semantics").select(SEMANTIC_COLUMNS).eq("repo_id", repo.id).order("created_at", { ascending: true });
    if (error) return { readings: [], error: `What the interface is for could not be read: ${error.message}` };
    return { readings: (data ?? []).map((r) => toStoredSemantics(r as SemanticRow)), error: null };
  })());

  // The trace is read once per turn, when the situation is written; the
  // same model serves every tool call of the turn. The rows are named
  // with the reading where there is one, exactly as the Trace tab names
  // them, so Bart and the person are reading the same words.
  let loaded: Promise<TraceModel | null> | null = null;
  const index = async () => { const got = await semantics(); return buildIndex(mapsOf(got.readings)); };
  // How this artifact is read: looked up, never chosen here and never
  // sent with the question. It is found once with the trace and kept, so
  // a recording is read in the same words as the run it was cut from.
  // Until there is one the reading is blind, which says what any artifact
  // would show rather than borrowing another artifact's vocabulary.
  let reading: Reading = BLIND_READING;
  const fullTrace = () => (loaded ??= (async () => {
    if (!runOk || runOk.trace === "off") return null;
    const snap = await getTrace(runOk.id);
    if (!snap.ok) return null;
    reading = await readingForRun(supabase, repo, snap.events);
    return traceModel(snap.events, snap.calls, undefined, await index(), reading);
  })());
  let notes: Promise<{ notes: Annotation[]; error: string | null }> | null = null;
  let scoped: Promise<TraceModel | null> | null = null;
  const trace = () => (scoped ??= (async () => {
    const full = await fullTrace();
    if (!full || !recording) return full;
    const cut = scopeTrace(full.events, Object.values(full.calls), windowOf(recording));
    return traceModel(cut.events, cut.calls, full.frames, await index(), reading);
  })());
  const ctx: ToolContext = {
    repo, run: runOk, access: repo ? { repo, run: runOk, redact: await redactor(repo.id) } : null, trace, fullTrace, selection,
    // A note is read under row-level security and then checked against
    // the repository that is open, the same belt-and-braces the run and
    // the recording get: a note of another repository is not this
    // conversation's to read.
    annotation: async (id) => {
      if (!repo || !isUuid(id)) return null;
      const { data } = await supabase.from("engelbart_annotations").select(ANNOTATION_COLUMNS).eq("id", id).maybeSingle();
      const note = data ? toAnnotation(data as AnnotationRow) : null;
      return note && note.repoId === repo.id ? note : null;
    },
    // Every note of the open repository, read once per turn. The read
    // policy is the project's, so the repository is filtered here: a
    // project holds several repositories and a listing that forgot this
    // would answer with another artifact's notes. The error is kept
    // rather than dropped, so a missing table reads as what it is
    // instead of as a repository nobody has annotated.
    annotations: async () => (notes ??= (async () => {
      if (!repo) return { notes: [], error: null };
      const { data, error } = await supabase.from("engelbart_annotations").select(ANNOTATION_COLUMNS).eq("repo_id", repo.id).order("created_at", { ascending: true });
      if (error) return { notes: [], error: `The notes could not be read: ${error.message}` };
      return { notes: (data ?? []).map((r) => toAnnotation(r as AnnotationRow)), error: null };
    })()),
    recordingId: recording?.id ?? null,
    semantics,
    rawCall: async (call) => { const got = await getModelCall(call.id, true); return got.ok ? got.call : call; },
  };
  const situation = situationBlock({ repo, run: runOk, selection, trace: await trace(), source: isSandboxLive(runOk ?? undefined) ? "sandbox" : repo ? "github" : "none", recording, annotation });

  const history = (await threadMessages(threadId, HISTORY).catch(() => [])).map((m) => ({ role: m.role, content: m.content }));
  const userMessage = await appendMessage(threadId, { role: "user", content: message, context, refs: [], model: null }).catch(() => null);
  if (!userMessage) return PANEL_ERROR("The message could not be saved.", 500);

  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: BartEvent) => { if (closed) return; try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); } catch { closed = true; } };
      const finish = () => { if (!closed) { closed = true; try { controller.close(); } catch { /* closed */ } } };
      send({ type: "thread", threadId, userMessageId: userMessage.id });

      const messages: Anthropic.Messages.MessageParam[] = mergeTurns([...history, { role: "user", content: message }]);
      const system: Anthropic.Messages.TextBlockParam[] = [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        { type: "text", text: situation },
      ];
      let answer = "";
      try {
        for (let round = 0; round <= MAX_ROUNDS; round++) {
          const s = client.messages.stream({ model, max_tokens: MAX_TOKENS, system, tools: TOOLS, messages }, { signal: req.signal });
          s.on("text", (delta) => { answer += delta; send({ type: "text", delta }); });
          const final = await s.finalMessage();
          const blocks: Anthropic.Messages.ContentBlockParam[] = [];
          for (const b of final.content) {
            if (b.type === "text") blocks.push({ type: "text", text: b.text });
            else if (b.type === "tool_use") blocks.push({ type: "tool_use", id: b.id, name: b.name, input: b.input });
          }
          if (blocks.length) messages.push({ role: "assistant", content: blocks });
          const uses = final.content.filter((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use");
          if (final.stop_reason !== "tool_use" || !uses.length) break;
          if (round === MAX_ROUNDS) { answer += "\n\n(I stopped looking things up after several rounds; ask again to go further.)"; send({ type: "text", delta: "\n\n(I stopped looking things up after several rounds; ask again to go further.)" }); break; }
          const results: Anthropic.Messages.ToolResultBlockParam[] = [];
          for (const use of uses) {
            const input = (use.input && typeof use.input === "object" ? use.input : {}) as Record<string, unknown>;
            const label = toolLabel(use.name, input);
            send({ type: "tool", id: use.id, name: use.name, label, state: "running" });
            const result = await runTool(use.name, input, ctx);
            send({ type: "tool", id: use.id, name: use.name, label, state: result.error ? "failed" : "done" });
            results.push({ type: "tool_result", tool_use_id: use.id, content: result.text, is_error: result.error || undefined });
          }
          messages.push({ role: "user", content: results });
          if (answer && !answer.endsWith("\n")) { answer += "\n\n"; send({ type: "text", delta: "\n\n" }); }
        }
        const text = answer.trim();
        if (text) {
          const saved = await appendMessage(threadId, { role: "assistant", content: text, context, refs: refsIn(text), model }).catch(() => null);
          send({ type: "done", messageId: saved?.id ?? crypto.randomUUID(), refs: refsIn(text), model });
        } else send({ type: "error", message: "Bart had nothing to say; try again." });
      } catch (err) {
        const text = answer.trim();
        if (text && !req.signal.aborted) await appendMessage(threadId, { role: "assistant", content: text, context, refs: refsIn(text), model }).catch(() => null);
        if (!req.signal.aborted) send({ type: "error", message: describeError(err) });
      } finally { finish(); }
    },
    cancel() { closed = true; },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" },
  });
}

// Consecutive turns of one role become one turn: the model wants them to
// alternate, and a saved turn can be missing its answer.
function mergeTurns(turns: { role: "user" | "assistant"; content: string }[]): Anthropic.Messages.MessageParam[] {
  const out: Anthropic.Messages.MessageParam[] = [];
  for (const t of turns) {
    const last = out[out.length - 1];
    if (last && last.role === t.role && typeof last.content === "string") last.content = `${last.content}\n\n${t.content}`;
    else out.push({ role: t.role, content: t.content });
  }
  if (out[0]?.role === "assistant") out.shift();
  return out;
}

function describeError(err: unknown): string {
  if (err instanceof Anthropic.APIError) {
    if (err.status === 401) return "Bart's model key was refused by Anthropic.";
    if (err.status === 429) return "Anthropic is rate-limiting Bart; try again in a moment.";
    if (err.status === 529) return "Anthropic is overloaded; try again in a moment.";
    return `Anthropic returned ${err.status ?? "an error"}: ${err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}
