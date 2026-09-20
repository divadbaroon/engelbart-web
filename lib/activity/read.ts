// The one way this application reads a session into behaviour.
//
// Everything that wants to know what somebody was doing — the Activity
// timeline, the canvas, the drawer, the inspector, Bart's grounding —
// comes through here, so that the taxonomy and the thresholds are chosen
// in one place rather than at each call site. That matters more than it
// looks: the browser and the server both derive episodes, from the same
// events, and the whole point of the Activity layer is that they arrive
// at the same sentence. A second call site passing a different
// segmentation would be two readings again, quietly.
//
// Pure, and no model call: this is the deterministic layer.
import type { FrameInfo, Stage } from "@/lib/trace/timeline";
import type { TraceEvent } from "@/lib/trace/types";
import type { SemanticIndex } from "@/lib/semantics/lookup";
import { classify } from "@/lib/activity/classify";
import { ROPE_TAXONOMY, ropeSurface } from "@/lib/activity/rope";
import { DEFAULT_SEGMENTATION } from "@/lib/activity/segment";
import type { Episode } from "@/lib/activity/types";

export type SessionInput = {
  stages: Stage[];
  frames: Map<string, FrameInfo>;
  events: TraceEvent[];
  calls?: Map<string, { model: string | null; latencyMs: number | null }>;
  semantics?: SemanticIndex;
};

export function readSession(input: SessionInput): Episode[] {
  return classify({
    stages: input.stages,
    frames: input.frames,
    events: input.events,
    calls: input.calls,
    semantics: input.semantics,
    taxonomy: ROPE_TAXONOMY,
    surfaceOf: ropeSurface,
    segmentation: DEFAULT_SEGMENTATION,
  });
}

// The episode a selection names.
//
// By its own id where there is one — a submit stage is cut into the
// composing and the send, and those are two behaviours, so the stage
// alone cannot say which was chosen. Where there is no id, the first
// episode read from that stage: a selection made before this existed, or
// one arriving from somewhere that only knows moments, still lands on
// something that says what the person was doing.
export function episodeOf(episodes: Episode[], episodeId: string | null | undefined, stageId: string | null | undefined): Episode | null {
  if (episodeId) {
    const named = episodes.find((e) => e.id === episodeId);
    if (named) return named;
  }
  if (!stageId) return null;
  return episodes.find((e) => e.stageIds.includes(stageId)) ?? null;
}
