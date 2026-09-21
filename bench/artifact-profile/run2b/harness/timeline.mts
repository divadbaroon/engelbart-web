// The Activity timeline, as a researcher would actually see it, plus the
// segmentation behind it. Nothing here tunes anything: it reports.
import { writeFileSync } from "node:fs";
import { DIR, SESSIONS, load, read, compiled, clock } from "./lib.mts";
import type { Episode } from "@/lib/activity/types";

const { profile, compiled: gen } = compiled(process.argv[2] ?? `${DIR}/experiment/run2/profile.json`);
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.abs(s) % 60).padStart(2, "0")}`;
const dur = (ms: number) => (ms < 1000 ? `${ms}ms` : ms < 60000 ? `${(ms / 1000).toFixed(0)}s` : `${Math.floor(ms / 60000)}m${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")}s`);

const out: string[] = ["# The timeline a researcher would see — Run 2\n"];
const segOut: string[] = ["# Segmentation, unturned — Run 2\n",
  "The segmenter is the generic one. The only thing the taxonomy contributes to it",
  "is `isMoment`, built from the `moment` flag on the profile's controls. Nothing",
  "below was adjusted for this artifact.\n"];

for (const { id, role } of SESSIONS) {
  const s = load(id);
  const eps: Episode[] = read(s, gen);
  const t0 = Date.parse(s.events[0].at);
  const span = (Date.parse(s.events.at(-1)!.at) - t0) / 1000;

  out.push(`## ${id} — ${role}\n`);
  out.push(`${s.events.length} events over ${mmss(Math.round(span))}, read as ${eps.length} episodes.\n`);
  out.push("| at | for | what the person was doing | class / sub | conf | why |");
  out.push("|---|---|---|---|---|---|");
  for (const e of eps) {
    out.push(`| ${mmss(clock(e, t0))} | ${dur(e.durationMs)} | ${e.description.replace(/\|/g, "\\|")} | ${e.broadBehavior}/${e.subBehavior} | ${e.confidence} | ${(e.because ?? "").replace(/\|/g, "\\|")} |`);
  }
  out.push("");

  // ---- segmentation facts
  segOut.push(`## ${id} — ${role}\n`);
  segOut.push(`- ${s.events.length} events, ${s.stages.length} moments, ${eps.length} episodes over ${mmss(Math.round(span))}`);
  const lens = eps.map((e) => e.durationMs).sort((a, b) => a - b);
  const med = lens[Math.floor(lens.length / 2)] ?? 0;
  segOut.push(`- episode length: shortest ${dur(lens[0] ?? 0)}, median ${dur(med)}, longest ${dur(lens.at(-1) ?? 0)}`);
  const longest = eps.reduce((a, b) => (b.durationMs > a.durationMs ? b : a), eps[0]);
  if (longest) segOut.push(`- longest episode covers ${Math.round((100 * longest.durationMs) / (span * 1000))}% of the session: "${longest.description}" (${longest.broadBehavior}/${longest.subBehavior}, ${longest.events.length} events)`);
  const sub = eps.filter((e) => e.durationMs < 1000);
  segOut.push(`- sub-second episodes: ${sub.length}${sub.length ? ` — ${sub.map((e) => `${mmss(clock(e, t0))} ${e.subBehavior}`).join(", ")}` : ""}`);
  const unobserved = eps.filter((e) => !e.evidence.observed);
  segOut.push(`- episodes with nothing recorded in them: ${unobserved.length}${unobserved.length ? ` — ${unobserved.map((e) => `${mmss(clock(e, t0))} for ${dur(e.durationMs)}`).join(", ")}` : ""}`);
  const byModel = eps.filter((e) => e.determined === "model").length;
  segOut.push(`- named by a rule: ${eps.length - byModel}; left to whatever else: ${byModel}`);
  const clicks = eps.flatMap((e) => e.evidence.controls);
  segOut.push(`- controls recognised across the session: ${[...new Set(clicks)].join(", ") || "(none)"}`);
  // Does a run of clicks on the same control become one episode or many?
  const runs: { control: string; n: number }[] = [];
  for (const e of eps) {
    const c = e.evidence.controls.join("+") || "(none)";
    const last = runs.at(-1);
    if (last && last.control === c) last.n += 1; else runs.push({ control: c, n: 1 });
  }
  const repeated = runs.filter((r) => r.n > 1);
  segOut.push(`- consecutive episodes carrying the same controls: ${repeated.length ? repeated.map((r) => `${r.n}× ${r.control}`).join(", ") : "none — no two neighbours share a control set"}`);
  segOut.push("");
}

out.push("## What the timeline does not say\n");
out.push("Every claim above is made from the events listed in `evidence`. No episode can");
out.push("speak about anything the collector does not record — see");
out.push("`pack/evidence/00-how-the-recording-works.md`.\n");

writeFileSync(`${DIR}/TIMELINES.md`, out.join("\n") + "\n");
writeFileSync(`${DIR}/SEGMENTATION.md`, segOut.join("\n") + "\n");
console.log(out.join("\n"));
console.log("\n\n" + segOut.join("\n"));
