"use client";

import { Film, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RunHistory } from "@/hooks/use-run-history";
import type { SandboxRun } from "@/lib/sandbox";
import { formatWhen, type Recording } from "@/lib/trace/recording";

// Which run is being read, and whether what is under it is the whole of
// that run or a slice of it.
//
// Activity and the Visualizer are two tools over one session, so they
// answer "which run" the same way and out of the same state: this is
// that answer, written once. Neither draws a picker any more. Both sat
// under a bar naming the latest run, which is the run you are already
// looking at — a control whose whole job, nine times in ten, is to
// repeat the thing under it. An earlier run is reached by opening one of
// its recordings in Replay, which is the way you actually go there.
export type RunScope = {
  history: RunHistory;
  // A recording is open in Replay, so this view is cut to its minutes.
  // Said out loud rather than implied: a graph quietly missing two thirds
  // of a session looks exactly like a session where little happened.
  scopedTo: Recording | null;
  onWholeRun: () => void;
};

// What is not the whole of the latest run, said out loud, and nothing
// else: that this is an older run, with the way back to the latest one,
// and that the view is cut to a recording.
//
// Neither of these draws anything in the ordinary case, so the top of
// such a view is the view.
export function RunBanners({ scope }: { scope: RunScope }) {
  const { history, scopedTo } = scope;
  return (
    <>
      {history.past && history.run && <PastRunBanner run={history.run} onLatest={() => history.view(null)} />}
      {scopedTo && (
        <p className="flex shrink-0 items-center gap-2 border-b bg-muted/40 px-[22px] py-1.5 text-[12px] text-muted-foreground">
          <Film className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            Cut to “{scopedTo.name}”, the recording open in Replay.
          </span>
          <Button variant="ghost" size="sm" onClick={scope.onWholeRun} className="h-6 shrink-0 px-2 font-normal">Whole run</Button>
        </p>
      )}
    </>
  );
}

// The band under the header while an earlier run is being read. The
// canvas of a finished run looks exactly like the canvas of a live one
// that has gone quiet, so this is the only thing standing between reading
// an old session and thinking the current one stopped recording.
export function PastRunBanner({ run, onLatest }: { run: SandboxRun; onLatest: () => void }) {
  return (
    <p className="flex shrink-0 items-center gap-2 border-b bg-muted/40 px-[22px] py-1.5 text-[12px] text-muted-foreground">
      <History className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        Reading the run from {formatWhen(run.startedAt)} · {run.status}. Nothing here is live.
      </span>
      <Button variant="ghost" size="sm" onClick={onLatest} className="h-6 shrink-0 px-2 font-normal">Back to the latest</Button>
    </p>
  );
}
