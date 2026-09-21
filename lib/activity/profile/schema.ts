// What an interactive artifact means, as data rather than as code.
//
// A Taxonomy (lib/activity/taxonomy.ts) is the runtime shape the
// classifier consults: closures for matching elements, closures for
// reading evidence. That is the right shape to run and the wrong shape to
// generate, review or store. A profile is the same information written
// down — no functions, no regular expressions supplied from outside, no
// source code — which means it can be read by somebody who did not write
// it, diffed between versions, checked before it runs, and carried in a
// database column. compile.ts turns one into the other.
//
// Nothing in this file, in validate.ts, in compile.ts or in fit.ts knows
// what any particular interface is. The vocabulary here is the vocabulary
// of interactive things in general: documents, text arriving, controls
// being used, stretches of time. Every noun belonging to an artifact
// lives in a profile, which is data, and never in the machinery.
import type { Broad, Confidence, SurfaceRole } from "@/lib/activity/types";

// ---- testing a string
//
// Deliberately small, and deliberately not a regular expression. A
// pattern written by something other than a person is a pattern nobody
// has read, and it can be slow or wrong in ways that are invisible on the
// page. `glob` is the one shape with any power in it: `*` stands for any
// run of characters and captures what it stood for, so a family of
// documents minted one per step can be named without a language.
export type StringTest =
  | { equals: string | string[] }
  | { prefix: string }
  | { suffix: string }
  | { contains: string }
  | { glob: string }
  | { present: true };

// ---- pointing at an element
//
// The order of this union is the order of preference, strongest first.
// `rung()` below turns a form into its place in that order, so a profile
// can be told — before it runs — how much of itself rests on where things
// happened to sit on the page.
export type Anchor =
  | { testid: StringTest }
  | { appId: StringTest }
  | { appIdAttr: StringTest }
  | { elementId: StringTest }
  | { role: StringTest; name?: StringTest }
  | { label: StringTest }
  | { fieldName: StringTest }
  | { inputType: StringTest }
  | { placeholder: StringTest }
  | { editable: StringTest }
  | { title: StringTest }
  | { href: StringTest }
  | { text: StringTest }
  | { tag: StringTest }
  | { classes: StringTest }
  | { selector: StringTest }
  | { all: Anchor[] }
  | { any: Anchor[] }
  | { not: Anchor };

export const ANCHOR_FORMS = [
  "testid", "appId", "elementId", "appIdAttr", "role", "label", "fieldName", "inputType", "placeholder",
  "editable", "title", "href", "text", "tag", "classes", "selector", "all", "any", "not",
] as const;
export type AnchorForm = (typeof ANCHOR_FORMS)[number];

// How much an anchor is worth trusting, 1 best. What the interface chose
// to call something outlasts a release; what it tells assistive
// technology it is outlasts a redesign; what it says outlasts nothing but
// a copy edit; where it sat outlasts nothing at all.
export const ANCHOR_RUNG: Record<Exclude<AnchorForm, "all" | "any" | "not">, number> = {
  testid: 1, appId: 1, elementId: 1,
  // The kind an application declares, not the instance: as strong as a
  // role, and stable across every one of them.
  appIdAttr: 2,
  role: 2, label: 2,
  fieldName: 3, inputType: 3, placeholder: 3, editable: 3,
  title: 4, href: 4, text: 4,
  tag: 5, classes: 5,
  selector: 6,
};
export const WEAKEST_RUNG = 6;

// Total on purpose. These three are the first thing a validator reaches
// for, which means they run against whatever arrived — including a
// profile whose author left a hole where an anchor should be. A reader
// that throws while explaining what is wrong with a file explains
// nothing.
export const anchorForm = (a: Anchor): AnchorForm | null => {
  if (!a || typeof a !== "object") return null;
  for (const form of ANCHOR_FORMS) if (form in (a as Record<string, unknown>)) return form;
  return null;
};

const branches = (a: Anchor, form: "all" | "any"): Anchor[] => {
  const parts = (a as Record<string, unknown>)[form];
  return Array.isArray(parts) ? (parts as Anchor[]) : [];
};

// The rung an anchor rests on. Everything in an `all` has to hold, so it
// is as strong as its strongest part; any one thing in an `any` may be
// what matches, so it is only as strong as its weakest.
export function rung(a: Anchor): number {
  const form = anchorForm(a);
  if (!form) return WEAKEST_RUNG;
  if (form === "not") return rung((a as { not: Anchor }).not);
  if (form === "all") {
    const parts = branches(a, "all");
    return parts.length ? Math.min(...parts.map(rung)) : WEAKEST_RUNG;
  }
  if (form === "any") {
    const parts = branches(a, "any");
    return parts.length ? Math.max(...parts.map(rung)) : WEAKEST_RUNG;
  }
  return ANCHOR_RUNG[form];
}

// Whether anything in this anchor comes down to where the element sat.
export function positional(a: Anchor): boolean {
  const form = anchorForm(a);
  if (form === "selector") return true;
  if (form === "not") return positional((a as { not: Anchor }).not);
  if (form === "all") return branches(a, "all").some(positional);
  if (form === "any") return branches(a, "any").some(positional);
  return false;
}

// ---- asking about an episode
export type Op = "eq" | "ne" | "lt" | "lte" | "gt" | "gte";
export const OPS: Op[] = ["eq", "ne", "lt", "lte", "gt", "gte"];

// Every kind of act a rule may count. `gestures` is wheeling and
// dragging, folded: the continuous half of interaction. An interface
// driven by gesture rather than by button had no way to be asked about
// at all, and a rule that wanted to say "they moved around for a while"
// could only say it by counting the clicks that were not there.
export const ACT_FIELDS = ["keys", "clicks", "typing", "submits", "navigations", "gestures"] as const;
export type ActField = (typeof ACT_FIELDS)[number];

// The evidence fields a profile may ask the truth of. Everything here is
// a fact the collector recorded, never an interpretation: `regions` is
// absent on purpose, because those names are written by a model and drift
// between runs of the same page.
export const FLAGS = ["observed", "composing", "submitted", "awaiting", "discontinuity", "call", "entered"] as const;
export type Flag = (typeof FLAGS)[number];

export type Pred =
  | { all: Pred[] }
  | { any: Pred[] }
  | { not: Pred }
  | { always: true }
  | { flag: Flag }
  | { surfaceRole: SurfaceRole[] }
  | { acts: { of: ActField[]; op: Op; value: number } }
  | { duration: { op: Op; ms: number } }
  | { quiet: { op: Op; ms: number } }
  | { openingQuiet: { op: Op; ms: number } }
  // Silence as a share of the stretch, for saying "mostly nothing
  // happened" about a minute and about an hour in the same words.
  | { quietRatio: { op: Op; value: number } }
  | { controlUsed: string[] }
  | { enteredBy: string[] }
  | { keysIn: string }
  | { channelSaid: string }
  // The most recent thing this channel said, anywhere earlier in the
  // session. What lets a stretch of silence after an answer be read as
  // somebody reading the answer.
  | { latestChannelSaid: string }
  | { index: { op: Op; value: number } }
  | { history: { window: number | "all"; test: EpisodeTest } };

export const PRED_FORMS = [
  "all", "any", "not", "always", "flag", "surfaceRole", "acts", "duration", "quiet",
  "openingQuiet", "quietRatio", "controlUsed", "enteredBy", "keysIn", "channelSaid",
  "latestChannelSaid", "index", "history",
] as const;
export type PredForm = (typeof PRED_FORMS)[number];

// What may be asked of an episode already read. Kept narrow: a rule
// reaches backwards to ask about the shape of the session, not to pick
// over the evidence of a stretch it is not about.
export type EpisodeTest =
  | { all: EpisodeTest[] }
  | { any: EpisodeTest[] }
  | { not: EpisodeTest }
  | { sub: string[] }
  | { broad: Broad[] }
  | { surfaceRole: SurfaceRole[] }
  | { channelSaid: string };

export const EPISODE_TEST_FORMS = ["all", "any", "not", "sub", "broad", "surfaceRole", "channelSaid"] as const;
export type EpisodeTestForm = (typeof EPISODE_TEST_FORMS)[number];

// ---- saying what happened
//
// A sentence is assembled from pieces rather than written with holes in
// it, so that every number in it is formatted by the same code that
// formats every other number. "1 clicks" is the kind of seam that makes a
// true sentence look machine-written, and a profile cannot open it: there
// is no way to interpolate a bare number here.
export type TextSource =
  | { channel: string }
  | { entered: true }
  | { latestChannel: string }
  | { firstOf: TextSource[] };

export type Template =
  | { lit: string }
  | { join: Template[] }
  | { duration: true }
  | { count: { of: ActField[]; one: string; many?: string } }
  // The first sentence of what was said, clipped, in quotation marks.
  | { quote: { source: TextSource; max: number } }
  | { field: "surfaceLabel" | "discontinuity" }
  // The keys of a named set that were actually pressed, listed.
  | { keys: { in: string; join?: string } }
  | { cond: { when: Pred; then: Template }[]; else: Template };

export const TEMPLATE_FORMS = ["lit", "join", "duration", "count", "quote", "field", "keys", "cond"] as const;
export type TemplateForm = (typeof TEMPLATE_FORMS)[number];
export const TEMPLATE_FIELDS = ["surfaceLabel", "discontinuity"] as const;

// How far a reading may go beyond what was seen. It may depend on the
// evidence — looking at a panel while pressing its keys is observed,
// looking at it while pressing nothing is inferred — so it is a choice
// and not a constant.
export type ConfidenceSpec = Confidence | { cond: { when: Pred; then: Confidence }[]; else: Confidence };

// ---- where a piece of a profile came from
//
// Three degrees, and the distinction is the point. A term lifted from the
// interface or the source is grounded in it. A term that names what
// several grounded things have in common is an abstraction, and is
// allowed: an interface that never uses the word "conversation" may still
// have one. A term that neither appears nor follows is an invention, and
// is the thing to catch. Recording which is which is what makes the
// difference checkable later instead of arguable.
export type Grounding = "source" | "abstraction" | "inference";

export type EvidenceRef =
  | { kind: "survey"; signature?: string; ord?: number; note?: string }
  | { kind: "trace"; seq?: number; eventKind?: string; note?: string }
  | { kind: "repo"; path: string; line?: number; note?: string }
  | { kind: "brief"; field: string; note?: string }
  | { kind: "paper"; page?: number; note?: string }
  | { kind: "handwritten"; note?: string };

// How sure whatever wrote this profile is that it describes the artifact.
//
// This is not the confidence carried by an episode. That one is about one
// stretch of one session and is shown to a researcher; this one is about
// the artifact and is shown to whoever reviews the profile. They are
// separate fields on separate objects on purpose, because a confident
// rule can produce a tentative reading and a tentative rule can produce a
// certain one, and a single number could not mean both.
export type ElementProvenance = {
  confidence: Confidence;
  grounding: Grounding;
  ev?: EvidenceRef[];
  note?: string;
};

export type Provenance = {
  by: "handwritten" | "generated";
  model?: string | null;
  generatedAt?: string | null;
  // What the generator was shown, so a profile can be tied to the
  // evidence it was made from rather than to the day it was made.
  evidenceHash?: string | null;
  note?: string;
};

// ---- the parts of an artifact
export type SurfaceSpec = {
  id: string;
  // Against the surface key the segmenter produced.
  match: StringTest;
  // What to call it. `{key}` is the whole key and `{1}`… are what the
  // globs stood for, so a family of documents can be named one at a time.
  label: string;
  role: SurfaceRole;
  generation?: ElementProvenance;
};

export type ChannelSpec = {
  id: string;
  label: string;
  // Whose words these are. It matters because what somebody submitted is
  // only ever recoverable as text the application echoed back.
  from: "system" | "person";
  container?: Anchor;
  text?: StringTest;
  generation?: ElementProvenance;
};

export type ControlSpec = {
  id: string;
  label: string;
  // Using this control is something somebody did, not merely how they got
  // somewhere, so it keeps its own stretch however briefly it took.
  moment?: boolean;
  anchor: Anchor;
  generation?: ElementProvenance;
};

export type KeySetSpec = {
  id: string;
  label: string;
  // Browser key names, exactly. A set, not a pattern.
  keys: string[];
  generation?: ElementProvenance;
};

export type RuleSpec = {
  id: string;
  // The artifact's own word for this behaviour.
  sub: string;
  // One of the nine that are meant to outlive any artifact.
  broad: Broad;
  // Lower goes first. Explicit, because order is what decides which of
  // two true readings is given, and leaving that to the order somebody
  // happened to type the rules in is how a stretch comes to be named
  // after the control that opened it rather than after what was done in
  // it.
  priority: number;
  when: Pred;
  description: Template;
  because: Template;
  confidence?: ConfidenceSpec;
  note?: string;
  generation?: ElementProvenance;
};

export type ArtifactProfile = {
  version: 1;
  artifact: { name: string; repoId?: string | null; commit?: string | null };
  provenance: Provenance;
  surfaces: SurfaceSpec[];
  channels: ChannelSpec[];
  controls: ControlSpec[];
  keySets?: KeySetSpec[];
  rules: RuleSpec[];
  // When no rule reads it. Always honest, never inventive, and so it has
  // no `when`: it is what is left.
  fallback: Omit<RuleSpec, "when" | "priority">;
};
