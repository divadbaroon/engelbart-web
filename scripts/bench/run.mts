// The benchmark driver: puts the manifest's repositories in a project,
// queues a run for each, waits for the worker to finish them, and
// collects one record per repository from what the run left behind.
// It goes through the same rows the app writes, so the worker does
// exactly what it does for a person; nothing here bypasses the pipeline.
//
//   npm run bench -- add      --project Benchmark
//   npm run bench -- queue    --project Benchmark --pass p1 [--only web_preview,simulation] [--limit 5] [--fresh] [--variant ladder|session] [--no-head-start]
//   npm run bench -- wait     --pass p1 [--timeout-min 120] [--keep-live]
//   npm run bench -- collect  --project Benchmark --pass p1 [--no-screenshots]
//   npm run bench -- stop     --pass p1
//   npm run bench -- all      --project Benchmark --pass p1 [--only ...] [--repos owner/name,...] [--limit N] [--fresh] [--variant ladder|session] [--no-head-start] [--keep-live]
//
// --fresh queues each run without its saved trail, so a pass measures the
// pipeline from scratch rather than a replay. A run that goes live is probed
// and screenshotted the moment wait sees it, into bench/results/<pass>.live.json,
// and then stopped: the pass has what it came for, and a sandbox serving
// nobody would only burn its hour. --keep-live leaves them up instead.
//
// --variant names how a run of this pass may recover when the pipeline
// cannot start the repository: `ladder` is the rungs it has always climbed,
// `session` is one continuing agent session. Without the flag the column is
// left unset, which is what every run made before the choice existed says,
// and the worker's own default stands.
//
// Two passes are an A/B only insofar as they ran the same code. They are
// matched by repository and not by commit: the clone takes the default
// branch's HEAD at the moment it runs and nothing pins a revision (see
// headCommit in lib/runtime/e2b.ts), so arms queued days apart can be
// reading different code. Each record carries the commit the clone landed
// on, which is how to tell afterwards whether they did.
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
import { RUN_VARIANTS, type RunVariant } from "@/lib/runtime/types";

const exec = promisify(execFile);
const ROOT = new URL("../../", import.meta.url).pathname;
const RESULTS = `${ROOT}bench/results`;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export type Manifest = { url: string; owner: string; name: string; kind: string; title: string; contents: string; envNotes: string; constraints: string; reviewedCommit: string };

// One thing that went wrong, in the order it happened: a worker or sandbox
// error, a pipeline error, an app that did not answer or crashed, a repair
// that failed. The grader reads these to say whose fault it was.
export type BenchFailure = { step: string; source: "worker" | "pipeline" | "app" | "repair"; reason: string; stage: string | null; detail: Record<string, unknown> };

export type BenchRecord = {
  url: string; owner: string; name: string; kind: string; constraints: string;
  repoId: string; runId: string | null;
  // The run's status; "expired" when it was live and the pass stopped it, or its sandbox reached
  // its lifetime before the pass collected it. "usable" means nothing to
  // serve, but installed and checked, with what to run next in `next`.
  status: string | null;
  next: string | null; template: string | null; commit: string | null;
  // How the run was allowed to recover, read back off the row rather than
  // taken from this pass's flag, so a record says what actually ran. Null is
  // every run queued before the choice existed, which is the ladder.
  variant: RunVariant | null;
  // What the dependency install cost and whether it was allowed to start
  // early at all, so the head start can be priced rather than argued
  // about: how long it ran, and how long the pipeline then blocked on it
  // before installing again. Null `headStart` is the default, which is on.
  headStart: boolean | null;
  install: { status: string; command: string; seconds: number | null; waited: number | null } | null;
  // Whether anyone actually opened the page and read it, and why not.
  // Answering on a port and working are different claims, and a grade
  // that cannot tell them apart will read an unchecked run as a verified
  // one. Null is "not recorded": no browser check appears in the log at
  // all, whether because the run never answered, because the path did
  // not make one, or because it comes from a sandbox built before the
  // check was reported. It is not evidence either way.
  verified: boolean | null;
  unverified: string | null;
  startedAt: string | null; totalMs: number | null;
  steps: { id: string; state: string; summary: string; ms: number | null }[];
  docker: boolean; localSupabase: "ready" | "unavailable" | "skipped" | "none";
  local: string[]; missing: string[];
  trail: "own" | "shared" | "none" | "unknown"; replayHeld: boolean | null;
  // Whether this run's model calls could be watched at all, and how many
  // were caught. The state is the least capable thing any realm reported,
  // which is the rule the trace itself is read by (captureState in
  // lib/trace/timeline.ts); "unreported" means nothing said either way, so a
  // run with no model calls is not evidence that it made none.
  capture: string; modelCalls: number | null;
  repairAttempts: number; patch: { files: string[]; summary: string } | null;
  previewUrl: string | null; http: { status: number; title: string } | null; screenshot: string | null;
  liveAt: string | null;   // when wait first saw it live
  error: string | null;
  // What ran, what went wrong, and the output of the stage that failed.
  stages: string[]; failures: BenchFailure[]; output: string;
  // How the run got where it got, what its agent calls cost, what the
  // brief said the repository is, and the blocker when there was one.
  path: "direct" | "repaired" | "resolved" | "setup" | "recovered" | null;
  cost: number | null;
  brief: { purpose: string; primaryApp: string; confidence: string; nothingToServe: boolean } | null;
  resolver: { status: string; hint: string | null } | null;
  blocker: { kind: string; what: string } | null;
  grade?: { label: "pass" | "partial" | "fail"; cause: BenchCause; reason: string; wentWrong: string; model: string; at: string };
};

export type BenchCause = "sandbox" | "repository" | "agent" | "settings" | "none";

type Args = { command: string; project?: string; pass: string; only?: string[]; repos?: string[]; limit?: number; timeoutMin: number; screenshots: boolean; fresh: boolean; variant: RunVariant | null; headStart: boolean; keepLive: boolean };

function args(): Args {
  const a = process.argv.slice(2);
  const command = a[0] ?? "help";
  const get = (flag: string) => { const i = a.indexOf(flag); return i >= 0 ? a[i + 1] : undefined; };
  // A misspelt arm would queue a whole pass against the default and read as
  // a null result, so it stops here rather than at the report.
  const variant = get("--variant");
  if (a.includes("--variant") && !RUN_VARIANTS.some((v) => v === variant)) {
    console.error(`--variant takes ${RUN_VARIANTS.join(" or ")}; got ${variant ? `"${variant}"` : "nothing"}`);
    process.exit(2);
  }
  return {
    command, project: get("--project"), pass: get("--pass") ?? "p1",
    only: get("--only")?.split(",").map((s) => s.trim()).filter(Boolean),
    repos: get("--repos")?.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
    limit: get("--limit") ? Number(get("--limit")) : undefined,
    timeoutMin: get("--timeout-min") ? Number(get("--timeout-min")) : 150,
    screenshots: !a.includes("--no-screenshots"),
    fresh: a.includes("--fresh"),
    variant: (variant as RunVariant | undefined) ?? null,
    // On unless this pass is the arm that measures what it is worth.
    headStart: !a.includes("--no-head-start"),
    keepLive: a.includes("--keep-live"),
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
const liveFile = (pass: string) => `${RESULTS}/${pass}.live.json`;
type LiveSeen = { at: string; previewUrl: string; http: { status: number; title: string } | null; screenshot: string | null };
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
  if (a.repos?.length) list = list.filter((m) => a.repos!.includes(`${m.owner}/${m.name}`.toLowerCase()));
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
    // The arm is left off the row entirely when the pass did not name one:
    // a null variant is what every run before this flag carries, so a pass
    // without it queues exactly the row it always did.
    // Only false is written. A null head_start is what every run before
    // the flag carries and means the same as true, so a pass that does not
    // mention it reads exactly like one queued from the app.
    const { data, error } = await sb.from("engelbart_sandbox_runs").insert({ repo_id: repo.id, project_id: p.id, user_id: p.userId, template: TEMPLATE, fresh: a.fresh, ...(a.variant ? { variant: a.variant } : {}), ...(a.headStart ? {} : { head_start: false }) }).select("id").single();
    if (error) { console.log(`  could not queue ${m.owner}/${m.name}: ${error.message}`); continue; }
    queued[repo.id] = data.id;
    const said = [a.variant, a.headStart ? null : "no head start"].filter(Boolean).join(", ");
    console.log(`  queued ${m.owner}/${m.name} → ${data.id}${said ? ` (${said})` : ""}`);
  }
  writeJson(queueFile(a.pass), queued);
  console.log(`${Object.keys(queued).length} runs in ${queueFile(a.pass)}`);
}

const OVER = new Set(["running", "usable", "no_service", "failed", "killed", "paused"]);

// --- wait: until every queued run is running or over.
async function wait(sb: SupabaseClient, a: Args) {
  const queued = readJson<Record<string, string>>(queueFile(a.pass), {});
  const ids = Object.values(queued);
  if (!ids.length) { console.log("nothing queued"); return; }
  const deadline = Date.now() + a.timeoutMin * 60_000;
  const live = readJson<Record<string, LiveSeen>>(liveFile(a.pass), {});
  const names = new Map(Object.entries(queued).map(([repoId, runId]) => [runId, repoId]));
  if (a.screenshots) mkdirSync(`${RESULTS}/${a.pass}`, { recursive: true });
  let last = "";
  while (Date.now() < deadline) {
    const { data, error } = await sb.from("engelbart_sandbox_runs").select("id, status, preview_url, sandbox_id").in("id", ids);
    if (error) throw error;
    // A run seen live is probed now, and then stopped: the pass has what it
    // came for, and a sandbox serving nobody would only burn its hour.
    for (const r of data ?? []) {
      if (r.status !== "running" || !r.preview_url || live[r.id]) continue;
      const http = await probe(r.preview_url);
      const screenshot = a.screenshots ? await screenshot_(r.preview_url, `${RESULTS}/${a.pass}/${names.get(r.id) ?? r.id}.png`) : null;
      live[r.id] = { at: new Date().toISOString(), previewUrl: r.preview_url, http, screenshot };
      writeJson(liveFile(a.pass), live);
      console.log(`  live: ${names.get(r.id) ?? r.id} → ${http.status} ${http.title}`);
      if (!a.keepLive) { await stopRun(sb, r.id, r.sandbox_id, "seen live by the benchmark"); r.status = "killed"; }
    }
    // A run set up for use keeps its sandbox for someone to open a shell in;
    // the pass has its summary already.
    for (const r of data ?? []) {
      if (r.status !== "usable" || a.keepLive) continue;
      await stopRun(sb, r.id, r.sandbox_id, "set up for use; the benchmark has its summary");
      r.status = "killed";
    }
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
  const live = readJson<Record<string, LiveSeen>>(liveFile(a.pass), {});
  const records: BenchRecord[] = [];
  if (a.screenshots) mkdirSync(`${RESULTS}/${a.pass}`, { recursive: true });
  for (const m of selected(a)) {
    const repo = repos.get(key(m.owner, m.name));
    if (!repo) continue;
    const runId = queued[repo.id] ?? null;
    const base: BenchRecord = {
      url: m.url, owner: m.owner, name: m.name, kind: m.kind, constraints: m.constraints, repoId: repo.id, runId,
      status: null, template: null, commit: null, variant: null, headStart: null, install: null,
      verified: null, unverified: null, startedAt: null, totalMs: null, steps: [], docker: false, localSupabase: "none",
      local: [], missing: [], trail: "unknown", replayHeld: null, capture: "unreported", modelCalls: null, repairAttempts: 0, patch: null, previewUrl: null, http: null, screenshot: null, liveAt: null, error: null, next: null,
      stages: [], failures: [], output: "",
      path: null, cost: null, brief: null, resolver: null, blocker: null,
      grade: previous.get(repo.id)?.grade,
    };
    if (!runId) { records.push(base); continue; }
    const runRes = await sb.from("engelbart_sandbox_runs").select(RUN_COLUMNS).eq("id", runId).maybeSingle();
    if (runRes.error || !runRes.data) { records.push({ ...base, error: runRes.error?.message ?? "run row missing" }); continue; }
    // A long run writes more events than one request returns (the API caps
    // a page at 1000 rows), and the ones that say how it ended come last.
    const rows: EventRow[] = [];
    for (let from = 0; ; from += 1000) {
      const ev = await sb.from("engelbart_sandbox_events").select(EVENT_COLUMNS).eq("run_id", runId).order("seq").range(from, from + 999);
      if (ev.error) throw ev.error;
      rows.push(...(ev.data as EventRow[]));
      if (ev.data.length < 1000) break;
    }
    let run = toRun(runRes.data as RunRow);
    let events = rows.map(toEvent);
    // A worker from before the exit race was fixed stamped a concluded run
    // as failed a second later; the events hold the real outcome.
    const raced = events.some((e) => e.data?.phase === "conclusion") && run.status === "failed" && /exited with code 0/.test(run.error ?? "");
    if (raced) {
      run = { ...run, status: "no_service", error: null };
      events = events.filter((e) => !(e.kind === "error" && /exited with code 0/.test(e.text)));
    }
    // Stopped by the pass once it was set up for use: the outcome stands.
    if (run.status === "killed" && run.usage && events.some((e) => e.data?.phase === "usable")) run = { ...run, status: "usable" };
    const record = describe(base, run, events);
    record.modelCalls = await modelCallsOf(sb, runId);
    const seen = live[runId];
    if (run.status === "running" && run.previewUrl) {
      record.http = await probe(run.previewUrl);
      if (a.screenshots) record.screenshot = await screenshot_(run.previewUrl, `${RESULTS}/${a.pass}/${m.owner}-${m.name}.png`);
    } else if (seen && (run.status === "killed" || (run.status === "failed" && /no longer running|sandbox timeout|application stopped/i.test(run.error ?? "")))) {
      // It was up; the sandbox's lifetime ended, or the pass stopped it,
      // before this collect.
      Object.assign(record, { status: "expired", liveAt: seen.at, http: seen.http, screenshot: seen.screenshot, previewUrl: seen.previewUrl });
    }
    if (seen) record.liveAt ??= seen.at;
    records.push(record);
    console.log(`  ${(record.status ?? "-").padEnd(9)} ${m.kind.padEnd(26)} ${m.owner}/${m.name}${record.http ? ` → ${record.http.status}` : ""}`);
  }
  writeJson(resultsFile(a.pass), records);
  const counts: Record<string, number> = {};
  for (const r of records) counts[r.status ?? "not run"] = (counts[r.status ?? "not run"] ?? 0) + 1;
  const arms = [...new Set(records.map((r) => r.variant).filter(Boolean))];
  console.log(`${records.length} records → ${resultsFile(a.pass)}  (${Object.entries(counts).map(([s, n]) => `${s} ${n}`).join(", ")})${arms.length ? ` · variant ${arms.join(", ")}` : ""}`);
}

function describe(base: BenchRecord, run: SandboxRun, events: SandboxEvent[]): BenchRecord {
  const steps = runSteps(run, events);
  // A run that is over stopped when its row says it did; an open step is
  // measured to then, not to whenever the records are collected.
  const now = run.finishedAt ? Date.parse(run.finishedAt) : Date.now();
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
  const failures = failuresOf(events);
  return {
    ...base,
    status: run.status, template: run.template, commit: run.commit, startedAt: run.startedAt,
    // The column holds free text, because the wrapper reads anything it does
    // not know as the ladder. The record keeps only the two names that are an
    // arm; anything else reads as unnamed, which is how the run was treated.
    variant: RUN_VARIANTS.find((v) => v === run.variant) ?? null,
    headStart: run.headStart,
    install: installOf(events),
    ...verifiedOf(events),
    totalMs: runDuration(steps, now),
    steps: steps.map((s: RunStep) => ({ id: s.id, state: s.state, summary: s.summary, ms: stepDuration(s, now) })),
    docker: run.template.endsWith("-docker"),
    localSupabase: supaStatus === "ready" ? "ready" : supaStatus === "skipped" ? "skipped" : supa ? "unavailable" : "none",
    local: vars.filter((v) => v.status === "local").map((v) => v.name),
    missing: ((env?.data?.skipped as string[] | undefined) ?? []),
    trail: trail ? (String(trail.data?.status) as BenchRecord["trail"]) : replaying ? "own" : events.some((e) => e.data?.phase === "plan") ? "none" : "unknown",
    replayHeld: replaying ? !replayFailed : null,
    capture: captureOf(events),
    repairAttempts: find((e) => e.data?.phase === "patch" && e.data?.status === "starting").length,
    patch: lastPatch ? { files: (lastPatch.data?.files as string[]) ?? [], summary: String(lastPatch.data?.summary ?? "") } : null,
    previewUrl: run.previewUrl, error: run.error, next: run.usage?.next?.slice(0, 3000) ?? null,
    // The worker records a pipeline stage as a command event carrying the stage name.
    stages: find((e) => e.kind === "command" && typeof e.data?.stage === "string").map((e) => `${e.data?.stage}: ${e.text.slice(0, 160)}`).slice(0, 40),
    failures, output: outputOf(events, failures),
    path: run.escalation?.path ?? (patches.some((e) => e.data?.status === "applied") ? "repaired" : events.some((e) => e.data?.phase === "setup") ? "setup" : events.some((e) => e.data?.phase === "plan" || e.data?.phase === "ready") ? "direct" : null),
    cost: run.escalation?.cost?.total ?? null,
    brief: run.brief ? { purpose: run.brief.purpose, primaryApp: run.brief.primaryApp?.path ?? "", confidence: run.brief.primaryApp?.confidence ?? "", nothingToServe: !!run.brief.nothingToServe?.value } : null,
    resolver: run.escalation?.resolver ? { status: run.escalation.resolver.status, hint: run.escalation.resolver.hint ?? null } : null,
    blocker: run.usage?.blocker ?? run.escalation?.blocker ?? null,
  };
}

// What this run's model capture amounted to, as one word.
//
// Each realm reports for itself — the wrapper when it arms the preload, and
// again for a service it cannot reach — so the run's state is the least
// capable report, not the last one to arrive. That is the rule captureState
// reads a trace by (lib/trace/timeline.ts); this reads the run's own event
// log, where the wrapper's report arrives as a status event carrying the
// whole emitted object (phase "capability", capability "modelCapture").
// A run nothing reported on is "unreported", which is not the same as
// working and seeing nothing, and must not be read as it.
// What the head start cost and what it saved. The install phase is said
// several times in a run — adopted when the wrapper starts, then again
// when the pipeline joins it — and the last one is the one that knows how
// it ended and how long anything waited on it. hc's own second install is
// not here: it is the gap between the run event that says "installing" and
// the next status, which the steps already carry.
// Whether the page was opened and read. Off the visit event, which is
// the one thing all three paths have in common — the native path ends at
// `ready`, the setup rung and the recovery session at `start: answering`,
// and all three open the page the same way in between. No visit event
// means no check was recorded, which is null rather than false.
function verifiedOf(events: SandboxEvent[]): { verified: boolean | null; unverified: string | null } {
  const looks = events.filter((e) => e.data?.phase === "visit" && typeof e.data?.verified === "boolean");
  const last = looks[looks.length - 1];
  if (!last) return { verified: null, unverified: null };
  const ok = last.data?.verified === true;
  return { verified: ok, unverified: ok ? null : String(last.data?.unverified ?? "the page was not opened") };
}

function installOf(events: SandboxEvent[]): BenchRecord["install"] {
  const said = events.filter((e) => e.data?.phase === "install");
  const end = said[said.length - 1];
  if (!end) return null;
  const number = (v: unknown) => (typeof v === "number" ? v : null);
  return {
    status: String(end.data?.status ?? "unknown"),
    command: String(end.data?.command ?? ""),
    seconds: number(end.data?.seconds),
    waited: number(said.map((e) => e.data?.waited).find((w) => typeof w === "number")),
  };
}

const CAPTURE_SEVERITY: Record<string, number> = { available: 1, active: 2, partial: 3, unsupported_runtime: 4, unsupported_launcher: 4, instrumentation_failed: 4, unavailable: 4 };

function captureOf(events: SandboxEvent[]): string {
  const reports = events.filter((e) => e.data?.phase === "capability" && e.data?.capability === "modelCapture");
  if (!reports.length) return "unreported";
  const rank = (e: SandboxEvent) => CAPTURE_SEVERITY[String(e.data?.state ?? "")] ?? 2;
  // Events come back in seq order, so ≥ keeps the last of an equal rank,
  // the same tie-break the trace uses.
  let worst = reports[0];
  for (const e of reports) if (rank(e) >= rank(worst)) worst = e;
  return String(worst.data?.state ?? "unknown");
}

// How many model calls were caught. A count rather than the rows: one call's
// bodies can be megabytes, and the pass wants a number. Null when the table
// will not answer, which is not zero.
async function modelCallsOf(sb: SupabaseClient, runId: string): Promise<number | null> {
  const { count, error } = await sb.from("engelbart_model_calls").select("id", { count: "exact", head: true }).eq("run_id", runId);
  if (error) { console.log(`  could not count model calls for ${runId}: ${error.message}`); return null; }
  return count ?? 0;
}

// Every point where something went wrong, oldest first, so a reader can
// see the first cause and what followed from it.
function failuresOf(events: SandboxEvent[]): BenchFailure[] {
  const out: BenchFailure[] = [];
  const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
  const rest = (d: Record<string, unknown>, drop: string[]) => Object.fromEntries(Object.entries(d).filter(([k, v]) => !drop.includes(k) && v !== undefined && v !== null && v !== ""));
  for (const e of events) {
    const d = e.data ?? {};
    const phase = str(d.phase);
    if (e.kind === "error" && !phase) out.push({ step: "worker", source: "worker", reason: e.text.slice(0, 600), stage: null, detail: rest(d, []) });
    else if (phase === "error") out.push({ step: str(d.step) || "pipeline", source: "pipeline", reason: str(d.message).slice(0, 600), stage: str(d.stage) || null, detail: rest(d, ["phase", "step", "message", "stage"]) });
    else if (phase === "run" && ["unhealthy", "needs_input", "failed"].includes(str(d.status))) out.push({ step: "health", source: "app", reason: `${str(d.status)}: ${str(d.reason).slice(0, 600)}`, stage: str(d.stage) || null, detail: rest(d, ["phase", "status", "reason", "stage"]) });
    else if (phase === "patch" && d.status === "failed") out.push({ step: "health", source: "repair", reason: str(d.reason).slice(0, 600), stage: null, detail: rest(d, ["phase", "status", "reason"]) });
    else if (phase === "recipe" && (d.status === "failed" || d.status === "ignored")) out.push({ step: "trail", source: "pipeline", reason: `replay ${str(d.status)}: ${str(d.reason).slice(0, 600)}`, stage: null, detail: {} });
    else if (phase === "exited") out.push({ step: "live", source: "app", reason: `exited: ${str(d.reason).slice(0, 600)}`, stage: null, detail: rest(d, ["phase", "reason"]) });
  }
  return out.slice(-12);
}

// The output of the stage the last failure names, or failing that the
// last lines the pipeline logged, so the grader sees the actual error.
function outputOf(events: SandboxEvent[], failures: BenchFailure[]): string {
  const stage = [...failures].reverse().find((f) => f.stage)?.stage ?? null;
  const isLog = (e: SandboxEvent) => (e.kind === "stdout" || e.kind === "stderr") && typeof e.data?.stage === "string";
  const logs = events.filter((e) => isLog(e) && (!stage || e.data?.stage === stage));
  const text = (stage && logs.length ? logs : events.filter(isLog)).map((e) => e.text).join("");
  const lines = text.split("\n").filter((l) => l.trim());
  return lines.slice(-60).join("\n").slice(-6000);
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

async function screenshot_(url: string, path: string): Promise<string | null> {
  if (!existsSync(CHROME)) return null;
  try {
    await exec(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=1280,800", "--virtual-time-budget=8000", `--screenshot=${path}`, url], { timeout: 45_000 });
    return path.replace(`${RESULTS}/`, "");
  } catch (err) {
    console.log(`  screenshot failed for ${url}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// Stop one run the way the Stop button does. The row goes to "killed" first,
// which the recorder keeps whatever the worker writes once the sandbox is gone.
async function stopRun(sb: SupabaseClient, runId: string, sandboxId: string | null, why: string) {
  const record = createRecorder(sb, runId);
  await record.status("killed");
  if (sandboxId) {
    const { Sandbox } = await import("e2b");
    try { await Sandbox.kill(sandboxId); record.event("status", `sandbox killed by the benchmark: ${why}`); }
    catch (err) { record.event("error", `kill failed: ${err instanceof Error ? err.message : String(err)}`); }
  }
  await record.flush();
}

// --- stop: kill the sandboxes still running for this pass.
async function stop(sb: SupabaseClient, a: Args) {
  const queued = readJson<Record<string, string>>(queueFile(a.pass), {});
  const ids = Object.values(queued);
  if (!ids.length) return;
  const { data, error } = await sb.from("engelbart_sandbox_runs").select(RUN_COLUMNS).in("id", ids).not("status", "in", "(failed,killed,no_service)");
  if (error) throw error;
  for (const row of (data ?? []) as RunRow[]) {
    const run = toRun(row);
    await stopRun(sb, run.id, run.sandboxId, "the pass is over");
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
