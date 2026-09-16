"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  EVENT_COLUMNS, RUN_COLUMNS, isLaterStatus, isRunActive, mergeEvents, statusFromEvents, toEvent, toRun,
  type EventRow, type RunRow, type SandboxEvent, type SandboxRun,
} from "@/lib/sandbox";
import { executeRun, getRun, launchRun, startRun, stopRun } from "@/app/workspace/[workspaceId]/sandbox-actions";

// The latest run per repository and the events of the runs on screen.
// Events arrive live over Realtime while a run is active, and the run's
// final state is read back when the work finishes, so the terminal is right
// even if the live feed dropped.
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

  // Fetch a run's events once, for runs that were already on the row when the page loaded.
  const load = useCallback(async (runId: string) => {
    if (loaded.current.has(runId)) return;
    loaded.current.add(runId);
    const result = await getRun(runId);
    if ("error" in result) return;
    applySnapshot(result.run, result.events);
  }, [applySnapshot]);

  const clearError = (repoId: string) => setErrors((e) => Object.fromEntries(Object.entries(e).filter(([id]) => id !== repoId)));

  // Bring the application up in a cloned run's sandbox.
  const launch = useCallback(async (runId: string, repoId: string) => {
    clearError(repoId);
    const finished = await launchRun(runId);
    if ("error" in finished) { setErrors((e) => ({ ...e, [repoId]: finished.error })); return; }
    applySnapshot(finished.run, finished.events);
  }, [applySnapshot]);

  // Clone into a fresh sandbox and launch, all in one server action.
  const prepare = useCallback(async (repoId: string) => {
    if (isRunActive(runs[repoId])) return;
    clearError(repoId);
    const started = await startRun(repoId);
    if (!started.ok) { setErrors((e) => ({ ...e, [repoId]: started.error })); return; }
    loaded.current.add(started.run.id);
    applySnapshot(started.run, []);
    const finished = await executeRun(started.run.id);
    if ("error" in finished) { setErrors((e) => ({ ...e, [repoId]: finished.error })); return; }
    applySnapshot(finished.run, finished.events);
  }, [runs, applySnapshot]);

  const stop = useCallback(async (runId: string, repoId: string) => {
    clearError(repoId);
    const finished = await stopRun(runId);
    if ("error" in finished) { setErrors((e) => ({ ...e, [repoId]: finished.error })); return; }
    applySnapshot(finished.run, finished.events);
  }, [applySnapshot]);

  // Live feed for whichever runs are active: new event rows and status
  // updates over Realtime, plus a poll every 1.5 s as the fallback. Realtime
  // can take seconds to warm up on a quiet project, and the poll is what
  // keeps the terminal moving until it does. Both paths merge by seq, so
  // receiving the same row twice is harmless.
  const activeIds = Object.values(runs).filter(isRunActive).map((r) => r.id).sort().join(",");
  useEffect(() => {
    if (!activeIds) return;
    const ids = activeIds.split(",");
    const active = Object.values(runs).filter((r) => ids.includes(r.id));
    const supabase = createClient();
    const channels = active.map((run) =>
      supabase
        .channel(`sandbox-run-${run.id}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "engelbart_sandbox_events", filter: `run_id=eq.${run.id}` }, (payload) => {
          addEvents(run, [toEvent(payload.new as EventRow)]);
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
    }, 1500);
    return () => { clearInterval(timer); channels.forEach((c) => supabase.removeChannel(c)); };
  }, [activeIds]); // eslint-disable-line react-hooks/exhaustive-deps

  return { runs, events, errors, prepare, launch, stop, load };
}
