// Watching a recording back, and keeping it beside the trace.
//
// The replay and the trace are two records of the same minutes kept by two
// different machines, and the whole of this file is about the one thing
// that has to be true for them to be shown together: that a moment in one
// can be found in the other.
//
// Pure: no DOM, no rrweb, no React. What rrweb produced is `unknown` here
// and stays that way — this file reads timestamps off it and nothing else.
import type { CanvasFrame } from "@/lib/annotations/protocol";
import { readCanvasFrame } from "@/lib/annotations/protocol";
import type { TraceEvent } from "@/lib/trace/types";
import type { Stage } from "@/lib/trace/timeline";

export type { CanvasFrame };

// ---- the two clocks
//
// There are three in play and only two matter here.
//
// rrweb stamps its events with Date.now() inside the preview's document.
// That document is served from the sandbox but it RUNS IN THE VIEWER'S
// BROWSER, so those readings are the viewer's own clock — the same clock
// the bridge uses for the events it sends, and a different one from the
// sandbox's.
//
// TraceEvent.at is the sandbox's clock. The gateway already does the
// conversion, per batch: it measures `offset = receivedAt - sentAt` and
// writes `at = browser_at + offset`, keeping both numbers on the row
// (sandbox/trace/preview-gateway.mjs). So the correction we need is
// already recorded, on every event the browser sent, and we read it back
// rather than guessing at one.
//
// The third clock is the Next server's, which stamps a recording's
// startedAt and stoppedAt. It is right for deciding what falls inside a
// recording, which is all it is used for, and wrong as a t=0 for a replay:
// it is a different machine again, and the round trip is in it. So a
// replay is anchored on its own first event, never on the recording.

// How far the sandbox's clock is ahead of the viewer's, as the gateway
// measured it. Later events win: the offset is re-measured per batch and
// the most recent reading is the one that held most recently.
//
// null means no browser event carried one — no bridge, or a clock so far
// out that the gateway refused to trust it (its own five-minute bound). We
// return null rather than 0 so the caller can decline to line the two up
// instead of lining them up wrongly.
export function clockOffset(events: TraceEvent[]): number | null {
  let best: number | null = null;
  let at = Number.NEGATIVE_INFINITY;
  for (const e of events) {
    if (e.source !== "browser") continue;
    const offset = (e.data as { clock_offset_ms?: unknown } | null)?.clock_offset_ms;
    if (typeof offset !== "number" || !Number.isFinite(offset)) continue;
    const t = Date.parse(e.at);
    if (Number.isNaN(t) || t < at) continue;
    at = t; best = offset;
  }
  return best;
}

// The pin between the two, and everything either side needs to convert.
// `startedAt` is the replay's own first event, in the viewer's clock.
export type ReplayClock = { startedAt: number; offset: number };

export const replayClock = (startedAt: number, offset: number | null): ReplayClock | null =>
  offset === null || !Number.isFinite(startedAt) ? null : { startedAt, offset };

// A moment on the trace's clock, as an offset into the replay.
export function toReplayTime(at: string, clock: ReplayClock): number | null {
  const trace = Date.parse(at);
  if (Number.isNaN(trace)) return null;
  return trace - clock.offset - clock.startedAt;
}

// ...and back: where the playhead is, in the trace's own clock.
export const toTraceTime = (offsetMs: number, clock: ReplayClock): string =>
  new Date(clock.startedAt + offsetMs + clock.offset).toISOString();

// ---- what was happening then
//
// A stage is an interval (at → endAt) and the intervals overlap: a call
// runs underneath the act that started it, and a response arrives during
// both. So "the moment at time t" is not a lookup, and the rule has to be
// stated rather than fallen into.
//
// The rule: the last stage to have started at or before t. That is what
// somebody scrubbing means — the most recent thing to have happened — and
// it is total, so a playhead in a gap between stages still names one
// rather than clearing the selection and making the canvas flicker. Before
// the first stage there is honestly nothing, and the answer is null.
//
// Ties go to the later stage in the list, which is the order the canvas
// already lays them out in.
export function stageAt(stages: Stage[], at: string): Stage | null {
  const t = Date.parse(at);
  if (Number.isNaN(t)) return null;
  let found: Stage | null = null;
  for (const s of stages) {
    const start = Date.parse(s.at);
    if (Number.isNaN(start) || start > t) continue;
    found = s;
  }
  return found;
}

// ---- the stream itself
//
// rrweb's events are opaque to us, with one exception: the timestamp, which
// is the whole reason they can be shown beside anything. `unknown` in and a
// number out, and a stream that cannot answer is one we will not sync.
export const eventTime = (e: unknown): number | null => {
  const t = (e as { timestamp?: unknown } | null)?.timestamp;
  return typeof t === "number" && Number.isFinite(t) ? t : null;
};

// When a stream begins, for the pin. rrweb sorts on construction, so the
// earliest reading is the answer whatever order the parts arrived in.
export function streamStart(events: unknown[]): number | null {
  let first: number | null = null;
  for (const e of events) {
    const t = eventTime(e);
    if (t === null) continue;
    if (first === null || t < first) first = t;
  }
  return first;
}

// Two events is rrweb's own minimum for a replayer, and a stream with
// fewer is not a short recording, it is a failed one. Saying so here keeps
// the check off the surface that would otherwise throw.
export const REPLAY_MIN_EVENTS = 2;
export const playable = (events: unknown[]): boolean =>
  events.length >= REPLAY_MIN_EVENTS && streamStart(events) !== null;

// ---- whether anybody was holding a mouse
//
// rrweb hides the replay cursor the moment a stream contains a single
// touch event and never shows it again: `indicatesTouchDevice`
// (rrweb.js:15810) is true for any TouchMove or TouchStart, the class it
// latches in the Replayer's constructor (rrweb.js:16192) blanks the
// cursor image, the ring and the dot, and nothing clears it. On a
// touchscreen that is right — there is no cursor to draw.
//
// A trackpad is both things at once. Scrolling on one emits touchmove, so
// a session driven entirely by a mouse arrives looking like a tablet and
// replays with no pointer at all, which is most of what a recording is
// for. This asks the other half of the question, and the surface believes
// this one when the answer is yes.
//
// "A mouse was moved, or something was clicked with one." Focus and blur
// are deliberately not pointer evidence: a keyboard produces both.
export const usedPointer = (events: unknown[]): boolean =>
  events.some((e) => {
    const ev = e as { type?: unknown; data?: Record<string, unknown> } | null;
    if (!ev || ev.type !== 3 || !ev.data) return false;
    // IncrementalSource 1 = MouseMove, with somewhere to have moved.
    if (ev.data.source === 1) return Array.isArray(ev.data.positions) && ev.data.positions.length > 0;
    // 2 = MouseInteraction, whose types 0..4 are up, down, click, context
    // menu and double click. 7 upwards are the touch ones.
    if (ev.data.source !== 2) return false;
    return typeof ev.data.type === "number" && ev.data.type >= 0 && ev.data.type <= 4;
  });

// ---- what is stored
//
// The stream and the two numbers needed to put it back beside the trace.
// Versioned because it is the one thing here written to storage rather
// than derived, and a stream written by one recorder is read by whatever
// ships later.
// `canvas` is beside the stream rather than in it: the pictures the
// recorder could not take are ours, they are not rrweb events, and
// putting them in the array handed to the Replayer would mean inventing
// an event type for it to trip over. A file written before this existed
// has no `canvas` key and reads back as an empty one.
export type StoredReplay = { v: 1; startedAt: number; offset: number | null; truncated: boolean; dropped: number; events: unknown[]; canvas: CanvasFrame[] };

export function readStoredReplay(raw: unknown): StoredReplay | null {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!o || o.v !== 1 || !Array.isArray(o.events)) return null;
  const startedAt = typeof o.startedAt === "number" && Number.isFinite(o.startedAt) ? o.startedAt : streamStart(o.events);
  if (startedAt === null) return null;
  return {
    v: 1, startedAt,
    offset: typeof o.offset === "number" && Number.isFinite(o.offset) ? o.offset : null,
    truncated: o.truncated === true,
    dropped: typeof o.dropped === "number" && o.dropped > 0 ? Math.round(o.dropped) : 0,
    events: o.events,
    // Read the same way it arrived. A file in a bucket is not a page, but
    // it is what a page sent, and it has not become truer since.
    canvas: (Array.isArray(o.canvas) ? o.canvas : []).flatMap((f) => { const got = readCanvasFrame(f); return got ? [got] : []; }),
  };
}

// ---- canvas
//
// A canvas paints rather than describes itself, so nothing in a replayed
// document brings one back. rrweb's answer is to sample each one into a
// picture and replay it by turning on `UNSAFE_replayCanvas`, which gives
// the replay iframe `allow-scripts` alongside `allow-same-origin` — on the
// workspace's own origin, holding the viewer's session, rebuilding a
// document that came out of somebody else's repository. rrweb neutralises
// `<script>` and renames onload/onclick/onmouse* on rebuild, but onerror
// survives, and a recording's image URLs stop resolving the moment the
// sandbox goes. That is a real way in, so the flag stays off.
//
// The pictures reach us anyway, and the replay iframe stays reachable
// from here without scripts of its own. They arrive by two routes and
// this is where that stops mattering: rrweb sampled the top document, the
// bridge sampled the frames below it that rrweb cannot see
// (sandbox/trace/bridge.js), and both name the element by the same mirror
// id. `canvasFrame` reads rrweb's shape — clearRect, then drawImage of an
// ImageBitmap built from a Blob; ours is already a frame.
//
// What is done with them is NOT to draw them onto the canvas, though that
// was the first arrangement and it looked right for a while. Drawing onto
// a canvas in the replay works and shows nothing: a canvas in a
// scripting-disabled browsing context represents its fallback content
// rather than a bitmap, so the element the picture went into lays out at
// no size and never paints. Measured, with nothing but three iframes and
// one canvas: `allow-same-origin` gives a 600x300 canvas a box of 0x17,
// and a canvas whose fallback content is the words "FALLBACK TEXT" gets a
// box of 128x17 — it is rendering the words. `getContext`, `drawImage`
// and `getImageData` all keep working the whole time, which is why this
// survived a test suite: the bitmap really did hold the drawing.
//
// An image in the same document renders normally, so the surface shows
// each picture in one of those instead (components/trace/replay-surface.tsx).
//
// Nothing about any particular canvas, application or drawing is known
// here: it is "an element that paints", the same way the rest of the
// system says "an element".

const IMAGE = /^image\/[a-z0-9.+-]+$/i;

export function canvasFrame(event: unknown): CanvasFrame | null {
  const e = event as { type?: unknown; timestamp?: unknown; data?: Record<string, unknown> } | null;
  // 3 = IncrementalSnapshot, 9 = CanvasMutation (@rrweb/types EventType,
  // IncrementalSource). They are numbers on the wire whatever we import.
  if (!e || e.type !== 3 || !e.data || e.data.source !== 9) return null;
  const at = eventTime(e);
  const nodeId = e.data.id;
  if (at === null || typeof nodeId !== "number") return null;
  const commands = Array.isArray(e.data.commands) ? e.data.commands : [];
  for (const c of commands) {
    const cmd = c as { property?: unknown; args?: unknown } | null;
    if (!cmd || cmd.property !== "drawImage" || !Array.isArray(cmd.args)) continue;
    const url = dataUrlOf(cmd.args[0]);
    if (url) return { at, nodeId, dataUrl: url };
  }
  return null;
}

function dataUrlOf(arg: unknown): string | null {
  const bitmap = arg as { rr_type?: unknown; args?: unknown } | null;
  if (!bitmap || bitmap.rr_type !== "ImageBitmap" || !Array.isArray(bitmap.args)) return null;
  const blob = bitmap.args[0] as { rr_type?: unknown; type?: unknown; data?: unknown } | null;
  if (!blob || blob.rr_type !== "Blob" || !Array.isArray(blob.data)) return null;
  const mime = typeof blob.type === "string" && IMAGE.test(blob.type) ? blob.type : "image/png";
  const part = blob.data[0] as { rr_type?: unknown; base64?: unknown } | null;
  if (!part || part.rr_type !== "ArrayBuffer" || typeof part.base64 !== "string" || !part.base64) return null;
  return `data:${mime};base64,${part.base64}`;
}

// Every painted frame in the stream, in time order, so the surface can
// find the one that belongs at the playhead instead of waiting for it to
// come round again on a scrub.
export const canvasFrames = (events: unknown[]): CanvasFrame[] =>
  events.flatMap((e) => { const f = canvasFrame(e); return f ? [f] : []; }).sort((a, b) => a.at - b.at);

// A picture with its time said the way the playhead says it: milliseconds
// into the replay, not a reading off a clock.
//
// The field is named differently from `CanvasFrame.at` on purpose. The two
// numbers are three orders of magnitude apart — one is around 1.79e12, the
// other around 1e4 — so mixing them up silently answers "nothing is due"
// forever rather than failing. It happened: the surface passed the playhead
// straight into `framesAt` against absolute stamps, `framesAt` broke on the
// first frame at every position, and every canvas in every replay stayed
// blank. Two names that cannot be swapped is the cheapest way to make that
// a compile error instead of a symptom.
export type PaintFrame = { ms: number; nodeId: number; dataUrl: string };

// Everything both samplers saw, as one series in time order, on the
// playhead's clock. rrweb measures `getCurrentTime()` from the first event
// in the stream, so that is where this measures from too.
export const allFrames = (stored: StoredReplay | null): PaintFrame[] => {
  if (!stored) return [];
  const zero = streamStart(stored.events) ?? stored.startedAt;
  return [...stored.canvas, ...canvasFrames(stored.events)]
    .map((f) => ({ ms: f.at - zero, nodeId: f.nodeId, dataUrl: f.dataUrl }))
    .sort((a, b) => a.ms - b.ms);
};

// The last picture taken of each canvas at or before the playhead: what
// those canvases were showing when the recording was there.
export function framesAt(frames: PaintFrame[], ms: number): PaintFrame[] {
  const latest = new Map<number, PaintFrame>();
  for (const f of frames) {
    if (f.ms > ms) break;
    latest.set(f.nodeId, f);
  }
  return [...latest.values()];
}
