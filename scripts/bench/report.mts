// One page per pass: every repository with its outcome, grade, cause,
// timing and what the pipeline did, sortable, with the preview
// screenshots; then one report per repository saying what went wrong.
//
//   npm run bench:report -- --pass p1 [--compare p2] [--workspace <projectId>]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { BenchRecord } from "./run.mts";

const ROOT = new URL("../../", import.meta.url).pathname;
const a = process.argv.slice(2);
const get = (flag: string) => { const i = a.indexOf(flag); return i >= 0 ? a[i + 1] : undefined; };
const pass = get("--pass") ?? "p1";
const compare = get("--compare");
const workspace = get("--workspace");
const load = (p: string): BenchRecord[] => { const f = `${ROOT}bench/results/${p}.json`; return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as BenchRecord[]) : []; };
// Records from a pass collected before the failure fields existed still render.
const records = load(pass).map((r) => ({ ...r, stages: r.stages ?? [], failures: r.failures ?? [], output: r.output ?? "", liveAt: r.liveAt ?? null, next: r.next ?? null }));
const other = compare ? new Map(load(compare).map((r) => [r.repoId, r])) : null;

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const secs = (ms: number | null) => (ms === null ? "" : ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`);
const KINDS = ["web_preview", "system", "library_or_cli", "notebook_or_visualization", "simulation", "dataset_or_pipeline", "dataset", "unknown"];
const LABELS = ["pass", "partial", "fail", "ungraded"];
const CAUSES = ["sandbox", "repository", "agent", "settings", "none"] as const;
const label = (r: BenchRecord) => r.grade?.label ?? "ungraded";
const cause = (r: BenchRecord) => r.grade?.cause ?? "";

const summary = KINDS.filter((k) => records.some((r) => r.kind === k)).map((k) => {
  const rows = records.filter((r) => r.kind === k);
  const counts = LABELS.map((l) => rows.filter((r) => label(r) === l).length);
  return `<tr><td>${k}</td><td>${rows.length}</td>${counts.map((n) => `<td>${n || ""}</td>`).join("")}<td>${rows.filter((r) => r.status === "running").length}</td></tr>`;
}).join("");

const causeRows = CAUSES.filter((c) => records.some((r) => cause(r) === c)).map((c) => {
  const rows = records.filter((r) => cause(r) === c);
  return `<tr><td class="cause-${c}">${c}</td><td>${rows.length}</td><td>${rows.map((r) => `<a href="#${esc(`${r.owner}-${r.name}`)}">${esc(r.name)}</a>`).join(", ")}</td></tr>`;
}).join("");

const reports = records.map((r) => `<section class="report" id="${esc(`${r.owner}-${r.name}`)}">
  <h3><a href="${esc(r.url)}">${esc(`${r.owner}/${r.name}`)}</a> <span class="${label(r)}">${label(r)}</span> ${r.grade ? `<span class="badge cause-${esc(cause(r))}">${esc(cause(r))}</span>` : ""} <span class="dim">${esc(r.kind)} · ${esc(r.status ?? "not run")} · ${secs(r.totalMs)}</span></h3>
  ${r.grade ? `<p><b>What went wrong.</b> ${esc(r.grade.wentWrong || r.grade.reason)}</p><p class="dim">${esc(r.grade.reason)}</p>` : `<p class="dim">Not graded.</p>`}
  ${r.constraints ? `<p class="dim"><b>Author's constraints.</b> ${esc(r.constraints)}</p>` : ""}
  ${r.brief ? `<p><b>Brief.</b> ${esc(r.brief.purpose)} <span class="dim">· runs ${esc(r.brief.primaryApp || ".")} (${esc(r.brief.confidence)} confidence)${r.brief.nothingToServe ? " · nothing to serve" : ""}</span></p>` : ""}
  ${r.resolver ? `<p><b>Resolver.</b> ${esc(r.resolver.status)}${r.resolver.hint ? `: ${esc(r.resolver.hint)}` : ""}</p>` : ""}
  ${r.blocker ? `<p><b>Blocker (${esc(r.blocker.kind)}).</b> ${esc(r.blocker.what)}</p>` : ""}
  ${r.path || r.cost != null ? `<p class="dim">${esc(r.path ?? "")}${r.cost != null ? ` · $${r.cost.toFixed(2)} in agent calls` : ""}</p>` : ""}
  ${r.next ? `<details><summary>What to run next (from the sandbox)</summary><pre>${esc(r.next)}</pre></details>` : ""}
  <ul class="steps-list">${r.steps.map((s) => `<li><i class="${s.state}"></i> <b>${esc(s.id)}</b> ${esc(s.summary)}${s.ms ? ` <span class="dim">${secs(s.ms)}</span>` : ""}</li>`).join("")}</ul>
  ${r.failures.length ? `<details><summary>${r.failures.length} failure event${r.failures.length === 1 ? "" : "s"}</summary><ol>${r.failures.map((f) => `<li><b>${esc(f.source)}</b> at ${esc(f.step)}${f.stage ? ` (${esc(f.stage)})` : ""}: ${esc(f.reason)}</li>`).join("")}</ol></details>` : ""}
  ${r.stages.length ? `<details><summary>${r.stages.length} command${r.stages.length === 1 ? "" : "s"} run</summary><pre>${esc(r.stages.join("\n"))}</pre></details>` : ""}
  ${r.output ? `<details><summary>Output of the failing stage</summary><pre>${esc(r.output)}</pre></details>` : ""}
  ${r.screenshot ? `<a href="${esc(r.screenshot)}"><img class="shot" src="${esc(r.screenshot)}" loading="lazy"></a>` : ""}
</section>`).join("");

const stepCell = (r: BenchRecord) => `<span class="steps">${r.steps.map((s) => `<i class="${s.state}" title="${esc(`${s.id}: ${s.summary}`)}"></i>`).join("")}</span>`;

const rows = records.map((r) => {
  const o = other?.get(r.repoId);
  return `<tr>
  <td><a href="${esc(r.url)}">${esc(`${r.owner}/${r.name}`)}</a>${workspace ? ` <a class="dim" href="/workspace/${workspace}">workspace</a>` : ""}</td>
  <td>${esc(r.kind)}</td>
  <td class="${label(r)}"><a href="#${esc(`${r.owner}-${r.name}`)}">${label(r)}</a></td>
  <td class="cause-${esc(cause(r))}">${esc(cause(r))}</td>
  <td>${esc(r.status ?? "not run")}${r.blocker ? `<span class="dim"> · blocked (${esc(r.blocker.kind)})</span>` : ""}</td>
  <td>${esc(r.path ?? "")}</td>
  <td data-v="${r.cost ?? 0}">${r.cost != null ? `$${r.cost.toFixed(2)}` : ""}</td>
  <td data-v="${r.totalMs ?? 0}">${secs(r.totalMs)}${o ? `<span class="dim"> → ${secs(o.totalMs)}</span>` : ""}</td>
  <td>${stepCell(r)}</td>
  <td>${esc(r.trail)}${r.replayHeld === false ? " (did not hold)" : ""}</td>
  <td>${r.docker ? "docker" : ""} ${r.localSupabase !== "none" ? esc(r.localSupabase) : ""}</td>
  <td data-v="${r.missing.length}">${r.missing.length ? esc(r.missing.join(", ")) : ""}</td>
  <td data-v="${r.patch?.files.length ?? 0}">${r.repairAttempts ? `${r.repairAttempts} attempt${r.repairAttempts === 1 ? "" : "s"}` : ""}${r.patch ? `, ${r.patch.files.length} files` : ""}</td>
  <td>${r.http ? `${r.http.status} ${esc(r.http.title)}` : ""}</td>
  <td>${r.screenshot ? `<a href="${esc(r.screenshot)}"><img src="${esc(r.screenshot)}" loading="lazy"></a>` : ""}</td>
  <td class="reason">${esc(r.grade?.reason ?? r.error ?? "")}</td>
</tr>`;
}).join("");

const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Engelbart benchmark · ${esc(pass)}</title>
<style>
  body { font: 13px/1.5 ui-sans-serif, system-ui, sans-serif; color: #1a1a1a; margin: 24px; }
  h1 { font-size: 18px; font-weight: 600; } h2 { font-size: 14px; font-weight: 600; margin-top: 28px; }
  table { border-collapse: collapse; width: 100%; } th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e5e5e5; vertical-align: top; }
  th { cursor: pointer; font-weight: 600; white-space: nowrap; background: #fafafa; position: sticky; top: 0; }
  td.pass { color: #15803d; } td.partial { color: #b45309; } td.fail { color: #b91c1c; } td.ungraded { color: #737373; }
  .dim { color: #737373; font-size: 12px; } .reason { max-width: 420px; color: #404040; }
  .steps i { display: inline-block; width: 10px; height: 10px; border-radius: 5px; margin-right: 2px; background: #e5e5e5; }
  .steps i.done { background: #404040; } .steps i.warned { background: #f59e0b; } .steps i.failed { background: #ef4444; } .steps i.active { background: #171717; } .steps i.skipped { background: #d4d4d4; }
  img { width: 160px; height: 100px; object-fit: cover; object-position: top; border: 1px solid #e5e5e5; }
  #summary td, #summary th, #causes td, #causes th { padding: 4px 10px; }
  .cause-sandbox { color: #7c3aed; } .cause-repository { color: #0369a1; } .cause-agent { color: #b45309; } .cause-settings { color: #b91c1c; } .cause-none { color: #15803d; }
  .badge { font-size: 11px; padding: 1px 6px; border: 1px solid currentColor; border-radius: 4px; }
  .report { border-top: 1px solid #e5e5e5; padding: 16px 0; } .report h3 { font-size: 14px; margin: 0 0 6px; } .report p { margin: 4px 0; max-width: 900px; }
  .steps-list { list-style: none; padding: 0; margin: 6px 0; } .steps-list li { margin: 2px 0; } .steps-list i { display: inline-block; width: 8px; height: 8px; border-radius: 4px; background: #e5e5e5; margin-right: 4px; }
  .steps-list i.done { background: #404040; } .steps-list i.warned { background: #f59e0b; } .steps-list i.failed { background: #ef4444; } .steps-list i.active { background: #171717; }
  pre { font: 11px/1.4 ui-monospace, monospace; background: #fafafa; padding: 8px; overflow-x: auto; max-height: 360px; white-space: pre-wrap; }
  details { margin: 4px 0; } summary { cursor: pointer; color: #404040; } img.shot { width: 320px; height: 200px; margin-top: 6px; }
</style></head><body>
<h1>Engelbart benchmark · pass ${esc(pass)}${compare ? ` (times compared with ${esc(compare)})` : ""}</h1>
<p class="dim">${records.length} repositories · generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC</p>
<table id="summary"><thead><tr><th>Expected</th><th>Repos</th>${LABELS.map((l) => `<th>${l}</th>`).join("")}<th>Running</th></tr></thead><tbody>${summary}</tbody></table>
<h2>Failures by cause</h2>
<table id="causes"><thead><tr><th>Cause</th><th>Repos</th><th>Which</th></tr></thead><tbody>${causeRows || "<tr><td colspan=3 class=dim>not graded yet</td></tr>"}</tbody></table>
<h2>Every repository</h2>
<table id="rows"><thead><tr>
<th>Repository</th><th>Expected</th><th>Grade</th><th>Cause</th><th>Outcome</th><th>Path</th><th>Cost</th><th>Time</th><th>Steps</th><th>Trail</th><th>Runner</th><th>Missing values</th><th>Repair</th><th>Preview</th><th>Screenshot</th><th>Reason</th>
</tr></thead><tbody>${rows}</tbody></table>
<h2>One report per repository</h2>
${reports}
<script>
  document.querySelectorAll("#rows th").forEach((th, i) => th.addEventListener("click", () => {
    const tb = th.closest("table").tBodies[0]; const asc = th.dataset.asc !== "1"; th.dataset.asc = asc ? "1" : "0";
    const v = (tr) => { const td = tr.children[i]; return td.dataset.v !== undefined ? Number(td.dataset.v) : td.textContent.trim().toLowerCase(); };
    [...tb.rows].sort((x, y) => (v(x) > v(y) ? 1 : v(x) < v(y) ? -1 : 0) * (asc ? 1 : -1)).forEach((tr) => tb.appendChild(tr));
  }));
</script>
</body></html>`;

const out = `${ROOT}bench/results/${pass}.html`;
mkdirSync(`${ROOT}bench/results`, { recursive: true });
writeFileSync(out, html);
console.log(`${records.length} rows → ${out}`);
