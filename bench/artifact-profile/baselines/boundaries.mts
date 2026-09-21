// Every episode boundary the four frozen ROPE recordings produce, under
// both the hand-written taxonomy and Run 1's generated profile. Run it
// before a change to the generic runtime and after, and diff the two.
// Nothing here is part of the application.
import { readFileSync, writeFileSync } from "node:fs";
import { frameIndex, traceRows, traceStages } from "@/lib/trace/timeline";
import { toTraceEvent, toModelCall, type TraceEventRow, type ModelCallRow } from "@/lib/trace/types";
import { classify } from "@/lib/activity/classify";
import { ROPE_TAXONOMY, ropeSurface } from "@/lib/activity/rope";
import { compileProfile } from "@/lib/activity/profile/compile";
import type { Episode } from "@/lib/activity/types";

const HERE = "/Users/divadbaroon/Desktop/engelbart-web/bench/artifact-profile/baselines/run1-traces";
const SESSIONS = ["87a7ceb0", "0711358e", "d41b33b2", "3c9e1514"];
const gen = compileProfile(JSON.parse(readFileSync("/Users/divadbaroon/Desktop/engelbart-web/bench/artifact-profile/run1/profile.json", "utf8")));

const load = (id: string) => {
  const raw = JSON.parse(readFileSync(`${HERE}/${id}.json`, "utf8")) as { events: TraceEventRow[]; calls: ModelCallRow[] };
  const events = raw.events.map(toTraceEvent);
  const calls = raw.calls.map(toModelCall);
  const frames = frameIndex(events);
  return { events, frames, stages: traceStages(traceRows(events, calls, frames)).primary, calls: new Map(calls.map((c) => [c.callId, { model: c.model, latencyMs: c.latencyMs }])) };
};

const lines: string[] = [];
for (const id of SESSIONS) {
  const s = load(id);
  const runs: [string, Episode[]][] = [
    ["handwritten", classify({ ...s, taxonomy: ROPE_TAXONOMY, surfaceOf: ropeSurface })],
    ["generated", classify({ ...s, taxonomy: gen.taxonomy, surfaceOf: gen.surfaceOf })],
  ];
  for (const [which, eps] of runs) {
    lines.push(`## ${id} · ${which} · ${eps.length} episodes`);
    const t0 = Date.parse(s.events[0].at);
    for (const e of eps) {
      const at = Math.round((Date.parse(e.startedAt) - t0) / 1000);
      lines.push(`${String(at).padStart(5)}s +${String(Math.round(e.durationMs / 1000)).padStart(4)}s  ${e.evidence.surface.key.padEnd(16)} ${e.broadBehavior}/${e.subBehavior}`);
    }
    lines.push("");
  }
}
const out = process.argv[2] ?? "/tmp/boundaries.txt";
writeFileSync(out, lines.join("\n") + "\n");
console.log(`${lines.filter((l) => l.startsWith("##")).length} readings → ${out}`);
