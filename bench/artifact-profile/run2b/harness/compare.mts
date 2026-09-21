// Run 2B: the same three driver sessions, recorded again with Runtime v3
// and read with Run 2's frozen profile. Nothing here tunes anything.
import { readFileSync, writeFileSync } from "node:fs";
import { frameIndex, traceRows, traceStages } from "@/lib/trace/timeline";
import { toTraceEvent, targetsOf, type TraceEventRow } from "@/lib/trace/types";
import { classify } from "@/lib/activity/classify";
import { compileProfile } from "@/lib/activity/profile/compile";
import type { Episode } from "@/lib/activity/types";

const SC = "/private/tmp/claude-501/-Users-divadbaroon-Desktop-engelbart-web/9513afc7-e24b-43db-8b54-e5cd74b27ae9/scratchpad";
const PROFILE = "/Users/divadbaroon/Desktop/engelbart-web/bench/artifact-profile/run2/profile.json";
const profile = JSON.parse(readFileSync(PROFILE, "utf8"));
const c = compileProfile(profile);
const IDS = ["discovery", "search", "controls"];
// What Run 2 actually reported, quoted from the frozen bench/artifact-profile/run2/TIMELINES.md.
const FROZEN: Record<string, number> = { discovery: 1, search: 1, controls: 3 };

const load = (dir: string, id: string) => {
  const raw = JSON.parse(readFileSync(`${SC}/${dir}/sessions/${id}.json`, "utf8")) as { events: TraceEventRow[] };
  const events = raw.events.map(toTraceEvent);
  const frames = frameIndex(events);
  const stages = traceStages(traceRows(events, [], frames)).primary;
  return { events, frames, stages };
};
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.abs(s) % 60).padStart(2, "0")}`;
const dur = (ms: number) => (ms < 1000 ? `${ms}ms` : ms < 60000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60000)}m${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")}s`);

type Row = { at: string; dur: string; sub: string; broad: string; desc: string; acts: string; ev: number };
const readOne = (dir: string, id: string) => {
  const s = load(dir, id);
  const eps: Episode[] = classify({ ...s, taxonomy: c.taxonomy, surfaceOf: c.surfaceOf, calls: new Map() });
  const t0 = Date.parse(s.events[0].at);
  const rows: Row[] = eps.map((e) => {
    const a = e.evidence.acts;
    const bits = [["clicks", a.clicks], ["keys", a.keys], ["typing", a.typing], ["gestures", a.gestures]]
      .filter(([, n]) => (n as number) > 0).map(([k, n]) => `${n} ${k}`);
    return { at: mmss(Math.round((Date.parse(e.startedAt) - t0) / 1000)), dur: dur(e.durationMs),
      sub: e.subBehavior, broad: e.broadBehavior, desc: e.description, ev: e.events.length,
      acts: bits.join(", ") || "—" };
  });
  const kinds: Record<string, number> = {};
  for (const e of s.events) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
  return { eps, rows, kinds, events: s.events, stages: s.stages, t0,
    span: (Date.parse(s.events.at(-1)!.at) - t0) / 1000 };
};

const out: string[] = [];
const B: string[] = [];
for (const id of IDS) {
  const a = readOne("run2", id);
  const b = readOne("run2b", id);
  out.push(`## ${id}\n`);
  out.push(`| | Run 2, as frozen | A: same trace, Runtime v3 | Run 2B: fresh trace, Runtime v3 |`);
  out.push(`|---|---|---|---|`);
  out.push(`| events | ${a.events.length} | ${a.events.length} (same file) | ${b.events.length} |`);
  out.push(`| moments (stages) | ${a.stages.length} | ${a.stages.length} | ${b.stages.length} |`);
  out.push(`| episodes | **${FROZEN[id]}** | **${a.eps.length}** | **${b.eps.length}** |`);
  out.push(`| span | ${mmss(Math.round(a.span))} | ${mmss(Math.round(a.span))} | ${mmss(Math.round(b.span))} |`);
  out.push(`| gesture events | 0 (unrecordable) | 0 (unrecordable) | ${(b.kinds["ui.wheel"] ?? 0) + (b.kinds["ui.drag"] ?? 0)} — ${b.kinds["ui.wheel"] ?? 0} wheel, ${b.kinds["ui.drag"] ?? 0} drag |`);
  out.push(`| gesture acts counted | 0 | 0 | ${b.eps.reduce((n, e) => n + e.evidence.acts.gestures, 0)} |`);
  out.push("");
  for (const [label, r] of [["A — the very same Run 2 trace, re-read with Runtime v3", a], ["Run 2B — a fresh recording made with Runtime v3", b]] as const) {
    out.push(`**${label} — ${r.rows.length} row${r.rows.length === 1 ? "" : "s"}**\n`);
    out.push(`| at | for | class / sub | acts | evts | what it says |`);
    out.push(`|---|---|---|---|---|---|`);
    for (const x of r.rows) out.push(`| ${x.at} | ${x.dur} | ${x.broad}/${x.sub} | ${x.acts} | ${x.ev} | ${x.desc.replace(/\|/g, "\\|")} |`);
    out.push("");
  }
  // ---- B: gesture evidence the frozen profile cannot name
  const withG = b.eps.filter((e) => e.evidence.acts.gestures > 0);
  B.push(`## ${id}\n`);
  if (!withG.length) B.push("No episode carries gesture evidence.\n");
  for (const e of withG) {
    const g = e.events.filter((x) => x.kind === "ui.wheel" || x.kind === "ui.drag");
    const det = g.map((x) => {
      const d = x.data as Record<string, unknown>;
      return x.kind === "ui.wheel"
        ? `wheel ×${d.count} ${d.axis} ${d.direction} ${d.magnitude}${d.ctrl ? " (ctrl/pinch)" : ""} over ${JSON.stringify((targetsOf(x)[0] ?? {}).tag ?? "?")}`
        : `drag ${d.direction} ${d.distance} (${d.moves} moves, ${d.durationMs}ms) over ${JSON.stringify((targetsOf(x)[0] ?? {}).tag ?? "?")}`;
    });
    B.push(`- **${mmss(Math.round((Date.parse(e.startedAt) - b.t0) / 1000))} ${e.broadBehavior}/${e.subBehavior}** — ${e.evidence.acts.gestures} gesture act(s): ${det.join("; ")}`);
    B.push(`  - the profile said: _${e.description}_`);
    B.push(`  - because: _${e.because}_`);
  }
  B.push("");
}
writeFileSync(`${SC}/run2b/SIDE-BY-SIDE.md`, out.join("\n") + "\n");
writeFileSync(`${SC}/run2b/GESTURES.md`, B.join("\n") + "\n");
console.log(out.join("\n"));
console.log("\n\n# B — gesture evidence\n");
console.log(B.join("\n"));
