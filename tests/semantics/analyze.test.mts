// What the model is shown. This is the injection boundary and the
// no-selector rule in one place: the page's own text goes in, and the
// only handle that comes back out is an ordinal. If a selector ever
// appeared in this rendering, a model could write one back that pointed
// at an element nobody surveyed.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderCandidates, SEMANTIC_MODEL } from "../../lib/semantics/analyze.ts";
import { readCandidateTree } from "../../lib/semantics/model.ts";
import { MAX_CANDIDATES } from "../../lib/semantics/types.ts";

const candidate = (ord: number, target: Record<string, unknown>, parent: number | null = null) => ({ ord, parent, target });
const tree = (over: Record<string, unknown> = {}) => readCandidateTree({
  route: "/play",
  documentTitle: "ROPE",
  frame: { frameId: "f_a1b2c3d4e5", name: "solution", path: ["#solution"], depth: 1, kind: "document" },
  candidates: [
    candidate(1, { tag: "main", role: "main", selector: "body > main" }),
    candidate(2, { tag: "textarea", editable: "text", placeholder: "Type your response", selector: "main > textarea" }, 1),
    candidate(3, { tag: "button", text: "Submit", testid: "send", selector: "main > button" }, 1),
  ],
  ...over,
})!;

describe("the page as the model sees it", () => {
  const text = renderCandidates(tree());

  it("numbers every part and shows nesting by indent", () => {
    assert.match(text, /^1\. <main> role=main$/m);
    assert.match(text, /^ {2}2\. <textarea> /m);
    assert.match(text, /^ {2}3\. <button> /m);
  });

  it("shows what a part says it is", () => {
    assert.match(text, /placeholder="Type your response"/);
    assert.match(text, /text-entry=text/);
    assert.match(text, /testid=send/);
    assert.match(text, /text="Submit"/);
  });

  it("never shows a selector", () => {
    assert.ok(!text.includes("main > textarea"), "a selector is where an element sat, not what it is");
    assert.ok(!text.includes("main > button"));
    assert.ok(!text.includes("selector="), "not under any name either");
    for (const c of tree().candidates) assert.ok(!c.target.selector || !text.includes(c.target.selector), `${c.target.selector} reached the model`);
  });

  it("says where the document is without naming the frame id", () => {
    assert.match(text, /embedded document, 1 frame inside the page, named "solution"/);
    assert.ok(!text.includes("f_a1b2c3d4e5"), "a frame id is minted per load and means nothing to a reading");
    assert.match(text, /Route: \/play/);
    assert.match(text, /Document title \(a hint, not a name\): "ROPE"/);
  });

  it("does not hand over a title the framework wrote", () => {
    // A reading named after the scaffold is not a reading. ROPE's tutor
    // calls itself "Create Next App", and the first one came back exactly
    // that, with high confidence.
    const scaffolded = renderCandidates(tree({ documentTitle: "Create Next App" }));
    assert.ok(!scaffolded.includes("Create Next App"), "the scaffold's words are not the application's");
    assert.match(scaffolded, /no title worth anything/);
    assert.ok(!renderCandidates(tree({ documentTitle: null })).includes("Document title"));
  });

  it("says when the list was cut, so a thin reading is not read as a whole one", () => {
    const many = Array.from({ length: MAX_CANDIDATES + 10 }, (_, i) => candidate(i + 1, { tag: "li", selector: `li:nth-of-type(${i + 1})` }));
    assert.match(renderCandidates(tree({ candidates: many })), /This list was cut/);
    assert.ok(!text.includes("This list was cut"));
  });

  it("asks a small model, because the work is structural", () => {
    assert.equal(SEMANTIC_MODEL, "claude-haiku-4-5-20251001");
  });
});
