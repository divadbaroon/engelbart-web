// What the workspace will believe from a served document.
//
// Everything arriving up this channel is the imported application's own
// page, so `readUp` rebuilds each message rather than trusting one. These
// are the cases where that matters: a replay part, whose stream is the one
// thing deliberately carried as opaque data, and whose envelope is
// therefore the only thing standing between the page and the rest of the
// system.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ANNOTATE, ANNOTATE_V, envelope, previewOrigin, readUp } from "../../lib/annotations/protocol";

const up = (msg: Record<string, unknown>) => ({ engelbart: ANNOTATE, v: ANNOTATE_V, dir: "up", ...msg });
const PICTURE = "data:image/webp;base64,UklGRhYAAABXRUJQVlA4TAoAAAAvAAAAAAfQ//73v/+BiOh/AAA=";

describe("a replay part", () => {
  const part = up({ type: "replay", phase: "part", seq: 0, events: [{ type: 4, timestamp: 1 }], dropped: 0, truncated: false, startedAt: 1700 });

  it("carries pictures of the canvases beside it", () => {
    const msg = readUp(up({ ...part, canvas: [{ at: 1710, nodeId: 7, dataUrl: PICTURE }] })) as { canvas: unknown[] };
    assert.deepEqual(msg.canvas, [{ at: 1710, nodeId: 7, dataUrl: PICTURE }]);
    assert.deepEqual((readUp(part) as { canvas: unknown[] }).canvas, [], "and none is not a failure");
  });

  it("refuses a picture that is not one, and keeps the rest of the batch", () => {
    // Unlike the stream, a frame is three scalars and every one of them
    // is rebuilt. The URL matters most: it becomes the src of an image in
    // the workspace, so the page does not get to choose what kind of URL
    // that is.
    const bad = [
      { at: 1, nodeId: 1, dataUrl: "javascript:alert(1)" },
      { at: 2, nodeId: 2, dataUrl: "data:text/html;base64,PHNjcmlwdD4=" },
      { at: 3, nodeId: 3, dataUrl: "https://example.test/x.png" },
      { at: 4, nodeId: 4, dataUrl: `data:image/svg+xml;base64,${"A".repeat(8)}"onload="alert(1)` },
      { at: 5, nodeId: 0, dataUrl: PICTURE },
      { at: 6, nodeId: -1, dataUrl: PICTURE },
      { at: 7, nodeId: 1.5, dataUrl: PICTURE },
      { at: "soon", nodeId: 8, dataUrl: PICTURE },
      { at: 9, nodeId: 9, dataUrl: PICTURE },
      "not an object",
      null,
    ];
    const msg = readUp(up({ ...part, canvas: bad })) as { canvas: { nodeId: number }[] };
    assert.deepEqual(msg.canvas.map((f) => f.nodeId), [9], "only the one that was a picture of an element at a time");
  });

  it("takes only as many pictures as a part could hold", () => {
    const many = Array.from({ length: 900 }, (_, i) => ({ at: i, nodeId: i + 1, dataUrl: PICTURE }));
    const msg = readUp(up({ ...part, canvas: many })) as { canvas: unknown[] };
    assert.equal(msg.canvas.length, 500);
    assert.deepEqual((readUp(up({ ...part, canvas: "lots" })) as { canvas: unknown[] }).canvas, []);
  });

  it("comes through with its stream untouched", () => {
    const msg = readUp(part);
    assert.equal(msg?.type, "replay");
    assert.equal(msg!.phase, "part");
    // The stream is what the page was. Rebuilding it field by field is
    // not possible and pretending otherwise would be worse than saying
    // so: it is opaque here and stays opaque.
    assert.deepEqual((msg as { events: unknown[] }).events, [{ type: 4, timestamp: 1 }]);
  });

  it("rebuilds everything around it", () => {
    const msg = readUp(up({ ...part, seq: 2.5, dropped: "lots", truncated: "yes", events: [] })) as { seq: number; dropped: number; truncated: boolean } | null;
    assert.equal(msg, null, "a sequence number that is not one is not a part");
    const ok = readUp(up({ type: "replay", phase: "end", seq: 3, events: [], dropped: -5, truncated: "yes", startedAt: 1700 })) as { seq: number; dropped: number; truncated: boolean };
    assert.equal(ok.seq, 3);
    assert.equal(ok.dropped, 0, "a count below nothing is nothing");
    assert.equal(ok.truncated, false, "only true is true");
  });

  it("is refused without the two things that make it placeable", () => {
    assert.equal(readUp(up({ type: "replay", phase: "part", seq: 0, events: [], dropped: 0, truncated: false })), null, "no start, so no clock");
    assert.equal(readUp(up({ type: "replay", phase: "part", seq: 0, dropped: 0, truncated: false, startedAt: 1 })), null, "no stream");
    assert.equal(readUp(up({ type: "replay", phase: "part", seq: 0, events: "nope", dropped: 0, truncated: false, startedAt: 1 })), null);
    assert.equal(readUp(up({ type: "replay", phase: "whenever", seq: 0, events: [], dropped: 0, truncated: false, startedAt: 1 })), null);
    assert.equal(readUp(up({ type: "replay", phase: "start", startedAt: "soon" })), null);
  });

  it("says when the page cannot record at all, in a sentence of a length we chose", () => {
    const msg = readUp(up({ type: "replay", phase: "unavailable", reason: "x".repeat(400) })) as { reason: string };
    assert.equal(msg.reason.length, 120);
    assert.equal((readUp(up({ type: "replay", phase: "unavailable" })) as { reason: string }).reason, "unavailable");
  });
});

describe("the envelope itself", () => {
  it("refuses anything not addressed up this channel", () => {
    const part = { type: "replay", phase: "start", startedAt: 1 };
    assert.equal(readUp({ ...part, engelbart: ANNOTATE, v: ANNOTATE_V, dir: "down" }), null, "a down message is not an answer");
    assert.equal(readUp({ ...part, engelbart: "something-else", dir: "up" }), null);
    assert.equal(readUp("a string"), null);
    assert.equal(readUp(null), null);
  });

  it("refuses a type it has no case for", () => {
    assert.equal(readUp(up({ type: "evaluate", code: "1" })), null);
  });

  it("marks what goes down, so a page can tell us from anything else on the origin", () => {
    assert.deepEqual(envelope({ type: "record", on: true }), { engelbart: ANNOTATE, v: ANNOTATE_V, dir: "down", type: "record", on: true });
  });
});

describe("who may be spoken to", () => {
  it("is the origin the preview was served from, and nothing else", () => {
    assert.equal(previewOrigin("https://43110-abc.e2b.app/vipera?x=1"), "https://43110-abc.e2b.app");
    assert.equal(previewOrigin("not a url"), null);
    assert.equal(previewOrigin(null), null);
  });
});
