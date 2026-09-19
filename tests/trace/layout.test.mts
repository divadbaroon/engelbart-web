// The canvas layout: moments on one line in order, positions that never
// depend on what is selected, and a selected call's branches placed
// beside it without touching its neighbours.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BRANCH_GAP, BRANCH_W, CAPTION_H, CARD_GAP, COL_GAP, MOMENT_W, SPINE_GAP, layoutTrace, type Box } from "../../lib/trace/layout";

const box = (id: string, w: number, h: number): Box => ({ id, w, h });
const moments = [box("m:a", MOMENT_W, 64), box("m:b", MOMENT_W, 70), box("m:c", MOMENT_W, 78), box("m:d", MOMENT_W, 64), box("m:e", MOMENT_W, 60)];
const cards = [box("card:system", BRANCH_W, 84), box("card:history", BRANCH_W, 84), box("card:input", BRANCH_W, 60), box("card:contract", BRANCH_W, 60)];
const output = box("output", BRANCH_W, 96);

describe("layoutTrace", () => {
  it("puts the moments on one line, in order, one step apart", () => {
    const l = layoutTrace({ moments, branches: null });
    const p = (id: string) => l.positions.get(id)!;
    moments.forEach((m, i) => { assert.equal(p(m.id).x, i * (MOMENT_W + SPINE_GAP)); assert.equal(p(m.id).y, 0, "top edges level"); });
    assert.equal(l.spine.w, 5 * MOMENT_W + 4 * SPINE_GAP);
    assert.equal(l.spine.h, 78);
    assert.equal(l.context, null);
    assert.equal(l.output, null);
  });
  it("leaves every moment where it was when one is selected and grows", () => {
    const before = layoutTrace({ moments, branches: null });
    const grown = moments.map((m) => (m.id === "m:c" ? { ...m, h: 180 } : m));
    const after = layoutTrace({ moments: grown, branches: { anchor: "m:c", cards, output } });
    for (const m of moments) assert.deepEqual(after.positions.get(m.id), before.positions.get(m.id));
  });
  it("stacks the context above and to the left of the call it feeds, and hangs the output below it", () => {
    const l = layoutTrace({ moments, branches: { anchor: "m:c", cards, output } });
    const p = (id: string) => l.positions.get(id)!;
    const modelX = p("m:c").x;
    assert.equal(p("card:system").x, modelX - COL_GAP - BRANCH_W, "the stack ends a column gap short of the model");
    const stackH = 84 + 84 + 60 + 60 + 3 * CARD_GAP;
    assert.equal(p("card:system").y, -BRANCH_GAP - stackH, "the stack starts above the spine");
    assert.equal(p("card:history").y, p("card:system").y + 84 + CARD_GAP);
    assert.ok(CARD_GAP >= 20, "the cards stand apart enough to read each as its own");
    assert.equal(p("card:contract").y + 60, -BRANCH_GAP, "the lowest card ends a branch gap above the spine");
    assert.deepEqual(l.captions.context, { x: p("card:system").x, y: p("card:system").y - CAPTION_H });
    assert.equal(p("output").x, modelX + (MOMENT_W - BRANCH_W) / 2, "the output is centred under the model");
    assert.equal(p("output").y, 78 + BRANCH_GAP + CAPTION_H, "below the model's own height");
    assert.deepEqual(l.output, { x: p("output").x, y: p("output").y - CAPTION_H, w: BRANCH_W, h: 96 + CAPTION_H });
    assert.equal(l.context?.h, stackH + CAPTION_H);
  });
  it("draws a model alone when its request carried nothing to show", () => {
    const l = layoutTrace({ moments, branches: { anchor: "m:a", cards: [], output: null } });
    assert.equal(l.context, null);
    assert.equal(l.output, null);
    assert.equal(l.positions.size, moments.length);
  });
});
