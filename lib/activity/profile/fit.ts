// Whether a profile actually fits the session it claims to describe.
//
// A handwritten taxonomy is checked by the person who wrote it looking at
// the screen. Nothing checks a generated one, and the ways it fails are
// quiet ones: a channel whose container moved matches nothing, and the
// text it would have named arrives with no channel at all, which removes
// it from what was said, from what somebody submitted, and from the
// canvas — without any of those saying so. A control whose anchor is
// stale contributes no ids, and every rule that asks whether it was used
// silently answers no. A rule that never fires looks exactly like a rule
// about something that did not happen.
//
// So: count everything, and say what counted zero. This is the report
// that makes a generated profile fail visibly.
import { appearances } from "@/lib/activity/segment";
import { targetOf, type TraceEvent } from "@/lib/trace/types";
import type { Broad, Episode } from "@/lib/activity/types";
import type { Context } from "@/lib/activity/taxonomy";
import { positional, rung, type Anchor, type ArtifactProfile, type Grounding } from "@/lib/activity/profile/schema";
import type { CompiledProfile } from "@/lib/activity/profile/compile";

export type Reach = { id: string; label: string; matched: number };
export type AnchorReach = Reach & { rung: number; positional: boolean };

export type Fit = {
  artifact: string;
  episodes: number;
  // How many episodes happened on a document each surface spec named, and
  // which keys it actually matched.
  surfaces: (Reach & { keys: string[] })[];
  // Documents no surface spec named. They still read, as themselves, with
  // the role "other" — which means every rule about a named document
  // fails closed for them.
  unnamed: { key: string; episodes: number }[];
  // Events whose element each control anchor matched, and the episodes
  // that ended up carrying the control's id.
  controls: (AnchorReach & { episodes: number })[];
  channels: AnchorReach[];
  // Text that arrived through no named channel. Some of this is ordinary
  // — an interface repaints things that are nobody's words — but a large
  // number beside a dead channel is the channel having moved.
  unnamedText: number;
  rules: { id: string; sub: string; broad: Broad; priority: number; claimed: number }[];
  fallback: { id: string; sub: string; claimed: number };
  // Nothing matched these, anywhere in the session.
  dead: { kind: "surface" | "control" | "channel"; id: string; label: string }[];
  // These matched nothing to read.
  silent: { id: string; sub: string }[];
  // Written down with nothing cited for them. Not wrong, and worth a
  // second look before anybody believes a sentence one of them produced.
  inferred: { kind: string; id: string; grounding: Grounding; note?: string }[];
};

export type FitInput = { episodes: Episode[]; events: TraceEvent[] };

const reach = (id: string, label: string, a: Anchor, matched: number): AnchorReach =>
  ({ id, label, matched, rung: rung(a), positional: positional(a) });

export function fitReport(profile: ArtifactProfile, compiled: CompiledProfile, input: FitInput): Fit {
  const { episodes, events } = input;

  // ---- surfaces, by the documents the episodes happened on
  const perSurface = new Map<string, Set<string>>();
  const unnamed = new Map<string, number>();
  const surfaceCount = new Map<string, number>();
  for (const e of episodes) {
    const key = e.evidence.surface.key;
    const id = compiled.surfaceMatch(key);
    if (!id) { unnamed.set(key, (unnamed.get(key) ?? 0) + 1); continue; }
    surfaceCount.set(id, (surfaceCount.get(id) ?? 0) + 1);
    const keys = perSurface.get(id) ?? new Set<string>();
    keys.add(key);
    perSurface.set(id, keys);
  }

  // ---- controls, over every act that could have used one
  const controlHits = new Map<string, number>();
  for (const e of events) {
    if (e.kind !== "ui.click" && e.kind !== "ui.submit") continue;
    const target = targetOf(e);
    if (!target) continue;
    for (const control of compiled.taxonomy.controls) if (control.is(target)) controlHits.set(control.id, (controlHits.get(control.id) ?? 0) + 1);
  }
  const controlEpisodes = new Map<string, number>();
  for (const e of episodes) for (const id of e.evidence.controls) controlEpisodes.set(id, (controlEpisodes.get(id) ?? 0) + 1);

  // ---- channels, over every text that arrived
  const channelHits = new Map<string, number>();
  let unnamedText = 0;
  for (const a of appearances(events)) {
    const hit = compiled.taxonomy.channels.find((c) => c.is(a));
    if (hit) channelHits.set(hit.id, (channelHits.get(hit.id) ?? 0) + 1);
    else unnamedText += 1;
  }

  // ---- which rule read each episode
  //
  // Asked again rather than remembered, and asked the way the classifier
  // asks it: the context of the nth episode is the n episodes before it.
  // That is what makes this a report about these readings rather than a
  // second, differently-ordered pass.
  const claimed = new Map<string, number>();
  let fellThrough = 0;
  episodes.forEach((e, index) => {
    const context: Context = {
      evidence: e.evidence,
      durationMs: e.durationMs,
      index,
      previous: episodes[index - 1] ?? null,
      before: episodes.slice(0, index),
    };
    const at = compiled.taxonomy.rules.findIndex((r) => r.when(context));
    if (at < 0) { fellThrough += 1; return; }
    const id = compiled.ruleIds[at];
    claimed.set(id, (claimed.get(id) ?? 0) + 1);
  });

  const byPriority = [...profile.rules].sort((a, b) => a.priority - b.priority || (a.id < b.id ? -1 : 1));
  const rules = byPriority.map((r) => ({ id: r.id, sub: r.sub, broad: r.broad, priority: r.priority, claimed: claimed.get(r.id) ?? 0 }));

  const surfaces = profile.surfaces.map((s) => ({ id: s.id, label: s.label, matched: surfaceCount.get(s.id) ?? 0, keys: [...(perSurface.get(s.id) ?? [])] }));
  const controls = profile.controls.map((c) => ({ ...reach(c.id, c.label, c.anchor, controlHits.get(c.id) ?? 0), episodes: controlEpisodes.get(c.id) ?? 0 }));
  const channels = profile.channels.map((c) => ({
    ...reach(c.id, c.label, c.container ?? ({ text: { present: true } } as Anchor), channelHits.get(c.id) ?? 0),
  }));

  const dead: Fit["dead"] = [
    ...surfaces.filter((s) => !s.matched).map((s) => ({ kind: "surface" as const, id: s.id, label: s.label })),
    ...controls.filter((c) => !c.matched).map((c) => ({ kind: "control" as const, id: c.id, label: c.label })),
    ...channels.filter((c) => !c.matched).map((c) => ({ kind: "channel" as const, id: c.id, label: c.label })),
  ];

  const inferred: Fit["inferred"] = [];
  const note = (kind: string, id: string, generation?: { grounding: Grounding; note?: string }) => {
    if (generation && generation.grounding !== "source") inferred.push({ kind, id, grounding: generation.grounding, note: generation.note });
  };
  for (const s of profile.surfaces) note("surface", s.id, s.generation);
  for (const c of profile.channels) note("channel", c.id, c.generation);
  for (const c of profile.controls) note("control", c.id, c.generation);
  for (const k of profile.keySets ?? []) note("key set", k.id, k.generation);
  for (const r of profile.rules) note("rule", r.id, r.generation);

  return {
    artifact: profile.artifact.name,
    episodes: episodes.length,
    surfaces,
    unnamed: [...unnamed].map(([key, count]) => ({ key, episodes: count })).sort((a, b) => b.episodes - a.episodes),
    controls,
    channels,
    unnamedText,
    rules,
    fallback: { id: profile.fallback.id, sub: profile.fallback.sub, claimed: fellThrough },
    dead,
    silent: rules.filter((r) => !r.claimed).map((r) => ({ id: r.id, sub: r.sub })),
    inferred,
  };
}

const bar = (n: number): string => (n ? `${n}` : "—");

export function renderFit(fit: Fit): string {
  const lines: string[] = [];
  lines.push(`${fit.artifact} · ${fit.episodes} episodes`);

  lines.push("", "surfaces");
  for (const s of fit.surfaces) lines.push(`  ${bar(s.matched).padStart(4)}  ${s.id.padEnd(16)} ${s.keys.length ? s.keys.join(", ") : "never matched"}`);
  for (const u of fit.unnamed) lines.push(`  ${String(u.episodes).padStart(4)}  ${"(unnamed)".padEnd(16)} ${u.key} — reads as itself, role "other"`);

  lines.push("", "controls                      acts  episodes  anchor");
  for (const c of fit.controls) {
    lines.push(`  ${c.id.padEnd(20)} ${bar(c.matched).padStart(8)} ${bar(c.episodes).padStart(9)}  rung ${c.rung}${c.positional ? " · positional" : ""}`);
  }

  lines.push("", "channels                      text  anchor");
  for (const c of fit.channels) lines.push(`  ${c.id.padEnd(20)} ${bar(c.matched).padStart(8)}  rung ${c.rung}${c.positional ? " · positional" : ""}`);
  lines.push(`  ${"(no channel)".padEnd(20)} ${bar(fit.unnamedText).padStart(8)}`);

  lines.push("", "rules                            read");
  for (const r of fit.rules) lines.push(`  ${String(r.priority).padStart(4)} ${r.id.padEnd(28)} ${bar(r.claimed).padStart(4)}  ${r.broad}`);
  lines.push(`  ${"  —".padStart(4)} ${`${fit.fallback.id} (fallback)`.padEnd(28)} ${bar(fit.fallback.claimed).padStart(4)}`);

  if (fit.dead.length) {
    lines.push("", "dead — nothing in this session matched them");
    for (const d of fit.dead) lines.push(`  ${d.kind} ${d.id} — ${d.label}`);
  }
  if (fit.silent.length) {
    lines.push("", "silent — never read a stretch");
    for (const s of fit.silent) lines.push(`  ${s.id} (${s.sub})`);
  }
  if (fit.inferred.length) {
    lines.push("", "not read off the artifact");
    for (const i of fit.inferred) lines.push(`  ${i.kind} ${i.id} — ${i.grounding}${i.note ? `: ${i.note}` : ""}`);
  }
  return lines.join("\n");
}
