// When is an interface a different interface? The policy under test is a
// heuristic on purpose, so these cases are written as the behaviour we
// want rather than as the implementation: content churns and must not
// count, names are names and must.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_POLICY, diffSignature, isControl, sayDiff, signatureOf, signatureParts } from "../../lib/semantics/signature.ts";
import type { CandidateTree, Candidate } from "../../lib/semantics/types.ts";
import type { ElementTarget } from "../../lib/trace/types.ts";

const frame = { frameId: null, name: null, selectorInParent: null, path: [] as string[], depth: 0, kind: "document" as const };
const c = (ord: number, target: ElementTarget, parent: number | null = null): Candidate => ({ ord, parent, target });
const tree = (candidates: Candidate[], over: Partial<CandidateTree> = {}): CandidateTree =>
  ({ route: "/", documentTitle: "ROPE", frame, candidates, truncated: false, ...over });

// A tutor panel with a conversation in it, a place to answer, and a
// button — the shape of the thing, minus anything anyone said.
const page = (over: { said?: string; button?: string; extra?: Candidate[] } = {}) => tree([
  c(1, { tag: "main", role: "main", selector: "main" }),
  c(2, { tag: "section", label: "Tutor", selector: "main > section" }, 1),
  c(3, { tag: "div", role: "log", label: "Conversation", text: over.said ?? "Hello there", selector: "section > div" }, 2),
  c(4, { tag: "textarea", editable: "textarea", placeholder: "Type your response", selector: "section > textarea" }, 2),
  c(5, { tag: "button", type: "submit", text: over.button ?? "Submit", selector: "section > button" }, 2),
  ...(over.extra ?? []),
]);

describe("what counts as a control", () => {
  it("counts the elements whose text is their name", () => {
    for (const t of [{ tag: "button" }, { tag: "a" }, { tag: "summary" }, { tag: "div", role: "tab" }, { tag: "input", type: "text" }, { tag: "div", editable: "contenteditable" }]) {
      assert.equal(isControl(t as ElementTarget), true, `${JSON.stringify(t)} should be a control`);
    }
  });
  it("does not count the elements whose text is their content", () => {
    for (const t of [{ tag: "div", role: "log" }, { tag: "section" }, { tag: "main", role: "main" }, { tag: "p" }]) {
      assert.equal(isControl(t as ElementTarget), false, `${JSON.stringify(t)} should not be a control`);
    }
  });
});

describe("the interface signature", () => {
  it("does not move when the conversation does", () => {
    const before = signatureOf(page({ said: "Hello there" }));
    const after = signatureOf(page({ said: "A completely different message, and then several more" }));
    assert.equal(after.signature, before.signature, "what is said in a log is content, not the interface");
    assert.deepEqual(diffSignature(before.parts, after.parts).changed, []);
  });

  it("moves when a button is renamed", () => {
    const before = signatureOf(page({ button: "Submit" }));
    const after = signatureOf(page({ button: "Send response" }));
    assert.notEqual(after.signature, before.signature, "a button's text is its name");
    const d = diffSignature(before.parts, after.parts);
    assert.equal(d.changed.length, 1);
    assert.match(d.changed[0].before, /Submit/);
    assert.match(d.changed[0].after, /Send response/);
    assert.match(sayDiff(d), /1 changed/);
  });

  it("moves when a control appears, and says which", () => {
    const before = signatureOf(page());
    const after = signatureOf(page({ extra: [c(6, { tag: "button", text: "Generate Game", selector: "section > button" }, 2)] }));
    assert.notEqual(after.signature, before.signature);
    const d = diffSignature(before.parts, after.parts);
    assert.equal(d.added.length, 1);
    assert.match(d.added[0], /Generate Game/);
    assert.equal(d.removed.length, 0);
  });

  it("moves when a control is taken away", () => {
    const full = page();
    const fewer = tree(full.candidates.filter((x) => x.ord !== 5));
    const d = diffSignature(signatureOf(full).parts, signatureOf(fewer).parts);
    assert.equal(d.removed.length, 1);
    assert.match(d.removed[0], /Submit/);
  });

  it("does not move when a class is regenerated under the same element", () => {
    const withClass = tree(page().candidates.map((x) => (x.ord === 5 ? c(5, { ...x.target, classes: ["css-1a2b3c"] }, 2) : x)));
    assert.equal(signatureOf(withClass).signature, signatureOf(page()).signature, "classes are not part of the signature at all");
  });

  it("does not move when a selector shifts under an element that kept its test id", () => {
    const at = (selector: string) => tree([c(1, { tag: "button", testid: "run", text: "Run", selector })]);
    assert.equal(signatureOf(at("div:nth-of-type(2) > button")).signature, signatureOf(at("div:nth-of-type(5) > button")).signature);
  });

  it("moves when an element loses the handle that named it", () => {
    const withId = tree([c(1, { tag: "button", testid: "run", text: "Run", selector: "button" })]);
    const without = tree([c(1, { tag: "button", text: "Run", selector: "button" })]);
    assert.notEqual(signatureOf(withId).signature, signatureOf(without).signature, "losing a test id is a real change");
  });

  it("moves when the route does", () => {
    assert.notEqual(signatureOf(page(), DEFAULT_POLICY).signature, signatureOf(tree(page().candidates, { route: "/solve" })).signature);
  });

  it("is blind to a query string, because the bridge already reduced it", () => {
    const a = tree(page().candidates, { route: "/play?…" });
    const b = tree(page().candidates, { route: "/play?…" });
    assert.equal(signatureOf(a).signature, signatureOf(b).signature);
  });

  it("notices a control that moved to another parent", () => {
    const moved = tree(page().candidates.map((x) => (x.ord === 5 ? c(5, x.target, 1) : x)));
    assert.notEqual(signatureOf(moved).signature, signatureOf(page()).signature);
  });
});

describe("the policy is a knob, not a law", () => {
  it("counts every word when asked to, which a conversation then invalidates", () => {
    const loud = { ...DEFAULT_POLICY, namingText: "all" as const };
    const before = signatureOf(page({ said: "Hello there" }), loud);
    const after = signatureOf(page({ said: "Something else entirely" }), loud);
    assert.notEqual(after.signature, before.signature, "this is the failure mode the default exists to avoid");
  });

  it("counts no words when asked to, and then misses a rename", () => {
    const deaf = { ...DEFAULT_POLICY, namingText: "none" as const };
    assert.equal(signatureOf(page({ button: "Submit" }), deaf).signature, signatureOf(page({ button: "Send" }), deaf).signature);
  });

  it("can be told to care about selectors, and then churns with them", () => {
    const picky = { ...DEFAULT_POLICY, selectorValue: true };
    // Only where there is no better handle: a test id is consulted first
    // whatever the policy says, which is why the default costs nothing on
    // a page that labels its own elements.
    const at = (selector: string) => tree([c(1, { tag: "button", text: "Run", selector })]);
    assert.notEqual(signatureOf(at("div > button"), picky).signature, signatureOf(at("span > button"), picky).signature);
    assert.equal(signatureOf(at("div > button")).signature, signatureOf(at("span > button")).signature, "and the default does not");
    const named = (selector: string) => tree([c(1, { tag: "button", testid: "run", text: "Run", selector })]);
    assert.equal(signatureOf(named("div > button"), picky).signature, signatureOf(named("span > button"), picky).signature, "a test id outranks the selector either way");
  });
});

describe("telling two surveys apart", () => {
  it("compares repeated shapes one to one instead of collapsing them", () => {
    const rows = (n: number) => tree(Array.from({ length: n }, (_, i) => c(i + 1, { tag: "li", selector: "li" })));
    const d = diffSignature(signatureParts(rows(3)), signatureParts(rows(5)));
    assert.equal(d.same, 3);
    assert.equal(d.added.length, 2, "two more list items, not one changed entry");
  });

  it("says plainly when nothing it covers moved", () => {
    const d = diffSignature(signatureParts(page({ said: "a" })), signatureParts(page({ said: "b" })));
    assert.match(sayDiff(d), /^Nothing the signature covers moved; 5 candidates matched\.$/);
  });
});
