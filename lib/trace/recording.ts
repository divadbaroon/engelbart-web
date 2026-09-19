// A recording: a named slice of a run's trace between two clock
// readings. Nothing is copied; opening one reads the run's events and
// calls that fall inside. A call belongs to a recording by when it
// started, and comes whole even if it finished after the stop; an event
// that happened after the stop does not. Pure: no DOM, no network.
import type { ModelCall, TraceEvent } from "@/lib/trace/types";
import { traceRows, traceStages, type FrameInfo } from "@/lib/trace/timeline";

export type RecordingStatus = "recording" | "complete";
export type Recording = { id: string; runId: string; projectId: string; name: string; status: RecordingStatus; startedAt: string; stoppedAt: string | null; createdAt: string };
export type RecordingRow = { id: string; run_id: string; project_id: string; name: string; status: RecordingStatus; started_at: string; stopped_at: string | null; created_at: string };
export const RECORDING_COLUMNS = "id, run_id, project_id, name, status, started_at, stopped_at, created_at";
export const toRecording = (r: RecordingRow): Recording => ({ id: r.id, runId: r.run_id, projectId: r.project_id, name: r.name, status: r.status, startedAt: r.started_at, stoppedAt: r.stopped_at, createdAt: r.created_at });
export const defaultName = (n: number) => `Recording ${n}`;

// Where the Trace tab is: the whole run, the list of recordings, one
// recording open on the same canvas, or the notes written on this
// repository's interface.
export type TraceNav = { kind: "full" } | { kind: "list" } | { kind: "recording"; id: string } | { kind: "annotations" } | { kind: "interface" };

// ---- the window
export type Window = { start: string; end: string | null };   // end null: still recording
export const windowOf = (rec: Recording): Window => ({ start: rec.startedAt, end: rec.stoppedAt });

export function inWindow(at: string, w: Window): boolean {
  const t = Date.parse(at);
  if (Number.isNaN(t)) return false;
  return t >= Date.parse(w.start) && (w.end === null || t <= Date.parse(w.end));
}

// Where a cleared canvas starts. Clearing hides what came before and
// deletes nothing, so a clear is a window like a recording's, open at
// the end — the same machinery, not a second way of cutting the canvas
// down.
//
// The mark is taken from the trace's own clock. Events carry the
// sandbox's clock (TraceEvent.at) and the browser's is a different one,
// so a reading taken here cuts where the person is actually looking. It
// is the latest reading rather than the last row's, because rows are
// ordered by the sequence they were collected in and a clock is not
// obliged to agree. A window includes its start, so the mark is a
// millisecond on: the last moment stays behind the clear instead of
// being left alone on a canvas asked to be fresh.
//
// Nothing recorded is nothing to hide, and the answer is null: a clear
// with no trace behind it would hide the run that follows.
export function clearMark(events: TraceEvent[]): string | null {
  let latest = Number.NEGATIVE_INFINITY;
  for (const e of events) {
    const t = Date.parse(e.at);
    if (!Number.isNaN(t) && t > latest) latest = t;
  }
  return latest === Number.NEGATIVE_INFINITY ? null : new Date(latest + 1).toISOString();
}

export type Scoped = { events: TraceEvent[]; calls: ModelCall[] };

// The run's rows that belong to the window. A call is in by when it
// started, and every event that carries its id follows it; every other
// event is in by its own time.
export function scopeTrace(events: TraceEvent[], calls: ModelCall[], w: Window): Scoped {
  const included = new Set<string>();
  const excluded = new Set<string>();
  for (const c of calls) (inWindow(c.startedAt, w) ? included : excluded).add(c.callId);
  for (const e of events) {
    if (e.kind !== "model.request" || !e.callId || included.has(e.callId) || excluded.has(e.callId)) continue;
    (inWindow(e.at, w) ? included : excluded).add(e.callId);
  }
  return {
    events: events.filter((e) => (e.callId ? included.has(e.callId) : inWindow(e.at, w))),
    calls: calls.filter((c) => included.has(c.callId)),
  };
}

// ---- what a recording holds, counted from the rows inside it
export type RecordingStats = { durationMs: number; moments: number; calls: number };

export function recordingStats(events: TraceEvent[], calls: ModelCall[], rec: Recording, frames?: Map<string, FrameInfo>, now = Date.now()): RecordingStats {
  const scoped = scopeTrace(events, calls, windowOf(rec));
  const rows = traceRows(scoped.events, scoped.calls, frames);
  const end = rec.stoppedAt ? Date.parse(rec.stoppedAt) : now;
  return { durationMs: Math.max(0, end - Date.parse(rec.startedAt)), moments: traceStages(rows).primary.length, calls: rows.filter((r) => r.kind === "call").length };
}

export const statsLine = (s: RecordingStats) => `${formatDuration(s.durationMs)} · ${s.moments} moment${s.moments === 1 ? "" : "s"} · ${s.calls} model call${s.calls === 1 ? "" : "s"}`;

// "2m 14s", "48s", "1h 2m 3s"
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  if (h) return `${h}h ${m}m ${s}s`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

// "00:42", "1:02:03": the clock on the Record button
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const mm = String(m).padStart(2, "0"), ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// "Sep 19, 1:24 AM", in the viewer's clock
export const formatWhen = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
