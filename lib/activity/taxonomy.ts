// What a taxonomy is, as a thing you can swap.
//
// The classifier in classify.ts contains no knowledge of any artifact.
// Everything it needs to read one is in a Taxonomy value: what the
// interface's documents mean, which named channels put text on screen,
// which controls are worth naming, and an ordered list of rules from
// evidence to a behaviour. Replacing ROPE's taxonomy with one generated
// from a repository and its paper is replacing this value.
//
// Rules are small pure functions rather than a match language. A match
// language would have to grow a condition every time an artifact needed
// one — "the first of its kind", "the surface before this one" — and
// would end up a worse programming language than the one we have. What
// matters for swappability is that the rules live in the taxonomy module
// and the classifier cannot see inside them, which holds either way.
import type { ElementTarget } from "@/lib/trace/types";
import type { Appearance } from "@/lib/activity/segment";
import type { Broad, Confidence, Episode, Evidence, SurfaceRole } from "@/lib/activity/types";

// What a rule is given: this episode's evidence, and the little bit of
// session context that changes what an episode means — what came before
// it, and whether anything had been submitted yet.
export type Context = {
  evidence: Evidence;
  durationMs: number;
  index: number;
  previous: Episode | null;
  // Episodes already read, oldest first. A rule should reach for this
  // only to ask a question about the shape of the session so far.
  before: Episode[];
};

export type Reading = { description: string; because: string; confidence: Confidence };

export type Rule = {
  sub: string;
  broad: Broad;
  when: (c: Context) => boolean;
  read: (c: Context) => Reading;
};

export type Taxonomy = {
  name: string;
  // What the interface's documents are. A key the segmenter produced
  // that is not here is "other", and says so.
  surfaces: Record<string, { label: string; role: SurfaceRole }>;
  // Where text that appears on screen came from. Naming the channel is
  // what lets a rule say "the tutor answered" rather than "text changed".
  //
  // `from` says whose words they are. It matters because what a person
  // submitted is only ever recoverable as text the application echoed
  // back — `ui.input` carries a length and never a value — so the one
  // way to tell their message from the answer to it is which part of the
  // conversation it was written into.
  channels: { id: string; label: string; from: "system" | "person"; is: (a: Appearance) => boolean }[];
  // Controls worth naming when they are clicked, so that a transition
  // into an episode can explain it.
  //
  // `moment` says that using this control is a thing somebody did, and
  // not merely how they got somewhere. A tab click is navigation and
  // belongs to the stretch it leads into; signing in, or restarting a
  // game, is an act in its own right and keeps its own stretch however
  // briefly it took. Without it a named act shorter than
  // `minEpisodeMs` is folded into whatever came next and can end up
  // naming it — which is how seven seconds of playing a game came to be
  // called "Signed in to start the session."
  //
  // It is the artifact's call, because only the artifact knows which of
  // its controls are doors and which are deeds.
  controls: { id: string; label: string; moment?: boolean; is: (t: ElementTarget) => boolean }[];
  rules: Rule[];
  // When no rule reads it. Always honest, never inventive.
  fallback: Rule;
};

// Helpers a taxonomy writes its anchors with. Kept here so every
// taxonomy spells "this selector, roughly" the same way.
export const anchor = {
  selector: (...parts: string[]) => (t: ElementTarget) => !!t.selector && parts.some((p) => t.selector!.includes(p)),
  id: (...ids: string[]) => (t: ElementTarget) => !!t.id && ids.includes(t.id),
  tag: (...tags: string[]) => (t: ElementTarget) => !!t.tag && tags.includes(t.tag),
  text: (...texts: string[]) => (t: ElementTarget) => {
    const said = (t.text ?? t.label ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    return texts.some((x) => said === x.toLowerCase());
  },
  testid: (...ids: string[]) => (t: ElementTarget) => !!t.testid && ids.includes(t.testid),
  all: (...fns: ((t: ElementTarget) => boolean)[]) => (t: ElementTarget) => fns.every((f) => f(t)),
  any: (...fns: ((t: ElementTarget) => boolean)[]) => (t: ElementTarget) => fns.some((f) => f(t)),
};

// Counting things in a sentence a person reads. "1 clicks" is the kind
// of seam that makes a reading look machine-written even when it is
// right, and every `because` clause here counts something.
export const count = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

// How far a reading is allowed to go beyond what was seen, said in words
// rather than as a grade, because the grade is the thing a reader most
// needs to understand and least wants to look up. It lives here rather
// than in a component because the timeline and the inspector both say
// it, and about the same episode; two copies would drift.
export const confidenceWord = (c: Confidence): string =>
  c === "high" ? "the act itself is in the trace" : c === "medium" ? "inferred from behaviour, not observed directly" : "not enough evidence to characterise";

// Saying how long something went on, for the `because` clause. Short
// and plain: this is read inside a sentence, not as a duration column.
export function spell(msTotal: number): string {
  const s = Math.round(msTotal / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest ? `${m}m ${rest}s` : `${m}m`;
}

// What a channel said in an episode. Only words that were new: an
// interface that repaints a container puts everything already in it back
// on screen, and a conversation arriving for the second time is the page
// being rebuilt, not the tutor speaking again.
export const said = (e: Evidence, channel: string): string | null => {
  const hit = e.appeared.find((a) => a.channel === channel && a.fresh);
  return hit ? hit.text : null;
};

// The first sentence of something the interface said, clipped. Used for
// descriptions, so a row can say what the feedback was about without a
// model having to read it.
export function gist(text: string, max = 58): string {
  const one = text.replace(/\s+/g, " ").trim();
  // A full stop is punctuation the quote does not need; a question mark
  // or an exclamation is part of what was said.
  const stop = one.search(/[.!?](\s|$)/);
  const first = stop > 0 ? one.slice(0, /[!?]/.test(one[stop]) ? stop + 1 : stop) : one;
  return first.length > max ? first.slice(0, max - 1).trimEnd() + "…" : first;
}
