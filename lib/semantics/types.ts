// What the interface means, as opposed to what it is made of.
//
// The behavior trace records what a page held: a tag, a role, some
// visible text, a selector. That is evidence, and it is the truth. What
// it does not say is what any of it is FOR — that an embedded document is
// the thing the person is building, that a textarea is where a student
// answers, that a column of divs is a conversation. A semantic map is one
// reading of that question, made once per interface and then cached.
//
// Three rules hold this together:
//
//   A label never replaces evidence. Every semantic node points at the
//   ElementTargets it was derived from, and those are stored verbatim.
//   Where a label is missing, or the reader thinks little of it, the raw
//   description is what shows. Nothing here overwrites a target.
//
//   There is no second targeting system. A semantic node identifies its
//   elements by the same ElementTarget the trace and annotations use,
//   produced by the same describe() in the bridge. Nothing in this module
//   builds a selector or reads the DOM.
//
//   The model never names an element itself. It is shown a numbered list
//   of candidates and may only answer with numbers; the server resolves
//   those back to the descriptors it captured. A model cannot invent a
//   target it was not shown, and cannot write a selector at all.
//
// Pure: no DOM, no network, no database.
import type { ElementTarget } from "@/lib/trace/types";
import type { FrameRef } from "@/lib/annotations/target";

// What a named thing is for. Deliberately a small closed set: it is a
// vocabulary for an interface, not a description of a field of study, and
// a reader that cannot place something says "other" rather than inventing
// a word.
export const SEMANTIC_KINDS = ["region", "input", "action", "output", "navigation", "artifact", "conversation", "visualization", "other"] as const;
export type SemanticKind = (typeof SEMANTIC_KINDS)[number];

// How much the reading is worth. A low one is a guess and is shown as
// one: the raw label keeps the front of the line.
export const CONFIDENCES = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCES)[number];

// ---- what the page offers
//
// One element worth considering, as the page described it. `ord` is its
// only name while it is being read: the model is shown ordinals and
// answers with ordinals, so a label can always be traced back to an
// element that was actually there.
export type Candidate = {
  ord: number;
  parent: number | null;        // the ord of its nearest meaningful ancestor
  target: ElementTarget;
};

// A document's candidates, as one survey. `truncated` is honest rather
// than silent: a page with more meaningful elements than the cap is read
// from a prefix of itself, and everything downstream should say so.
export type CandidateTree = {
  route: string | null;
  documentTitle: string | null;
  frame: FrameRef;
  candidates: Candidate[];
  truncated: boolean;
};

export const MAX_CANDIDATES = 120;
export const MAX_LABEL = 48;
export const MAX_DESCRIPTION = 200;
export const MAX_PURPOSE = 280;

// ---- what the reading says
export type SemanticNode = {
  semanticId: string;
  label: string;
  description: string | null;
  kind: SemanticKind;
  confidence: Confidence;
  ords: number[];               // which candidates this is about
  targets: ElementTarget[];     // those candidates' descriptors, kept verbatim
  regionId: string | null;      // for a control: the region it sits in
};

export type UISemanticMap = {
  v: 1;
  signature: string;
  route: string | null;
  documentTitle: string | null;
  frame: FrameRef;
  documentLabel: string | null;   // what this document IS — "Solution game"
  // What it is FOR, in a sentence or two: the thing a researcher opening
  // this artifact for the first time needs before anything else makes
  // sense. Of the interface, from the interface — never what the person
  // using it wants, believes, or found.
  purpose: string | null;
  documentConfidence: Confidence;
  regions: SemanticNode[];
  controls: SemanticNode[];
  truncated: boolean;
};

// What a lookup found, and how. `matchedOn` is kept because a label that
// arrived by the weakest rung deserves less trust than one that arrived
// by a test id, and because a person debugging this will want to know.
export type SemanticMatch = {
  semanticId: string;
  label: string;
  kind: SemanticKind;
  confidence: Confidence;
  regionId: string | null;
  matchedOn: "testid" | "id" | "selector" | "shape" | "frame";
};
