import { DIR, SESSIONS, load, handwritten, tierAGen, compiled } from "./lib.mts";
const { compiled: gen } = compiled(`${DIR}/run1/profile.json`);
const pair = new Map<string, number>();
for (const { id } of SESSIONS) {
  const s = load(id); const h = handwritten(s); const g = tierAGen(s, gen);
  for (let i = 0; i < Math.min(h.length, g.length); i++) {
    const k = `${h[i].broadBehavior}/${h[i].subBehavior}  ⇄  ${g[i].broadBehavior}/${g[i].subBehavior}`;
    pair.set(k, (pair.get(k) ?? 0) + 1);
  }
}
for (const [k, n] of [...pair].sort((a, b) => b[1] - a[1])) console.log(`${String(n).padStart(3)}×  ${k}`);
