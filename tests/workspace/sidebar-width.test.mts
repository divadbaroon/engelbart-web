// How wide the sidebar makes itself.
//
// It was a share of the window, so on a wide screen the repository names
// were followed by a column of nothing. The arithmetic below is the whole
// of the new rule; the measuring it depends on belongs to the browser.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MAX_WIDTH, MIN_WIDTH, NAME_ROOM, sidebarWidth, widestText } from "../../lib/sidebar-width.ts";

describe("the width a repository list asks for", () => {
  it("is the widest name plus the room around it", () => {
    assert.equal(sidebarWidth(200), 200 + NAME_ROOM);
  });

  it("does not shrink below a usable panel, however short the names", () => {
    // "a/b" is a real repository name, and a panel that fitted it exactly
    // would have no room for the header or the add row.
    assert.equal(sidebarWidth(22), MIN_WIDTH);
    assert.equal(sidebarWidth(0), MIN_WIDTH);
  });

  it("stops widening once a name is taking more of the window than it is worth", () => {
    // Past this the name truncates, as it always did.
    assert.equal(sidebarWidth(900), MAX_WIDTH);
    assert.equal(sidebarWidth(MAX_WIDTH - NAME_ROOM + 1), MAX_WIDTH);
  });

  it("gives the panel a whole number of pixels", () => {
    // Text measurement is fractional; a panel size is not.
    assert.equal(sidebarWidth(200.4), Math.round(200.4 + NAME_ROOM));
    assert.equal(Number.isInteger(sidebarWidth(137.77)), true);
  });

  it("falls back to the minimum where there is nothing to measure with", () => {
    // On the server, and here: no canvas, so no width, so the panel opens
    // at its floor rather than at nothing at all.
    assert.equal(widestText(["owner/repository"], "14px sans-serif"), 0);
    assert.equal(widestText([], "14px sans-serif"), 0);
    assert.equal(sidebarWidth(widestText(["owner/repository"], "14px sans-serif")), MIN_WIDTH);
  });
});
