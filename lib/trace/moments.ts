// What each moment says on the canvas, taken from the stage's own rows
// and nothing else: the short title it already has, one line under it
// while compact, a few more once opened, and how it is tied to a model
// call when the trace itself says so. Nothing here reads the application
// and nothing here infers a cause. Pure: no DOM, no React.
import { changeHasText, describeTarget, formatClock, formatMs, netText, summarizeCall, type CallRow, type CallSummary, type InteractionRow, type Stage, type TraceRow } from "@/lib/trace/timeline";
import { elementTarget, type Correlation } from "@/lib/trace/types";

export type MomentKind = "human" | "model" | "observed";
export const momentKind = (stage: Stage): MomentKind => (stage.stage === "call" ? "model" : stage.stage === "response" ? "observed" : "human");

const MAX_LINES = 6;
const ms = (iso: string) => Date.parse(iso);
const num = (v: unknown) => (typeof v === "number" ? v : null);
const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + "…" : s);
const quote = (s: string, max: number) => `“${clip(s, max)}”`;
const keyName = (k: string) => (k === "[printable]" ? "printable keys" : k);
const callRowOf = (stage: Stage) => stage.rows.find((r): r is CallRow => r.kind === "call");
export const shortClock = (iso: string) => formatClock(iso).replace(/\.\d{3}$/, "");

// A key's name as a glyph where the glyph reads faster: the arrows and a
// few control keys. Every other key keeps its name.
const GLYPH: Record<string, string> = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Enter: "⏎", Escape: "Esc", Backspace: "⌫", Tab: "⇥", " ": "Space" };
export const keyGlyph = (name: string) => GLYPH[name] ?? keyName(name);

// The text that appeared in the page right after a submit and before its
// first model call: what the application echoed, not what was typed.
// Typed characters are never recorded, so this is the only text a submit
// can show, and it is labelled as observed wherever it is explained.
export type Echo = { text: string; sinceMs: number | null; more: number };
export const ECHO_PROVENANCE = "Observed after the submit: this text appeared in the page; it was not read from the field, and typed characters are never recorded.";
export function submitEcho(stage: Stage, calls: Map<string, CallRow>): Echo | null {
  if (stage.stage !== "submit") return null;
  const row = [...stage.rows].reverse().find((r): r is InteractionRow => r.kind === "interaction" && r.submit);
  if (!row) return null;
  const firstCallAt = stage.callId ? calls.get(stage.callId)?.at : undefined;
  const limit = firstCallAt ? ms(firstCallAt) : null;
  const changes = row.changes.filter((c) => changeHasText(c) && (limit === null || ms(c.at) < limit));
  const added = changes.flatMap((c) => netText(c.data).added);
  if (!added.length) return null;
  return { text: added[0], sinceMs: num(changes[0].data?.sinceInteractionMs), more: added.length - 1 };
}

// One line under the title while the card is compact, or none.
export function momentPreview(stage: Stage, calls: Map<string, CallRow>): string | null {
  switch (stage.stage) {
    case "explore": return formatMs(ms(stage.endAt) - ms(stage.at));
    case "navigate": return stage.label === stage.title ? null : clip(stage.label, 36);
    case "submit": { const e = submitEcho(stage, calls); return e ? quote(e.text, 34) : null; }
    case "call": {
      const row = callRowOf(stage);
      if (!row) return null;
      return row ? callState(summarizeCall(row)) : null;
    }
    case "response": return null;
  }
}

// Where a call stands, in a word or two: what it is doing while open,
// how long it took once done, what went wrong otherwise.
export function callState(s: CallSummary): string {
  if (s.state === "in flight") return s.streamed ? "streaming…" : "in flight…";
  if (s.state === "aborted") return "aborted";
  if (s.state === "error") return s.errorText ?? "error";
  return `${formatMs(s.latencyMs)}${s.streamed ? " · streamed" : ""}`;
}

// One more line once a card is opened, and the line of a live item: the
// keys and clicks of a stretch of exploring as glyphs and counts, the
// acts of a submit, the shape of a call, the first text that appeared.
export function momentSummary(stage: Stage): string | null {
  switch (stage.stage) {
    case "explore":
    case "navigate":
    case "submit": {
      const keys = new Map<string, number>();
      let clicks = 0, inputs = 0;
      for (const r of stage.rows) {
        if (r.kind === "keys") { for (const c of r.counts) keys.set(c.key, (keys.get(c.key) ?? 0) + c.count); continue; }
        if (r.kind !== "interaction") continue;
        if (r.key) keys.set(r.key.name, (keys.get(r.key.name) ?? 0) + r.key.count);
        else if (r.event.kind === "ui.click") clicks += 1;
        else if (r.event.kind === "ui.input") inputs += 1;
      }
      const parts = [...keys.entries()].map(([k, n]) => `${keyGlyph(k)} ×${n}`);
      if (clicks) parts.push(`${clicks} click${clicks === 1 ? "" : "s"}`);
      if (inputs) parts.push(`${inputs} field change${inputs === 1 ? "" : "s"}`);
      return parts.length ? clip(parts.join(" · "), 48) : null;
    }
    case "call": {
      const row = callRowOf(stage);
      if (!row) return null;
      const s = summarizeCall(row);
      if (s.state !== "done") return callState(s);
      const parts = [s.status !== null ? `status ${s.status}` : null, s.messages !== null ? `${s.messages} message${s.messages === 1 ? "" : "s"}` : null, s.outputChars !== null ? `${s.outputChars.toLocaleString("en-US")} chars back` : null];
      return parts.filter(Boolean).join(" · ") || null;
    }
    case "response": {
      const first = responseQuotes(stage)[0];
      return first ? quote(first, 48) : null;
    }
  }
}

// What a live item says under its title: what the person did, what the
// page echoed, where the call stands, what appeared.
export function liveLine(stage: Stage, calls: Map<string, CallRow>): string | null {
  switch (stage.stage) {
    case "explore": return momentSummary(stage) ?? momentPreview(stage, calls);
    case "submit": return momentPreview(stage, calls) ?? momentSummary(stage);
    default: return stage.stage === "response" ? momentSummary(stage) : momentPreview(stage, calls);
  }
}

// The text that appeared, in order, as the page showed it.
export const responseQuotes = (stage: Stage): string[] => (stage.stage === "response" ? stage.events.flatMap((e) => netText(e.data).added) : []);

// What the card says once opened: the acts a person made, in order; the
// echo after a submit, marked as observed; the shape of a model call; the
// text that appeared. Evidence (requests, selectors, timestamps, raw
// events) stays in the details panel.
export function momentLines(stage: Stage, calls: Map<string, CallRow>): string[] {
  switch (stage.stage) {
    case "explore":
    case "navigate":
      return momentActions(stage);
    case "submit": {
      const lines = momentActions(stage);
      const e = submitEcho(stage, calls);
      if (e) lines.push(`Echoed in the page: ${quote(e.text, 60)}${e.more ? ` and ${e.more} more` : ""}${e.sinceMs !== null ? ` · ${formatMs(e.sinceMs)} later` : ""}`);
      return lines;
    }
    case "call": {
      const row = callRowOf(stage);
      if (!row) return [];
      const s = summarizeCall(row);
      const lines: string[] = [];
      if (s.state === "done" && s.status !== null) lines.push(`status ${s.status}`);
      if (s.messages !== null) lines.push(`${s.messages} message${s.messages === 1 ? "" : "s"} sent`);
      if (s.outputChars !== null) lines.push(`${s.outputChars.toLocaleString("en-US")} characters back`);
      if (s.errorText) lines.push(s.errorText);
      return lines;
    }
    case "response": {
      const added = responseQuotes(stage);
      const lines = added.slice(0, 2).map((t) => quote(t, 80));
      if (added.length > 2) lines.push(`+${added.length - 2} more`);
      const summary = stage.detail?.split(" · ")[0];
      if (summary) lines.push(summary);
      return lines;
    }
  }
}

// The acts a person made in a stage, in order, by name: clicks and
// field changes by their target, keys by name and count.
export const momentActions = (stage: Stage): string[] => actionLines(stage.rows);

function actionLines(rows: TraceRow[]): string[] {
  const lines: string[] = [];
  for (const r of rows) {
    if (r.kind === "keys") { for (const c of r.counts) lines.push(`${keyName(c.key)} ×${c.count}`); continue; }
    if (r.kind !== "interaction") continue;
    const target = elementTarget(r.event.data?.target);
    // The reading is already on the row (traceRows baked it there); a
    // confident one puts the application's own name in front of the raw
    // description, and an absent or weak one changes nothing.
    const m = r.semantic?.element ?? null;
    switch (r.event.kind) {
      case "ui.click": lines.push(clip(`Clicked ${describeTarget(target, m)}`, 80)); break;
      case "ui.input": lines.push(clip(`Changed ${describeTarget(target, m)}`, 80)); break;
      case "ui.key": if (r.key) lines.push(`${keyName(r.key.name)} ×${r.key.count}`); break;
      case "ui.submit": case "ui.route": lines.push(clip(r.label, 80)); break;
      default: break;   // a move into a frame is where the acts happened, not an act
    }
  }
  return lines.length > MAX_LINES ? [...lines.slice(0, MAX_LINES - 1), `+${lines.length - MAX_LINES + 1} more`] : lines;
}

// A tie between two moments that the trace itself recorded: a submit to
// the model call joined to it through its requests, or a response to the
// call the same interaction was still waiting on. "explicit" means an id
// carried the join; "temporal" means timing did, and is drawn as weaker.
// Nothing is tied to the nearest call for being near.
export type Relation = { from: string; to: string; correlation: Correlation; text: string | null };
export function relationFor(stage: Stage, stages: Stage[], calls: Map<string, CallRow>): Relation | null {
  if (!stage.callId) return null;
  const callStage = stages.find((s) => s.stage === "call" && s.callId === stage.callId);
  if (!callStage) return null;
  if (stage.stage === "submit") return { from: stage.id, to: callStage.id, correlation: calls.get(stage.callId)?.correlation ?? "temporal", text: callStage.link?.text ?? null };
  if (stage.stage === "response" && stage.link) return { from: callStage.id, to: stage.id, correlation: stage.link.correlation, text: stage.link.text };
  return null;
}
export const relationWord = (c: Correlation) => (c === "explicit" ? "linked" : "by timing");

// The model call a submit or a response is tied to, for a line in the
// inspector: which call, where it stands, and how the tie was made.
export type RelatedCall = { stageId: string; callId: string; model: string | null; state: CallSummary["state"]; stateText: string; correlation: Correlation; text: string | null };
export function relatedCall(stage: Stage, stages: Stage[], calls: Map<string, CallRow>): RelatedCall | null {
  const rel = relationFor(stage, stages, calls);
  const row = rel && stage.callId ? calls.get(stage.callId) : undefined;
  if (!rel || !row) return null;
  const s = summarizeCall(row);
  return { stageId: stage.stage === "submit" ? rel.to : rel.from, callId: row.id, model: s.model, state: s.state, stateText: callState(s), correlation: rel.correlation, text: rel.text };
}

// The submit a model call was joined to, if the trace joined it to one:
// the stage's own title and the correlation the call row carries.
export type Owner = { stageId: string; title: string; correlation: Correlation };
export function callOwner(callId: string, stages: Stage[], calls: Map<string, CallRow>): Owner | null {
  const owner = stages.find((s) => s.stage === "submit" && s.rows.some((r) => r.kind === "interaction" && r.callIds.includes(callId)));
  if (!owner) return null;
  return { stageId: owner.id, title: owner.title, correlation: calls.get(callId)?.correlation ?? "temporal" };
}
