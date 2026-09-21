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
import { BLIND_TAXONOMY, blindSurface } from "@/lib/activity/blind";
import { DEFAULT_SEGMENTATION, type Segmentation } from "@/lib/activity/segment";
import type { Taxonomy } from "@/lib/activity/taxonomy";
import type { Episode, SurfaceRole } from "@/lib/activity/types";

export type SessionInput = {
  stages: Stage[];
  frames: Map<string, FrameInfo>;
  events: TraceEvent[];
  calls?: Map<string, { model: string | null; latencyMs: number | null }>;
  semantics?: SemanticIndex;
  // How to read it: the artifact's own profile, compiled. Left out, the
  // reading is artifact-blind — it names nothing, because nothing here
  // knows what the artifact is.
  //
  // This default used to be ROPE's taxonomy, and that was a bug with a
  // vocabulary: an artifact with no profile was described in another
  // artifact's words, confidently, with nothing on the page to say so.
  // ROPE is now reached the way any artifact is reached, by being named.
  //
  // A caller that brings its own taxonomy brings its own way of naming
  // surfaces with it: falling back to another's would answer questions
  // about one artifact with a second artifact's vocabulary. So
  // `surfaceOf` defaults to the blind namer only when the taxonomy does
  // too, and otherwise to the classifier's own table lookup.
  taxonomy?: Taxonomy;
  surfaceOf?: (key: string) => { label: string; role: SurfaceRole };
  segmentation?: Segmentation;
};

export function readSession(input: SessionInput): Episode[] {
  const taxonomy = input.taxonomy ?? BLIND_TAXONOMY;
  return classify({
    stages: input.stages,
    frames: input.frames,
    events: input.events,
    calls: input.calls,
    semantics: input.semantics,
    taxonomy,
    surfaceOf: input.surfaceOf ?? (input.taxonomy ? undefined : blindSurface),
    segmentation: input.segmentation ?? DEFAULT_SEGMENTATION,
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
