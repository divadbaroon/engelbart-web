// What the panel over the canvas offers to ask about, and what actually
// travels with the question: the kind of the selected moment in the
// placeholder, and nothing but identity on the wire.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { frameIndex, traceRows, traceStages } from "../../lib/trace/timeline";
import { askPlaceholder, toSelectionRef } from "../../lib/bart/labels";
import { readSession } from "../../lib/activity/read";
import { events } from "../trace/fixtures/session";

describe("bart labels", () => {
  const { primary } = traceStages(traceRows(events, []));
  const [page, game, submit, call, response] = primary;
  const frames = frameIndex(events);
  const episodes = readSession({ stages: primary, frames, events });
  const over = (stage: { id: string }) => episodes.filter((e) => e.stageIds.includes(stage.id));

  it("names the kind of moment the question is about", () => {
    assert.equal(askPlaceholder(null), "Ask Bart about this run…", "nothing selected: the run");
    assert.equal(askPlaceholder(call), "Ask Bart about this model call…");
    assert.equal(askPlaceholder(response), "Ask Bart about this response…");
    assert.equal(askPlaceholder(submit), "Ask Bart about this interaction…");
    assert.equal(askPlaceholder(page), "Ask Bart about this interaction…");
    assert.equal(askPlaceholder(game), "Ask Bart about this interaction…");
  });

  it("names what the person was doing, when the reading says", () => {
    // "this interaction" is what a stage can offer. A submit stage is the
    // writing of a message and then the sending of it, and the two are
    // different things to ask about, so the reading names which.
    const parts = over(submit);
    assert.ok(parts.length > 1, "the submit stage is more than one thing");
    const said = parts.map((e) => askPlaceholder(submit, e));
    assert.equal(new Set(said).size, said.length, `each part is offered as itself: ${said.join(" | ")}`);
    assert.ok(said.includes("Ask Bart about this action…"), `the send is an action: ${said.join(" | ")}`);
    for (const s of said) assert.notEqual(s, "Ask Bart about this interaction…", "the stage's own wording is no longer what is offered");
  });

  it("keeps the words off the wire, and sends which reading was chosen", () => {
    assert.equal(toSelectionRef(null), null);
    assert.deepEqual(toSelectionRef({ kind: "stage", stageId: submit.id }), { stageId: submit.id, callId: null, episodeId: null });
    const chosen = over(submit).at(-1)!;
    const ref = toSelectionRef({ kind: "stage", stageId: submit.id, episodeId: chosen.id });
    assert.deepEqual(ref, { stageId: submit.id, callId: null, episodeId: chosen.id });
    // The whole point of the episode id: it is a name, not a sentence.
    // What the screen says about the moment must be arrived at again by
    // the route, from the events, and never carried by the question.
    const wire = JSON.stringify(ref);
    for (const word of [chosen.description, chosen.subBehavior, chosen.because, chosen.broadBehavior]) {
      assert.ok(!wire.includes(word), `${word} travelled with the question`);
    }
    assert.deepEqual(
      toSelectionRef({ kind: "call", callId: "mc_1", jump: { pane: "output", focus: "output" } }),
      { stageId: null, callId: "mc_1", episodeId: null },
      "the pane is where the drawer opens, not part of the question",
    );
  });
});
