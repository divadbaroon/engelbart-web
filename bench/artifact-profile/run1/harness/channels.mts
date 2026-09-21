import { ROPE_TAXONOMY, ropeSurface } from "@/lib/activity/rope";
import { appearances } from "@/lib/activity/segment";
import { DIR, SESSIONS, load, compiled } from "./lib.mts";
const { compiled: gen } = compiled(`${DIR}/run1/profile.json`);
for (const { id, role } of SESSIONS) {
  const s = load(id);
  const app = appearances(s.events);
  console.log(`\n## ${id} ${role} — ${app.length} text appearances`);
  for (const a of app) {
    const h = ROPE_TAXONOMY.channels.find((c) => c.is(a));
    const g = gen.taxonomy.channels.find((c) => c.is(a));
    const mark = (h?.id ?? "—") === "—" && (g?.id ?? "—") === "—" ? " " : (h && g ? "  " : " !");
    console.log(`${mark} hand=${(h?.id ?? "—").padEnd(14)} gen=${(g?.id ?? "—").padEnd(18)} container=${(a.container?.tag ?? "?")}#${a.container?.id ?? ""} sel=${(a.container?.selector ?? "").slice(0, 62)}`);
    console.log(`      text: ${JSON.stringify(a.text.slice(0, 110))}`);
  }
}
