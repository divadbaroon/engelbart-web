// A reading enriching the trace. The invariant under test is the one the
// whole layer rests on: with a reading, a row says what a person would
// call the thing AND what the page actually held; without one, or with a
// weak one, the row is exactly what it was before any of this existed.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { describeTarget, frameIndex, frameRefOf, traceRows, type InteractionRow } from "../../lib/trace/timeline";
import { buildIndex, EMPTY_INDEX, framePath } from "../../lib/semantics/lookup";
import type { SemanticNode, UISemanticMap } from "../../lib/semantics/types";
import type { FrameRef } from "../../lib/annotations/target";
import type { TraceEvent } from "../../lib/trace/types";

const frame = (over: Partial<FrameRef> = {}): FrameRef =>
  ({ frameId: null, name: null, selectorInParent: null, path: [], depth: 0, kind: "document", ...over });

const node = (over: Partial<SemanticNode> & Pick<SemanticNode, "semanticId" | "label">): SemanticNode => ({
  description: null, kind: "other", confidence: "high", ords: [1], targets: [], regionId: null, ...over,
});

const map = (over: Partial<UISemanticMap> = {}): UISemanticMap => ({
  v: 1, signature: "sig", route: "/", documentTitle: null, frame: frame(),
  documentLabel: null, documentConfidence: "high", regions: [], controls: [], truncated: false, ...over,
});

const ev = (seq: number, kind: string, data: Record<string, unknown>): TraceEvent => ({
  id: seq, runId: "r", seq, at: `2026-09-19T10:00:0${seq}.000Z`, receivedAt: "", source: "browser", kind,
  interactionId: `i_${seq}`, requestId: null, callId: null, correlation: null, data,
});

describe("a label beside the evidence", () => {
  const m = { semanticId: "ctl_generate", label: "Generate game", kind: "action" as const, confidence: "high" as const, regionId: null, matchedOn: "testid" as const };

  it("leads with the name, and keeps what the page said inside it", () => {
    assert.equal(describeTarget({ tag: "button", text: "Submit" }, m), "Generate game (“Submit” button)");
    assert.equal(describeTarget({ tag: "textarea", id: "answer" }, m), "Generate game (textarea#answer)");
  });

  it("is the old description exactly when there is no reading", () => {
    assert.equal(describeTarget({ tag: "button", text: "Submit" }), "“Submit” (button)");
    assert.equal(describeTarget({ tag: "button", text: "Submit" }, null), "“Submit” (button)");
  });

  it("keeps a guess out of the way", () => {
    const weak = { ...m, confidence: "low" as const, matchedOn: "shape" as const };
    assert.equal(describeTarget({ tag: "button", text: "Submit" }, weak), "“Submit” (button)", "a low reading does not get in front of the evidence");
  });
});

describe("the durable handle for a document the trace saw", () => {
  const frames = frameIndex([
    ev(1, "frame.loaded", { frameId: "f_top", url: "http://x/", depth: 0 }),
    ev(2, "frame.attached", { frameId: "f_kid", parentFrameId: "f_top", selectorInParent: "#solution", name: "solution", depth: 1 }),
    ev(3, "frame.attached", { frameId: "f_deep", parentFrameId: "f_kid", selectorInParent: "main > iframe", depth: 2 }),
  ]);

  it("is the chain of iframes, not the frame id", () => {
    assert.deepEqual(frameRefOf(frames, "f_deep")?.path, ["#solution", "main > iframe"]);
    assert.equal(framePath(frameRefOf(frames, "f_kid")!), "#solution");
    assert.equal(framePath(frameRefOf(frames, "f_top")!), "top", "the top document is the top document");
  });

  it("is nothing for a frame the trace never saw", () => {
    assert.equal(frameRefOf(frames, "f_missing"), null);
    assert.equal(frameRefOf(frames, null), null);
  });
});

describe("rows carrying a reading", () => {
  const events = [
    ev(1, "frame.loaded", { frameId: "f_top", url: "http://x/", depth: 0 }),
    ev(2, "frame.attached", { frameId: "f_kid", parentFrameId: "f_top", selectorInParent: "#solution", name: "solution", depth: 1 }),
    ev(3, "ui.click", { frameId: "f_kid", target: { tag: "button", testid: "gen", text: "Submit" } }),
  ];
  const index = buildIndex([
    map({
      frame: frame({ path: ["#solution"], depth: 1, name: "solution" }),
      documentLabel: "Solution game", documentConfidence: "high",
      regions: [node({ semanticId: "region_play", label: "Play area", kind: "region" })],
      controls: [node({ semanticId: "ctl_generate", label: "Generate game", kind: "action", regionId: "region_play", targets: [{ tag: "button", testid: "gen", text: "Submit" }] })],
    }),
  ]);

  it("names the element, the area it sits in and the document it is in", () => {
    const row = traceRows(events, [], frameIndex(events), index).find((r) => r.kind === "interaction") as InteractionRow;
    assert.equal(row.semantic?.element?.label, "Generate game");
    assert.equal(row.semantic?.region, "Play area");
    assert.equal(row.semantic?.document, "Solution game");
    assert.equal(row.label, "Clicked Generate game (“Submit” button) in Solution game");
    assert.match(row.detail ?? "", /in Play area/);
    assert.equal(row.frameName, "Solution game", "the chip says what the document is, not which selector holds it");
  });

  it("is the trace as it was when nothing has been read", () => {
    const row = traceRows(events, [], frameIndex(events), EMPTY_INDEX).find((r) => r.kind === "interaction") as InteractionRow;
    assert.equal(row.semantic, null);
    assert.equal(row.label, "Clicked “Submit” (button) in embedded frame “solution”");
    const plain = traceRows(events, []).find((r) => r.kind === "interaction") as InteractionRow;
    assert.equal(plain.label, row.label, "no argument at all is the same as an empty reading");
  });

  it("keeps the raw descriptor on the event whatever the reading says", () => {
    const row = traceRows(events, [], frameIndex(events), index).find((r) => r.kind === "interaction") as InteractionRow;
    assert.deepEqual(row.event.data?.target, { tag: "button", testid: "gen", text: "Submit" }, "evidence is never rewritten");
  });

  it("says nothing about an element the reading does not cover", () => {
    const other = [...events.slice(0, 2), ev(3, "ui.click", { frameId: "f_kid", target: { tag: "a", text: "Help", selector: "footer > a" } })];
    const row = traceRows(other, [], frameIndex(other), index).find((r) => r.kind === "interaction") as InteractionRow;
    assert.equal(row.semantic?.element, null);
    assert.equal(row.semantic?.document, "Solution game", "the document is still named");
    assert.equal(row.label, "Clicked “Help” (link) in Solution game");
  });
});
