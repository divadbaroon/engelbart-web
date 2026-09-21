// A profile's life: found, or claimed and written, or refused.
//
// The shape of a row and what each state means, apart from the database
// and apart from the model, so both can be tested and neither can drift
// from the other. The server action does the talking; this says what the
// answers mean.
import type { ArtifactProfile } from "./schema";
import type { ProfileIssue } from "./validate";
import type { Capability } from "./capability";
import { capabilityVerdict } from "./capability";
import type { Fit } from "./fit";

export type ProfileStatus = "pending" | "ready" | "failed" | "stale";

export type ProfileRow = {
  id: string;
  repoId: string;
  runId: string | null;
  signature: string;
  commitSha: string | null;
  status: ProfileStatus;
  profile: ArtifactProfile | null;
  schemaVersion: number;
  capabilityVersion: number;
  issues: ProfileIssue[] | null;
  fit: Fit | null;
  error: string | null;
  model: string | null;
  generatedBy: string | null;
  evidence: Record<string, unknown> | null;
  evidenceHash: string | null;
  createdAt: string;
  updatedAt: string;
  generatedAt: string | null;
};

export const PROFILE_COLUMNS =
  "id, repo_id, run_id, signature, commit_sha, status, profile, schema_version, capability_version, issues, fit, error, model, generated_by, evidence, evidence_hash, created_at, updated_at, generated_at";

type Raw = Record<string, unknown>;

export const toProfileRow = (r: Raw): ProfileRow => ({
  id: String(r.id),
  repoId: String(r.repo_id),
  runId: r.run_id ? String(r.run_id) : null,
  signature: String(r.signature),
  commitSha: r.commit_sha ? String(r.commit_sha) : null,
  status: String(r.status) as ProfileStatus,
  profile: (r.profile as ArtifactProfile | null) ?? null,
  schemaVersion: Number(r.schema_version ?? 1),
  capabilityVersion: Number(r.capability_version ?? 1),
  issues: (r.issues as ProfileIssue[] | null) ?? null,
  fit: (r.fit as Fit | null) ?? null,
  error: r.error ? String(r.error) : null,
  model: r.model ? String(r.model) : null,
  generatedBy: r.generated_by ? String(r.generated_by) : null,
  evidence: (r.evidence as Record<string, unknown> | null) ?? null,
  evidenceHash: r.evidence_hash ? String(r.evidence_hash) : null,
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
  generatedAt: r.generated_at ? String(r.generated_at) : null,
});

// What the interface is told, and the only thing it needs to know: which
// reading it is looking at, and whether that is the artifact's own.
export type ProfileState = {
  status: ProfileStatus | "none";
  // Why the timeline reads the way it does, in one sentence, for the
  // person looking at it.
  detail: string;
  profile: ArtifactProfile | null;
  row: ProfileRow | null;
};

// A claim nobody finished. Generation takes a minute at most; a pending
// row older than this was abandoned — a deploy, a crash, a closed tab —
// and another attempt is better than an artifact that stays unread.
export const CLAIM_STALE_MS = 10 * 60 * 1000;

export const claimExpired = (row: ProfileRow, now = Date.now()) =>
  row.status === "pending" && now - Date.parse(row.updatedAt) > CLAIM_STALE_MS;

// Whether a stored profile still describes what is in front of us. The
// signature already decided that the interface is the same; this is the
// second question, about the instrument rather than the artifact.
export function staleness(row: ProfileRow, capability: Capability): { stale: boolean; reason: string | null } {
  if (row.status === "failed" || row.status === "pending") return { stale: false, reason: null };
  if (row.schemaVersion !== 1) return { stale: true, reason: `it is written in profile language ${row.schemaVersion}, and this reader understands 1` };
  const verdict = capabilityVerdict(row.capabilityVersion, capability.version);
  if (verdict === "behind") return { stale: true, reason: `it was written against instrument ${row.capabilityVersion} and this run was recorded by ${capability.version}` };
  if (verdict === "ahead") return { stale: true, reason: `it was written against instrument ${row.capabilityVersion}, which is newer than the ${capability.version} that recorded this run` };
  return { stale: false, reason: null };
}

// What a fit report says about a profile meeting a run.
//
// Only one thing, and deliberately: a profile that matched NOTHING is not
// describing this artifact. Anything short of that is not evidence of
// anything. A profile is written to describe the software, not the
// afternoon it was written from — that is what the generator is told —
// so it names controls this session never touched and documents this
// session never opened, and it should. An earlier version of this called
// a profile stale when more than half of what it named went unexercised,
// which condemned every good profile on the very run it was written from.
//
// The question "has the interface moved?" is answered before this, by the
// signature: a renamed button or a document that stopped being served is
// a different artifact and gets its own row. This is the backstop for the
// case the signature cannot see — a profile that matches its signature
// and still reaches nothing.
export function fitVerdict(fit: Fit | null): { stale: boolean; reason: string | null } {
  if (!fit) return { stale: false, reason: null };
  const named = fit.surfaces.length + fit.controls.length + fit.channels.length;
  if (!named) return { stale: false, reason: null };
  if (fit.dead.length < named) return { stale: false, reason: null };
  return { stale: true, reason: `nothing this profile names was found in the run (${fit.dead.length} of ${named})` };
}

export function describeState(row: ProfileRow | null): ProfileState {
  if (!row) return { status: "none", detail: "This artifact has not been read yet, so the timeline names only what holds in any artifact.", profile: null, row: null };
  switch (row.status) {
    case "ready":
      return { status: "ready", detail: `Read as ${row.profile?.artifact.name ?? "this artifact"}${row.model ? `, by ${row.model}` : ""}.`, profile: row.profile, row };
    case "stale":
      return { status: "stale", detail: `Read as ${row.profile?.artifact.name ?? "this artifact"}, from an earlier state of it${row.error ? `: ${row.error}` : ""}.`, profile: row.profile, row };
    case "pending":
      return { status: "pending", detail: "This artifact is being read. Until that finishes the timeline names only what holds in any artifact.", profile: null, row };
    case "failed":
      return { status: "failed", detail: `This artifact could not be read${row.error ? `: ${firstLine(row.error)}` : ""}. The timeline names only what holds in any artifact.`, profile: null, row };
  }
}

const firstLine = (s: string) => (s.split("\n")[0] ?? s).slice(0, 200);
