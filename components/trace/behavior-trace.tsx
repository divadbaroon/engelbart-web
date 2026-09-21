"use client";

import { useMemo } from "react";

import { Cpu, Eraser, MousePointer2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Repo } from "@/lib/repos";
import type { SandboxRun } from "@/lib/sandbox";
import type { TraceView } from "@/hooks/use-trace-view";
import { relationFor, shortClock } from "@/lib/trace/moments";
import { formatClock } from "@/lib/trace/timeline";
import { selectedStage, type Jump, type Selection } from "@/lib/trace/selection";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { TraceCanvas, type Pick } from "@/components/trace/trace-canvas";
import { DEFAULT_GRAPH, graphOf, type Shown } from "@/lib/activity/graph";
import { DrawerBody } from "@/components/trace/trace-drawer";
import { RunBanners, type RunScope } from "@/components/trace/run-header";
import { Empty, runProblem } from "@/components/trace/run-guard";
import type { TraceRecordings } from "@/components/trace/replay-panel";

type Props = {
  repo: Repo;
  run: SandboxRun | undefined;
  trace: TraceView;                      // what the canvas shows: the run, or the open recording's slice
  selection: Selection | null;
  detail: boolean;                       // the selected moment's details are open
  onSelect: (selection: Selection, options?: { detail?: boolean }) => void;
  onDetail: (open: boolean) => void;
  onAskBart: () => void;
  scope: RunScope;                       // which run, and whether a recording has cut this down
  recordings: TraceRecordings;           // only for which recording the canvas is cut to
  canvas: CanvasMark;                    // where the canvas starts from, when a clean one was asked for
  bart: React.ReactNode;                 // the small Bart, floating over the canvas
};

// The two ways this canvas shows less than the run: from when, and of
// which side. Both hide rather than delete — the rows stay, collection
// carries on, the recordings and the notes are untouched, and each has
// its way back — and both say so in the same corner, because a canvas
// quietly short of the session looks exactly like a session in which
// little happened.
//
// Clearing is the same window a recording is shown through, so there is
// no second way of cutting the canvas down the clock. The side is a rule
// the graph is drawn by, which is a different question and a different
// mechanism (lib/activity/graph.ts).
export type CanvasMark = {
  clearedAt: string | null;               // the sandbox clock reading the canvas starts from, or nothing
  canClear: boolean;                      // nothing recorded yet is nothing to hide
  onClear: () => void;
  onShowEverything: () => void;
  shown: Shown;                           // which side of the session is drawn
  onShown: (shown: Shown) => void;
  follow: boolean;                        // keep the newest card in frame as it arrives
  onFollow: (follow: boolean) => void;
};

// The causal graph of a run, and nothing else.
//
// Every moment of the session on one line, the selected one ringed where
// it stands, and a selected model call with its captured request and
// output in the drawer under it. The trace stands in a column where there
// is no width to give away, so choosing a card selects it and its details
// open downwards; a branch of a call opens the details at the matching
// pane. Bart floats in the corner for a question about the moment in
// hand.
//
// How the trace was taken — the gateways, the instrumentation and its
// diff, the counts, and the rows no moment claims — used to fold out of a
// bar along the bottom. It was a tool for the people building the tracing
// rather than for anybody reading a session, and it took a line of a
// column that is a third of the window to say so. It is gone; the events
// it read are still in the trace and still on the wire.
//
// It used to carry five other views in a second tab bar — what a person
// was doing, the recordings, the notes, the interface readings — which put
// four unrelated tools a level under the one they had least to do with.
// They are their own surfaces now (lib/workspace-slots), and this is the
// graph. What is left in the header is about the graph: which run it is
// of, and how much of that run it is showing.
export function BehaviorTrace({ repo, run, trace, selection, detail, onSelect, onDetail, onAskBart, scope, recordings, canvas, bart }: Props) {
  const { stages, callRows, error, loading } = trace;
  const openRecording = recordings.open;
  // The reading of this session, from the view that holds it. Activity is
  // it over the clock; the canvas is it beside what the software did; the
  // drawer, the inspector and the line above Bart's input are it for one
  // moment. Every one of those is the same array — reading it again here
  // would be a second account of one run.
  const episodes = trace.episodes;
  const graph = useMemo(
    () => graphOf(episodes, stages, trace.reading.taxonomy, { ...DEFAULT_GRAPH, shown: canvas.shown }),
    [episodes, stages, trace.reading.taxonomy, canvas.shown],
  );
  // What the canvas actually drew. A stage backs more than one node and
  // the nodes can differ in side — a submit is the writing and the
  // sending, a response is a node per channel — so this is asked of the
  // graph rather than of the stage list.
  const drawn = useMemo(() => new Set(graph.map((n) => n.stageId)), [graph]);

  // The default ring is the latest model call: the moment a session is
  // usually read from. It has to be one the canvas is drawing, or the
  // ring lands on nothing and the call's captured context hangs off a
  // node that does not exist. Asked of `drawn` so it is right under any
  // rule the graph was drawn by — the side, the wait fold, the floor
  // under an uncharacterised stretch.
  // With the software hidden the latest call is on the canvas only as
  // the stretch of waiting around it, and a wait is the least telling of
  // the person's moments to open a reading on; the latest moment drawn
  // is the better default there.
  const fallback = (canvas.shown === "person" ? undefined : [...stages].reverse().find((s) => s.stage === "call" && drawn.has(s.id)))
    ?? [...stages].reverse().find((s) => drawn.has(s.id))
    ?? null;
  const selected = selectedStage(stages, selection) ?? fallback;
  // The tie the trace recorded always has a model call at one end. The
  // canvas drops one whose other end it is not drawing, so a submit tied
  // to a call goes when the person's side does; but with the software
  // hidden the call is still on the canvas as the wait around it, and an
  // arc onto that card would be the trace pointing at the model from a
  // canvas that says it is showing only the person.
  const relation = selected && canvas.shown !== "person" ? relationFor(selected, stages, callRows) : null;

  // Choosing a card opens what it is. There used to be a bar along the
  // bottom holding the chosen moment's badge, title, clock and duration
  // with a Details button on the end of it — a second, smaller account
  // of the card already on the screen, and the only way to reach the
  // account that has everything. The card is the handle now: one click
  // rings it and opens it, and the details close from inside themselves.
  const onPick = (pick: Pick) => {
    if (pick.kind === "moment") {
      const stage = stages.find((s) => s.id === pick.stageId);
      if (!stage) return;
      onSelect(
        stage.stage === "call" && stage.callId
          ? { kind: "call", callId: stage.callId, jump: { pane: "overview", focus: null } }
          : { kind: "stage", stageId: stage.id, ...(pick.episodeId ? { episodeId: pick.episodeId } : {}) },
        { detail: true },
      );
      return;
    }
    if (selected?.stage !== "call" || !selected.callId) return;
    const jump: Jump = pick.kind === "card" ? { pane: pick.card === "tools" ? "tools" : "context", focus: pick.card } : { pane: "output", focus: "output" };
    onSelect({ kind: "call", callId: selected.callId, jump }, { detail: true });
  };
  const problem = runProblem(run);
  if (problem || !run) return <Empty>{problem}</Empty>;

  // The details open only on a chosen moment; the default ring on the
  // latest call is the canvas's own, not a selection. And only on one
  // the canvas is drawing: the canvas and the drawer under it are one
  // surface and must not be able to disagree about what is on the
  // screen. Choosing a side already clears a selection it hides
  // (components/app-shell.tsx); this is the belt to that pair of braces.
  const chosen = selection ? selectedStage(stages, selection) : null;
  const open = detail && !!chosen && drawn.has(chosen.id);
  // A cut-down canvas says nothing of its own: the header already says
  // what it is showing and offers the way back, so the empty canvas reads
  // the way an untouched one does.
  const empty = openRecording && !stages.length && !loading
    ? `Nothing of the run falls inside “${openRecording.name}”${openRecording.status === "recording" ? " yet; what happens in the Live preview appears here as it is recorded" : ""}.`
    // Emptied by what is being shown rather than by the run. Without
    // this the canvas would go blank saying nothing — `emptyText` only
    // speaks when the run itself is empty, and what it would say of a
    // run that has moments would be false.
    : canvas.shown !== "both" && !graph.length && stages.length > 0 && !loading
      ? canvas.shown === "person"
        ? "Only the person's moments are being shown, and this run has none of them. Show the agent's side to see the rest of it."
        : "Only the agent's moments are being shown, and this run has none of them. Show the person's side to see the rest of it."
      : emptyText(repo.name, run, trace);
  // The canvas fits its view once and keeps that camera, so a view it did
  // not lay out would open on empty space: a new key gives the clear and
  // the open recording a canvas that frames what it holds.
  const canvasKey = openRecording ? `recording:${openRecording.id}` : canvas.clearedAt ? `cleared:${canvas.clearedAt}` : "full";
  return (
    <section aria-label="Visualizer" className="flex h-full min-h-0 flex-col">
      <RunBanners scope={scope} />
      {error && <p role="alert" className="shrink-0 border-b px-[22px] py-2 text-xs text-destructive">{error}</p>}
      {/* The details are under the canvas rather than beside it because
          this stands in a column a third of the window wide. The sizes are
          strings on purpose: a bare number is pixels in
          react-resizable-panels v4. */}
      <ResizablePanelGroup orientation="vertical" id={`trace-${repo.id}-under`} className="min-h-0 flex-1">
        <ResizablePanel id="trace-canvas" defaultSize="62" minSize="30">
          <div className="relative h-full">
            <TraceCanvas key={canvasKey} graph={graph} stages={stages} calls={callRows} selectedId={selected?.id ?? null} relation={relation} onPick={onPick} empty={empty} shown={canvas.shown} follow={canvas.follow} onFollow={canvas.onFollow} />
            {/* Over the canvas rather than in a bar above it, with the
                zoom controls in the opposite corner: the graph is what
                this tool is, and a rule across the top for one button
                took a ninth of a narrow column to say nothing. Cleared,
                it says so here too — the canvas is never quietly short of
                the run. */}
            {/* Two boxes, side by side, not one and not stacked.
                One bar put the side switches and Clear canvas in the same
                box, which said they were a single control; they are not.
                What the canvas is *showing* of the session is a standing
                choice you leave set, and clearing it is a thing you do
                once and are done with. Two boxes with air between them
                say that the way the eye already reads groups, where a
                hairline inside one box said it by a pixel.
                They were stacked for a while, which spent two rows of the
                canvas's top edge on four small buttons. In a row they
                cost one row, and the switches come first because they are
                the pair you keep coming back to.
                `flex-wrap` is the narrow-column fallback: the clear box
                drops beneath the switches rather than pushing them out of
                the corner. */}
            <div className="pointer-events-none absolute right-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-start justify-end gap-2">
              {/* Which side of the session is drawn. Two switches rather
                  than a three-way picker: a session is two streams and
                  each is either on the canvas or not, which is what
                  somebody wants to say. Neither can turn the last one
                  off — the side that is alone swaps to the other — so
                  there is no fourth state in which the canvas is empty
                  because it was asked to be.

                  A caption used to sit beside them — "Human only",
                  "Software only" — which was the buttons' own state
                  written out, from when they were unlabelled icons. A
                  filled Human next to an outlined Agent says it. */}
              <div
                role="group"
                aria-label="What the canvas shows of the session"
                title={canvas.shown === "both" ? undefined : SIDE_NOTE[canvas.shown]}
                className="pointer-events-auto flex shrink-0 items-center gap-1 rounded-md border bg-background p-1 shadow-sm"
              >
                <Side side="person" shown={canvas.shown} onShown={canvas.onShown}><MousePointer2 className="size-3.5" /></Side>
                <Side side="software" shown={canvas.shown} onShown={canvas.onShown}><Cpu className="size-3.5" /></Side>
              </div>
              <div className="pointer-events-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-1 rounded-md border bg-background p-1 shadow-sm">
                {canvas.clearedAt ? (
                  <>
                    <span className="hidden min-w-0 truncate px-1.5 text-[12px] text-muted-foreground sm:inline" title={`Moments before ${formatClock(canvas.clearedAt)} are hidden; nothing was deleted`}>
                      Showing from {shortClock(canvas.clearedAt)}
                    </span>
                    <Button variant="ghost" size="sm" onClick={canvas.onShowEverything} title="Show the whole run again" className="h-7 px-2 font-normal text-muted-foreground">Show all</Button>
                  </>
                ) : (
                  <Button variant="ghost" size="sm" disabled={!canvas.canClear} onClick={canvas.onClear} title="Start the canvas fresh from here. Nothing is deleted: the run keeps recording, and recordings and notes are untouched." className="h-7 gap-1.5 px-2 font-normal text-muted-foreground">
                    <Eraser className="size-3.5" /> Clear canvas
                  </Button>
                )}
              </div>
            </div>
            {bart}
          </div>
        </ResizablePanel>
        {open && (
          <>
            <ResizableHandle className="bg-border" />
            <ResizablePanel id="trace-detail" defaultSize="38" minSize="20">
              <DrawerBody trace={trace} episodes={episodes} selection={selection} onSelect={onSelect} onAskBart={onAskBart} onClose={() => onDetail(false)} />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </section>
  );
}

// The two sides, and what is said when one of them is off. Written out
// rather than assembled from the side's name: the sentence has to be
// worth reading, and "nothing was deleted" is the half of it that stops
// a narrowed canvas from being mistaken for a quiet session.
const SIDE_NOTE: Record<Exclude<Shown, "both">, string> = {
  person: "Only what the person did is on the canvas; the agent's model calls and what appeared on the screen are hidden. Nothing was deleted.",
  software: "Only what the agent did is on the canvas — its model calls and what appeared on the screen. The person's own moments are hidden. Nothing was deleted.",
};

// Two words on the face of the button, and the longer name in what it
// says on hover. `software` is what the rule is called in the graph
// (lib/activity/graph.ts), where it means every moment that is not one
// of the person's; on the canvas that is the artifact's agent — its
// model calls and what it put on the screen — and Agent is what it is
// called out loud here.
const SIDE_WORD: Record<Exclude<Shown, "both">, string> = { person: "Human", software: "Agent" };

const SIDE_LABEL: Record<Exclude<Shown, "both">, string> = {
  person: "the person's moments",
  software: "the agent's moments",
};

const other = (side: Exclude<Shown, "both">): Exclude<Shown, "both"> => (side === "person" ? "software" : "person");

// Pressing the side that is already alone shows the other one instead of
// showing nothing; pressing the one that is off brings it back.
const nextShown = (shown: Shown, side: Exclude<Shown, "both">): Shown =>
  shown === "both" ? other(side) : shown === side ? other(side) : "both";

// One stream, on or off, said in a word.
//
// They were two bare icon buttons with a grey fill for on, which is the
// toolbar's usual way of saying pressed and was far too quiet for the
// only control on this canvas that changes what the canvas is: a mouse
// pointer and a chip, neither of them named, and the difference between
// on and off two shades of the same grey. On is filled and on is legible
// now, off is an outline, and each says which stream it is.
function Side({ side, shown, onShown, children }: {
  side: Exclude<Shown, "both">;
  shown: Shown;
  onShown: (shown: Shown) => void;
  children: React.ReactNode;
}) {
  const on = shown === "both" || shown === side;
  // What pressing it will do, not what it is. The middle case is the one
  // worth the words: pressing the side that is alone does not turn it
  // off, it hands the canvas to the other one.
  const title = shown === side ? `Show ${SIDE_LABEL[other(side)]} instead`
    : shown === "both" ? `Hide ${SIDE_LABEL[side]}`
    : `Show ${SIDE_LABEL[side]} as well`;
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={SIDE_LABEL[side]}
      title={title}
      onClick={() => onShown(nextShown(shown, side))}
      className={cn(
        "flex h-7 shrink-0 items-center gap-1.5 rounded px-2 text-[12px] font-medium transition-colors",
        on
          ? "bg-foreground text-background"
          : "text-muted-foreground ring-1 ring-inset ring-border hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
      {SIDE_WORD[side]}
    </button>
  );
}

// What to say when there is nothing on the line yet.
function emptyText(repoName: string, run: SandboxRun, trace: TraceView): string | null {
  // Only a canvas with something on it says nothing. It used to fall
  // silent while the trace was being read as well, which left the
  // Visualizer blank — no cards, no sentence, nothing to say whether
  // this run had no activity in it or had not been looked at yet. A run
  // with nothing in it is the ordinary case and the sentence below is
  // already true of it; a trace that does arrive draws over it.
  if (trace.stages.length) return null;
  // Not read yet is not the same as nothing to read. Either sentence
  // below is a claim about the run, and making it before the fetch has
  // answered means making it and then being contradicted by the cards
  // half a second later — which is what you see if you press Visualizer
  // the moment a repository is open.
  if (trace.loading) return "Reading this run's trace…";
  if (run.status === "running") return `Use ${repoName} in the Live preview; what you do there, and each model call it makes, appears here as it happens.`;
  return trace.rows.length ? "Nothing was done in the application during this run." : "Nothing has been recorded for this run yet.";
}
