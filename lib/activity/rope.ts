// ROPE, read as behaviour. This is the only module that knows anything
// about ROPE, and it is data: surfaces, channels, controls and an
// ordered list of rules. Everything it asserts is tied to something the
// trace actually holds, and where it cannot be, it says UNCLEAR.
//
// ROPE (github.com/mqo00/rope) puts a person in front of three columns:
// a tutor they talk to, a requirements document that fills in as the
// tutor accepts what they wrote, and a panel that switches between their
// own generated game and a reference implementation of the same game.
// The work is to reconstruct the requirements of a game — Tetris in the
// sessions we have — from feedback and from watching the reference.
//
// Two of the classes in the brief are deliberately absent.
// COMPARE_RESPONSE_TO_REFERENCE is not here because nothing in the trace
// distinguishes comparing from sitting still: everything it would catch
// is better said by REVISE_AFTER_REFERENCE when an edit followed, and by
// IDLE_OR_UNCLEAR when one did not. EVALUATING stays in the broad
// taxonomy, where it belongs, and no ROPE rule emits it. OPEN_REFERENCE_
// SOLUTION and RETURN_TO_RESPONSE_AFTER_REFERENCE are not episodes
// either; they are transitions, absorbed into the episode they explain,
// which is how REVISE_AFTER_REFERENCE tells itself from REVISE_AFTER_
// FEEDBACK.
import { anchor, count, gist, said, spell, type Context, type Reading, type Rule, type Taxonomy } from "@/lib/activity/taxonomy";


// ---- the documents
//
// The panel keeps both games mounted at once and only hides one
// (system/app/page.tsx:1589,1603), so which one a person was working is
// not a matter of what is on screen but of which document their keys
// went to. The sandbox names itself in its own query string.
const SURFACES: Taxonomy["surfaces"] = {
  // ROPE is a single page with no router, so the page itself is a
  // surface: "/" when the trace has the document, "top" when a stage —
  // a model call — happened on no document at all.
  "/": { label: "the tutoring page", role: "shell" },
  top: { label: "the tutoring page", role: "shell" },
  "my-canvas": { label: "their canvas", role: "own" },
  solution: { label: "the reference game", role: "reference" },
};
const stepSurface = /^solution-step-\d+$/;

// ---- what puts text on screen
const CHANNELS: Taxonomy["channels"] = [
  {
    id: "tutor",
    label: "the tutor",
    from: "system",
    // The tutor's answer streams into a message of its own inside the
    // conversation. What a person sent is written straight into the list
    // that holds the messages, one level up — that is how the two are
    // told apart, and it holds in both exchanges of the recorded session.
    //
    // Matching on the words instead would read the page as the tutor:
    // ROPE rerenders whole containers, and a repaint of `main` or `body`
    // carries every word on the screen, the tutor's among them.
    is: (a) => /^main > div:nth-of-type\(2\) > div:nth-of-type\(2\) > div > div/.test(a.container ?? ""),
  },
  {
    id: "participant",
    label: "the person",
    from: "person",
    is: (a) => a.container === "main > div:nth-of-type(2) > div:nth-of-type(2) > div",
  },
  {
    id: "requirements",
    label: "the requirements document",
    from: "system",
    // The document fills in a word at a time as the tutor accepts what
    // was written, and those mutations land on the page container itself.
    is: (a) => a.container === "main" || /^main > div:nth-of-type\(3\)/.test(a.container ?? ""),
  },
];

// ---- controls worth naming
const CONTROLS: Taxonomy["controls"] = [
  { id: "open-reference", label: "the Solution tab", is: anchor.any(anchor.testid("tab-solution"), anchor.text("Solution")) },
  { id: "open-own", label: "the My canvas tab", is: anchor.any(anchor.testid("tab-my-canvas"), anchor.text("My canvas")) },
  { id: "replay-reference", label: "Replay", is: anchor.any(anchor.testid("replay-solution"), anchor.text("Replay")) },
  { id: "generate", label: "Generate Game", moment: true, is: anchor.text("Generate Game") },
  { id: "next-step", label: "Next Step", moment: true, is: anchor.text("Next Step") },
  { id: "reset", label: "Reset", moment: true, is: anchor.text("Reset") },
  { id: "end", label: "End", moment: true, is: anchor.text("End") },
  { id: "change-game", label: "Change Game", moment: true, is: anchor.text("Change Game") },
  { id: "login", label: "the sign-in button", moment: true, is: anchor.text("login") },
  { id: "composer", label: "the message box", is: anchor.all(anchor.tag("textarea", "form"), anchor.selector("form")) },
  { id: "game", label: "the game", is: anchor.id("game-canvas") },
];

// ---- reading helpers
const on = (c: Context, ...roles: string[]) => roles.includes(c.evidence.surface.role);
const did = (c: Context) => c.evidence.acts;
const busy = (c: Context) => did(c).keys + did(c).clicks + did(c).typing > 0;
const came = (c: Context, id: string) => c.evidence.entered_by.includes(id);
// Used at all, whether on the way in or as the act itself. A rule that
// IS somebody pressing a button asks this; a rule about the stretch a
// button led into asks `came`.
const used = (c: Context, id: string) => c.evidence.controls.includes(id);
// Somebody in front of the message box with nothing sent yet. The
// segmenter knows where that stretch ends because it knows where the
// send was; the edit count is a fallback, because ROPE's textarea does
// not emit an input event for every character and eleven seconds of
// writing can arrive as no edits at all.
const composing = (c: Context) => c.evidence.composing || c.evidence.acts.typing > 0;
// The keys a Tetris board answers to. Browser key names are a fixed
// vocabulary; that these particular ones mean moving and rotating a
// piece is ROPE's business, which is why it is said here.
const PLAY = /^(Arrow(Left|Right|Up|Down)| |Space|Spacebar)$/;
const playing = (c: Context) => c.evidence.acts.keys > 0 && c.evidence.keyNames.some((k) => PLAY.test(k));
const submittedBefore = (c: Context) => c.before.some((e) => e.subBehavior === "SUBMIT_RESPONSE");
const lastTutorText = (c: Context): string | null => {
  for (let i = c.before.length - 1; i >= 0; i--) {
    const t = said(c.before[i].evidence, "tutor");
    if (t) return t;
  }
  return null;
};
const read = (description: string, because: string, confidence: Reading["confidence"] = "high"): Reading => ({ description, because, confidence });

// ---- the rules, in order. First one that reads the episode wins.
const RULES: Rule[] = [
  {
    // First, and unconditional. Nothing was recorded, so nothing can be
    // said about it: ROPE reports no scrolling, no window focus and no
    // visibility, which means time in front of an unchanging screen and
    // time away from the desk look exactly alike. Naming the panel that
    // happened to be open would be a reading, and the panel is a fact
    // worth stating without one.
    sub: "NO_RECORDED_ACTIVITY",
    broad: "UNCLEAR",
    when: (c) => !c.evidence.observed,
    read: (c) => read(
      busy(c)
        ? `Nothing further was recorded for ${spell(c.durationMs)}.`
        : `Nothing was recorded for ${spell(c.durationMs)}.`,
      `${c.evidence.surface.label} was the last thing open; the interface reports nothing that would tell time spent reading from time away`,
      "low",
    ),
  },
  {
    // A re-login is the one break in the session ROPE makes visible, and
    // it is never a transition: the page went away and somebody had to
    // put their subject id back in to carry on.
    //
    // Signing in at the *start* is not that, and saying "signed back in
    // to carry on" about the first thing somebody ever did is simply
    // false — which is what this rule said about the opening episode of
    // every session, at high confidence, because the sign-in branch
    // never checked whether anything had been replaced. The two cases
    // are now separate and neither claims the other's evidence.
    //
    // It sits behind the sending rules on purpose. A page that is
    // replaced around a submission must not take the submission's row.
    sub: "RESUME_SESSION",
    broad: "ORIENTING",
    when: (c) => !!c.evidence.discontinuity && !c.evidence.submitted,
    read: (c) => read(
      used(c, "login") ? "Signed back in after the page was replaced." : "The page was replaced and the session picked up again.",
      used(c, "login")
        ? "the document behind the page was replaced, and the sign-in was used in what followed"
        : c.evidence.discontinuity ?? "the document behind the page was replaced",
    ),
  },
  // What somebody did in a stretch outranks the button that got them
  // into it. SIGN_IN and REPLAY_REFERENCE below both fire on the way in
  // — `came(...)` — and sitting above this they claimed stretches that
  // were mostly playing: seven seconds of Tetris read as "Signed in to
  // start the session." A rule about the entrance is the right reading
  // only when nothing happened past it, which is now what it means.
  {
    sub: "EXPERIMENT_WITH_REFERENCE",
    broad: "EXPLORING",
    when: (c) => on(c, "reference") && did(c).keys + did(c).clicks > 1,
    // Say what was counted. This used to fire on keys *or* clicks and
    // then report the key count, so an episode of nothing but clicks
    // announced that "0 movement and rotation controls were used" — and
    // it called them movement and rotation keys without ever reading a
    // key name, which the trace carries.
    read: (c) => {
      const n = did(c).keys, clicks = did(c).clicks;
      const moved = playing(c);
      // How the stretch was entered belongs in the sentence, not instead
      // of it. Pressing Replay and then playing for eleven seconds was
      // read as "Replayed the reference game from the start", because a
      // rule keyed on the way in sat above this one; the press is worth
      // saying, and it is not what somebody spent the stretch doing.
      const after = came(c, "replay-reference") ? ", after restarting it" : "";
      return read(
        // No "to see how it behaves". That is a reason, and a reason is
        // not in the trace: what was recorded is that somebody worked
        // the controls of a game they did not write. Saying why they did
        // is the one thing this layer must never do, and a sentence that
        // does it here is worse than one higher up, because everything
        // above reads these sentences as fact.
        moved ? `Played the reference game${after}.` : `Experimented with the reference game${after}.`,
        moved
          ? `${count(n, "press", "presses")} of ${c.evidence.keyNames.filter((k) => PLAY.test(k)).join(", ")} in the reference game over ${spell(c.durationMs)}`
          : `${count(n, "key")} and ${count(clicks, "click")} in the reference game over ${spell(c.durationMs)}`,
      );
    },
  },
  {
    sub: "SIGN_IN",
    broad: "ORIENTING",
    when: (c) => used(c, "login") && !c.evidence.submitted,
    read: () => read("Signed in to start the session.", "the sign-in was used and nothing had been replaced"),
  },
  {
    sub: "WAIT_FOR_TUTOR_RESPONSE",
    broad: "WAITING",
    // Not "and did nothing else". A call is open for seconds and people
    // fill them — a click on the canvas panel, a few arrow keys. Those
    // belong to the wait as evidence inside it; making them an episode
    // of their own would put two rows over one stretch of clock. What
    // ends a wait is going back to the message box, which the segmenter
    // cuts at, not fidgeting during it.
    // A call has to have been open. The role alone is not enough: a
    // submission that opened no call still leaves a stretch after it,
    // and reading that as "a model call was open for 6s" asserts a call
    // that the trace does not have.
    when: (c) => c.evidence.awaiting && !!c.evidence.call && !c.evidence.submitted && !c.evidence.composing,
    read: (c) => {
      const n = did(c).clicks + did(c).keys;
      const answer = said(c.evidence, "tutor");
      return read(
        answer ? `Waited for the tutor, which answered: “${gist(answer, 44)}”.` : "Waited for the tutor to answer.",
        n > 0
          ? `a model call was open for ${spell(c.durationMs)}, with ${count(n, "incidental click and key", "incidental clicks and keys")} while it ran`
          : `a model call was open for ${spell(c.durationMs)} and nothing else was done`,
      );
    },
  },
  {
    sub: "SUBMIT_RESPONSE",
    broad: "ACTING",
    // The send, and only the send. The stretch in front of the message
    // box before it is FORMULATING and the stretch after it is WAITING;
    // this is the instant between them, which is why it is usually a
    // second or less.
    when: (c) => c.evidence.submitted,
    read: (c) => {
      const sent = c.evidence.entered;
      return read(
        sent ? `Sent the tutor a message: “${gist(sent, 44)}”.` : "Submitted the response.",
        "a submit was recorded in the trace",
      );
    },
  },
  {
    sub: "GENERATE_GAME",
    broad: "ACTING",
    // Only when the control itself was used. An earlier version also
    // guessed from "a click, then a model call, and nothing said" — which
    // is the shape of every submission, and it read the first message of
    // the real session as a generate.
    when: (c) => used(c, "generate"),
    read: () => read("Generated the game from the requirements so far.", "the Generate Game action was clicked"),
  },
  {
    sub: "ADVANCE_TO_NEXT_STEP",
    broad: "ACTING",
    when: (c) => used(c, "next-step"),
    read: () => read("Moved on to the next step.", "the Next Step action was clicked"),
  },
  {
    sub: "SESSION_CONTROL",
    broad: "ACTING",
    when: (c) => ["reset", "end", "change-game"].some((id) => used(c, id)),
    read: (c) => {
      const which = ["reset", "end", "change-game"].find((id) => used(c, id));
      const word = which === "reset" ? "Reset the session" : which === "end" ? "Ended the session" : "Changed the game";
      return read(`${word}.`, `the ${which} control was used`);
    },
  },
  {
    sub: "REPLAY_REFERENCE",
    broad: "EXPLORING",
    when: (c) => used(c, "replay-reference"),
    read: (c) => read(
      "Replayed the reference game from the start.",
      `Replay was pressed and the reference ran again for ${spell(c.durationMs)}`,
    ),
  },
  {
    sub: "INSPECT_REFERENCE_SOLUTION",
    broad: "UNDERSTANDING",
    when: (c) => on(c, "reference") && !busy(c),
    read: (c) => read(
      "Appeared to study the reference game.",
      `the reference game was the open panel for ${spell(c.durationMs)} with no controls used`,
      "medium",
    ),
  },
  {
    sub: "INSPECT_OWN_WORK",
    broad: "UNDERSTANDING",
    when: (c) => on(c, "own"),
    read: (c) => read(
      busy(c) ? "Tried out the game on their own canvas." : "Appeared to look over their own canvas.",
      busy(c)
        ? `${count(did(c).keys, "key")} and ${count(did(c).clicks, "click")} on their canvas over ${spell(c.durationMs)}`
        : `their canvas was the open panel for ${spell(c.durationMs)} with no controls used`,
      busy(c) ? "high" : "medium",
    ),
  },
  // The three composing rules differ in what came just before, and not
  // in what the person was doing: all three are somebody in front of the
  // message box with nothing sent yet, which is FORMULATING.
  //
  // They were REVISING until the boundaries were put in. That was wrong
  // about ROPE. A message that has been sent cannot be edited — the
  // conversation is a chat — so writing after feedback is writing the
  // next message, not revising the last one. The context is worth saying
  // and it belongs in the sub-behaviour and the sentence, not in a broad
  // class that claims existing work was changed.
  {
    sub: "FORMULATE_AFTER_REFERENCE",
    broad: "FORMULATING",
    when: (c) => composing(c) && submittedBefore(c) && c.before.slice(-3).some((e) => e.evidence.surface.role === "reference"),
    read: (c) => read(
      "Worked on the next message, having just been in the reference game.",
      `the message box was open for ${spell(c.durationMs)} after a stretch in the reference game`,
    ),
  },
  {
    sub: "FORMULATE_AFTER_FEEDBACK",
    broad: "FORMULATING",
    when: (c) => composing(c) && submittedBefore(c),
    read: (c) => read(
      "Worked on the next message, after the tutor's answer.",
      `the message box was open for ${spell(c.durationMs)} after the tutor answered the previous message`,
    ),
  },
  {
    sub: "FORMULATE_RESPONSE",
    broad: "FORMULATING",
    // Time in the message box with nothing sent yet. The segmenter knows
    // where that stretch ends because it knows where the send was, so
    // this is a fact about the trace rather than a guess from how many
    // keystrokes were counted — which matters here, because ROPE's
    // textarea does not emit an input event for every character and an
    // eleven-second stretch of writing can show up as no edits at all.
    when: (c) => composing(c),
    read: (c) => {
      const edits = did(c).typing;
      return read(
        "Worked on a message to the tutor.",
        edits > 0
          ? `${edits} edits in the message box over ${spell(c.durationMs)} before anything was sent`
          : `the message box was open for ${spell(c.durationMs)} before anything was sent`,
      );
    },
  },
  {
    sub: "READ_TUTOR_PROMPT",
    broad: "UNDERSTANDING",
    when: (c) => !!said(c.evidence, "tutor") && !submittedBefore(c) && !busy(c),
    read: (c) => {
      const text = said(c.evidence, "tutor") ?? "";
      return read(
        `Appeared to read the tutor's opening prompt: “${gist(text, 40)}”.`,
        `the prompt was on screen for ${spell(c.durationMs)} with no competing observed activity`,
        "medium",
      );
    },
  },
  {
    sub: "READ_TUTOR_FEEDBACK",
    broad: "UNDERSTANDING",
    when: (c) => (!!said(c.evidence, "tutor") || (!busy(c) && !!lastTutorText(c) && c.previous?.broadBehavior === "WAITING")) && !busy(c),
    read: (c) => {
      const text = said(c.evidence, "tutor") ?? lastTutorText(c) ?? "";
      return read(
        text ? `Appeared to review the tutor's feedback: “${gist(text, 40)}”.` : "Appeared to review the tutor's feedback.",
        `the feedback appeared and stayed on screen for ${spell(c.durationMs)} with no competing observed activity`,
        "medium",
      );
    },
  },
  {
    sub: "READ_REQUIREMENT_DOC",
    broad: "UNDERSTANDING",
    when: (c) => !!said(c.evidence, "requirements") && !busy(c),
    read: (c) => read(
      "Appeared to review the requirements written so far.",
      `the requirements document changed and stayed on screen for ${spell(c.durationMs)} with nothing else done`,
      "medium",
    ),
  },
  {
    sub: "NAVIGATE_OR_ORIENT",
    broad: "ORIENTING",
    when: (c) => c.index === 0 && !busy(c),
    read: () => read("Got started in the interface.", "this is where the session opens", "medium"),
  },
];

const FALLBACK: Rule = {
  sub: "IDLE_OR_UNCLEAR",
  broad: "UNCLEAR",
  when: () => true,
  read: (c) => {
    const quiet = c.evidence.quietMs >= c.durationMs * 0.8;
    return read(
      quiet ? "No recorded activity." : "Activity that the trace does not characterise.",
      quiet
        ? `nothing was observed for ${spell(c.durationMs)}`
        : `${count(did(c).clicks, "click")} and ${count(did(c).keys, "key")} in ${c.evidence.surface.label}, with nothing that identifies the activity`,
      "low",
    );
  },
};

export const ROPE_TAXONOMY: Taxonomy = {
  name: "ROPE",
  surfaces: SURFACES,
  channels: CHANNELS,
  controls: CONTROLS,
  rules: RULES,
  fallback: FALLBACK,
};

// A surface key the table does not name. Step-by-step reference frames
// are minted per step, so they are matched by shape rather than listed.
export function ropeSurface(key: string): { label: string; role: Taxonomy["surfaces"][string]["role"] } {
  if (SURFACES[key]) return SURFACES[key];
  if (stepSurface.test(key)) return { label: `the reference for step ${key.split("-").pop()}`, role: "reference" };
  return { label: key, role: "other" };
}
