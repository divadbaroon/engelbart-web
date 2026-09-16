"use server";

import { createClient } from "@/lib/supabase/server";
import { REPO_COLUMNS, toRepo, type RepoRow } from "@/lib/repos-server";
import { RUN_COLUMNS, toRun, type RunRow, type SandboxEvent, type SandboxRun } from "@/lib/sandbox";
import { loadRun } from "@/lib/sandbox-server";
import { createRecorder } from "@/lib/runtime/recorder";
import { getRuntime } from "@/lib/runtime";

export type StartRunResult = { ok: true; run: SandboxRun } | { ok: false; error: string };
export type RunSnapshot = { run: SandboxRun; events: SandboxEvent[] };

// Step one of preparing a repository: create the run row and hand back its
// id, so the browser can subscribe to the run's events before the work
// starts. The work itself is executeRun.
export async function startRun(repoId: string): Promise<StartRunResult> {
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
    .insert({ repo_id: repoId, project_id: (repoRow as { project_id: string }).project_id, user_id: userId })
    .select(RUN_COLUMNS)
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, run: toRun(data as RunRow) };
}

// Step two: create the sandbox, clone the repository into it, and record
// everything against the run. Returns the final state, which the browser
// uses whether or not it received the events live.
export async function executeRun(runId: string): Promise<RunSnapshot | { error: string }> {
  const supabase = await createClient();
  const { data: runRow, error: runError } = await supabase
    .from("engelbart_sandbox_runs").select(`${RUN_COLUMNS}, engelbart_repos(${REPO_COLUMNS})`).eq("id", runId).eq("status", "queued").maybeSingle();
  if (runError) return { error: runError.message };
  if (!runRow) return { error: "That run has already started or does not exist." };

  const repo = toRepo((runRow as unknown as { engelbart_repos: RepoRow }).engelbart_repos);
  const record = createRecorder(supabase, runId);
  let runtime;
  try {
    runtime = getRuntime();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    record.event("error", message, { kind: "ConfigError" });
    await record.status("failed", { errorKind: "ConfigError", error: message });
    return snapshot(runId, message);
  }

  await runtime.prepare(repo, runId, record);
  await record.flush();
  return snapshot(runId, "The run finished but could not be read back.");
}

export async function getRun(runId: string): Promise<RunSnapshot | { error: string }> {
  return snapshot(runId, "That run does not exist.");
}

async function snapshot(runId: string, missing: string): Promise<RunSnapshot | { error: string }> {
  const loaded = await loadRun(runId);
  return loaded ?? { error: missing };
}
