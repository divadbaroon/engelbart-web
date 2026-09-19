// What the person is looking at in a trace, named by identity: a stage on
// the line, or a model call at one of the inspector's panes. The canvas
// rings it, the drawer describes it, and Bart is told it so "this" in a
// question means it. Pure: no DOM, no React.
import type { CardId } from "@/lib/trace/context";
import { summarizeCall, type CallRow, type Stage } from "@/lib/trace/timeline";
import { liveLine, shortClock } from "@/lib/trace/moments";

export type Pane = "overview" | "context" | "messages" | "tools" | "output" | "raw";
// Where a click on the graph lands: a card of the context, the model, the output.
export type Focus = CardId | "model" | "output";
export type Jump = { pane: Pane; focus: Focus | null };

export type Selection = { kind: "stage"; stageId: string } | { kind: "call"; callId: string; jump: Jump };

// The stage on the line a selection is, if it is on it.
export function selectedStage(stages: Stage[], selection: Selection | null): Stage | null {
  if (!selection) return null;
  if (selection.kind === "stage") return stages.find((s) => s.id === selection.stageId) ?? null;
  return stages.find((s) => s.stage === "call" && s.callId === selection.callId) ?? null;
}

// The selection in a few words, for the line above Bart's input and for
// the drawer's bar: what it is, when, and the one line the trace says.
export type SelectionText = { title: string; at: string; line: string | null };
export function describeSelection(stages: Stage[], calls: Map<string, CallRow>, selection: Selection | null): SelectionText | null {
  const stage = selectedStage(stages, selection);
  if (!stage) return null;
  const row = stage.stage === "call" && stage.callId ? calls.get(stage.callId) : undefined;
  const title = row ? summarizeCall(row).model ?? stage.title : stage.title;
  return { title, at: shortClock(stage.at), line: liveLine(stage, calls) };
}
