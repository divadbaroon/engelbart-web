import { createClient } from "@/lib/supabase/server";
import { EVENT_COLUMNS, RUN_COLUMNS, toEvent, toRun, type EventRow, type RunRow, type SandboxRun, type SandboxEvent } from "@/lib/sandbox";

// The most recent run for each repository in a project, so status dots are
// right on first paint. Reads run as the signed-in user.
export async function loadLatestRuns(projectId: string): Promise<Record<string, SandboxRun>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("engelbart_sandbox_runs")
    .select(RUN_COLUMNS)
    .eq("project_id", projectId)
    .order("started_at", { ascending: false });
  if (error) throw new Error(`Could not load sandbox runs: ${error.message}`);
  const latest: Record<string, SandboxRun> = {};
  for (const row of data as RunRow[]) {
    if (!latest[row.repo_id]) latest[row.repo_id] = toRun(row);
  }
  return latest;
}

export async function loadRun(runId: string): Promise<{ run: SandboxRun; events: SandboxEvent[] } | null> {
  const supabase = await createClient();
  const [runRes, eventsRes] = await Promise.all([
    supabase.from("engelbart_sandbox_runs").select(RUN_COLUMNS).eq("id", runId).maybeSingle(),
    supabase.from("engelbart_sandbox_events").select(EVENT_COLUMNS).eq("run_id", runId).order("seq"),
  ]);
  if (runRes.error) throw new Error(`Could not load sandbox run: ${runRes.error.message}`);
  if (eventsRes.error) throw new Error(`Could not load sandbox events: ${eventsRes.error.message}`);
  if (!runRes.data) return null;
  return { run: toRun(runRes.data as RunRow), events: (eventsRes.data as EventRow[]).map(toEvent) };
}

// One run without its events.
export async function getRun(runId: string): Promise<SandboxRun | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("engelbart_sandbox_runs").select(RUN_COLUMNS).eq("id", runId).maybeSingle();
  if (error) throw new Error(`Could not load sandbox run: ${error.message}`);
  return data ? toRun(data as RunRow) : null;
}
