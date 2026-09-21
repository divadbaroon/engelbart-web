// A session read as behaviour rather than as events: a chronological list
// of episodes, each one a stretch of observable activity with a name a
// researcher would recognise. Nothing here is a new kind of capture. An
// episode is an interpretation laid over stages that already exist, and
// it carries the stage ids it was read from so the reading can always be
// taken apart.
//
// The broad classes are meant to outlive ROPE. They say what a person was
// doing in terms that hold for any interactive artifact, and they are
// deliberately few. The sub-behaviours are the artifact's own vocabulary
// and live in a taxonomy module beside this one; this file knows that a
// sub-behaviour is a string and nothing else about it.
import type { Stage } from "@/lib/trace/timeline";
import type { TraceEvent } from "@/lib/trace/types";

export const BROAD = [
  "ORIENTING",
  "UNDERSTANDING",
  "EXPLORING",
  "FORMULATING",
  "EVALUATING",
  "REVISING",
  "ACTING",
  "WAITING",
  "UNCLEAR",
] as const;
export type Broad = (typeof BROAD)[number];

// What each broad class means, kept here because it is the part that is
// supposed to survive: a later artifact gets its own sub-behaviours but
// should be measured against these same nine.
export const BROAD_MEANING: Record<Broad, string> = {
  ORIENTING: "Figuring out what the interface or task is, where things are, or what to do.",
  UNDERSTANDING: "Taking in information: instructions, feedback, explanations, examples or reference material.",
  EXPLORING: "Interacting with something in order to discover how it behaves.",
  FORMULATING: "Constructing an answer, idea, description or other piece of work.",
  EVALUATING: "Checking or comparing work against feedback, evidence, behaviour or a reference.",
  REVISING: "Changing existing work based on something learned or observed.",
  ACTING: "Carrying out an already-decided action: submitting, generating, advancing, switching view.",
  WAITING: "Waiting for a model call, a system operation or another party to finish.",
  UNCLEAR: "There is not enough evidence to characterise the activity reliably.",
};

// Each broad class as a thing you can point at, for the places that have
// to finish the phrase "this ___" — the composer over the canvas, above
// all. It is here beside the meanings, and not in a component, because
// it belongs to the nine and not to any artifact: nothing in it knows
// what the interface under it is.
export const BROAD_NOUN: Record<Broad, string> = {
  ORIENTING: "this orienting",
  UNDERSTANDING: "this reading",
  EXPLORING: "this exploring",
  FORMULATING: "this work",
  EVALUATING: "this checking",
  REVISING: "this revision",
  ACTING: "this action",
  WAITING: "this wait",
  UNCLEAR: "this moment",
};

// How far the wording may go beyond what was seen.
//
// high   — the act itself is in the trace. "Submitted the response."
// medium — the act is not in the trace but the evidence admits few other
//          readings. "Appeared to review the tutor's feedback."
// low    — reserved for a reading we would rather not assert at all; a
//          rule that can only reach `low` should usually return UNCLEAR
//          instead of inventing an interpretation.
export type Confidence = "high" | "medium" | "low";

// Where an episode happened. A surface is a document of the interface —
// the shell, or an embedded one — named by the most stable thing the
// trace has about it. `role` is the taxonomy's reading of that name; the
// segmenter only knows keys.
export const SURFACE_ROLES = ["shell", "own", "reference", "other"] as const;
export type SurfaceRole = (typeof SURFACE_ROLES)[number];
export type Surface = { key: string; label: string; role: SurfaceRole; frameIds: string[] };

// What a person did in an episode, counted rather than listed.
// `gestures` is wheeling and dragging, folded: the continuous half of
// interaction, which a button-and-form interface does not have and a
// map, a plot, a canvas editor or a timeline is made of.
export type Acts = { keys: number; clicks: number; typing: number; submits: number; navigations: number; gestures: number };

// The evidence an episode was read from, and the whole of what a
// classifier is allowed to see. It is small on purpose: a few hundred
// tokens, no DOM, no selectors a person would not recognise.
export type Evidence = {
  surface: Surface;
  // Every named part of the interface the episode touched, as the
  // semantic reading named it. Enrichment only — nothing is classified
  // on these, because the names are model-written and drift between
  // runs. See lib/activity/segment.ts.
  regions: string[];
  acts: Acts;
  // Which keys, by name, distinct. A count says somebody pressed
  // eighteen keys; this is what lets a rule say what they were without
  // inventing it.
  keyNames: string[];
  // What the application put on screen during the episode, in its own
  // words, which named channel it came through when we can tell, and
  // whether those words were new. An interface that repaints a whole
  // container replays everything already in it, and a conversation
  // arriving for the second time is not the conversation happening again.
  appeared: { at: number; channel: string | null; text: string; fresh: boolean }[];
  // What the person put in, when the trace holds it.
  entered: string | null;
  // Whether anything at all was recorded in this stretch. A silence is
  // an episode too, and a rule that wants to say what somebody was doing
  // has to have seen them do something.
  observed: boolean;
  // Which of the three phases of sending something this stretch was.
  // They are read off where the trace says a submission happened, so
  // they are facts rather than inferences: composing is time in front of
  // the message box with nothing sent, submitted is the send itself, and
  // awaiting is the model call it opened.
  composing: boolean;
  submitted: boolean;
  awaiting: boolean;
  // The model call the episode is about, if any.
  call: { callId: string; model: string | null; latencyMs: number | null } | null;
  // How the episode was entered: the sub-behaviours of the transitions
  // absorbed into its start. A tab click into the reference, a return to
  // the composer. These are why an episode means what it means and are
  // deliberately not episodes of their own.
  entered_by: string[];
  // Controls used anywhere in the episode, its own acts included.
  //
  // Two different questions, and a taxonomy needs both. "How did they
  // get here" is entered_by and belongs to a rule that reads the way in;
  // "was this control used at all" is this, and belongs to a rule that
  // IS the using of it. Signing in is its own stretch, so it is never
  // something the stretch was entered by — asking entered_by whether
  // somebody signed in can only ever answer no.
  controls: string[];
  // Silence before the first act, and total silence inside.
  openingQuietMs: number;
  quietMs: number;
  // A reload, a re-login, anything that broke the session in two.
  discontinuity: string | null;
};

export type Episode = {
  id: string;
  broadBehavior: Broad;
  subBehavior: string;
  description: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  confidence: Confidence;
  // Which path named it, so a reader can tell a rule from a guess.
  determined: "rule" | "model";
  // Why, in one clause, in terms of what was seen. Shown in the detail
  // view under the description: "feedback appeared and stayed on screen
  // for 48s with no competing activity".
  because: string;
  evidence: Evidence;
  // Back to the raw. Every moment folded in, in order. A moment can be
  // behind more than one episode, because a stage that runs from opening
  // the message box to the answer coming back is three behaviours.
  stageIds: string[];
  stages: Stage[];
  // This episode's own events — its parts' slices, not its stages' whole
  // contents. This is what the reading was actually made from.
  events: TraceEvent[];
};
