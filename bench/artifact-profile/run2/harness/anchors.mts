// Which of the profile's parts find anything, and where they first did.
// The question this run asks of an anchor is not "does it work" but "did it
// only ever work on the afternoon the generator saw".
import { readFileSync, writeFileSync } from "node:fs";
import { fitReport } from "@/lib/activity/profile/fit";
import { rung, positional, type Anchor } from "@/lib/activity/profile/schema";
import { DIR, SESSIONS, load, read, compiled } from "./lib.mts";

const { profile, compiled: gen } = compiled(process.argv[2] ?? `${DIR}/experiment/run2/profile.json`);
const run1 = JSON.parse(readFileSync("/Users/divadbaroon/Desktop/engelbart-web/bench/artifact-profile/run1/profile.json", "utf8"));

const fits = SESSIONS.map(({ id, role }) => {
  const s = load(id);
  return { id, role, fit: fitReport(profile, gen, { episodes: read(s, gen), events: s.events }) };
});

const out: string[] = ["# Anchor quality and survival — Run 2\n"];

const anchors = (p: any) => [
  ...p.controls.map((c: any) => ({ kind: "control", id: c.id, a: c.anchor as Anchor })),
  ...p.channels.filter((c: any) => c.container).map((c: any) => ({ kind: "channel", id: c.id, a: c.container as Anchor })),
];
const dist = (list: { a: Anchor }[]) => {
  const t = new Map<number, number>();
  for (const x of list) t.set(rung(x.a), (t.get(rung(x.a)) ?? 0) + 1);
  return { t, pos: list.filter((x) => positional(x.a)).length, n: list.length };
};

out.push("## Rung distribution, beside Run 1's generated ROPE profile\n");
out.push("An anchor's rung is how stable the thing it points at is: 1 is an identifier the");
out.push("application chose, 6 is a position in the document. Lower is better. The Run 1");
out.push("column is context, not a target — ROPE is a different interface.\n");
out.push("| profile | rung 1 | 2 | 3 | 4 | 5 | 6 | positional |");
out.push("|---|---|---|---|---|---|---|---|");
for (const [name, p] of [["Run 2 — wizmap (generated)", profile], ["Run 1 — ROPE (generated)", run1]] as const) {
  const d = dist(anchors(p));
  out.push(`| ${name} · ${d.n} anchors | ${[1, 2, 3, 4, 5, 6].map((r) => d.t.get(r) ?? 0).join(" | ")} | ${d.pos}/${d.n} (${Math.round((100 * d.pos) / d.n)}%) |`);
}

out.push("\n## Every anchor, session by session\n");
out.push(`| anchor | rung | ${SESSIONS.map((s) => s.id).join(" | ")} | verdict |`);
out.push(`|---|---|${SESSIONS.map(() => "---").join("|")}|---|`);
const rows = anchors(profile);
const verdicts = new Map<string, number>();
for (const a of rows) {
  const counts = fits.map(({ fit }) => {
    const hit = a.kind === "control" ? fit.controls.find((c) => c.id === a.id) : fit.channels.find((c) => c.id === a.id);
    return hit?.matched ?? 0;
  });
  const [disc, ...held] = counts;
  const verdict =
    disc > 0 && held.every((n) => n > 0) ? "survived every held-out session"
    : disc > 0 && held.some((n) => n > 0) ? "survived where the behaviour recurred"
    : disc > 0 ? "discovery only — did not recur"
    : held.some((n) => n > 0) ? "first fired in a held-out session"
    : "never testable — nothing matched it anywhere";
  verdicts.set(verdict, (verdicts.get(verdict) ?? 0) + 1);
  out.push(`| ${a.kind} \`${a.id}\` | ${rung(a.a)}${positional(a.a) ? " pos" : ""} | ${counts.map((n) => n || "—").join(" | ")} | ${verdict} |`);
}
out.push("");
for (const [v, n] of [...verdicts].sort((x, y) => y[1] - x[1])) out.push(`- **${n}** — ${v}`);

out.push("\n## Surfaces, rules and the fallback, session by session\n");
out.push(`| | ${SESSIONS.map((s) => s.id).join(" | ")} | first fired |`);
out.push(`|---|${SESSIONS.map(() => "---").join("|")}|---|`);
const first = (counts: number[]) => { const i = counts.findIndex((n) => n > 0); return i < 0 ? "never" : SESSIONS[i].id; };
for (const s of profile.surfaces) {
  const c = fits.map(({ fit }) => fit.surfaces.find((x) => x.id === s.id)?.matched ?? 0);
  out.push(`| surface \`${s.id}\` | ${c.map((n) => n || "—").join(" | ")} | ${first(c)} |`);
}
for (const r of [...profile.rules].sort((a: any, b: any) => a.priority - b.priority)) {
  const c = fits.map(({ fit }) => fit.rules.find((x) => x.id === r.id)?.claimed ?? 0);
  out.push(`| rule \`${r.id}\` (p${r.priority}) | ${c.map((n) => n || "—").join(" | ")} | ${first(c)} |`);
}
{
  const c = fits.map(({ fit }) => fit.fallback.claimed);
  out.push(`| **fallback** \`${profile.fallback.id}\` | ${c.map((n) => n || "—").join(" | ")} | ${first(c)} |`);
}

const everFired = profile.rules.filter((r: any) => fits.some(({ fit }) => (fit.rules.find((x) => x.id === r.id)?.claimed ?? 0) > 0)).length;
const heldOnly = profile.rules.filter((r: any) =>
  (fits[0].fit.rules.find((x) => x.id === r.id)?.claimed ?? 0) === 0 &&
  fits.slice(1).some(({ fit }) => (fit.rules.find((x) => x.id === r.id)?.claimed ?? 0) > 0));
out.push(`\n${everFired}/${profile.rules.length} rules fire at least once across the three sessions.`);
out.push(`${heldOnly.length} rule${heldOnly.length === 1 ? "" : "s"} fired for the first time in a session the generator never saw${heldOnly.length ? `: ${heldOnly.map((r: any) => `\`${r.id}\``).join(", ")}` : ""}.`);

out.push("\n## What each session's fit report says\n");
for (const { id, role, fit } of fits) {
  out.push(`### ${id} — ${role}\n`);
  out.push("```");
  out.push(renderShort(fit));
  out.push("```\n");
}
function renderShort(fit: any) {
  const l: string[] = [`${fit.episodes} episodes`];
  if (fit.unnamed.length) l.push(`documents no surface named: ${fit.unnamed.map((u: any) => `${u.key} (${u.episodes})`).join(", ")}`);
  l.push(`text that arrived through no named channel: ${fit.unnamedText}`);
  if (fit.dead.length) l.push(`dead here: ${fit.dead.map((d: any) => `${d.kind} ${d.id}`).join(", ")}`);
  if (fit.silent.length) l.push(`rules that read nothing here: ${fit.silent.map((s: any) => s.id).join(", ")}`);
  return l.join("\n");
}

out.push("## Written down with nothing cited for it\n");
const inferred = fits[0].fit.inferred;
if (!inferred.length) out.push("Every part of the profile is marked `grounding: \"source\"`.");
else { out.push("| what | grounding | note |"); out.push("|---|---|---|"); for (const i of inferred) out.push(`| ${i.kind} \`${i.id}\` | ${i.grounding} | ${(i.note ?? "").replace(/\|/g, "\\|")} |`); }

writeFileSync(`${DIR}/ANCHORS.md`, out.join("\n") + "\n");
console.log(out.join("\n"));
