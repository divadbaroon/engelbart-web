// A recording is two clock readings over the run's rows: what started
// inside is in, a call comes whole, what happened after the stop is out,
// and the counts come from the same stages the canvas shows.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { traceRows, traceStages } from "../../lib/trace/timeline";
import { clearMark, defaultName, formatDuration, formatElapsed, formatWhen, inWindow, recordingStats, scopeTrace, statsLine, toRecording, windowOf, type Recording } from "../../lib/trace/recording";
import { events, t } from "./fixtures/session";
import { call1 } from "../bart/fixtures/call";

const rec = (startedAt: string, stoppedAt: string | null): Recording => ({ id: "rec1", runId: "r", projectId: "p", name: "Recording 1", status: stoppedAt ? "complete" : "recording", startedAt, stoppedAt, createdAt: startedAt });
const stageIds = (s: ReturnType<typeof scopeTrace>) => traceStages(traceRows(s.events, s.calls)).primary.map((x) => x.id);

describe("recording scope", () => {
  it("keeps what started inside, and a call whole even when it ended after the stop", () => {
    const s = scopeTrace(events, [call1], { start: t(9, 500), end: t(22) });
    assert.deepEqual(stageIds(s), ["stage:i_game000001_1", "stage:i_page000001_8", "stage:call:mc_1"]);
    assert.deepEqual(s.calls.map((c) => c.callId), ["mc_1"]);
    assert.ok(s.events.some((e) => e.kind === "model.response" && e.callId === "mc_1"), "the response event followed its call past the stop");
    assert.ok(!s.events.some((e) => Date.parse(e.at) > Date.parse(t(22)) && !e.callId), "nothing else after the stop");
  });
  it("leaves out a call that started before the recording, response and all", () => {
    const s = scopeTrace(events, [call1], { start: t(21), end: t(30) });
    assert.equal(s.calls.length, 0);
    assert.ok(!s.events.some((e) => e.callId === "mc_1"));
    assert.ok(!stageIds(s).includes("stage:call:mc_1"));
  });
  it("finds a call by its request event when its row has not arrived", () => {
    const s = scopeTrace(events, [], { start: t(20), end: t(21) });
    assert.ok(s.events.some((e) => e.kind === "model.response" && e.callId === "mc_1"));
    assert.ok(stageIds(s).includes("stage:call:mc_1"));
  });
  it("is open-ended while still recording", () => {
    const s = scopeTrace(events, [call1], { start: t(14), end: null });
    assert.ok(stageIds(s).includes("stage:response:i_page000001_8"));
    assert.equal(inWindow(t(99), { start: t(14), end: null }), true);
    assert.equal(inWindow(t(13), { start: t(14), end: null }), false);
    assert.equal(inWindow("nope", { start: t(14), end: null }), false);
  });
  it("counts duration, moments and calls from the rows inside", () => {
    const r = rec(t(9, 500), t(22));
    const s = recordingStats(events, [call1], r);
    assert.deepEqual(s, { durationMs: 12_500, moments: 3, calls: 1 });
    assert.equal(statsLine(s), "13s · 3 moments · 1 model call", "12.5 s rounds to 13 s");
    const open = recordingStats(events, [call1], rec(t(9, 500), null), undefined, Date.parse(t(70)));
    assert.equal(open.durationMs, 60_500);
    assert.deepEqual(windowOf(r), { start: t(9, 500), end: t(22) });
  });
  it("formats", () => {
    assert.equal(formatDuration(134_000), "2m 14s");
    assert.equal(formatDuration(48_000), "48s");
    assert.equal(formatDuration(3_723_000), "1h 2m 3s");
    assert.equal(formatElapsed(42_000), "00:42");
    assert.equal(formatElapsed(3_723_000), "1:02:03");
    assert.match(formatWhen("2026-09-19T01:24:00"), /^Sep 19, 1:24 AM$/);
    assert.equal(defaultName(3), "Recording 3");
    assert.equal(toRecording({ id: "a", run_id: "r", project_id: "p", name: "n", status: "complete", started_at: "s", stopped_at: "e", created_at: "c" }).stoppedAt, "e");
  });
});

// Clearing the canvas is a window like a recording's, open at the end.
// Nothing is deleted, so every one of these reads the same rows.
describe("clearing the canvas", () => {
  it("marks just past the latest reading, so the last moment stays behind the clear", () => {
    const mark = clearMark(events);
    assert.ok(mark, "a trace with events has something to clear");
    const latest = Math.max(...events.map((e) => Date.parse(e.at)));
    assert.equal(Date.parse(mark!), latest + 1);
    assert.ok(!inWindow(new Date(latest).toISOString(), { start: mark!, end: null }), "the last moment is hidden, not left alone on a fresh canvas");
  });

  it("has nothing to clear when nothing has been recorded", () => {
    assert.equal(clearMark([]), null);
  });

  it("reads the clock, not the order rows arrived in", () => {
    const outOfOrder = [...events].reverse();
    assert.equal(clearMark(outOfOrder), clearMark(events), "rows are sequenced by collection; a clock need not agree");
  });

  it("ignores a reading it cannot parse rather than clearing to nowhere", () => {
    const broken = [{ ...events[0], at: "not a time" }, ...events.slice(1)];
    assert.equal(clearMark(broken), clearMark(events));
    assert.equal(clearMark([{ ...events[0], at: "not a time" }]), null);
  });

  it("empties the canvas and lets what follows back onto it", () => {
    const mark = clearMark(events)!;
    const after = scopeTrace(events, [call1], { start: mark, end: null });
    assert.deepEqual(stageIds(after), [], "the canvas starts clean");
    const later = { ...events[0], id: 9001, seq: 9001, at: t(600) };
    const live = scopeTrace([...events, later], [call1], { start: mark, end: null });
    assert.ok(live.events.some((e) => e.seq === 9001), "collection carries on and new moments appear");
  });

  it("leaves the run whole: the rows are still there for a recording and for Show all", () => {
    const mark = clearMark(events)!;
    scopeTrace(events, [call1], { start: mark, end: null });
    assert.deepEqual(stageIds(scopeTrace(events, [call1], { start: t(0), end: null })), stageIds(scopeTrace(events, [call1], { start: t(0), end: null })));
    const saved = rec(t(9, 500), t(22));
    assert.deepEqual(stageIds(scopeTrace(events, [call1], windowOf(saved))), ["stage:i_game000001_1", "stage:i_page000001_8", "stage:call:mc_1"], "a recording taken before the clear still holds what it held");
  });

  it("a recording started after a clear opens on the same clean canvas", () => {
    const mark = clearMark(events)!;
    const started = rec(mark, null);
    assert.deepEqual(stageIds(scopeTrace(events, [call1], windowOf(started))), stageIds(scopeTrace(events, [call1], { start: mark, end: null })));
  });
});
