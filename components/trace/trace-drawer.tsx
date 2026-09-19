"use client";

import { ChevronUp, PanelRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { TraceView } from "@/hooks/use-trace-view";
import { describeSelection, selectedStage, type Selection } from "@/lib/trace/selection";
import { callOwner, momentKind, relatedCall } from "@/lib/trace/moments";
import { CorrelationTag } from "@/components/trace/rows";
import { STAGE_ICON } from "@/components/trace/nodes";
import { EventDetails } from "@/components/trace/event-details";
import { ModelCallInspector } from "@/components/trace/model-call-inspector";

// The selected moment's details: the concise account of a human or
// observed moment with its evidence folded, or the model call inspector
// with its panes. `DrawerBody` is the same either way; where it stands
// is the caller's: beside the canvas in the middle, under it on the
// side. `DrawerBar` is the closed state of the drawer under the canvas
// — what the moment is, when, and one line, with the way to open the
// details.
type Props = {
  trace: TraceView;
  selection: Selection | null;
  onSelect: (selection: Selection, options?: { detail?: boolean }) => void;
  onAskBart: () => void;
};

export function DrawerBar({ trace, selection, onSelect, onAskBart, onOpen, beside }: Props & { onOpen: () => void; beside: boolean }) {
  const stage = selectedStage(trace.stages, selection);
  const text = describeSelection(trace.stages, trace.callRows, selection);
  if (!stage || !text) return null;
  const kind = momentKind(stage);
  const Icon = STAGE_ICON[stage.stage];
  const related = relatedCall(stage, trace.stages, trace.callRows);
  return (
    <div className="flex h-9 shrink-0 items-center gap-2.5 border-t bg-[#fafafa] pl-[18px] pr-2 text-[13px]">
      <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-sm", kind === "model" ? "bg-foreground text-background" : kind === "observed" ? "border border-dashed border-foreground/40 text-muted-foreground" : "bg-[#e6e6e6] text-muted-foreground")}>
        <Icon className="size-2.5" />
      </span>
      <span className="shrink-0 font-medium">{text.title}</span>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{text.at}</span>
      {text.line && <span className="min-w-0 truncate text-muted-foreground">{text.line}</span>}
      {related && (
        <span className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground lg:flex">
          · <button type="button" onClick={() => onSelect({ kind: "call", callId: related.callId, jump: { pane: "overview", focus: null } })} className="text-foreground underline-offset-2 hover:underline">{related.model ?? "model call"}</button>
          <CorrelationTag how={related.correlation} title={related.text ?? undefined} />
        </span>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-0.5">
        <Button variant="ghost" size="sm" onClick={onAskBart} className="h-7 px-2 font-normal text-muted-foreground">Ask Bart</Button>
        <Button variant="ghost" size="sm" onClick={onOpen} title={beside ? "Open the details beside the canvas" : "Open the details under the canvas"} className="h-7 gap-1 px-2 font-normal text-muted-foreground">
          Details {beside ? <PanelRight className="size-3" /> : <ChevronUp className="size-3" />}
        </Button>
      </span>
    </div>
  );
}

export function DrawerBody({ trace, selection, onSelect, onAskBart, onClose }: Props & { onClose: () => void }) {
  const stage = selectedStage(trace.stages, selection);
  if (!selection || !stage) return null;
  const openCall = (callId: string) => onSelect({ kind: "call", callId, jump: { pane: "overview", focus: null } }, { detail: true });
  if (selection.kind === "call") {
    const call = trace.calls[selection.callId];
    if (!call) return <p className="p-6 text-center text-[13px] text-muted-foreground">The call&apos;s record has not arrived yet.</p>;
    return <ModelCallInspector call={call} jump={selection.jump} owner={callOwner(selection.callId, trace.stages, trace.callRows)} onLoadRaw={trace.loadRaw} onAskBart={onAskBart} onClose={onClose} />;
  }
  return (
    <EventDetails
      key={stage.id}
      stage={stage} stages={trace.stages} calls={trace.callRows} frames={trace.frames}
      select={{ selected: null, onSelect: openCall }} onOpenCall={openCall} onAskBart={onAskBart} onClose={onClose} back={null}
    />
  );
}
