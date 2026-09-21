// The same artifact, said twice: once as the handwritten taxonomy and
// once as data compiled through machinery that has never heard of it.
//
// This is the test the profile language exists to pass. If the two
// disagree about a session somebody actually sat through, the language is
// missing something, and the right answer is to say which operator is
// missing rather than to let the compiler learn one artifact's habits.
//
// It is in two halves because one recording is not enough. The frozen
// session exercises thirteen stretches and five rules; the battery below
// puts a hand-built evidence through every rule there is, including the
// fourteen that this particular afternoon never reached.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { classify } from "../../../lib/activity/classify.ts";
import { readSession } from "../../../lib/activity/read.ts";
import { DEFAULT_SEGMENTATION } from "../../../lib/activity/segment.ts";
import { ROPE_TAXONOMY, ropeSurface } from "../../../lib/activity/rope.ts";
import { validateProfile } from "../../../lib/activity/profile/validate.ts";
import { compileProfile } from "../../../lib/activity/profile/compile.ts";
import type { Context, Taxonomy } from "../../../lib/activity/taxonomy.ts";
import type { Episode, Evidence } from "../../../lib/activity/types.ts";
import { events, frames, stages, callInfo } from "../session.mts";

const source = JSON.parse(readFileSync(fileURLToPath(new URL("../../fixtures/rope-profile.json", import.meta.url)), "utf8"));
const checked = validateProfile(source);
if (!checked.ok) throw new Error(`the ROPE profile does not validate:\n${checked.issues.map((i) => `${i.path} ${i.message}`).join("\n")}`);
const compiled = compileProfile(checked.profile);

describe("the ROPE profile, compiled, reads the frozen session as the handwritten taxonomy does", () => {
  const hand = classify({ stages, frames, events, taxonomy: ROPE_TAXONOMY, surfaceOf: ropeSurface, calls: callInfo });
  const data = classify({ stages, frames, events, taxonomy: compiled.taxonomy, surfaceOf: compiled.surfaceOf, calls: callInfo });

  it("cuts the session into the same stretches", () => {
    // Segmentation is not independent of the taxonomy: which controls are
    // deeds rather than doors decides which brief stretches keep their own
    // row. Identical bounds mean the profile got that right too.
    assert.deepEqual(data.map((e) => [e.startedAt, e.endedAt]), hand.map((e) => [e.startedAt, e.endedAt]));
  });

  it("names the same documents", () => {
    assert.deepEqual(data.map((e) => [e.evidence.surface.key, e.evidence.surface.label, e.evidence.surface.role]),
      hand.map((e) => [e.evidence.surface.key, e.evidence.surface.label, e.evidence.surface.role]));
  });

  it("finds the same controls", () => {
    assert.deepEqual(data.map((e) => [e.evidence.controls, e.evidence.entered_by]), hand.map((e) => [e.evidence.controls, e.evidence.entered_by]));
  });

  it("hears the same channels", () => {
    assert.deepEqual(data.map((e) => e.evidence.appeared.map((a) => [a.channel, a.fresh])),
      hand.map((e) => e.evidence.appeared.map((a) => [a.channel, a.fresh])));
    // And therefore recovers the same message, which is only ever
    // readable as the text the application echoed back.
    assert.deepEqual(data.map((e) => e.evidence.entered), hand.map((e) => e.evidence.entered));
  });

  it("says the same sentence about every one of them", () => {
    const say = (e: Episode) => [e.broadBehavior, e.subBehavior, e.description, e.because, e.confidence];
    assert.deepEqual(data.map(say), hand.map(say));
  });
});

describe("the one way this application reads a session takes a taxonomy, and names nothing without one", () => {
  it("reads ROPE as ROPE when it is told the session is ROPE's", () => {
    const hand = classify({ stages, frames, events, taxonomy: ROPE_TAXONOMY, surfaceOf: ropeSurface, calls: callInfo, segmentation: DEFAULT_SEGMENTATION });
    const through = readSession({ stages, frames, events, calls: callInfo, taxonomy: ROPE_TAXONOMY, surfaceOf: ropeSurface });
    assert.deepEqual(through.map((e) => [e.subBehavior, e.description, e.because]), hand.map((e) => [e.subBehavior, e.description, e.because]));
  });

  it("reads it through a profile when it is given one", () => {
    const through = readSession({ stages, frames, events, calls: callInfo, taxonomy: compiled.taxonomy, surfaceOf: compiled.surfaceOf });
    const direct = classify({ stages, frames, events, taxonomy: compiled.taxonomy, surfaceOf: compiled.surfaceOf, calls: callInfo });
    assert.deepEqual(through.map((e) => e.description), direct.map((e) => e.description));
  });

  it("says nothing about any artifact when it is given nothing", () => {
    // The default used to be ROPE, so an artifact nobody had read was
    // described in ROPE's words. This is the guard against that coming
    // back: given no taxonomy, not one noun of this artifact may appear.
    const blind = readSession({ stages, frames, events, calls: callInfo });
    const said = blind.flatMap((e) => [e.description, e.because]).join(" ").toLowerCase();
    for (const word of ["tutor", "tutoring", "reference game", "their canvas", "requirements", "message box"]) {
      assert.ok(!said.includes(word), `the blind reading said "${word}"`);
    }
    assert.deepEqual([...new Set(blind.map((e) => e.evidence.surface.role))], ["other"]);
    // A document is called what the trace called it — its own key — and
    // never what another artifact's taxonomy would have called it.
    const labels = new Set(blind.map((e) => e.evidence.surface.label));
    const keys = new Set(blind.map((e) => e.evidence.surface.key));
    assert.deepEqual([...labels].sort(), [...keys].sort(), "a blind label is the key itself");
    // And it is still a reading: the facts that hold in any artifact.
    const subs = new Set(blind.map((e) => e.subBehavior));
    assert.ok(subs.size > 1, `the blind reading collapsed everything into ${[...subs].join(", ")}`);
    for (const sub of subs) assert.ok(["WAIT_FOR_MODEL_CALL", "SUBMIT", "TYPE_INTO_FIELD", "IDLE_OR_UNCLEAR"].includes(sub), `unexpected ${sub}`);
  });

  it("does not name another artifact's documents with this one's words", () => {
    // A caller that brings a taxonomy and no way of naming surfaces must
    // not silently inherit ROPE's. Every rule about a named document has
    // to fail closed instead.
    const bare = { ...compiled.taxonomy, surfaces: {} };
    const through = readSession({ stages, frames, events, calls: callInfo, taxonomy: bare });
    assert.deepEqual([...new Set(through.map((e) => e.evidence.surface.role))], ["other"]);
    assert.ok(!through.some((e) => e.evidence.surface.label === "the reference game"), "no label leaked from the handwritten taxonomy");
  });
});

// ---- every rule, including the ones this afternoon never reached
const BLANK: Evidence = {
  surface: { key: "/", label: "the tutoring page", role: "shell", frameIds: [] },
  regions: [], acts: { keys: 0, clicks: 0, typing: 0, submits: 0, navigations: 0, gestures: 0 },
  keyNames: [], appeared: [], entered: null, observed: true,
  composing: false, submitted: false, awaiting: false, call: null,
  entered_by: [], controls: [], openingQuietMs: 0, quietMs: 0, discontinuity: null,
};

const episode = (over: Partial<Episode>): Episode => ({
  id: "episode:x", broadBehavior: "UNCLEAR", subBehavior: "IDLE_OR_UNCLEAR", description: "", startedAt: "", endedAt: "",
  durationMs: 0, confidence: "low", determined: "rule", because: "", evidence: BLANK, stageIds: [], stages: [], events: [], ...over,
});

const reference = { key: "solution", label: "the reference game", role: "reference" as const, frameIds: [] };
const own = { key: "my-canvas", label: "their canvas", role: "own" as const, frameIds: [] };
const heard = (channel: string, text: string, fresh = true) => [{ at: 0, channel, text, fresh }];
const sentBefore = [episode({ subBehavior: "SUBMIT_RESPONSE" })];
// A send, and then an answer to it. "After the tutor's answer" needs
// both: a send alone leaves the person writing their first message
// again, which is a different reading and a different sentence.
const answeredBefore = [...sentBefore, episode({ evidence: { ...BLANK, appeared: heard("tutor", "Close. What about rotation near the wall?") } })];
const RELOADED = "the page was reloaded and the session picked up again";

const asked = (taxonomy: Taxonomy, over: Partial<Evidence>, ctx: Partial<Context>) => {
  const c: Context = { evidence: { ...BLANK, ...over }, durationMs: 6_000, index: 0, previous: null, before: [], ...ctx };
  const rule = taxonomy.rules.find((r) => r.when(c)) ?? taxonomy.fallback;
  const reading = rule.read(c);
  return { sub: rule.sub, broad: rule.broad, ...reading };
};

// Each case is aimed at one rule, and named for what it is a case of.
const CASES: { name: string; evidence: Partial<Evidence>; context?: Partial<Context> }[] = [
  { name: "nothing recorded at all", evidence: { observed: false }, context: { durationMs: 122_000 } },
  { name: "nothing recorded, but acts on the way in", evidence: { observed: false, acts: { ...BLANK.acts, clicks: 2 } } },
  { name: "the page was replaced, and they signed back in", evidence: { discontinuity: RELOADED, controls: ["login"] } },
  { name: "the page was replaced, and they did not", evidence: { discontinuity: RELOADED } },
  { name: "playing the reference game", evidence: { surface: reference, acts: { ...BLANK.acts, keys: 12 }, keyNames: ["ArrowLeft", "ArrowRight"] } },
  { name: "playing it again after a restart", evidence: { surface: reference, acts: { ...BLANK.acts, keys: 36 }, keyNames: ["ArrowLeft", " ", "q"], entered_by: ["replay-reference"] } },
  { name: "one press of a key nobody named", evidence: { surface: reference, acts: { ...BLANK.acts, keys: 1, clicks: 3 }, keyNames: ["a", "Tab"] } },
  { name: "clicking about in the reference game", evidence: { surface: reference, acts: { ...BLANK.acts, clicks: 4 } } },
  { name: "signing in at the start", evidence: { controls: ["login"] } },
  { name: "waiting, and the tutor answered", evidence: { awaiting: true, call: { callId: "mc_1", model: "gpt-4o", latencyMs: 800 }, appeared: heard("tutor", "You have made a good start. What happens when a row fills?") } },
  { name: "waiting, and fidgeting while it ran", evidence: { awaiting: true, call: { callId: "mc_1", model: null, latencyMs: null }, acts: { ...BLANK.acts, clicks: 1, keys: 2 } } },
  { name: "waiting, and doing nothing at all", evidence: { awaiting: true, call: { callId: "mc_1", model: null, latencyMs: null } } },
  { name: "waiting with no call in the trace", evidence: { awaiting: true, call: null } },
  { name: "sending a message the interface echoed", evidence: { submitted: true, entered: "the piece should fall faster over time" } },
  { name: "sending one it did not", evidence: { submitted: true } },
  { name: "sending while the page was replaced around it", evidence: { submitted: true, entered: "help", discontinuity: RELOADED } },
  { name: "generating the game", evidence: { controls: ["generate"] } },
  { name: "moving to the next step", evidence: { controls: ["next-step"] } },
  { name: "resetting", evidence: { controls: ["reset"] } },
  { name: "ending", evidence: { controls: ["end"] } },
  { name: "changing the game", evidence: { controls: ["change-game"] } },
  { name: "resetting and ending in one stretch", evidence: { controls: ["end", "reset"] } },
  { name: "replaying the reference", evidence: { controls: ["replay-reference"] } },
  { name: "sitting in front of the reference game", evidence: { surface: reference } },
  { name: "playing on their own canvas", evidence: { surface: own, acts: { ...BLANK.acts, keys: 9, clicks: 2 } } },
  { name: "looking over their own canvas", evidence: { surface: own } },
  { name: "writing, just back from the reference", evidence: { composing: true }, context: { before: [...sentBefore, episode({ evidence: { ...BLANK, surface: reference } })] } },
  { name: "writing after feedback", evidence: { composing: true }, context: { before: answeredBefore } },
  { name: "writing again after a send that was never answered", evidence: { composing: true }, context: { before: sentBefore } },
  { name: "writing the first message", evidence: { composing: true } },
  { name: "writing the first message, with three edits", evidence: { composing: true, acts: { ...BLANK.acts, typing: 3 } } },
  { name: "writing the first message, with one edit", evidence: { acts: { ...BLANK.acts, typing: 1 } } },
  { name: "reading the opening prompt", evidence: { appeared: heard("tutor", "Describe how the pieces should move. Be specific.") } },
  { name: "reading feedback that just arrived", evidence: { appeared: heard("tutor", "Close. What about rotation near the wall?") }, context: { before: sentBefore } },
  { name: "reading feedback still on screen after the wait", evidence: {}, context: {
      before: [...sentBefore, episode({ broadBehavior: "WAITING", evidence: { ...BLANK, appeared: heard("tutor", "Close. What about rotation near the wall?") } })],
      previous: episode({ broadBehavior: "WAITING" }) } },
  { name: "reading the requirements", evidence: { appeared: heard("requirements", "Pieces fall one row at a time.") } },
  { name: "the session opening", evidence: {}, context: { index: 0 } },
  { name: "clicks and keys that identify nothing", evidence: { acts: { ...BLANK.acts, clicks: 3, keys: 1 } }, context: { index: 4 } },
  { name: "a stretch that was mostly silence", evidence: { quietMs: 5_400 }, context: { index: 4, durationMs: 6_000 } },
  { name: "a repaint of words already on screen", evidence: { appeared: heard("tutor", "Describe how the pieces should move.", false) }, context: { index: 2 } },
];

// Where the two do not agree, and why.
//
// The handwritten rule interpolates a bare number — `${edits} edits` — so
// a single edit reads "1 edits". The profile language has no way to write
// that: the only way to put a number in a sentence is `count`, which
// takes the singular and the plural, because "1 clicks" is the kind of
// seam that makes a true sentence look machine-written and every because
// clause in this taxonomy counts something.
//
// So this is not a gap in the language. It is the language refusing to
// reproduce a bug, and it is listed here rather than quietly passed
// because the handwritten path is not being changed in this milestone and
// somebody should decide which sentence is the right one.
const DIVERGES: Record<string, { hand: string; data: string }> = {
  "writing the first message, with one edit": {
    hand: "1 edits in the message box over 6s before anything was sent",
    data: "1 edit in the message box over 6s before anything was sent",
  },
};

describe("the ROPE profile and the ROPE taxonomy read the same evidence the same way", () => {
  for (const c of CASES) {
    it(c.name, () => {
      const hand = asked(ROPE_TAXONOMY, c.evidence, c.context ?? {});
      const data = asked(compiled.taxonomy, c.evidence, c.context ?? {});
      const known = DIVERGES[c.name];
      if (!known) return assert.deepEqual(data, hand);
      // Both halves pinned, so that a change to either side shows up.
      assert.equal(hand.because, known.hand, "the handwritten wording");
      assert.equal(data.because, known.data, "the declarative wording");
      assert.deepEqual({ ...data, because: known.hand }, hand, "and nothing else differs");
    });
  }

  it("differs from the handwritten taxonomy in one place and no others", () => {
    const differing = CASES.filter((c) => {
      const hand = asked(ROPE_TAXONOMY, c.evidence, c.context ?? {});
      const data = asked(compiled.taxonomy, c.evidence, c.context ?? {});
      return JSON.stringify(hand) !== JSON.stringify(data);
    }).map((c) => c.name);
    assert.deepEqual(differing, Object.keys(DIVERGES));
  });

  it("reaches every rule between them", () => {
    // A battery that never fires a rule proves nothing about it. This is
    // the check that the cases above are a cover and not a sample.
    const reached = new Set(CASES.map((c) => asked(compiled.taxonomy, c.evidence, c.context ?? {}).sub));
    const missed = checked.profile.rules.map((r) => r.sub).filter((sub) => !reached.has(sub));
    assert.deepEqual(missed, [], `no case reaches ${missed.join(", ")}`);
    assert.ok(reached.has(checked.profile.fallback.sub), "nothing falls through to the fallback");
  });
});

// The sentence "after the tutor's answer" asserts something. Both
// readings have to require it, or the trace says a thing it cannot know.
describe("writing after a send is not writing after an answer", () => {
  for (const [name, taxonomy] of [["handwritten", ROPE_TAXONOMY], ["compiled from the profile", compiled.taxonomy]] as const) {
    it(`${name}: only claims the tutor answered when the tutor answered`, () => {
      const answered = asked(taxonomy, { composing: true }, { before: answeredBefore });
      assert.equal(answered.sub, "FORMULATE_AFTER_FEEDBACK");
      assert.match(answered.description, /after the tutor's answer/);

      const unanswered = asked(taxonomy, { composing: true }, { before: sentBefore });
      assert.equal(unanswered.sub, "FORMULATE_RESPONSE", "a send with no answer is still a first message");
      assert.doesNotMatch(unanswered.description, /tutor's answer/);
      assert.doesNotMatch(unanswered.because, /after the tutor answered/);
    });
  }
});
