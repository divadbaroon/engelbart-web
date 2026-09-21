"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Repo } from "@/lib/repos";
import type { SandboxRun } from "@/lib/sandbox";
import type { TraceEvent } from "@/lib/trace/types";
import { BLIND_READING, blindReading, builtInReading, readingOf, type Reading } from "@/lib/activity/reading";
import type { ProfileState } from "@/lib/activity/profile/store";
import { ensureProfile, loadProfile } from "@/app/workspace/[workspaceId]/profile-actions";

// How this artifact is read, and the getting of it.
//
// The same shape as `useSemantics`, deliberately: a reading belongs to
// the repository rather than to the run that happens to be up, it is
// looked for before it is asked for, and nothing here is on anybody's
// path. A page load costs one query. A model call happens once, in the
// background, for an artifact nobody has read — and never for one this
// application ships a reading for.
//
// While that is happening the timeline is read blind: it names what any
// artifact would show and says so on the page. What it never does is
// borrow another artifact's vocabulary, which is what the default used to
// be and is the bug this hook exists to close.
export type ProfileView = {
  // What to read the session with. Always something; blind until there
  // is better.
  reading: Reading;
  state: ProfileState;
  signature: string | null;
  busy: boolean;
  error: string | null;
  // The run's events, offered as they arrive. This is what decides that
  // the artifact has shown enough of itself to be worth reading.
  offer: (events: TraceEvent[]) => void;
  // Read it again from the model, cache or no cache. A person's choice,
  // and always a model call.
  again: () => void;
  // Whether any of this applies: a repository is open, and its reading
  // is not one shipped with the application.
  asks: boolean;
};

// A run has to have shown something before it is worth a model call. Both
// numbers are about evidence rather than about cost: a handful of events
// is one click, and an interface still emitting events is one whose parts
// have not all appeared yet.
const ENOUGH_EVENTS = 40;
const SETTLE_MS = 15_000;

export function useArtifactProfile(repo: Repo | undefined, run: SandboxRun | undefined): ProfileView {
  const repoId = repo?.id;
  const runId = run?.id;
  // A repository this application already has a reading for is never
  // asked about: it is known, and asking would replace a written reading
  // with a guessed one.
  const builtIn = useMemo(() => builtInReading(repo), [repo?.owner, repo?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const [state, setState] = useState<ProfileState>(() => ({ status: "none", detail: BLIND_READING.detail, profile: null, row: null }));
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Which run has already been asked about, so a stream of events cannot
  // turn into a stream of model calls.
  const asked = useRef<string | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    asked.current = null;
    if (settle.current) clearTimeout(settle.current);
    setState({ status: "none", detail: BLIND_READING.detail, profile: null, row: null });
    setSignature(null);
    setError(null);
    if (!repoId || !runId || builtIn) return;
    let stale = false;
    loadProfile({ repoId, runId }).then((r) => {
      if (stale) return;
      if (!r.ok) { setError(r.error); return; }
      setState(r.state);
      setSignature(r.signature);
    });
    return () => { stale = true; if (settle.current) clearTimeout(settle.current); };
  }, [repoId, runId, builtIn]);

  const ask = useCallback(async (refresh: boolean) => {
    if (!repoId || !runId) return;
    setBusy(true);
    setState((s) => (s.status === "ready" || s.status === "stale" ? s : { ...s, status: "pending", detail: "This artifact is being read. Until that finishes the timeline names only what holds in any artifact." }));
    const r = await ensureProfile({ repoId, runId, refresh });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setError(null);
    setState(r.state);
    setSignature(r.signature);
  }, [repoId, runId]);

  // A run offers what it has recorded. Asking is deferred until the
  // stream is quiet, because an interface still producing events is one
  // whose surfaces, controls and channels have not all been seen — and a
  // profile written from half an interface is a profile that will be
  // stale before it is stored.
  const offer = useCallback((events: TraceEvent[]) => {
    if (!repoId || !runId || builtIn) return;
    if (asked.current === runId || events.length < ENOUGH_EVENTS) return;
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      if (asked.current === runId) return;
      // A reading that is there and still fits is the end of it. A
      // failure, a stale one, or none at all is worth one attempt.
      if (state.status === "ready") return;
      asked.current = runId;
      void ask(false);
    }, SETTLE_MS);
  }, [repoId, runId, builtIn, state.status, ask]);

  const again = useCallback(() => {
    if (!repoId || !runId || builtIn) return;
    asked.current = runId;
    void ask(true);
  }, [repoId, runId, builtIn, ask]);

  // The reading itself: shipped, stored, or blind. A stored profile that
  // will not compile is no profile — `readingOf` says so by returning
  // null — and the session is read blind rather than not at all.
  const reading = useMemo(() => {
    if (builtIn) return builtIn;
    if (state.profile && state.row) return readingOf(state.profile, state.row, state.detail) ?? blindReading("failed", "This artifact's reading could not be used, so the timeline names only what holds in any artifact.");
    return blindReading(state.status, state.detail);
  }, [builtIn, state]);

  return { reading, state, signature, busy, error, offer, again, asks: !!repoId && !builtIn };
}
