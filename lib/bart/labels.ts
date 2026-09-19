// A reference in a few words, from the trace it points into: the
// moment's title and clock, the call's model and pane, the file and its
// lines. Pure; used by the panel to label chips.
import type { Ref, SelectionRef } from "@/lib/bart/protocol";
import { plainRefLabel } from "@/lib/bart/protocol";
import type { Selection } from "@/lib/trace/selection";
import { summarizeCall, type CallRow, type Stage } from "@/lib/trace/timeline";
import { momentKind, shortClock } from "@/lib/trace/moments";

export function refLabel(ref: Ref, stages: Stage[], calls: Map<string, CallRow>): string {
  switch (ref.kind) {
    case "moment": {
      const stage = stages.find((s) => s.id === ref.stageId);
      if (!stage) return "moment (not in this run)";
      const row = stage.stage === "call" && stage.callId ? calls.get(stage.callId) : undefined;
      return `${row ? summarizeCall(row).model ?? stage.title : stage.title} · ${shortClock(stage.at)}`;
    }
    case "call": {
      const row = calls.get(ref.callId);
      if (!row) return `${plainRefLabel(ref)} (not in this run)`;
      const model = summarizeCall(row).model ?? "model call";
      return ref.pane && ref.pane !== "overview" ? `${model} · ${ref.pane}` : `${model} · ${shortClock(row.at)}`;
    }
    default: return plainRefLabel(ref);
  }
}

// The selection as the route takes it: identity only, so nothing the
// screen happens to say travels with the question.
export const toSelectionRef = (s: Selection | null): SelectionRef | null =>
  !s ? null : s.kind === "stage" ? { stageId: s.stageId, callId: null } : { stageId: null, callId: s.callId };

// What the panel over the canvas offers to ask about, from the kind of
// moment that is selected. Naming the kind is the whole point: it tells
// the person what "this" will mean. Nothing here constrains the answer.
export function askPlaceholder(stage: Stage | null): string {
  if (!stage) return "Ask Bart about this run\u2026";
  switch (momentKind(stage)) {
    case "model": return "Ask Bart about this model call\u2026";
    case "observed": return "Ask Bart about this response\u2026";
    default: return "Ask Bart about this interaction\u2026";
  }
}
