// The recorded ROPE session, read as behaviour. These tests exist to be
// argued with: they pin the actual reading of a real session, so that a
// change to a rule shows up as a change to what we are claiming somebody
// did rather than as a green test suite.
//
// Two of them are about a mistake rather than a feature. Durations were
// once printed from a misread clock, so every duration is checked against
// the timestamps it came from. And a 2m 2s silence was once reported as
// "appeared to study the reference game", which is a sentence about a
// person nobody watched; silence is UNCLEAR and stays UNCLEAR.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { classify } from "../../lib/activity/classify.ts";
import { ROPE_TAXONOMY, ropeSurface } from "../../lib/activity/rope.ts";
import { BROAD, type Evidence } from "../../lib/activity/types.ts";
import type { Context } from "../../lib/activity/taxonomy.ts";
import { DEFAULT_SEGMENTATION, type Segmentation } from "../../lib/activity/segment.ts";
import { events, frames, stages, callInfo, at } from "./session.mts";

const run = (segmentation: Segmentation = DEFAULT_SEGMENTATION) =>
  classify({ stages, frames, events, taxonomy: ROPE_TAXONOMY, surfaceOf: ropeSurface, calls: callInfo, segmentation });

describe("the recorded ROPE session, as the timeline reads it", () => {
  it("is this sequence", () => {
    assert.deepEqual(
      run().map((e) => [at(e.startedAt), at(e.endedAt), e.broadBehavior, e.subBehavior]),
      [
        [0, 2, "FORMULATING", "FORMULATE_RESPONSE"],
        [2, 3, "ACTING", "SUBMIT_RESPONSE"],
        [3, 8, "WAITING", "WAIT_FOR_TUTOR_RESPONSE"],
        [8, 31, "UNCLEAR", "NO_RECORDED_ACTIVITY"],
        [31, 62, "EXPLORING", "EXPERIMENT_WITH_REFERENCE"],
        [62, 184, "UNCLEAR", "NO_RECORDED_ACTIVITY"],
        [184, 186, "ORIENTING", "RESUME_SESSION"],
        // The sign-in is a deed, so it opens a stretch of its own rather
        // than naming the two seconds of arriving at the replaced page
        // that led up to it. Nothing was recorded after it — the stage
        // ends at the click and sixteen seconds of silence follow — so
        // the stretch it opens has no extent, the same way the send at
        // 209s does.
        [186, 186, "ORIENTING", "SIGN_IN"],
        [186, 202, "UNCLEAR", "NO_RECORDED_ACTIVITY"],
        [202, 205, "EXPLORING", "EXPERIMENT_WITH_REFERENCE"],
        [206, 207, "ACTING", "SUBMIT_RESPONSE"],
        [208, 209, "FORMULATING", "FORMULATE_AFTER_REFERENCE"],
        [209, 209, "ACTING", "SUBMIT_RESPONSE"],
        [209, 212, "WAITING", "WAIT_FOR_TUTOR_RESPONSE"],
      ],
    );
  });

  it("reports what was sent, and not the answer to it", () => {
    // `ui.input` carries a length and never a value, so the only place a
    // message exists is where the application echoed it back. The tutor's
    // reply lands in the same conversation, one node deeper, and the
    // whole conversation is repainted on signing back in — both of which
    // have been read as "what they sent" at some point. The bridge also
    // flushes the echo in the same batch as the keystroke, sometimes with
    // a lower sequence number, which once put it in the composing before
    // the send and left the send with nothing in it.
    const sent = run().filter((e) => e.subBehavior === "SUBMIT_RESPONSE");
    // Three sends: two messages, and one press of the send button with
    // an empty box, which really did send nothing.
    assert.deepEqual(sent.map((e) => e.evidence.entered), ["help", null, "help"]);
    for (const e of sent) {
      assert.match(e.description, e.evidence.entered ? /^Sent the tutor a message: “help”\.$/ : /^Submitted the response\.$/);
    }
  });

  it("puts composing, sending and waiting in that order, and never in one row", () => {
    // A "submit" stage runs from engaging the message box to the answer
    // coming back. Read whole it became one ACTING episode that started
    // before anything was decided and ended after the tutor had replied.
    const list = run();
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.subBehavior !== "SUBMIT_RESPONSE") continue;
      assert.equal(e.evidence.submitted, true);
      assert.equal(e.evidence.composing, false, "a send must not contain the composing before it");
      assert.equal(e.evidence.awaiting, false, "a send must not contain the wait after it");
      assert.ok(e.durationMs <= 2_000, `a send is a boundary, not a stretch: ${e.durationMs}ms`);
    }
    for (const e of list) {
      if (e.broadBehavior !== "FORMULATING") continue;
      assert.equal(e.evidence.submitted, false, "composing must end where the send begins");
    }
    for (const e of list) {
      if (e.subBehavior !== "WAIT_FOR_TUTOR_RESPONSE") continue;
      assert.equal(e.evidence.submitted, false, "a wait must not contain the send that opened it");
      assert.equal(e.evidence.composing, false, "going back to the message box ends the wait");
    }
  });

  it("never puts two model calls in one episode", () => {
    // A second message begun while the first answer is still arriving
    // used to land in the first message's episode, under the first
    // message's call, labelled with the second message's text.
    for (const e of run()) {
      const ids = new Set(e.events.filter((x) => x.callId).map((x) => x.callId));
      assert.ok(ids.size <= 1, `${e.subBehavior} at ${at(e.startedAt)}s spans ${[...ids].join(", ")}`);
      if (e.evidence.call) assert.ok(ids.size === 0 || ids.has(e.evidence.call.callId));
    }
  });

  it("says what the tutor answered where the tutor answered", () => {
    const wait = run().find((e) => e.subBehavior === "WAIT_FOR_TUTOR_RESPONSE");
    assert.ok(wait, "the session has a wait in it");
    assert.match(wait.description, /You've made great progress/);
  });

  it("names the break in the session, and only the break", () => {
    // Two stretches read as orienting and they are the two halves of one
    // return: coming back to a page that had been replaced, and signing
    // back in. Nothing else in the session is read as finding one's way
    // around, which is the claim this test exists to hold.
    const orienting = run().filter((e) => e.broadBehavior === "ORIENTING");
    assert.deepEqual(orienting.map((e) => e.subBehavior), ["RESUME_SESSION", "SIGN_IN"]);
    assert.equal(orienting[0].confidence, "high");
  });

  it("leaves the silences unclear rather than filling them in", () => {
    const silent = run().filter((e) => e.subBehavior === "NO_RECORDED_ACTIVITY");
    assert.equal(silent.length, 3);
    for (const e of silent) {
      assert.equal(e.broadBehavior, "UNCLEAR");
      assert.equal(e.confidence, "low");
      assert.equal(e.evidence.observed, false);
      assert.doesNotMatch(e.description, /read|study|review|think|consider/i);
    }
    // The 2m 2s one, specifically.
    assert.ok(silent.some((e) => e.durationMs > 120_000));
  });

  it("never emits EVALUATING, which ROPE has no evidence for", () => {
    assert.ok(!run().some((e) => e.broadBehavior === "EVALUATING"));
  });

  it("uses only classes the broad taxonomy declares", () => {
    for (const e of run()) assert.ok((BROAD as readonly string[]).includes(e.broadBehavior), e.broadBehavior);
  });
});

describe("durations come from the timestamps", () => {
  it("is exactly the difference between the two ends, every time", () => {
    for (const e of run()) {
      assert.equal(e.durationMs, Date.parse(e.endedAt) - Date.parse(e.startedAt), `${e.subBehavior} at ${at(e.startedAt)}s`);
      assert.ok(e.durationMs >= 0);
    }
  });

  it("adds up to no more than the session it came from", () => {
    const list = run();
    const total = list.reduce((n, e) => n + e.durationMs, 0);
    const session = Date.parse(list[list.length - 1].endedAt) - Date.parse(list[0].startedAt);
    assert.ok(total <= session, `${total}ms of episodes over a ${session}ms session`);
  });

  it("holds under every threshold, not just the default", () => {
    for (const gapMs of [3_000, 10_000, 20_000, 60_000, 300_000]) {
      const list = run({ ...DEFAULT_SEGMENTATION, gapMs });
      for (const e of list) assert.equal(e.durationMs, Date.parse(e.endedAt) - Date.parse(e.startedAt));
      for (let i = 1; i < list.length; i++) {
        assert.ok(Date.parse(list[i].startedAt) >= Date.parse(list[i - 1].endedAt), `overlap at gapMs=${gapMs}`);
      }
    }
  });
});

describe("what a reading is allowed to claim", () => {
  it("hedges when it is inferring and does not when it is not", () => {
    for (const e of run()) {
      if (/\bappeared to\b/i.test(e.description)) {
        assert.notEqual(e.confidence, "high", `"${e.description}" hedges but claims high confidence`);
      }
      if (e.confidence === "high") {
        assert.equal(e.evidence.observed, true, `"${e.description}" claims high confidence over nothing observed`);
      }
    }
  });

  it("can always be taken back to the trace", () => {
    const known = new Set(stages.map((s) => s.id));
    const used = new Set<string>();
    for (const e of run()) {
      assert.equal(e.determined, "rule");
      assert.ok(e.because.length > 0);
      for (const id of e.stageIds) {
        assert.ok(known.has(id), `${id} is not a stage of this session`);
        used.add(id);
      }
    }
    // Every stage the session had is accounted for somewhere. A stage can
    // be behind more than one row — a submit stage is composing, sending
    // and waiting — so the check is coverage, not exclusivity. What must
    // not be shared is the events, which is checked below.
    assert.equal(used.size, known.size);
  });

  it("divides the session's events between episodes, each event once", () => {
    const used = new Map<number, string>();
    for (const e of run()) {
      for (const x of e.events) {
        assert.ok(!used.has(x.id), `event ${x.seq} is in both ${used.get(x.id)} and ${e.subBehavior}`);
        used.set(x.id, e.subBehavior);
      }
    }
    const inStages = new Set(stages.flatMap((s) => s.events.map((e) => e.id)));
    assert.equal(used.size, inStages.size, "every event of the session lands in exactly one episode");
  });
});

describe("the taxonomy is data, and it is the only ROPE-aware module", () => {
  const source = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");

  it("never classifies on a generated semantic name", () => {
    // Semantic ids and region labels are written by a model and drift
    // between runs of the same page — the same ROPE page has come back as
    // region_prompt, region_conversation_prompt and region_conversation.
    // They are enrichment for a reader and nothing turns on them.
    for (const file of ["../../lib/activity/rope.ts", "../../lib/activity/taxonomy.ts"]) {
      assert.doesNotMatch(source(file).replace(/\/\/[^\n]*/g, ""), /\bsemanticId|\bregionId|evidence\.regions/);
    }
  });

  it("keeps ROPE out of the segmenter and the classifier", () => {
    for (const file of ["../../lib/activity/segment.ts", "../../lib/activity/classify.ts", "../../lib/activity/types.ts"]) {
      const code = source(file).replace(/\/\/[^\n]*/g, "");
      assert.doesNotMatch(code, /\btutor\b|\bROPE\b|Tetris|my-canvas|"solution"/i, `${file} knows about the artifact`);
    }
  });
});

// The rules, asked directly. Four of these pin sentences the timeline
// actually printed about a real session and should not have: a first
// sign-in reported as signing back in, a stretch with no model call in
// it reported as waiting for one, and a stretch of nothing but clicks
// reported as "0 movement and rotation controls were used". Evidence is
// built by hand here because the recording does not contain these
// shapes, and a rule that only ever sees the shapes one recording
// happens to have is a rule nobody has tested.
const BLANK: Evidence = {
  surface: { key: "shell", label: "the ROPE workspace", role: "shell", frameIds: [] },
  regions: [],
  acts: { keys: 0, clicks: 0, typing: 0, submits: 0, navigations: 0, gestures: 0 },
  keyNames: [],
  appeared: [],
  entered: null,
  observed: true,
  composing: false,
  submitted: false,
  awaiting: false,
  call: null,
  entered_by: [],
  controls: [],
  openingQuietMs: 0,
  quietMs: 0,
  discontinuity: null,
};

// The same choice classify makes: first rule that reads it, else the
// fallback.
const reads = (over: Partial<Evidence>, ctx: Partial<Context> = {}) => {
  const evidence: Evidence = { ...BLANK, ...over };
  const c: Context = { evidence, durationMs: 6_000, index: 0, previous: null, before: [], ...ctx };
  const rule = ROPE_TAXONOMY.rules.find((r) => r.when(c)) ?? ROPE_TAXONOMY.fallback;
  return { sub: rule.sub, broad: rule.broad, ...rule.read(c) };
};

describe("what the ROPE rules will and will not say", () => {
  it("tells signing in at the start from signing back in after the page was replaced", () => {
    const first = reads({ controls: ["login"] });
    assert.equal(first.sub, "SIGN_IN");
    assert.equal(first.description, "Signed in to start the session.");
    assert.doesNotMatch(first.description, /back|again|carry on|replaced/i, "nothing had been replaced, so nothing may say so");

    const again = reads({ controls: ["login"], discontinuity: "the page was reloaded and the session picked up again" });
    assert.equal(again.sub, "RESUME_SESSION");
    assert.match(again.description, /replaced/);
  });

  it("will not say a model call was open when the trace holds none", () => {
    // A send that opened no call still leaves a stretch after it. Reading
    // that as "a model call was open for 6s" asserts a call that is not
    // in the trace, and it did, at high confidence.
    const none = reads({ awaiting: true, call: null });
    assert.notEqual(none.sub, "WAIT_FOR_TUTOR_RESPONSE");
    assert.doesNotMatch(none.because, /model call/);

    const held = reads({ awaiting: true, call: { callId: "mc_x", model: "sonnet", latencyMs: 900 } });
    assert.equal(held.sub, "WAIT_FOR_TUTOR_RESPONSE");
  });

  it("counts what it names when it says the reference game was played", () => {
    const reference = { key: "solution", label: "the reference game", role: "reference" as const, frameIds: [] };

    // Keys it knows the meaning of: it may say the game was played, and
    // it says which keys.
    const played = reads({ surface: reference, acts: { ...BLANK.acts, keys: 12 }, keyNames: ["ArrowLeft", "ArrowRight"] });
    assert.equal(played.sub, "EXPERIMENT_WITH_REFERENCE");
    assert.match(played.description, /^Played the reference game/);
    assert.match(played.because, /12 presses of ArrowLeft, ArrowRight/);

    // Clicks only: it must not claim keys, and must not count keys it
    // does not have.
    const clicked = reads({ surface: reference, acts: { ...BLANK.acts, clicks: 4 } });
    assert.equal(clicked.sub, "EXPERIMENT_WITH_REFERENCE");
    assert.match(clicked.description, /^Experimented with the reference game/);
    assert.match(clicked.because, /0 keys and 4 clicks/);
    assert.doesNotMatch(clicked.because, /presses of/);

    // Keys it does not know the meaning of are not playing.
    const typed = reads({ surface: reference, acts: { ...BLANK.acts, keys: 6 }, keyNames: ["a", "Tab"] });
    assert.match(typed.description, /^Experimented with the reference game/);
  });

  it("keeps a send a send even when the page was replaced around it", () => {
    // The break in the session is real and the submission is more so.
    // Ordering the rules the other way put an ORIENTING row over a stage
    // that contains a submit.
    const sent = reads({ submitted: true, entered: "help", discontinuity: "the page was reloaded and the session picked up again" });
    assert.equal(sent.sub, "SUBMIT_RESPONSE");
  });

  it("says nothing it cannot see, when it has seen nothing", () => {
    const silent = reads({ observed: false }, { durationMs: 122_000 });
    assert.equal(silent.sub, "NO_RECORDED_ACTIVITY");
    assert.equal(silent.confidence, "low");
    assert.match(silent.description, /^Nothing was recorded for 2m 2s\.$/);
  });
});

// A stretch is named for what somebody did in it, not for the button
// that got them into it.
//
// This was a real reading of a real session: a 1.5-second sign-in click
// was folded onto the front of seven seconds of playing a game, and
// because the rule keyed on the way in sat above the rule about the
// playing, twelve seconds of trace came out as "Signed in to start the
// session." The keystrokes were recorded, were in the evidence, and were
// nowhere in what the screen said.
describe("the way in does not outrank what happened", () => {
  const playing = (over: Partial<Evidence> = {}) => reads({
    surface: { key: "solution", label: "the reference game", role: "reference", frameIds: [] },
    acts: { keys: 13, clicks: 0, typing: 0, submits: 0, navigations: 0, gestures: 0 },
    keyNames: ["ArrowLeft", "ArrowRight", "ArrowDown"],
    ...over,
  });

  it("reads a stretch of playing as playing, whatever was clicked to reach it", () => {
    for (const entry of [[], ["login"], ["replay-reference"], ["open-reference"]]) {
      const r = playing({ entered_by: entry, controls: entry });
      assert.equal(r.sub, "EXPERIMENT_WITH_REFERENCE", `entered by ${JSON.stringify(entry)} → ${r.sub}`);
      assert.match(r.description, /^Played the reference game/);
      assert.match(r.because, /13 presses of ArrowLeft, ArrowRight, ArrowDown/);
    }
  });

  it("still says how they got there, in the same sentence", () => {
    assert.equal(playing().description, "Played the reference game.");
    assert.equal(playing({ entered_by: ["replay-reference"], controls: ["replay-reference"] }).description,
      "Played the reference game, after restarting it.");
  });

  it("keeps the rules about the way in for stretches that are only that", () => {
    // They are not wrong, they were only in the wrong order. A press
    // with nothing past it is still the press.
    assert.equal(reads({ controls: ["login"] }).sub, "SIGN_IN");
    assert.equal(reads({ controls: ["replay-reference"] }).sub, "REPLAY_REFERENCE");
  });

  it("asks the right question of each: signing in is an act, a tab is a doorway", () => {
    // Signing in keeps its own stretch, so it is never something a
    // stretch was ENTERED BY — a rule that asked entered_by could only
    // ever answer no about the very episode that is the signing in.
    assert.equal(reads({ entered_by: ["login"], controls: [] }).sub !== "SIGN_IN", true, "entered_by alone is not the signing in");
    assert.equal(reads({ controls: ["login"] }).sub, "SIGN_IN", "using it is");
  });
});
