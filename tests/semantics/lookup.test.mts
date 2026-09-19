// Finding an element's meaning, deterministically. The ladder is the one
// the page climbs to find an annotated element again, for the same
// reason: the handles a person wrote mean more than the ones a renderer
// computed, and a handle that cannot tell two things apart is no handle.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildIndex, EMPTY_INDEX, framePath, leads, lookupFrame, lookupTarget, regionLabel } from "../../lib/semantics/lookup.ts";
import type { SemanticNode, UISemanticMap } from "../../lib/semantics/types.ts";
import type { ElementTarget } from "../../lib/trace/types.ts";
import type { FrameRef } from "../../lib/annotations/target.ts";

const frame = (over: Partial<FrameRef> = {}): FrameRef =>
  ({ frameId: null, name: null, selectorInParent: null, path: [], depth: 0, kind: "document", ...over });

const node = (over: Partial<SemanticNode> & Pick<SemanticNode, "semanticId" | "label">): SemanticNode => ({
  description: null, kind: "other", confidence: "high", ords: [1], targets: [], regionId: null, ...over,
});

const map = (over: Partial<UISemanticMap> = {}): UISemanticMap => ({
  v: 1, signature: "sig", route: "/", documentTitle: null, frame: frame(),
  documentLabel: null, documentConfidence: "high", regions: [], controls: [], truncated: false, ...over,
});

describe("the lookup ladder", () => {
  const index = buildIndex([map({
    controls: [
      node({ semanticId: "ctl_run", label: "Run the simulation", kind: "action", targets: [{ tag: "button", testid: "run", id: "go", selector: "main > button", text: "Run" }] }),
      node({ semanticId: "ctl_reset", label: "Reset", kind: "action", targets: [{ tag: "button", selector: "aside > button", text: "Reset" }] }),
    ],
  })]);

  it("prefers the handle a person wrote", () => {
    const m = lookupTarget(index, { tag: "button", testid: "run" });
    assert.equal(m?.label, "Run the simulation");
    assert.equal(m?.matchedOn, "testid");
  });

  it("falls to the id when there is no test id", () => {
    assert.equal(lookupTarget(index, { tag: "button", id: "go" })?.matchedOn, "id");
  });

  it("falls to the selector when there is neither", () => {
    assert.equal(lookupTarget(index, { tag: "button", selector: "aside > button" })?.matchedOn, "selector");
  });

  it("falls to the shape of the thing last of all", () => {
    const m = lookupTarget(index, { tag: "button", text: "Reset", selector: "somewhere > else" });
    assert.equal(m?.matchedOn, "shape");
    assert.equal(m?.label, "Reset");
  });

  it("says nothing rather than guessing", () => {
    assert.equal(lookupTarget(index, { tag: "div", selector: "nothing > like > it" }), null);
    assert.equal(lookupTarget(index, null), null);
    assert.equal(lookupTarget(EMPTY_INDEX, { tag: "button", testid: "run" }), null);
  });

  it("refuses a handle that two different named things share", () => {
    const crowded = buildIndex([map({
      controls: [
        node({ semanticId: "ctl_a", label: "First", targets: [{ tag: "button", selector: "li > button" }] }),
        node({ semanticId: "ctl_b", label: "Second", targets: [{ tag: "button", selector: "li > button" }] }),
      ],
    })]);
    assert.equal(lookupTarget(crowded, { tag: "button", selector: "li > button" }), null, "half a label is worse than none");
  });

  it("is content when one named thing owns a handle twice", () => {
    const twice = buildIndex([map({
      controls: [node({ semanticId: "ctl_a", label: "First", ords: [1, 2], targets: [{ tag: "button", selector: "li > button" }, { tag: "button", selector: "li > button" }] })],
    })]);
    assert.equal(lookupTarget(twice, { tag: "button", selector: "li > button" })?.label, "First");
  });

  it("gives the same answer every time it is asked", () => {
    const t: ElementTarget = { tag: "button", testid: "run" };
    assert.deepEqual(lookupTarget(index, t), lookupTarget(index, t));
  });
});

describe("naming a whole document", () => {
  const solution = frame({ path: ["#solution"], depth: 1, name: "solution" });
  const index = buildIndex([
    map({ documentLabel: "ROPE tutor workspace" }),
    map({ frame: solution, documentLabel: "Solution game", documentConfidence: "high" }),
  ]);

  it("names the frame the trace could only call embedded", () => {
    const m = lookupFrame(index, solution);
    assert.equal(m?.label, "Solution game");
    assert.equal(m?.matchedOn, "frame");
  });

  it("names the top document too", () => {
    assert.equal(lookupFrame(index, frame())?.label, "ROPE tutor workspace");
  });

  it("does not depend on a frame id, which is minted fresh every reload", () => {
    const reloaded = frame({ path: ["#solution"], depth: 1, frameId: "f_9999999999" });
    assert.equal(lookupFrame(index, reloaded)?.label, "Solution game");
    assert.equal(framePath(reloaded), framePath(solution));
  });

  it("says nothing for a frame it has no map of, such as a cross-origin one", () => {
    assert.equal(lookupFrame(index, frame({ path: ["#ads"], depth: 1 })), null);
    assert.equal(lookupFrame(index, null), null);
  });

  it("says nothing for a document the reading could not name", () => {
    assert.equal(lookupFrame(buildIndex([map()]), frame()), null);
  });
});

describe("what a reading is allowed to do", () => {
  it("lets a confident label lead, and keeps a weak one behind the evidence", () => {
    assert.equal(leads({ semanticId: "a", label: "A", kind: "action", confidence: "high", regionId: null, matchedOn: "testid" }), true);
    assert.equal(leads({ semanticId: "a", label: "A", kind: "action", confidence: "medium", regionId: null, matchedOn: "testid" }), true);
    assert.equal(leads({ semanticId: "a", label: "A", kind: "action", confidence: "low", regionId: null, matchedOn: "shape" }), false);
    assert.equal(leads(null), false);
  });

  it("names the region a control sits in", () => {
    const index = buildIndex([map({
      regions: [node({ semanticId: "region_solution", label: "Solution game", kind: "artifact" })],
      controls: [node({ semanticId: "ctl_generate", label: "Generate game", kind: "action", regionId: "region_solution", targets: [{ tag: "button", testid: "gen" }] })],
    })]);
    assert.equal(regionLabel(index, lookupTarget(index, { tag: "button", testid: "gen" })), "Solution game");
    assert.equal(regionLabel(index, null), null);
  });
});
