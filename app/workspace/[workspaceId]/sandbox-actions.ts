"use server";

import { createClient } from "@/lib/supabase/server";
import { REPO_COLUMNS } from "@/lib/repos";
import { RUN_COLUMNS, isSandboxLive, toRun, type RunRow, type SandboxEvent, type SandboxRun } from "@/lib/sandbox";
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

// Bring the application up again in the sandbox it is already in, with
// whatever is saved for the repository now.
//
// This is the answer to adding an environment value to something that is
// already running. A run reads the saved values once, at launch, so a
// value added afterwards needs another launch — but not another machine.
// The expensive parts of a run are the sandbox, the clone and the
// install, and none of them change when somebody types a key: the worker
// already launches without cloning when the run it picks up still carries
// a sandbox (worker/index.ts), so all this has to do is hand it one.
//
// A new run rather than the same row launched twice, because a run is one
// attempt at bringing something up: its events, its trace, its recordings
// and its activity belong to the application that was up while they were
// gathered. Two launches in one row would leave a trace with two
// beginnings. The previous run keeps everything it gathered and stays
// reachable from the run picker, exactly as it does after a restart.
//
// The order below is the part that matters, and each step is doing a job:
//
//   1. The new row is written first, already holding the sandbox, so the
//      worker's sweep never sees a sandbox whose only run is over and
//      kill it out from under this. It is written "creating" rather than
//      "queued" so that the worker cannot claim it while the previous
//      launch's processes are still up — two wrappers in one sandbox and
//      hc refuses to start the second.
//   2. The old run is marked killed, which is also what keeps its dying
//      wrapper from writing a failure over the top of the handover: the
//      recorder refuses to move a killed run (lib/runtime/recorder.ts).
//   3. The processes go.
//   4. Only then is the new run offered to the worker.
//
// If the stop fails there is no second attempt and no launch beside the
// old one: the new run is failed with the reason, and preparing again is
// still there. The sandbox is no worse off than it was.
export async function relaunchRun(runId: string): Promise<StartRunResult> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { ok: false, error: "You are not signed in." };

  const { data: runRow, error: runError } = await supabase.from("engelbart_sandbox_runs").select(RUN_COLUMNS).eq("id", runId).maybeSingle();
  if (runError) return { ok: false, error: runError.message };
  if (!runRow) return { ok: false, error: "That run does not exist." };
  const run = toRun(runRow as RunRow);
  if (!isSandboxLive(run) || !run.workdir) return { ok: false, error: "That run's sandbox is not running, so there is nothing to launch again in. Prepare the repository again." };

  const { data: repoRow, error: repoError } = await supabase
    .from("engelbart_repos").select("project_id").eq("id", run.repoId).maybeSingle();
  if (repoError) return { ok: false, error: repoError.message };
  if (!repoRow) return { ok: false, error: "That repository is no longer in the project." };

  const { data: made, error: madeError } = await supabase
    .from("engelbart_sandbox_runs")
    .insert({
      repo_id: run.repoId, project_id: (repoRow as { project_id: string }).project_id, user_id: userId,
      template: run.template, trace: run.trace, fresh: false,
      // Held out of the queue until the sandbox is clear; see above.
      status: "creating",
      sandbox_id: run.sandboxId, workdir: run.workdir, commit_sha: run.commit,
    })
    .select(RUN_COLUMNS).single();
  if (madeError) return { ok: false, error: madeError.message };
  const next = toRun(made as RunRow);

  const before = createRecorder(supabase, runId);
  before.event("status", "launching again in this sandbox with the environment values saved now", { phase: "relaunch", into: next.id });
  await before.status("killed");
  await before.flush();

  const after = createRecorder(supabase, next.id);
  after.event("status", "launching again in the sandbox the last run left: the repository is already cloned and its dependencies are already installed", { phase: "relaunch", from: runId });
  try {
    const { stopLaunch } = await import("@/lib/runtime/e2b");
    await stopLaunch(run.sandboxId, appPorts(run));
  } catch (err) {
    const message = `The previous launch could not be stopped (${err instanceof Error ? err.message : String(err)}). Prepare the repository again.`;
    after.event("error", message, { kind: "StopFailed" });
    await after.status("failed", { errorKind: "StopFailed", error: message });
    await after.flush();
    return { ok: false, error: message };
  }
  await after.flush();

  const { error: queueError } = await supabase.from("engelbart_sandbox_runs").update({ status: "queued" }).eq("id", next.id);
  if (queueError) return { ok: false, error: queueError.message };
  return { ok: true, run: { ...next, status: "queued" } };
}

// The loopback ports the application was serving on, which is what has to
// be freed for the next launch to start its own rather than find this one
// still answering.
const appPorts = (run: SandboxRun): number[] =>
  [...(run.services ?? []).map((s) => s.port), run.port].filter((p): p is number => typeof p === "number" && p > 0);

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

// Every run of a repository, newest first.
//
// The workspace opens the newest run of a repository and has never had a
// way to reach any other, so a relaunch put the previous session's trace,
// its recordings and its activity out of reach — all still there, none of
// it findable. This is what a run picker reads. Fifty is a bound, not a
// page: a repository with more than fifty runs has older ones worth
// finding by other means.
//
// Whole runs rather than a summary, because choosing one has to hand the
// rest of the workspace exactly what it would have had if that run were
// the open one, and that is a SandboxRun.
export async function listRepoRuns(repoId: string): Promise<SandboxRun[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("engelbart_sandbox_runs")
    .select(RUN_COLUMNS)
    .eq("repo_id", repoId)
    .order("started_at", { ascending: false })
    .limit(50);
  if (error) return [];
  return (data as RunRow[]).map(toRun);
}

export async function getRun(runId: string): Promise<RunSnapshot | { error: string }> {
  return snapshot(runId, "That run does not exist.");
}

async function snapshot(runId: string, missing: string): Promise<RunSnapshot | { error: string }> {
  const loaded = await loadRun(runId);
  return loaded ?? { error: missing };
}
