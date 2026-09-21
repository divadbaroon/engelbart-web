// The export, checked against the recorded ROPE session.
//
// What it is for is that a classification should be arguable: if the
// export drops the events a reading was made from, or quietly leaves out
// the ones that would contradict it, then it is decoration. So the tests
// are about completeness and about what is deliberately absent.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classify } from "../../lib/activity/classify.ts";
import { ROPE_TAXONOMY, ropeSurface } from "../../lib/activity/rope.ts";
import { DEFAULT_SEGMENTATION } from "../../lib/activity/segment.ts";
import { activityExport, activityJson, ACTIVITY_FORMAT } from "../../lib/activity/export.ts";
import { builtInStamp } from "../../lib/activity/profile/stamp.ts";
import { events, frames, stages, callInfo } from "./session.mts";

const episodes = classify({ stages, frames, events, taxonomy: ROPE_TAXONOMY, surfaceOf: ropeSurface, calls: callInfo, segmentation: DEFAULT_SEGMENTATION });
const made = activityExport({ episodes, profile: builtInStamp(ROPE_TAXONOMY.name, { artifact: { name: "ROPE Training System" } }), segmentation: DEFAULT_SEGMENTATION, runId: "run", now: new Date("2026-09-20T00:00:00.000Z") });

describe("the Activity export", () => {
  it("says what it is, and under what thresholds it was read", () => {
    assert.equal(made.format, ACTIVITY_FORMAT);
    assert.equal(made.taxonomy, "ROPE");
    assert.deepEqual(made.segmentation, DEFAULT_SEGMENTATION);
    assert.equal(made.exportedAt, "2026-09-20T00:00:00.000Z");
    assert.equal(made.episodeCount, made.episodes.length);
  });

  it("carries the episode's own events, not its stages' whole contents", () => {
    const claimed = made.episodes.flatMap((e) => e.events.length);
    assert.equal(made.eventCount, claimed.reduce((a, b) => a + b, 0));
    for (const e of made.episodes) {
      // A stage is cut at its submissions, so composing, sending and
      // waiting are three episodes over one stage. Each gets its own
      // slice — exporting the stage whole would give all three the same
      // events and hide the cut the reading turns on — and every event
      // still comes from a stage the episode claims.
      const within = new Set(e.stages.flatMap((s) => stages.find((x) => x.id === s.id)!.events.map((x) => x.seq)));
      for (const x of e.events) assert.ok(within.has(x.seq), `${e.subBehavior} exports event ${x.seq}, which is in none of its stages`);
    }
    // At least one stage really is shared between episodes, or this test
    // is passing for the wrong reason.
    const owners = new Map<string, number>();
    for (const e of made.episodes) for (const s of e.stages) owners.set(s.id, (owners.get(s.id) ?? 0) + 1);
    assert.ok([...owners.values()].some((n) => n > 1), "no stage was split, so the split is untested here");
  });

  it("holds the whole session between them, each event once", () => {
    const seen = new Set<number>();
    for (const e of made.episodes) for (const x of e.events) { assert.ok(!seen.has(x.seq), `seq ${x.seq} twice`); seen.add(x.seq); }
    const inStages = new Set(stages.flatMap((s) => s.events.map((e) => e.seq)));
    assert.equal(seen.size, inStages.size);
  });

  it("keeps the events in trace order", () => {
    for (const e of made.episodes) {
      for (let i = 1; i < e.events.length; i++) assert.ok(e.events[i].seq > e.events[i - 1].seq);
    }
  });

  it("names what each event was about the way the trace already named it", () => {
    const clicks = made.episodes.flatMap((e) => e.events).filter((e) => e.kind === "ui.click");
    assert.ok(clicks.length > 0);
    assert.ok(clicks.some((c) => c.target?.tag === "textarea"), "the click into the message box should carry its element");
    assert.ok(clicks.every((c) => c.target !== null));
  });

  it("carries no prompt and no typed value, because an episode never had one", () => {
    const text = activityJson(made);
    // What a person typed is only ever a length in the trace.
    for (const e of made.episodes) for (const x of e.events) {
      if (x.kind === "ui.input") assert.ok(!("value" in (x.data ?? {})), "ui.input must not carry a value");
    }
    // A model call is an id, a model and a latency. Its messages live in
    // the model-call record, which the Activity layer never reads.
    for (const e of made.episodes) {
      if (!e.evidence.call) continue;
      assert.deepEqual(Object.keys(e.evidence.call).sort(), ["callId", "latencyMs", "model"]);
    }
    assert.doesNotMatch(text, /"messages"|"authorization"|"cookie"/i);
  });

  it("round-trips as JSON a person can read", () => {
    const text = activityJson(made);
    assert.match(text, /\n {2}"episodes"/);            // indented, not one line
    assert.deepEqual(JSON.parse(text), JSON.parse(JSON.stringify(made)));
  });
});
