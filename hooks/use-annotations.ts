"use client";

import { useCallback, useEffect, useState } from "react";
import type { Repo } from "@/lib/repos";
import type { SandboxRun } from "@/lib/sandbox";
import type { Annotation } from "@/lib/annotations/model";
import { createAnnotation, deleteAnnotation, editAnnotation, listAnnotations } from "@/app/workspace/[workspaceId]/annotation-actions";

// The notes written on this repository's interface. They belong to the
// repository, not to the run that is up, so the list is loaded when the
// repository is opened and survives the run being stopped and started
// again. `viewerId` is who is reading: everyone in the project sees every
// note, and only its author can change or delete one.
export type NewNote = {
  body: string;
  anchor: unknown;                 // from the page; the server rebuilds it
  recordingId?: string | null;     // the recording open as it was written, if any
  stageId?: string | null;
  callId?: string | null;
};

export type Annotations = {
  list: Annotation[];
  focus: { id: string; key: number } | null;   // one to take the person to, from a list or an answer
  focusOn: (id: string) => void;
  viewerId: string | null;
  loaded: boolean;
  busy: boolean;
  error: string | null;
  dismissError: () => void;
  add: (note: NewNote) => Promise<Annotation | null>;
  edit: (id: string, body: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

export function useAnnotations(repo: Repo | undefined, run: SandboxRun | undefined): Annotations {
  const repoId = repo?.id;
  const runId = run?.id;
  const [list, setList] = useState<Annotation[]>([]);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string; key: number } | null>(null);

  useEffect(() => {
    setList([]); setLoaded(false); setError(null); setFocus(null);
    if (!repoId) { setLoaded(true); return; }
    let stale = false;
    listAnnotations(repoId).then((r) => {
      if (stale) return;
      if (r.ok) { setList(r.annotations); setViewerId(r.viewerId); } else setError(r.error);
      setLoaded(true);
    });
    return () => { stale = true; };
  }, [repoId]);

  const put = useCallback((a: Annotation) => setList((all) => (all.some((x) => x.id === a.id) ? all.map((x) => (x.id === a.id ? a : x)) : [...all, a])), []);

  // No optimistic row: a note has no marker until the server has given it
  // an id, and that id is what Bart is later asked about.
  const add = useCallback(async (note: NewNote) => {
    if (!repoId || busy) return null;
    setBusy(true); setError(null);
    const r = await createAnnotation({ repoId, runId: runId ?? null, recordingId: note.recordingId ?? null, body: note.body, anchor: note.anchor, stageId: note.stageId ?? null, callId: note.callId ?? null });
    setBusy(false);
    if (!r.ok) { setError(r.error); return null; }
    put(r.annotation);
    return r.annotation;
  }, [repoId, runId, busy, put]);

  const edit = useCallback(async (id: string, body: string) => {
    const before = list.find((a) => a.id === id);
    if (!before || before.body === body.trim()) return;
    put({ ...before, body: body.trim() });
    const r = await editAnnotation(id, body);
    if (r.ok) { put(r.annotation); setError(null); } else { put(before); setError(r.error); }
  }, [list, put]);

  const remove = useCallback(async (id: string) => {
    const before = list;
    setList((all) => all.filter((a) => a.id !== id));
    const r = await deleteAnnotation(id);
    if (r.ok) setError(null); else { setList(before); setError(r.error); }
  }, [list]);

  return {
    list, viewerId, loaded, busy, error, dismissError: () => setError(null), add, edit, remove,
    focus, focusOn: useCallback((id: string) => setFocus((f) => ({ id, key: (f?.key ?? 0) + 1 })), []),
  };
}
