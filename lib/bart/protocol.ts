// What the browser and the Bart route say to each other, and how an
// answer points at its evidence. A reference names a thing by the
// identity the trace already has (a stage id, a call id and pane, a file
// path and lines, the README), never by copied text, so the workspace can
// open it. Pure: no DOM, no React, no network.
import type { Pane } from "@/lib/trace/selection";
import type { Attachment, BartOptions } from "@/lib/bart/options";

export type Ref =
  | { kind: "moment"; stageId: string }
  | { kind: "call"; callId: string; pane: Pane | null }
  | { kind: "file"; path: string; from: number | null; to: number | null }
  | { kind: "annotation"; id: string }
  | { kind: "readme" };

// Where a claim comes from. Kept on tool results and references; the
// answer's wording carries it where it matters, not a label on every line.
export type Provenance = "trace" | "model_request" | "source_code" | "inferred";

// `episodeId` names which reading of that moment was chosen, because one
// submit stage is the writing of a message and then the sending of it,
// and those are two different things to be asked about. It is an
// identity like the others: the route looks the episode up in its own
// reading of the run's events, so no wording travels with the question.
export type SelectionRef = { stageId: string | null; callId: string | null; episodeId?: string | null };
// What a question is about: identities only, never prose. `annotationId`
// is a note the person opened and asked about; it is a referent like the
// selected moment, not a constraint on what may be answered.
export type MessageContext = { runId: string | null; repoId: string | null; selection: SelectionRef | null; recordingId?: string | null; annotationId?: string | null };

export type BartMessage = { id: string; role: "user" | "assistant"; content: string; refs: Ref[]; context: MessageContext | null; model: string | null; createdAt: string };

export type BartRequest = {
  threadId: string | null;     // null starts a thread in the project
  projectId: string;
  repoId: string | null;
  runId: string | null;
  recordingId: string | null;  // the recording open in the Visualizer: trace tools read inside it
  annotationId: string | null; // a note the person asked about, if the question came from one
  selection: SelectionRef | null;
  model: string;
  message: string;
  // How the question is to be answered, and the files it carries. Both
  // are clamped on the route (lib/bart/options.ts) rather than trusted.
  options?: BartOptions | null;
  attachments?: Attachment[] | null;
};

export type ToolState = "running" | "done" | "failed";
export type BartEvent =
  | { type: "thread"; threadId: string; userMessageId: string }
  | { type: "text"; delta: string }
  | { type: "tool"; id: string; name: string; label: string; state: ToolState }
  | { type: "done"; messageId: string; refs: Ref[]; model: string }
  | { type: "error"; message: string };

export const MAX_MESSAGE_CHARS = 4000;
export const PANES: Pane[] = ["overview", "context", "messages", "tools", "output", "raw"];
// The parts a tool names, when an answer cites one instead of a pane.
const PANE_ALIAS: Record<string, Pane> = { system: "context", summary: "overview", settings: "overview", raw_request: "raw", raw_response: "raw" };

// ---- reference tokens in an answer
// [[moment:<stageId>]]  [[call:<callId>]]  [[call:<callId>:<pane>]]
// [[file:<path>]]  [[file:<path>#L12-L40]]  [[readme]]
// [[annotation:<id>]]
const TOKEN = /\[\[(moment|call|file|annotation|readme)(?::([^\[\]\n]+))?\]\]/g;
const FILE = /^(.*?)(?:#L(\d+)(?:-L?(\d+))?)?$/;

export function parseRef(kind: string, rest: string | undefined): Ref | null {
  switch (kind) {
    case "readme": return { kind: "readme" };
    case "moment": return rest ? { kind: "moment", stageId: rest.trim() } : null;
    case "annotation": return rest ? { kind: "annotation", id: rest.trim() } : null;
    case "call": {
      if (!rest) return null;
      const parts = rest.trim().split(":");
      const last = parts[parts.length - 1];
      const pane = PANES.includes(last as Pane) ? (last as Pane) : PANE_ALIAS[last];
      if (parts.length > 1 && pane) return { kind: "call", callId: parts.slice(0, -1).join(":"), pane };
      return { kind: "call", callId: rest.trim(), pane: null };
    }
    case "file": {
      if (!rest) return null;
      const m = FILE.exec(rest.trim());
      if (!m || !m[1]) return null;
      return { kind: "file", path: m[1], from: m[2] ? Number(m[2]) : null, to: m[3] ? Number(m[3]) : null };
    }
    default: return null;
  }
}

export function refToken(ref: Ref): string {
  switch (ref.kind) {
    case "readme": return "[[readme]]";
    case "moment": return `[[moment:${ref.stageId}]]`;
    case "annotation": return `[[annotation:${ref.id}]]`;
    case "call": return `[[call:${ref.callId}${ref.pane ? `:${ref.pane}` : ""}]]`;
    case "file": return `[[file:${ref.path}${ref.from ? `#L${ref.from}${ref.to ? `-L${ref.to}` : ""}` : ""}]]`;
  }
}

export const sameRef = (a: Ref, b: Ref) => refToken(a) === refToken(b);

// Every reference an answer makes, in order of first appearance.
export function refsIn(text: string): Ref[] {
  const out: Ref[] = [];
  for (const m of text.matchAll(TOKEN)) {
    const ref = parseRef(m[1], m[2]);
    if (ref && !out.some((r) => sameRef(r, ref))) out.push(ref);
  }
  return out;
}

// The answer with each token turned into a markdown link the renderer
// dispatches, so references sit inline where the claim is.
export function linkRefs(text: string, label: (ref: Ref) => string): string {
  return text.replace(TOKEN, (token, kind: string, rest: string | undefined) => {
    const ref = parseRef(kind, rest);
    return ref ? `[${label(ref).replace(/[[\]]/g, "")}](ref:${encodeURIComponent(token)})` : token;
  });
}

export const isRefHref = (href: string | undefined): href is string => !!href && href.startsWith("ref:");
export function refFromHref(href: string): Ref | null {
  const token = decodeURIComponent(href.slice(4));
  const m = /^\[\[(moment|call|file|annotation|readme)(?::([^\[\]\n]+))?\]\]$/.exec(token);
  return m ? parseRef(m[1], m[2]) : null;
}

// A reference in a few words when nothing more is known about it.
export function plainRefLabel(ref: Ref): string {
  switch (ref.kind) {
    case "readme": return "README";
    case "moment": return "moment";
    case "annotation": return "annotation";
    case "call": return ref.pane ? `model call · ${ref.pane}` : "model call";
    case "file": return ref.from ? `${ref.path}:${ref.from}${ref.to ? `–${ref.to}` : ""}` : ref.path;
  }
}
