// Section 6: the profile itself, before any behavioural comparison.
import { readFileSync } from "node:fs";
import { validateProfile } from "@/lib/activity/profile/validate";
import { fitReport } from "@/lib/activity/profile/fit";
import { compileProfile } from "@/lib/activity/profile/compile";
import { rung, positional, type Anchor } from "@/lib/activity/profile/schema";
import { DIR, SESSIONS, load, nativeGen } from "./lib.mts";

const path = `${DIR}/run1/profile.json`;
const raw = JSON.parse(readFileSync(path, "utf8"));

const v = validateProfile(raw);
console.log("## Validation\n");
console.log(`ok: ${v.ok}   errors: ${v.issues.filter((i) => i.severity === "error").length}   warnings: ${v.issues.filter((i) => i.severity === "warning").length}`);
for (const i of v.issues) console.log(`  [${i.severity}] ${i.path} — ${i.code}: ${i.message}`);

// The single error is `fallback.id`, an accounting label the compiler
// never puts in an Episode — and SCHEMA.md, which was the generator's
// only source, names FallbackSpec without ever defining it. Proceeding
// on the frozen JSON unpatched; anything else would be a repair.
const fatal = v.issues.filter((i) => i.severity === "error" && i.path !== "fallback.id");
if (fatal.length) { console.log("\nDOES NOT COMPILE — stopping."); process.exit(0); }

const gen = compileProfile(raw);
const s = load(SESSIONS[0].id);
const eps = nativeGen(s, gen);
const fit = fitReport(raw, gen, { episodes: eps, events: s.events });

console.log(`\n## Fit on the discovery session (${SESSIONS[0].id})\n`);
console.log(`artifact: ${fit.artifact}   episodes: ${fit.episodes}   unnamed text appearances: ${fit.unnamedText}`);

console.log("\n### Surfaces");
for (const x of fit.surfaces) console.log(`  ${x.matched ? "✓" : "·"} ${x.id} "${x.label}" — ${x.matched} episodes; keys: ${x.keys.join(", ") || "(none)"}`);
for (const u of fit.unnamed) console.log(`  ! unnamed document ${u.key} — ${u.episodes} episodes`);

console.log("\n### Controls (anchor rung, events matched, episodes carrying it)");
for (const c of fit.controls) console.log(`  ${c.matched ? "✓" : "·"} rung ${c.rung}${c.positional ? " POS" : ""}  ${c.id} "${c.label}" — ${c.matched} events, ${c.episodes} episodes`);

console.log("\n### Channels");
for (const c of fit.channels) console.log(`  ${c.matched ? "✓" : "·"} rung ${c.rung}${c.positional ? " POS" : ""}  ${c.id} "${c.label}" — ${c.matched} appearances`);

console.log("\n### Rules, in priority order");
for (const r of fit.rules) console.log(`  ${String(r.priority).padStart(4)} ${r.claimed ? "✓" : "·"} ${r.id} → ${r.broad}/${r.sub} — ${r.claimed} episodes`);
console.log(`       ${fit.fallback.claimed ? "✓" : "·"} ${fit.fallback.id} → ${fit.fallback.sub} — ${fit.fallback.claimed} episodes`);

console.log("\n### Dead (matched nothing in the discovery session)");
for (const d of fit.dead) console.log(`  ${d.kind} ${d.id} "${d.label}"`);
console.log("\n### Silent rules (never fired)");
for (const d of fit.silent) console.log(`  ${d.id} → ${d.sub}`);

console.log("\n### Claims written down with nothing cited");
for (const i of fit.inferred) console.log(`  ${i.kind} ${i.id} [${i.grounding}] ${i.note ?? ""}`);

// Anchor rungs across the whole profile, and the positional ones.
const all: { kind: string; id: string; a: Anchor }[] = [
  ...raw.controls.map((c: any) => ({ kind: "control", id: c.id, a: c.anchor })),
  ...raw.channels.filter((c: any) => c.container).map((c: any) => ({ kind: "channel", id: c.id, a: c.container })),
];
const t = new Map<number, number>();
for (const x of all) t.set(rung(x.a), (t.get(rung(x.a)) ?? 0) + 1);
console.log(`\n### Anchor rungs across the profile (${all.length} anchors)`);
console.log(`  ${[1,2,3,4,5,6].map((r) => `rung ${r}: ${t.get(r) ?? 0}`).join("   ")}`);
console.log(`  positional: ${all.filter((x) => positional(x.a)).map((x) => x.id).join(", ") || "none"}`);

// Grounding and confidence as the profile declares them.
const prov = (o: any) => o?.generation ?? o?.provenance ?? null;
const tally = new Map<string, number>();
const walk = (kind: string, list: any[]) => { for (const x of list) { const p = prov(x); const g = p?.grounding ?? "(none declared)"; tally.set(`${kind}/${g}`, (tally.get(`${kind}/${g}`) ?? 0) + 1); } };
walk("surface", raw.surfaces); walk("channel", raw.channels); walk("control", raw.controls); walk("rule", raw.rules);
console.log("\n### Declared grounding");
for (const [k, n] of [...tally].sort()) console.log(`  ${k}: ${n}`);
const conf = new Map<string, number>();
for (const list of [raw.surfaces, raw.channels, raw.controls, raw.rules]) for (const x of list) { const c = prov(x)?.confidence ?? "(none)"; conf.set(c, (conf.get(c) ?? 0) + 1); }
console.log("### Declared generation confidence");
for (const [k, n] of [...conf].sort()) console.log(`  ${k}: ${n}`);

console.log("\n### Broad classes the profile can produce");
const broads = new Map<string, string[]>();
for (const r of raw.rules) { const l = broads.get(r.broad) ?? []; l.push(r.sub); broads.set(r.broad, l); }
const fb = broads.get(raw.fallback.broad) ?? []; fb.push(`${raw.fallback.sub} (fallback)`); broads.set(raw.fallback.broad, fb);
for (const [b, subs] of [...broads].sort()) console.log(`  ${b}: ${subs.join(", ")}`);
