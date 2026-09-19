// What Bart can look up: the run's moments and model calls through the
// same derivations the Trace tab shows, and the repository through
// lib/bart/repo. Each tool answers with bounded text that names things
// by id, so an answer can cite them. Server only.
import type Anthropic from "@anthropic-ai/sdk";
import type { ModelCall } from "@/lib/trace/types";
import type { Repo } from "@/lib/repos";
import type { SandboxRun } from "@/lib/sandbox";
import { CALL_PARTS, SLICE, callReport, compareCalls, momentReport, searchTrace, slice, tableOfContents, type CallPart, type TraceModel } from "@/lib/bart/grounding";
import { listFiles, readFile, readReadme, searchFiles, type RepoAccess } from "@/lib/bart/repo";
import { annotationReport } from "@/lib/bart/annotations";
import type { Annotation } from "@/lib/annotations/model";

export type ToolContext = {
  repo: Repo | null;
  run: SandboxRun | null;
  access: RepoAccess | null;
  annotation: (id: string) => Promise<Annotation | null>;   // a note of this repository, or nothing
  trace: () => Promise<TraceModel | null>;          // loaded once, when first asked; cut to the open recording
  fullTrace: () => Promise<TraceModel | null>;      // the whole run, when a tool is asked for it
  rawCall: (call: ModelCall) => Promise<ModelCall>; // the same call with its raw bodies
};

type Schema = Anthropic.Messages.Tool["input_schema"];
const obj = (properties: Record<string, unknown>, required: string[] = []): Schema => ({ type: "object", properties, required });
const SCOPE = { scope: { type: "string", enum: ["recording", "run"], description: "recording (the default while one is open) or run for the whole run." } };

export const TOOLS: Anthropic.Messages.Tool[] = [
  { name: "run_overview", description: "Every moment of the run in order, one line each with its id, and what the trace tied it to. Start here for questions about what happened in the session.", input_schema: obj({ ...SCOPE }) },
  { name: "inspect_moment", description: "One moment of the trace in full: its acts in order, text that appeared, requests the application made, and the model call it is tied to and how. Pass evidence=true for the underlying rows and raw event kinds.", input_schema: obj({ stage_id: { type: "string", description: "A moment id from run_overview, like stage:i_page000001_8 or stage:call:mc_1; a bare call id like mc_1 also works." }, evidence: { type: "boolean" }, ...SCOPE }, ["stage_id"]) },
  { name: "inspect_model_call", description: "A captured model call, one part at a time: summary (model, timing, counts, settings, what it is tied to), system (the system prompt, in the sections it marks), messages (every message as sent), tools, output (the response, pretty-printed when JSON), settings, raw_request, raw_response. Long parts are cut; pass offset to continue.", input_schema: obj({ call_id: { type: "string" }, part: { type: "string", enum: CALL_PARTS }, offset: { type: "integer", minimum: 0 }, ...SCOPE }, ["call_id", "part"]) },
  { name: "compare_model_calls", description: "Two captured calls side by side: model, settings, response format, tools, system prompt, messages added or removed, outputs, latency, and what each is tied to.", input_schema: obj({ call_id_a: { type: "string" }, call_id_b: { type: "string" }, ...SCOPE }, ["call_id_a", "call_id_b"]) },
  { name: "search_trace", description: "Find moments and calls whose labels, acts, echoed text, system prompts, messages or outputs contain a phrase.", input_schema: obj({ query: { type: "string" }, ...SCOPE }, ["query"]) },
  { name: "read_readme", description: "The repository's README. Long ones are cut; pass offset to continue.", input_schema: obj({ offset: { type: "integer", minimum: 0 } }) },
  { name: "repo_tree", description: "The repository's file paths, from the live sandbox when the run is up (so generated and edited files are included), otherwise from GitHub. Pass prefix to narrow to a directory.", input_schema: obj({ prefix: { type: "string" } }) },
  { name: "read_repo_file", description: "A file's lines, numbered. Defaults to the first 200 lines; pass from and to for a window. Secrets and environment files are not readable, and saved environment values are struck out.", input_schema: obj({ path: { type: "string" }, from: { type: "integer", minimum: 1 }, to: { type: "integer", minimum: 1 } }, ["path"]) },
  { name: "search_repo", description: "Lines in the repository containing a literal phrase, case-insensitive, as path:line. Pass glob (like '*.ts' or 'src/**') to narrow. Use this to find where something is implemented before describing it.", input_schema: obj({ query: { type: "string" }, glob: { type: "string" } }, ["query"]) },
  { name: "inspect_annotation", description: "A note a researcher wrote about one element of the running interface: what they wrote, which element it is on and inside which frame, and the run, recording and commit it was written in. The note is a person's own observation or question, not a recording of the system.", input_schema: obj({ annotation_id: { type: "string", description: "An annotation id, as the situation gives it." }, offset: { type: "integer", minimum: 0 } }, ["annotation_id"]) },
];

// What the panel shows while a tool runs.
export function toolLabel(name: string, input: Record<string, unknown>): string {
  const s = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : "");
  switch (name) {
    case "run_overview": return "Reading the run's moments";
    case "inspect_moment": return `Reading moment ${s("stage_id")}`;
    case "inspect_model_call": return `Reading call ${s("call_id")} · ${s("part") || "summary"}`;
    case "compare_model_calls": return `Comparing calls ${s("call_id_a")} and ${s("call_id_b")}`;
    case "search_trace": return `Searching the trace for “${s("query")}”`;
    case "read_readme": return "Reading the README";
    case "repo_tree": return s("prefix") ? `Listing files under ${s("prefix")}` : "Listing the repository's files";
    case "read_repo_file": return `Reading ${s("path")}`;
    case "search_repo": return `Searching the repository for “${s("query")}”`;
    case "inspect_annotation": return "Reading the annotation";
    default: return name;
  }
}

export type ToolResult = { text: string; error: boolean };
const fail = (text: string): ToolResult => ({ text, error: true });
const ok = (text: string): ToolResult => ({ text, error: false });

export async function runTool(name: string, input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const str = (k: string) => (typeof input[k] === "string" ? (input[k] as string).trim() : "");
  const int = (k: string) => (Number.isInteger(input[k]) ? (input[k] as number) : null);
  const model = () => (str("scope") === "run" ? ctx.fullTrace() : ctx.trace());
  try {
    switch (name) {
      case "run_overview": {
        const m = await model();
        if (!m) return fail(noTrace(ctx));
        const diag = m.diagnostics.length ? `\n${m.diagnostics.length} diagnostic row${m.diagnostics.length === 1 ? "" : "s"} (requests and calls the collector could not tie to an act) are kept apart; search_trace finds calls among them by id.` : "";
        return ok(`Run ${ctx.run?.id ?? "?"}, ${m.events.length} raw events, ${Object.keys(m.calls).length} model call${Object.keys(m.calls).length === 1 ? "" : "s"}.\n${tableOfContents(m, 200)}${diag}`);
      }
      case "inspect_moment": {
        const m = await model();
        if (!m) return fail(noTrace(ctx));
        const report = momentReport(m, str("stage_id"), input.evidence === true);
        return report ? ok(report) : fail(`No moment has the id ${str("stage_id")}; ids come from run_overview.`);
      }
      case "inspect_model_call": {
        const m = await model();
        if (!m) return fail(noTrace(ctx));
        const found = m.calls[str("call_id")];
        if (!found) return fail(`No captured call has the id ${str("call_id")}; ids come from run_overview.`);
        const part = (CALL_PARTS as string[]).includes(str("part")) ? (str("part") as CallPart) : "summary";
        const call = part === "raw_request" || part === "raw_response" ? await ctx.rawCall(found) : found;
        return ok(callReport(m, call, part, int("offset") ?? 0).text);
      }
      case "compare_model_calls": {
        const m = await model();
        if (!m) return fail(noTrace(ctx));
        const a = m.calls[str("call_id_a")], b = m.calls[str("call_id_b")];
        if (!a || !b) return fail(`No captured call has the id ${!a ? str("call_id_a") : str("call_id_b")}.`);
        return ok(compareCalls(m, a, b));
      }
      case "search_trace": {
        const m = await model();
        if (!m) return fail(noTrace(ctx));
        return ok(searchTrace(m, str("query")));
      }
      case "read_readme": {
        if (!ctx.access) return fail(noRepo());
        const got = await readReadme(ctx.access);
        if ("error" in got) return fail(got.error);
        return ok(`README at ${got.path} (from ${got.from}); cite it as [[readme]].\n\n${slice(got.text, int("offset") ?? 0).text}`);
      }
      case "repo_tree": {
        if (!ctx.access) return fail(noRepo());
        const listed = await listFiles(ctx.access);
        if ("error" in listed) return fail(listed.error);
        const prefix = str("prefix").replace(/^\/+|\/+$/g, "");
        const paths = prefix ? listed.paths.filter((p) => p === prefix || p.startsWith(prefix + "/")) : listed.paths;
        const shown = paths.slice(0, 400);
        return ok(`${paths.length} file${paths.length === 1 ? "" : "s"}${prefix ? ` under ${prefix}` : ""} (from ${listed.from === "sandbox" ? "the live sandbox" : "GitHub"})${paths.length > shown.length ? `, the first ${shown.length}; pass a prefix to see the rest` : ""}:\n${shown.join("\n")}`);
      }
      case "read_repo_file": {
        if (!ctx.access) return fail(noRepo());
        const path = str("path").replace(/^\.?\//, "");
        const got = await readFile(ctx.access, path);
        if ("error" in got) return fail(got.error);
        const lines = got.text.split("\n");
        const from = Math.max(1, int("from") ?? 1);
        const to = Math.min(lines.length, int("to") ?? from + 199);
        const body = lines.slice(from - 1, to).map((l, i) => `${String(from + i).padStart(4)}  ${l}`).join("\n");
        const cut = slice(body, 0, SLICE);
        const head = `${path} (from ${got.from === "sandbox" ? "the live sandbox" : "GitHub"}), ${lines.length} lines; showing ${from}–${to}. Cite as [[file:${path}#L${from}-L${to}]] or a narrower range.${to < lines.length ? ` Continue with from=${to + 1}.` : ""}`;
        return ok(`${head}\n\n${cut.text}`);
      }
      case "search_repo": {
        if (!ctx.access) return fail(noRepo());
        const result = await searchFiles(ctx.access, str("query"), str("glob") || null);
        if ("error" in result) return fail(result.error);
        const where = result.from === "sandbox" ? "the live sandbox" : "GitHub";
        if (!result.hits.length) return ok(`Nothing in the repository (searched ${where}) contains “${str("query")}”${result.partial ? ` — ${result.partial}` : ""}.`);
        return ok(`${result.hits.length} line${result.hits.length === 1 ? "" : "s"} containing “${str("query")}” (from ${where})${result.partial ? `; ${result.partial}` : ""}. Cite as [[file:<path>#L<line>]].\n${result.hits.map((h) => `${h.path}:${h.line}: ${h.text.trim()}`).join("\n")}`);
      }
      case "inspect_annotation": {
        const note = await ctx.annotation(str("annotation_id"));
        if (!note) return fail(`No annotation of this repository has the id ${str("annotation_id")}.`);
        return ok(annotationReport(note, await model(), int("offset") ?? 0));
      }
      default: return fail(`There is no tool named ${name}.`);
    }
  } catch (err) {
    return fail(`The tool failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

const noRepo = () => "No repository is open in the workspace, so there is nothing to read.";
const noTrace = (ctx: ToolContext) =>
  !ctx.run ? "There is no run of this repository yet, so there is no trace."
  : ctx.run.trace === "off" ? "This run was started without tracing, so there is no trace of it."
  : "The trace could not be read.";
