// Which run of a repository is being read, as two decisions with no
// React in them.
//
// The workspace loads the newest run per repository and has only ever
// been able to show that one, so everything belonging to an earlier run —
// its trace, its recordings, the activity read off it — became
// unreachable the moment a new run started. Reaching one means holding
// the repository's runs beside the live one and letting any of them be
// the one that is read. These are the two pieces of arithmetic that
// involves; `useRunHistory` is the state around them.
import type { SandboxRun } from "@/lib/sandbox";

// The repository's runs as they should be shown: newest first, with the
// live run spliced over its own loaded row.
//
// The splice matters. The loaded row is a photograph taken when the tab
// was opened; the live run is held by `useSandboxRuns` and changes as the
// run launches, runs and finishes. Reading the photograph would show a
// run still launching long after it was up. And a run started since the
// list was loaded is not in the list at all, so it goes on the front —
// otherwise starting a run makes the picker disagree with the tab about
// what is being read.
export function runsWithLive(loaded: SandboxRun[], live: SandboxRun | undefined): SandboxRun[] {
  const merged = loaded.map((r) => (live && r.id === live.id ? live : r));
  return live && !merged.some((r) => r.id === live.id) ? [live, ...merged] : merged;
}

// The run being read: the one chosen, or the live one.
//
// Choosing the live run is choosing nothing, and is stored as nothing, so
// that a later run of the same repository becomes the one being read
// rather than leaving the tab pinned to a run that is no longer live. A
// chosen run that is not in the list — deleted, or beyond the bound the
// list was loaded with — falls back to the live run rather than to
// nothing, because an empty trace with no explanation is the failure this
// whole thing exists to remove.
export function runBeingRead(runs: SandboxRun[], chosen: string | null, live: SandboxRun | undefined): SandboxRun | undefined {
  if (!chosen || chosen === live?.id) return live;
  return runs.find((r) => r.id === chosen) ?? live;
}
