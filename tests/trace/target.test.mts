// The canonical element description the trace and interface annotations
// share: which key on an event holds it, and what is not an element.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { elementTarget, targetOf, type ElementTarget, type TraceEvent } from "../../lib/trace/types";

const event = (kind: string, data: Record<string, unknown> | null): TraceEvent => ({
  id: 1, runId: "r", seq: 1, at: "2026-09-19T00:00:00.000Z", receivedAt: "2026-09-19T00:00:00.000Z",
  source: "browser", kind, interactionId: null, requestId: null, callId: null, correlation: null, data,
});

describe("element target", () => {
  const button: ElementTarget = { tag: "button", text: "Send", selector: "form > button:nth-of-type(1)" };
  const span: ElementTarget = { tag: "span", text: "Send", selector: "form > button:nth-of-type(1) > span:nth-of-type(1)" };

  it("takes the element the event is named for, whichever key holds it", () => {
    assert.deepEqual(targetOf(event("ui.click", { control: button, target: span })), button, "the control, not what was under the pointer");
    assert.deepEqual(targetOf(event("ui.click", { target: span })), span, "a click with no control is about what was clicked");
    assert.deepEqual(targetOf(event("ui.submit", { submitter: button, form: { tag: "form" } })), button);
    assert.deepEqual(targetOf(event("ui.submit", { form: { tag: "form" } })), { tag: "form" }, "a form submitted without a submitter");
    assert.deepEqual(targetOf(event("ui.change", { container: { tag: "main" } })), { tag: "main" });
    assert.deepEqual(targetOf(event("ui.input", { target: button })), button);
    assert.deepEqual(targetOf(event("ui.key", { target: button })), button);
    assert.deepEqual(targetOf(event("ui.focus", { target: button })), button);
  });
  it("has no element where there is none", () => {
    assert.equal(targetOf(event("ui.route", { from: "/", to: "/play" })), null, "a navigation is about a route");
    assert.equal(targetOf(event("ui.click", null)), null);
    assert.equal(targetOf(event("ui.click", {})), null);
    assert.equal(targetOf(event("network.request", { url: "/api" })), null);
  });
  it("refuses anything that is not an object", () => {
    for (const v of [null, undefined, "button", 7, true, [{ tag: "button" }]]) assert.equal(elementTarget(v), null);
    assert.deepEqual(elementTarget({ tag: "canvas", size: "800x600" }), { tag: "canvas", size: "800x600" });
  });
  it("keeps the fields the bridge records and the type used to drop", () => {
    // classes, disabled, rect and route were written to the database and
    // named nowhere; a reader that wants them has them now.
    const full: ElementTarget = { tag: "canvas", classes: ["board"], disabled: false, rect: { x: 12, y: 40, w: 300, h: 600 }, route: "/play" };
    assert.deepEqual(targetOf(event("ui.click", { target: full })), full);
  });
});
