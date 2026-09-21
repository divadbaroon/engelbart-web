import { writeFileSync } from "node:fs";
import { ROPE_TAXONOMY, ropeSurface } from "@/lib/activity/rope";
import { validateProfile, renderIssues } from "@/lib/activity/profile/validate";
import { fitReport, renderFit } from "@/lib/activity/profile/fit";
import { rung, positional, type Anchor } from "@/lib/activity/profile/schema";
import type { Episode } from "@/lib/activity/types";
import { DIR, SESSIONS, SEG, load, handwritten, nativeGen, tierAGen, compiled, interfaceReading, clock, overlap } from "./lib.mts";

const PROFILE = process.argv[2] ?? `${DIR}/out/profile.json`;
const { profile, compiled: gen } = compiled(PROFILE);
const FALLBACK_SUB = profile.fallback.sub as string;
const out: string[] = [];
const say = (s = "") => { out.push(s); console.log(s); };
const pct = (n: number, d: number) => d ? `${Math.round((n / d) * 100)}%` : "—";

// ---- the profile itself
say("# The generated profile\n");
const checked = validateProfile(profile);
say("## Validation\n");
say("```"); say(renderIssues(checked.issues)); say("```");
// `fallback.id` is exempt: SCHEMA.md names FallbackSpec and never defines
// it, and the id is a report label the compiler never puts in an Episode.
// Refusing on it would be punishing the generator for a hole in the pack.
if (checked.issues.some((i) => i.severity === "error" && i.path !== "fallback.id")) { say("\n**REFUSED — cannot run.**"); writeFileSync(`${DIR}/REPORT.md`, out.join("\n")); process.exit(1); }

const anchorsOf = (): { what: string; id: string; a: Anchor }[] => [
  ...profile.controls.map((c: any) => ({ what: "control", id: c.id, a: c.anchor })),
  ...profile.channels.filter((c: any) => c.container).map((c: any) => ({ what: "channel", id: c.id, a: c.container })),
];
const rungTable = (list: { a: Anchor }[]) => {
  const t = new Map<number, number>();
  for (const x of list) t.set(rung(x.a), (t.get(rung(x.a)) ?? 0) + 1);
  return [1, 2, 3, 4, 5, 6].map((r) => `rung ${r}: ${t.get(r) ?? 0}`).join("  ·  ");
};
say("\n## Anchor quality\n");
say("```");
say(`generated  ${rungTable(anchorsOf())}   positional: ${anchorsOf().filter((x) => positional(x.a)).length}/${anchorsOf().length}`);
say("```");

// ---- per session
type Row = Record<string, unknown>;
const summary: Row[] = [];

for (const { id, role } of SESSIONS) {
  const s = load(id);
  const hand = handwritten(s);
  const genA = tierAGen(s, gen);
  const genB = nativeGen(s, gen);
  const t0 = Date.parse(hand[0]?.startedAt ?? "1970-01-01");

  say(`\n\n---\n\n# ${id} — ${role}\n`);
  say(`${s.events.length} events · handwritten reads ${hand.length} stretches · profile reads ${genB.length}\n`);

  if (id === SESSIONS[0].id) {
    say("## Fit of the profile against this session\n");
    say("```"); say(renderFit(fitReport(profile, gen, { episodes: genB, events: s.events }))); say("```");
  }

  // ---- Tier A
  const sameCut = genA.length === hand.length && genA.every((e, i) => e.startedAt === hand[i].startedAt && e.endedAt === hand[i].endedAt);
  say(`\n## Tier A — same windows, different reading${sameCut ? "" : "  ⚠ CUT NOT SHARED"}\n`);
  say("| # | at | handwritten | generated |");
  say("|---|---|---|---|");
  const n = Math.min(hand.length, genA.length);
  for (let i = 0; i < n; i++) {
    const h = hand[i], g = genA[i];
    const mark = h.broadBehavior === g.broadBehavior ? "" : " ⚠";
    say(`| ${i} | ${clock(h, t0)}s | **${h.broadBehavior}** ${h.subBehavior}<br>${h.description} | **${g.broadBehavior}**${mark} ${g.subBehavior}<br>${g.description}<br>*${g.confidence} · ${g.because}* |`);
  }

  const fellH = hand.filter((e) => e.subBehavior === "IDLE_OR_UNCLEAR").length;
  const fellG = genA.filter((e) => e.subBehavior === FALLBACK_SUB).length;
  const agree = genA.slice(0, n).filter((g, i) => g.broadBehavior === hand[i].broadBehavior).length;
  const wrong = genA.slice(0, n).filter((g, i) => g.confidence === "high" && g.broadBehavior !== hand[i].broadBehavior);
  const unclearG = genA.filter((e) => e.broadBehavior === "UNCLEAR").length;
  const unclearH = hand.filter((e) => e.broadBehavior === "UNCLEAR").length;
  const roleAgree = genA.slice(0, n).filter((g, i) => g.evidence.surface.role === hand[i].evidence.surface.role).length;

  const ihand = interfaceReading(s, ROPE_TAXONOMY, ropeSurface);
  const igen = interfaceReading(s, gen.taxonomy, gen.surfaceOf);
  const chBoth = ihand.channels.filter((c, i) => !!c && !!igen.channels[i]).length;
  const chSameKind = ihand.channels.filter((c, i) => {
    const g = igen.channels[i]; if (!c || !g) return false;
    const hf = ROPE_TAXONOMY.channels.find((x) => x.id === c)?.from;
    const gf = gen.taxonomy.channels.find((x) => x.id === g)?.from;
    return hf === gf;
  }).length;
  const chHand = ihand.channels.filter(Boolean).length, chGen = igen.channels.filter(Boolean).length;
  const ctlHand = ihand.controls.filter((c) => c && c.length).length;
  const ctlGen = igen.controls.filter((c) => c && c.length).length;
  const ctlBoth = ihand.controls.filter((c, i) => c?.length && igen.controls[i]?.length).length;
  const ctlTotal = ihand.controls.length;

  say("\n### Metrics (Tier A)\n");
  say("| | handwritten | generated |");
  say("|---|---|---|");
  say(`| stretches | ${hand.length} | ${genA.length} |`);
  say(`| non-fallback coverage | ${pct(hand.length - fellH, hand.length)} | ${pct(genA.length - fellG, genA.length)} |`);
  say(`| UNCLEAR rate | ${pct(unclearH, hand.length)} | ${pct(unclearG, genA.length)} |`);
  say(`| broad-class agreement | — | **${pct(agree, n)}** (${agree}/${n}) |`);
  say(`| confidently wrong | — | **${pct(wrong.length, n)}** (${wrong.length}/${n}) |`);
  say(`| surface role agreement | — | ${pct(roleAgree, n)} (${roleAgree}/${n}) |`);
  say(`| texts given a channel | ${chHand}/${ihand.channels.length} | ${chGen}/${igen.channels.length} |`);
  say(`| ...both, same person/system side | — | ${chSameKind}/${chBoth} of texts both named |`);
  say(`| acts matched to a control | ${ctlHand}/${ctlTotal} | ${ctlGen}/${ctlTotal} |`);
  say(`| ...both matched something | — | ${ctlBoth}/${ctlTotal} |`);

  if (wrong.length) {
    say("\n### Confidently wrong (Tier A)\n");
    for (const g of wrong) {
      const i = genA.indexOf(g);
      say(`- **${clock(g, t0)}s** handwritten says \`${hand[i].broadBehavior}/${hand[i].subBehavior}\`; profile says \`${g.broadBehavior}/${g.subBehavior}\` at high confidence — "${g.description}" (${g.because})`);
    }
  }

  // ---- Tier B
  say(`\n## Tier B — each cuts the session itself\n`);
  say(`handwritten: **${hand.length}** stretches · profile: **${genB.length}** stretches\n`);
  const t0b = Date.parse(genB[0]?.startedAt ?? hand[0]?.startedAt ?? "1970-01-01");
  say("| handwritten | profile |");
  say("|---|---|");
  const rowsB = Math.max(hand.length, genB.length);
  for (let i = 0; i < rowsB; i++) {
    const h = hand[i], g = genB[i];
    say(`| ${h ? `${clock(h, t0)}s **${h.broadBehavior}** ${h.subBehavior}<br>${h.description}` : "—"} | ${g ? `${clock(g, t0b)}s **${g.broadBehavior}** ${g.subBehavior}<br>${g.description}` : "—"} |`);
  }
  // Boundary alignment by overlap
  let aligned = 0, broadB = 0;
  for (const h of hand) {
    let best: Episode | null = null, most = 0;
    for (const g of genB) { const o = overlap(h, g); if (o > most) { most = o; best = g; } }
    if (best && most > (Date.parse(h.endedAt) - Date.parse(h.startedAt)) * 0.5) {
      aligned++;
      if (best.broadBehavior === h.broadBehavior) broadB++;
    }
  }
  const fellGB = genB.filter((e) => e.subBehavior === FALLBACK_SUB).length;
  say("\n### Metrics (Tier B)\n");
  say("| | value |");
  say("|---|---|");
  say(`| episode count, handwritten → profile | ${hand.length} → ${genB.length} |`);
  say(`| handwritten stretches with a majority-overlap counterpart | ${pct(aligned, hand.length)} (${aligned}/${hand.length}) |`);
  say(`| ...of those, same broad class | ${pct(broadB, aligned)} (${broadB}/${aligned}) |`);
  say(`| profile non-fallback coverage | ${pct(genB.length - fellGB, genB.length)} |`);
  say(`| profile UNCLEAR rate | ${pct(genB.filter((e) => e.broadBehavior === "UNCLEAR").length, genB.length)} |`);

  summary.push({ id, role, n: hand.length, tierAAgree: `${agree}/${n}`, tierAAgreePct: Math.round((agree / n) * 100),
    confWrong: wrong.length, genCoverage: Math.round(((genA.length - fellG) / genA.length) * 100),
    tierBCount: genB.length, tierBAligned: aligned, tierBBroad: broadB });
}

say("\n\n---\n\n# Across the four sessions\n");
say("| session | role | stretches | Tier A broad agreement | confidently wrong | Tier B count | Tier B aligned & agreeing |");
say("|---|---|---|---|---|---|---|");
for (const r of summary) say(`| ${r.id} | ${r.role} | ${r.n} | ${r.tierAAgree} (${r.tierAAgreePct}%) | ${r.confWrong} | ${r.tierBCount} | ${r.tierBBroad}/${r.tierBAligned} |`);
const held = summary.slice(1);
const hn = held.reduce((a, r) => a + (r.n as number), 0);
const ha = held.reduce((a, r) => a + Number(String(r.tierAAgree).split("/")[0]), 0);
say(`\n**Held-out only: ${ha}/${hn} broad-class agreement (${pct(ha, hn)}), ${held.reduce((a, r) => a + (r.confWrong as number), 0)} confidently wrong.**`);

writeFileSync(`${DIR}/REPORT.md`, out.join("\n") + "\n");
writeFileSync(`${DIR}/summary.json`, JSON.stringify(summary, null, 2));
