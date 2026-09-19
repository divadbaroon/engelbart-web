"use server";

import { createClient } from "@/lib/supabase/server";
import { REPO_COLUMNS } from "@/lib/repos";
import { RUN_COLUMNS, toRun, type RunRow, type SandboxEvent, type SandboxRun } from "@/lib/sandbox";
import { loadRun } from "@/lib/sandbox-server";
import { createRecorder } from "@/lib/runtime/recorder";
import { TEMPLATE } from "@/lib/runtime/e2b";
import type { TraceCapture } from "@/lib/trace/types";

export type StartRunResult = { ok: true; run: SandboxRun } | { ok: false; error: string };
export type RunSnapshot = { run: SandboxRun; events: SandboxEvent[] };

// Queue a run for a repository. The worker process (worker/index.ts) picks
// it up, clones and launches; the browser watches the run's events.
// fresh: ignore any saved trail. trace: whether the run records a
// behavior trace and whether model content is kept ("full") or only its
// shape ("metadata"); full capture is the default while the trace is
// being developed against ROPE.
export type StartRunOptions = { fresh?: boolean; trace?: TraceCapture };
const DEFAULT_TRACE: TraceCapture = "full";

export async function startRun(repoId: string, options: StartRunOptions = {}): Promise<StartRunResult> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { ok: false, error: "You are not signed in." };

  const { data: repoRow, error: repoError } = await supabase
    .from("engelbart_repos").select(`${REPO_COLUMNS}, project_id`).eq("id", repoId).maybeSingle();
  if (repoError) return { ok: false, error: repoError.message };
  if (!repoRow) return { ok: false, error: "That repository is no longer in the project." };

  const { data, error } = await supabase
    .from("engelbart_sandbox_runs")
    .insert({ repo_id: repoId, project_id: (repoRow as { project_id: string }).project_id, user_id: userId, template: TEMPLATE, fresh: options.fresh === true, trace: options.trace ?? DEFAULT_TRACE })
    .select(RUN_COLUMNS)
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, run: toRun(data as RunRow) };
}

// Ask for a cloned run to be launched again. The worker picks it up like a
// new run but skips the clone, since the sandbox still has the repository.
export async function requeueRun(runId: string): Promise<RunSnapshot | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("engelbart_sandbox_runs")
    .update({ status: "queued", worker_id: null, claimed_at: null, heartbeat_at: null, error: null, error_kind: null, finished_at: null })
    .eq("id", runId).in("status", ["cloned", "paused"])
    .select(RUN_COLUMNS).maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "That run is not waiting to be launched." };
  return snapshot(runId, "The run could not be read back.");
}

// Kill the run's sandbox and everything in it.
export async function stopRun(runId: string): Promise<RunSnapshot | { error: string }> {
  const supabase = await createClient();
  const { data: runRow, error: runError } = await supabase.from("engelbart_sandbox_runs").select(RUN_COLUMNS).eq("id", runId).maybeSingle();
  if (runError) return { error: runError.message };
  if (!runRow) return { error: "That run does not exist." };
  const run = toRun(runRow as RunRow);
  const record = createRecorder(supabase, runId);
  if (run.sandboxId) {
    const { Sandbox } = await import("e2b");
    try { await Sandbox.kill(run.sandboxId); record.event("status", "sandbox killed"); } catch (err) { record.event("error", `kill failed: ${err instanceof Error ? err.message : String(err)}`); }
  }
  await record.status("killed");
  await record.flush();
  return snapshot(runId, "The run could not be read back.");
}

export async function getRun(runId: string): Promise<RunSnapshot | { error: string }> {
  return snapshot(runId, "That run does not exist.");
}

async function snapshot(runId: string, missing: string): Promise<RunSnapshot | { error: string }> {
  const loaded = await loadRun(runId);
  return loaded ?? { error: missing };
}
