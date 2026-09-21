// How an artifact is read, and where that reading came from.
//
// Three answers, in order, and the order is the whole design:
//
//   1. a profile this application ships for an artifact it already knows
//   2. a profile a model wrote for this artifact, from evidence
//   3. no profile at all — the artifact-blind vocabulary
//
// What is not in that list is a fallback to somebody else's profile. The
// default used to be ROPE's taxonomy, which meant an artifact nobody had
// read was described as having a tutor, a message box and a reference
// pane, confidently, with nothing on the page to say the words were
// borrowed. Being known is now a property of the artifact — a repository
// this application ships a reading for, or one a reading was written
// from — and never a property of the reader.
//
// Pure: no database, no model, no browser. The registry is a constant and
// the compiling is the same code a generated profile goes through, so a
// shipped reading and a written one cannot diverge in how they behave.
import { BLIND_COMPILED, BLIND_PROFILE } from "@/lib/activity/blind";
import { ROPE_TAXONOMY, ropeSurface } from "@/lib/activity/rope";
import type { Taxonomy } from "@/lib/activity/taxonomy";
import type { SurfaceRole } from "@/lib/activity/types";
import type { ArtifactProfile } from "@/lib/activity/profile/schema";
import { blindStamp, builtInStamp, storedStamp, type ProfileStamp } from "@/lib/activity/profile/stamp";
import { compileProfile } from "@/lib/activity/profile/compile";
import type { ProfileRow } from "@/lib/activity/profile/store";

// Everything needed to name a session, and to say who is doing the
// naming. The classifier takes the first two; the interface and the
// export take the last two.
export type Reading = {
  taxonomy: Taxonomy;
  surfaceOf: (key: string) => { label: string; role: SurfaceRole };
  stamp: ProfileStamp;
  // Why the timeline reads the way it does, in one sentence, for the
  // person looking at it.
  detail: string;
};

export const BLIND_READING: Reading = {
  taxonomy: BLIND_COMPILED.taxonomy,
  surfaceOf: BLIND_COMPILED.surfaceOf,
  stamp: blindStamp(BLIND_COMPILED.taxonomy.name),
  detail: "This artifact has not been read yet, so the timeline names only what holds in any artifact.",
};

// ---- what this application already knows
//
// A built-in is matched by repository, and by nothing else. Not by a
// shape in the trace, not by a word in the page: those are guesses, and a
// guess that lands on the wrong vocabulary is the failure this whole
// layer exists to prevent. Being on this list is a claim somebody made on
// purpose.
type BuiltIn = {
  owner: string;
  name: string;
  reading: Reading;
};

const ROPE: Reading = {
  taxonomy: ROPE_TAXONOMY,
  surfaceOf: ropeSurface,
  stamp: builtInStamp(ROPE_TAXONOMY.name, { artifact: { name: "ROPE Training System" } }),
  detail: "Read as the ROPE Training System, by a reading this application ships.",
};

const BUILT_IN: BuiltIn[] = [{ owner: "mqo00", name: "rope", reading: ROPE }];

const fold = (s: string) => s.trim().toLowerCase().replace(/\.git$/, "");

// The reading this application ships for a repository, or null. Null is
// the answer for every repository but the ones named above, which is what
// makes "ROPE's words over a repository that is not ROPE" unreachable
// rather than merely unlikely.
export function builtInReading(repo: { owner?: string | null; name?: string | null } | null | undefined): Reading | null {
  if (!repo?.owner || !repo?.name) return null;
  const owner = fold(repo.owner), name = fold(repo.name);
  return BUILT_IN.find((b) => b.owner === owner && b.name === name)?.reading ?? null;
}

// ---- a profile that was written for this artifact
//
// Compiling can throw on a profile that never went through validation.
// One did go through it — on the way into the database — but a row is
// read back long after it was written, by code that may have moved, and
// a page that went blank over a stored reading would be the worst of the
// failure modes here. So a profile that will not compile is no profile.
export function readingOf(profile: ArtifactProfile, row: ProfileRow, detail: string): Reading | null {
  try {
    const compiled = compileProfile(profile);
    return {
      taxonomy: compiled.taxonomy,
      surfaceOf: compiled.surfaceOf,
      stamp: storedStamp(compiled.taxonomy.name, profile, row),
      detail,
    };
  } catch {
    return null;
  }
}

// The blind reading, wearing the state that explains why it is the one in
// use: pending, failed, or nothing asked for yet.
export const blindReading = (status: ProfileStamp["status"], detail: string): Reading => ({
  ...BLIND_READING,
  stamp: blindStamp(BLIND_READING.taxonomy.name, status),
  detail,
});

// Exported for the tests, which check that the blind profile is what the
// blind reading actually carries rather than a second copy of it.
export { BLIND_PROFILE };
