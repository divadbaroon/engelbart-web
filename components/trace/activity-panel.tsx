"use client";

import type { SandboxRun } from "@/lib/sandbox";
import type { TraceView } from "@/hooks/use-trace-view";
import { ActivityTimeline } from "@/components/trace/activity-timeline";
import { RunBanners, type RunScope } from "@/components/trace/run-header";
import { Empty, runProblem } from "@/components/trace/run-guard";

// What a person was doing, as a tool of its own.
//
// This used to be a view inside the Visualizer, which put the reading of
// a session a level below the drawing of it and made the two look like
// settings of one thing. They are not: the graph answers what caused
// what, and this answers what somebody was up to. Either is worth
// opening without the other, so each is a tab.
//
// It classifies nothing. The episodes come in already read — the same
// array the canvas draws beside the software's own moments and the
// drawer names one of — because reading the session twice would be two
// accounts of one run.
type Props = {
  run: SandboxRun | undefined;
  trace: TraceView;
  scope: RunScope;
  // Into the Visualizer, at the moment this episode was read from — and
  // at the episode itself, so the canvas rings the behaviour that was
  // chosen rather than the first one its stage happens to back.
  onOpenMoment: (stageId: string, episodeId: string) => void;
};

export function ActivityPanel({ run, trace, scope, onOpenMoment }: Props) {
  const problem = runProblem(run);
  if (problem) return <Empty>{problem}</Empty>;
  return (
    <section aria-label="Activity" className="flex h-full min-h-0 flex-col">
      <RunBanners scope={scope} />
      {trace.error && <p role="alert" className="shrink-0 border-b px-[22px] py-2 text-xs text-destructive">{trace.error}</p>}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ActivityTimeline trace={trace} episodes={trace.episodes} onOpenMoment={onOpenMoment} />
      </div>
    </section>
  );
}
