"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Repo } from "@/lib/repos";
import type { SandboxRun } from "@/lib/sandbox";
import { listRepoRuns } from "@/app/workspace/[workspaceId]/sandbox-actions";
import { runBeingRead, runsWithLive } from "@/lib/run-history";

// Which run of this repository is being read.
//
// The workspace has always opened the newest run of a repository and
// nothing else (`loadLatestRuns` keeps one per repo), so everything that
// belonged to the run before it — the trace, its recordings, the activity
// read off it — stopped being reachable the moment a new one started. It
// was never deleted. It was just that nothing could name it.
//
// So a repository's runs are loaded beside the live one and any of them
// can be the one the workspace reads. Choosing an earlier run hands the
// rest of the application an ordinary `SandboxRun`, which is all any of
// it ever wanted: `useTrace` fetches that run's events and only goes live
// for a run that is still going, and the recordings, the profile and the
// activity all key off the run's id.
//
// The live run is never a copy. It is held by `useSandboxRuns` and
// changes as the run does, so it is spliced over the loaded row rather
// than read from it — a run watched here should still show itself
// launching, running and finishing.
export type RunHistory = {
  runs: SandboxRun[];             // every run of this repository, newest first, the live one included
  run: SandboxRun | undefined;    // the one being read
  live: SandboxRun | undefined;   // the newest, which is what the workspace opens by default
  past: boolean;                  // true when an earlier run is being read
  loaded: boolean;
  view: (runId: string | null) => void;   // null: back to the live run
};

export function useRunHistory(repo: Repo | undefined, live: SandboxRun | undefined): RunHistory {
  const repoId = repo?.id;
  const [loadedRuns, setLoadedRuns] = useState<SandboxRun[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);

  // A repository's runs, once, when it is opened. The choice belongs to
  // the repository too: moving to another one starts on its live run.
  useEffect(() => {
    setLoadedRuns([]); setLoaded(false); setChosen(null);
    if (!repoId) { setLoaded(true); return; }
    let stale = false;
    listRepoRuns(repoId)
      .then((runs) => { if (!stale) { setLoadedRuns(runs); setLoaded(true); } })
      .catch(() => { if (!stale) setLoaded(true); });
    return () => { stale = true; };
  }, [repoId]);

  // Starting a run is asking to watch it. Whatever was being read before,
  // a new live run is the one to be on.
  useEffect(() => { setChosen(null); }, [live?.id]);

  const runs = useMemo(() => runsWithLive(loadedRuns, live), [loadedRuns, live]);
  const run = useMemo(() => runBeingRead(runs, chosen, live), [runs, chosen, live]);

  const view = useCallback((runId: string | null) => setChosen(runId && runId !== live?.id ? runId : null), [live?.id]);

  return { runs, run, live, past: !!run && run.id !== live?.id, loaded, view };
}
