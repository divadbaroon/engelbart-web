// The sandbox runner: a long-lived process that takes queued runs from the
// database and drives them through the runtime, so the web app never holds
// a request open for a clone or a launch, and a page reload changes nothing.
//
//   npm run worker            (reads .env.local when present)
//
// Needs SUPABASE_SECRET_KEY (the project's secret API key: the worker writes
// on behalf of any user, which row-level security would otherwise refuse),
// NEXT_PUBLIC_SUPABASE_URL, E2B_API_KEY and ANTHROPIC_API_KEY. Optional:
// WORKER_CONCURRENCY (runs at once, default 4) and WORKER_ID (default
// hostname-pid).
//
// One run at a time per row: a claim is an update that only matches while
// the row is still queued and unclaimed, so two workers cannot take the same
// run. While a worker holds a run it heartbeats; the reaper marks runs whose
// worker went quiet, checks on running apps left behind by a restart, and
// kills sandboxes whose run is gone or over. Concurrency counts runs being
// set up; a running app costs the worker only an open stream.
import os from "node:os";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Sandbox } from "e2b";
import { getRuntime, type LaunchRecipe, type Recorder, type Runtime } from "@/lib/runtime";
import { createRecorder } from "@/lib/runtime/recorder";
import { REPO_COLUMNS, toRepo, type RepoRow } from "@/lib/repos";
import { RUN_COLUMNS, toRun, type RunRow, type SandboxRun } from "@/lib/sandbox";
import type { EnvReport } from "@/lib/environment";
import type { PatchOrigin, RepoPatch } from "@/lib/patch";
import { isPublicRepo, listRepoPaths } from "@/lib/github";
import type { Repo } from "@/lib/repos";
import { needsDocker } from "@/lib/repo-needs";

const POLL_MS = 2_000;
const HEARTBEAT_MS = 15_000;
const REAP_MS = 60_000;
const STALE_MS = 90_000;          // no heartbeat for this long means the worker is gone
const WATCH_MS = 30_000;          // how often an adopted running app is checked
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 4);
const WORKER_ID = process.env.WORKER_ID ?? `${os.hostname()}-${process.pid}`;

const log = (entry: Record<string, unknown>) =>
  console.log(JSON.stringify({ at: new Date().toISOString(), scope: "worker", worker: WORKER_ID, ...entry }));
const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));
// " from Sep 16 at a1b2c3d, 4 patched files"
const describeTrail = (at: string, commit: string | null, files: number) => {
  const when = at ? new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
  const parts = [when, commit ? `at ${commit.slice(0, 7)}` : "", files ? `${files} patched file${files === 1 ? "" : "s"}` : ""].filter(Boolean);
  return parts.length ? ` from ${parts.join(", ")}` : "";
};

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const missing = [
    !url && "NEXT_PUBLIC_SUPABASE_URL", !key && "SUPABASE_SECRET_KEY",
    !process.env.E2B_API_KEY && "E2B_API_KEY", !process.env.ANTHROPIC_API_KEY && "ANTHROPIC_API_KEY",
  ].filter(Boolean);
  if (missing.length) { log({ level: "error", event: "config", missing }); process.exit(2); }
  return { url: url!, key: key! };
}

type RunWithRepo = RunRow & { worker_id: string | null; heartbeat_at: string | null; engelbart_repos: RepoRow & { launch_recipe: LaunchRecipe | null } };
const SELECT = `${RUN_COLUMNS}, worker_id, heartbeat_at, engelbart_repos!engelbart_sandbox_runs_repo_id_fkey(${REPO_COLUMNS}, launch_recipe)`;
type SharedRecipeRow = { commit_sha: string; recipe: LaunchRecipe; captured_at: string };

class Worker {
  private inFlight = new Map<string, SandboxRun>();   // runs this process is driving
  private watching = new Map<string, SandboxRun>();   // running apps adopted after a restart
  private stopping = false;
  private timers: NodeJS.Timeout[] = [];

  constructor(private supabase: SupabaseClient, private runtime: Runtime) {}

  async start() {
    log({ event: "start", concurrency: CONCURRENCY });
    await this.reap();
    this.timers.push(setInterval(() => this.claim(), POLL_MS));
    this.timers.push(setInterval(() => this.heartbeat(), HEARTBEAT_MS));
    this.timers.push(setInterval(() => this.reap(), REAP_MS));
    this.timers.push(setInterval(() => this.watch(), WATCH_MS));
    await this.claim();
  }

  // Take as many queued runs as there is room for, oldest first.
  private async claim() {
    if (this.stopping) return;
    const settingUp = [...this.inFlight.values()].filter((r) => r.status !== "running").length;
    const room = CONCURRENCY - settingUp;
    if (room <= 0) return;
    const { data, error } = await this.supabase
      .from("engelbart_sandbox_runs").select("id").eq("status", "queued").is("worker_id", null).order("started_at").limit(room);
    if (error) { log({ level: "error", event: "claim-query", message: error.message }); return; }
    for (const { id } of data ?? []) {
      const { data: claimed, error: claimError } = await this.supabase
        .from("engelbart_sandbox_runs")
        .update({ worker_id: WORKER_ID, claimed_at: new Date().toISOString(), heartbeat_at: new Date().toISOString() })
        .eq("id", id).eq("status", "queued").is("worker_id", null)
        .select(SELECT).maybeSingle();
      if (claimError) { log({ level: "error", event: "claim", run: id, message: claimError.message }); continue; }
      if (!claimed) continue;   // another worker got there first
      const row = claimed as unknown as RunWithRepo;
      void this.execute(toRun(row), row.engelbart_repos);
    }
  }

  private async execute(run: SandboxRun, repoRow: RunWithRepo["engelbart_repos"]) {
    const repo = toRepo(repoRow);
    this.inFlight.set(run.id, run);
    const record = createRecorder(this.supabase, run.id);
    log({ event: "claimed", run: run.id, repo: repo.fullName, resume: !!run.sandboxId });
    record.event("status", `picked up by runner ${WORKER_ID}`, { worker: WORKER_ID });
    try {
      // A run that still has its sandbox (asked to launch again) skips the clone.
      let launchable: SandboxRun | null = run.sandboxId && run.workdir ? { ...run, status: "cloned" } : null;
      if (!launchable) {
        // The sandbox's size is fixed at creation, so what the repository
        // will need is read off its file list first.
        const paths = await listRepoPaths(repo.owner, repo.name, repo.defaultBranch);
        const docker = paths ? needsDocker(paths) : false;
        if (!paths) record.event("status", "could not list the repository's files on GitHub; using the standard runner");
        const prepared = await this.runtime.prepare(repo, run.id, record, { docker });
        if (prepared.ok) launchable = { ...run, status: "cloned", sandboxId: prepared.sandboxId, workdir: prepared.workdir, commit: prepared.commit };
      }
      if (launchable) {
        this.inFlight.set(run.id, launchable);
        const env = await this.loadEnv(repo.id);
        const { recipe, origin } = launchable.fresh
          ? (record.event("status", "starting over without the saved trail, as asked; the pipeline will analyze it", { phase: "trail", status: "fresh" }), { recipe: null, origin: null })
          : await this.pickRecipe(repo, repoRow.launch_recipe, launchable.commit, record);
        let patch: RepoPatch | null = null;
        const launched = await this.runtime.launch(repo, launchable, record, {
          recipe, env, hint: repo.hint,
          onEnvironment: (report) => void this.saveEnvReport(repo.id, report),
          // A patch made in this run has no origin; one replayed from a recipe does.
          onPatch: (p) => { patch = { ...p, origin: p.replayed ? origin : null }; void this.savePatch(repo.id, patch); },
        });
        if (patch) await this.savePatch(repo.id, { ...(patch as RepoPatch), worked: launched.ok });
        log({ event: launched.ok ? "running" : "failed", run: run.id, repo: repo.fullName, replayed: !!recipe && !launched.recipeFailed, ...(launched.ok ? { previewUrl: launched.previewUrl } : { kind: launched.kind, message: launched.message }) });
        await this.saveRecipe(repo, run.id, launched.ok ? launched.recipe : null, launched.recipeFailed, launchable.commit, origin, record);
        if (launched.ok) {
          this.inFlight.set(run.id, { ...launchable, status: "running", previewUrl: launched.previewUrl, port: launched.port, services: launched.services });
          await launched.done;   // stay attached until the app stops
        }
      }
    } catch (err) {
      const message = errorMessage(err);
      log({ level: "error", event: "crashed", run: run.id, message });
      record.event("error", message, { kind: "WorkerError" });
      await record.status("failed", { errorKind: "WorkerError", error: message });
    } finally {
      await record.flush();
      this.inFlight.delete(run.id);
      log({ event: "released", run: run.id });
    }
  }

  // Stamp the runs this worker holds. A run whose row has gone (its
  // repository was removed, say) is let go and its sandbox killed.
  // The recipe to replay: the repository row's own, else what another
  // project captured for the same public repository, the same commit when
  // there is one and otherwise the latest. With it, where it came from, so a
  // replayed patch can say so.
  private async pickRecipe(repo: Repo, own: LaunchRecipe | null, commit: string | null, record: Recorder): Promise<{ recipe: LaunchRecipe | null; origin: PatchOrigin | null }> {
    if (own) {
      const kept = own.origin as PatchOrigin | undefined;
      const origin: PatchOrigin = kept?.shared
        ? kept
        : { commit: typeof own.commit === "string" ? own.commit : null, at: typeof own.capturedAt === "string" ? own.capturedAt : "", shared: false };
      const files = (own.patch as { files?: string[] } | undefined)?.files?.length ?? 0;
      record.event("status", `replaying this project's trail${describeTrail(origin.at, origin.commit, files)}`, { phase: "trail", status: "own", commit: origin.commit, capturedAt: origin.at, files });
      return { recipe: own, origin };
    }
    const shared = await this.findSharedRecipe(repo, commit);
    if (!shared) {
      record.event("status", "no trail for this repository yet; the pipeline will analyze it", { phase: "trail", status: "none" });
      return { recipe: null, origin: null };
    }
    const same = shared.commit_sha === commit;
    const files = (shared.recipe.patch as { files?: string[] } | undefined)?.files?.length ?? 0;
    record.event("status", `replaying what brought ${repo.fullName} up in another project${describeTrail(shared.captured_at, shared.commit_sha, files)}${same ? "" : " (an earlier commit)"}`, { phase: "trail", status: "shared", commit: shared.commit_sha, capturedAt: shared.captured_at, files, sameCommit: same });
    return { recipe: shared.recipe, origin: { commit: shared.commit_sha, at: shared.captured_at, shared: true } };
  }

  private async findSharedRecipe(repo: Repo, commit: string | null): Promise<SharedRecipeRow | null> {
    const query = () => this.supabase.from("engelbart_launch_recipes").select("commit_sha, recipe, captured_at").eq("owner", repo.owner.toLowerCase()).eq("name", repo.name.toLowerCase());
    if (commit) {
      const { data, error } = await query().eq("commit_sha", commit).maybeSingle();
      if (error) { log({ level: "error", event: "recipe-lookup", repo: repo.fullName, message: error.message }); return null; }
      if (data) return data as SharedRecipeRow;
    }
    const { data, error } = await query().order("captured_at", { ascending: false }).limit(1).maybeSingle();
    if (error) { log({ level: "error", event: "recipe-lookup", repo: repo.fullName, message: error.message }); return null; }
    return (data as SharedRecipeRow | null) ?? null;
  }

  // Keep what worked for next time; drop a saved recipe that failed to replay
  // unless this run produced a fresh one. A recipe from a shared one keeps
  // that origin, so the person can still see where its edits first came from.
  private async saveRecipe(repo: Repo, runId: string, recipe: LaunchRecipe | null, recipeFailed: boolean, commit: string | null, origin: PatchOrigin | null, record: Recorder) {
    const now = new Date().toISOString();
    const stamped = recipe ? { ...recipe, commit, capturedAt: now, ...(origin?.shared ? { origin } : {}) } : null;
    const patch = stamped
      ? { launch_recipe: stamped, recipe_run_id: runId, recipe_at: now }
      : recipeFailed ? { launch_recipe: null, recipe_run_id: null, recipe_at: null } : null;
    if (!patch) return;
    const { error } = await this.supabase.from("engelbart_repos").update(patch).eq("id", repo.id);
    if (error) log({ level: "error", event: "recipe-save", run: runId, message: error.message });
    else log({ event: stamped ? "recipe-saved" : "recipe-dropped", run: runId, repo: repo.id });
    if (stamped && !error) record.event("status", "trail saved for next time", { phase: "trail", status: "saved" });
    if (stamped && commit) await this.shareRecipe(repo, runId, commit, stamped, record);
  }

  // A recipe for a public repository is kept for every project, by commit.
  // Private repositories, and ones GitHub will not describe, stay with
  // their own row.
  private async shareRecipe(repo: Repo, runId: string, commit: string, recipe: LaunchRecipe, record: Recorder) {
    const isPublic = await isPublicRepo(repo.owner, repo.name);
    if (!isPublic) { log({ event: "recipe-kept-private", run: runId, repo: repo.fullName, reason: isPublic === null ? "visibility unknown" : "private" }); return; }
    const { error } = await this.supabase.from("engelbart_launch_recipes").upsert(
      { owner: repo.owner.toLowerCase(), name: repo.name.toLowerCase(), commit_sha: commit, recipe, captured_run_id: runId, captured_repo_id: repo.id, captured_at: new Date().toISOString() },
      { onConflict: "owner,name,commit_sha" },
    );
    if (error) log({ level: "error", event: "recipe-share", run: runId, repo: repo.fullName, message: error.message });
    else { log({ event: "recipe-shared", run: runId, repo: repo.fullName, commit }); record.event("status", "trail shared for other projects that add this repository", { phase: "trail", status: "shared", saved: true, commit }); }
  }

  // The values saved for a repository, for the pipeline. Read with the
  // service key; the run itself was already authorised when it was queued.
  private async loadEnv(repoId: string): Promise<Record<string, string>> {
    const { data, error } = await this.supabase.from("engelbart_repo_env").select("name, value").eq("repo_id", repoId);
    if (error) { log({ level: "error", event: "env-load", repo: repoId, message: error.message }); return {}; }
    return Object.fromEntries(((data ?? []) as { name: string; value: string }[]).map((r) => [r.name, r.value]));
  }

  // What the repair agent changed, for the person to see; first as soon as
  // it happens, then again with whether it worked.
  private async savePatch(repoId: string, patch: RepoPatch) {
    const { error } = await this.supabase.from("engelbart_repos").update({ patch }).eq("id", repoId);
    if (error) log({ level: "error", event: "patch-save", repo: repoId, message: error.message });
  }

  private async saveEnvReport(repoId: string, report: EnvReport) {
    const { error } = await this.supabase.from("engelbart_repos").update({ env_report: report }).eq("id", repoId);
    if (error) log({ level: "error", event: "env-report", repo: repoId, message: error.message });
  }

  private async heartbeat() {
    const ids = [...this.inFlight.keys(), ...this.watching.keys()];
    if (!ids.length) return;
    const { data, error } = await this.supabase.from("engelbart_sandbox_runs").update({ heartbeat_at: new Date().toISOString() }).in("id", ids).select("id");
    if (error) { log({ level: "error", event: "heartbeat", message: error.message }); return; }
    const present = new Set((data ?? []).map((r) => r.id as string));
    for (const id of ids) {
      if (present.has(id)) continue;
      const run = this.inFlight.get(id) ?? this.watching.get(id);
      this.inFlight.delete(id);
      this.watching.delete(id);
      log({ event: "vanished", run: id, sandbox: run?.sandboxId });
      if (run?.sandboxId) { try { await Sandbox.kill(run.sandboxId); } catch { /* already gone */ } }
    }
  }

  // Runs whose worker stopped heartbeating. In-progress ones cannot be resumed
  // (their output stream died with the worker), so they fail and their sandbox
  // goes. Running ones are adopted: the app may well still be up.
  private async reap() {
    await this.sweepSandboxes();
    const stale = new Date(Date.now() - STALE_MS).toISOString();
    const { data, error } = await this.supabase
      .from("engelbart_sandbox_runs").select(SELECT)
      .in("status", ["creating", "cloning", "cloned", "launching", "running"])
      .not("worker_id", "is", null).or(`heartbeat_at.is.null,heartbeat_at.lt.${stale}`);
    if (error) { log({ level: "error", event: "reap-query", message: error.message }); return; }
    for (const row of (data ?? []) as unknown as RunWithRepo[]) {
      const run = toRun(row);
      if (this.inFlight.has(run.id) || this.watching.has(run.id)) continue;
      if (run.status === "running") {
        this.watching.set(run.id, run);
        log({ event: "adopted", run: run.id, sandbox: run.sandboxId });
        await this.supabase.from("engelbart_sandbox_runs").update({ worker_id: WORKER_ID, heartbeat_at: new Date().toISOString() }).eq("id", run.id);
        await this.check(run);
        continue;
      }
      const record = createRecorder(this.supabase, run.id);
      const message = "The runner stopped while this run was in progress. Try again.";
      log({ event: "reaped", run: run.id, status: run.status, worker: row.worker_id });
      record.event("error", message, { kind: "WorkerLost", worker: row.worker_id });
      await record.status("failed", { errorKind: "WorkerLost", error: message });
      if (run.sandboxId) { try { await Sandbox.kill(run.sandboxId); record.event("status", "sandbox killed"); } catch { /* already gone */ } }
      await record.flush();
    }
  }

  // Every sandbox we created carries its run id. Any whose run is gone,
  // failed or stopped is costing sandbox time for nothing: kill it.
  private async sweepSandboxes() {
    try {
      const paginator = Sandbox.list({ query: { state: ["running", "paused"] } });
      const infos = [];
      while (paginator.hasNext) infos.push(...(await paginator.nextItems()));
      const ours = infos.filter((i) => typeof i.metadata?.runId === "string");
      if (!ours.length) return;
      const { data, error } = await this.supabase.from("engelbart_sandbox_runs").select("id, status").in("id", ours.map((i) => i.metadata!.runId));
      if (error) { log({ level: "error", event: "sweep-query", message: error.message }); return; }
      const status = new Map((data ?? []).map((r) => [r.id as string, r.status as string]));
      for (const info of ours) {
        const runId = info.metadata!.runId;
        const s = status.get(runId);
        if (s && s !== "failed" && s !== "killed") continue;
        this.inFlight.delete(runId);
        this.watching.delete(runId);
        try { await Sandbox.kill(info.sandboxId); log({ event: "swept", run: runId, sandbox: info.sandboxId, status: s ?? "gone" }); } catch { /* already gone */ }
      }
    } catch (err) {
      log({ level: "error", event: "sweep", message: errorMessage(err) });
    }
  }

  // Adopted apps have no output stream; the sandbox's own state is what we can see.
  private async watch() {
    for (const run of this.watching.values()) await this.check(run);
  }

  private async check(run: SandboxRun) {
    let alive = false;
    try { alive = (await Sandbox.getInfo(run.sandboxId!)).state === "running"; } catch { alive = false; }
    if (alive) return;
    this.watching.delete(run.id);
    const record = createRecorder(this.supabase, run.id);
    const message = "The sandbox is no longer running.";
    log({ event: "expired", run: run.id, sandbox: run.sandboxId });
    record.event("error", message, { kind: "SandboxGone" });
    await record.status("failed", { errorKind: "SandboxGone", error: message });
    await record.flush();
  }

  // On shutdown, runs still being set up cannot outlive this process; say so
  // and free their sandboxes. Running apps stay up for the next worker to adopt.
  async stop(signal: string) {
    if (this.stopping) return;
    this.stopping = true;
    this.timers.forEach(clearInterval);
    log({ event: "stop", signal, inFlight: this.inFlight.size, watching: this.watching.size });
    for (const run of this.inFlight.values()) {
      if (run.status === "running") continue;
      const record = createRecorder(this.supabase, run.id);
      const message = "The runner shut down while this run was in progress. Try again.";
      record.event("error", message, { kind: "WorkerStopped" });
      await record.status("failed", { errorKind: "WorkerStopped", error: message });
      if (run.sandboxId) { try { await Sandbox.kill(run.sandboxId); record.event("status", "sandbox killed"); } catch { /* already gone */ } }
      await record.flush();
    }
    process.exit(0);
  }
}

const { url, key } = config();
const worker = new Worker(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }), getRuntime());
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => void worker.stop(signal));
worker.start().catch((err) => { log({ level: "error", event: "fatal", message: errorMessage(err) }); process.exit(1); });
