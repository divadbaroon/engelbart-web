// Every recorded act and every text that arrived, and whether the profile
// had a name for it. This is the raw material of the failure taxonomy.
import { writeFileSync } from "node:fs";
import { targetOf } from "@/lib/trace/types";
import { appearances } from "@/lib/activity/segment";
import { DIR, SESSIONS, load, compiled } from "./lib.mts";

const { compiled: gen } = compiled(`${DIR}/experiment/run2/profile.json`);
const t = (x: any) => x ? `<${x.tag}>${x.id ? `#${x.id}` : ""}${x.classes?.length ? `.${x.classes.join(".")}` : ""}${x.text ? ` "${String(x.text).slice(0, 40)}"` : ""}` : "(none)";
const out: string[] = ["# Every act and every appearance, named or not\n"];
for (const { id, role } of SESSIONS) {
  const s = load(id);
  out.push(`## ${id} — ${role}\n`);
  out.push("### acts\n");
  for (const e of s.events) {
    if (e.kind !== "ui.click" && e.kind !== "ui.submit" && e.kind !== "ui.input" && e.kind !== "ui.key") continue;
    const target = targetOf(e);
    const hits = target ? gen.taxonomy.controls.filter((c) => c.is(target)).map((c) => c.id) : [];
    const ctl = (e.data as any)?.control;
    const ctlHits = ctl ? gen.taxonomy.controls.filter((c) => c.is(ctl)).map((c) => c.id) : [];
    const all = [...new Set([...hits, ...ctlHits])];
    out.push(`- ${e.kind} ${t(target)}${ctl ? ` inside ${t(ctl)}` : ""} → **${all.length ? all.join(", ") : "NO CONTROL"}**`);
  }
  out.push("\n### text that arrived\n");
  for (const a of appearances(s.events)) {
    const hit = gen.taxonomy.channels.find((c) => c.is(a));
    out.push(`- in ${t(a.container)} — ${JSON.stringify(a.text.slice(0, 90))} → **${hit ? hit.id : "NO CHANNEL"}**`);
  }
  out.push("");
}
writeFileSync(`${DIR}/MISSES.md`, out.join("\n") + "\n");
console.log(out.join("\n"));
