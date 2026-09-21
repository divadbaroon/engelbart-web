"use client";

import { useMemo } from "react";

import { ArrowLeft, Circle, Eraser } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Recordings } from "@/hooks/use-recordings";
import { hasCanvas, statsLine, type Recording, type RecordingStats, type TraceNav } from "@/lib/trace/recording";
import { InterfaceReadings } from "@/components/trace/interface-readings";
import type { Semantics } from "@/hooks/use-semantics";
import { RecordingsList } from "@/components/trace/recordings-list";
import { AnnotationsList } from "@/components/trace/annotations-list";
import type { Annotations } from "@/hooks/use-annotations";
import type { Repo } from "@/lib/repos";
import type { SandboxRun } from "@/lib/sandbox";
import type { TraceView } from "@/hooks/use-trace-view";
import { relationFor, shortClock } from "@/lib/trace/moments";
import { formatClock } from "@/lib/trace/timeline";
import { selectedStage, type Jump, type Selection } from "@/lib/trace/selection";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { TraceCanvas, type Pick } from "@/components/trace/trace-canvas";
import { graphOf } from "@/lib/activity/graph";
import { Diagnostics, type RunSummary } from "@/components/trace/diagnostics";
import { DrawerBar, DrawerBody } from "@/components/trace/trace-drawer";
import { ActivityTimeline } from "@/components/trace/activity-timeline";

type Props = {
  repo: Repo;
  run: SandboxRun | undefined;
  trace: TraceView;                      // what the canvas shows: the run, or the open recording's slice
  runTrace: TraceView;                   // the whole run, always: diagnostics describe the run, not the slice
  selection: Selection | null;
  detail: boolean;                       // the selected moment's details are open
  onSelect: (selection: Selection, options?: { detail?: boolean }) => void;
  onDetail: (open: boolean) => void;
  onAskBart: () => void;
  slot: "middle" | "side";                // in the middle the details stand beside the canvas; on the side, under it
  onBack: (() => void) | null;            // to the Live preview; none when the trace is beside it
  recordings: TraceRecordings;
  notes: TraceAnnotations;                // the repository's interface annotations, as a third view
  semantics: Semantics;                   // what has been read about this application's interfaces, as a fourth
  canvas: CanvasMark;                     // where the canvas starts from, when a clean one was asked for
  bart: React.ReactNode;                  // the small Bart, floating over the canvas
};

// A clean canvas, asked for and taken back. Clearing hides what came
// before rather than deleting it: the rows stay, collection carries on,
// the recordings and the notes are untouched, and "Show everything"
// brings the run back whole. It is the same window a recording is shown
// through, so there is no second way of cutting the canvas down.
export type CanvasMark = {
  clearedAt: string | null;               // the sandbox clock reading the canvas starts from, or nothing
  canClear: boolean;                      // nothing recorded yet is nothing to hide
  onClear: () => void;
  onShowEverything: () => void;
};

// The notes written on this repository's interface, listed beside the
// trace they were written alongside. Opening one is the Live preview's
// business: the element lives there.
export type TraceAnnotations = {
  annotations: Annotations;
  onOpen: (id: string) => void;
  onAskBart: (id: string) => void;
};

// The run's recordings as the Trace tab and the Live preview share them:
// the list and its controls, where the tab is (the whole run, the list,
// or one recording on the canvas), and the counts a recording holds.
export type TraceRecordings = {
  recordings: Recordings;
  nav: TraceNav;
  onNav: (nav: TraceNav) => void;
  open: (id: string) => void;             // a recording onto the canvas, in the Trace tab
  reveal: (target: { stageId?: string; callId?: string }) => void;   // leave the open recording if the moment is outside it
  stats: (rec: Recording) => RecordingStats;
  // Stop the open recording. There are three buttons for it — here, the
  // list, and the Live preview's header — and one of them is beside the
  // capture of what the preview looked like. They all come through this,
  // so a recording stopped from the trace keeps its replay too.
  stop: () => void;
};

// The behavior trace of a run: a canvas with every moment of the session
// on one line, the selected one ringed where it stands, and a selected
// model call with its captured request and output beside it. Choosing a
// card opens its details: in the middle, in a panel down the right of
// the trace, where a long inspector has the height to be read; on the
// side, where there is no width to give away, in the drawer under the
// canvas, one bar high until asked for more. A branch of a call opens
// the details at the matching pane either way. How the trace was taken
// sits under diagnostics. Bart floats in the corner of the canvas for a
// question about the moment in hand, and has a tab of its own for the
// rest; nothing under the canvas is reserved for a conversation.
// A header keeps the way back to the preview and, inside the tab, the
// choice between the whole run and its recordings: a recording opens on
// this same canvas, cut to its window by the parent (`trace` is then the
// scoped view); the list is the other view.
export function BehaviorTrace({ repo, run, trace, runTrace, selection, detail, onSelect, onDetail, onAskBart, slot, onBack, recordings, notes, semantics, canvas, bart }: Props) {
  const { stages, diagnostics, callRows, error, loading } = trace;
  const { nav, onNav } = recordings;
  const rec = recordings.recordings;
  const openRecording = nav.kind === "recording" ? recordings.recordings.list.find((r) => r.id === nav.id) ?? null : null;
  const notesList = notes.annotations;
  // Several of the views are read top to bottom, and there is no canvas
  // under those.
  const listing = !hasCanvas(nav);
  // The reading of this session, from the view that holds it. The
  // Activity timeline is it over the clock; the canvas is it beside what
  // the software did; the drawer, the inspector and the line above
  // Bart's input are it for one moment. Every one of those is the same
  // array — reading it again here would be a second account of one run.
  const episodes = trace.episodes;
  const graph = useMemo(() => graphOf(episodes, stages, trace.reading.taxonomy), [episodes, stages, trace.reading.taxonomy]);

  const selected = selectedStage(stages, selection) ?? [...stages].reverse().find((s) => s.stage === "call") ?? stages[stages.length - 1] ?? null;
  const relation = selected ? relationFor(selected, stages, callRows) : null;
  // Beside the canvas, the details cost it width it can spare, so a card
  // shows them; under it they would take half the height, so there the
  // bar waits to be asked.
  const beside = slot === "middle";

  const onPick = (pick: Pick) => {
    if (pick.kind === "moment") {
      const stage = stages.find((s) => s.id === pick.stageId);
      if (!stage) return;
      onSelect(
        stage.stage === "call" && stage.callId
          ? { kind: "call", callId: stage.callId, jump: { pane: "overview", focus: null } }
          : { kind: "stage", stageId: stage.id, ...(pick.episodeId ? { episodeId: pick.episodeId } : {}) },
        beside ? { detail: true } : undefined,
      );
      return;
    }
    if (selected?.stage !== "call" || !selected.callId) return;
    const jump: Jump = pick.kind === "card" ? { pane: pick.card === "tools" ? "tools" : "context", focus: pick.card } : { pane: "output", focus: "output" };
    onSelect({ kind: "call", callId: selected.callId, jump }, { detail: true });
  };
  const select = {
    selected: selection?.kind === "call" ? selection.callId : null,
    onSelect: (id: string) => onSelect({ kind: "call", callId: id, jump: { pane: "overview", focus: null } }, { detail: true }),
  };

  if (!run) return <Empty>Open the repository to prepare it in a sandbox. Its trace starts with the run.</Empty>;
  if (run.trace === "off") return <Empty>This run was started without a trace. Prepare the repository again to record one.</Empty>;

  // Diagnostics answer how the trace was taken, which is a fact about the
  // run: they read the unscoped view, or a recording that starts after the
  // gateways came up would report that they never announced themselves.
  const modelGateway = runTrace.events.find((e) => e.kind === "gateway.listening" && e.data?.gateway === "model");
  const previewGateway = runTrace.events.find((e) => e.kind === "gateway.listening" && e.data?.gateway === "preview");
  const frames = runTrace.frames;
  const callCount = runTrace.rows.filter((r) => r.kind === "call").length;
  const interactionCount = runTrace.rows.reduce((n, r) => n + (r.kind === "interaction" ? 1 : r.kind === "keys" ? r.rows.length : 0), 0);
  const embedded = [...frames.values()].filter((f) => !!f.parentFrameId).length;
  const summary: RunSummary = {
    recording: openRecording ? `${openRecording.name} · ${openRecording.status === "recording" ? "recording…" : statsLine(recordings.stats(openRecording))}` : null,
    counts: interactionCount || callCount ? `${interactionCount} interaction${interactionCount === 1 ? "" : "s"} · ${callCount} model call${callCount === 1 ? "" : "s"}` : "Nothing recorded yet",
    capture: run.trace === "full" ? "full content, redacted" : "metadata only",
    gateways: [
      modelGateway ? `Model gateway up on port ${modelGateway.data?.port ?? "?"}.` : runTrace.loading ? "Loading…" : "The model gateway has not announced itself for this run.",
      previewGateway ? `Preview gateway up${frames.size ? `; the bridge is observing ${frames.size} document${frames.size === 1 ? "" : "s"}${embedded ? ` (${embedded} embedded)` : ""}` : ""}.` : !runTrace.loading ? "The preview gateway has not announced itself; interactions are not traced." : "",
    ].filter(Boolean).join(" "),
    instrumentation: [...runTrace.events].reverse().find((e) => e.kind === "instrument.applied" || e.kind === "instrument.present"),
    repoName: repo.name,
  };

  // The details open only on a chosen moment; the default ring on the
  // latest call is the canvas's own, not a selection.
  const open = detail && !!selection && !!selectedStage(stages, selection);
  const count = rec.list.length;
  // A cleared canvas says nothing of its own: the header already says it
  // is showing from a time and offers the way back, so the empty canvas
  // reads the way an untouched one does.
  const empty = openRecording && !stages.length && !loading
    ? `Nothing of the run falls inside “${openRecording.name}”${openRecording.status === "recording" ? " yet; what happens in the Live preview appears here as it is recorded" : ""}.`
    : emptyText(repo.name, run, trace);
  // The canvas fits its view once and keeps that camera, so a view it did
  // not lay out would open on empty space: a new key gives the clear and
  // the open recording a canvas that frames what it holds.
  const canvasKey = openRecording ? `recording:${openRecording.id}` : canvas.clearedAt ? `cleared:${canvas.clearedAt}` : "full";
  return (
    <section aria-label="Behavior trace" className="flex h-full min-h-0 flex-col">
      <header className="flex h-9 shrink-0 items-center gap-1 border-b px-2 text-[13px]">
        {onBack && (
          <>
            <Button variant="ghost" size="sm" onClick={onBack} className="h-7 gap-1 px-2 font-normal text-muted-foreground">
              <ArrowLeft className="size-3.5" /> Live preview
            </Button>
            <span className="mx-1 h-4 w-px bg-border" />
          </>
        )}
        {openRecording ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => onNav({ kind: "list" })} className="h-7 gap-1 px-2 font-normal text-muted-foreground">
              <ArrowLeft className="size-3.5" /> Recordings
            </Button>
            <span className="min-w-0 truncate font-semibold" title={openRecording.name}>{openRecording.name}</span>
            <span className="hidden min-w-0 truncate text-muted-foreground sm:inline">· {openRecording.status === "recording" ? "recording…" : statsLine(recordings.stats(openRecording))}</span>
            {openRecording.status === "recording" && <Circle className="size-2 shrink-0 animate-pulse fill-red-500 text-red-500" />}
            <span className="ml-auto" />
            {openRecording.status === "recording" && (
              <Button variant="ghost" size="sm" disabled={rec.busy} onClick={recordings.stop} title="Stop recording; the run keeps going" className="h-7 px-2 font-normal text-muted-foreground">Stop</Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => onNav({ kind: "full" })} className="h-7 px-2 font-normal text-muted-foreground">Full trace</Button>
          </>
        ) : (
          <>
            <div role="tablist" aria-label="Trace view" className="flex items-center gap-0.5 rounded-md bg-muted/60 p-0.5">
              <NavTab active={nav.kind === "activity"} onClick={() => onNav({ kind: "activity" })}>Activity</NavTab>
              <NavTab active={nav.kind === "full"} onClick={() => onNav({ kind: "full" })}>Full trace</NavTab>
              <NavTab active={nav.kind === "list"} onClick={() => onNav({ kind: "list" })}>Recordings{count ? ` · ${count}` : ""}</NavTab>
              <NavTab active={nav.kind === "annotations"} onClick={() => onNav({ kind: "annotations" })}>Annotations{notesList.list.length ? ` · ${notesList.list.length}` : ""}</NavTab>
              <NavTab active={nav.kind === "interface"} onClick={() => onNav({ kind: "interface" })}>Interface{semantics.readings.length ? ` · ${semantics.readings.length}` : ""}</NavTab>
            </div>
            {/* Only over the canvas: on a list there is nothing to clear.
                Cleared, the header says so and offers the way back, so the
                canvas is never quietly short of the run. */}
            {nav.kind === "full" && (
              <div className="ml-auto flex min-w-0 items-center gap-0.5">
                {canvas.clearedAt ? (
                  <>
                    <span className="hidden min-w-0 truncate text-muted-foreground sm:inline" title={`Moments before ${formatClock(canvas.clearedAt)} are hidden; nothing was deleted`}>
                      Showing from {shortClock(canvas.clearedAt)}
                    </span>
                    <Button variant="ghost" size="sm" onClick={canvas.onShowEverything} title="Show the whole run again" className="h-7 px-2 font-normal text-muted-foreground">Show all</Button>
                  </>
                ) : (
                  <Button variant="ghost" size="sm" disabled={!canvas.canClear} onClick={canvas.onClear} title="Start the canvas fresh from here. Nothing is deleted: the run keeps recording, and recordings and notes are untouched." className="h-7 gap-1 px-2 font-normal text-muted-foreground">
                    <Eraser className="size-3.5" /> Clear canvas
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </header>
      {error && <p role="alert" className="shrink-0 border-b px-[22px] py-2 text-xs text-destructive">{error}</p>}
      {nav.kind === "activity" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Reading an episode back to its moments means the canvas, so
              choosing one goes there and rings it. */}
          <ActivityTimeline trace={trace} episodes={episodes} onOpenMoment={(stageId, episodeId) => { onNav({ kind: "full" }); onSelect({ kind: "stage", stageId, ...(episodeId ? { episodeId } : {}) }, beside ? { detail: true } : undefined); }} />
        </div>
      ) : nav.kind === "interface" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <InterfaceReadings semantics={semantics} traced={!!run.previewUrl} />
        </div>
      ) : nav.kind === "annotations" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <AnnotationsList
            annotations={notesList.list}
            viewerId={notesList.viewerId}
            loaded={notesList.loaded}
            error={notesList.error}
            semantics={trace.semantics}
            onOpen={notes.onOpen}
            onAskBart={notes.onAskBart}
            onRemove={(id) => void notesList.remove(id)}
            onDismissError={notesList.dismissError}
          />
        </div>
      ) : nav.kind === "list" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <RecordingsList
            recordings={rec.list}
            stats={recordings.stats}
            loaded={rec.loaded}
            error={rec.error}
            busy={rec.busy}
            onOpen={(id) => onNav({ kind: "recording", id })}
            onStop={recordings.stop}
            onRename={(id, name) => void rec.rename(id, name)}
            onRemove={(id) => void rec.remove(id)}
            onDismissError={rec.dismissError}
          />
        </div>
      ) : (
      <ResizablePanelGroup orientation={beside ? "horizontal" : "vertical"} id={`trace-${repo.id}-${beside ? "beside" : "under"}`} className="min-h-0 flex-1">
        <ResizablePanel id="trace-canvas" defaultSize={beside ? "58" : "62"} minSize={beside ? 300 : "30"}>
          <div className="relative h-full">
            <TraceCanvas key={canvasKey} graph={graph} stages={stages} calls={callRows} selectedId={selected?.id ?? null} relation={relation} onPick={onPick} empty={empty} />
            {bart}
          </div>
        </ResizablePanel>
        {open && (
          <>
            <ResizableHandle className="bg-border" />
            <ResizablePanel id="trace-detail" defaultSize={beside ? "42" : "38"} minSize={beside ? 340 : "20"}>
              <DrawerBody trace={trace} episodes={episodes} selection={selection} onSelect={onSelect} onAskBart={onAskBart} onClose={() => onDetail(false)} />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
      )}
      {!listing && !open && <DrawerBar trace={trace} episodes={episodes} selection={selection} onSelect={onSelect} onAskBart={onAskBart} onOpen={() => onDetail(true)} beside={beside} />}
      {!listing && <Diagnostics rows={diagnostics} select={select} summary={summary} />}
    </section>
  );
}

function NavTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick} className={cn("h-6 rounded px-2 text-[12px]", active ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
      {children}
    </button>
  );
}

// What to say when there is nothing on the line yet.
export function emptyText(repoName: string, run: SandboxRun | undefined, trace: TraceView): string | null {
  if (!run) return "Open the repository to prepare it in a sandbox. Its trace starts with the run.";
  if (run.trace === "off") return "This run was started without a trace.";
  if (trace.stages.length || trace.loading) return null;
  if (run.status === "running") return `Use ${repoName} in the Live preview; what you do there, and each model call it makes, appears here as it happens.`;
  return trace.rows.length ? "Nothing was done in the application during this run." : "Nothing has been recorded for this run yet.";
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="p-8 text-center text-[13px] leading-5 text-muted-foreground">{children}</p>;
}
