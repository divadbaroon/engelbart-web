// The reduction the narrator reads, and the key that decides whether it
// is asked at all.
//
// Two things matter here and they pull in opposite directions. The story
// must carry enough that a sentence about the session can be written
// from it — what was asked, what was answered — and it must carry
// nothing that would let a summary go behind the classification's back.
// So these tests are mostly about what is NOT in it.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classify } from "../../lib/activity/classify.ts";
import { ROPE_TAXONOMY, ropeSurface } from "../../lib/activity/rope.ts";
import { bucket, readStory, renderStory, storyKey, storyOf } from "../../lib/activity/story.ts";
import { events, frames, stages, callInfo } from "./session.mts";

const episodes = classify({ stages, frames, events, taxonomy: ROPE_TAXONOMY, surfaceOf: ropeSurface, calls: callInfo });
const story = storyOf(episodes, ROPE_TAXONOMY.name);

describe("the story a session is reduced to", () => {
  it("is one entry per episode, in order, numbered from one", () => {
    assert.equal(story.episodes.length, episodes.length);
    assert.deepEqual(story.episodes.map((e) => e.n), episodes.map((_, i) => i + 1));
    assert.deepEqual(story.episodes.map((e) => e.sub), episodes.map((e) => e.subBehavior));
  });

  it("measures the session by the clock and not by adding the episodes up", () => {
    // The gaps between episodes are the session too. Summing durations
    // would say this run was shorter than it was.
    const span = Date.parse(episodes[episodes.length - 1].endedAt) - Date.parse(episodes[0].startedAt);
    assert.equal(story.spanMs, span);
    assert.ok(story.unclearShare > 0 && story.unclearShare < 1, `${story.unclearShare}`);
  });

  it("carries what was written and what was shown, because that is what a session is about", () => {
    const wrote = story.episodes.map((e) => e.wrote).filter(Boolean);
    assert.ok(wrote.includes("help"), `the messages survive: ${JSON.stringify(wrote)}`);
    const shown = story.episodes.flatMap((e) => e.said.map((s) => s.text)).join(" ");
    assert.match(shown, /Tetris/, "what the tutor said survives, which is where a session's subject comes from");
  });

  it("never carries the person's own words back as something shown to them", () => {
    // The echo of a sent message is how we know what was sent; it is not
    // the interface telling them anything.
    for (const e of story.episodes) {
      for (const s of e.said) assert.notEqual(s.channel, "participant");
    }
  });

  it("holds no trace, no stage, no event and no selector", () => {
    // The whole point of the layer. If any of this were reachable, the
    // narrator would be a second classifier rather than a reader of the
    // first one.
    const text = JSON.stringify(story);
    for (const forbidden of ["stageId", "stageIds", "events", "selector", "frameId", "callId", "interactionId", "seq", "confidence", "because"]) {
      assert.doesNotMatch(text, new RegExp(`"${forbidden}"`), `a story must not carry ${forbidden}`);
    }
  });

  it("renders as something a person could check line by line", () => {
    const text = renderStory(story);
    assert.match(text, /^A session of .* read as \d+ episodes of activity\./m);
    assert.match(text, /\d+% of that time is unaccounted for/);
    for (const e of story.episodes) assert.ok(text.includes(`${e.n}. ${e.broad} / ${e.sub}`), `episode ${e.n} is in the rendering`);
    assert.match(text, /they wrote: "help"/);
  });
});

describe("when is a timeline the same timeline", () => {
  const key = storyKey(story);

  it("is the same when nothing about the reading changed", () => {
    assert.equal(storyKey(storyOf(episodes, ROPE_TAXONOMY.name)).key, key.key);
  });

  it("is not the same when a behaviour changes", () => {
    const moved = { ...story, episodes: story.episodes.map((e, i) => (i === 0 ? { ...e, sub: "SOMETHING_ELSE" } : e)) };
    assert.notEqual(storyKey(moved).key, key.key);
  });

  it("is not the same when what somebody wrote changes", () => {
    const moved = { ...story, episodes: story.episodes.map((e) => (e.wrote ? { ...e, wrote: "something else entirely" } : e)) };
    assert.notEqual(storyKey(moved).key, key.key);
  });

  it("does not count durations exactly, and does notice a stretch becoming a silence", () => {
    // A wait that took four seconds and one that took five are the same
    // session; one that took four seconds and one that took two minutes
    // are not. That is the whole reason durations are bucketed rather
    // than dropped or counted exactly. Away from an edge, a second is
    // nothing:
    const same = { ...story, episodes: story.episodes.map((e) => ({ ...e, durationMs: 5_000 })) };
    const alsoSame = { ...story, episodes: story.episodes.map((e) => ({ ...e, durationMs: 5_700 })) };
    assert.equal(storyKey(same).key, storyKey(alsoSame).key);
    // Two minutes is not:
    const stretched = { ...story, episodes: story.episodes.map((e) => ({ ...e, durationMs: e.durationMs + 120_000 })) };
    assert.notEqual(storyKey(stretched).key, key.key);
  });

  it("keeps what it was computed from, so a miss can be explained", () => {
    assert.equal(key.parts.length, story.episodes.length);
    assert.ok(key.canonical.includes(ROPE_TAXONOMY.name));
    assert.match(key.key, /^[0-9a-f]{16}$/);
  });

  it("buckets coarsely and in one direction", () => {
    assert.equal(bucket(0), "instant");
    assert.equal(bucket(1_500), "brief");
    assert.equal(bucket(9_000), "brief");
    assert.equal(bucket(29_000), "short");
    assert.equal(bucket(119_000), "medium");
    assert.equal(bucket(9 * 60_000), "long");
    assert.equal(bucket(60 * 60_000), "very-long");
  });
});

describe("a story that arrived from a browser", () => {
  it("comes back as itself", () => {
    const back = readStory(JSON.parse(JSON.stringify(story)));
    assert.ok(back);
    assert.equal(back.episodes.length, story.episodes.length);
    assert.equal(storyKey(back).key, storyKey(story).key);
  });

  it("is rebuilt rather than believed", () => {
    const back = readStory({
      taxonomy: "x".repeat(500),
      spanMs: -5,
      unclearShare: 42,
      episodes: [
        { n: 1, broad: "ACTING", sub: "SUBMIT_RESPONSE", durationMs: 1e12, where: "y".repeat(500), description: "z".repeat(5000), wrote: "w".repeat(5000), said: [{ channel: "tutor", text: "t".repeat(5000) }, { channel: "a", text: "b" }, { channel: "c", text: "d" }] },
        { nonsense: true },
        { n: 3, sub: "NO_DESCRIPTION" },
      ],
    });
    assert.ok(back);
    assert.equal(back.episodes.length, 1, "a row with no description is not an episode");
    assert.ok(back.taxonomy.length <= 60);
    assert.equal(back.spanMs, 0);
    assert.equal(back.unclearShare, 1);
    assert.ok(back.episodes[0].description.length <= 200);
    assert.ok(back.episodes[0].wrote!.length <= 400);
    assert.equal(back.episodes[0].said.length, 2, "at most two things shown per episode");
  });

  it("is nothing when it is nothing", () => {
    assert.equal(readStory(null), null);
    assert.equal(readStory({ episodes: [] }), null);
    assert.equal(readStory({ episodes: [{ sub: "X" }] }), null);
    assert.equal(readStory("a story, honest"), null);
  });
});
