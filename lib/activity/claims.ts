// What a summary of a session is allowed to claim.
//
// A prompt can ask a model not to say somebody understood something. It
// cannot promise it. This module is the promise: the answer comes back
// and is checked against the story it was written from, and a summary
// that fails is not shown at all. The timeline underneath it is the
// evidence and stands on its own, so there is nothing to degrade to.
//
// The invariant, stated once:
//
//   Do not state an unobserved mental state, understanding, intention or
//   motivation as fact.
//
// Which is not the same as banning the words. If somebody writes "I want
// to understand rotation", then they wanted to understand rotation, and a
// summary saying so is reporting what they wrote rather than reading
// their mind. So the mental-state vocabulary is checked for GROUNDING
// rather than forbidden: a term is allowed exactly when the person's own
// words contain it. Their words, specifically — the tutor asking "are you
// confused?" grounds nothing about whether they were.
//
// Two other things are refused outright. Mechanism, because a reader who
// wanted clicks would be looking at the canvas; and the taxonomy's own
// identifiers, because FORMULATING is our word for what somebody did and
// not a description of it.
import type { Story } from "@/lib/activity/story";

export type Verdict = { ok: true; summary: string } | { ok: false; reason: string };

const MIN_SENTENCES = 1;
const MAX_SENTENCES = 3;
const MAX_CHARS = 700;

// Surface forms grouped by the claim they make, so that a hit on any of
// them can be grounded by any other: somebody who wrote "I don't
// understand" grounds a summary that says they did not understand.
const MIND: string[][] = [
  ["understand", "understands", "understood", "understanding"],
  ["learn", "learns", "learned", "learnt", "learning"],
  ["realise", "realises", "realised", "realize", "realizes", "realized"],
  ["confused", "confusing", "confusion"],
  ["frustrated", "frustrating", "frustration"],
  ["struggle", "struggles", "struggled", "struggling"],
  ["stuck"],
  ["want", "wants", "wanted", "wanting"],
  ["intend", "intends", "intended", "intention", "intentions"],
  ["hope", "hopes", "hoped", "hoping"],
  ["wish", "wishes", "wished"],
  ["decide", "decides", "decided", "decision"],
  ["figure out", "figures out", "figured out", "figuring out"],
  ["grasp", "grasps", "grasped"],
  ["knew", "knows", "knowledge"],
  ["believe", "believes", "believed"],
  // "thought that" and not "think". A tutor that says "think about the
  // board" is on screen in half these sessions, and a summary reporting
  // what it asked is stating a fact about the tutor; only the assertion
  // that somebody held a belief is a claim about a mind.
  ["thought that", "thinks that", "was thinking", "were thinking"],
  ["curious", "curiosity"],
  ["unsure", "uncertain", "uncertainty"],
  // Purpose, which is motivation written as a clause. "Played the game to
  // see how it behaves" is a claim about why, and why is not in the
  // trace. Grounded the same way as the rest: somebody who wrote "I want
  // to see how rotation works" may be reported as wanting to see it.
  ["in order to", "so as to", "with the aim of", "so that they could", "so they could"],
  ["to see how", "to see whether", "to see if", "to find out"],
  ["trying to", "tried to", "attempting to", "attempted to"],
];

// Mechanism. No grounding escape: these are words about the instrument,
// and a person writing "I clicked the button" still does not make the
// summary of their session a description of clicks.
const MECHANICAL: RegExp[] = [
  /\bclick(s|ed|ing)?\b/i,
  /\bkey(press|presses|stroke|strokes|board)\b/i,
  /\bkeys were\b/i,
  /\bDOM\b/,
  /\bselectors?\b/i,
  /\btextareas?\b/i,
  /\biframes?\b/i,
  /\bHTTP\b/i,
  /\bAPIs?\b/,
  /\bendpoints?\b/i,
  /\bmodel calls?\b/i,
  /\blatenc(y|ies)\b/i,
  /\btrace events?\b/i,
  /\bnetwork requests?\b/i,
  /\bmilliseconds?\b/i,
  /\bpixels?\b/i,
  /\bsegmentation\b/i,
  /\bepisodes?\b/i,
  /\btimestamps?\b/i,
  /\bframes?\b/i,
];

// The taxonomy's identifiers, in any taxonomy: a run of capitals and
// underscores. FORMULATE_AFTER_FEEDBACK is a key, not a sentence.
const SHOUTED = /\b[A-Z][A-Z_]{3,}\b/;

// For comparing what was quoted against what was on screen. Loose on
// purpose: a model writing 8×6 for a board somebody called "8 x 6" is
// quoting it, and rejecting the summary over the sign would be the
// validator inventing a disagreement.
const bare = (s: string): string => s.toLowerCase().replace(/[×✕]/g, "x").replace(/[^a-z0-9]/g, "");

// Everything the session actually put in front of anybody, plus the
// deterministic sentences already written about it. A quote has to come
// from here.
const screenOf = (story: Story): string =>
  story.episodes.flatMap((e) => [e.description, e.wrote ?? "", ...e.said.map((s) => s.text)]).join(" ");

// Only the person's own words. This is what grounds a claim about them.
const writtenOf = (story: Story): string => story.episodes.map((e) => e.wrote ?? "").join(" ").toLowerCase();

// Quoted spans, straight or curly. Short ones are not checked: a summary
// that quotes the word "help" is not making anything up, and a two-letter
// span would match everything anyway.
function quotes(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/[“"]([^”"]{4,120})[”"]/g)) out.push(m[1]);
  return out;
}

const sentences = (text: string): string[] =>
  text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => /[a-z0-9]/i.test(s));

export function checkSummary(raw: unknown, story: Story): Verdict {
  if (typeof raw !== "string") return { ok: false, reason: "the model did not answer with a sentence" };
  const summary = raw.replace(/\s+/g, " ").trim();
  if (!summary) return { ok: false, reason: "the model answered with nothing" };
  if (summary.length > MAX_CHARS) return { ok: false, reason: `longer than a paragraph: ${summary.length} characters` };

  const said = sentences(summary);
  if (said.length < MIN_SENTENCES || said.length > MAX_SENTENCES) {
    return { ok: false, reason: `${said.length} sentences, and this is meant to be ${MIN_SENTENCES} to ${MAX_SENTENCES}` };
  }

  if (SHOUTED.test(summary)) return { ok: false, reason: "it used the taxonomy's own identifiers instead of saying what happened" };
  for (const pattern of MECHANICAL) {
    const hit = summary.match(pattern);
    if (hit) return { ok: false, reason: `it described the mechanism rather than the activity: "${hit[0]}"` };
  }

  // Mental states, understanding, intention, motivation: allowed only
  // where the person's own words carry them.
  const written = writtenOf(story);
  const low = summary.toLowerCase();
  for (const forms of MIND) {
    const used = forms.find((f) => word(f).test(low));
    if (!used) continue;
    const grounded = forms.some((f) => word(f).test(written));
    if (!grounded) return { ok: false, reason: `it claimed something nobody recorded: "${used}"` };
  }

  // And nothing may be quoted that was not on screen.
  const screen = bare(screenOf(story));
  for (const q of quotes(summary)) {
    if (!screen.includes(bare(q))) return { ok: false, reason: `it quoted something that was never shown: "${q}"` };
  }

  return { ok: true, summary };
}

// A phrase, on word boundaries, with its spaces allowed to be any run of
// whitespace. Escaped because these are data, not patterns.
const word = (phrase: string): RegExp =>
  new RegExp(`(?<![a-z])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+")}(?![a-z])`, "i");
