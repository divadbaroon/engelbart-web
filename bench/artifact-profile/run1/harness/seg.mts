import { DIR, SESSIONS, load, handwritten, nativeGen, compiled } from "./lib.mts";
const { compiled: gen } = compiled(`${DIR}/run1/profile.json`);
for (const { id, role } of SESSIONS) {
  const s = load(id); const h = handwritten(s); const g = nativeGen(s, gen);
  const hb = new Set(h.flatMap((e) => [e.startedAt, e.endedAt]));
  const gb = new Set(g.flatMap((e) => [e.startedAt, e.endedAt]));
  const shared = [...hb].filter((x) => gb.has(x)).length;
  const exact = h.filter((e) => g.some((x) => x.startedAt === e.startedAt && x.endedAt === e.endedAt)).length;
  console.log(`${id} ${role}: ${h.length}→${g.length} episodes; boundaries ${shared}/${hb.size} shared (gen has ${gb.size}); ${exact}/${h.length} windows identical`);
  if (h.length !== g.length) {
    // which windows differ
    for (const e of h) if (!g.some((x) => x.startedAt === e.startedAt && x.endedAt === e.endedAt)) console.log(`   hand-only window ${e.startedAt}..${e.endedAt} ${e.broadBehavior}/${e.subBehavior}`);
    for (const e of g) if (!h.some((x) => x.startedAt === e.startedAt && x.endedAt === e.endedAt)) console.log(`   gen-only  window ${e.startedAt}..${e.endedAt} ${e.broadBehavior}/${e.subBehavior} — ${e.description}`);
  }
}
