// Grades a pass's records against the sheet's rubric with Claude, and
// writes the label and reason back into the results file. A person
// reviews labels rather than logs; the reason says what to look at.
//
//   npm run bench:grade -- --pass p1 [--force] [--model claude-sonnet-5]
//
// Needs ANTHROPIC_API_KEY.
import { readFileSync, writeFileSync } from "node:fs";
import type { BenchRecord } from "./run.mts";

const ROOT = new URL("../../", import.meta.url).pathname;
const a = process.argv.slice(2);
const get = (flag: string) => { const i = a.indexOf(flag); return i >= 0 ? a[i + 1] : undefined; };
const pass = get("--pass") ?? "p1";
const model = get("--model") ?? "claude-sonnet-5";
const force = a.includes("--force");
const file = `${ROOT}bench/results/${pass}.json`;
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error("ANTHROPIC_API_KEY is needed"); process.exit(2); }

const SYSTEM = `You grade one attempt by an automated pipeline to take a GitHub repository from its URL to a live web preview in a sandbox, with no human help.

You are given the kind of evaluation the benchmark's author expects for this repository, the author's known constraints, and the record of the attempt: outcome, the steps with what each found and how long it took, what a local Supabase did, which environment values were missing, what the repair agent changed, and the HTTP response of the preview if any.

Rules:
- kind web_preview: pass = the run reached running and the preview answered with a page of the application. partial = it runs but a documented credential or service the author lists as expected is missing, or the page is an error page for that reason, or the wrong component was started (see the constraints). fail = anything else.
- other kinds (library_or_cli, notebook_or_visualization, simulation, dataset, dataset_or_pipeline): a live web preview is not expected. pass = the pipeline concluded cleanly that there is no web service to run, in reasonable time, without repair attempts that fight the repository. partial = it got somewhere useful but slowly, or with a repair attempt, or produced a preview that is not what the author says matters. fail = it errored confusingly, timed out, or spent repair attempts forcing a server that should not exist.
- Judge only the record. Do not assume things the record does not show.

Answer with JSON only: {"label": "pass" | "partial" | "fail", "reason": "<one or two sentences a person can act on>"}`;

function view(r: BenchRecord) {
  return {
    repository: `${r.owner}/${r.name}`, kind: r.kind, constraints: r.constraints,
    outcome: r.status, error: r.error, totalSeconds: r.totalMs ? Math.round(r.totalMs / 1000) : null,
    runner: r.docker ? "docker" : "standard", localSupabase: r.localSupabase, trail: r.trail, replayHeld: r.replayHeld,
    missingValues: r.missing, localValues: r.local.length,
    repairAttempts: r.repairAttempts, patch: r.patch ? { files: r.patch.files, summary: r.patch.summary } : null,
    steps: r.steps.map((s) => ({ step: s.id, state: s.state, seconds: s.ms ? Math.round(s.ms / 1000) : null, summary: s.summary })),
    preview: r.http ? { status: r.http.status, title: r.http.title } : null,
  };
}

async function grade(r: BenchRecord): Promise<NonNullable<BenchRecord["grade"]>> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 400, system: SYSTEM, messages: [{ role: "user", content: JSON.stringify(view(r)) }] }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const body = (await res.json()) as { content: { type: string; text?: string }[] };
  const text = body.content.map((c) => c.text ?? "").join("");
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error(`no JSON in: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(json) as { label: string; reason: string };
  const label = (["pass", "partial", "fail"] as const).find((l) => l === parsed.label) ?? "fail";
  return { label, reason: String(parsed.reason ?? "").slice(0, 600), model, at: new Date().toISOString() };
}

async function main() {
  const records = JSON.parse(readFileSync(file, "utf8")) as BenchRecord[];
  const todo = records.filter((r) => r.runId && (force || !r.grade));
  console.log(`${todo.length} of ${records.length} to grade with ${model}`);
  let i = 0;
  const workers = Array.from({ length: 4 }, async () => {
    while (i < todo.length) {
      const r = todo[i++];
      try { const g = await grade(r); r.grade = g; console.log(`  ${g.label.padEnd(7)} ${r.owner}/${r.name}: ${g.reason}`); }
      catch (err) { console.log(`  could not grade ${r.owner}/${r.name}: ${err instanceof Error ? err.message : String(err)}`); }
    }
  });
  await Promise.all(workers);
  writeFileSync(file, JSON.stringify(records, null, 2) + "\n");
  const counts: Record<string, number> = {};
  for (const r of records) { const l = r.grade?.label ?? "ungraded"; counts[l] = (counts[l] ?? 0) + 1; }
  console.log(Object.entries(counts).map(([l, n]) => `${l} ${n}`).join(" · "));
}

main().catch((err) => { console.error(err); process.exit(1); });
