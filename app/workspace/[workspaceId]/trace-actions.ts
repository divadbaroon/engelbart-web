"use server";

import { createClient } from "@/lib/supabase/server";
import {
  MODEL_CALL_COLUMNS, MODEL_CALL_RAW_COLUMNS, TRACE_EVENT_COLUMNS, toModelCall, toTraceEvent,
  type ModelCall, type ModelCallRow, type TraceEvent, type TraceEventRow,
} from "@/lib/trace/types";

// A run's behavior trace, read as the signed-in person: the timeline and
// every model call without its raw bodies. Raw bodies come separately,
// for one call at a time, when the person opens them.
export type TraceSnapshot = { ok: true; events: TraceEvent[]; calls: ModelCall[] } | { ok: false; error: string };

export async function getTrace(runId: string): Promise<TraceSnapshot> {
  const supabase = await createClient();
  const [events, calls] = await Promise.all([
    supabase.from("engelbart_trace_events").select(TRACE_EVENT_COLUMNS).eq("run_id", runId).order("seq"),
    supabase.from("engelbart_model_calls").select(MODEL_CALL_COLUMNS).eq("run_id", runId).order("started_at"),
  ]);
  if (events.error) return { ok: false, error: describe(events.error.message) };
  if (calls.error) return { ok: false, error: describe(calls.error.message) };
  return { ok: true, events: (events.data as TraceEventRow[]).map(toTraceEvent), calls: (calls.data as ModelCallRow[]).map(toModelCall) };
}

export async function getModelCall(id: string, raw: boolean): Promise<{ ok: true; call: ModelCall } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("engelbart_model_calls").select(raw ? MODEL_CALL_RAW_COLUMNS : MODEL_CALL_COLUMNS).eq("id", id).maybeSingle();
  if (error) return { ok: false, error: describe(error.message) };
  if (!data) return { ok: false, error: "That model call is no longer there." };
  return { ok: true, call: toModelCall(data as unknown as ModelCallRow) };
}

// The trace tables not existing yet is the likeliest failure while the
// feature is new; say so in words.
const describe = (message: string) =>
  /relation .* does not exist|schema cache/i.test(message) ? "The trace tables are not in the database yet: apply the behavior_trace migration." : message;
