// The whole reading, as JSON, with the events it was read from under it.
//
// The point is that a classification should be arguable. A row saying
// "Experimented with the reference game" is a claim, and the only way to
// disagree with it is to see the 32 keypresses in the reference frame
// that it was made from. So the export is the episodes, their evidence,
// the stages they group and — under each one — every raw event, in the
// order the trace holds them.
//
// It is the stored events verbatim, with nothing added. Nothing is fetched
// to build it and nothing is summarised away, so what a reader checks is
// what the classifier saw. Two things are deliberately not in it, because
// they are not in an episode either: a model call appears as its id, model
// and latency and never as its prompt or its answer, and `ui.input` has
// only ever carried the length of what was typed.
import type { Stage } from "@/lib/trace/timeline";
import { targetOf, type ElementTarget, type TraceEvent } from "@/lib/trace/types";
import type { Segmentation } from "@/lib/activity/segment";
import type { Episode } from "@/lib/activity/types";

export const ACTIVITY_FORMAT = "engelbart.activity/1";

export type ExportedEvent = {
  at: string;
  seq: number;
  kind: string;
  source: string;
  frameId: string | null;
  interactionId: string | null;
  requestId: string | null;
  callId: string | null;
  // What the event was about, as the trace already named it: the same
  // element a rule would have matched on.
  target: ElementTarget | null;
  data: Record<string, unknown> | null;
};

export type ExportedStage = { id: string; kind: Stage["stage"]; title: string; at: string; endAt: string; callId: string | null };

export type ExportedEpisode = Omit<Episode, "stages" | "events"> & { stages: ExportedStage[]; events: ExportedEvent[] };

export type ActivityExport = {
  format: typeof ACTIVITY_FORMAT;
  runId: string | null;
  recordingId: string | null;
  taxonomy: string;
  segmentation: Segmentation;
  exportedAt: string;
  episodeCount: number;
  eventCount: number;
  episodes: ExportedEpisode[];
};

const frameOf = (e: TraceEvent): string | null => {
  const id = (e.data ?? {}).frameId;
  return typeof id === "string" ? id : null;
};

export const exportEvent = (e: TraceEvent): ExportedEvent => ({
  at: e.at,
  seq: e.seq,
  kind: e.kind,
  source: e.source,
  frameId: frameOf(e),
  interactionId: e.interactionId,
  requestId: e.requestId,
  callId: e.callId,
  target: targetOf(e),
  data: e.data,
});

// Every event an episode was read from, in the order the trace holds
// them. Deliberately the episode's own events rather than its stages'
// whole contents: a submit stage is cut into composing, sending and
// waiting, and each of those is a different episode of this timeline, so
// exporting the stage whole would give all three the same events and
// make the cut that the reading turns on invisible.
//
// Events can arrive out of order across frames — the gateway stamps each
// with the sandbox's clock after correcting it — so they are sorted by
// sequence, which is the one total order there is.
export function eventsOf(episode: Episode): ExportedEvent[] {
  const seen = new Set<number>();
  const out: ExportedEvent[] = [];
  for (const e of episode.events) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(exportEvent(e));
  }
  return out.sort((a, b) => a.seq - b.seq);
}

const exportStage = (s: Stage): ExportedStage => ({ id: s.id, kind: s.stage, title: s.title, at: s.at, endAt: s.endAt, callId: s.callId ?? null });

export function exportEpisode(episode: Episode): ExportedEpisode {
  const rest = { ...episode } as Partial<Episode>;
  delete rest.stages;
  delete rest.events;
  return { ...(rest as Omit<Episode, "stages" | "events">), stages: episode.stages.map(exportStage), events: eventsOf(episode) };
}

export function activityExport(input: {
  episodes: Episode[];
  taxonomy: string;
  segmentation: Segmentation;
  runId?: string | null;
  recordingId?: string | null;
  now?: Date;
}): ActivityExport {
  const episodes = input.episodes.map(exportEpisode);
  return {
    format: ACTIVITY_FORMAT,
    runId: input.runId ?? null,
    recordingId: input.recordingId ?? null,
    taxonomy: input.taxonomy,
    segmentation: input.segmentation,
    exportedAt: (input.now ?? new Date()).toISOString(),
    episodeCount: episodes.length,
    eventCount: episodes.reduce((n, e) => n + e.events.length, 0),
    episodes,
  };
}

// Indented, because it is going into somebody's editor or notebook and
// the first thing they will do to a single line is reformat it.
export const activityJson = (x: ActivityExport | ExportedEpisode): string => JSON.stringify(x, null, 2);
