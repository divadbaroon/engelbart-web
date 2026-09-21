// Run 2 evaluation machinery. Nothing here is part of the application.
import { readFileSync } from "node:fs";
import { frameIndex, traceRows, traceStages, type FrameInfo, type Stage } from "@/lib/trace/timeline";
import { toTraceEvent, targetOf, type TraceEventRow, type TraceEvent } from "@/lib/trace/types";
import { classify } from "@/lib/activity/classify";
import { appearances } from "@/lib/activity/segment";
import type { Taxonomy } from "@/lib/activity/taxonomy";
import type { Episode, SurfaceRole } from "@/lib/activity/types";
import { compileProfile, type CompiledProfile } from "@/lib/activity/profile/compile";

export const DIR = "/private/tmp/claude-501/-Users-divadbaroon-Desktop-engelbart-web/9513afc7-e24b-43db-8b54-e5cd74b27ae9/scratchpad/run2";
export const SESSIONS = [
  { id: "discovery", role: "DISCOVERY (in-sample)" },
  { id: "search", role: "HELD-OUT 1 (search-led)" },
  { id: "controls", role: "HELD-OUT 2 (controls + a long gap)" },
];

export type Loaded = { id: string; events: TraceEvent[]; frames: Map<string, FrameInfo>; stages: Stage[] };
export function load(id: string): Loaded {
  const raw = JSON.parse(readFileSync(`${DIR}/sessions/${id}.json`, "utf8")) as { events: TraceEventRow[] };
  const events = raw.events.map(toTraceEvent);
  const frames = frameIndex(events);
  return { id, events, frames, stages: traceStages(traceRows(events, [], frames)).primary };
}

export const read = (s: Loaded, c: CompiledProfile): Episode[] =>
  classify({ stages: s.stages, frames: s.frames, events: s.events, taxonomy: c.taxonomy, surfaceOf: c.surfaceOf, calls: new Map() });

export const compiled = (path: string): { profile: any; compiled: CompiledProfile } => {
  const profile = JSON.parse(readFileSync(path, "utf8"));
  return { profile, compiled: compileProfile(profile) };
};

export function interfaceReading(s: Loaded, taxonomy: Taxonomy) {
  const channels = appearances(s.events).map((a) => taxonomy.channels.find((c) => c.is(a))?.id ?? null);
  const controls: (string[] | null)[] = [];
  for (const e of s.events) {
    if (e.kind !== "ui.click" && e.kind !== "ui.submit") continue;
    const t = targetOf(e);
    controls.push(t ? taxonomy.controls.filter((c) => c.is(t)).map((c) => c.id) : null);
  }
  return { channels, controls };
}
export const clock = (e: Episode, t0: number) => Math.round((Date.parse(e.startedAt) - t0) / 1000);
