"use client";

import { useState } from "react";
import type { SandboxRun } from "@/lib/sandbox";
import type { Recordings } from "@/hooks/use-recordings";
import type { Recording, RecordingStats } from "@/lib/trace/recording";
import { RecordingsList } from "@/components/trace/recordings-list";
import { Empty, runProblem } from "@/components/trace/run-guard";

// The run's recordings, and the one being watched.
//
// Recording was always two things wearing one name: the boundaries saved
// against the trace, and the pictures rrweb took of the page. The
// boundaries were listed inside the Visualizer and the pictures played
// where the running application stood, so the two halves of a recording
// were never in the same place and neither was a thing you could go to.
// They are one tab now. The list is the selector; opening one plays it.
export type TraceRecordings = {
  recordings: Recordings;
  // The one being watched, or nothing. This is the whole of the mode:
  // there is no second flag that could disagree about whether a
  // recording is open. It also cuts Activity and the Visualizer to the
  // same minutes, which those two say out loud.
  open: Recording | null;
  onOpen: (id: string) => void;
  onClose: () => void;
  // A recording made on an earlier run is read against that run and no
  // other, so opening one is a move: go to the run, then open it there.
  openEarlier: (runId: string, recordingId: string) => void;
  // A moment chosen from outside the open recording — the Live preview's
  // strip, a reference in one of Bart's answers — cannot be shown inside
  // it, so the recording is closed rather than the moment silently going
  // nowhere.
  reveal: (target: { stageId?: string; callId?: string }) => void;
  stats: (rec: Recording) => RecordingStats;
  // Stop the recording that is running. There are three buttons for it —
  // the list, the Live preview's header, and the row here — and one of
  // them is beside the capture of what the preview looked like. They all
  // come through this, so a recording stopped from anywhere keeps its
  // replay too.
  stop: () => void;
  // An earlier run is being read. Nothing may be started on it: a
  // recording records what the preview is doing now, and the preview is
  // never showing a past run.
  past: boolean;
};

// The two clocks, and where the playhead is being sent. rrweb stamps the
// viewer's clock and the trace carries the sandbox's; the gateway
// measured the difference on the run's own events.
export type ReplayClock = {
  offset: number | null;
  seekTo: { at: string; key: number } | null;
  onMoment: (at: string) => void;
};

// Two states and no third: a browser for choosing one, and the one you
// chose, playing. The list is not kept beside the player — the panel is a
// third of the window and a picture of an interface needs all of it — so
// coming back is a button, and the row you came back from is marked.
export function ReplayPanel({ run, recordings }: { run: SandboxRun | undefined; recordings: TraceRecordings }) {
  // Which row was last opened. View state about the list, not a second
  // answer to "which recording is playing": while one plays, this list is
  // not on the screen, and `recordings.open` remains the only such answer.
  const [came, setCame] = useState<string | null>(null);
  const problem = runProblem(run);
  if (problem) return <Empty>{problem}</Empty>;
  const rec = recordings.recordings;
  // The player itself is not here. It is over the Live preview
  // (components/repo-workspace.tsx), where a picture of a window has a
  // window's worth of room. This branch used to draw it too, and two
  // branches drawing one recording is two rrweb Replayers over one
  // stream — the panel is mounted the first time it is shown and never
  // unmounted again (components/center-panel.tsx), so the second one
  // would be built silently, behind whatever tab was in front, fetching
  // the same object and running its own sandboxed iframe.
  return (
    <section aria-label="Replay" className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <RecordingsList
          recordings={rec.list}
          run={run}
          earlier={rec.earlier}
          onOpenEarlier={(runId, id) => { setCame(id); recordings.openEarlier(runId, id); }}
          loaded={rec.loaded}
          earlierLoaded={rec.earlierLoaded}
          error={rec.error}
          busy={rec.busy}
          openId={came}
          onOpen={(id) => { setCame(id); recordings.onOpen(id); }}
          onStop={recordings.stop}
          onRename={(id, name) => void rec.rename(id, name)}
          onRemove={(id) => void rec.remove(id)}
          onDismissError={rec.dismissError}
        />
      </div>
    </section>
  );
}
