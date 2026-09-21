"use server";

import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { listRepoPaths, readRepoFiles } from "@/lib/github";
import { TRACE_EVENT_COLUMNS, toTraceEvent, type TraceEventRow } from "@/lib/trace/types";
import { frameIndex, traceRows, traceStages } from "@/lib/trace/timeline";
import { classify } from "@/lib/activity/classify";
import { buildEvidence, worthReading } from "@/lib/activity/profile/evidence";
import { generateProfile } from "@/lib/activity/profile/generate";
import { capabilityOf } from "@/lib/activity/profile/capability";
import { signatureOf } from "@/lib/activity/profile/signature";
import { compileProfile } from "@/lib/activity/profile/compile";
import { fitReport } from "@/lib/activity/profile/fit";
import { validateProfile } from "@/lib/activity/profile/validate";
import {
  CLAIM_STALE_MS, PROFILE_COLUMNS, claimExpired, describeState, fitVerdict, staleness,
  toProfileRow, type ProfileState,
} from "@/lib/activity/profile/store";

// An artifact's own way of being read: found if it has one, written if
// it does not.
//
// Two entry points, and the difference matters. `loadProfile` is what a
// page load calls: it looks, it never generates, and it never costs
// anything. `ensureProfile` is what asks for one to be written, and it
// claims the work in the database first so that two tabs do not both
// pay for the same answer.
//
// Nothing here falls back to another artifact's vocabulary. When there
// is no profile the caller gets `none`, and the reading it does with
// that is the artifact-blind one.

const GENERATION_FILES = 60;

// `events` comes back with the answer because the caller needs it to
// decide whether asking for a reading is worth a model call, and it is
// already counted here. A run that recorded nothing has a signature too —
// the hash of an empty interface — and it names nothing worth reading.
export async function loadProfile(input: { repoId: string; runId: string }): Promise<{ ok: true; state: ProfileState; signature: string; events: number } | { ok: false; error: string }> {
  const supabase = await createClient();
  const events = await eventsOf(supabase, input.runId);
  if (!events.ok) return { ok: false, error: events.error };
  const { signature } = signatureOf(events.events);
  const count = events.events.length;

  const { data, error } = await supabase
    .from("engelbart_artifact_profiles").select(PROFILE_COLUMNS)
    .eq("repo_id", input.repoId).eq("signature", signature).maybeSingle();
  if (error) return { ok: false, error: describe(error.message) };
  if (!data) return { ok: true, state: describeState(null), signature, events: count };

  const row = toProfileRow(data as Record<string, unknown>);
  // A claim that was abandoned reads as nothing rather than as work in
  // progress, so the next asker may take it.
  if (claimExpired(row)) return { ok: true, state: { ...describeState(null), detail: "A reading of this artifact was started and never finished." }, signature, events: count };

  // Is it still about this? Two questions: the instrument, and whether
  // what it names is still there.
  const capability = capabilityOf(events.events);
  const version = staleness(row, capability);
  if (version.stale && row.status === "ready") {
    return { ok: true, state: describeState({ ...row, status: "stale", error: version.reason }), signature, events: count };
  }
  return { ok: true, state: describeState(row), signature, events: count };
}

export type EnsureOutcome =
  | { ok: true; state: ProfileState; signature: string; generated: boolean; notes?: string }
  | { ok: false; error: string; signature?: string };

export async function ensureProfile(input: { repoId: string; runId: string; refresh?: boolean }): Promise<EnsureOutcome> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { ok: false, error: "You are not signed in." };

  // The project is the repository's, never the caller's to name.
  const { data: repo, error: repoError } = await supabase
    .from("engelbart_repos").select("id, project_id, owner, name, url, default_branch, description").eq("id", input.repoId).maybeSingle();
  if (repoError) return { ok: false, error: describe(repoError.message) };
  if (!repo) return { ok: false, error: "That repository is not one you can open." };

  // The run is checked rather than believed: it must be this
  // repository's own, which is also what the insert policy requires.
  const { data: run } = await supabase
    .from("engelbart_sandbox_runs").select("id, commit_sha").eq("id", input.runId).eq("repo_id", input.repoId).maybeSingle();
  if (!run) return { ok: false, error: "That run is not one of this repository's." };

  const loaded = await eventsOf(supabase, input.runId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const events = loaded.events;
  if (!events.length) return { ok: false, error: "That run recorded nothing to read the artifact from." };

  const { signature } = signatureOf(events);
  const capability = capabilityOf(events);

  const { data: existing } = await supabase
    .from("engelbart_artifact_profiles").select(PROFILE_COLUMNS).eq("repo_id", input.repoId).eq("signature", signature).maybeSingle();
  const row = existing ? toProfileRow(existing as Record<string, unknown>) : null;

  if (row && !input.refresh) {
    if (row.status === "ready" && !staleness(row, capability).stale) return { ok: true, state: describeState(row), signature, generated: false };
    if (row.status === "pending" && !claimExpired(row)) return { ok: true, state: describeState(row), signature, generated: false };
    // `failed` and `stale` both fall through and are tried again: a
    // failure is usually a missing key or a model that was busy, and a
    // stale profile is worth replacing. Nothing is deleted first, so
    // what is there keeps being served while this runs.
  }

  const claimed = await claim(supabase, {
    id: row?.id ?? null, projectId: repo.project_id as string, repoId: input.repoId, runId: input.runId,
    signature, commitSha: (run.commit_sha as string | null) ?? null, capability: capability.version, userId,
  });
  if (!claimed.ok) return { ok: false, error: claimed.error, signature };

  // ---- the evidence, then the reading
  const branch = (repo.default_branch as string | null) || "HEAD";
  const ref = (run.commit_sha as string | null) || branch;
  const paths = (await listRepoPaths(repo.owner as string, repo.name as string, ref)) ?? [];
  const files = paths.length ? await readRepoFiles(repo.owner as string, repo.name as string, ref, worthReading(paths), { maxFiles: GENERATION_FILES }) : [];
  const pack = buildEvidence({
    artifact: {
      owner: repo.owner as string, name: repo.name as string, url: repo.url as string,
      commit: (run.commit_sha as string | null) ?? null, description: (repo.description as string | null) ?? null,
    },
    files: paths.map((p) => files.find((f) => f.path === p) ?? { path: p, bytes: 0 }),
    events,
  });

  const written = await generateProfile(pack, { name: repo.name as string, repoId: input.repoId, commit: (run.commit_sha as string | null) ?? null });
  if (!written.ok) {
    await finish(supabase, claimed.id, {
      status: "failed", error: written.error, issues: written.issues ?? null, model: written.model,
      evidence: pack.manifest as unknown as Record<string, unknown>,
      evidence_hash: createHash("sha256").update(pack.text).digest("hex").slice(0, 64),
    });
    const after = await reread(supabase, claimed.id);
    return { ok: true, state: describeState(after), signature, generated: false, notes: written.notes };
  }

  // Compiled and fitted before it is believed: a profile that validates
  // can still name nothing that is there.
  const compiled = compileProfile(written.profile);
  const frames = frameIndex(events);
  const stages = traceStages(traceRows(events, [], frames)).primary;
  const episodes = classify({ stages, frames, events, taxonomy: compiled.taxonomy, surfaceOf: compiled.surfaceOf });
  const fit = fitReport(written.profile, compiled, { episodes, events });
  const verdict = fitVerdict(fit);

  await finish(supabase, claimed.id, {
    status: verdict.stale ? "stale" : "ready",
    error: verdict.reason,
    issues: written.issues,
    model: written.model,
    profile: written.profile as unknown as Record<string, unknown>,
    fit: fit as unknown as Record<string, unknown>,
    evidence: { ...pack.manifest, notes: written.notes.slice(0, 20_000) } as unknown as Record<string, unknown>,
    // The pack is large and reproducible, so it is not stored; its hash
    // is, which is enough to say whether two profiles were written from
    // the same reading of the same repository.
    evidence_hash: createHash("sha256").update(pack.text).digest("hex").slice(0, 64),
    generated_at: new Date().toISOString(),
  });
  const after = await reread(supabase, claimed.id);
  return { ok: true, state: describeState(after), signature, generated: true, notes: written.notes };
}

// ---- the parts

type Client = Awaited<ReturnType<typeof createClient>>;

async function eventsOf(supabase: Client, runId: string): Promise<{ ok: true; events: ReturnType<typeof toTraceEvent>[] } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("engelbart_trace_events").select(TRACE_EVENT_COLUMNS).eq("run_id", runId).order("seq");
  if (error) return { ok: false, error: describe(error.message) };
  return { ok: true, events: (data as TraceEventRow[]).map(toTraceEvent) };
}

async function claim(supabase: Client, input: {
  id: string | null; projectId: string; repoId: string; runId: string; signature: string;
  commitSha: string | null; capability: number; userId: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const fields = {
    project_id: input.projectId, repo_id: input.repoId, run_id: input.runId, user_id: input.userId,
    signature: input.signature, commit_sha: input.commitSha, status: "pending" as const,
    capability_version: input.capability, schema_version: 1, updated_at: new Date().toISOString(),
    // Who asked. A row written from a terminal and one written because
    // somebody opened the Activity tab are the same profile and are not
    // the same fact about how it came to exist.
    generated_by: "runtime",
    error: null, issues: null,
  };
  if (input.id) {
    const { error } = await supabase.from("engelbart_artifact_profiles").update(fields).eq("id", input.id);
    return error ? { ok: false, error: describe(error.message) } : { ok: true, id: input.id };
  }
  const { data, error } = await supabase.from("engelbart_artifact_profiles").insert(fields).select("id").maybeSingle();
  if (error) {
    // Somebody else claimed it between the read and the insert. That is
    // the unique index doing its job, not a failure.
    const { data: theirs } = await supabase
      .from("engelbart_artifact_profiles").select("id").eq("repo_id", input.repoId).eq("signature", input.signature).maybeSingle();
    if (theirs) return { ok: false, error: "Another reading of this artifact is already running." };
    return { ok: false, error: describe(error.message) };
  }
  return data ? { ok: true, id: String(data.id) } : { ok: false, error: "The claim could not be written." };
}

// The column names are the database's, not the row type's: this goes
// straight into `update`, so a camelCase key here is a key PostgREST
// does not know and a write that silently fails.
async function finish(supabase: Client, id: string, fields: Record<string, unknown>) {
  await supabase.from("engelbart_artifact_profiles").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id);
}

async function reread(supabase: Client, id: string) {
  const { data } = await supabase.from("engelbart_artifact_profiles").select(PROFILE_COLUMNS).eq("id", id).maybeSingle();
  return data ? toProfileRow(data as Record<string, unknown>) : null;
}

const describe = (message: string) =>
  /relation .* does not exist/i.test(message)
    ? "The artifact-profile table is not there yet; the migration has not been applied."
    : message;

// Exported for the acceptance path: validating a profile that somebody
// hands over, without generating one.
export async function checkProfile(input: unknown) {
  const checked = validateProfile(input);
  return checked.ok ? { ok: true as const, issues: checked.issues } : { ok: false as const, issues: checked.issues };
}
