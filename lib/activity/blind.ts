// How to read an artifact nobody has read yet.
//
// Until now the answer to "no profile" was ROPE's taxonomy, so a canvas
// application was told it had a tutor and a message box. That is worse
// than saying little: it is saying something false with confidence, and
// it is indistinguishable from a correct reading to anyone looking at
// the timeline. This is the other answer — the one that knows nothing
// about any artifact and says only what the collector actually recorded.
//
// It names no document, no control and no channel, because it cannot:
// those names are what a profile is for. What it can do is read the
// facts that hold in any artifact — a field was typed into, a form was
// submitted, a model call was open and nothing else happened — and say
// those, in words that would be true of anything. Everything else falls
// through to UNCLEAR with a count of what was seen.
//
// It is temporary by design. A run using this is a run whose profile is
// pending, failed, or has not been asked for yet, and the capability
// state says so.
import type { ArtifactProfile } from "./profile/schema";
import { compileProfile } from "./profile/compile";
import { validateProfile } from "./profile/validate";

export const BLIND_NAME = "unread artifact";

export const BLIND_PROFILE: ArtifactProfile = {
  version: 1,
  artifact: { name: BLIND_NAME },
  provenance: {
    by: "handwritten",
    note: "The reading used when an artifact has no profile. It names nothing in any artifact and must never be edited to.",
  },
  // Empty on purpose, each of them. A surface therefore reads as its own
  // key with the role "other", and every rule that would ask about a
  // named thing fails closed.
  surfaces: [],
  channels: [],
  controls: [],
  rules: [
    {
      id: "waiting-on-a-call",
      sub: "WAIT_FOR_MODEL_CALL",
      broad: "WAITING",
      priority: 10,
      // A call was open and the person did nothing. True of any artifact
      // that calls a model, and it needs no name for the call.
      when: { all: [{ flag: "awaiting" }, { flag: "call" }, { not: { flag: "submitted" } }, { not: { flag: "composing" } }] },
      description: { lit: "Waited for a model call to come back." },
      because: { join: [{ lit: "a model call was open for " }, { duration: true }, { lit: " and nothing else was done" }] },
      confidence: "high",
      generation: { confidence: "high", grounding: "abstraction", note: "the call is recorded by the gateway, not inferred from the page" },
    },
    {
      id: "submitted-something",
      sub: "SUBMIT",
      broad: "ACTING",
      priority: 20,
      when: { flag: "submitted" },
      description: { lit: "Submitted something." },
      because: { lit: "a submit was recorded in the trace" },
      confidence: "high",
      generation: { confidence: "high", grounding: "source", note: "a submit event is a fact about the document" },
    },
    {
      id: "typed-into-a-field",
      sub: "TYPE_INTO_FIELD",
      broad: "FORMULATING",
      priority: 30,
      when: { any: [{ flag: "composing" }, { acts: { of: ["typing"], op: "gt", value: 0 } }] },
      description: { lit: "Typed into a field." },
      because: {
        cond: [{
          when: { acts: { of: ["typing"], op: "gt", value: 0 } },
          then: { join: [{ count: { of: ["typing"], one: "edit", many: "edits" } }, { lit: " over " }, { duration: true }] },
        }],
        else: { join: [{ lit: "a field was open for " }, { duration: true }, { lit: " before anything was sent" }] },
      },
      // Typing is a fact; that the person was composing something is the
      // mildest of readings, and not one this can be sure of.
      confidence: "medium",
      generation: { confidence: "medium", grounding: "abstraction", note: "typing is recorded; what it was for is not" },
    },
  ],
  // What is left. It says what was counted rather than guessing what it
  // was for, which is the whole of what this profile is allowed to do.
  fallback: {
    id: "unread",
    sub: "IDLE_OR_UNCLEAR",
    broad: "UNCLEAR",
    description: { lit: "Activity in an artifact that has not been read yet." },
    because: {
      cond: [
        {
          when: { acts: { of: ["clicks", "keys", "navigations", "gestures"], op: "gt", value: 0 } },
          then: {
            join: [
              { count: { of: ["clicks", "keys", "navigations", "gestures"], one: "act", many: "acts" } },
              { lit: " over " }, { duration: true },
              { lit: ", and no profile of this artifact to say what they were" },
            ],
          },
        },
      ],
      else: { join: [{ lit: "nothing was observed for " }, { duration: true }] },
    },
    confidence: "low",
    generation: { confidence: "high", grounding: "abstraction", note: "the honest answer when nothing names the artifact" },
  },
};

// Compiled once. It is a constant, so a bad edit to it is a startup
// failure rather than a wrong timeline.
const checked = validateProfile(BLIND_PROFILE);
if (!checked.ok) {
  throw new Error(`the blind profile does not validate:\n${checked.issues.map((i) => `${i.path} ${i.message}`).join("\n")}`);
}
export const BLIND_COMPILED = compileProfile(checked.profile);
export const BLIND_TAXONOMY = BLIND_COMPILED.taxonomy;
export const blindSurface = BLIND_COMPILED.surfaceOf;
