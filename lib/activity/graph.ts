// The session as two streams that act on each other: what the person
// was doing, and what the software did about it.
//
// The canvas and the Activity timeline are now two views of one reading.
// The timeline answers "what did they do, over time"; the canvas answers
// "how did their behaviour and the system's interleave". So this module
// takes the classified episodes — the canonical account of participant
// behaviour — and the stages that hold the system's side, and puts them
// in one order. It classifies nothing. Every participant node is an
// Episode, verbatim, and if the taxonomy changes its mind about an
// episode the canvas changes with it.
//
// Two things are deliberately NOT one node each:
//
// A wait and the model call it is waiting on are the same stretch of
// clock. In the recorded session a WAIT_FOR_TUTOR_RESPONSE episode and
// its call stage begin at the same millisecond. A timeline is read down
// the clock, so a row for the wait is the honest thing there; a graph is
// read as one thing causing another, and ACTING → WAITING → MODEL →
// OBSERVED draws the same interval twice and implies the wait caused the
// call. So the wait is folded into its call, which already carries how
// long it took — but only when that call is actually on the canvas, or
// the graph would lose a stretch of the session in silence.
//
// A stretch in which nothing was recorded is a gap, and the line between
// two moments already says how long the gap was. It has no stage behind
// it either — nothing happened, so there is no moment to lead back to —
// so it is never a node here, however long it was. A stretch that WAS
// recorded but could not be characterised is a node once it is long
// enough to be worth one; the 57ms click that ends the fresh run is not.
//
// Nothing is deleted. Both still exist in the timeline, in the evidence
// and in the export; this is a display rule, and it is a value so it can
// be argued with.
import type { Stage } from "@/lib/trace/timeline";
import { appearances } from "@/lib/activity/segment";
import type { Taxonomy } from "@/lib/activity/taxonomy";
import type { Broad, Episode } from "@/lib/activity/types";

// Which side of the session the canvas draws.
//
// This module's first sentence is that a session is two streams; this
// says which of them is on. A display rule like the two below it, and a
// value for the same reason: nothing is deleted, the episodes and the
// stages are handed over untouched, and the timeline, the evidence and
// the export still hold both sides whatever this says.
//
// "software" is the model's calls AND what appeared on the screen. An
// observed moment is not a model call — it is text the browser bridge
// watched arrive — but it is the system's side of the exchange, and
// somebody asking to see what the software did means the answer as well
// as the asking.
export type Shown = "both" | "person" | "software";

export type GraphRules = {
  // A wait is drawn as its model call rather than as a node of its own.
  foldWaitIntoCall: boolean;
  // Below this, a stretch that was recorded but could not be
  // characterised is left off. It does not govern silence: a stretch in
  // which nothing was recorded has no moment behind it and is never a
  // node, however long it was. The default matches the segmenter's
  // `gapMs`, so "long enough to end an episode" and "long enough to be
  // one" are the same number.
  minUnclearMs: number;
  // Which of the two streams to draw.
  shown: Shown;
};
export const DEFAULT_GRAPH: GraphRules = { foldWaitIntoCall: true, minUnclearMs: 20_000, shown: "both" };

// What the person was doing. An Episode, carried whole.
export type ParticipantNode = {
  kind: "participant";
  id: string;
  at: string;
  endAt: string;
  durationMs: number;
  broad: Broad;
  sub: string;
  description: string;
  // Back into the trace, from the episode's own provenance and not from
  // anything this module invented. A stage can back two nodes — the
  // composing and the send are cut from one submit stage — so both lead
  // to the same moment, which is the truth about them.
  stageId: string;
  stageIds: string[];
  episodeId: string;
};

// What the software did. These keep their stages, so the inspector, the
// captured request context, the output and every tie the trace recorded
// go on working untouched.
export type ModelNode = { kind: "model"; id: string; at: string; endAt: string; stageId: string; callId: string };
export type ObservedNode = { kind: "observed"; id: string; at: string; endAt: string; stageId: string; label: string; text: string | null };
export type GraphNode = ParticipantNode | ModelNode | ObservedNode;

const ms = (iso: string) => Date.parse(iso);
const clip = (s: string, max: number) => { const one = s.replace(/\s+/g, " ").trim(); return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one; };

// At the same instant, the person acted before the system answered. Only
// a tie-break: everything here is ordered by the clock first.
const STREAM: Record<GraphNode["kind"], number> = { participant: 0, model: 1, observed: 2 };

export function graphOf(episodes: Episode[], stages: Stage[], taxonomy: Taxonomy, rules: GraphRules = DEFAULT_GRAPH): GraphNode[] {
  const out: GraphNode[] = [];

  // The system's side first, so that folding a wait can ask whether its
  // call is really going to be drawn.
  //
  // With the software hidden there are no call stages and so no drawn
  // calls, which the fold below reads: it stops firing, and every wait
  // comes back as a node of its own. That is the point rather than a
  // side effect. A wait is folded into its call because the two are one
  // stretch of clock and drawing both draws it twice — but with the call
  // gone, folding the wait too would take that stretch of the session
  // off the canvas with nothing left to say it happened.
  const callStages = rules.shown === "person" ? [] : stages.filter((s) => s.stage === "call" && s.callId);
  const drawnCalls = new Set(callStages.map((s) => s.callId as string));
  for (const stage of callStages) {
    out.push({ kind: "model", id: `moment:${stage.id}`, at: stage.at, endAt: stage.endAt, stageId: stage.id, callId: stage.callId as string });
  }

  // What appeared, by the channel that showed it. One response stage can
  // carry two different outcomes — the tutor answering and a line being
  // added to the requirements — and those are different things to have
  // happened, so they are different nodes. They share the stage they were
  // read from, because that is where the evidence is.
  const named = new Map(taxonomy.channels.map((c) => [c.id, c]));
  for (const stage of rules.shown === "person" ? [] : stages.filter((s) => s.stage === "response")) {
    const seen = new Map<string, string>();
    for (const a of appearances(stage.events)) {
      const channel = taxonomy.channels.find((c) => c.is(a));
      // The person's own words coming back are the echo of what they
      // sent, which is already their ACTING node. Not an outcome.
      if (channel && channel.from === "person") continue;
      const key = channel?.id ?? "";
      if (!seen.has(key)) seen.set(key, a.text);
    }
    // Text that landed somewhere the taxonomy cannot name is a mutation
    // rather than an outcome, and beside an outcome it is noise: a burst
    // that repainted a container while the tutor answered is the tutor
    // answering. It becomes a node only when it is all there was, so that
    // a moment the canvas used to show is never silently lost.
    if (seen.size > 1) seen.delete("");
    if (!seen.size) seen.set("", "");
    for (const [key, text] of seen) {
      const channel = key ? named.get(key) : undefined;
      out.push({
        kind: "observed",
        id: `moment:${stage.id}${key ? `@${key}` : ""}`,
        at: stage.at, endAt: stage.endAt, stageId: stage.id,
        // "the tutor" → "The tutor answered". A channel the taxonomy does
        // not name falls back to what the stage already called itself.
        label: channel ? sentence(channel.label, channel.verb) : stage.title,
        text: text ? clip(text, 120) : null,
      });
    }
  }

  // And the person's side, from the episodes, unaltered.
  if (rules.shown !== "software") episodes.forEach((e, i) => {
    // A stretch in which nothing was recorded has no stage behind it,
    // because nothing happened in it. There is no moment to draw and no
    // moment to lead back to, and the line between the moments on either
    // side already carries how long the gap was. A timeline is read down
    // the clock and so must show it; a graph is read as one thing leading
    // to another, and silence leads to nothing.
    const stageId = e.stageIds[0];
    if (!stageId) return;
    // Something did happen, but too little of it, and too briefly, to be
    // worth a card: the 57ms uncharacterised click that ends the fresh
    // run. Only UNCLEAR is held to this — a send is nine milliseconds and
    // is the most important moment on the canvas.
    if (e.broadBehavior === "UNCLEAR" && e.durationMs < rules.minUnclearMs) return;
    if (rules.foldWaitIntoCall && e.broadBehavior === "WAITING" && e.evidence.call && drawnCalls.has(e.evidence.call.callId)) return;
    out.push({
      kind: "participant",
      // The stage is in the id so that choosing a node still reaches the
      // trace by the route it always did; the episode makes it unique,
      // because one stage can be two moments.
      id: `moment:${stageId}@ep${i}`,
      at: e.startedAt, endAt: e.endedAt, durationMs: e.durationMs,
      broad: e.broadBehavior, sub: e.subBehavior, description: e.description,
      stageId, stageIds: e.stageIds, episodeId: e.id,
    });
  });

  return out.sort((a, b) => ms(a.at) - ms(b.at) || STREAM[a.kind] - STREAM[b.kind]);
}

// "the tutor" → "The tutor answered"; "the requirements document" → "The
// requirements document was added to". The verb is the channel's own, and
// a channel that does not give one is spoken about in the plain form.
//
// This used to test for the id `requirements`, which is a channel of one
// artifact — the last place in the drawing layer that knew the name of
// something in somebody's application.
function sentence(label: string, verb: string | undefined): string {
  const head = label.charAt(0).toUpperCase() + label.slice(1);
  return `${head} ${verb || "answered"}`;
}

// The stage a node leads back to, for a canvas that only knows node ids.
export const stageIdOf = (nodeId: string): string => nodeId.replace(/^moment:/, "").split("@")[0];
