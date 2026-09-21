// What Bart is told when it asks about a run: the same derivations the
// Trace tab reads, written out as text a model can use, each thing named
// by the id the workspace can open. Nothing here reads the application,
// and nothing here infers a cause: a tie is reported the way the trace
// recorded it, with its correlation. Pure: no DOM, no React, no network.
import type { ModelCall, TraceEvent } from "@/lib/trace/types";
import {
  describeLink, formatBytes, formatClock, formatMs, frameDetail, frameIndex, frameName, netText, prettyJson, summarizeCall, traceRows, traceStages,
  type CallRow, type FrameInfo, type InteractionRow, type Stage, type TraceRow,
} from "@/lib/trace/timeline";
import { callOwner, callState, liveLine, momentActions, momentKind, relatedCall, relationWord, responseQuotes, shortClock, submitEcho } from "@/lib/trace/moments";
import { conversation, messageText, promptSections, type Message } from "@/lib/trace/context";
import type { SemanticIndex } from "@/lib/semantics/lookup";
import { episodeOf, readSession } from "@/lib/activity/read";
import { confidenceWord } from "@/lib/activity/taxonomy";
import { BLIND_READING, type Reading } from "@/lib/activity/reading";
import type { Episode } from "@/lib/activity/types";

export type TraceModel = {
  events: TraceEvent[];
  calls: Record<string, ModelCall>;
  rows: TraceRow[];
  stages: Stage[];
  diagnostics: TraceRow[];
  frames: Map<string, FrameInfo>;
  callRows: Map<string, CallRow>;
  // What the person was doing, read from the same events the Trace tab
  // reads them from. Derived here rather than sent with the question:
  // a selection travels as identities, so the only way Bart can be told
  // the same sentence the screen shows is to arrive at it again from the
  // events. That it does is the point — classify is deterministic, so
  // the browser and the route read one session one way.
  episodes: Episode[];
};

// A slice of a run passes the whole run's frame index, so documents named
// before the slice began keep their names inside it.
//
// `reading` is how the artifact is read: the profile written for it,
// compiled. Left out, the session is read blind — it names what holds in
// any artifact and nothing else. The caller looks the profile up rather
// than choosing it, so what Bart is told and what the screen shows are
// the same words, arrived at twice from the same events.
export function traceModel(events: TraceEvent[], calls: ModelCall[], frames: Map<string, FrameInfo> = frameIndex(events), semantics: SemanticIndex | null = null, reading: Reading = BLIND_READING): TraceModel {
  const rows = traceRows(events, calls, frames, semantics);
  const grouped = traceStages(rows);
  return {
    events, calls: Object.fromEntries(calls.map((c) => [c.callId, c])), rows, stages: grouped.primary, diagnostics: grouped.diagnostics,
    frames, callRows: new Map(rows.filter((r): r is CallRow => r.kind === "call").map((r) => [r.id, r])),
    episodes: readSession({
      stages: grouped.primary, frames, events,
      calls: new Map(calls.map((c) => [c.callId, { model: c.model, latencyMs: c.latencyMs }])),
      semantics: semantics ?? undefined,
      taxonomy: reading.taxonomy, surfaceOf: reading.surfaceOf,
    }),
  };
}

// What the Activity reading says about a moment, in one line, for
// wherever this file names a stage. The wording is the episode's own —
// the same string the timeline, the canvas card, the drawer and the
// inspector show — because a second phrasing here would be a second
// reading. A stage that is two episodes gets both: the composing and the
// send are one submit stage, and saying only the first would lose the act.
export const readingsOf = (m: TraceModel, stageId: string): Episode[] => m.episodes.filter((e) => e.stageIds.includes(stageId));
const readingLine = (e: Episode) => `${e.broadBehavior}/${e.subBehavior}: ${e.description}`;

// The session as what somebody was doing, in order — the same list, in
// the same words, that the Activity timeline shows.
//
// It is a section of its own rather than a note on each moment, because
// the two are different cuts of one run and do not nest: a stretch of
// writing can run across several moments, and one submit moment is the
// writing and then the sending. Folding either into the other repeats
// it. Each line names the moments it was read from, so a question can go
// from what somebody was doing to the acts underneath it and back.
export function activityOutline(m: TraceModel, limit = 60): string {
  if (!m.episodes.length) return "No activity has been read from this run yet.";
  const shown = m.episodes.length > limit ? m.episodes.slice(m.episodes.length - limit) : m.episodes;
  const lines = shown.map((e) => {
    const from = e.stageIds.length ? e.stageIds.join(", ") : "no moment: nothing was recorded in this stretch";
    return `${shortClock(e.startedAt)}  ${e.broadBehavior}/${e.subBehavior}  ${e.description}  (${formatMs(e.durationMs)}, confidence ${e.confidence}; activity ${e.id}; read from ${from})`;
  });
  const head = m.episodes.length > limit ? `${m.episodes.length} activities; the last ${limit}:\n` : `${m.episodes.length} activit${m.episodes.length === 1 ? "y" : "ies"}:\n`;
  return head + lines.join("\n");
}

// ---- bounds: a tool answer is a slice, with where the next one starts
export const SLICE = 12_000;
export type Slice = { text: string; next: number | null; total: number };
export function slice(text: string, offset = 0, size = SLICE): Slice {
  const start = Math.max(0, Math.min(offset, text.length));
  const end = Math.min(text.length, start + size);
  const cut = end < text.length;
  return { text: text.slice(start, end) + (cut ? `\n… [${text.length - end} more characters; call again with offset ${end}]` : ""), next: cut ? end : null, total: text.length };
}

const ms = (iso: string) => Date.parse(iso);
const q = (s: string, max = 120) => `“${s.length > max ? s.slice(0, max - 1) + "…" : s}”`;
const n = (v: number) => v.toLocaleString("en-US");
const callStageOf = (m: TraceModel, callId: string) => m.stages.find((s) => s.stage === "call" && s.callId === callId) ?? null;

// ---- the run at a glance: every moment, one line each, by id
export function tableOfContents(m: TraceModel, limit = 60): string {
  const { stages, callRows } = m;
  if (!stages.length) return "No moments yet: nothing was done in the application, or nothing has been recorded.";
  const shown = stages.length > limit ? stages.slice(stages.length - limit) : stages;
  const lines = shown.map((s) => {
    const i = stages.indexOf(s) + 1;
    const row = s.stage === "call" && s.callId ? callRows.get(s.callId) : undefined;
    const id = s.stage === "call" && s.callId ? `call ${s.callId}` : s.id;
    const title = row ? `Model call ${summarizeCall(row).model ?? ""}`.trim() : s.title;
    const line = liveLine(s, callRows);
    const tie = tieLine(m, s);
    return `#${i}  ${shortClock(s.at)}  ${title}  (${id})${line ? `  — ${line}` : ""}${tie ? `  ${tie}` : ""}`;
  });
  const head = stages.length > limit ? `${stages.length} moments; the last ${limit}:\n` : `${stages.length} moment${stages.length === 1 ? "" : "s"}:\n`;
  return head + lines.join("\n");
}

function tieLine(m: TraceModel, s: Stage): string | null {
  if (s.stage === "call" && s.callId) {
    const owner = callOwner(s.callId, m.stages, m.callRows);
    return owner ? `← tied to ${owner.stageId} ${relationWord(owner.correlation) === "linked" ? "by an id the request carried" : "by timing"}` : "← no interaction tied";
  }
  const rel = relatedCall(s, m.stages, m.callRows);
  if (!rel) return s.stage === "submit" ? "→ no model call tied" : null;
  return s.stage === "submit" ? `→ call ${rel.callId} (${relationWord(rel.correlation)})` : `← during call ${rel.callId} (${relationWord(rel.correlation)})`;
}

// ---- one moment in full, evidence on request
export function momentReport(m: TraceModel, stageId: string, evidence = false, episodeId: string | null = null): string | null {
  const stage = m.stages.find((s) => s.id === stageId) ?? (stageId.startsWith("mc_") ? callStageOf(m, stageId) : null);
  if (!stage) return null;
  const kind = momentKind(stage);
  const out: string[] = [];
  const dur = ms(stage.endAt) - ms(stage.at);
  // What the person was doing comes first, because that is the thing
  // asked about; the stage is how it was read, and follows. Where the
  // selection named which reading it was — one submit stage is the
  // writing and then the sending — that one leads and the other is
  // listed after it, so "this" stays the thing that was clicked.
  const chosen = kind === "human" ? episodeOf(m.episodes, episodeId, stage.id) : null;
  const others = chosen ? readingsOf(m, stage.id).filter((e) => e.id !== chosen.id) : [];
  if (chosen) {
    out.push(`Activity ${chosen.id}: ${chosen.description}`);
    out.push(`Read as ${chosen.broadBehavior}/${chosen.subBehavior}, at ${formatClock(chosen.startedAt)} for ${formatMs(chosen.durationMs)}. Confidence ${chosen.confidence} — ${confidenceWord(chosen.confidence)}; ${chosen.because}.`);
    if (others.length) out.push(`The same stretch of trace also holds ${others.map(readingLine).join(" · ")}`);
    out.push(`Read from moment ${stage.id}, which the collector called ${q(stage.title)}, at ${formatClock(stage.at)}${dur > 0 ? ` for ${formatMs(dur)}` : ""}. That moment is the evidence; the activity above is the reading of it. Cite it as [[moment:${stage.id}]].`);
  } else {
    out.push(`Moment ${stage.id}: ${stage.title}, at ${formatClock(stage.at)}${dur > 0 ? ` for ${formatMs(dur)}` : ""}.`);
  }
  out.push(kind === "human" ? "Source: the browser bridge recorded these acts (trace)." : kind === "model" ? "Source: the model gateway recorded this call (trace); its content is in inspect_model_call." : "Source: the browser bridge recorded text that appeared in the page (trace).");
  out.push(`Label: ${stage.label}`);
  if (stage.detail) out.push(`Detail: ${stage.detail}`);

  if (kind === "human") {
    const acts = momentActions(stage);
    if (acts.length) out.push(`Acts, in order: ${acts.join("; ")}.`);
    const echo = submitEcho(stage, m.callRows);
    if (echo) out.push(`Echoed in the page after the submit${echo.sinceMs !== null ? `, ${formatMs(echo.sinceMs)} later` : ""}: ${q(echo.text, 300)}${echo.more ? ` and ${echo.more} more` : ""}. This is what the page showed, not what was typed: typed characters are never recorded.`);
    const first = stage.rows[0];
    const frameId = first && (first.kind === "interaction" || first.kind === "keys") ? first.frameId : null;
    const f = frameId ? m.frames.get(frameId) : undefined;
    if (f && f.parentFrameId) out.push(`Frame: ${frameName(m.frames, frameId)} (${frameDetail(f)}).`);
    const links = stage.rows.flatMap((r) => (r.kind === "interaction" ? r.links : r.kind === "keys" ? r.rows.flatMap((k) => k.links) : []));
    if (links.length) out.push(`Requests the application made after it: ${links.slice(0, 8).map(describeLink).join("; ")}${links.length > 8 ? `; and ${links.length - 8} more` : ""}.`);
  }
  if (kind === "observed") {
    const quotes = responseQuotes(stage);
    if (quotes.length) out.push(`Text that appeared: ${quotes.slice(0, 4).map((t) => q(t, 300)).join(" · ")}${quotes.length > 4 ? ` and ${quotes.length - 4} more` : ""}.`);
    out.push("The trace does not record what rendered this text; it records that it appeared.");
  }
  if (kind === "model" && stage.callId) {
    const row = m.callRows.get(stage.callId);
    if (row) { const s = summarizeCall(row); out.push(`Call ${stage.callId}: ${s.model ?? "model"} at ${s.where}, ${callState(s)}${s.messages !== null ? `, ${s.messages} messages` : ""}${s.outputChars !== null ? `, ${n(s.outputChars)} characters back` : ""}.`); }
    const owner = callOwner(stage.callId, m.stages, m.callRows);
    out.push(owner ? `Tied to ${owner.stageId} (${owner.title}) ${owner.correlation === "explicit" ? "by an id the request carried" : "by timing"}${stage.link?.text ? `: ${stage.link.text}` : ""}.` : "No interaction is tied to this call: the collector did not join it to any act.");
  } else {
    const rel = relatedCall(stage, m.stages, m.callRows);
    if (rel) out.push(`${kind === "observed" ? "Appeared during" : "Tied to"} model call ${rel.callId} (${rel.model ?? "model"}, ${rel.stateText}) ${rel.correlation === "explicit" ? "by an id the request carried" : "by timing"}${rel.text ? `: ${rel.text}` : ""}. ${rel.correlation === "temporal" ? "Timing is an association, not proof that one caused the other." : ""}`.trim());
    else if (stage.stage !== "navigate") out.push("No model call is tied to this moment.");
  }
  if (evidence) out.push("", evidenceReport(stage));
  return out.join("\n");
}

function evidenceReport(stage: Stage): string {
  const lines = [`Evidence: ${stage.rows.length} row${stage.rows.length === 1 ? "" : "s"}, ${stage.events.length} raw event${stage.events.length === 1 ? "" : "s"}.`];
  for (const r of stage.rows.slice(0, 40)) {
    if (r.kind === "interaction") lines.push(`- ${formatClock(r.at)} ${r.label}${r.detail ? ` · ${r.detail}` : ""}${r.links.length ? ` · requests: ${r.links.map(describeLink).join("; ")}` : ""}${r.changes.length ? ` · ${r.changes.length} visible change${r.changes.length === 1 ? "" : "s"}` : ""}`);
    else if (r.kind === "keys") lines.push(`- ${formatClock(r.at)} ${r.label} · ${r.detail} · ${r.presses} presses`);
    else if (r.kind === "call") lines.push(`- ${formatClock(r.at)} model call ${r.id}${r.via ? ` · after: ${r.via}` : ""}${r.during ? ` · during ${r.during}` : ""}`);
    else lines.push(`- ${formatClock(r.at)} ${r.label}${r.detail ? ` · ${r.detail}` : ""}`);
  }
  if (stage.rows.length > 40) lines.push(`- … ${stage.rows.length - 40} more rows`);
  const kinds = new Map<string, number>();
  for (const e of stage.events) kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + 1);
  lines.push(`Raw event kinds: ${[...kinds.entries()].map(([k, c]) => `${k} ×${c}`).join(", ")}.`);
  return lines.join("\n");
}

// ---- one model call, a part at a time
export type CallPart = "summary" | "system" | "messages" | "tools" | "output" | "settings" | "raw_request" | "raw_response";
export const CALL_PARTS: CallPart[] = ["summary", "system", "messages", "tools", "output", "settings", "raw_request", "raw_response"];

export function callReport(m: TraceModel, call: ModelCall, part: CallPart, offset = 0): Slice {
  const req = call.request;
  const res = call.response;
  const notKept = call.capture !== "full" ? "Content was not kept for this run (capture: metadata); only counts and settings are available." : null;
  switch (part) {
    case "summary": {
      const owner = callOwner(call.callId, m.stages, m.callRows);
      const out = call.response?.output;
      const chars = out ? ("text" in out ? out.text.length : out.chars) : null;
      const rf = req?.response_format as { type?: string; json_schema?: { name?: string } } | null;
      const tools = (req?.tools ?? []) as { function?: { name?: string }; name?: string }[];
      const lines = [
        `Model call ${call.callId} (source: the captured request and response).`,
        `Model: ${call.model ?? "?"}${res?.model && res.model !== call.model ? ` (answered as ${res.model})` : ""} · provider ${call.provider ?? "unclaimed"}${call.api ? ` · ${call.api}` : ""} · ${call.method} ${call.upstream.host}${call.upstream.path}`,
        `Started ${formatClock(call.startedAt)} · ${call.phase === "request" ? "in flight" : call.phase === "error" ? `error: ${call.error?.message ?? call.error?.type ?? "?"}` : call.aborted ? "aborted by the application" : `done, status ${call.status ?? "?"}`} · latency ${formatMs(call.latencyMs)}${call.streamed ? ` · streamed, first token after ${formatMs(call.ttftMs)}` : ""}`,
        req ? `Request: ${req.message_count} messages, ${n(req.prompt_chars)} characters in all, ${n(req.system_chars)} in the system prompt${req.tools?.length ? ` · ${req.tools.length} tools offered: ${tools.map((t) => t.function?.name ?? t.name ?? "?").join(", ")}` : " · no tools"}${rf ? ` · response format ${rf.type ?? "?"}${rf.json_schema?.name ? ` (${rf.json_schema.name})` : ""}` : " · free text"}` : `Request: not described${call.requestParse?.reason ? ` (${call.requestParse.reason})` : ""}`,
        req?.settings && Object.keys(req.settings).length ? `Settings: ${Object.entries(req.settings).map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(", ")}` : "Settings: provider defaults",
        out ? `Output: ${chars !== null ? `${n(chars)} characters` : ""}${res?.finish_reason ? `, finish ${res.finish_reason}` : ""}${"text" in out && prettyJson(out.text) ? " · parses as JSON" : ""}${out.tool_calls.length ? ` · tool calls: ${out.tool_calls.map((t) => (typeof t === "string" ? t : t.name)).join(", ")}` : ""}` : "Output: none read",
        call.usageAvailable && call.usage ? `Usage: ${Object.entries(call.usage).filter(([, v]) => typeof v === "number").map(([k, v]) => `${k} ${v}`).join(", ")}` : "Usage: not returned by the provider",
        `Sizes: request ${formatBytes(call.sizes?.request_bytes)} · response ${formatBytes(call.sizes?.response_bytes)}`,
        owner ? `Tied to ${owner.stageId} (${owner.title}) ${owner.correlation === "explicit" ? "by an id the request carried" : "by timing; an association, not proof"}.` : "No interaction is tied to this call.",
        `Panes to cite: [[call:${call.callId}:overview]] [[call:${call.callId}:context]] [[call:${call.callId}:messages]] [[call:${call.callId}:tools]] [[call:${call.callId}:output]] [[call:${call.callId}:raw]]`,
      ];
      if (notKept) lines.splice(1, 0, notKept);
      return slice(lines.join("\n"), offset);
    }
    case "system": {
      if (notKept) return slice(notKept, 0);
      const text = typeof req?.system === "string" ? req.system : null;
      if (text === null) return slice(req?.system ? `The system prompt was ${(req.system as { chars: number }).chars} characters; its text was not kept.` : "No system message: the first message is not a system message.", 0);
      const sections = promptSections(text);
      const body = sections.length > 1
        ? `System prompt (${n(text.length)} characters), in the ${sections.length} sections the prompt itself marks; the text is as sent:\n\n` + sections.map((s, i) => `## ${i + 1} · ${s.title}\n${s.text}`).join("\n\n")
        : `System prompt (${n(text.length)} characters), as sent:\n\n${text}`;
      return slice(body, offset);
    }
    case "messages": {
      if (notKept) return slice(notKept, 0);
      const { system, turns, input } = conversation(req);
      const fmt = (msg: Message, i: number) => `### ${i} · ${msg.role ?? "?"}${msg.name ? ` (${msg.name})` : ""}${msg.tool_call_id ? ` · tool_call_id ${msg.tool_call_id}` : ""}\n${messageText(msg) || (typeof msg.chars === "number" ? `[${msg.chars} characters, not kept]` : "[no content]")}${Array.isArray(msg.tool_calls) && msg.tool_calls.length ? `\n[tool calls: ${JSON.stringify(msg.tool_calls)}]` : ""}`;
      const all = (req?.messages ?? []) as Message[];
      const body = `${all.length} messages as sent: ${system.length} system, ${turns.length} prior turn${turns.length === 1 ? "" : "s"}, then the latest input${input ? ` (${input.role ?? "?"})` : ""}.\n\n` + all.map(fmt).join("\n\n");
      return slice(body, offset);
    }
    case "tools": {
      const tools = req?.tools ?? [];
      const body = tools.length ? `${tools.length} tools offered · tool_choice ${req?.tool_choice === undefined || req?.tool_choice === null ? "provider default" : JSON.stringify(req.tool_choice)}:\n${JSON.stringify(tools, null, 2)}` : "No tools were offered in this request.";
      return slice(body, offset);
    }
    case "settings": {
      const body = [`Settings: ${req?.settings && Object.keys(req.settings).length ? JSON.stringify(req.settings) : "provider defaults"}`, `Streaming requested: ${req?.stream ? "yes" : "no"}`, `Response format: ${req?.response_format ? JSON.stringify(req.response_format, null, 2) : "none (free text)"}`].join("\n");
      return slice(body, offset);
    }
    case "output": {
      if (call.phase === "request") return slice("Still in flight; no output yet.", 0);
      if (call.phase === "error") return slice(`The call failed: ${call.error?.message ?? "?"}`, 0);
      const out = res?.output;
      if (!out) return slice(`Nothing was read from the response${res?.parse_errors?.length ? `: ${res.parse_errors.map((e) => e.message).join("; ")}` : ""}.`, 0);
      if (!("text" in out)) return slice(`${out.chars} characters, not kept · refusal ${out.refusal ? "yes" : "no"} · tool calls: ${out.tool_calls.join(", ") || "none"} · finish ${res?.finish_reason ?? "?"}`, 0);
      const pretty = prettyJson(out.text);
      const body = `${out.role ?? "assistant"} · finish ${res?.finish_reason ?? "?"}${call.streamed ? ` · streamed in ${res?.chunks ?? "?"} chunks` : ""}${out.text_truncated ? " · clipped to the storage budget" : ""}${out.refusal ? `\nRefusal: ${out.refusal}` : ""}\n\n${pretty ?? out.text}${out.tool_calls.length ? `\n\nTool calls: ${JSON.stringify(out.tool_calls, null, 2)}` : ""}`;
      return slice(body, offset);
    }
    case "raw_request": return slice(call.rawRequest ? prettyJson(call.rawRequest) ?? call.rawRequest : "The raw request body is not available.", offset);
    case "raw_response": return slice(call.rawResponse ?? "The raw response body is not available.", offset);
  }
}

// ---- two calls side by side, computed here so the differences are facts
export function compareCalls(m: TraceModel, a: ModelCall, b: ModelCall): string {
  const out: string[] = [`Comparing call ${a.callId} (${formatClock(a.startedAt)}) with call ${b.callId} (${formatClock(b.startedAt)}); source: the captured requests and responses.`];
  out.push(a.model === b.model ? `Same model: ${a.model ?? "?"}.` : `Different models: ${a.model ?? "?"} vs ${b.model ?? "?"}.`);
  const sa = a.request?.settings ?? {}, sb = b.request?.settings ?? {};
  const keys = [...new Set([...Object.keys(sa), ...Object.keys(sb)])];
  const diff = keys.filter((k) => JSON.stringify(sa[k]) !== JSON.stringify(sb[k]));
  out.push(diff.length ? `Settings differ in ${diff.map((k) => `${k}: ${JSON.stringify(sa[k])} → ${JSON.stringify(sb[k])}`).join(", ")}.` : "Same settings.");
  const ra = JSON.stringify(a.request?.response_format ?? null), rb = JSON.stringify(b.request?.response_format ?? null);
  out.push(ra === rb ? "Same response format." : "Different response formats.");
  const ta = JSON.stringify(a.request?.tools ?? null), tb = JSON.stringify(b.request?.tools ?? null);
  out.push(ta === tb ? "Same tools offered." : "Different tools offered.");
  const sysA = typeof a.request?.system === "string" ? a.request.system : null, sysB = typeof b.request?.system === "string" ? b.request.system : null;
  if (sysA !== null && sysB !== null) {
    if (sysA === sysB) out.push(`Identical system prompt (${n(sysA.length)} characters).`);
    else { let i = 0; while (i < sysA.length && i < sysB.length && sysA[i] === sysB[i]) i++; out.push(`System prompts differ from character ${n(i)} of ${n(sysA.length)} and ${n(sysB.length)}: …${q(sysA.slice(Math.max(0, i - 40), i + 80), 130)} vs …${q(sysB.slice(Math.max(0, i - 40), i + 80), 130)}.`); }
  } else out.push(`System prompt: ${a.request?.system_chars ?? "?"} vs ${b.request?.system_chars ?? "?"} characters (text ${sysA === null || sysB === null ? "not kept for at least one" : "kept"}).`);
  const ma = (a.request?.messages ?? []) as Message[], mb = (b.request?.messages ?? []) as Message[];
  const key = (msg: Message) => JSON.stringify([msg.role ?? "", messageText(msg)]);
  const setA = new Set(ma.map(key));
  const added = mb.filter((msg) => !setA.has(key(msg)));
  const setB = new Set(mb.map(key));
  const removed = ma.filter((msg) => !setB.has(key(msg)));
  out.push(`Messages: ${ma.length} vs ${mb.length}.${added.length ? ` In the second but not the first: ${added.map((msg) => `${msg.role ?? "?"}: ${q(messageText(msg), 160)}`).join("; ")}.` : ""}${removed.length ? ` In the first but not the second: ${removed.map((msg) => `${msg.role ?? "?"}: ${q(messageText(msg), 160)}`).join("; ")}.` : ""}`);
  const outText = (c: ModelCall) => { const o = c.response?.output; return o && "text" in o ? o.text : null; };
  const oa = outText(a), ob = outText(b);
  out.push(`Outputs: ${oa !== null ? `${n(oa.length)} characters` : "not kept"} vs ${ob !== null ? `${n(ob.length)} characters` : "not kept"}${oa !== null && ob !== null ? `; first: ${q(oa, 200)}; second: ${q(ob, 200)}` : ""}.`);
  out.push(`Latency ${formatMs(a.latencyMs)} vs ${formatMs(b.latencyMs)}; status ${a.status ?? "?"} vs ${b.status ?? "?"}.`);
  const oa2 = callOwner(a.callId, m.stages, m.callRows), ob2 = callOwner(b.callId, m.stages, m.callRows);
  out.push(`Tied to: ${oa2 ? `${oa2.stageId} (${relationWord(oa2.correlation)})` : "nothing"} vs ${ob2 ? `${ob2.stageId} (${relationWord(ob2.correlation)})` : "nothing"}.`);
  return out.join("\n");
}

// ---- find moments and calls by what they say
export function searchTrace(m: TraceModel, query: string, limit = 20): string {
  const needle = query.trim().toLowerCase();
  if (!needle) return "Empty query.";
  const hits: string[] = [];
  const snippet = (text: string) => { const i = text.toLowerCase().indexOf(needle); return i < 0 ? null : `…${text.slice(Math.max(0, i - 60), i + needle.length + 60).replace(/\s+/g, " ")}…`; };
  for (const s of m.stages) {
    const echo = submitEcho(s, m.callRows);
    const texts: [string, string][] = [["label", s.label], ...(echo ? [["echo", echo.text] as [string, string]] : []), ...momentActions(s).map((a): [string, string] => ["act", a]), ...responseQuotes(s).map((t): [string, string] => ["appeared", t]), ["detail", s.detail ?? ""]];
    for (const [where, text] of texts) { const sn = snippet(text); if (sn) { hits.push(`${s.id} (${s.title}, ${shortClock(s.at)}) · ${where}: ${sn}`); break; } }
  }
  for (const c of Object.values(m.calls)) {
    const sys = typeof c.request?.system === "string" ? c.request.system : "";
    const msgs = ((c.request?.messages ?? []) as Message[]).map(messageText).join("\n");
    const out = c.response?.output && "text" in c.response.output ? c.response.output.text : "";
    for (const [where, text] of [["system prompt", sys], ["messages", msgs], ["output", out]] as const) { const sn = snippet(text); if (sn) hits.push(`call ${c.callId} (${c.model ?? "model"}, ${shortClock(c.startedAt)}) · ${where}: ${sn}`); }
  }
  if (!hits.length) return `Nothing in the trace mentions ${q(query, 80)}.`;
  return `${hits.length} hit${hits.length === 1 ? "" : "s"} for ${q(query, 80)}${hits.length > limit ? `, the first ${limit}` : ""}:\n` + hits.slice(0, limit).map((h) => `- ${h}`).join("\n");
}

// ---- helpers the situation block needs
export function stageOfCall(m: TraceModel, callId: string): Stage | null { return callStageOf(m, callId); }
export function interactionOf(m: TraceModel, stage: Stage): InteractionRow | null {
  const r = stage.rows.find((row): row is InteractionRow => row.kind === "interaction");
  return r ?? null;
}
export { netText };
