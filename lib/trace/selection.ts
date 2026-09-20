// What the person is looking at in a trace, named by identity: a stage on
// the line, or a model call at one of the inspector's panes. The canvas
// rings it, the drawer describes it, and Bart is told it so "this" in a
// question means it. Pure: no DOM, no React.
import type { CardId } from "@/lib/trace/context";
import { formatMs, summarizeCall, type CallRow, type Stage } from "@/lib/trace/timeline";
import { liveLine, momentKind, shortClock } from "@/lib/trace/moments";
import { episodeOf } from "@/lib/activity/read";
import type { Episode } from "@/lib/activity/types";

export type Pane = "overview" | "context" | "messages" | "tools" | "output" | "raw";
// Where a click on the graph lands: a card of the context, the model, the output.
export type Focus = CardId | "model" | "output";
export type Jump = { pane: Pane; focus: Focus | null };

// A moment on the line, or a model call at one of the inspector's panes.
//
// `episodeId` names which behaviour of that moment was chosen. One submit
// stage is the writing of a message AND the sending of it — two
// behaviours over one stage — so the stage alone no longer says what a
// person picked. It is optional because a selection can arrive from
// somewhere that only knows moments; `episodeOf` falls back to the first
// behaviour read from the stage rather than to the stage's own title.
//
// The stage id stays, and stays first: it is the evidence, and every
// existing path — the ring, the seek, the inspector, the tie to a model
// call — goes on resolving through it untouched.
export type Selection = { kind: "stage"; stageId: string; episodeId?: string } | { kind: "call"; callId: string; jump: Jump };

// The stage on the line a selection is, if it is on it.
export function selectedStage(stages: Stage[], selection: Selection | null): Stage | null {
  if (!selection) return null;
  if (selection.kind === "stage") return stages.find((s) => s.id === selection.stageId) ?? null;
  return stages.find((s) => s.stage === "call" && s.callId === selection.callId) ?? null;
}

// The episode a selection is about, where it is about one.
//
// Only for a moment of the person's. A model call and text that appeared
// are the system's: they have no behaviour behind them and keep the
// representations they always had. The rule has to be stated rather than
// assumed, because a wait genuinely spans the call it is waiting on —
// its evidence includes that stage — so asking "what was read over this
// stage" would answer "Waited for the tutor" for the call itself, which
// is the wait's moment and not the call's.
export function selectedEpisode(stages: Stage[], episodes: Episode[], selection: Selection | null): Episode | null {
  if (!selection || selection.kind !== "stage") return null;
  const stage = selectedStage(stages, selection);
  if (!stage || momentKind(stage) !== "human") return null;
  return episodeOf(episodes, selection.episodeId, selection.stageId);
}

// The selection in a few words, for the line above Bart's input and for
// the drawer's bar: what it is, when, and the one line that says more.
//
// Where the selection is a person's moment, the words are the Activity
// reading's — the same sentence the timeline and the canvas show, taken
// from the same object, never re-derived here. "Submitted text" was the
// stage's name for a stretch that turns out to be somebody writing for
// eleven seconds and then sending; it is still underneath as evidence,
// and it is no longer what anybody is told they selected.
export type SelectionText = { title: string; at: string; line: string | null; badge: string | null };
export function describeSelection(stages: Stage[], calls: Map<string, CallRow>, selection: Selection | null, episodes: Episode[] = []): SelectionText | null {
  const stage = selectedStage(stages, selection);
  if (!stage) return null;
  const episode = selectedEpisode(stages, episodes, selection);
  if (episode) {
    return {
      title: episode.description,
      at: shortClock(episode.startedAt),
      line: episode.durationMs >= 1000 ? formatMs(episode.durationMs) : null,
      badge: episode.broadBehavior,
    };
  }
  const row = stage.stage === "call" && stage.callId ? calls.get(stage.callId) : undefined;
  const title = row ? summarizeCall(row).model ?? stage.title : stage.title;
  return { title, at: shortClock(stage.at), line: liveLine(stage, calls), badge: null };
}
