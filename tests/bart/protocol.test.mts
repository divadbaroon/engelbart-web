// An answer names its evidence by identity: tokens parse to references,
// references print back to the same tokens, and a token becomes a link
// the renderer can dispatch.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { linkRefs, parseRef, plainRefLabel, refFromHref, refToken, refsIn, sameRef, type Ref } from "../../lib/bart/protocol";

describe("bart protocol", () => {
  const text = "You submitted text [[moment:stage:i_page000001_8]], then the tutor asked [[call:mc_1:output]]; see [[file:system/app/action.ts#L12-L40]] and [[readme]]. Again [[moment:stage:i_page000001_8]].";

  it("finds every reference once, in order", () => {
    const refs = refsIn(text);
    assert.deepEqual(refs, [
      { kind: "moment", stageId: "stage:i_page000001_8" },
      { kind: "call", callId: "mc_1", pane: "output" },
      { kind: "file", path: "system/app/action.ts", from: 12, to: 40 },
      { kind: "readme" },
    ]);
  });
  it("prints a reference back to the token it came from", () => {
    for (const ref of refsIn(text)) assert.deepEqual(parseRef(...tokenParts(refToken(ref))), ref);
    assert.equal(refToken({ kind: "call", callId: "mc_1", pane: null }), "[[call:mc_1]]");
    assert.equal(refToken({ kind: "file", path: "README.md", from: 3, to: null }), "[[file:README.md#L3]]");
  });
  it("keeps a call id whole when no pane follows it", () => {
    assert.deepEqual(parseRef("call", "mc_1"), { kind: "call", callId: "mc_1", pane: null });
    assert.deepEqual(parseRef("call", "mc_1:messages"), { kind: "call", callId: "mc_1", pane: "messages" });
    assert.deepEqual(parseRef("call", "mc_1:nonsense"), { kind: "call", callId: "mc_1:nonsense", pane: null });
    assert.deepEqual(parseRef("call", "mc_1:system"), { kind: "call", callId: "mc_1", pane: "context" }, "a tool part names its pane");
    assert.deepEqual(parseRef("call", "mc_1:raw_response"), { kind: "call", callId: "mc_1", pane: "raw" });
    assert.equal(parseRef("moment", ""), null);
    assert.equal(parseRef("file", "#L3"), null);
  });
  it("turns tokens into links that carry the token, and back", () => {
    const linked = linkRefs("see [[call:mc_1:output]] now", plainRefLabel);
    assert.equal(linked, "see [model call · output](ref:%5B%5Bcall%3Amc_1%3Aoutput%5D%5D) now");
    const href = /\((ref:[^)]+)\)/.exec(linked)![1];
    assert.deepEqual(refFromHref(href), { kind: "call", callId: "mc_1", pane: "output" });
    assert.equal(refFromHref("ref:nope"), null);
  });
  it("leaves a malformed token as text", () => {
    assert.equal(linkRefs("[[moment]] and [[bogus:x]]", plainRefLabel), "[[moment]] and [[bogus:x]]");
    assert.deepEqual(refsIn("[[moment]]"), []);
  });
  it("labels a reference in a few words", () => {
    assert.equal(plainRefLabel({ kind: "file", path: "a/b.ts", from: 5, to: 9 }), "a/b.ts:5–9");
    assert.equal(plainRefLabel({ kind: "readme" }), "README");
    assert.ok(sameRef(refsIn(text)[0], { kind: "moment", stageId: "stage:i_page000001_8" } as Ref));
  });
});

function tokenParts(token: string): [string, string | undefined] {
  const m = /^\[\[(\w+)(?::(.+))?\]\]$/.exec(token)!;
  return [m[1], m[2]];
}
