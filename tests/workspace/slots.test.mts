// A tab is shown in one place; the preview and the terminal never leave
// the middle; a remembered pair is made consistent on restore.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { REPO_TABS, canSide, chooseTab, closeSide, isRepoTab, normalize, sendAside, showTab, sideToMiddle, staysReason, type RepoTab, type Slots } from "../../lib/workspace-slots";

describe("workspace slots", () => {
  const start: Slots = { middle: "trace", side: null };

  it("sends a tab to the side and drops the middle back to the preview", () => {
    assert.deepEqual(sendAside(start, "trace"), { middle: "preview", side: "trace" });
    assert.deepEqual(sendAside({ middle: "readme", side: null }, "code"), { middle: "readme", side: "code" });
    assert.deepEqual(sendAside({ middle: "readme", side: "code" }, "notes"), { middle: "readme", side: "notes" }, "one side tab at a time");
  });
  it("keeps the preview and the terminal in the middle, with a reason", () => {
    assert.deepEqual(sendAside({ middle: "preview", side: null }, "preview"), { middle: "preview", side: null });
    assert.deepEqual(sendAside({ middle: "terminal", side: "trace" }, "terminal"), { middle: "terminal", side: "trace" });
    assert.equal(canSide("trace"), true);
    assert.equal(canSide("preview"), false);
    assert.match(staysReason("preview")!, /reload/);
    assert.match(staysReason("terminal")!, /shell/);
    assert.equal(staysReason("code"), null);
  });
  it("brings a side tab back when it is chosen in the middle", () => {
    assert.deepEqual(chooseTab({ middle: "preview", side: "trace" }, "trace"), { middle: "trace", side: null });
    assert.deepEqual(chooseTab({ middle: "preview", side: "trace" }, "code"), { middle: "code", side: "trace" });
  });
  it("shows a tab in the middle unless it is already on the side", () => {
    assert.deepEqual(showTab({ middle: "preview", side: "trace" }, "trace"), { middle: "preview", side: "trace" });
    assert.deepEqual(showTab({ middle: "preview", side: "trace" }, "code"), { middle: "code", side: "trace" });
  });
  it("closes the side, or moves it to the middle", () => {
    assert.deepEqual(closeSide({ middle: "preview", side: "trace" }), { middle: "preview", side: null });
    assert.deepEqual(sideToMiddle({ middle: "preview", side: "trace" }), { middle: "trace", side: null });
    assert.deepEqual(sideToMiddle(start), start);
  });
  it("leaves Bart out: it is the right panel's own tab, not one of these", () => {
    assert.equal(REPO_TABS.includes("bart" as RepoTab), false);
    assert.equal(isRepoTab("bart"), false);
    assert.deepEqual(normalize("bart", "bart"), { middle: "readme", side: null }, "a remembered Bart tab is not a place a tab can be");
  });
  it("normalizes what was remembered", () => {
    assert.deepEqual(normalize("trace", "trace"), { middle: "preview", side: "trace" });
    assert.deepEqual(normalize("code", "preview"), { middle: "code", side: null });
    assert.deepEqual(normalize("bogus", undefined), { middle: "readme", side: null });
    assert.deepEqual(normalize("readme", "notes"), { middle: "readme", side: "notes" });
  });
});
