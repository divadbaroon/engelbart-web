// One page per pass: every repository with its outcome, grade, timing
// and what the pipeline did, sortable, with the preview screenshots.
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
const records = load(pass);
const other = compare ? new Map(load(compare).map((r) => [r.repoId, r])) : null;

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const secs = (ms: number | null) => (ms === null ? "" : ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`);
const KINDS = ["web_preview", "library_or_cli", "notebook_or_visualization", "simulation", "dataset_or_pipeline", "dataset", "unknown"];
const LABELS = ["pass", "partial", "fail", "ungraded"];
const label = (r: BenchRecord) => r.grade?.label ?? "ungraded";

const summary = KINDS.filter((k) => records.some((r) => r.kind === k)).map((k) => {
  const rows = records.filter((r) => r.kind === k);
  const counts = LABELS.map((l) => rows.filter((r) => label(r) === l).length);
  return `<tr><td>${k}</td><td>${rows.length}</td>${counts.map((n) => `<td>${n || ""}</td>`).join("")}<td>${rows.filter((r) => r.status === "running").length}</td></tr>`;
}).join("");

const stepCell = (r: BenchRecord) => `<span class="steps">${r.steps.map((s) => `<i class="${s.state}" title="${esc(`${s.id}: ${s.summary}`)}"></i>`).join("")}</span>`;

const rows = records.map((r) => {
  const o = other?.get(r.repoId);
  return `<tr>
  <td><a href="${esc(r.url)}">${esc(`${r.owner}/${r.name}`)}</a>${workspace ? ` <a class="dim" href="/workspace/${workspace}">workspace</a>` : ""}</td>
  <td>${esc(r.kind)}</td>
  <td class="${label(r)}">${label(r)}</td>
  <td>${esc(r.status ?? "not run")}</td>
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
  #summary td, #summary th { padding: 4px 10px; }
</style></head><body>
<h1>Engelbart benchmark · pass ${esc(pass)}${compare ? ` (times compared with ${esc(compare)})` : ""}</h1>
<p class="dim">${records.length} repositories · generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC</p>
<table id="summary"><thead><tr><th>Expected</th><th>Repos</th>${LABELS.map((l) => `<th>${l}</th>`).join("")}<th>Running</th></tr></thead><tbody>${summary}</tbody></table>
<h2>Every repository</h2>
<table id="rows"><thead><tr>
<th>Repository</th><th>Expected</th><th>Grade</th><th>Outcome</th><th>Time</th><th>Steps</th><th>Trail</th><th>Runner</th><th>Missing values</th><th>Repair</th><th>Preview</th><th>Screenshot</th><th>Reason</th>
</tr></thead><tbody>${rows}</tbody></table>
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
