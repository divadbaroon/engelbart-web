// The real ROPE session, loaded the way the application loads it. Every
// test in this directory reads the same recording — 223 events and two
// model calls from run 87a7ceb0, with the network noise dropped and the
// model calls reduced to what the Activity layer is allowed to see — so
// that a change to segmentation or to the taxonomy is judged against a
// session somebody actually sat through rather than against a shape
// invented to make a rule pass.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { frameIndex, traceRows, traceStages, type FrameInfo, type Stage } from "../../lib/trace/timeline.ts";
import { toTraceEvent, toModelCall, type TraceEventRow, type ModelCallRow, type TraceEvent } from "../../lib/trace/types.ts";

const raw = JSON.parse(readFileSync(fileURLToPath(new URL("../fixtures/rope-session.json", import.meta.url)), "utf8")) as {
  runId: string;
  events: TraceEventRow[];
  calls: ModelCallRow[];
};

export const events: TraceEvent[] = raw.events.map(toTraceEvent);
export const calls = raw.calls.map(toModelCall);
export const frames: Map<string, FrameInfo> = frameIndex(events);
export const stages: Stage[] = traceStages(traceRows(events, calls, frames)).primary;
export const callInfo = new Map(calls.map((c) => [c.callId, { model: c.model, latencyMs: c.latencyMs }]));

const ms = (iso: string) => Date.parse(iso);
export const t0 = ms(stages[0].at);
// Seconds from the start of the session, for assertions a person can read.
export const at = (iso: string) => Math.round((ms(iso) - t0) / 1000);

// The same session with events added, for the cases the recording does
// not happen to contain. Everything goes back through the real pipeline,
// so a test built this way is still judged by the code the application
// runs rather than by a hand-written stage.
export const restage = (extra: TraceEventRow[]): { events: TraceEvent[]; frames: Map<string, FrameInfo>; stages: Stage[] } => {
  const rows = [...raw.events, ...extra].sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.seq - b.seq);
  const list = rows.map(toTraceEvent);
  const index = frameIndex(list);
  return { events: list, frames: index, stages: traceStages(traceRows(list, calls, index)).primary };
};

// A row from this session, copied and moved. Enough to put a second send
// in a stage that only had one, without inventing an event shape.
export const like = (pick: (e: TraceEventRow) => boolean, shift: number, over: Partial<TraceEventRow> = {}): TraceEventRow => {
  const source = raw.events.find(pick);
  if (!source) throw new Error("no such event in the recording");
  const at = new Date(Date.parse(source.at) + shift).toISOString();
  return { ...source, id: source.id + 900_000, seq: source.seq + 900_000, at, received_at: at, ...over };
};

// The keystroke that sent the first message, which is the one a stage is
// cut at.
export const isSend = (e: TraceEventRow): boolean =>
  e.kind === "ui.key" && (e.data as Record<string, unknown> | null)?.key === "Enter" && !!(e.data as Record<string, unknown> | null)?.editable;
