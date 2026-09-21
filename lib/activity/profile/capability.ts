// What the instrument could see when a profile was written.
//
// A profile is a set of tests against recorded evidence: this anchor
// matches an element with that test id, this rule fires when the burst
// reported regions. The collector gains fields over time — an
// application's own element ids, per-region burst reporting, a real edit
// count for every keystroke — and a profile written after one of those
// arrived cannot be judged against a trace recorded before it, nor the
// reverse. The profile is not wrong; the evidence is a different shape.
//
// So a stored profile records which instrument it was written against,
// and a reader compares. This is deliberately a hand-turned number and
// not a hash: it changes when somebody decides the evidence a profile
// may rest on has changed, which is a judgement, not a diff.
import type { TraceEvent } from "@/lib/trace/types";
import { targetsOf } from "@/lib/trace/types";

// 1 — the collector as of the artifact-profile bench runs: application
// element ids (appId/appIdAttr), per-region burst reporting, an edit
// count on every ui.input, wheel and drag recorded as gestures, and
// surfaceKey returning a document's path.
//
// Bump this when the collector starts or stops offering something a
// profile's anchors or rules can rest on, and say what changed here.
export const CAPABILITY_VERSION = 1;

// What a particular run's trace actually carries. Two runs of the same
// collector can still differ — an artifact with no iframes offers no
// embedded frames to anchor against — so this is reported beside the
// version rather than folded into it, and it is what the evidence pack
// tells the generator it may rely on.
export type Capability = {
  version: number;
  features: string[];
  missing: string[];
};

const FEATURES: { id: string; note: string; seen: (events: TraceEvent[]) => boolean }[] = [
  {
    id: "appId",
    note: "elements carry the application's own id, which is the strongest thing to anchor on",
    seen: (events) => events.some((e) => targetsOf(e).some((t) => typeof t?.appId === "string" && t.appId.length > 0)),
  },
  {
    id: "testid",
    note: "elements carry a test id",
    seen: (events) => events.some((e) => targetsOf(e).some((t) => typeof t?.testid === "string" && t.testid.length > 0)),
  },
  {
    id: "regions",
    note: "a burst says which region of the page changed, so a channel can be anchored rather than guessed",
    seen: (events) => events.some((e) => e.kind === "ui.change" && Array.isArray((e.data as { regions?: unknown[] })?.regions)),
  },
  {
    id: "inputEdits",
    note: "typing is counted per keystroke, so a stretch of writing is visible as edits and not only as position",
    seen: (events) => events.some((e) => e.kind === "ui.input" && typeof (e.data as { edits?: unknown })?.edits === "number"),
  },
  {
    id: "gestures",
    note: "wheeling and dragging are recorded, so an interface driven by gesture can be asked about",
    seen: (events) => events.some((e) => e.kind === "ui.wheel" || e.kind === "ui.drag"),
  },
  {
    id: "embeddedFrames",
    note: "the artifact serves documents inside documents, so a surface can be more than the page",
    seen: (events) => events.some((e) => e.kind === "frame.attached"),
  },
  {
    id: "modelCalls",
    note: "the model gateway read this artifact's calls, so waiting on one is a fact rather than an inference",
    seen: (events) => events.some((e) => e.kind === "model.request"),
  },
];

export function capabilityOf(events: TraceEvent[]): Capability {
  const features: string[] = [];
  const missing: string[] = [];
  for (const f of FEATURES) (f.seen(events) ? features : missing).push(f.id);
  return { version: CAPABILITY_VERSION, features, missing };
}

export const CAPABILITY_NOTES: Record<string, string> = Object.fromEntries(FEATURES.map((f) => [f.id, f.note]));

// A profile written against a richer instrument than the one that
// recorded this run may be testing for things the trace cannot carry.
// The reverse — a profile written against a poorer one — is usable, and
// only worth redoing.
export function capabilityVerdict(profileVersion: number, runVersion = CAPABILITY_VERSION): "ok" | "behind" | "ahead" {
  if (profileVersion === runVersion) return "ok";
  return profileVersion < runVersion ? "behind" : "ahead";
}
