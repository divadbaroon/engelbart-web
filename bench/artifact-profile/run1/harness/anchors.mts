// Which of the profile's anchors still find anything in sessions the
// generator never saw. An anchor fitted to one afternoon is the failure
// mode this is looking for.
import { readFileSync, writeFileSync } from "node:fs";
import { fitReport } from "@/lib/activity/profile/fit";
import { rung, positional, type Anchor } from "@/lib/activity/profile/schema";
import { compileProfile } from "@/lib/activity/profile/compile";
import { DIR, SESSIONS, load, nativeGen } from "./lib.mts";

const manual = JSON.parse(readFileSync("tests/fixtures/rope-profile.json", "utf8"));
const profile = JSON.parse(readFileSync(process.argv[2] ?? `${DIR}/out/profile.json`, "utf8"));
const gen = compileProfile(profile);

const fits = SESSIONS.map(({ id }) => {
  const s = load(id);
  return { id, fit: fitReport(profile, gen, { episodes: nativeGen(s, gen), events: s.events }) };
});

const out: string[] = ["# Anchor quality and survival\n"];
const dist = (list: { a: Anchor }[]) => {
  const t = new Map<number, number>();
  for (const x of list) t.set(rung(x.a), (t.get(rung(x.a)) ?? 0) + 1);
  return { t, pos: list.filter((x) => positional(x.a)).length, n: list.length };
};
const anchors = (p: any) => [
  ...p.controls.map((c: any) => ({ kind: "control", id: c.id, a: c.anchor as Anchor })),
  ...p.channels.filter((c: any) => c.container).map((c: any) => ({ kind: "channel", id: c.id, a: c.container as Anchor })),
];

out.push("## Rung distribution — generated vs the hand-written manual profile\n");
out.push("| | rung 1 | rung 2 | rung 3 | rung 4 | rung 5 | rung 6 | positional |");
out.push("|---|---|---|---|---|---|---|---|");
for (const [name, p] of [["generated", profile], ["manual (hand-written)", manual]] as const) {
  const d = dist(anchors(p));
  out.push(`| ${name} (${d.n} anchors) | ${[1,2,3,4,5,6].map((r) => d.t.get(r) ?? 0).join(" | ")} | ${d.pos}/${d.n} |`);
}

out.push("\n## Which generated anchors find anything, session by session\n");
out.push(`| anchor | rung | ${SESSIONS.map((s) => `${s.id}${s.id === SESSIONS[0].id ? " (disc)" : ""}`).join(" | ")} | survives held-out |`);
out.push(`|---|---|${SESSIONS.map(() => "---").join("|")}|---|`);
const rows = anchors(profile);
let survive = 0, live = 0;
for (const a of rows) {
  const counts = fits.map(({ fit }) => {
    const hit = a.kind === "control" ? fit.controls.find((c) => c.id === a.id) : fit.channels.find((c) => c.id === a.id);
    return hit?.matched ?? 0;
  });
  const heldOut = counts.slice(1).some((n) => n > 0);
  if (counts[0] > 0) live++;
  if (heldOut) survive++;
  out.push(`| ${a.kind} \`${a.id}\` | ${rung(a.a)}${positional(a.a) ? " pos" : ""} | ${counts.map((n) => n || "—").join(" | ")} | ${heldOut ? "yes" : "no"} |`);
}
out.push(`\n${survive}/${rows.length} generated anchors match something in at least one held-out session (${live}/${rows.length} matched in the discovery session).`);

out.push("\n## Surfaces and rules, session by session\n");
out.push(`| | ${SESSIONS.map((s) => s.id).join(" | ")} |`);
out.push(`|---|${SESSIONS.map(() => "---").join("|")}|`);
for (const s of profile.surfaces) out.push(`| surface \`${s.id}\` | ${fits.map(({ fit }) => fit.surfaces.find((x) => x.id === s.id)?.matched || "—").join(" | ")} |`);
for (const r of profile.rules) out.push(`| rule \`${r.id}\` | ${fits.map(({ fit }) => fit.rules.find((x) => x.id === r.id)?.claimed || "—").join(" | ")} |`);
out.push(`| **fallback** | ${fits.map(({ fit }) => fit.fallback.claimed || "—").join(" | ")} |`);

const everFired = profile.rules.filter((r: any) => fits.some(({ fit }) => (fit.rules.find((x) => x.id === r.id)?.claimed ?? 0) > 0)).length;
out.push(`\n${everFired}/${profile.rules.length} rules fire at least once across the four sessions.`);

writeFileSync(`${DIR}/ANCHORS.md`, out.join("\n") + "\n");
console.log(out.join("\n"));
