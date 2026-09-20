// What a summary may claim, and what it may not.
//
// The invariant these pin is one sentence: do not state an unobserved
// mental state, understanding, intention or motivation as fact. The
// interesting half is the second one — this is not a word blacklist, and
// a summary that reports what somebody actually wrote is reporting, not
// mind-reading. So the same sentence passes or fails depending on what
// the person typed, and both directions are tested.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkSummary } from "../../lib/activity/claims.ts";
import type { Story, StoryEpisode } from "../../lib/activity/story.ts";

const episode = (over: Partial<StoryEpisode> = {}): StoryEpisode => ({
  n: 1, broad: "ACTING", sub: "SUBMIT_RESPONSE", durationMs: 1_000,
  where: "the tutoring page", description: "Sent the tutor a message.",
  wrote: null, said: [], ...over,
});

const storyOf = (episodes: StoryEpisode[]): Story => ({
  taxonomy: "rope", spanMs: 60_000, episodeCount: episodes.length, unclearShare: 0, truncated: false, episodes,
});

// A session in which nobody wrote anything about their own head.
const PLAIN = storyOf([
  episode({ wrote: "can you help me" }),
  episode({ n: 2, broad: "WAITING", sub: "WAIT_FOR_TUTOR_RESPONSE", description: "Waited for the tutor.", said: [{ channel: "tutor", text: "Sure! Start by listing the main steps in designing a Tetris game." }] }),
  episode({ n: 3, wrote: "create a 8 x 6 board" }),
]);

const ok = (text: string, story = PLAIN) => checkSummary(text, story);

describe("a summary is one short paragraph", () => {
  it("takes one to three sentences", () => {
    assert.equal(ok("The participant asked the tutor for help.").ok, true);
    assert.equal(ok("The participant asked for help. The tutor replied. They proposed a board.").ok, true);
  });

  it("refuses an essay", () => {
    const four = "The participant asked for help. The tutor replied. They proposed a board. Then more happened.";
    const verdict = ok(four);
    assert.equal(verdict.ok, false);
    assert.match(verdict.ok === false ? verdict.reason : "", /4 sentences/);
  });

  it("refuses nothing at all, and anything that is not a sentence", () => {
    assert.equal(ok("").ok, false);
    assert.equal(checkSummary(null, PLAIN).ok, false);
    assert.equal(checkSummary({ summary: "nice try" }, PLAIN).ok, false);
  });
});

describe("mental states, understanding, intention and motivation", () => {
  it("refuses them when nobody recorded them", () => {
    for (const claim of [
      "The participant understood how the board works.",
      "The participant was confused by the tutor's answer.",
      "The participant learned about Tetris pieces.",
      "The participant struggled with the requirements.",
      "The participant realised they needed a smaller board.",
      "The participant was frustrated and asked for help.",
      "The participant wanted a smaller board.",
      "The participant decided to ask the tutor.",
      "The participant got stuck on the board size.",
    ]) {
      const verdict = ok(claim);
      assert.equal(verdict.ok, false, `should have refused: ${claim}`);
      assert.match(verdict.ok === false ? verdict.reason : "", /claimed something nobody recorded/);
    }
  });

  it("allows them when the person's own words carry them", () => {
    // The adjustment that matters. "I want to understand rotation" makes
    // wanting and understanding things this person said, and reporting
    // what somebody said is not reading their mind.
    const said = storyOf([episode({ wrote: "I want to understand how rotation works" })]);
    assert.equal(checkSummary("The participant asked the tutor to help them understand rotation.", said).ok, true);
    assert.equal(checkSummary("The participant said they wanted to understand rotation.", said).ok, true);
    // And a different claim, on the same session, is still refused.
    assert.equal(checkSummary("The participant was frustrated by rotation.", said).ok, false);
  });

  it("does not take the tutor's words as grounds for a claim about the person", () => {
    // A tutor asking "are you confused?" says nothing about whether
    // anybody was. Only the person's own words ground a claim about them.
    const asked = storyOf([episode({ said: [{ channel: "tutor", text: "Are you confused about the board? Do you understand the rules?" }] })]);
    assert.equal(checkSummary("The participant was confused about the board.", asked).ok, false);
    assert.equal(checkSummary("The participant understood the rules.", asked).ok, false);
  });

  it("refuses a reason for an action, which is motivation by another name", () => {
    assert.equal(ok("The participant played the reference game to see how it behaves.").ok, false);
    assert.equal(ok("The participant opened the reference game in order to compare it.").ok, false);
    assert.equal(ok("The participant was trying to build a smaller board.").ok, false);
    // The same session, said without the reason:
    assert.equal(ok("The participant experimented with the reference game, then asked the tutor for help.").ok, true);
  });

  it("does not trip over a tutor that says think about something", () => {
    // Half of these sessions contain "Think about the board". Reporting
    // what the tutor asked is a fact about the tutor.
    const guided = storyOf([episode({ said: [{ channel: "tutor", text: "Think about the board, the pieces, and the movements." }] })]);
    assert.equal(checkSummary("The participant was pointed toward the board, the pieces and the movements.", guided).ok, true);
  });
});

describe("mechanism, which a reader would go to the canvas for", () => {
  it("is refused however it is phrased", () => {
    for (const claim of [
      "The participant clicked through the reference game.",
      "The participant used 18 keypresses in the reference game.",
      "The participant's session included two model calls.",
      "The participant waited 5000 milliseconds for a network request.",
      "The participant moved between frames in the interface.",
    ]) {
      const verdict = ok(claim);
      assert.equal(verdict.ok, false, `should have refused: ${claim}`);
      assert.match(verdict.ok === false ? verdict.reason : "", /described the mechanism/);
    }
  });

  it("is refused even where the person typed the word themselves", () => {
    // Unlike a mental state. That somebody wrote "I clicked the button"
    // does not make a summary of their session a description of clicks.
    const typed = storyOf([episode({ wrote: "I clicked the button and nothing happened" })]);
    assert.equal(checkSummary("The participant reported that they clicked the button.", typed).ok, false);
  });

  it("refuses the timeline's own vocabulary", () => {
    assert.match(ok("The participant moved through nine episodes of activity.").ok === false ? (ok("The participant moved through nine episodes of activity.") as { reason: string }).reason : "", /mechanism|identifiers/);
    const shouted = ok("The participant was FORMULATING and then ACTING.");
    assert.equal(shouted.ok, false);
    assert.match(shouted.ok === false ? shouted.reason : "", /identifiers/);
  });
});

describe("quotation", () => {
  it("allows what was on screen", () => {
    assert.equal(ok('The participant asked "can you help me", then proposed a board.').ok, true);
    // Loosely, because a board somebody called "8 x 6" is the same board
    // written 8×6, and refusing over the sign would be the check
    // inventing a disagreement.
    assert.equal(ok('The participant proposed "a 8×6 board" to the tutor.').ok, true);
  });

  it("refuses what was not", () => {
    const verdict = ok('The participant asked "please generate a full Tetris clone".');
    assert.equal(verdict.ok, false);
    assert.match(verdict.ok === false ? verdict.reason : "", /quoted something that was never shown/);
  });
});

describe("the summary that comes back", () => {
  it("is returned tidied and unchanged in substance", () => {
    const verdict = ok("  The participant asked   the tutor for help.\n");
    assert.equal(verdict.ok, true);
    assert.equal(verdict.ok === true ? verdict.summary : "", "The participant asked the tutor for help.");
  });

  it("accepts the kind of paragraph this whole layer exists to produce", () => {
    const good = "The participant experimented with the reference Tetris game, then asked the tutor for help defining the game's requirements. After receiving guidance, they proposed creating an 8×6 board and continued working from the tutor's feedback.";
    const verdict = ok(good);
    assert.equal(verdict.ok, true, verdict.ok === false ? verdict.reason : "");
  });
});
