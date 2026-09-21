"use client";

import type { TraceView } from "@/hooks/use-trace-view";
import { selectedEpisode, selectedStage, type Selection } from "@/lib/trace/selection";
import { callOwner } from "@/lib/trace/moments";
import type { Episode } from "@/lib/activity/types";
import { EventDetails } from "@/components/trace/event-details";
import { ModelCallInspector } from "@/components/trace/model-call-inspector";

// The selected moment's details: the concise account of a human or
// observed moment with its evidence folded, or the model call inspector
// with its panes.
//
// There used to be a closed state of this drawer as well — a bar along
// the bottom of the canvas repeating the chosen card's badge, title,
// clock and duration, with a Details button on the end. It was a second
// account of the card the person had just clicked, standing between them
// and the account that has everything. Choosing a card opens this
// directly now (components/trace/behavior-trace.tsx), and the related
// call it used to offer is in `EventDetails` where the rest of the
// evidence is.
type Props = {
  trace: TraceView;
  // The session's behaviour, read once above and passed down. The drawer
  // describes what was selected in the Activity reading's own words, so
  // it cannot disagree with the card the person clicked.
  episodes: Episode[];
  selection: Selection | null;
  onSelect: (selection: Selection, options?: { detail?: boolean }) => void;
  onAskBart: () => void;
};

export function DrawerBody({ trace, episodes, selection, onSelect, onAskBart, onClose }: Props & { onClose: () => void }) {
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
      key={`${stage.id}:${selection.episodeId ?? ""}`}
      episode={selectedEpisode(trace.stages, episodes, selection)}
      stage={stage} stages={trace.stages} calls={trace.callRows} frames={trace.frames}
      select={{ selected: null, onSelect: openCall }} onOpenCall={openCall} onAskBart={onAskBart} onClose={onClose} back={null}
    />
  );
}
