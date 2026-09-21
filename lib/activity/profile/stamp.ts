// Which reading named this session, recorded beside the naming.
//
// An Activity export is a set of claims about what somebody was doing,
// and every one of them is made in some artifact's vocabulary. The export
// used to say only `"taxonomy": "ROPE"` — a name, with no account of
// where it came from, which is exactly how one artifact's words came to
// be printed over another's session without anything on the page saying
// so. The stamp is that account: what named it, who wrote that, against
// which state of the repository, and whether it is still believed.
//
// Pure data, and small on purpose. It goes into an export that a reader
// may keep for a year, so it holds identities rather than objects: a
// signature rather than a signature's parts, a model's name rather than
// its answer.
import type { ArtifactProfile } from "@/lib/activity/profile/schema";
import type { ProfileRow, ProfileStatus } from "@/lib/activity/profile/store";

// Where a reading came from. `built-in` is one this application ships,
// written by hand for an artifact it already knows; `generated` is one a
// model wrote from evidence; `blind` is no reading at all — the
// artifact-blind vocabulary, which names nothing because nothing here
// knows what the artifact is.
export type ReadingSource = "built-in" | "generated" | "blind";

export type ProfileStamp = {
  source: ReadingSource;
  // What the vocabulary is called. The same string the export's
  // `taxonomy` field carries, kept here so the two cannot drift.
  name: string;
  // Where the profile is in its life. `none` is "there is not one", which
  // is a different thing from one that failed.
  status: ProfileStatus | "none";
  // What the profile says the artifact is, in its own words.
  artifact: string | null;
  repoId: string | null;
  // The commit is context and never identity: it is read before the
  // repair patch and the instrumentation are applied, so two runs of one
  // sha can present different interfaces. The signature is the identity.
  commit: string | null;
  signature: string | null;
  schemaVersion: number | null;
  capabilityVersion: number | null;
  model: string | null;
  generatedAt: string | null;
};

// The stamp for a reading that has no profile behind it.
export const blindStamp = (name: string, status: ProfileStatus | "none" = "none"): ProfileStamp => ({
  source: "blind",
  name,
  status,
  artifact: null,
  repoId: null,
  commit: null,
  signature: null,
  schemaVersion: null,
  capabilityVersion: null,
  model: null,
  generatedAt: null,
});

// The stamp for a profile this application ships. There is no row and no
// model: it was written by a person, and the artifact it describes is
// whichever repository the registry matched it to.
export const builtInStamp = (name: string, profile: { artifact: { name: string } } | null): ProfileStamp => ({
  ...blindStamp(name, "ready"),
  source: "built-in",
  artifact: profile?.artifact.name ?? null,
});

// The stamp for a profile that was generated and stored. Everything is
// taken from the row rather than from the profile where the two could
// disagree, because the row is what the lifecycle acts on.
export function storedStamp(name: string, profile: ArtifactProfile, row: ProfileRow): ProfileStamp {
  return {
    source: "generated",
    name,
    status: row.status,
    artifact: profile.artifact.name,
    repoId: row.repoId,
    commit: row.commitSha,
    signature: row.signature,
    schemaVersion: row.schemaVersion,
    capabilityVersion: row.capabilityVersion,
    model: row.model ?? profile.provenance.model ?? null,
    generatedAt: row.generatedAt ?? profile.provenance.generatedAt ?? null,
  };
}
