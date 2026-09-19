"use client";

import { useMemo } from "react";
import type { SandboxRun } from "@/lib/sandbox";
import { useTrace } from "@/hooks/use-trace";
import type { ModelCall, TraceEvent } from "@/lib/trace/types";
import { frameIndex, traceRows, traceStages, type CallRow, type FrameInfo, type Stage, type TraceRow } from "@/lib/trace/timeline";
import { scopeTrace, type Window } from "@/lib/trace/recording";

// A run's trace as the interface reads it, derived once and shared by
// everything that shows it: the Trace tab's canvas, the right rail's
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
};

export function useTraceView(run: SandboxRun | undefined): TraceView {
  const { events, calls, error, loading, loadRaw } = useTrace(run);
  const rows = useMemo(() => traceRows(events, Object.values(calls)), [events, calls]);
  const grouped = useMemo(() => traceStages(rows), [rows]);
  const frames = useMemo(() => frameIndex(events), [events]);
  const callRows = useMemo(() => new Map(rows.filter((r): r is CallRow => r.kind === "call").map((r) => [r.id, r])), [rows]);
  return { run, events, calls, error, loading, loadRaw, rows, stages: grouped.primary, diagnostics: grouped.diagnostics, frames, callRows };
}

// The same view cut to a window: a recording's slice of the run, derived
// from the full view's events and calls with the same functions, so the
// canvas, the drawer and Bart read a recording exactly as they read the
// run. Frames keep the full run's index, so names given before the slice
// hold. Without a window, the view itself.
export function useScopedTraceView(view: TraceView, window: Window | null): TraceView {
  const start = window?.start ?? null, end = window?.end ?? null;
  const scoped = useMemo(() => (start ? scopeTrace(view.events, Object.values(view.calls), { start, end }) : null), [view.events, view.calls, start, end]);
  const rows = useMemo(() => (scoped ? traceRows(scoped.events, scoped.calls, view.frames) : []), [scoped, view.frames]);
  const grouped = useMemo(() => traceStages(rows), [rows]);
  const callRows = useMemo(() => new Map(rows.filter((r): r is CallRow => r.kind === "call").map((r) => [r.id, r])), [rows]);
  const calls = useMemo(() => (scoped ? Object.fromEntries(scoped.calls.map((c) => [c.callId, c])) : {}), [scoped]);
  if (!scoped) return view;
  return { ...view, events: scoped.events, calls, rows, stages: grouped.primary, diagnostics: grouped.diagnostics, callRows };
}
