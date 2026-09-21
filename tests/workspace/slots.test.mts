// Two tab bars, and which one owns what.
//
// These used to be tests about moving a tab from the middle to the side
// and back. Nothing moves now: the middle holds the work and the right
// panel holds the five companion tools, so what is left to get right is
// the routing and what a remembered layout from before the change turns
// into.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MIDDLE_TABS, PANEL_TABS, TAB_LABEL, isMiddleTab, isPanelTab, normalize, showTab, type Slots,
} from "../../lib/workspace-slots.ts";

const at = (middle: Slots["middle"], panel: Slots["panel"]): Slots => ({ middle, panel });

describe("the two bars", () => {
  it("share no surface between them", () => {
    for (const t of MIDDLE_TABS) assert.equal(isPanelTab(t), false, `${t} is a middle tab`);
    for (const t of PANEL_TABS) assert.equal(isMiddleTab(t), false, `${t} is a panel tab`);
  });

  it("name every surface they hold", () => {
    for (const t of [...MIDDLE_TABS, ...PANEL_TABS]) assert.ok(TAB_LABEL[t], `${t} has no label`);
    assert.equal(Object.keys(TAB_LABEL).length, MIDDLE_TABS.length + PANEL_TABS.length);
  });

  it("reads the panel from asking to reading, with the notes among them", () => {
    // The order is the bar, and the bar is an argument: what you say
    // about the work, then what caused what, then the session played
    // back, then what was written on it, then what somebody was doing.
    // Annotations goes after Replay rather than at the end, because a
    // note is about the thing you have just been watching.
    assert.deepEqual(PANEL_TABS, ["bart", "trace", "replay", "annotations", "activity"]);
    assert.equal(TAB_LABEL.annotations, "Annotations");
  });

  it("do not answer for a surface that no longer exists", () => {
    // "notes" was a middle tab until the goal picker it wrote against was
    // removed; "plan" was never one.
    for (const gone of ["notes", "plan", "", "__proto__"]) {
      assert.equal(isMiddleTab(gone), false);
      assert.equal(isPanelTab(gone), false);
    }
    assert.equal(isMiddleTab(undefined), false);
    assert.equal(isPanelTab(null), false);
  });
});

describe("showing a surface", () => {
  it("puts a middle tab in the middle and leaves the panel alone", () => {
    assert.deepEqual(showTab(at("preview", "trace"), "code"), at("code", "trace"));
  });

  it("puts a panel tab in the panel and leaves the middle alone", () => {
    // "Visualizer" from the running application must not take the running
    // application off the screen: that is what lets the artifact stay up
    // beside the record of it. The same holds for all five.
    for (const t of PANEL_TABS) assert.deepEqual(showTab(at("preview", "bart"), t), at("preview", t), t);
  });

  it("does not nest the companion tools under one another", () => {
    // Activity and Replay were views inside the Visualizer. Showing one
    // must now replace the Visualizer rather than leaving the panel on
    // it, or the flattening would be in the tab bar only.
    assert.deepEqual(showTab(at("preview", "trace"), "activity"), at("preview", "activity"));
    assert.deepEqual(showTab(at("preview", "trace"), "replay"), at("preview", "replay"));
  });

  it("is idempotent", () => {
    const s = at("readme", "bart");
    assert.deepEqual(showTab(showTab(s, "setup"), "setup"), at("setup", "bart"));
  });
});

describe("a layout remembered from before the change", () => {
  it("keeps a middle tab that is still a middle tab", () => {
    assert.deepEqual(normalize("code", "bart"), at("code", "bart"));
    assert.deepEqual(normalize("setup", "trace"), at("setup", "trace"));
  });

  it("moves a remembered Trace into the panel rather than losing it", () => {
    // The Trace was a middle tab. Somebody who left the workspace on it
    // comes back to it, in the place it lives now, with the running
    // application beside it.
    assert.deepEqual(normalize("trace", undefined), at("preview", "trace"));
  });

  it("prefers an explicitly remembered panel tab over one inferred from the middle", () => {
    assert.deepEqual(normalize("trace", "bart"), at("preview", "bart"));
  });

  it("sends a remembered Terminal to Setup, from either bar", () => {
    // The Terminal has been a middle tab and a panel tab, and is now a
    // section of Setup. Either memory of it lands on Setup rather than on
    // the README, and a panel tab remembered beside it is kept.
    assert.deepEqual(normalize("terminal", undefined), at("setup", "bart"));
    assert.deepEqual(normalize("terminal", "replay"), at("setup", "replay"));
    // Written in the panel's slot, it is not a panel tab any more and
    // cannot decide the middle; the panel falls back rather than guessing.
    assert.deepEqual(normalize("code", "terminal"), at("code", "bart"));
  });

  it("drops a tab that no longer exists", () => {
    assert.deepEqual(normalize("notes", undefined), at("readme", "bart"));
  });

  it("follows a tab that was renamed rather than removed", () => {
    // Environment did not go away; it became a section of Setup, so a
    // remembered "env" lands there rather than back on the README.
    assert.deepEqual(normalize("env", undefined), at("setup", "bart"));
    assert.deepEqual(normalize("env", "trace"), at("setup", "trace"));
  });

  it("keeps a remembered Visualizer, which was only ever renamed", () => {
    // The label became "Visualizer" and the key stayed `trace`, so
    // somebody who left the workspace on it comes back to it.
    assert.deepEqual(normalize("preview", "trace"), at("preview", "trace"));
    assert.equal(TAB_LABEL.trace, "Visualizer");
  });

  it("keeps a remembered Annotations, which is a panel tab of its own", () => {
    // The notes were reachable only from a button inside the Live
    // preview, so there is no older key to follow — but once somebody has
    // left the workspace on the tab, they come back to it, and it does
    // not decide the middle the way a tab that moved bars does.
    assert.deepEqual(normalize("preview", "annotations"), at("preview", "annotations"));
    assert.deepEqual(normalize("annotations", undefined), at("preview", "annotations"));
    assert.deepEqual(normalize("code", "annotations"), at("code", "annotations"));
  });

  it("drops a side tab that was never a panel tab", () => {
    // The old side slot took Code, the README and the Environment too.
    // They have no home in the panel now, and the middle keeps its own
    // remembered value rather than being overwritten by one of them.
    assert.deepEqual(normalize("readme", "code"), at("readme", "bart"));
  });

  it("does not answer for a name that only the prototype chain knows", () => {
    // The remembered value is whatever is in localStorage. A rename table
    // kept in a plain object would hand back Object.prototype.constructor
    // for "constructor" and the prototype itself for "__proto__", and
    // both would be passed on as if they were tabs.
    for (const inherited of ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"]) {
      assert.deepEqual(normalize(inherited, undefined), at("readme", "bart"), inherited);
    }
  });

  it("reads nothing at all as the defaults", () => {
    assert.deepEqual(normalize(undefined, undefined), at("readme", "bart"));
    assert.deepEqual(normalize(null, null), at("readme", "bart"));
    assert.deepEqual(normalize(7, { middle: "code" }), at("readme", "bart"));
  });
});
