"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  EVENT_COLUMNS, RUN_COLUMNS, isLaterStatus, isRunActive, mergeEvents, statusFromEvents, toEvent, toRun,
  type EventRow, type RunRow, type SandboxEvent, type SandboxRun,
} from "@/lib/sandbox";
import { getRun, requeueRun, startRun, stopRun } from "@/app/workspace/[workspaceId]/sandbox-actions";

// The latest run per repository and the events of the runs on screen. The
// browser only queues runs; the worker process does the work and everything
// it records arrives here over Realtime, with a poll as the fallback.
export function useSandboxRuns(initial: Record<string, SandboxRun>) {
  const [runs, setRuns] = useState(initial);
  const [events, setEvents] = useState<Record<string, SandboxEvent[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const loaded = useRef(new Set<string>());

  const applySnapshot = useCallback((run: SandboxRun, incoming: SandboxEvent[]) => {
    setRuns((all) => ({ ...all, [run.repoId]: run }));
    setEvents((all) => ({ ...all, [run.id]: mergeEvents(all[run.id] ?? [], incoming) }));
  }, []);

  // New events for a run. Status events also advance the run itself, so the
  // page does not depend on the run row's own update reaching it.
  const addEvents = useCallback((run: SandboxRun, incoming: SandboxEvent[]) => {
    setEvents((all) => ({ ...all, [run.id]: mergeEvents(all[run.id] ?? [], incoming) }));
    const advanced = statusFromEvents(incoming);
    if (advanced?.status) {
      setRuns((all) => {
        const current = all[run.repoId] ?? run;
        return isLaterStatus(advanced.status!, current.status) ? { ...all, [run.repoId]: { ...current, ...advanced } } : all;
      });
    }
  }, []);

  // Realtime hands over one row at a time, up to several a second while a
  // build runs. Rows arriving within a short window become one state update,
  // so the page renders once per burst rather than once per line.
  const pending = useRef(new Map<string, { run: SandboxRun; incoming: SandboxEvent[] }>());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushEvents = useCallback(() => {
    flushTimer.current = null;
    const batches = [...pending.current.values()];
    pending.current.clear();
    for (const b of batches) addEvents(b.run, b.incoming);
  }, [addEvents]);
  const queueEvents = useCallback((run: SandboxRun, incoming: SandboxEvent[]) => {
    const batch = pending.current.get(run.id);
    if (batch) batch.incoming.push(...incoming);
    else pending.current.set(run.id, { run, incoming: [...incoming] });
    flushTimer.current ??= setTimeout(flushEvents, 100);
  }, [flushEvents]);
  useEffect(() => () => { if (flushTimer.current) clearTimeout(flushTimer.current); }, []);

  // Fetch a run's events once, for runs that were already on the row when the page loaded.
  const load = useCallback(async (runId: string) => {
    if (loaded.current.has(runId)) return;
    loaded.current.add(runId);
    const result = await getRun(runId);
    if ("error" in result) return;
    applySnapshot(result.run, result.events);
  }, [applySnapshot]);

  const clearError = (repoId: string) => setErrors((e) => Object.fromEntries(Object.entries(e).filter(([id]) => id !== repoId)));

  // Ask for a cloned run's application to be brought up.
  const launch = useCallback(async (runId: string, repoId: string) => {
    clearError(repoId);
    const queued = await requeueRun(runId);
    if ("error" in queued) { setErrors((e) => ({ ...e, [repoId]: queued.error })); return; }
    applySnapshot(queued.run, queued.events);
  }, [applySnapshot]);

  // Queue a fresh run: clone into a new sandbox and launch.
  const prepare = useCallback(async (repoId: string, options: { fresh?: boolean } = {}) => {
    if (isRunActive(runs[repoId])) return;
    clearError(repoId);
    const started = await startRun(repoId, options);
    if (!started.ok) { setErrors((e) => ({ ...e, [repoId]: started.error })); return; }
    loaded.current.add(started.run.id);
    applySnapshot(started.run, []);
  }, [runs, applySnapshot]);

  const stop = useCallback(async (runId: string, repoId: string) => {
    clearError(repoId);
    const finished = await stopRun(runId);
    if ("error" in finished) { setErrors((e) => ({ ...e, [repoId]: finished.error })); return; }
    applySnapshot(finished.run, finished.events);
  }, [applySnapshot]);

  // Live feed for whichever runs are active or running: new event rows and
  // status updates over Realtime, plus a poll as the fallback. Realtime can
  // take seconds to warm up on a quiet project, and the poll is what keeps
  // the terminal moving until it does. Both paths merge by seq, so receiving
  // the same row twice is harmless. Running apps are watched too, more
  // slowly, so the page learns when one stops.
  const watched = Object.values(runs).filter((r) => isRunActive(r) || r.status === "running" || r.status === "usable");
  const activeIds = watched.map((r) => r.id).sort().join(",");
  const pollMs = watched.some(isRunActive) ? 1500 : 10000;
  useEffect(() => {
    if (!activeIds) return;
    const ids = activeIds.split(",");
    const active = Object.values(runs).filter((r) => ids.includes(r.id));
    const supabase = createClient();
    const channels = active.map((run) =>
      supabase
        .channel(`sandbox-run-${run.id}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "engelbart_sandbox_events", filter: `run_id=eq.${run.id}` }, (payload) => {
          queueEvents(run, [toEvent(payload.new as EventRow)]);
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "engelbart_sandbox_runs", filter: `id=eq.${run.id}` }, (payload) => {
          const updated = toRun(payload.new as RunRow);
          setRuns((all) => ({ ...all, [updated.repoId]: updated }));
        })
        .subscribe((status, err) => {
          console.log(`[sandbox] realtime ${status} for run ${run.id}${err ? `: ${err.message}` : ""}`);
        }),
    );
    // The poll reads the database from the browser rather than through a
    // server action: Next runs a client's actions one at a time, so an
    // action-based poll would wait behind the clone it is meant to watch.
    let polling = false;
    const lastSeq: Record<string, number> = {};
    const timer = setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        await Promise.all(active.map(async (run) => {
          const [runRes, eventsRes] = await Promise.all([
            supabase.from("engelbart_sandbox_runs").select(RUN_COLUMNS).eq("id", run.id).maybeSingle(),
            supabase.from("engelbart_sandbox_events").select(EVENT_COLUMNS).eq("run_id", run.id).gt("seq", lastSeq[run.id] ?? -1).order("seq"),
          ]);
          const fresh = (eventsRes.data as EventRow[] | null)?.map(toEvent) ?? [];
          if (fresh.length) { lastSeq[run.id] = fresh[fresh.length - 1].seq; addEvents(run, fresh); }
          if (runRes.data) { const updated = toRun(runRes.data as RunRow); setRuns((all) => ({ ...all, [updated.repoId]: updated })); }
        }));
      } finally {
        polling = false;
      }
    }, pollMs);
    return () => { clearInterval(timer); channels.forEach((c) => supabase.removeChannel(c)); };
  }, [activeIds, pollMs]); // eslint-disable-line react-hooks/exhaustive-deps

  return { runs, events, errors, prepare, launch, stop, load };
}
