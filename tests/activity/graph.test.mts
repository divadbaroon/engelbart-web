// The canvas's node stream, built from the same episodes the timeline
// draws.
//
// The point of these is that there is only one reading. A participant
// node must BE an episode — same words, same class, same provenance —
// because the moment the canvas is allowed to phrase things its own way
// the two views start telling different stories about one trace. Most of
// what follows checks that nothing was re-derived.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classify } from "../../lib/activity/classify.ts";
import { ROPE_TAXONOMY, ropeSurface } from "../../lib/activity/rope.ts";
import { DEFAULT_GRAPH, graphOf, stageIdOf } from "../../lib/activity/graph.ts";
import type { Stage } from "../../lib/trace/timeline.ts";
import { events, frames, stages, callInfo } from "./session.mts";

const episodes = classify({ stages, frames, events, taxonomy: ROPE_TAXONOMY, surfaceOf: ropeSurface, calls: callInfo });
const graph = graphOf(episodes, stages, ROPE_TAXONOMY);
const people = graph.filter((n) => n.kind === "participant");

describe("the participant's side of the canvas is the Activity reading", () => {
  it("says exactly what the timeline says, word for word", () => {
    // Not "something equivalent". The same string, from the same object.
    for (const node of people) {
      const episode = episodes.find((e) => e.id === node.episodeId);
      assert.ok(episode, `every node came from an episode: ${node.id}`);
      assert.equal(node.description, episode.description);
      assert.equal(node.broad, episode.broadBehavior);
      assert.equal(node.sub, episode.subBehavior);
      assert.equal(node.durationMs, episode.durationMs);
    }
  });

  it("leads back into the trace by the episode's own provenance", () => {
    for (const node of people) {
      const episode = episodes.find((e) => e.id === node.episodeId)!;
      assert.deepEqual(node.stageIds, episode.stageIds);
      assert.equal(node.stageId, episode.stageIds[0], "the node's moment is the episode's first stage, not a new idea");
      assert.ok(stages.some((s) => s.id === node.stageId), "and it is a stage that exists");
    }
  });

  it("keeps writing and sending apart, which is the distinction the canvas used to lose", () => {
    // One "Submitted text" stage used to be one node covering the
    // composing, the send and the wait. It is now two nodes with one
    // stage behind them, and that stage backing two moments is the truth
    // about it rather than a problem with it.
    //
    // A stage backing two moments is no longer only writing-then-sending:
    // a deed opens a stretch, so the approach to a control and the
    // pressing of it are two moments of one stage too. Both splits are
    // the same fact about a stage, and what this holds is that the
    // writing/sending one is still made.
    const shared = new Map<string, string[]>();
    for (const n of people) shared.set(n.stageId, [...(shared.get(n.stageId) ?? []), n.broad]);
    const split = [...shared.values()].filter((b) => b.length > 1);
    assert.ok(split.some((b) => b.join() === "FORMULATING,ACTING"), `writing then sending: ${split.map((b) => b.join(" + ")).join(" | ")}`);
  });

  it("never invents a node the reading does not have", () => {
    const ids = new Set(episodes.map((e) => e.id));
    for (const n of people) assert.ok(ids.has(n.episodeId), `${n.episodeId} is an episode`);
    assert.ok(people.length <= episodes.length, "the canvas is a subset of the timeline, never more");
  });
});

describe("what the graph draws once rather than twice", () => {
  it("folds a wait into the model call that is the same stretch of clock", () => {
    // In the recording a wait and its call begin at the same
    // millisecond. Two nodes over one interval would say the same thing
    // twice and imply the wait caused the call.
    const waits = episodes.filter((e) => e.broadBehavior === "WAITING");
    assert.ok(waits.length > 0, "the recording has waits");
    for (const w of waits) {
      assert.ok(!people.some((n) => n.episodeId === w.id), "a wait whose call is drawn is not a node of its own");
      const call = graph.find((n) => n.kind === "model" && n.callId === w.evidence.call?.callId);
      assert.ok(call, "and the call it was folded into is on the canvas");
    }
  });

  it("keeps a wait that has no model call to fold into", () => {
    // Folding is only honest while there is something to fold into.
    // Without this the graph would lose a stretch of the session in
    // silence, which is worse than a redundant node.
    const orphan = graphOf(episodes, stages.filter((s) => s.stage !== "call"), ROPE_TAXONOMY);
    const waits = orphan.filter((n) => n.kind === "participant" && n.broad === "WAITING");
    assert.equal(waits.length, episodes.filter((e) => e.broadBehavior === "WAITING").length);
  });

  it("can be told not to fold at all", () => {
    const every = graphOf(episodes, stages, ROPE_TAXONOMY, { ...DEFAULT_GRAPH, foldWaitIntoCall: false });
    assert.ok(every.filter((n) => n.kind === "participant" && n.broad === "WAITING").length > 0);
  });

  it("never draws a stretch in which nothing was recorded, however long", () => {
    // A silence has no stage behind it, because nothing happened in it.
    // There is no card to draw and nothing for a card to lead back to,
    // and the line between the moments on either side already carries how
    // long it was. The recording has two minutes of this.
    const silences = episodes.filter((e) => !e.stageIds.length);
    assert.ok(silences.length > 0, "the recording has silences");
    assert.ok(silences.some((e) => e.durationMs > 60_000), "including a long one");
    for (const e of silences) {
      assert.equal(e.broadBehavior, "UNCLEAR", "only an unclear stretch can have nothing behind it");
      assert.ok(!people.some((n) => n.episodeId === e.id), `${e.durationMs}ms of silence is not a node`);
    }
  });

  it("drops a recorded stretch too short to characterise, and keeps a longer one", () => {
    // This one the recording cannot show — every unclear stretch in it is
    // a silence — so it is put to episodes with a moment behind them.
    const real = episodes.find((e) => e.stageIds.length)!;
    const tiny = { ...real, id: "episode:tiny", broadBehavior: "UNCLEAR" as const, durationMs: 57 };
    const long = { ...real, id: "episode:long", broadBehavior: "UNCLEAR" as const, durationMs: 45_000 };
    const drawn = (e: typeof tiny) => graphOf([e], stages, ROPE_TAXONOMY).some((n) => n.kind === "participant" && n.episodeId === e.id);
    assert.equal(drawn(tiny), false, "57ms of uncharacterised clicking is clutter");
    assert.equal(drawn(long), true, "45s of it is a moment");
    // And a send is nine milliseconds, so the floor must not touch it.
    const send = episodes.find((e) => e.broadBehavior === "ACTING" && e.durationMs < 1_000);
    if (send) assert.ok(people.some((n) => n.episodeId === send.id), `a ${send.durationMs}ms send is still drawn`);
  });

  it("leaves everything it does not draw in the reading underneath", () => {
    // A display rule, never a deletion.
    const drawn = new Set(people.map((n) => n.episodeId));
    const hidden = episodes.filter((e) => !drawn.has(e.id));
    assert.ok(hidden.length > 0);
    for (const e of hidden) assert.ok(episodes.includes(e), "still an episode");
  });
});

describe("the system's side", () => {
  it("keeps every model call as a node of its own", () => {
    const callStages = stages.filter((s) => s.stage === "call" && s.callId);
    assert.equal(graph.filter((n) => n.kind === "model").length, callStages.length);
    for (const s of callStages) assert.ok(graph.some((n) => n.kind === "model" && n.stageId === s.id), `${s.id} is drawn`);
  });

  it("keeps a model node's stage, so its captured request and output still open", () => {
    for (const n of graph.filter((n) => n.kind === "model")) {
      assert.equal(n.id, `moment:${n.stageId}`, "a model node is still named by its stage");
      assert.ok(stages.some((s) => s.id === n.stageId && s.stage === "call"));
    }
  });

  it("tells two different outcomes apart when they landed together", () => {
    // One burst of mutations can be the tutor answering AND a line being
    // added to the requirements AND the person's own message echoed back.
    // The first two are different things to have happened, so they are
    // different nodes sharing the stage they were read from; the third is
    // the echo of what they sent and is already their ACTING node.
    //
    // This recording has no response stage of its own — traceStages cut
    // none for it — so the burst is made from its own events, grouped the
    // way a response stage groups them.
    const burst: Stage = { ...stages.find((s) => s.stage === "submit")!, id: "stage:response:made-up", stage: "response", title: "Response appeared", events };
    const observed = graphOf(episodes, [...stages, burst], ROPE_TAXONOMY).filter((n) => n.kind === "observed");
    assert.equal(observed.length, 2, `the tutor and the requirements, and not the person: ${observed.map((n) => n.label).join(" | ")}`);
    assert.deepEqual(observed.map((n) => n.label).sort(), ["The requirements document was added to", "The tutor answered"]);
    for (const n of observed) {
      assert.equal(n.stageId, burst.id, "both lead back to the burst they were read from");
      assert.ok(n.text, "and each says what appeared");
    }
  });
});

describe("order and provenance", () => {
  it("runs forwards", () => {
    for (let i = 1; i < graph.length; i++) {
      assert.ok(Date.parse(graph[i].at) >= Date.parse(graph[i - 1].at), `${graph[i].id} is not before ${graph[i - 1].id}`);
    }
  });

  it("puts the act before the answer when they share an instant", () => {
    // A send and the call it opened can land on the same millisecond.
    // The person acted; the system answered.
    for (let i = 1; i < graph.length; i++) {
      const a = graph[i - 1], b = graph[i];
      if (Date.parse(a.at) !== Date.parse(b.at)) continue;
      const rank = { participant: 0, model: 1, observed: 2 } as const;
      assert.ok(rank[a.kind] <= rank[b.kind], `${a.kind} before ${b.kind}`);
    }
  });

  it("gives every node a name that leads back to its moment", () => {
    const ids = new Set<string>();
    for (const n of graph) {
      assert.ok(!ids.has(n.id), `no two nodes share a name: ${n.id}`);
      ids.add(n.id);
      assert.equal(stageIdOf(n.id), n.stageId, `${n.id} leads back to ${n.stageId}`);
    }
  });

  it("reads the same session the same way twice", () => {
    assert.deepEqual(graphOf(episodes, stages, ROPE_TAXONOMY).map((n) => n.id), graph.map((n) => n.id));
  });
});

// Which side of the session is drawn.
//
// A display rule like the fold above it, and the same danger: a canvas
// showing one stream must go on saying what happened in the stretches the
// other one filled, or the session reads as shorter than it was.
describe("showing one side of the session", () => {
  const person = graphOf(episodes, stages, ROPE_TAXONOMY, { ...DEFAULT_GRAPH, shown: "person" });
  const software = graphOf(episodes, stages, ROPE_TAXONOMY, { ...DEFAULT_GRAPH, shown: "software" });

  it("draws both by default, and the rule changes nothing when it is at both", () => {
    const both = graphOf(episodes, stages, ROPE_TAXONOMY, { ...DEFAULT_GRAPH, shown: "both" });
    assert.deepEqual(both.map((n) => n.id), graph.map((n) => n.id));
    assert.equal(DEFAULT_GRAPH.shown, "both");
  });

  it("keeps only the person's moments on the person's side", () => {
    assert.ok(person.length > 0);
    assert.ok(person.every((n) => n.kind === "participant"), "no model or observed node survives");
  });

  it("keeps only the software's moments on the software's side", () => {
    assert.ok(software.length > 0);
    assert.ok(software.every((n) => n.kind === "model" || n.kind === "observed"), "no participant node survives");
    assert.ok(software.some((n) => n.kind === "model"));
  });

  it("counts what appeared as the software's side, not the person's", () => {
    // The recorded session has no response stage in it — ROPE's answers
    // arrive as mutations the reading folds elsewhere — so this is the
    // one claim the fixture cannot make on its own. What appeared is the
    // system's side of the exchange even though it is not a model call,
    // and a toggle that said "software" while leaving the answers on the
    // person's side would be showing something other than what it says.
    const appeared: Stage = {
      kind: "stage", id: "response-1", stage: "response",
      at: stages[stages.length - 1].endAt, endAt: stages[stages.length - 1].endAt,
      label: "Response appeared", detail: null, link: null, callId: null,
      title: "Response appeared", rows: [], events: [],
    };
    const withOne = [...stages, appeared];
    const onSoftware = graphOf(episodes, withOne, ROPE_TAXONOMY, { ...DEFAULT_GRAPH, shown: "software" });
    const onPerson = graphOf(episodes, withOne, ROPE_TAXONOMY, { ...DEFAULT_GRAPH, shown: "person" });
    assert.equal(onSoftware.filter((n) => n.kind === "observed").length, 1);
    assert.equal(onPerson.filter((n) => n.kind === "observed").length, 0);
  });

  it("gives every wait back when the call it was folded into is not drawn", () => {
    // The fold is only honest while the call is on the canvas. Hiding
    // the software takes the calls away, so the waits must come back as
    // nodes of their own — otherwise both the call and the wait go, and
    // that stretch of the session disappears with nothing saying so.
    const waits = person.filter((n) => n.kind === "participant" && n.broad === "WAITING");
    assert.equal(waits.length, episodes.filter((e) => e.broadBehavior === "WAITING").length);
    assert.ok(waits.length > 0, "the recording has waits to give back");
    // And they are still the reading's own words, not the canvas's.
    for (const w of waits) {
      const episode = episodes.find((e) => e.id === (w as { episodeId: string }).episodeId);
      assert.equal(w.kind === "participant" && w.description, episode!.description);
    }
  });

  it("loses nothing between the two sides but the folded waits", () => {
    // Every node of the whole canvas is on one side or the other. The
    // waits are the one exception and they are an addition, not a loss:
    // they exist on the person's side because the call they were folded
    // into is not there to carry them.
    const whole = new Set(graph.map((n) => n.id));
    const apart = [...person, ...software].map((n) => n.id);
    const extra = apart.filter((id) => !whole.has(id));
    const missing = [...whole].filter((id) => !apart.includes(id));
    assert.deepEqual(missing, [], "no moment of the run falls between the two sides");
    assert.ok(extra.every((id) => person.some((n) => n.id === id && n.kind === "participant" && n.broad === "WAITING")), "the only additions are the unfolded waits");
  });

  it("keeps the order the whole canvas had", () => {
    // The line between two cards is drawn from the node before it in the
    // array (components/trace/trace-canvas.tsx), so a filter that
    // reordered anything would re-link the spine wrongly.
    for (const side of [person, software]) {
      const times = side.map((n) => Date.parse(n.at));
      assert.deepEqual(times, [...times].sort((a, b) => a - b), "still in clock order");
    }
    const kept = graph.filter((n) => software.some((s) => s.id === n.id)).map((n) => n.id);
    assert.deepEqual(software.map((n) => n.id), kept, "and in the order the whole canvas had them");
  });

  it("still leads every moment back to the trace", () => {
    // The route from a card to its evidence is the node id, and it must
    // survive a filter untouched or the inspector opens on nothing.
    for (const n of [...person, ...software]) {
      assert.ok(stages.some((s) => s.id === stageIdOf(n.id)), `${n.id} leads to a stage`);
      assert.equal(stageIdOf(n.id), n.stageId);
    }
  });
});
