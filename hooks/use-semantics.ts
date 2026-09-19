"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Repo } from "@/lib/repos";
import type { SandboxRun } from "@/lib/sandbox";
import { readFrame } from "@/lib/annotations/target";
import { buildIndex, EMPTY_INDEX, framePath, type SemanticIndex } from "@/lib/semantics/lookup";
import { mapsOf, type StoredSemantics } from "@/lib/semantics/model";
import { ensureSemantics, listSemantics } from "@/app/workspace/[workspaceId]/semantics-actions";

// What has been read about this repository's interfaces, and the asking
// of it. Readings belong to the repository rather than to the run that is
// up: a document that was read yesterday is the same document today, and
// that is the whole point of the cache.
//
// Nothing here is on anybody's path. A document offers what it holds when
// the preview is ready; if that interface has been read before the answer
// comes from the database, and if it has not, one small model call is
// made in the background. Neither blocks the trace, the picker or the
// page, and a failure leaves the workspace exactly as it was without a
// reading — every label in the trace falls back to what the page said.
export type Reading = {
  key: string;                 // which document was asked about: its frame path and route
  where: string;               // "the page", or the frame path
  route: string | null;
  candidates: number;          // how many parts the document offered
  state: "reading" | "read" | "failed";
  hit: boolean | null;         // it was cached
  reason: string | null;       // and why: read already, or what changed
  signature: string | null;
  error: string | null;
};

export type Semantics = {
  index: SemanticIndex;
  readings: StoredSemantics[];   // everything cached for this repository
  asked: Reading[];              // what this session asked about, in order
  loaded: boolean;
  busy: boolean;
  error: string | null;
  offer: (survey: unknown) => void;     // a document said what it holds
  again: (key?: string) => void;        // read it again, cache or no cache
  round: number;                        // bumped when a document should be asked again
  enabled: boolean;
};

const keyOf = (frame: unknown, route: string | null): string | null => {
  const f = readFrame(frame);
  return f ? `${framePath(f)}|${route ?? ""}` : null;
};

export function useSemantics(repo: Repo | undefined, run: SandboxRun | undefined): Semantics {
  const repoId = repo?.id;
  const runId = run?.id;
  const [readings, setReadings] = useState<StoredSemantics[]>([]);
  const [asked, setAsked] = useState<Reading[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which documents this session has already asked about. A frame path
  // and a route together are one interface; a document that navigates
  // somewhere else is a different one and is asked about again.
  const done = useRef(new Set<string>());
  // Which of those are to be read again from the model rather than from
  // the cache, and the count that makes the preview ask once more.
  const reread = useRef(new Set<string>());
  const [round, setRound] = useState(0);

  useEffect(() => {
    done.current = new Set(); reread.current = new Set();
    setReadings([]); setAsked([]); setLoaded(false); setError(null);
    if (!repoId) { setLoaded(true); return; }
    let stale = false;
    listSemantics(repoId).then((r) => {
      if (stale) return;
      if (r.ok) setReadings(r.maps); else setError(r.error);
      setLoaded(true);
    });
    return () => { stale = true; };
  }, [repoId]);

  const put = useCallback((s: StoredSemantics) => setReadings((all) => (all.some((x) => x.id === s.id) ? all.map((x) => (x.id === s.id ? s : x)) : [...all, s])), []);
  const note = useCallback((key: string, patch: Partial<Reading>) => setAsked((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r))), []);

  const read = useCallback(async (survey: unknown, key: string, refresh: boolean) => {
    if (!repoId) return;
    const s = survey as { route?: string | null; candidates?: unknown[]; frame?: unknown };
    setAsked((all) => [
      ...all.filter((r) => r.key !== key),
      { key, where: key.split("|")[0], route: s.route ?? null, candidates: Array.isArray(s.candidates) ? s.candidates.length : 0, state: "reading", hit: null, reason: null, signature: null, error: null },
    ]);
    setBusy(true);
    const r = await ensureSemantics({ repoId, runId: runId ?? null, survey, refresh });
    setBusy(false);
    if (!r.ok) { note(key, { state: "failed", error: r.error, signature: r.signature }); done.current.delete(key); return; }
    put(r.stored);
    note(key, { state: "read", hit: r.hit, reason: r.reason, signature: r.signature });
  }, [repoId, runId, put, note]);

  // A document offers itself; this decides whether to ask. Asking twice
  // about one interface in one session would cost a database round trip
  // and tell us nothing new, so it is not done.
  const offer = useCallback((survey: unknown) => {
    if (!repoId) return;
    const s = survey as { route?: string | null; frame?: unknown; candidates?: unknown[] };
    if (!Array.isArray(s?.candidates) || !s.candidates.length) return;
    const key = keyOf(s.frame, s.route ?? null);
    if (!key || done.current.has(key)) return;
    done.current.add(key);
    void read(survey, key, reread.current.delete(key));
  }, [repoId, read]);

  // Asking again is a person's choice and always costs a model call: it
  // is how a reading that got something wrong is corrected, and how the
  // signature policy is judged against a page that did change.
  const again = useCallback((key?: string) => {
    for (const k of key ? [key] : [...done.current]) { done.current.delete(k); reread.current.add(k); }
    setAsked((all) => (key ? all.filter((r) => r.key !== key) : []));
    // The answer has to come from the page: the workspace cannot survey a
    // document it is not allowed to read. Bumping this asks the preview.
    setRound((n) => n + 1);
  }, []);

  const index = useMemo(() => (readings.length ? buildIndex(mapsOf(readings)) : EMPTY_INDEX), [readings]);

  return { index, readings, asked, loaded, busy, error, offer, again, round, enabled: !!repoId };
}
