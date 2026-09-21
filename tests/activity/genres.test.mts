// Four genres of software, none of them real, none of them named.
//
// ROPE is turn-taking, and a segmenter tuned on it learns the shape of
// turn-taking: it cuts at submissions, at model calls, at documents
// changing and at long silences. Software that has none of those — a map,
// a plot, a simulation, an editor whose run button is not a form — used to
// arrive as one stretch however long the session, because nothing in it
// could ever be a boundary.
//
// So: four sessions built from event shapes alone, run through the real
// pipeline, judged only on where the cuts fall. No artifact appears here.
// A control is "control-a", a panel is "panel", and the taxonomy's only
// contribution is which controls are deeds — which is exactly the
// contribution a generated profile makes.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { frameIndex, traceRows, traceStages } from "../../lib/trace/timeline.ts";
import { toTraceEvent, type TraceEventRow } from "../../lib/trace/types.ts";
import { windows, DEFAULT_SEGMENTATION, type Deliberate, type Segmentation } from "../../lib/activity/segment.ts";

const FRAME = "f_genre";
const T0 = Date.parse("2026-01-01T00:00:00.000Z");
const iso = (s: number) => new Date(T0 + Math.round(s * 1000)).toISOString();

// A session, written as seconds and what happened. Everything goes
// through frameIndex → traceRows → traceStages → windows, so these are
// judged by the code the application runs.
type Act = { at: number; kind: string; data: Record<string, unknown>; act?: boolean; requestId?: string };
function session(acts: Act[]) {
  let seq = 0;
  let interaction = 0;
  const rows: TraceEventRow[] = [{
    id: ++seq, run_id: "genre", seq, at: iso(0), received_at: iso(0), source: "browser", kind: "frame.loaded",
    interaction_id: null, request_id: null, call_id: null, correlation: null,
    data: { frameId: FRAME, url: "/app", title: "A", embedded: false, depth: 0, readyState: "complete" },
  }];
  let latest: string | null = null;
  for (const a of [...acts].sort((x, y) => x.at - y.at)) {
    // An act mints an interaction; an effect is correlated to the last one.
    const isAct = a.act ?? (a.kind !== "ui.change" && !a.kind.startsWith("network."));
    if (isAct) latest = `i_${++interaction}`;
    rows.push({
      id: ++seq, run_id: "genre", seq, at: iso(a.at), received_at: iso(a.at),
      source: a.kind.startsWith("network.") ? "preview-gateway" : "browser", kind: a.kind,
      interaction_id: a.kind.startsWith("network.") ? latest : latest,
      request_id: a.requestId ?? null, call_id: null,
      correlation: isAct ? null : "temporal",
      data: { frameId: FRAME, ...a.data },
    });
  }
  const events = rows.map(toTraceEvent);
  const frames = frameIndex(events);
  return { events, frames, stages: traceStages(traceRows(events, [], frames)).primary };
}

// What was clicked, wheeled or typed into, by the name a profile gave it.
const on = (id: string, extra: Record<string, unknown> = {}) =>
  ({ control: { tag: "button", selector: `.${id}`, classes: [id] }, target: { tag: "span", selector: `.${id} > span` }, ...extra });
const changed = (where: string, text: string[]) =>
  ({ mutations: 40, addedNodes: 30, removedNodes: 2, textChanges: 1, attributeChanges: 0, durationMs: 120, added: text,
     container: { tag: "div", selector: `.${where}`, classes: [where] } });

// The taxonomy's whole contribution to segmentation: which controls are
// deeds, and what they are called. A generated profile supplies exactly
// this and nothing else.
const deeds = (...ids: string[]): Deliberate => (events) => {
  const hit: string[] = [];
  for (const e of events) {
    const d = (e.data ?? {}) as Record<string, unknown>;
    for (const where of [d.control, d.target]) {
      const classes = (where as { classes?: string[] } | null)?.classes ?? [];
      for (const id of ids) if (classes.includes(id) && !hit.includes(id)) hit.push(id);
    }
  }
  return hit.length ? hit.sort().join("+") : null;
};

const cut = (s: ReturnType<typeof session>, isMoment: Deliberate, over: Partial<Segmentation> = {}) =>
  windows(s.stages, s.frames, { ...DEFAULT_SEGMENTATION, ...over }, isMoment)
    .map((w) => ({
      kind: w.kind,
      from: Math.round((Date.parse(w.startedAt) - T0) / 1000),
      to: Math.round((Date.parse(w.endedAt) - T0) / 1000),
      deed: isMoment([...w.transitions, ...w.parts].flatMap((p) => p.events)),
      acts: [...w.transitions, ...w.parts].flatMap((p) => p.events).filter((e) => e.kind !== "ui.change").length,
    }));

describe("a deed can begin a stretch", () => {
  it("clusters the same deed done again and again into one", () => {
    // A slider committed three times inside a second and a half is one
    // person moving one slider, not three decisions.
    const s = session([
      { at: 10, kind: "ui.input", data: { target: { tag: "input", selector: ".control-a", classes: ["control-a"] }, editing: true, edits: 3, kind: "text" } },
      { at: 10.5, kind: "ui.input", data: { target: { tag: "input", selector: ".control-a", classes: ["control-a"] }, editing: true, edits: 2, kind: "text" } },
      { at: 11.2, kind: "ui.input", data: { target: { tag: "input", selector: ".control-a", classes: ["control-a"] }, commit: true, kind: "text" } },
      { at: 11.4, kind: "ui.change", data: changed("panel", ["42"]) },
    ]);
    const list = cut(s, deeds("control-a")).filter((w) => w.kind === "activity");
    assert.equal(list.length, 1, JSON.stringify(list));
    assert.equal(list[0].acts, 3);
  });

  it("keeps different deeds apart, however alike they look", () => {
    // Three controls of the same shape, seconds apart, each answered by
    // the interface. Three things somebody did.
    const s = session([
      { at: 10, kind: "ui.click", data: on("control-a") },
      { at: 10.3, kind: "ui.change", data: changed("panel", ["a"]) },
      { at: 16, kind: "ui.click", data: on("control-b") },
      { at: 16.3, kind: "ui.change", data: changed("panel", ["b"]) },
      { at: 22, kind: "ui.click", data: on("control-c") },
      { at: 22.3, kind: "ui.change", data: changed("panel", ["c"]) },
    ]);
    const list = cut(s, deeds("control-a", "control-b", "control-c")).filter((w) => w.kind === "activity");
    assert.equal(list.length, 3, JSON.stringify(list));
    assert.deepEqual(list.map((w) => w.deed), ["control-a", "control-b", "control-c"]);
  });

  it("does not spend a row on a doorway", () => {
    // Something opened and something inside it was chosen a fifth of a
    // second later. The opening changed nothing on screen and was over
    // before it could be a stretch: it is how they got to the choice.
    const s = session([
      { at: 10, kind: "ui.click", data: on("control-a") },
      { at: 10.2, kind: "ui.click", data: on("control-b") },
      { at: 10.5, kind: "ui.change", data: changed("panel", ["chosen"]) },
      { at: 18, kind: "ui.click", data: on("control-c") },
      { at: 18.3, kind: "ui.change", data: changed("panel", ["next"]) },
    ]);
    const list = cut(s, deeds("control-a", "control-b", "control-c")).filter((w) => w.kind === "activity");
    assert.equal(list.length, 2, JSON.stringify(list));
    assert.equal(list[0].deed, "control-a+control-b");
    assert.equal(list[0].acts, 2);
  });

  it("keeps what a deed caused with the deed", () => {
    // The output of a run belongs to the run, not to whatever somebody
    // did next. This is the one that decides whether a timeline reads as
    // cause and effect or as effect and cause.
    const s = session([
      { at: 10, kind: "ui.click", data: on("control-a") },
      { at: 11, kind: "ui.change", data: changed("output", ["first result"]) },
      { at: 13, kind: "ui.change", data: changed("output", ["still going"]) },
      { at: 16, kind: "ui.change", data: changed("output", ["done"]) },
      { at: 24, kind: "ui.click", data: on("control-b") },
      { at: 25, kind: "ui.change", data: changed("output", ["second result"]) },
    ]);
    const list = windows(s.stages, s.frames, DEFAULT_SEGMENTATION, deeds("control-a", "control-b"));
    const text = list.map((w) => w.parts.flatMap((p) => p.events).filter((e) => e.kind === "ui.change").flatMap((e) => (e.data?.added ?? []) as string[]));
    assert.deepEqual(text, [["first result", "still going", "done"], ["second result"]]);
  });

  it("marks nothing as a deed when the taxonomy names none", () => {
    // The behaviour before any of this existed: one stretch.
    const s = session([
      { at: 10, kind: "ui.click", data: on("control-a") },
      { at: 16, kind: "ui.click", data: on("control-b") },
      { at: 22, kind: "ui.click", data: on("control-c") },
    ]);
    assert.equal(cut(s, deeds()).filter((w) => w.kind === "activity").length, 1);
  });
});

describe("the four genres", () => {
  it("chat-like: type, send, wait, answer", () => {
    // The shape everything else was tuned on, and the one this pass must
    // not disturb. Composing, sending and waiting stay three stretches,
    // cut at the send by the rule that was always there; the deed
    // cutting does not reach inside a stage that sends something.
    const box = { tag: "textarea", selector: ".compose", classes: ["compose"], editable: "text" };
    const s = session([
      { at: 10, kind: "ui.click", data: { target: box } },
      { at: 12, kind: "ui.key", data: { target: box, key: "[printable]", class: "letter", count: 40, editable: "text" } },
      { at: 18, kind: "ui.key", data: { target: box, key: "Enter", editable: "text" } },
      { at: 18.1, kind: "network.request", requestId: "r1", data: { method: "POST", path: "/api/say", category: "api" } },
      { at: 18.2, kind: "ui.change", data: changed("thread", ["what the person sent"]) },
      { at: 21.9, kind: "network.response", requestId: "r1", data: { status: 200, latencyMs: 3800 } },
      { at: 22, kind: "ui.change", data: changed("thread", ["what came back"]) },
    ]);
    const roles = windows(s.stages, s.frames, DEFAULT_SEGMENTATION, deeds("compose")).map((w) => w.parts.map((p) => p.role).join("+"));
    assert.deepEqual(roles, ["compose", "submit", "wait"], roles.join(" | "));
  });

  it("editor-like: edit, run, the result changes", () => {
    const editor = { tag: "div", selector: ".editor", classes: ["editor"], editable: "richtext" };
    const s = session([
      { at: 5, kind: "ui.input", data: { target: editor, editing: true, edits: 9, kind: "text" } },
      { at: 9, kind: "ui.input", data: { target: editor, editing: true, edits: 6, kind: "text" } },
      { at: 14, kind: "ui.click", data: on("control-run") },
      { at: 15, kind: "ui.change", data: changed("output", ["3 passed"]) },
      { at: 30, kind: "ui.input", data: { target: editor, editing: true, edits: 4, kind: "text" } },
      { at: 34, kind: "ui.click", data: on("control-run") },
      { at: 35, kind: "ui.change", data: changed("output", ["4 passed"]) },
    ]);
    const list = cut(s, deeds("control-run")).filter((w) => w.kind === "activity");
    // Editing, running, editing again, running again: four stretches, and
    // each result sits with the run that produced it.
    assert.equal(list.length, 4, JSON.stringify(list));
    assert.deepEqual(list.map((w) => w.deed), [null, "control-run", null, "control-run"]);
  });

  it("simulation-like: set a parameter, run, look, set it again, run again", () => {
    const knob = { tag: "input", selector: ".control-p", classes: ["control-p"], type: "range" };
    const s = session([
      { at: 4, kind: "ui.input", data: { target: knob, editing: true, edits: 7, kind: "text" } },
      { at: 8, kind: "ui.click", data: on("control-run") },
      { at: 9, kind: "ui.change", data: changed("plot", ["converged in 31"]) },
      { at: 20, kind: "ui.input", data: { target: knob, editing: true, edits: 5, kind: "text" } },
      { at: 24, kind: "ui.click", data: on("control-run") },
      { at: 25, kind: "ui.change", data: changed("plot", ["converged in 12"]) },
    ]);
    const list = cut(s, deeds("control-p", "control-run")).filter((w) => w.kind === "activity");
    assert.deepEqual(list.map((w) => w.deed), ["control-p", "control-run", "control-p", "control-run"]);
  });

  it("map-like: a gesture burst, a control, another burst, a reset", () => {
    // The genre with no submission, no model call, no second document and
    // no silence — which is to say, the genre that used to be one row.
    const canvas = { tag: "canvas", selector: ".view", classes: ["view"] };
    const s = session([
      { at: 4, kind: "ui.wheel", data: { target: canvas, count: 9, axis: "y", direction: "in", magnitude: "large", durationMs: 2600, ctrl: true } },
      { at: 8, kind: "ui.drag", data: { target: canvas, moves: 31, durationMs: 1400, distance: "long", direction: "left", button: 0 } },
      { at: 12, kind: "ui.change", data: changed("labels", ["north west"]) },
      { at: 20, kind: "ui.click", data: on("control-layer") },
      { at: 21, kind: "ui.change", data: changed("labels", ["with contours"]) },
      { at: 30, kind: "ui.wheel", data: { target: canvas, count: 6, axis: "y", direction: "out", magnitude: "medium", durationMs: 1800, ctrl: true } },
      { at: 34, kind: "ui.drag", data: { target: canvas, moves: 22, durationMs: 1100, distance: "medium", direction: "up", button: 0 } },
      { at: 40, kind: "ui.click", data: on("control-reset") },
      { at: 41, kind: "ui.change", data: changed("labels", ["home"]) },
    ]);
    const list = cut(s, deeds("control-layer", "control-reset")).filter((w) => w.kind === "activity");
    assert.deepEqual(list.map((w) => w.deed), [null, "control-layer", null, "control-reset"], JSON.stringify(list));
    // The two gesture bursts are one stretch each, not thirteen rows.
    assert.deepEqual(list.map((w) => w.acts), [2, 1, 2, 1]);
  });

  it("groups a long run of gestures rather than one row per flick", () => {
    // Twenty wheel events over forty seconds, folded by the bridge into
    // four, with nothing else happening. One stretch of moving around.
    const canvas = { tag: "canvas", selector: ".view", classes: ["view"] };
    const s = session([4, 12, 24, 36].map((at) => ({
      at, kind: "ui.wheel",
      data: { target: canvas, count: 5, axis: "y", direction: "in", magnitude: "medium", durationMs: 900, ctrl: true },
    })));
    const list = cut(s, deeds("control-a")).filter((w) => w.kind === "activity");
    assert.equal(list.length, 1, JSON.stringify(list));
    assert.equal(list[0].acts, 4);
  });
});
