import { SESSIONS, load } from "./lib.mts";
import { appearances } from "@/lib/activity/segment";
import { windows, DEFAULT_SEGMENTATION } from "@/lib/activity/segment";
for (const { id, role } of SESSIONS) {
  const s = load(id);
  const w = windows(s.stages, s.frames, DEFAULT_SEGMENTATION);
  const t0 = Date.parse(s.events[0].at);
  console.log(`\n## ${id} — ${role}: ${s.events.length} events, ${s.stages.length} stages, ${w.length} windows, ${appearances(s.events).length} text appearances`);
  console.log(`   surfaces seen: ${[...new Set([...s.frames.values()].map((f:any)=>f.key))].join(", ")}`);
  for (const x of w) console.log(`   ${String(Math.round((Date.parse(x.startedAt)-t0)/1000)).padStart(4)}s..${String(Math.round((Date.parse(x.endedAt)-t0)/1000)).padStart(4)}s  parts=${x.parts.length}`);
}
