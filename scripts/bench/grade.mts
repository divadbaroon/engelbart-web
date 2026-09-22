// Grades a pass's records against the sheet's rubric with Claude, and
// writes the label, the cause of any failure and what went wrong back
// into the results file. A person reviews labels rather than logs; the
// reason says what to look at, and the cause says whose problem it is:
// the sandbox, the repository's code, the agent, or our settings.
//
//   npm run bench:grade -- --pass p1 [--force] [--model claude-sonnet-5] [--via api|cli]
//
// --via api (the default) calls the Messages API and needs ANTHROPIC_API_KEY.
// --via cli asks the signed-in Claude Code CLI on this machine instead, with
// no tools, so a pass can be graded when the API key has no credit.
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";
import type { BenchCause, BenchRecord } from "./run.mts";

const ROOT = new URL("../../", import.meta.url).pathname;
const a = process.argv.slice(2);
const get = (flag: string) => { const i = a.indexOf(flag); return i >= 0 ? a[i + 1] : undefined; };
const pass = get("--pass") ?? "p1";
const model = get("--model") ?? "claude-sonnet-5";
const force = a.includes("--force");
const via = get("--via") ?? "api";
const file = `${ROOT}bench/results/${pass}.json`;
const apiKey = process.env.ANTHROPIC_API_KEY;
if (via === "api" && !apiKey) { console.error("ANTHROPIC_API_KEY is needed (or pass --via cli)"); process.exit(2); }
const exec = promisify(execFile);

const SYSTEM = `You grade one attempt by an automated pipeline to take a GitHub repository from its URL to a live web preview in a sandbox, with no human help.

You are given the kind of evaluation the benchmark's author expects for this repository, the author's known constraints, and the record of the attempt: outcome, the steps with what each found and how long it took, what a local Supabase did, which environment values were missing, what the repair agent changed, and the HTTP response of the preview if any.

Grade rules:
- kind web_preview: pass = the run reached running and the preview answered with a page of the application. partial = it runs but a documented credential or service the author lists as expected is missing, or the page is an error page for that reason, or the wrong component was started (see the constraints). fail = anything else.
- kind system (a CHI systems paper; the constraints say what the artifact is): pass = the artifact the paper describes is running: a web preview for an interface, app, study interface, extension or chatbot, or outcome usable for a framework, library or agent toolkit with the next field pointing at the paper's use. partial = it is up but needs a credential or model API key the paper's system depends on, or the wrong part was started, or a framework was merely concluded. fail = anything else, including a web interface that ended as usable or no_service when it should have been served.
- other kinds (library_or_cli, notebook_or_visualization, simulation, dataset, dataset_or_pipeline): a live web preview is not expected. pass = the pipeline concluded cleanly that there is no web service to run, in reasonable time, without repair attempts that fight the repository. partial = it got somewhere useful but slowly, or with a repair attempt, or produced a preview that is not what the author says matters. fail = it errored confusingly, timed out, or spent repair attempts forcing a server that should not exist.
- outcome usable means the pipeline concluded there is nothing to serve, then installed the repository the way its documentation says, ran a check that proves it works, and left it in a live sandbox with what to run next (the next field). For a non-web kind that is the pass condition; judge whether next is really the paper's analysis, experiment or example and not just an import. For web_preview it is a fail unless the constraints agree.
- outcome no_service means the pipeline concluded there is nothing to serve but could not set the repository up for use (its check failed); for a non-web kind that is partial at best.
- outcome expired means the application was live and answered (see preview and liveAt); the pass then stopped it, or the sandbox reached its one-hour lifetime. Grade it as live.
- A usable outcome with a blocker (see blocker) means the repository has an application that could not be started here for a reason outside the sandbox: kind secret (an API key), service (a database or external server), hardware, or data. The repository was installed and checked, and next opens with what the person must supply. For kind system that is a pass when the blocker is genuinely required by the paper's system and named exactly; cause none. A blocker of kind upstream means the code is broken as published: fail, cause repository. A blocker that a careful person could have removed without secrets (an example file that exists, a documented install step) is a fail, cause agent.
- path says how the run got there: direct, repaired (the repair agent edited the copy), resolved (the resolver corrected the plan or confirmed the blocker), setup (the setup agent installed it). cost is what its agent calls spent in dollars. Neither changes the grade; mention an unusual cost in wentWrong.
- Judge only the record. Do not assume things the record does not show.

Then say where the first real failure came from. Read the failures in order and the output of the failing stage; the first failure is usually the cause and the later ones follow from it. Pick exactly one:
- sandbox: the machine or its image. Sandbox creation or connection failed, the sandbox was lost or killed, disk or memory ran out, a network fetch failed, a tool the image should carry was missing.
- repository: the code as published. It does not build or start as its own instructions say, needs a credential, account, dataset or external service the author lists as required, has no web service to run, or its crash is in its own code.
- agent: a decision by the planner or the repair agent. It chose the wrong directory, service or command, asked for the wrong things, edited the wrong files, fought the repository, or gave up when the output showed an ordinary fix.
- settings: a limit or rule of ours. A command refused by the setup allowlist, a path rule, an evidence or prompt budget, a timeout we set, the health check or preview proxy, an environment value we withheld.
- none: nothing went wrong, or the only failure is a clean conclusion that there is no web service.

Answer with JSON only:
{"label": "pass" | "partial" | "fail",
 "cause": "sandbox" | "repository" | "agent" | "settings" | "none",
 "wentWrong": "<two to four sentences: what happened, in order, quoting the decisive line of output or reason, and what would have to change for it to work>",
 "reason": "<one sentence a person can act on>"}`;

function view(r: BenchRecord) {
  return {
    repository: `${r.owner}/${r.name}`, kind: r.kind, constraints: r.constraints,
    outcome: r.status, liveAt: r.liveAt, next: r.next, error: r.error, totalSeconds: r.totalMs ? Math.round(r.totalMs / 1000) : null,
    runner: r.docker ? "docker" : "standard", localSupabase: r.localSupabase, trail: r.trail, replayHeld: r.replayHeld,
    missingValues: r.missing, localValues: r.local.length,
    repairAttempts: r.repairAttempts, patch: r.patch ? { files: r.patch.files, summary: r.patch.summary } : null,
    path: r.path, costUsd: r.cost, brief: r.brief, resolver: r.resolver, blocker: r.blocker,
    steps: r.steps.map((s) => ({ step: s.id, state: s.state, seconds: s.ms ? Math.round(s.ms / 1000) : null, summary: s.summary })),
    preview: r.http ? { status: r.http.status, title: r.http.title } : null,
    commandsRun: r.stages, failures: r.failures, outputOfFailingStage: r.output,
  };
}

async function ask(input: string): Promise<string> {
  if (via === "cli") {
    // The CLI on this machine, signed in as the person, with no tools and
    // the API key withheld so it cannot fall back to the empty account.
    const env = { ...process.env }; delete env.ANTHROPIC_API_KEY;
    const { stdout } = await exec("claude", ["-p", "--output-format", "json", "--model", model, "--system-prompt", SYSTEM, "--tools", "", "--max-turns", "1", input], { env, maxBuffer: 8 << 20, timeout: 180_000 });
    const out = JSON.parse(stdout) as { is_error?: boolean; result?: string };
    if (out.is_error) throw new Error(String(out.result ?? "CLI error"));
    return String(out.result ?? "");
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 8000, system: SYSTEM, messages: [{ role: "user", content: input }] }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const body = (await res.json()) as { content: { type: string; text?: string }[] };
  return body.content.map((c) => c.text ?? "").join("");
}

async function grade(r: BenchRecord): Promise<NonNullable<BenchRecord["grade"]>> {
  const text = await ask(JSON.stringify(view(r)));
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error(`no JSON in: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(json) as { label: string; cause: string; reason: string; wentWrong: string };
  const label = (["pass", "partial", "fail"] as const).find((l) => l === parsed.label) ?? "fail";
  const cause = (["sandbox", "repository", "agent", "settings", "none"] as const).find((c) => c === parsed.cause) ?? (label === "pass" ? "none" : "agent");
  return { label, cause, reason: String(parsed.reason ?? "").slice(0, 600), wentWrong: String(parsed.wentWrong ?? "").slice(0, 1500), model, at: new Date().toISOString() };
}

async function main() {
  const records = JSON.parse(readFileSync(file, "utf8")) as BenchRecord[];
  const todo = records.filter((r) => r.runId && (force || !r.grade));
  console.log(`${todo.length} of ${records.length} to grade with ${model} via ${via}`);
  let i = 0;
  const workers = Array.from({ length: 4 }, async () => {
    while (i < todo.length) {
      const r = todo[i++];
      try { const g = await grade(r); r.grade = g; console.log(`  ${g.label.padEnd(7)} ${g.cause.padEnd(10)} ${r.owner}/${r.name}: ${g.reason}`); }
      catch (err) { console.log(`  could not grade ${r.owner}/${r.name}: ${err instanceof Error ? err.message : String(err)}`); }
    }
  });
  await Promise.all(workers);
  writeFileSync(file, JSON.stringify(records, null, 2) + "\n");
  const counts: Record<string, number> = {};
  const causes: Partial<Record<BenchCause, number>> = {};
  for (const r of records) { const l = r.grade?.label ?? "ungraded"; counts[l] = (counts[l] ?? 0) + 1; if (r.grade) causes[r.grade.cause] = (causes[r.grade.cause] ?? 0) + 1; }
  console.log(Object.entries(counts).map(([l, n]) => `${l} ${n}`).join(" · "));
  console.log("causes: " + Object.entries(causes).map(([c, n]) => `${c} ${n}`).join(" · "));
}

main().catch((err) => { console.error(err); process.exit(1); });
