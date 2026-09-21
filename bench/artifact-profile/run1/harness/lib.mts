// Shared evaluation machinery. Nothing here is part of the application.
import { readFileSync } from "node:fs";
import { frameIndex, traceRows, traceStages, type FrameInfo, type Stage } from "@/lib/trace/timeline";
import { toTraceEvent, toModelCall, targetOf, type TraceEventRow, type ModelCallRow, type TraceEvent } from "@/lib/trace/types";
import { classify } from "@/lib/activity/classify";
import { ROPE_TAXONOMY, ropeSurface } from "@/lib/activity/rope";
import { appearances } from "@/lib/activity/segment";
import type { Taxonomy } from "@/lib/activity/taxonomy";
import type { Episode, SurfaceRole } from "@/lib/activity/types";
import { compileProfile, type CompiledProfile } from "@/lib/activity/profile/compile";

export const DIR = "/private/tmp/claude-501/-Users-divadbaroon-Desktop-engelbart-web/9513afc7-e24b-43db-8b54-e5cd74b27ae9/scratchpad/experiment";

export const SESSIONS = [
  { id: "87a7ceb0", role: "DISCOVERY (in-sample)" },
  { id: "0711358e", role: "HELD-OUT 1" },
  { id: "d41b33b2", role: "HELD-OUT 2" },
  { id: "3c9e1514", role: "HELD-OUT 3" },
];

export type Loaded = { id: string; events: TraceEvent[]; frames: Map<string, FrameInfo>; stages: Stage[]; calls: Map<string, { model: string | null; latencyMs: number | null }> };

export function load(id: string): Loaded {
  const raw = JSON.parse(readFileSync(`${DIR}/sessions/${id}.json`, "utf8")) as { events: TraceEventRow[]; calls: ModelCallRow[] };
  const events = raw.events.map(toTraceEvent);
  const calls = raw.calls.map(toModelCall);
  const frames = frameIndex(events);
  return { id, events, frames, stages: traceStages(traceRows(events, calls, frames)).primary, calls: new Map(calls.map((c) => [c.callId, { model: c.model, latencyMs: c.latencyMs }])) };
}

const run = (s: Loaded, taxonomy: Taxonomy, surfaceOf?: (k: string) => { label: string; role: SurfaceRole }): Episode[] =>
  classify({ stages: s.stages, frames: s.frames, events: s.events, taxonomy, surfaceOf, calls: s.calls });

export const handwritten = (s: Loaded): Episode[] => run(s, ROPE_TAXONOMY, ropeSurface);

// Tier B: the profile cuts the session itself, moment controls and all.
export const nativeGen = (s: Loaded, c: CompiledProfile): Episode[] => run(s, c.taxonomy, c.surfaceOf);

// Tier A: the same windows for both, so only the reading differs.
//
// Segmentation depends on the taxonomy through exactly one thing — which
// events count as a deed rather than a door (classify.ts:164-166). So the
// cut is forced by giving the generated taxonomy the handwritten
// taxonomy's moment controls under reserved ids, and taking moment-ness
// off its own. No generated rule can name a reserved id, so the reading
// is entirely the profile's; only the cut is shared.
export const SEG = "__seg__";
export function tierAGen(s: Loaded, c: CompiledProfile): Episode[] {
  const forced: Taxonomy = {
    ...c.taxonomy,
    controls: [
      ...c.taxonomy.controls.map((x) => ({ ...x, moment: false })),
      ...ROPE_TAXONOMY.controls.filter((x) => x.moment).map((x) => ({ ...x, id: `${SEG}${x.id}`, moment: true })),
    ],
  };
  return run(s, forced, c.surfaceOf);
}

export const compiled = (path: string): { profile: any; compiled: CompiledProfile } => {
  const profile = JSON.parse(readFileSync(path, "utf8"));
  return { profile, compiled: compileProfile(profile) };
};

// What each taxonomy made of the same raw material, for the interface
// metrics: which channel each text got, which controls each act matched,
// which document each stretch happened on.
export function interfaceReading(s: Loaded, taxonomy: Taxonomy, surfaceOf?: (k: string) => { label: string; role: SurfaceRole }) {
  const channels = appearances(s.events).map((a) => taxonomy.channels.find((c) => c.is(a))?.id ?? null);
  const controls: (string[] | null)[] = [];
  for (const e of s.events) {
    if (e.kind !== "ui.click" && e.kind !== "ui.submit") continue;
    const t = targetOf(e);
    if (!t) { controls.push(null); continue; }
    controls.push(taxonomy.controls.filter((c) => !c.id.startsWith(SEG) && c.is(t)).map((c) => c.id));
  }
  const surfaces = new Map<string, { label: string; role: SurfaceRole }>();
  for (const [, f] of s.frames) { const k = (f as { key?: string }).key; if (k) surfaces.set(k, (surfaceOf ?? ((x: string) => taxonomy.surfaces[x] ?? { label: x, role: "other" as const }))(k)); }
  return { channels, controls, surfaces };
}

export const clock = (e: Episode, t0: number) => Math.round((Date.parse(e.startedAt) - t0) / 1000);
export const overlap = (a: Episode, b: Episode) =>
  Math.max(0, Math.min(Date.parse(a.endedAt), Date.parse(b.endedAt)) - Math.max(Date.parse(a.startedAt), Date.parse(b.startedAt)));
