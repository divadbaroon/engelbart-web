// The benchmark driver: puts the manifest's repositories in a project,
// queues a run for each, waits for the worker to finish them, and
// collects one record per repository from what the run left behind.
// It goes through the same rows the app writes, so the worker does
// exactly what it does for a person; nothing here bypasses the pipeline.
//
//   npm run bench -- add      --project Benchmark
//   npm run bench -- queue    --project Benchmark --pass p1 [--only web_preview,simulation] [--limit 5]
//   npm run bench -- wait     --pass p1 [--timeout-min 120]
//   npm run bench -- collect  --project Benchmark --pass p1 [--no-screenshots]
//   npm run bench -- stop     --pass p1
//   npm run bench -- all      --project Benchmark --pass p1 [--only ...] [--limit N]
//
// Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY and E2B_API_KEY (for
// stop). BENCH_MANIFEST=path swaps the list. --project takes a project id or its exact name. Records go to
// bench/results/<pass>.json; screenshots to bench/results/<pass>/.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { GITHUB_HEADERS } from "@/lib/github";
import { REPO_COLUMNS, toRepo, type Repo, type RepoRow } from "@/lib/repos";
import { EVENT_COLUMNS, RUN_COLUMNS, toEvent, toRun, type EventRow, type RunRow, type SandboxEvent, type SandboxRun } from "@/lib/sandbox";
import { runSteps, runDuration, stepDuration, type RunStep } from "@/lib/run-steps";
import { createRecorder } from "@/lib/runtime/recorder";
import { TEMPLATE } from "@/lib/runtime/e2b";

const exec = promisify(execFile);
const ROOT = new URL("../../", import.meta.url).pathname;
const RESULTS = `${ROOT}bench/results`;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export type Manifest = { url: string; owner: string; name: string; kind: string; title: string; contents: string; envNotes: string; constraints: string; reviewedCommit: string };

export type BenchRecord = {
  url: string; owner: string; name: string; kind: string; constraints: string;
  repoId: string; runId: string | null;
  status: string | null; template: string | null; commit: string | null;
  startedAt: string | null; totalMs: number | null;
  steps: { id: string; state: string; summary: string; ms: number | null }[];
  docker: boolean; localSupabase: "ready" | "unavailable" | "skipped" | "none";
  local: string[]; missing: string[];
  trail: "own" | "shared" | "none" | "unknown"; replayHeld: boolean | null;
  repairAttempts: number; patch: { files: string[]; summary: string } | null;
  previewUrl: string | null; http: { status: number; title: string } | null; screenshot: string | null;
  error: string | null;
  grade?: { label: "pass" | "partial" | "fail"; reason: string; model: string; at: string };
};

type Args = { command: string; project?: string; pass: string; only?: string[]; limit?: number; timeoutMin: number; screenshots: boolean };

function args(): Args {
  const a = process.argv.slice(2);
  const command = a[0] ?? "help";
  const get = (flag: string) => { const i = a.indexOf(flag); return i >= 0 ? a[i + 1] : undefined; };
  return {
    command, project: get("--project"), pass: get("--pass") ?? "p1",
    only: get("--only")?.split(",").map((s) => s.trim()).filter(Boolean),
    limit: get("--limit") ? Number(get("--limit")) : undefined,
    timeoutMin: get("--timeout-min") ? Number(get("--timeout-min")) : 150,
    screenshots: !a.includes("--no-screenshots"),
  };
}

function client(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) { console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are needed (source .env.local)."); process.exit(2); }
  return createClient(url, key, { auth: { persistSession: false } });
}

// BENCH_MANIFEST points at another list, for a smoke test or a subset.
const manifest = (): Manifest[] => JSON.parse(readFileSync(process.env.BENCH_MANIFEST ?? `${ROOT}bench/manifest.json`, "utf8"));
const queueFile = (pass: string) => `${RESULTS}/${pass}.queue.json`;
const resultsFile = (pass: string) => `${RESULTS}/${pass}.json`;
const readJson = <T,>(path: string, fallback: T): T => (existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : fallback);
const writeJson = (path: string, value: unknown) => { mkdirSync(RESULTS, { recursive: true }); writeFileSync(path, JSON.stringify(value, null, 2) + "\n"); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function project(sb: SupabaseClient, ref: string | undefined): Promise<{ id: string; userId: string; name: string }> {
  if (!ref) { console.error("--project <id or name> is required"); process.exit(2); }
  const byId = /^[0-9a-f-]{36}$/.test(ref);
  const q = sb.from("hc_projects").select("id, user_id, name");
  const { data, error } = await (byId ? q.eq("id", ref) : q.eq("name", ref)).limit(2);
  if (error) throw error;
  if (!data?.length) { console.error(`no project ${ref}; create it in the workspace first`); process.exit(2); }
  if (data.length > 1) { console.error(`${data.length} projects are named ${ref}; pass the id`); process.exit(2); }
  return { id: data[0].id, userId: data[0].user_id, name: data[0].name };
}

function selected(a: Args): Manifest[] {
  let list = manifest();
  if (a.only?.length) list = list.filter((m) => a.only!.includes(m.kind));
  if (a.limit) list = list.slice(0, a.limit);
  return list;
}

async function reposIn(sb: SupabaseClient, projectId: string): Promise<Repo[]> {
  const { data, error } = await sb.from("engelbart_repos").select(REPO_COLUMNS).eq("project_id", projectId);
  if (error) throw error;
  return (data as RepoRow[]).map(toRepo);
}

const key = (owner: string, name: string) => `${owner.toLowerCase()}/${name.toLowerCase()}`;

// --- add: the manifest's repositories, as the app would add them.
async function add(sb: SupabaseClient, a: Args) {
  const p = await project(sb, a.project);
  const have = new Map((await reposIn(sb, p.id)).map((r) => [key(r.owner, r.name), r]));
  let added = 0;
  for (const m of selected(a)) {
    if (have.has(key(m.owner, m.name))) continue;
    const res = await fetch(`https://api.github.com/repos/${m.owner}/${m.name}`, { headers: GITHUB_HEADERS });
    const gh = res.ok ? ((await res.json()) as { html_url?: string; default_branch?: string; description?: string | null; language?: string | null }) : {};
    if (!res.ok) console.log(`  github ${res.status} for ${m.owner}/${m.name}; adding without details`);
    const { error } = await sb.from("engelbart_repos").insert({
      user_id: p.userId, project_id: p.id, owner: m.owner, name: m.name,
      url: gh.html_url ?? m.url, default_branch: gh.default_branch ?? "", description: gh.description ?? "", language: gh.language ?? "",
    });
    if (error) { console.log(`  could not add ${m.owner}/${m.name}: ${error.message}`); continue; }
    added++;
    console.log(`  added ${m.owner}/${m.name}`);
  }
  console.log(`${added} added to ${p.name}; ${have.size} were already there`);
}

// --- queue: one run per repository; the worker takes them from here.
async function queue(sb: SupabaseClient, a: Args) {
  const p = await project(sb, a.project);
  const repos = new Map((await reposIn(sb, p.id)).map((r) => [key(r.owner, r.name), r]));
  const queued = readJson<Record<string, string>>(queueFile(a.pass), {});
  for (const m of selected(a)) {
    const repo = repos.get(key(m.owner, m.name));
    if (!repo) { console.log(`  ${m.owner}/${m.name} is not in the project; run add first`); continue; }
    if (queued[repo.id]) continue;
    const active = await sb.from("engelbart_sandbox_runs").select("id, status").eq("repo_id", repo.id).in("status", ["queued", "creating", "cloning", "cloned", "launching"]).limit(1);
    if (active.data?.length) { console.log(`  ${m.owner}/${m.name} already has an active run ${active.data[0].id}`); queued[repo.id] = active.data[0].id; continue; }
    const { data, error } = await sb.from("engelbart_sandbox_runs").insert({ repo_id: repo.id, project_id: p.id, user_id: p.userId, template: TEMPLATE }).select("id").single();
    if (error) { console.log(`  could not queue ${m.owner}/${m.name}: ${error.message}`); continue; }
    queued[repo.id] = data.id;
    console.log(`  queued ${m.owner}/${m.name} → ${data.id}`);
  }
  writeJson(queueFile(a.pass), queued);
  console.log(`${Object.keys(queued).length} runs in ${queueFile(a.pass)}`);
}

const OVER = new Set(["running", "failed", "killed", "paused"]);

// --- wait: until every queued run is running or over.
async function wait(sb: SupabaseClient, a: Args) {
  const queued = readJson<Record<string, string>>(queueFile(a.pass), {});
  const ids = Object.values(queued);
  if (!ids.length) { console.log("nothing queued"); return; }
  const deadline = Date.now() + a.timeoutMin * 60_000;
  let last = "";
  while (Date.now() < deadline) {
    const { data, error } = await sb.from("engelbart_sandbox_runs").select("id, status").in("id", ids);
    if (error) throw error;
    const counts: Record<string, number> = {};
    for (const r of data ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1;
    const line = Object.entries(counts).sort().map(([s, n]) => `${s} ${n}`).join(" · ");
    if (line !== last) { console.log(`${new Date().toISOString().slice(11, 19)}  ${line}`); last = line; }
    if ((data ?? []).every((r) => OVER.has(r.status))) { console.log("all runs are over or running"); return; }
    await sleep(15_000);
  }
  console.log("timed out waiting; collect what there is");
}

// --- collect: one record per repository from its run.
async function collect(sb: SupabaseClient, a: Args) {
  const p = await project(sb, a.project);
  const repos = new Map((await reposIn(sb, p.id)).map((r) => [key(r.owner, r.name), r]));
  const queued = readJson<Record<string, string>>(queueFile(a.pass), {});
  const previous = new Map(readJson<BenchRecord[]>(resultsFile(a.pass), []).map((r) => [r.repoId, r]));
  const records: BenchRecord[] = [];
  if (a.screenshots) mkdirSync(`${RESULTS}/${a.pass}`, { recursive: true });
  for (const m of selected(a)) {
    const repo = repos.get(key(m.owner, m.name));
    if (!repo) continue;
    const runId = queued[repo.id] ?? null;
    const base: BenchRecord = {
      url: m.url, owner: m.owner, name: m.name, kind: m.kind, constraints: m.constraints, repoId: repo.id, runId,
      status: null, template: null, commit: null, startedAt: null, totalMs: null, steps: [], docker: false, localSupabase: "none",
      local: [], missing: [], trail: "unknown", replayHeld: null, repairAttempts: 0, patch: null, previewUrl: null, http: null, screenshot: null, error: null,
      grade: previous.get(repo.id)?.grade,
    };
    if (!runId) { records.push(base); continue; }
    const runRes = await sb.from("engelbart_sandbox_runs").select(RUN_COLUMNS).eq("id", runId).maybeSingle();
    if (runRes.error || !runRes.data) { records.push({ ...base, error: runRes.error?.message ?? "run row missing" }); continue; }
    const ev = await sb.from("engelbart_sandbox_events").select(EVENT_COLUMNS).eq("run_id", runId).order("seq");
    if (ev.error) throw ev.error;
    const run = toRun(runRes.data as RunRow);
    const events = (ev.data as EventRow[]).map(toEvent);
    const record = describe(base, run, events);
    if (run.status === "running" && run.previewUrl) {
      record.http = await probe(run.previewUrl);
      if (a.screenshots) record.screenshot = await screenshot(run.previewUrl, `${RESULTS}/${a.pass}/${m.owner}-${m.name}.png`);
    }
    records.push(record);
    console.log(`  ${(record.status ?? "-").padEnd(9)} ${m.kind.padEnd(26)} ${m.owner}/${m.name}${record.http ? ` → ${record.http.status}` : ""}`);
  }
  writeJson(resultsFile(a.pass), records);
  const counts: Record<string, number> = {};
  for (const r of records) counts[r.status ?? "not run"] = (counts[r.status ?? "not run"] ?? 0) + 1;
  console.log(`${records.length} records → ${resultsFile(a.pass)}  (${Object.entries(counts).map(([s, n]) => `${s} ${n}`).join(", ")})`);
}

function describe(base: BenchRecord, run: SandboxRun, events: SandboxEvent[]): BenchRecord {
  const steps = runSteps(run, events);
  const now = Date.now();
  const find = (pick: (e: SandboxEvent) => boolean) => events.filter(pick);
  const last = <T,>(list: T[]) => list[list.length - 1];
  const supa = last(find((e) => e.data?.phase === "supabase"));
  const supaStatus = String(supa?.data?.status ?? "");
  const env = last(find((e) => e.data?.phase === "environment" && Array.isArray(e.data?.variables)));
  const vars = (env?.data?.variables as { name: string; status: string }[] | undefined) ?? [];
  const trail = last(find((e) => e.data?.phase === "trail" && ["own", "shared", "none"].includes(String(e.data?.status))));
  const replayEvents = find((e) => e.data?.phase === "recipe");
  const replaying = replayEvents.some((e) => e.data?.status === "replaying") || events.some((e) => e.data?.recipe === true);
  const replayFailed = replayEvents.some((e) => e.data?.status === "failed" || e.data?.status === "ignored");
  const patches = find((e) => e.data?.phase === "patch" && (e.data?.status === "applied" || e.data?.status === "replayed"));
  const lastPatch = last(patches);
  return {
    ...base,
    status: run.status, template: run.template, commit: run.commit, startedAt: run.startedAt,
    totalMs: runDuration(steps, now),
    steps: steps.map((s: RunStep) => ({ id: s.id, state: s.state, summary: s.summary, ms: stepDuration(s, now) })),
    docker: run.template.endsWith("-docker"),
    localSupabase: supaStatus === "ready" ? "ready" : supaStatus === "skipped" ? "skipped" : supa ? "unavailable" : "none",
    local: vars.filter((v) => v.status === "local").map((v) => v.name),
    missing: ((env?.data?.skipped as string[] | undefined) ?? []),
    trail: trail ? (String(trail.data?.status) as BenchRecord["trail"]) : replaying ? "own" : events.some((e) => e.data?.phase === "plan") ? "none" : "unknown",
    replayHeld: replaying ? !replayFailed : null,
    repairAttempts: find((e) => e.data?.phase === "patch" && e.data?.status === "starting").length,
    patch: lastPatch ? { files: (lastPatch.data?.files as string[]) ?? [], summary: String(lastPatch.data?.summary ?? "") } : null,
    previewUrl: run.previewUrl, error: run.error,
  };
}

async function probe(url: string): Promise<{ status: number; title: string }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(25_000), redirect: "follow" });
    const body = await res.text();
    const title = body.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "";
    return { status: res.status, title: title.slice(0, 120) };
  } catch (err) {
    return { status: 0, title: err instanceof Error ? err.message : String(err) };
  }
}

async function screenshot(url: string, path: string): Promise<string | null> {
  if (!existsSync(CHROME)) return null;
  try {
    await exec(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=1280,800", "--virtual-time-budget=8000", `--screenshot=${path}`, url], { timeout: 45_000 });
    return path.replace(`${RESULTS}/`, "");
  } catch (err) {
    console.log(`  screenshot failed for ${url}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// --- stop: kill the sandboxes still running for this pass.
async function stop(sb: SupabaseClient, a: Args) {
  const queued = readJson<Record<string, string>>(queueFile(a.pass), {});
  const ids = Object.values(queued);
  if (!ids.length) return;
  const { data, error } = await sb.from("engelbart_sandbox_runs").select(RUN_COLUMNS).in("id", ids).not("status", "in", "(failed,killed)");
  if (error) throw error;
  const { Sandbox } = await import("e2b");
  for (const row of (data ?? []) as RunRow[]) {
    const run = toRun(row);
    const record = createRecorder(sb, run.id);
    if (run.sandboxId) {
      try { await Sandbox.kill(run.sandboxId); record.event("status", "sandbox killed by the benchmark"); }
      catch (err) { record.event("error", `kill failed: ${err instanceof Error ? err.message : String(err)}`); }
    }
    await record.status("killed");
    await record.flush();
    console.log(`  stopped ${run.id} (${run.status})`);
  }
  console.log(`${data?.length ?? 0} runs stopped`);
}

async function main() {
  const a = args();
  const sb = client();
  switch (a.command) {
    case "add": return add(sb, a);
    case "queue": return queue(sb, a);
    case "wait": return wait(sb, a);
    case "collect": return collect(sb, a);
    case "stop": return stop(sb, a);
    case "all":
      await add(sb, a); await queue(sb, a); await wait(sb, a); await collect(sb, a); await stop(sb, a);
      return;
    default:
      console.log("commands: add | queue | wait | collect | stop | all   (see the header of scripts/bench/run.mts)");
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
