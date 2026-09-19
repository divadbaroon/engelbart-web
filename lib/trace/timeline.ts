// The trace as the page shows it. Two layers, both free of React:
//
// Rows (`traceRows`): one per interaction, with the application requests
// tied to it (by the id the page put on them, or by timing), the model
// calls joined through those requests, and the visible changes attributed
// to it; runs of keys in one frame folded into a group; one row per model
// call; one per application request nothing claimed; one per note the
// gateways, the bridge or the wrapper left. In the order the sandbox saw
// them.
//
// Stages (`traceStages`): the rows grouped the way a researcher reads a
// session. A stretch of clicks and keys in one document is "Explored …";
// an act that sent something to the server is "Submitted …"; a model call
// is its own stage; what appeared on screen after the call is "Response
// appeared". Everything else (gateway startup, frames coming and going,
// ordinary requests) is diagnostics. Every stage opens to the rows and the
// raw events behind it, and each stage says how it was tied to the one
// before: an id carried on purpose, or timing.
//
// Labels are built from what the events carry (tag, visible text, frame,
// key name), never from knowledge of a particular application. A link by
// timing is called that; nothing here claims a cause.
import type { Correlation, ModelCall, TraceEvent } from "@/lib/trace/types";

export type RequestLink = { request: TraceEvent; result: TraceEvent | null; correlation: Correlation; sinceMs: number | null };

export type CallRow = {
  kind: "call";
  id: string;              // the call id
  at: string;
  call: ModelCall | null;  // null until the call's row has been fetched
  request: TraceEvent;
  result: TraceEvent | null;
  interactionId: string | null;
  requestId: string | null;
  correlation: Correlation | null;
  via: string | null;      // the label of the interaction it was joined to
  during: string | null;   // the application request it was joined to
};
export type NoteRow = { kind: "note"; id: string; at: string; event: TraceEvent; label: string; detail: string | null };
export type InteractionRow = {
  kind: "interaction";
  id: string;              // the interaction id
  at: string;
  event: TraceEvent;
  frameId: string | null;
  frameLabel: string;      // "the page", "embedded frame “solution”"
  frameName: string;       // "the page", "solution": the bare identity, for a chip
  label: string;
  detail: string | null;
  links: RequestLink[];    // application requests tied to it
  changes: TraceEvent[];   // ui.change events attributed to it (by time)
  callIds: string[];       // model calls joined to it through a request
  key: { name: string; count: number; editable: boolean } | null;
  submit: boolean;         // a submit-like act: a form submit, Enter on a text field, a submit button
};
export type KeyGroupRow = {
  kind: "keys";
  id: string;
  at: string;
  endAt: string;
  frameId: string | null;
  frameLabel: string;
  frameName: string;
  label: string;
  detail: string;
  counts: { key: string; count: number }[];
  presses: number;         // every press, counting folded repeats
  rows: InteractionRow[];
};
export type NetworkRow = { kind: "network"; id: string; at: string; request: TraceEvent; result: TraceEvent | null; label: string; detail: string | null };
export type TraceRow = CallRow | NoteRow | InteractionRow | KeyGroupRow | NetworkRow;

export type StageKind = "explore" | "submit" | "call" | "response" | "navigate";
export type Stage = {
  kind: "stage";
  id: string;
  stage: StageKind;
  at: string;
  endAt: string;
  label: string;
  detail: string | null;
  link: { correlation: Correlation; text: string } | null;  // how it is tied to what came before
  callId: string | null;   // the model call the stage is about: its own, the first tied to the submit, the last before the response
  title: string;           // the short form, for a chip: "Explored solution", "Submitted text", "gpt-4o call", "Response appeared"
  rows: TraceRow[];        // the rows folded into it, in order
  events: TraceEvent[];    // every raw event behind it
};
export type GroupedTrace = { primary: Stage[]; diagnostics: TraceRow[] };

const KEY_GROUP_GAP_MS = 5000;
const TEMPORAL_REQUEST_MS = 3000;   // an untagged request this soon after an interaction is tied to it, by timing
const EXPLORE_GAP_MS = 30_000;      // a pause this long ends a stretch of exploring

const str = (v: unknown) => (typeof v === "string" ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const quote = (s: string, max = 40) => `“${s.length > max ? s.slice(0, max - 1) + "…" : s}”`;
const ms = (iso: string) => Date.parse(iso);
const plural = (n: number, word: string, words = `${word}s`) => `${n} ${n === 1 ? word : words}`;

// ---- frames: what to call each document, from the evidence the bridge
// and the gateway left (its place in the parent, its name, its url).
export type FrameInfo = { frameId: string; parentFrameId: string | null; embedded: boolean; path: string | null; url: string | null; query: Record<string, string> | null; title: string | null; name: string | null; selectorInParent: string | null; instrumented: string | null; depth: number | null };

export function frameIndex(events: TraceEvent[]): Map<string, FrameInfo> {
  const frames = new Map<string, FrameInfo>();
  const get = (id: string) => {
    let f = frames.get(id);
    if (!f) { f = { frameId: id, parentFrameId: null, embedded: false, path: null, url: null, query: null, title: null, name: null, selectorInParent: null, instrumented: null, depth: null }; frames.set(id, f); }
    return f;
  };
  for (const e of events) {
    const d = e.data ?? {};
    const id = str(d.frameId);
    if (!id) continue;
    if (e.kind === "frame.served") {
      const f = get(id);
      f.path ??= str(d.path); f.query ??= obj(d.query) as Record<string, string> | null;
      if (d.dest === "iframe" || d.dest === "frame") f.embedded = true;
    } else if (e.kind === "frame.loaded") {
      const f = get(id);
      f.url = str(d.url) ?? f.url; f.query = (obj(d.query) as Record<string, string> | null) ?? f.query; f.title = str(d.title) || f.title;
      f.embedded = d.embedded === true || f.embedded; f.instrumented = str(d.instrumented) ?? f.instrumented; f.depth = num(d.depth) ?? f.depth;
      f.parentFrameId = str(d.parentFrameId) ?? f.parentFrameId;
    } else if (e.kind === "frame.attached") {
      const f = get(id);
      f.parentFrameId = str(d.parentFrameId) ?? f.parentFrameId; f.selectorInParent = str(d.selectorInParent) ?? f.selectorInParent; f.name = str(d.name) ?? f.name;
      f.embedded = true; f.instrumented = str(d.instrumented) ?? f.instrumented; f.depth = num(d.depth) ?? f.depth; f.url = str(d.url) ?? f.url; f.title = str(d.title) || f.title;
    }
  }
  return frames;
}

// The outermost document the bridge observes is "the page", even when the
// preview itself sits inside another window (the workspace embeds it). A
// document with a bridged parent is an embedded frame, named by the best
// generic identity the DOM gave it, in this order: what its parent called
// it (the iframe's name, id or title attribute, as the bridge reports
// them), a single identifier-like query value in its own url
// ("?id=solution"), its document title when no other frame shares it, its
// path, and last its place in the parent. The full url and selector stay
// in the details.
export const isRootFrame = (f: FrameInfo | undefined) => !!f && !f.parentFrameId;

export function frameLabel(frames: Map<string, FrameInfo>, frameId: string | null): string {
  if (!frameId) return "the page";
  const f = frames.get(frameId);
  if (!f) return `frame ${frameId}`;
  if (isRootFrame(f)) return "the page";
  return `embedded frame ${frameHandle(f, frames)}`;
}

const IDENTIFIER = /^[A-Za-z][\w-]{0,31}$/;

export function frameIdentity(f: FrameInfo, frames: Map<string, FrameInfo>): { text: string; named: boolean } {
  if (f.name) return { text: f.name, named: true };
  const params = f.query ? Object.entries(f.query).filter(([, v]) => v !== "[omitted]") : [];
  if (params.length === 1 && IDENTIFIER.test(params[0][1])) return { text: params[0][1], named: true };
  if (f.title && ![...frames.values()].some((o) => o !== f && o.title === f.title)) return { text: f.title, named: true };
  const query = params.map(([k, v]) => `${k}=${v}`).join("&");
  const path = f.path ?? f.url?.replace(/\?…$/, "") ?? null;
  if (path) return { text: `${path}${query ? `?${query}` : ""}`, named: false };
  return { text: f.selectorInParent ?? f.frameId, named: false };
}

// In prose, a name the DOM gave the frame is quoted; a path or selector is not.
export function frameHandle(f: FrameInfo, frames: Map<string, FrameInfo>): string {
  const id = frameIdentity(f, frames);
  return id.named ? quote(id.text, 64) : id.text;
}

// On a chip: "the page", or the bare identity, clipped.
export function frameName(frames: Map<string, FrameInfo>, frameId: string | null): string {
  if (!frameId) return "the page";
  const f = frames.get(frameId);
  if (!f) return `frame ${frameId}`;
  if (isRootFrame(f)) return "the page";
  const { text } = frameIdentity(f, frames);
  return text.length > 32 ? text.slice(0, 31) + "…" : text;
}

// Where an embedded frame sits and what it loaded, for the details.
export function frameDetail(f: FrameInfo): string {
  const params = f.query ? Object.entries(f.query).map(([k, v]) => `${k}=${v}`).join("&") : "";
  const path = f.path ?? f.url?.replace(/\?…$/, "") ?? null;
  return [path ? `${path}${params ? `?${params}` : ""}` : null, f.title ? `title “${f.title}”` : null, f.selectorInParent ? `at ${f.selectorInParent}` : null, f.parentFrameId ? `inside ${f.parentFrameId}` : null].filter(Boolean).join(" · ");
}

// ---- describing an element from the bridge's descriptor
type Descriptor = { tag?: string; id?: string; text?: string; label?: string; title?: string; placeholder?: string; role?: string; type?: string; name?: string; testid?: string; selector?: string; href?: string; action?: string; method?: string; size?: string; editable?: string };
const descriptor = (v: unknown): Descriptor | null => obj(v) as Descriptor | null;

export function describeTarget(d: Descriptor | null): string {
  if (!d) return "something";
  const tag = d.tag ?? "element";
  const what = d.role ?? (tag === "a" ? "link" : tag === "input" && d.type ? `${d.type} input` : tag);
  const text = d.text || d.label || d.title || d.placeholder;
  if (text) return `${quote(text)} (${what})`;
  if (d.id) return `${what}#${d.id}`;
  if (d.name) return `${what} “${d.name}”`;
  if (d.testid) return `${what} [${d.testid}]`;
  if (d.selector && d.selector !== tag) return `${what} ${d.selector}`;
  return what === "body" ? "the page body" : what;
}

// ---- notes: the word on an event that is not an interaction
export function describeNote(e: TraceEvent, frames: Map<string, FrameInfo> = new Map()): { label: string; detail: string | null } {
  const d = e.data ?? {};
  const frame = (id: unknown) => frameLabel(frames, str(id));
  switch (e.kind) {
    case "gateway.listening":
      return { label: `${d.gateway === "model" ? "Model gateway" : d.gateway === "preview" ? "Preview gateway" : `${e.source} gateway`} up`, detail: `port ${d.port ?? "?"}${d.capture ? ` · capture ${d.capture}` : ""}${list(d.upstreams).length ? ` · allowed upstreams ${list(d.upstreams).join(", ")}` : ""}` };
    case "instrument.applied":
      return { label: "Sandbox-only instrumentation applied", detail: `${list(d.files).join(", ")} · committed in the sandbox copy only, never upstream` };
    case "instrument.present":
      return { label: "Sandbox-only instrumentation already in place", detail: list(d.files).join(", ") || null };
    case "instrument.none":
      return { label: "No instrumentation registered", detail: `model calls are traced only if ${str(d.repo) ?? "the application"} reads its provider's base URL from the environment` };
    case "instrument.failed":
    case "instrument.skipped":
      return { label: `Instrumentation ${e.kind.slice("instrument.".length)}`, detail: str(d.reason) };
    case "frame.served":
      return { label: `Served ${d.dest === "iframe" || d.dest === "frame" ? "an embedded document" : "a page"}: ${str(d.path) ?? "?"}`, detail: `bridge injected · frame ${str(d.frameId) ?? "?"}` };
    case "frame.loaded": {
      const counts = obj(obj(d.surfaces)?.counts) ?? {};
      const surfaces = Object.entries(counts).filter(([, n]) => typeof n === "number").map(([k, n]) => `${k} ×${n}`).join(", ");
      const root = !frames.has(str(d.frameId) ?? "") ? d.embedded !== true : isRootFrame(frames.get(str(d.frameId) ?? ""));
      return { label: `${root ? "Page" : "Embedded document"} loaded: ${str(d.url) ?? "?"}${str(d.title) ? ` — ${str(d.title)}` : ""}`, detail: `${root ? "the page" : frame(d.frameId)}${surfaces ? ` · contains ${surfaces}` : ""}` };
    }
    case "frame.attached":
      return { label: `Embedded frame attached: ${str(d.selectorInParent) ?? str(d.name) ?? "?"}`, detail: `inside ${frame(d.parentFrameId)} · ${d.instrumented === "parent-attached" ? "observed from its parent" : "observing itself"}${str(d.url) ? ` · ${str(d.url)}` : ""}` };
    case "frame.discovered":
      return { label: `Embedded frame not instrumented: ${str(d.selectorInParent) ?? str(d.name) ?? "?"}`, detail: `${str(d.reason) ?? "unavailable"}${str(d.src) ? ` · ${str(d.src)}` : ""} · what happens inside it is not recorded` };
    case "frame.removed":
      return { label: `Embedded frame removed: ${str(d.selectorInParent) ?? "?"}`, detail: null };
    case "bridge.blocked":
      return { label: `Bridge not injected into ${str(d.path) ?? "a document"}`, detail: d.reason === "csp" ? `its Content-Security-Policy allows scripts only from ${str(d.directive) ?? "elsewhere"}; the policy was left as it is` : `its content-encoding (${str(d.encoding) ?? "?"}) could not be undone` };
    case "bridge.dropped":
      return { label: `${num(d.count) ?? "Some"} browser events dropped`, detail: "more than the gateway accepts per second" };
    case "ui.change":
      return { label: changeLabel(d), detail: changeDetail(d) };
    default:
      return { label: e.kind, detail: null };
  }
}

// The text a change added and removed, net: the same text taken out and
// put back is a rerender, whichever bridge recorded it. A change with net
// text is something a person could have seen; one without is kept as
// evidence, not shown as a step.
export function netText(d: Record<string, unknown> | null | undefined): { added: string[]; removed: string[]; rerendered: number } {
  const added = list(d?.added); const removed = list(d?.removed);
  const same = added.filter((t) => removed.includes(t));
  return { added: added.filter((t) => !same.includes(t)), removed: removed.filter((t) => !same.includes(t)), rerendered: (num(d?.rerendered) ?? 0) + same.length };
}
export const changeHasText = (e: TraceEvent) => { const t = netText(e.data); return t.added.length > 0 || t.removed.length > 0; };

function changeLabel(d: Record<string, unknown>): string {
  const { added, removed, rerendered } = netText(d);
  const parts: string[] = [];
  if (added.length) parts.push(`+${quote(added[0], 60)}${added.length > 1 ? ` and ${added.length - 1} more` : ""}`);
  if (removed.length) parts.push(`−${quote(removed[0], 40)}${removed.length > 1 ? ` and ${removed.length - 1} more` : ""}`);
  if (parts.length) return `Visible change: ${parts.join(" ")}`;
  return `Rerender: ${num(d.mutations) ?? "some"} mutations, no text changed${rerendered ? ` (${plural(rerendered, "text")} put back as it was)` : ""}`;
}
// A container is named by its handle, not by the text inside it: the
// text is what changed, and it is quoted separately.
const describeContainer = (d: Descriptor | null) => describeTarget(d ? { ...d, text: undefined } : null);

function changeDetail(d: Record<string, unknown>): string {
  const container = descriptor(d.container);
  const bits = [`${num(d.mutations) ?? 0} mutations over ${formatMs(num(d.durationMs) ?? 0)}`];
  if (num(d.sinceInteractionMs) !== null) bits.push(`${formatMs(num(d.sinceInteractionMs))} after the interaction`);
  if (container) bits.push(`in ${describeContainer(container)}`);
  if (num(d.part) && (num(d.part) as number) > 1) bits.push(`part ${d.part}`);
  return bits.join(" · ");
}

// ---- interactions
function interactionLabel(e: TraceEvent, frames: Map<string, FrameInfo>): { label: string; detail: string | null; key: InteractionRow["key"] } {
  const d = e.data ?? {};
  const target = descriptor(d.target);
  const control = descriptor(d.control);
  const where = frameLabel(frames, str(d.frameId));
  const inFrame = where === "the page" ? "" : ` in ${where}`;
  switch (e.kind) {
    case "ui.click":
      return { label: `Clicked ${describeTarget(control ?? target)}${inFrame}`, detail: [control && target ? `on ${describeTarget(target)}` : null, target?.selector ? target.selector : null, d.trusted === false ? "synthetic" : null].filter(Boolean).join(" · ") || null, key: null };
    case "ui.submit": {
      const form = descriptor(d.form); const submitter = descriptor(d.submitter);
      const fields = Array.isArray(d.fields) ? d.fields.length : 0;
      return { label: `Submitted ${submitter ? `${describeTarget(submitter)} → ` : ""}${(form?.method ?? "get").toUpperCase()} ${form?.action ?? "form"}${inFrame}`, detail: `${fields} field${fields === 1 ? "" : "s"}${form?.selector ? ` · ${form.selector}` : ""} · values not recorded`, key: null };
    }
    case "ui.key": {
      const name = str(d.key) ?? "?"; const count = num(d.count) ?? 1; const cls = str(d.class);
      const editable = !!d.editable;
      const label = name === "[printable]" ? `Typed ${count} ${cls ?? "printable"} key${count === 1 ? "" : "s"}${inFrame}` : `Pressed ${name}${count > 1 ? ` ×${count}` : ""}${inFrame}`;
      return { label, detail: `on ${describeTarget(target)}${name === "[printable]" ? " · characters not recorded" : ""}${d.repeat === true ? " · held" : ""}`, key: { name, count, editable } };
    }
    case "ui.input": {
      const kind = str(d.kind);
      const value = list(d.selected).length ? list(d.selected).map((s) => quote(s)).join(", ") : typeof d.checked === "boolean" ? (d.checked ? "on" : "off") : str(d.value) ?? (kind === "text" || kind === "password" ? `${num(d.valueLength) ?? "?"} characters (not recorded)` : kind === "file" ? `${num(d.files) ?? 0} file(s)` : "changed");
      return { label: `Changed ${describeTarget(target)} → ${value}${inFrame}`, detail: target?.selector ?? null, key: null };
    }
    case "ui.focus":
      return { label: `Moved into ${where}`, detail: target ? `focus on ${describeTarget(target)}` : null, key: null };
    case "ui.route":
      return { label: `Navigated ${str(d.from) ?? "?"} → ${str(d.to) ?? "?"}${inFrame}`, detail: str(d.how) ? `${d.how}${str(d.title) ? ` · ${d.title}` : ""}` : null, key: null };
    default:
      return { label: e.kind, detail: null, key: null };
  }
}

// A submit-like act, from DOM facts alone: a form submit, Enter (without
// modifiers) on a text-entry surface, a click on a submit control.
function isSubmitLike(e: TraceEvent): boolean {
  const d = e.data ?? {};
  if (e.kind === "ui.submit") return true;
  if (e.kind === "ui.key") return str(d.key) === "Enter" && !!d.editable;
  if (e.kind === "ui.click") return (descriptor(d.control) ?? descriptor(d.target))?.type === "submit";
  return false;
}

const isInteraction = (e: TraceEvent) => e.source === "browser" && e.kind.startsWith("ui.") && e.kind !== "ui.change" && !!e.interactionId;
const targetSelector = (e: TraceEvent) => descriptor(e.data?.target)?.selector ?? null;

export const requestLabel = (e: TraceEvent) => {
  const d = e.data ?? {};
  return `${str(d.method) ?? "?"} ${str(d.path) ?? "?"}${d.next_action === true ? " (server action)" : ""}`;
};

// The frame index defaults to the events given; a slice of a run passes the
// whole run's, so frames named before the slice keep their names.
export function traceRows(events: TraceEvent[], calls: ModelCall[], frames: Map<string, FrameInfo> = frameIndex(events)): TraceRow[] {
  const byCall = new Map(calls.map((c) => [c.callId, c]));
  const interactions = new Map<string, InteractionRow>();
  const requests: TraceEvent[] = [];
  const resultsByRequest = new Map<string, TraceEvent>();
  const changes: TraceEvent[] = [];
  const callRequests: TraceEvent[] = [];
  const callResults: TraceEvent[] = [];
  const notes: NoteRow[] = [];

  // 1. Sort the events into what they are.
  for (const e of events) {
    const d = e.data ?? {};
    if (isInteraction(e)) {
      const { label, detail, key } = interactionLabel(e, frames);
      const row: InteractionRow = { kind: "interaction", id: e.interactionId as string, at: e.at, event: e, frameId: str(d.frameId), frameLabel: frameLabel(frames, str(d.frameId)), frameName: frameName(frames, str(d.frameId)), label, detail, links: [], changes: [], callIds: [], key, submit: isSubmitLike(e) };
      interactions.set(row.id, row);
    } else if (e.kind === "ui.change") changes.push(e);
    else if (e.kind === "network.request") requests.push(e);
    else if (e.kind === "network.response" || e.kind === "network.error") { if (e.requestId) resultsByRequest.set(e.requestId, e); }
    else if (e.kind === "model.request" && e.callId) callRequests.push(e);
    else if ((e.kind === "model.response" || e.kind === "model.error") && e.callId) callResults.push(e);
    else if (e.kind === "frame.served" || e.kind === "gateway.rejected") { /* folded into the frame index; not a row */ }
    else { const { label, detail } = describeNote(e, frames); notes.push({ kind: "note", id: String(e.id), at: e.at, event: e, label, detail }); }
  }
  const byTime = [...interactions.values()].sort((a, b) => ms(a.at) - ms(b.at) || a.event.seq - b.event.seq);
  const latestBefore = (at: string, windowMs: number): InteractionRow | null => {
    const t = ms(at);
    for (let i = byTime.length - 1; i >= 0; i--) {
      const r = byTime[i];
      const rt = ms(r.at);
      if (rt > t) continue;
      return t - rt <= windowMs ? r : null;
    }
    return null;
  };

  // 2. Tie each application request to an interaction: by the id the page
  // put on it, or, for an API call or server action started right after
  // one, by timing. The rest stay loose.
  const rows = new Map<string, TraceRow>();
  const ownerByRequest = new Map<string, InteractionRow>();
  const requestById = new Map<string, TraceEvent>();
  for (const e of requests) {
    const d = e.data ?? {};
    if (e.requestId) requestById.set(e.requestId, e);
    let owner = e.interactionId ? interactions.get(e.interactionId) ?? null : null;
    let correlation: Correlation = "explicit";
    if (!owner && (d.category === "api" || d.category === "action")) { owner = latestBefore(e.at, TEMPORAL_REQUEST_MS); correlation = "temporal"; }
    const result = e.requestId ? resultsByRequest.get(e.requestId) ?? null : null;
    if (owner) {
      owner.links.push({ request: e, result, correlation, sinceMs: Math.max(0, ms(e.at) - ms(owner.at)) });
      if (e.requestId) ownerByRequest.set(e.requestId, owner);
    } else if (d.category === "api" || d.category === "action") {
      const row: NetworkRow = { kind: "network", id: `request:${e.requestId ?? e.id}`, at: e.at, request: e, result, label: requestLabel(e), detail: result ? networkDetail(result) : "in flight" };
      rows.set(row.id, row);
    }
  }

  // 3. Model calls: joined to an interaction directly (the collector's
  // join carried the request's id) or through the request they ran during.
  for (const e of callRequests) {
    const callId = e.callId as string;
    const owner = (e.interactionId ? interactions.get(e.interactionId) : undefined) ?? (e.requestId ? ownerByRequest.get(e.requestId) : undefined) ?? null;
    if (owner) owner.callIds.push(callId);
    const during = e.requestId ? requestById.get(e.requestId) : undefined;
    rows.set(`call:${callId}`, { kind: "call", id: callId, at: e.at, call: byCall.get(callId) ?? null, request: e, result: null, interactionId: owner?.id ?? e.interactionId, requestId: e.requestId, correlation: e.correlation ?? (owner ? "temporal" : null), via: owner?.label ?? null, during: during ? requestLabel(during) : null });
  }
  for (const e of callResults) {
    const callId = e.callId as string;
    const row = rows.get(`call:${callId}`);
    if (row && row.kind === "call") row.result = e;
    else rows.set(`call:${callId}`, { kind: "call", id: callId, at: e.at, call: byCall.get(callId) ?? null, request: e, result: e, interactionId: e.interactionId, requestId: e.requestId, correlation: e.correlation, via: null, during: null });
  }

  // 4. Visible changes belong to the interaction the bridge named (by
  // timing); without one they are notes.
  for (const e of changes) {
    const owner = e.interactionId ? interactions.get(e.interactionId) : undefined;
    if (owner) owner.changes.push(e);
    else { const { label, detail } = describeNote(e, frames); notes.push({ kind: "note", id: String(e.id), at: e.at, event: e, label, detail }); }
  }
  for (const r of interactions.values()) rows.set(`interaction:${r.id}`, r);
  for (const n of notes) rows.set(`note:${n.id}`, n);

  const ordered = [...rows.values()].sort((a, b) => ms(a.at) - ms(b.at) || seqOf(a) - seqOf(b));
  return groupKeys(ordered);
}

function networkDetail(e: TraceEvent): string {
  const d = e.data ?? {};
  if (e.kind === "network.error") return `failed: ${str(obj(d.error)?.message) ?? "error"}`;
  return `${num(d.status) ?? "–"} · ${formatMs(num(d.latency_ms))}${d.streamed === true ? " · streamed" : ""}`;
}

// Consecutive key presses in one frame, close together, on surfaces that
// are not text entry and that led to no model call, become one row: what
// the person did with the keyboard there, with each key's count, still
// open to the raw presses.
function groupKeys(rows: TraceRow[]): TraceRow[] {
  const out: TraceRow[] = [];
  let run: InteractionRow[] = [];
  const flush = () => {
    if (run.length >= 2) {
      const counts = new Map<string, number>();
      for (const r of run) counts.set(r.key!.name, (counts.get(r.key!.name) ?? 0) + r.key!.count);
      // The run ends with its last press, or the last repeat of one.
      const end = Math.max(...run.map((r) => Math.max(ms(r.at), num(r.event.data?.lastAt) ?? 0)));
      const endAt = new Date(end).toISOString();
      const duration = Math.max(0, end - ms(run[0].at));
      const counted = [...counts.entries()].map(([key, count]) => ({ key, count }));
      const presses = counted.reduce((n, c) => n + c.count, 0);
      const links = run.flatMap((r) => r.links);
      out.push({
        kind: "keys", id: `keys:${run[0].id}`, at: run[0].at, endAt, frameId: run[0].frameId, frameLabel: run[0].frameLabel, frameName: run[0].frameName,
        label: `Keyboard in ${run[0].frameLabel} · ${formatMs(duration)}`,
        detail: `${counted.map(({ key, count }) => `${key === "[printable]" ? "printable" : key} ×${count}`).join(", ")}${links.length ? ` · ${summarizeLinks(links)}` : ""}`,
        counts: counted, presses, rows: run,
      });
    } else out.push(...run);
    run = [];
  };
  for (const row of rows) {
    const groupable = row.kind === "interaction" && row.key && !row.key.editable && !row.callIds.length;
    if (groupable) {
      const prev = run[run.length - 1];
      if (prev && (prev.frameId !== (row as InteractionRow).frameId || ms(row.at) - ms(prev.at) > KEY_GROUP_GAP_MS)) flush();
      run.push(row as InteractionRow);
    } else { flush(); out.push(row); }
  }
  flush();
  return out;
}

const seqOf = (r: TraceRow) => (r.kind === "call" ? r.request.seq : r.kind === "note" ? r.event.seq : r.kind === "interaction" ? r.event.seq : r.kind === "network" ? r.request.seq : r.rows[0].event.seq);

// "POST /api/log ×9 → 500, GET / → 200": the requests behind a stretch of
// activity, folded by what they were and how they ended.
export function summarizeLinks(links: RequestLink[]): string {
  const groups = new Map<string, { n: number; statuses: Set<string> }>();
  for (const l of links) {
    const label = requestLabel(l.request);
    const g = groups.get(label) ?? { n: 0, statuses: new Set<string>() };
    g.n += 1;
    g.statuses.add(l.result ? (l.result.kind === "network.error" ? "failed" : String(num(l.result.data?.status) ?? "–")) : "in flight");
    groups.set(label, g);
  }
  return [...groups.entries()].map(([label, g]) => `${label}${g.n > 1 ? ` ×${g.n}` : ""} → ${[...g.statuses].join("/")}`).join(", ");
}

// One request as an interaction row lists it.
export function describeLink(l: RequestLink): string {
  const rd = l.result?.data ?? {};
  const outcome = l.result ? (l.result.kind === "network.error" ? "failed" : `${num(rd.status) ?? "–"} in ${formatMs(num(rd.latency_ms))}`) : "in flight";
  return `${requestLabel(l.request)} → ${outcome}${l.correlation === "temporal" ? ` (by timing, ${formatMs(l.sinceMs)} after)` : ""}`;
}

// What an interaction row says about what followed it.
export function summarizeInteraction(row: InteractionRow): string[] {
  const bits: string[] = row.links.map(describeLink);
  if (row.callIds.length) bits.push(`${row.callIds.length} model call${row.callIds.length === 1 ? "" : "s"}`);
  for (const c of row.changes) if (changeHasText(c)) bits.push(changeLabel(c.data ?? {}).replace(/^Visible change: /, "then ") + ` (${formatMs(num(c.data?.sinceInteractionMs))} later)`);
  return bits;
}

// ---- stages: the rows as a researcher reads them
export function traceStages(rows: TraceRow[]): GroupedTrace {
  const primary: Stage[] = [];
  const diagnostics: TraceRow[] = [];
  const interactions = new Map<string, InteractionRow>();
  const callRows = new Map<string, CallRow>();
  for (const r of rows) {
    if (r.kind === "interaction") interactions.set(r.id, r);
    else if (r.kind === "keys") for (const k of r.rows) interactions.set(k.id, k);
    else if (r.kind === "call") callRows.set(r.id, r);
  }
  const firstCallAt = (row: InteractionRow): number | null => {
    const first = row.callIds.length ? callRows.get(row.callIds[0]) : undefined;
    return first ? ms(first.at) : null;
  };

  let run: (InteractionRow | KeyGroupRow)[] = [];
  const flushRun = () => { if (run.length) primary.push(exploreStage(run)); run = []; };
  const explore = (row: InteractionRow | KeyGroupRow) => {
    const prev = run[run.length - 1];
    if (prev && (prev.frameId !== row.frameId || ms(row.at) - ms(endOf(prev)) > EXPLORE_GAP_MS)) flushRun();
    run.push(row);
  };
  // The click into the field just before Enter, or the move into the
  // frame, belongs with the submit, not with the exploring before it.
  const takeTrailing = (row: InteractionRow): InteractionRow[] => {
    const taken: InteractionRow[] = [];
    const selector = targetSelector(row.event);
    while (run.length) {
      const last = run[run.length - 1];
      if (last.kind !== "interaction" || last.frameId !== row.frameId) break;
      const same = selector !== null && targetSelector(last.event) === selector;
      if (!same && last.event.kind !== "ui.focus") break;
      taken.unshift(run.pop() as InteractionRow);
    }
    return taken;
  };
  const responded = new Set<string>();

  for (const row of rows) {
    switch (row.kind) {
      case "note":
      case "network":
        diagnostics.push(row);
        break;
      case "keys":
        explore(row);
        break;
      case "interaction":
        if (row.event.kind === "ui.route") { flushRun(); primary.push(navigateStage(row)); }
        else if ((row.submit && row.links.length) || row.callIds.length) { const before = takeTrailing(row); flushRun(); primary.push(submitStage(row, before, firstCallAt(row))); }
        else explore(row);
        break;
      case "call": {
        flushRun();
        const owner = row.interactionId ? interactions.get(row.interactionId) ?? null : null;
        primary.push(callStage(row, owner));
        // What appeared after the call, attributed to the same interaction,
        // once its last known call is on the list.
        if (owner && owner.callIds[owner.callIds.length - 1] === row.id && !responded.has(owner.id)) {
          const first = callRows.get(owner.callIds[0]) ?? row;
          const after = owner.changes.filter((c) => changeHasText(c) && ms(c.at) >= ms(first.at));
          if (after.length) { responded.add(owner.id); primary.push(responseStage(after, owner, row)); }
        }
        break;
      }
    }
  }
  flushRun();
  primary.sort((a, b) => ms(a.at) - ms(b.at));
  return { primary, diagnostics };
}

const endOf = (r: InteractionRow | KeyGroupRow) => (r.kind === "keys" ? r.endAt : r.at);
const eventsOf = (r: InteractionRow): TraceEvent[] => [r.event, ...r.links.flatMap((l) => [l.request, ...(l.result ? [l.result] : [])]), ...r.changes];

function exploreStage(run: (InteractionRow | KeyGroupRow)[]): Stage {
  const first = run[0];
  const flat = run.flatMap((r) => (r.kind === "keys" ? r.rows : [r]));
  const clicks = flat.filter((r) => r.event.kind === "ui.click").length;
  const inputs = flat.filter((r) => r.event.kind === "ui.input").length;
  const keys = new Map<string, number>();
  for (const r of flat) if (r.key) keys.set(r.key.name, (keys.get(r.key.name) ?? 0) + r.key.count);
  const presses = [...keys.values()].reduce((n, c) => n + c, 0);
  const links = flat.flatMap((r) => r.links);
  const seen = flat.flatMap((r) => r.changes).filter(changeHasText);
  const end = Math.max(...run.map((r) => ms(endOf(r))));
  const parts: string[] = [];
  if (clicks) parts.push(plural(clicks, "click"));
  if (presses) parts.push(`${plural(presses, "key press", "key presses")}: ${[...keys.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k === "[printable]" ? "printable" : k} ×${n}`).join(", ")}`);
  if (inputs) parts.push(plural(inputs, "field change"));
  if (seen.length) parts.push(plural(seen.length, "visible change"));
  if (links.length) parts.push(summarizeLinks(links));
  return {
    kind: "stage", id: `stage:${first.id}`, stage: "explore", at: first.at, endAt: new Date(end).toISOString(), callId: null, title: `Explored ${first.frameName}`,
    label: `Explored ${first.frameLabel} · ${formatMs(Math.max(0, end - ms(first.at)))}`,
    detail: parts.join(" · ") || null, link: null, rows: run, events: flat.flatMap(eventsOf),
  };
}

// The act that sent something, in words from the DOM facts alone.
export function actLabel(row: InteractionRow): string {
  const d = row.event.data ?? {};
  const target = descriptor(d.target);
  const control = descriptor(d.control);
  const inFrame = row.frameLabel === "the page" ? "" : ` in ${row.frameLabel}`;
  if (row.event.kind === "ui.submit") return row.label;
  if (row.submit && row.event.kind === "ui.key") return `Submitted text from ${describeTarget(target)}${inFrame}`;
  if (row.submit) return `Submitted via ${describeTarget(control ?? target)}${inFrame}`;
  return row.label;
}

// The short form of an act, for a chip; the details keep the rest.
export function actTitle(row: InteractionRow): string {
  if (row.event.kind === "ui.submit") return "Submitted form";
  if (row.submit && row.event.kind === "ui.key") return "Submitted text";
  if (row.submit) return "Submitted";
  switch (row.event.kind) {
    case "ui.click": return "Clicked";
    case "ui.input": return "Changed a field";
    case "ui.key": return `Pressed ${row.key?.name ?? "a key"}`;
    default: return row.label.length > 32 ? row.label.slice(0, 31) + "…" : row.label;
  }
}

// How a later stage refers back to the act, which stands just above it.
export function actNoun(row: InteractionRow): string {
  if (row.submit) return "the submit";
  switch (row.event.kind) {
    case "ui.click": return "the click";
    case "ui.key": return "the key press";
    case "ui.input": return "the field change";
    case "ui.route": return "the navigation";
    case "ui.focus": return "the move into the frame";
    default: return "the interaction";
  }
}

// Changes with text that came before the first model call are part of
// the act (the message echoed into the list, say); the rest are the response.
function submitStage(row: InteractionRow, before: InteractionRow[], firstCallAt: number | null): Stage {
  const parts = row.links.map(describeLink);
  const echoes = row.changes.filter((c) => changeHasText(c) && (firstCallAt === null || ms(c.at) < firstCallAt));
  for (const c of echoes) parts.push(changeLabel(c.data ?? {}).replace(/^Visible change: /, "then ") + ` (${formatMs(num(c.data?.sinceInteractionMs))} later)`);
  const all = [...before, row];
  const end = Math.max(ms(row.at), ...row.links.map((l) => (l.result ? ms(l.result.at) : ms(l.request.at))));
  return {
    kind: "stage", id: `stage:${row.id}`, stage: "submit", at: all[0].at, endAt: new Date(end).toISOString(), callId: row.callIds[0] ?? null, title: actTitle(row),
    label: actLabel(row), detail: parts.join(" · ") || null, link: null, rows: all, events: all.flatMap(eventsOf),
  };
}

function callStage(row: CallRow, owner: InteractionRow | null): Stage {
  const s = summarizeCall(row);
  const bits = [s.state === "in flight" ? "in flight" : s.state === "aborted" ? "aborted" : `${s.status ?? "–"} · ${formatMs(s.latencyMs)}`];
  if (s.messages !== null) bits.push(plural(s.messages, "message"));
  if (s.streamed) bits.push("streamed");
  if (s.outputChars !== null) bits.push(`${s.outputChars} characters back`);
  if (s.state === "done" && s.usageAvailable === false) bits.push("usage unavailable");
  if (s.errorText) bits.push(s.errorText);
  let link: Stage["link"] = null;
  if (row.during || owner) {
    const ownerLink = owner?.links.find((l) => l.request.requestId === row.requestId) ?? null;
    const act = owner ? actNoun(owner) : null;
    const text = [
      row.during ? `while ${row.during} was in flight (the only request open, so by timing)` : null,
      owner && ownerLink ? (ownerLink.correlation === "explicit" ? `that request carried the id of ${act}` : `that request followed ${act} by ${formatMs(ownerLink.sinceMs)} (by timing)`) : owner ? `after ${act} (by timing)` : null,
    ].filter(Boolean).join(" · ");
    link = { correlation: "temporal", text };
  }
  const end = row.result ? ms(row.result.at) : ms(row.at);
  return {
    kind: "stage", id: `stage:call:${row.id}`, stage: "call", at: row.at, endAt: new Date(end).toISOString(), callId: row.id, title: `${s.model ?? "Model"} call`,
    label: `${s.model ?? "Model"} call`, detail: bits.join(" · "), link, rows: [row], events: [row.request, ...(row.result ? [row.result] : [])],
  };
}

function responseStage(changes: TraceEvent[], owner: InteractionRow, call: CallRow): Stage {
  const added = changes.flatMap((c) => netText(c.data).added);
  const removed = changes.flatMap((c) => netText(c.data).removed);
  const parts: string[] = [];
  if (added.length) parts.push(`+${quote(added[0], 70)}${added.length > 1 ? ` and ${added.length - 1} more` : ""}`);
  if (removed.length) parts.push(`−${quote(removed[0], 40)}${removed.length > 1 ? ` and ${removed.length - 1} more` : ""}`);
  const mutations = changes.reduce((n, c) => n + (num(c.data?.mutations) ?? 0), 0);
  const container = descriptor(changes[0].data?.container);
  const first = changes[0];
  const end = Math.max(...changes.map((c) => num(c.data?.lastMutationAt) ?? ms(c.at)));
  const callEnd = call.result ? ms(call.result.at) : null;
  const when = callEnd === null ? "while the model call was in flight" : ms(first.at) < callEnd ? "while the model was still answering" : `${formatMs(ms(first.at) - callEnd)} after the model answered`;
  const label = `Response appeared: ${parts.join(" ")}`;
  const rows: NoteRow[] = changes.map((c) => { const { label, detail } = describeNote(c); return { kind: "note", id: String(c.id), at: c.at, event: c, label, detail }; });
  return {
    kind: "stage", id: `stage:response:${owner.id}`, stage: "response", at: first.at, endAt: new Date(end).toISOString(), callId: call.id, title: "Response appeared",
    label, detail: `${plural(mutations, "mutation")} in ${changes.length > 1 ? `${changes.length} bursts` : "one burst"}${container ? ` · in ${describeContainer(container)}` : ""}`,
    link: { correlation: "temporal", text: `${formatMs(num(first.data?.sinceInteractionMs) ?? ms(first.at) - ms(owner.at))} after ${actNoun(owner)}, ${when} · by timing` },
    rows, events: changes,
  };
}

function navigateStage(row: InteractionRow): Stage {
  return { kind: "stage", id: `stage:${row.id}`, stage: "navigate", at: row.at, endAt: row.at, label: row.label, detail: row.detail, link: null, callId: null, title: "Navigated", rows: [row], events: eventsOf(row) };
}

// What a call row says about itself before the inspector opens.
export type CallSummary = { model: string | null; where: string; state: "in flight" | "done" | "error" | "aborted"; status: number | null; latencyMs: number | null; streamed: boolean | null; usageAvailable: boolean | null; messages: number | null; outputChars: number | null; errorText: string | null };

export function summarizeCall(row: CallRow): CallSummary {
  const req = row.request.data ?? {};
  const res = row.result?.data ?? {};
  const c = row.call;
  const errored = row.result?.kind === "model.error" || c?.phase === "error";
  const aborted = res.aborted === true || c?.aborted === true;
  const error = (res.error ?? c?.error) as { type?: string | null; code?: string | null; message?: string } | null | undefined;
  return {
    model: c?.model ?? str(req.model) ?? str(res.model),
    where: `${str(req.host) ?? c?.upstream.host ?? "?"}${str(req.path) ?? c?.upstream.path ?? ""}`,
    state: aborted ? "aborted" : errored ? "error" : row.result || (c && c.phase !== "request") ? "done" : "in flight",
    status: typeof res.status === "number" ? res.status : c?.status ?? null,
    latencyMs: typeof res.latencyMs === "number" ? res.latencyMs : c?.latencyMs ?? null,
    streamed: typeof res.streamed === "boolean" ? res.streamed : c?.streamed ?? (typeof req.stream === "boolean" ? req.stream : null),
    usageAvailable: typeof res.usageAvailable === "boolean" ? res.usageAvailable : c ? c.usageAvailable : null,
    messages: typeof req.messageCount === "number" ? req.messageCount : c?.request?.message_count ?? null,
    outputChars: typeof res.outputChars === "number" ? res.outputChars : null,
    errorText: error ? (c?.error?.message ?? ([error.type, error.code].filter(Boolean).join(" · ") || "error")) : null,
  };
}

// Milliseconds as people read them: "840 ms", "3.4 s", "1m 12s".
export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "–";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleTimeString("en-US", { hour12: false })}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

// Text that parses as JSON, pretty-printed; otherwise null.
export function prettyJson(text: string | null | undefined): string | null {
  if (!text) return null;
  try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return null; }
}

export const formatBytes = (n: number | null | undefined) =>
  n === null || n === undefined ? "–" : n < 1024 ? `${n} B` : n < 1_048_576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1_048_576).toFixed(2)} MB`;
