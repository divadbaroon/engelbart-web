// A replay beside the trace. Everything here is about the one property
// the two have to share to be shown together: that a moment in one can be
// found in the other, or that we say plainly they cannot be.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { traceRows, traceStages } from "../../lib/trace/timeline";
import {
  allFrames, canvasFrame, canvasFrames, clockOffset, eventTime, framesAt, playable,
  readStoredReplay, replayClock, stageAt, streamStart, toReplayTime, toTraceTime, usedPointer,
} from "../../lib/trace/replay";
import type { TraceEvent } from "../../lib/trace/types";
import { events, t } from "./fixtures/session";

const ev = (over: Partial<TraceEvent>): TraceEvent => ({
  id: 1, runId: "r", seq: 1, at: t(10), receivedAt: "", source: "browser", kind: "ui.click",
  interactionId: null, requestId: null, callId: null, correlation: null, data: {}, ...over,
});

describe("the difference between the two clocks", () => {
  // The gateway measures it per batch and writes it onto every browser
  // event (sandbox/trace/preview-gateway.mjs). We read it back rather
  // than measuring anything of our own.
  it("is the most recent reading the gateway took", () => {
    assert.equal(clockOffset([
      ev({ at: t(10), data: { clock_offset_ms: 120 } }),
      ev({ at: t(20), data: { clock_offset_ms: 180 } }),
      ev({ at: t(15), data: { clock_offset_ms: 900 } }),
    ]), 180);
  });

  it("ignores everything that is not a browser event carrying one", () => {
    assert.equal(clockOffset([
      ev({ source: "preview-gateway", at: t(30), data: { clock_offset_ms: 5 } }),
      ev({ at: t(20), data: { clock_offset_ms: 180 } }),
      ev({ at: t(25), data: {} }),
      ev({ at: t(26), data: { clock_offset_ms: null } }),
    ]), 180);
  });

  it("is nothing rather than zero when no reading was taken", () => {
    // A recording with no bridge behind it, or a browser clock the gateway
    // refused to trust. Zero would look like agreement.
    assert.equal(clockOffset([ev({ at: t(10), data: {} })]), null);
    assert.equal(clockOffset([]), null);
    assert.equal(replayClock(1_000_000, null), null, "and no pin can be made from it");
  });
});

describe("a moment in one, found in the other", () => {
  // The replay began at browser time 1000; the sandbox's clock reads 500ms
  // ahead of the browser's.
  const clock = replayClock(1000, 500)!;

  it("converts both ways and comes back to where it started", () => {
    const at = toTraceTime(4000, clock);
    assert.equal(at, new Date(1000 + 4000 + 500).toISOString());
    assert.equal(toReplayTime(at, clock), 4000);
  });

  it("puts the start of the replay at the start of the replay", () => {
    assert.equal(toReplayTime(toTraceTime(0, clock), clock), 0);
  });

  it("refuses a time it cannot read", () => {
    assert.equal(toReplayTime("not a time", clock), null);
  });
});

describe("what was happening then", () => {
  const stages = traceStages(traceRows(events, [])).primary;

  it("is the last thing to have started at or before the playhead", () => {
    const first = stages[0], second = stages[1];
    assert.equal(stageAt(stages, first.at)?.id, first.id, "a stage's own start is that stage");
    assert.equal(stageAt(stages, second.at)?.id, second.id);
    // Between two stages the answer is still the earlier one: the person
    // scrubbing means "the most recent thing that happened", and a gap is
    // not a reason to let go of the selection.
    const between = new Date(Date.parse(first.endAt) + 1).toISOString();
    assert.equal(stageAt(stages, between)?.id, first.id);
  });

  it("is nothing before anything had happened", () => {
    const before = new Date(Date.parse(stages[0].at) - 1000).toISOString();
    assert.equal(stageAt(stages, before), null, "there is honestly nothing there");
    assert.equal(stageAt(stages, "not a time"), null);
    assert.equal(stageAt([], t(10)), null);
  });

  it("stays on the last one once the recording has run out", () => {
    const after = new Date(Date.parse(stages[stages.length - 1].endAt) + 60_000).toISOString();
    assert.equal(stageAt(stages, after)?.id, stages[stages.length - 1].id);
  });
});

describe("the stream", () => {
  const meta = { type: 4, timestamp: 2000, data: {} };
  const snap = { type: 2, timestamp: 2010, data: {} };

  it("begins at its earliest reading, whatever order the parts arrived in", () => {
    assert.equal(streamStart([snap, meta]), 2000);
    assert.equal(streamStart([]), null);
    assert.equal(streamStart([{ no: "timestamp" }]), null);
  });

  it("is playable only with something to play", () => {
    // rrweb's own floor is two events, and one below it is not a short
    // recording, it is a failed one.
    assert.equal(playable([meta, snap]), true);
    assert.equal(playable([meta]), false);
    assert.equal(playable([]), false);
  });

  it("reads a stored replay back, and refuses one it does not know", () => {
    const stored = readStoredReplay({ v: 1, startedAt: 2000, offset: 500, truncated: false, dropped: 0, events: [meta, snap], canvas: [] });
    assert.equal(stored?.startedAt, 2000);
    assert.equal(stored?.offset, 500);
    assert.equal(readStoredReplay({ v: 2, startedAt: 1, events: [] }), null);
    assert.equal(readStoredReplay({ v: 1, events: "nope" }), null);
    assert.equal(readStoredReplay(null), null);
  });

  it("reads the pictures stored beside it the way they arrived", () => {
    // A file in a bucket is not a page, but it is what a page sent, and
    // it has not become truer for having been written down.
    const url = "data:image/webp;base64,AAAA";
    const stored = readStoredReplay({
      v: 1, startedAt: 2000, events: [meta, snap],
      canvas: [{ at: 2100, nodeId: 7, dataUrl: url }, { at: 2200, nodeId: 8, dataUrl: "javascript:alert(1)" }],
    });
    assert.deepEqual(stored?.canvas, [{ at: 2100, nodeId: 7, dataUrl: url }]);
    assert.deepEqual(readStoredReplay({ v: 1, startedAt: 2000, events: [meta, snap] })?.canvas, [],
      "a recording made before any of this reads back with none");
  });

  it("falls back to the stream's own start when none was written down", () => {
    const stored = readStoredReplay({ v: 1, events: [snap, meta] });
    assert.equal(stored?.startedAt, 2000);
    assert.equal(stored?.offset, null, "and says it has no reading rather than inventing one");
  });

  it("reads a timestamp and nothing else off an event", () => {
    assert.equal(eventTime(meta), 2000);
    assert.equal(eventTime({ timestamp: "2000" }), null);
    assert.equal(eventTime(null), null);
  });
});

describe("whether anybody was holding a mouse", () => {
  // A trackpad is a mouse and a touch surface at once, and rrweb only asks
  // the second question: one touchmove and it hides the cursor for the
  // whole recording. This is the first question.
  const moved = (n: number) => ({ type: 3, timestamp: 1, data: { source: 1, positions: Array.from({ length: n }, () => ({ x: 1, y: 1, id: 2, timeOffset: 0 })) } });
  const acted = (type: number) => ({ type: 3, timestamp: 1, data: { source: 2, type, id: 2, x: 1, y: 1 } });
  const touched = { type: 3, timestamp: 1, data: { source: 6, positions: [{ x: 1, y: 1, id: 2, timeOffset: 0 }] } };

  it("is yes when a mouse moved or clicked, touches beside it or not", () => {
    assert.equal(usedPointer([touched, moved(3)]), true);
    assert.equal(usedPointer([touched, acted(2)]), true, "a click");
    assert.equal(usedPointer([acted(0)]), true, "and the up and down either side of one");
  });

  it("is no for a session that was only ever touched", () => {
    assert.equal(usedPointer([touched, acted(7), acted(9)]), false, "touch start and end are not a pointer");
    assert.equal(usedPointer([]), false);
    assert.equal(usedPointer([{ type: 2, timestamp: 1, data: {} }]), false, "a whole picture of the page");
    assert.equal(usedPointer([moved(0)]), false, "a mouse move with nowhere it moved to");
  });

  it("does not count a focus or a blur, which a keyboard also causes", () => {
    assert.equal(usedPointer([acted(5)]), false, "focus");
    assert.equal(usedPointer([acted(6)]), false, "blur");
  });
});

describe("what a canvas drew", () => {
  // rrweb's shape for a sampled canvas: wipe, then draw a picture built
  // from a blob. Reading it out is what lets the replay iframe keep its
  // sandbox — see lib/trace/replay.ts.
  const painted = (nodeId: number, at: number, base64 = "AAAA", type = "image/webp") => ({
    type: 3, timestamp: at,
    data: {
      source: 9, id: nodeId,
      commands: [
        { property: "clearRect", args: [0, 0, 100, 100] },
        { property: "drawImage", args: [{ rr_type: "ImageBitmap", args: [{ rr_type: "Blob", type, data: [{ rr_type: "ArrayBuffer", base64 }] }] }, 0, 0] },
      ],
    },
  });

  it("is a picture, an element and a time", () => {
    assert.deepEqual(canvasFrame(painted(7, 500)), { at: 500, nodeId: 7, dataUrl: "data:image/webp;base64,AAAA" });
  });

  it("is nothing for anything else in the stream", () => {
    assert.equal(canvasFrame({ type: 3, timestamp: 1, data: { source: 0 } }), null, "an ordinary mutation");
    assert.equal(canvasFrame({ type: 2, timestamp: 1, data: {} }), null, "a whole picture of the page");
    assert.equal(canvasFrame(null), null);
    assert.equal(canvasFrame({ type: 3, timestamp: 1, data: { source: 9, id: 7, commands: [] } }), null, "a canvas change that drew nothing");
    assert.equal(
      canvasFrame({ type: 3, timestamp: 1, data: { source: 9, id: 7, commands: [{ property: "drawImage", args: [{ rr_type: "ImageBitmap", args: [{ rr_type: "Blob", type: "image/webp", data: [] }] }] }] } }),
      null,
      "a picture with nothing in it",
    );
  });

  it("refuses a type that is not an image type", () => {
    // The mime comes off the page and ends up in a data: URL.
    const frame = canvasFrame(painted(7, 500, "AAAA", "text/html;x=<script>"));
    assert.equal(frame?.dataUrl, "data:image/png;base64,AAAA");
  });

  it("is in time order however the stream arrived", () => {
    assert.deepEqual(canvasFrames([painted(7, 900), painted(7, 100), painted(8, 400)]).map((f) => f.at), [100, 400, 900]);
  });

  it("is one series however it was photographed", () => {
    // Two samplers: the recorder's, which sees the top document, and the
    // bridge's, which sees the frames below it. By the time anything is
    // shown the difference is gone.
    const stored = readStoredReplay({
      v: 1, startedAt: 0, events: [painted(7, 900), painted(7, 100)],
      canvas: [{ at: 400, nodeId: 8, dataUrl: "data:image/webp;base64,BBBB" }],
    });
    assert.deepEqual(allFrames(stored).map((f) => [f.nodeId, f.ms]), [[7, 0], [8, 300], [7, 800]]);
    assert.deepEqual(allFrames(null), []);
  });

  it("comes back on the playhead's clock, not on the clock it was stamped with", () => {
    // The one that was wrong for a while, and silently: a stamp is around
    // 1.79e12 and a playhead is around 1e4, so a comparison between them
    // is not a wrong answer, it is "nothing is due" at every position for
    // the length of the recording. The stream's first event is where rrweb
    // measures `getCurrentTime()` from, so it is zero here too.
    const stamp = 1_789_879_992_913;
    const stored = readStoredReplay({
      v: 1, startedAt: stamp - 50, events: [painted(7, stamp), painted(7, stamp + 8000)],
      canvas: [{ at: stamp + 2500, nodeId: 8, dataUrl: "data:image/webp;base64,BBBB" }],
    });
    const frames = allFrames(stored);
    assert.deepEqual(frames.map((f) => f.ms), [0, 2500, 8000], "measured from the stream's own start");
    // A playhead of 3 seconds is three seconds in, and finds something.
    assert.deepEqual(framesAt(frames, 3000).map((f) => f.nodeId).sort(), [7, 8]);
  });

  it("shows each canvas the last thing it was asked to draw", () => {
    const frames = allFrames(readStoredReplay({
      v: 1, startedAt: 100, events: [painted(7, 100), painted(8, 200), painted(7, 300), painted(7, 900)],
    }));
    assert.deepEqual(framesAt(frames, 400).map((f) => [f.nodeId, f.ms]).sort(), [[7, 200], [8, 100]]);
    assert.deepEqual(framesAt(frames, -1), [], "before anything was drawn, nothing is");
  });
});
