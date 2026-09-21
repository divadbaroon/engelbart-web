"use client";

import { useMemo } from "react";
import type { SandboxRun } from "@/lib/sandbox";
import { useTrace } from "@/hooks/use-trace";
import type { ModelCall, TraceEvent } from "@/lib/trace/types";
import { frameIndex, traceRows, traceStages, type CallRow, type FrameInfo, type Stage, type TraceRow } from "@/lib/trace/timeline";
import { scopeTrace, type Window } from "@/lib/trace/recording";
import { EMPTY_INDEX, type SemanticIndex } from "@/lib/semantics/lookup";
import { readSession } from "@/lib/activity/read";
import { BLIND_READING, type Reading } from "@/lib/activity/reading";
import type { Episode } from "@/lib/activity/types";

// A run's trace as the interface reads it, derived once and shared by
// everything that shows it: the Visualizer's canvas, the right rail's
// inspector and its live list. The events and calls come from the one
// subscription in `useTrace`; the rows, stages and frames are the
// existing derivations, nothing more.
export type TraceView = {
  run: SandboxRun | undefined;
  events: TraceEvent[];
  calls: Record<string, ModelCall>;
  error: string | null;
  loading: boolean;
  loadRaw: (call: ModelCall) => Promise<void>;
  rows: TraceRow[];
  stages: Stage[];
  diagnostics: TraceRow[];
  frames: Map<string, FrameInfo>;
  callRows: Map<string, CallRow>;
  // The reading of this application's interfaces the rows were named
  // with. Carried on the view so a slice of it is named the same way.
  semantics: SemanticIndex;
  // How this artifact was read: the vocabulary the episodes are named
  // in, and how a document's key becomes a place in it. Carried on the
  // view because everything that names an episode — the timeline's
  // heading, the export, the graph's verbs — has to say the same thing,
  // and a component reaching for a constant is how one artifact came to
  // be described in another's words. A slice of the run is read with it
  // too, so a recording is never named differently from the run it was
  // cut from.
  reading: Reading;
  // What the person was doing, over these stages. Derived here, once,
  // because five surfaces want it — the Activity timeline, the canvas,
  // the drawer's bar, the inspector's header and the line above Bart's
  // input — and a component that read the session for itself would be a
  // second reading of one run.
  episodes: Episode[];
};

export function useTraceView(run: SandboxRun | undefined, semantics: SemanticIndex = EMPTY_INDEX, reading: Reading = BLIND_READING): TraceView {
  const { events, calls, error, loading, loadRaw } = useTrace(run);
  const frames = useMemo(() => frameIndex(events), [events]);
  const rows = useMemo(() => traceRows(events, Object.values(calls), frames, semantics), [events, calls, frames, semantics]);
  const grouped = useMemo(() => traceStages(rows), [rows]);
  const callRows = useMemo(() => new Map(rows.filter((r): r is CallRow => r.kind === "call").map((r) => [r.id, r])), [rows]);
  const episodes = useEpisodes(grouped.primary, frames, events, calls, semantics, reading);
  return { run, events, calls, error, loading, loadRaw, rows, stages: grouped.primary, diagnostics: grouped.diagnostics, frames, callRows, semantics, reading, episodes };
}

// One reading of a set of stages, held still while they are.
function useEpisodes(stages: Stage[], frames: Map<string, FrameInfo>, events: TraceEvent[], calls: Record<string, ModelCall>, semantics: SemanticIndex, reading: Reading): Episode[] {
  const info = useMemo(() => new Map(Object.values(calls).map((c) => [c.callId, { model: c.model, latencyMs: c.latencyMs }])), [calls]);
  return useMemo(
    () => readSession({ stages, frames, events, calls: info, semantics, taxonomy: reading.taxonomy, surfaceOf: reading.surfaceOf }),
    [stages, frames, events, info, semantics, reading],
  );
}

// The same view cut to a window: a recording's slice of the run, derived
// from the full view's events and calls with the same functions, so the
// canvas, the drawer and Bart read a recording exactly as they read the
// run. Frames keep the full run's index, so names given before the slice
// hold. Without a window, the view itself.
export function useScopedTraceView(view: TraceView, window: Window | null): TraceView {
  const start = window?.start ?? null, end = window?.end ?? null;
  const scoped = useMemo(() => (start ? scopeTrace(view.events, Object.values(view.calls), { start, end }) : null), [view.events, view.calls, start, end]);
  const rows = useMemo(() => (scoped ? traceRows(scoped.events, scoped.calls, view.frames, view.semantics) : []), [scoped, view.frames, view.semantics]);
  const grouped = useMemo(() => traceStages(rows), [rows]);
  const callRows = useMemo(() => new Map(rows.filter((r): r is CallRow => r.kind === "call").map((r) => [r.id, r])), [rows]);
  const calls = useMemo(() => (scoped ? Object.fromEntries(scoped.calls.map((c) => [c.callId, c])) : {}), [scoped]);
  // A recording is read as a session of its own, from its own slice of
  // the events, by the same function: what somebody was doing inside a
  // recording is read the way it is read across the run.
  const episodes = useEpisodes(grouped.primary, view.frames, scoped?.events ?? [], calls, view.semantics, view.reading);
  if (!scoped) return view;
  return { ...view, events: scoped.events, calls, rows, stages: grouped.primary, diagnostics: grouped.diagnostics, callRows, episodes };
}
