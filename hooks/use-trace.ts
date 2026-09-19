"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isRunActive, type SandboxRun } from "@/lib/sandbox";
import { MODEL_CALL_COLUMNS, TRACE_EVENT_COLUMNS, toModelCall, toTraceEvent, type ModelCall, type ModelCallRow, type TraceEvent, type TraceEventRow } from "@/lib/trace/types";
import { getModelCall, getTrace } from "@/app/workspace/[workspaceId]/trace-actions";

// A run's behavior trace, live. The timeline arrives over Realtime (with a
// poll as the fallback, as the run's own events do); a model call's row
// is fetched when the timeline announces it, and its raw bodies only when
// the person asks for them.
export function useTrace(run: SandboxRun | undefined) {
  const runId = run?.id;
  const live = !!run && (isRunActive(run) || run.status === "running" || run.status === "usable");
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [calls, setCalls] = useState<Record<string, ModelCall>>({});   // by call id
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const lastSeq = useRef(-1);

  const mergeEvents = useCallback((incoming: TraceEvent[]) => {
    if (!incoming.length) return;
    setEvents((all) => {
      const seen = new Set(all.map((e) => e.seq));
      const fresh = incoming.filter((e) => !seen.has(e.seq));
      if (!fresh.length) return all;
      return [...all, ...fresh].sort((a, b) => a.seq - b.seq);
    });
    lastSeq.current = Math.max(lastSeq.current, ...incoming.map((e) => e.seq));
  }, []);

  const mergeCalls = useCallback((incoming: ModelCall[]) => {
    if (!incoming.length) return;
    setCalls((all) => {
      const next = { ...all };
      for (const c of incoming) {
        const had = next[c.callId];
        // Keep raw bodies already fetched when a later, lighter copy arrives.
        next[c.callId] = had?.rawRequest || had?.rawResponse ? { ...c, rawRequest: c.rawRequest ?? had.rawRequest, rawResponse: c.rawResponse ?? had.rawResponse } : c;
      }
      return next;
    });
  }, []);

  // One call's row, by call id, from the browser.
  const fetchCall = useCallback(async (callId: string) => {
    if (!runId) return;
    const supabase = createClient();
    const { data } = await supabase.from("engelbart_model_calls").select(MODEL_CALL_COLUMNS).eq("run_id", runId).eq("call_id", callId).maybeSingle();
    if (data) mergeCalls([toModelCall(data as ModelCallRow)]);
  }, [runId, mergeCalls]);

  // Everything so far, once per run.
  useEffect(() => {
    setEvents([]); setCalls({}); setError(null); lastSeq.current = -1;
    if (!runId) return;
    let cancelled = false;
    setLoading(true);
    getTrace(runId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) { setError(result.error); return; }
      mergeEvents(result.events);
      mergeCalls(result.calls);
    });
    return () => { cancelled = true; };
  }, [runId, mergeEvents, mergeCalls]);

  // Live: new timeline rows over Realtime, a call's row when one is
  // announced, and a poll behind both while the run is up.
  useEffect(() => {
    if (!runId || !live) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`trace-${runId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "engelbart_trace_events", filter: `run_id=eq.${runId}` }, (payload) => {
        const e = toTraceEvent(payload.new as TraceEventRow);
        mergeEvents([e]);
        if (e.callId && e.kind.startsWith("model.")) void fetchCall(e.callId);
      })
      .subscribe((status, err) => { console.log(`[trace-ui] realtime ${status} for run ${runId}${err ? `: ${err.message}` : ""}`); });
    let polling = false;
    const timer = setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        const [eventsRes, callsRes] = await Promise.all([
          supabase.from("engelbart_trace_events").select(TRACE_EVENT_COLUMNS).eq("run_id", runId).gt("seq", lastSeq.current).order("seq"),
          supabase.from("engelbart_model_calls").select(MODEL_CALL_COLUMNS).eq("run_id", runId).order("started_at"),
        ]);
        if (eventsRes.data) mergeEvents((eventsRes.data as TraceEventRow[]).map(toTraceEvent));
        if (callsRes.data) mergeCalls((callsRes.data as ModelCallRow[]).map(toModelCall));
      } finally { polling = false; }
    }, 3000);
    return () => { clearInterval(timer); supabase.removeChannel(channel); };
  }, [runId, live, mergeEvents, mergeCalls, fetchCall]);

  // The raw bodies of one call, on request.
  const loadRaw = useCallback(async (call: ModelCall) => {
    const result = await getModelCall(call.id, true);
    if (!result.ok) { setError(result.error); return; }
    mergeCalls([result.call]);
  }, [mergeCalls]);

  return { events, calls, error, loading, loadRaw };
}
