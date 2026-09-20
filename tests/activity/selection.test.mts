// One reading of what somebody was doing, reached five ways.
//
// The Activity timeline, the card on the canvas, the drawer's bar, the
// inspector's header and the line Bart is grounded on each arrive at a
// selected moment by a different route. The point of threading the
// Episode through selection is that they cannot disagree: whichever
// route is taken, the sentence is the episode's own, and "Submitted
// text" — the name the collector gave the stretch it was read from —
// appears only as provenance underneath.
//
// The timeline and the inspector render `episode.description` directly
// in JSX and so are not callable from here; what is checked instead is
// everything they would have to go through to say anything else, and the
// one function that gives the drawer and the inspector their wording.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { graphOf } from "../../lib/activity/graph.ts";
import { ROPE_TAXONOMY } from "../../lib/activity/rope.ts";
import { readSession } from "../../lib/activity/read.ts";
import { describeSelection, selectedEpisode } from "../../lib/trace/selection.ts";
import { traceModel, momentReport } from "../../lib/bart/grounding.ts";
import { situationBlock } from "../../lib/bart/prompt.ts";
import { events, frames, stages, callInfo } from "./session.mts";

const episodes = readSession({ stages, frames, events, calls: callInfo });
const graph = graphOf(episodes, stages, ROPE_TAXONOMY);
const calls = new Map();

// The same session as the route reads it: from the events, never from
// anything the browser sent. Its call rows are empty here — this fixture
// has no captured calls — which is exactly the case that matters, since
// the reading must not depend on them.
const m = traceModel(events, []);

describe("one reading, whichever way a moment is reached", () => {
  it("reads the same session the same way in the browser and on the route", () => {
    // Everything below rests on this. The selection travels as
    // identities, so the route can only say what the screen says by
    // arriving at it again from the same events.
    assert.deepEqual(m.episodes.map((e) => `${e.id} ${e.broadBehavior} ${e.description}`), episodes.map((e) => `${e.id} ${e.broadBehavior} ${e.description}`));
  });

  for (const node of graph.filter((n) => n.kind === "participant")) {
    const episode = episodes.find((e) => e.id === node.episodeId)!;
    it(`says “${episode.description}” everywhere (${episode.broadBehavior})`, () => {
      const selection = { kind: "stage" as const, stageId: node.stageId, episodeId: node.episodeId };

      // 2. the card on the canvas
      assert.equal(node.description, episode.description, "canvas card");
      assert.equal(node.broad, episode.broadBehavior);

      // 3. the drawer's bar, and 4. the inspector's header, which take
      //    their wording from the same two functions.
      const text = describeSelection(stages, calls, selection, episodes)!;
      assert.equal(text.title, episode.description, "drawer bar");
      assert.equal(text.badge, episode.broadBehavior);
      assert.equal(selectedEpisode(stages, episodes, selection)!.description, episode.description, "inspector header");

      // 5. what Bart is grounded on, derived on the route from the
      //    identities alone.
      const sel = { stageId: node.stageId, callId: null, episodeId: node.episodeId };
      const situation = situationBlock({ repo: REPO, run: null, selection: sel, trace: m, source: "none", recording: null, annotation: null });
      const line = situation.split("\n").find((l) => l.startsWith('Selected moment (what "this" refers to)'))!;
      assert.ok(line.includes(episode.description), `bart grounding: ${line}`);
      const report = momentReport(m, node.stageId, false, node.episodeId)!;
      assert.ok(report.startsWith(`Activity ${episode.id}: ${episode.description}`), `inspect_moment: ${report.split("\n")[0]}`);

      // and the stage's own name is underneath, not instead of it
      const stage = stages.find((s) => s.id === node.stageId)!;
      assert.notEqual(text.title, stage.title, "the collector's name for the stretch is not what anybody is told they selected");
      assert.ok(report.includes(`which the collector called “${stage.title}”`), "it is still there as provenance");
    });
  }

  it("still names a model call and a moment of text by the system's own words", () => {
    // The change is about the person's moments. A call and text that
    // appeared keep the representations they had — and this is the case
    // that has to be stated rather than assumed, because a wait genuinely
    // spans the call it is waiting on. Asking what was read over that
    // stage answers "Waited for the tutor", which is the wait's moment
    // and not the call's; the wait is already drawn as the call.
    const system = graph.filter((n) => n.kind !== "participant");
    assert.ok(system.length > 0, "the recording has moments of the system's");
    for (const node of system) {
      const selection = { kind: "stage" as const, stageId: node.stageId };
      assert.equal(selectedEpisode(stages, episodes, selection), null, `${node.stageId} is not a behaviour of the person's`);
      const text = describeSelection(stages, calls, selection, episodes)!;
      assert.equal(text.badge, null, "no behaviour badge on a moment of the system's");
      const waits = episodes.filter((e) => e.broadBehavior === "WAITING" && e.stageIds.includes(node.stageId));
      for (const w of waits) assert.notEqual(text.title, w.description, `the wait over ${node.stageId} is not what the call is called`);
    }
    // And the stretch is not lost: the wait is still in the reading, and
    // the canvas draws it as the call it was waiting on.
    assert.ok(episodes.some((e) => e.broadBehavior === "WAITING"), "the wait is still an episode");
  });
});

const REPO = { id: "r1", fullName: "o/n", description: null, language: null } as never;
