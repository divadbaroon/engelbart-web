// Cutting the real ROPE session into stretches, before anything is named.
//
// What has to hold, in order of how badly it hurt when it did not: no two
// stretches claim the same second; a stage that happened while a model
// call was open belongs to the wait rather than to an episode laid over
// it; a silence is a stretch of its own; the document being replaced under
// somebody lands on the stretch where they came back, not on the silence
// they were away for; and the thresholds are thresholds — moving one moves
// the cuts in the direction it says on the tin.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { windows, parts, eventsOf, appearances, quietWithin, surfaceKey, DEFAULT_SEGMENTATION, type Deliberate, type Part, type Segmentation } from "../../lib/activity/segment.ts";
import type { TraceEvent } from "../../lib/trace/types.ts";
import { frames, stages, at, restage, like, isSend } from "./session.mts";

const cut = (over: Partial<Segmentation> = {}) => windows(stages, frames, { ...DEFAULT_SEGMENTATION, ...over });
const span = (w: { startedAt: string; endedAt: string }) => [at(w.startedAt), at(w.endedAt)];

describe("windows over the recorded ROPE session", () => {
  it("covers it as a sequence, with nothing overlapping and nothing backwards", () => {
    const list = cut();
    for (const w of list) assert.ok(Date.parse(w.endedAt) >= Date.parse(w.startedAt), `${span(w)} runs backwards`);
    for (let i = 1; i < list.length; i++) {
      assert.ok(
        Date.parse(list[i].startedAt) >= Date.parse(list[i - 1].endedAt),
        `${span(list[i - 1])} overlaps ${span(list[i])}`,
      );
    }
  });

  it("leaves no hole a reader would notice", () => {
    const list = cut();
    for (let i = 1; i < list.length; i++) {
      const hole = Date.parse(list[i].startedAt) - Date.parse(list[i - 1].endedAt);
      assert.ok(hole < DEFAULT_SEGMENTATION.quietMs, `a ${Math.round(hole / 1000)}s hole before ${span(list[i])}`);
    }
  });

  it("gives every stretch a place, never the bare shell", () => {
    // A model call happens on no document at all. Saying so would put the
    // person somewhere they never were; they were where they already were.
    for (const w of cut()) assert.notEqual(w.surface.key, "top");
  });

  it("keeps what was done during a model call inside the wait", () => {
    // The person pressed arrow keys 2s into a 5.7s call. One stretch, two
    // stages: the call and the keys. Not two stretches over one stretch of
    // clock, which is what an episode list must never contain.
    const wait = cut().find((w) => w.parts.some((p) => p.role === "wait"));
    assert.ok(wait, "no window holds the model call");
    assert.deepEqual(span(wait), [3, 8]);
    assert.equal(wait.parts.length, 3);
  });

  it("finds the one place the page was replaced, and puts it where they came back", () => {
    const list = cut();
    const broken = list.filter((w) => w.reloaded);
    assert.equal(broken.length, 1);
    // 03:04, the sign-in — not the 2m 2s silence that ends at 03:04.
    assert.deepEqual(span(broken[0]), [184, 186]);
    assert.equal(broken[0].kind, "activity");
  });

  it("keeps the sign-in as a stretch of its own though it is shorter than the floor", () => {
    // It runs 2s against a 2.5s floor, so the ordinary rule would fold it
    // into whatever came next and the break in the session would vanish.
    const w = cut().find((x) => x.reloaded);
    assert.ok(Date.parse(w.endedAt) - Date.parse(w.startedAt) < DEFAULT_SEGMENTATION.minEpisodeMs);
    assert.equal(w.parts.length, 1);
  });
});

describe("the thresholds are thresholds", () => {
  it("gapMs decides where a silence ends an episode", () => {
    const quiet = (cfg: Partial<Segmentation>) => cut(cfg).filter((w) => w.kind === "quiet").length;
    // Two silences in the session run past 20s — 23s and 2m 2s — and
    // each of them ends the episode before it.
    const ended = (cfg: Partial<Segmentation>) =>
      cut(cfg).filter((w) => w.kind === "activity" && w.openingQuietMs >= (cfg.gapMs ?? DEFAULT_SEGMENTATION.gapMs)).length;
    assert.equal(ended({}), 2);
    // Past the longest silence, nothing is long enough to end an episode.
    // The silences are still reported — that is `quietMs`'s job, and the
    // two knobs are deliberately independent.
    assert.equal(ended({ gapMs: 300_000 }), 0);
    assert.ok(quiet({ gapMs: 300_000 }) > 0);
    // Tightened, more silences end one.
    assert.ok(ended({ gapMs: 5_000 }) > ended({}));
  });

  it("quietMs decides which silences are worth a row", () => {
    const rows = (quietMs: number) => cut({ quietMs }).filter((w) => w.kind === "quiet").length;
    assert.equal(rows(DEFAULT_SEGMENTATION.quietMs), 3);   // 23s, 2m 2s, 16s
    assert.equal(rows(20_000), 2);                          // the 16s one drops out
    assert.equal(rows(100_000), 1);                         // only the 2m 2s one is left
    assert.ok(rows(1_000) > 3);
  });

  it("minEpisodeMs decides what is a transition rather than an episode", () => {
    const short = (minEpisodeMs: number) => cut({ minEpisodeMs }).filter((w) => w.kind === "activity").length;
    assert.ok(short(60_000) < short(0), "a high floor must fold more stretches away");
  });

  it("reloadGapMs decides whether a replaced page broke the session", () => {
    // The page came back after 2m 2s of silence. Raise the bar past that
    // and it reads as an ordinary consequence of something clicked.
    assert.equal(cut({ reloadGapMs: 200_000 }).filter((w) => w.reloaded).length, 0);
  });
});

describe("surfaces", () => {
  it("names a document by its own query string before anything else", () => {
    const keys = [...frames.values()].map(surfaceKey);
    assert.ok(keys.includes("solution"));
    assert.ok(keys.includes("my-canvas"));
  });

  it("does not mistake a replaced document for a different one", () => {
    // ROPE's page is served five times over the session under five frame
    // ids. It is one surface throughout, or every reload would read as
    // the person having moved somewhere new.
    const pages = [...frames.values()].filter((f) => f.path === "/");
    assert.ok(pages.length > 1);
    assert.equal(new Set(pages.map(surfaceKey)).size, 1);
  });
});

// Three mistakes the segmenter made on real sessions, each one a cut it
// did not make or a cut it made in the wrong place. They are here rather
// than among the window tests because none of them is visible in the
// recording: the recording has one send per stage, and its waits happen
// to end where the answer does.
describe("cuts inside a stage", () => {
  const roles = (list: Part[]) => list.map((p) => `${p.role}@${at(p.at)}`);

  it("cuts at every send in a stage, not only the first", () => {
    // A press of Return that sent nothing, a second and a half before the
    // one that did, and both folded by traceStages into one submit stage.
    // Honouring only the first send left everything after it — the real
    // message, the call it opened, the answer — inside a single stretch.
    const before = parts(stages, DEFAULT_SEGMENTATION).filter((p) => p.role === "submit").length;
    const list = parts(restage([like(isSend, -1500, { interaction_id: "an-earlier-return" })]).stages, DEFAULT_SEGMENTATION);
    const sends = list.filter((p) => p.role === "submit");
    assert.equal(sends.length, before + 1, `the added send gets a part of its own: ${roles(list).join(" ")}`);
    // And no stretch of composing has a send of its own stage inside it:
    // the cut is made at the send, so composing ends there rather than
    // running through it. Per stage, because ROPE records one press of
    // Return as both a form submit and a keystroke and traceStages can
    // put the two in stages that overlap by a few milliseconds — which
    // is a different thing from a send being swallowed.
    for (const p of list.filter((x) => x.role === "compose")) {
      const inside = sends
        .filter((s) => s.stage === p.stage)
        .map((s) => Date.parse(s.at))
        .filter((t) => t > Date.parse(p.at) && t < Date.parse(p.endAt));
      assert.deepEqual(inside, [], `composing ends where a send begins, not around it: ${p.at}–${p.endAt}`);
    }
  });

  it("holds no callId when a stage has two sends in it", () => {
    // With one send, the stage's call is that send's call. With two, the
    // trace does not say which of them opened it, so neither may claim
    // it — an episode that claims the wrong call is worse than one that
    // claims none.
    const { stages } = restage([like(isSend, -1500, { interaction_id: "an-earlier-return" })]);
    for (const p of parts(stages, DEFAULT_SEGMENTATION)) {
      if (p.role === "submit") assert.equal(p.callId, null, "neither send claims a call it may not have opened");
    }
  });

  it("does not let a wait run past the answer it was waiting for", () => {
    const list = parts(stages, DEFAULT_SEGMENTATION);
    for (const p of list) {
      if (p.role !== "wait" || !p.callId) continue;
      const answered = p.events.filter((e) => e.kind === "model.response" || e.kind === "model.error").map((e) => Date.parse(e.at));
      if (!answered.length) continue;
      const end = Date.parse(p.endAt);
      assert.ok(
        end <= Math.max(...answered) + DEFAULT_SEGMENTATION.echoMs,
        `a wait ends when the answer lands, give or take the echo: ${p.endAt}`,
      );
    }
  });
});

describe("silence inside a stretch", () => {
  it("counts the holes between what was recorded, not the stretch itself", () => {
    // This was once measured by subtracting the stages' own spans from
    // the window, which is zero by construction for any window made of
    // stages: every episode with an act in it reported no quiet at all.
    const list = cut();
    const busy = list.find((w) => w.parts.some((p) => p.events.length > 3));
    assert.ok(busy, "the recording has a stretch with events in it");
    const rows = eventsOf([...busy.transitions, ...busy.parts]);
    const quiet = quietWithin(rows, busy.startedAt, busy.endedAt);
    const span = Date.parse(busy.endedAt) - Date.parse(busy.startedAt);
    assert.ok(quiet <= span, "a stretch cannot be quieter than it is long");
    // A run with a two-minute hole in it must report more than nothing.
    const total = list.reduce((n, w) => n + quietWithin(eventsOf([...w.transitions, ...w.parts]), w.startedAt, w.endedAt), 0);
    assert.ok(total > 60_000, `the session's silences add up: ${total}ms`);
  });

  it("is the whole stretch when nothing was recorded in it", () => {
    // Not zero. A minute in which the interface reported nothing is a
    // minute of silence, and that is what the UNCLEAR rows are made of.
    assert.equal(quietWithin([], "2026-09-20T04:49:50.000Z", "2026-09-20T04:50:50.000Z"), 60_000);
  });
});

// A brief act that the artifact calls a deed keeps its own stretch.
//
// Everything under `minEpisodeMs` used to be a doorway, folded onto the
// front of whatever came next. That is right for a tab click and wrong
// for signing in: the sign-in took 1.5 seconds, the playing that
// followed took seven, and the one that lasted least named the stretch.
describe("which brief stretches are doorways", () => {
  const isLogin: Deliberate = (events) => events.some((e) => {
    const t = (e.data as { target?: { text?: string } } | undefined)?.target;
    return e.kind === "ui.click" && t?.text === "login";
  });

  it("folds a brief stretch forward when nothing says otherwise", () => {
    const folded = windows(stages, frames, DEFAULT_SEGMENTATION);
    assert.ok(folded.some((w) => w.transitions.length > 0), "the recording has doorways");
  });

  it("leaves one standing when the artifact calls it an act", () => {
    // Same recording, same thresholds — only the question changes.
    const asked = windows(stages, frames, DEFAULT_SEGMENTATION, isLogin);
    const plain = windows(stages, frames, DEFAULT_SEGMENTATION);
    assert.ok(asked.length >= plain.length, "naming an act can only add rows, never remove one");
  });

  it("asks nothing of a taxonomy that names none, and reads exactly as before", () => {
    assert.deepEqual(
      windows(stages, frames, DEFAULT_SEGMENTATION).map((w) => `${w.startedAt}/${w.endedAt}/${w.parts.length}`),
      windows(stages, frames, DEFAULT_SEGMENTATION, () => false).map((w) => `${w.startedAt}/${w.endedAt}/${w.parts.length}`),
    );
  });
});

describe("text that appeared, and where it appeared", () => {
  // A burst of DOM changes is one event. Its `container` is the lowest
  // element holding all of them, so a repaint that touches two unrelated
  // panels reduces both to whatever contains both — and joining their
  // texts under it would say that one part of the interface said all of
  // it. Where the bridge named the regions, each is its own appearance.
  const change = (data: Record<string, unknown>): TraceEvent =>
    ({ id: 1, seq: 1, at: "2026-01-01T00:00:00.000+00:00", frameId: "f", kind: "ui.change", data } as unknown as TraceEvent);

  it("gives each changed region its own text", () => {
    const got = appearances([change({
      added: ["the tutor answered", "a requirement appeared"],
      container: { tag: "main", selector: "main" },
      regions: [
        { target: { tag: "div", id: "log" }, added: ["the tutor answered"] },
        { target: { tag: "ul", id: "reqs" }, added: ["a requirement appeared"] },
      ],
    })]);
    assert.deepEqual(got.map((a) => [a.container?.id, a.text]), [["log", "the tutor answered"], ["reqs", "a requirement appeared"]]);
  });

  it("reads a burst recorded before regions existed exactly as it always did", () => {
    const got = appearances([change({ added: ["hello", "world"], container: { tag: "main", selector: "main" } })]);
    assert.deepEqual(got.map((a) => [a.container?.tag, a.text]), [["main", "hello world"]]);
  });

  it("falls back to the container when no region had any text of its own", () => {
    const got = appearances([change({ added: ["hello"], container: { tag: "main" }, regions: [{ target: { tag: "div", id: "x" }, added: [] }] })]);
    assert.deepEqual(got.map((a) => [a.container?.tag, a.text]), [["main", "hello"]]);
  });
});
