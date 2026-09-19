// What the panel over the canvas offers to ask about, and what actually
// travels with the question: the kind of the selected moment in the
// placeholder, and nothing but identity on the wire.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { traceRows, traceStages } from "../../lib/trace/timeline";
import { askPlaceholder, toSelectionRef } from "../../lib/bart/labels";
import { events } from "../trace/fixtures/session";

describe("bart labels", () => {
  const { primary } = traceStages(traceRows(events, []));
  const [page, game, submit, call, response] = primary;

  it("names the kind of moment the question is about", () => {
    assert.equal(askPlaceholder(null), "Ask Bart about this run…", "nothing selected: the run");
    assert.equal(askPlaceholder(call), "Ask Bart about this model call…");
    assert.equal(askPlaceholder(response), "Ask Bart about this response…");
    assert.equal(askPlaceholder(submit), "Ask Bart about this interaction…");
    assert.equal(askPlaceholder(page), "Ask Bart about this interaction…");
    assert.equal(askPlaceholder(game), "Ask Bart about this interaction…");
  });

  it("sends the selection as identity, never as the words on the screen", () => {
    assert.equal(toSelectionRef(null), null);
    assert.deepEqual(toSelectionRef({ kind: "stage", stageId: submit.id }), { stageId: submit.id, callId: null });
    assert.deepEqual(
      toSelectionRef({ kind: "call", callId: "mc_1", jump: { pane: "output", focus: "output" } }),
      { stageId: null, callId: "mc_1" },
      "the pane is where the drawer opens, not part of the question",
    );
  });
});
