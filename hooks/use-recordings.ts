"use client";

import { useCallback, useEffect, useState } from "react";
import type { SandboxRun } from "@/lib/sandbox";
import type { Recording, RecordingOnRun } from "@/lib/trace/recording";
import { deleteRecording, listEarlierRecordings, listRecordings, renameRecording, startRecording, stopRecording } from "@/app/workspace/[workspaceId]/recording-actions";

// The recordings of the run in the middle: loaded when the run appears,
// so an open recording is found again after a reload rather than started
// twice; changed here as the person records, stops, renames and deletes.
export type Recordings = {
  list: Recording[];
  // The same repository's recordings from its earlier runs. Never merged
  // into `list`: they are windows over a different run's trace and can
  // only be read by going to that run. They are here so that a relaunch
  // stops looking like a loss.
  earlier: RecordingOnRun[];
  active: Recording | null;          // the one open on the run, if any
  loaded: boolean;
  busy: boolean;
  error: string | null;              // the last failure, load or mutation; the list itself survives one
  dismissError: () => void;
  lastStopped: Recording | null;     // for the "Recording saved" line, until dismissed
  dismissStopped: () => void;
  start: () => Promise<Recording | null>;
  // Stopping may carry a replay: the object the browser uploaded while the
  // recording was open. Without one the recording is saved as recordings
  // have always been saved.
  stop: (replayPath?: string | null) => Promise<Recording | null>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

export function useRecordings(run: SandboxRun | undefined): Recordings {
  const runId = run?.id;
  const traced = !!run && run.trace !== "off";
  const [list, setList] = useState<Recording[]>([]);
  const [earlier, setEarlier] = useState<RecordingOnRun[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastStopped, setLastStopped] = useState<Recording | null>(null);

  useEffect(() => {
    setList([]); setEarlier([]); setLoaded(false); setError(null); setLastStopped(null);
    if (!runId || !traced) { setLoaded(true); return; }
    let stale = false;
    listRecordings(runId).then((r) => {
      if (stale) return;
      if (r.ok) setList(r.recordings); else setError(r.error);
      setLoaded(true);
    });
    // Separately, and allowed to be slower: the list is usable without
    // it, and it must never be the reason the list shows an error.
    listEarlierRecordings(runId).then((e) => { if (!stale) setEarlier(e); }).catch(() => {});
    return () => { stale = true; };
  }, [runId, traced]);

  const put = useCallback((rec: Recording) => setList((all) => (all.some((r) => r.id === rec.id) ? all.map((r) => (r.id === rec.id ? rec : r)) : [...all, rec])), []);
  const active = list.find((r) => r.status === "recording") ?? null;

  const start = useCallback(async () => {
    if (!runId || busy) return null;
    if (active) return active;
    setBusy(true); setError(null); setLastStopped(null);
    const r = await startRecording(runId);
    setBusy(false);
    if (!r.ok) { setError(r.error); return null; }
    put(r.recording);
    return r.recording;
  }, [runId, busy, active, put]);

  const stop = useCallback(async (replayPath: string | null = null) => {
    if (!active || busy) return null;
    setBusy(true); setError(null);
    const r = await stopRecording(active.id, replayPath);
    setBusy(false);
    if (!r.ok) { setError(r.error); return null; }
    put(r.recording);
    setLastStopped(r.recording);
    return r.recording;
  }, [active, busy, put]);

  const rename = useCallback(async (id: string, name: string) => {
    const before = list.find((r) => r.id === id);
    if (!before || before.name === name.trim()) return;
    put({ ...before, name: name.trim() });
    const r = await renameRecording(id, name);
    if (r.ok) { put(r.recording); setError(null); } else { put(before); setError(r.error); }
  }, [list, put]);

  const remove = useCallback(async (id: string) => {
    const before = list;
    setList((all) => all.filter((r) => r.id !== id));
    setLastStopped((s) => (s?.id === id ? null : s));
    const r = await deleteRecording(id);
    if (r.ok) setError(null); else { setList(before); setError(r.error); }
  }, [list]);

  return { list, earlier, active, loaded, busy, error, dismissError: () => setError(null), lastStopped, dismissStopped: () => setLastStopped(null), start, stop, rename, remove };
}
