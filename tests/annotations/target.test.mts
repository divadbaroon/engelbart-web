// What an annotation is fixed to, read from an untrusted page: the same
// element description the trace stores, rebuilt rather than accepted.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MAX_BODY, readAnchor, readBody, readTarget } from "../../lib/annotations/target";
import { toAnnotation, type AnnotationRow } from "../../lib/annotations/model";

const anchorOf = (v: unknown) => {
  const r = readAnchor(v);
  assert.equal(r.ok, true, r.ok ? "" : r.error);
  return r.ok ? r.anchor : null!;
};

describe("annotation target", () => {
  it("keeps the bridge's description and nothing else", () => {
    const t = readTarget({ tag: "button", selector: "main > button:nth-of-type(1)", text: "Check", classes: ["solution"], rect: { x: 1.4, y: 2.6, w: 80, h: 24 }, route: "/play", onclick: "steal()", __proto__loophole: 1 });
    assert.deepEqual(t, { tag: "button", selector: "main > button:nth-of-type(1)", text: "Check", classes: ["solution"], rect: { x: 1, y: 3, w: 80, h: 24 }, route: "/play" });
  });
  it("refuses an element it could never find again", () => {
    assert.equal(readTarget({ text: "somewhere" }), null, "no tag and no selector");
    assert.equal(readTarget("button"), null);
    assert.equal(readTarget(null), null);
    assert.match((readAnchor({ element: { text: "x" } }) as { error: string }).error, /could not be described/);
    assert.match((readAnchor(null) as { error: string }).error, /no element/);
  });
  it("caps every string and the classes", () => {
    const long = "x".repeat(4000);
    const t = readTarget({ tag: long, text: long, selector: long, classes: Array.from({ length: 30 }, () => long) })!;
    assert.equal(t.tag!.length, 64);
    assert.equal(t.text!.length, 200);
    assert.equal(t.selector!.length, 1000);
    assert.equal(t.classes!.length, 8);
    assert.equal(t.classes![0].length, 64);
  });
  it("keeps where a link points and drops what it carries", () => {
    assert.equal(readTarget({ tag: "a", href: "/solution?token=62cc368c&id=3" })!.href, "/solution?…");
    assert.equal(readTarget({ tag: "a", href: "/solution#part-2" })!.href, "/solution#part-2");
    assert.equal(readTarget({ tag: "form", action: "/submit?key=abc" })!.action, "/submit?…");
  });
  it("takes three ancestors, and a frame it recognises", () => {
    const a = anchorOf({
      element: { tag: "canvas", selector: "canvas" },
      ancestors: [{ tag: "section" }, { tag: "main" }, { tag: "body" }, { tag: "html" }],
      frame: { frameId: "f_a1b2c3d4e5", name: "Solution", path: ["main > iframe", "iframe:nth-of-type(2)"], depth: 2, kind: "document" },
      route: "/play", documentTitle: "ROPE",
    });
    assert.deepEqual(a.ancestors.map((t) => t.tag), ["section", "main", "body"]);
    assert.equal(a.frame.frameId, "f_a1b2c3d4e5");
    assert.equal(a.frame.depth, 2);
    assert.deepEqual(a.frame.path, ["main > iframe", "iframe:nth-of-type(2)"], "every frame from the top document down to this one");
    assert.equal(a.frame.selectorInParent, "iframe:nth-of-type(2)", "and the last of them is where it sits in its parent");
  });
  it("throws away a frame id that is not one, and keeps the durable part", () => {
    const a = anchorOf({ element: { tag: "div", selector: "div" }, frame: { frameId: "'; drop table", name: "Solution", depth: 99, kind: "made-up" } });
    assert.equal(a.frame.frameId, null, "the id is minted per document and is never trusted from the page");
    assert.equal(a.frame.name, "Solution");
    assert.equal(a.frame.depth, 10);
    assert.equal(a.frame.kind, "document");
  });
  it("falls back to the element's own route", () => {
    assert.equal(anchorOf({ element: { tag: "div", selector: "div", route: "/play" } }).route, "/play");
    assert.equal(anchorOf({ element: { tag: "div", selector: "div" } }).route, null);
  });
  it("wants a note, and not an essay", () => {
    assert.deepEqual(readBody("  Why here?  "), { ok: true, body: "Why here?" });
    assert.equal(readBody("   ").ok, false);
    assert.equal(readBody(null).ok, false);
    assert.equal(readBody("x".repeat(MAX_BODY)).ok, true);
    assert.match((readBody("x".repeat(MAX_BODY + 1)) as { error: string }).error, /too long/);
  });
});

describe("annotation rows", () => {
  const row: AnnotationRow = {
    id: "a1", project_id: "p1", repo_id: "r1", run_id: null, recording_id: null, user_id: "u1",
    body: "Why does the tutor say this?", anchor: { element: { tag: "p", selector: "main > p:nth-of-type(1)" } },
    route: "/play", commit_sha: "abc1234", stage_id: "stage:i-9", call_id: null,
    created_at: "2026-09-19T00:00:00.000Z", updated_at: "2026-09-19T00:00:00.000Z",
  };
  it("keeps the note when the anchor cannot be read", () => {
    const a = toAnnotation({ ...row, anchor: "wat" });
    assert.equal(a.body, row.body, "the note is the part that matters");
    assert.deepEqual(a.anchor.element, {}, "and an empty element resolves to nothing rather than to the wrong thing");
  });
  it("names the context without claiming it caused anything", () => {
    const a = toAnnotation(row);
    assert.equal(a.commitSha, "abc1234");
    assert.equal(a.stageId, "stage:i-9");
    assert.equal(a.runId, null, "a note outlives the run it was written in");
  });
});
