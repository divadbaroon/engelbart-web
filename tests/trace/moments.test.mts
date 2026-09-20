// What each moment says on the canvas, from the stage's own rows: a
// kind, one line while compact, the acts once opened, an echo marked as
// observed, and only the ties the trace itself recorded.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { traceRows, traceStages, type CallRow } from "../../lib/trace/timeline";
import { ECHO_PROVENANCE, callOwner, cardLines, keyGlyph, liveLine, momentActions, momentKind, momentLines, momentPreview, momentSummary, relatedCall, relationFor, relationWord, responseQuotes, shortClock, submitEcho } from "../../lib/trace/moments";
import { events } from "./fixtures/session";

describe("moments", () => {
  const rows = traceRows(events, []);
  const { primary } = traceStages(rows);
  const calls = new Map(rows.filter((r): r is CallRow => r.kind === "call").map((r) => [r.id, r]));
  const [page, game, submit, call, response] = primary;

  it("names each moment's kind from its stage alone", () => {
    assert.deepEqual(primary.map(momentKind), ["human", "human", "human", "model", "observed"]);
  });
  it("keeps a compact card to one line: a duration, an echo, the shape of a call", () => {
    assert.equal(momentPreview(page, calls), "4.0 s");
    assert.equal(momentPreview(game, calls), "2.0 s");
    assert.equal(momentPreview(submit, calls), "“create an 8 x 6 board”");
    assert.equal(momentPreview(call, calls), "4.1 s · streamed");
    assert.equal(momentPreview(response, calls), null);
  });
  it("opens to the acts in order, never to requests, selectors or moves between frames", () => {
    assert.deepEqual(momentLines(page, calls), ["Clicked “Subject ID” (text input)", "Changed “Subject ID” (text input)", "Clicked “Continue” (button)", "ArrowLeft ×4", "ArrowUp ×2"]);
    assert.deepEqual(momentLines(game, calls), ["Clicked the page body", "Clicked canvas#game-canvas", "ArrowUp ×3", "ArrowDown ×1", "ArrowRight ×4"]);
    assert.deepEqual(momentLines(call, calls), ["status 200", "3 messages sent", "1,209 characters back"]);
    assert.deepEqual(momentLines(response, calls), ["“Great start! You've correctly identified \"Creating and Drawing the Board\" as th…”", "“Creating and Drawing the Board”", "97 mutations in 2 bursts"]);
    assert.ok(!JSON.stringify(momentLines(page, calls)).includes("logClick"), "requests are evidence, not acts");
  });
  it("quotes a submit's echo and says where it came from", () => {
    assert.deepEqual(submitEcho(submit, calls), { text: "create an 8 x 6 board", sinceMs: 15, more: 0 });
    assert.deepEqual(momentLines(submit, calls), ["Clicked “Start discussing about Tetris requireme…” (textarea)", "Enter ×1", "Echoed in the page: “create an 8 x 6 board” · 15 ms later"]);
    assert.match(ECHO_PROVENANCE, /appeared in the page/);
    assert.match(ECHO_PROVENANCE, /never recorded/);
    assert.equal(submitEcho(page, calls), null);
    // An echo that came after the first model call is the response, not the submit's.
    const late = { ...submit, rows: submit.rows.map((r) => (r.kind === "interaction" && r.submit ? { ...r, changes: r.changes.map((c) => ({ ...c, at: "2026-09-19T10:00:30.000Z" })) } : r)) };
    assert.equal(submitEcho(late, calls), null);
  });
  it("ties a submit to its call by the trace's own correlation and a response to the call it waited on, and nothing else", () => {
    assert.deepEqual(relationFor(submit, primary, calls), { from: submit.id, to: call.id, correlation: "temporal", text: call.link?.text ?? null });
    assert.deepEqual(relationFor(response, primary, calls), { from: call.id, to: response.id, correlation: "temporal", text: response.link?.text ?? null });
    assert.equal(relationFor(page, primary, calls), null);
    assert.equal(relationFor(game, primary, calls), null);
    assert.equal(relationFor(call, primary, calls), null, "a call's own tie is told in the inspector");
    assert.equal(relationFor({ ...submit, callId: null }, primary, calls), null, "a submit no call was joined to gets no tie, however near a call is");
    assert.equal(relationFor({ ...response, link: null }, primary, calls), null, "a response the trace did not attribute gets no tie");
    const explicit = new Map(calls);
    explicit.set(call.callId as string, { ...(calls.get(call.callId as string) as CallRow), correlation: "explicit" });
    assert.equal(relationFor(submit, primary, explicit)?.correlation, "explicit", "an id carried by the model request makes the tie explicit");
    assert.deepEqual([relationWord("explicit"), relationWord("temporal")], ["linked", "by timing"]);
  });
  it("says one line more when opened, and the same line in the live list: keys as glyphs with counts, a call's shape, the first text that appeared", () => {
    assert.equal(momentSummary(page), "← ×4 · ↑ ×2 · 2 clicks · 1 field change");
    assert.equal(momentSummary(game), "↑ ×3 · ↓ ×1 · → ×4 · 2 clicks");
    assert.equal(momentSummary(submit), "⏎ ×1 · 1 click");
    assert.equal(momentSummary(call), "status 200 · 3 messages · 1,209 chars back");
    assert.equal(momentSummary(response), "“Great start! You've correctly identified \"Creat…”");
    assert.equal(liveLine(game, calls), "↑ ×3 · ↓ ×1 · → ×4 · 2 clicks");
    assert.equal(liveLine(submit, calls), "“create an 8 x 6 board”", "a submit's live line is the echo, when there is one");
    assert.equal(liveLine(call, calls), "4.1 s · streamed");
    assert.equal(liveLine(response, calls), momentSummary(response));
    assert.deepEqual([keyGlyph("ArrowUp"), keyGlyph("Enter"), keyGlyph("[printable]"), keyGlyph("F5")], ["↑", "⏎", "printable keys", "F5"]);
    assert.equal(momentActions(submit).length, 2, "the acts by name, without the echo");
    assert.equal(responseQuotes(response).length, 2);
    assert.match(shortClock(page.at), /^\d\d:\d\d:\d\d$/);
  });
  it("keeps a finished call's numbers off its card, and every other card as it was", () => {
    assert.deepEqual(cardLines(call, calls), { preview: null, summary: null }, "no timing, status, message count or character count on the spine");
    assert.deepEqual(momentLines(call, calls), ["status 200", "3 messages sent", "1,209 characters back"], "the same numbers, still in the inspector");
    for (const stage of [page, game, submit, response]) {
      assert.deepEqual(cardLines(stage, calls), { preview: momentPreview(stage, calls), summary: momentSummary(stage) }, `${stage.stage} reads as before`);
    }
    const row = calls.get(call.callId as string) as CallRow;
    const open = { ...call, rows: [{ ...row, call: null, result: null }] };
    assert.deepEqual(cardLines(open, calls), { preview: "streaming…", summary: null }, "a call still going says so");
    const result = row.result as NonNullable<CallRow["result"]>;
    const failed = { ...call, rows: [{ ...row, result: { ...result, kind: "model.error", data: { ...result.data, error: { type: "rate_limit_error" } } } }] };
    assert.equal(cardLines(failed, calls).preview, "rate_limit_error", "and a call that went wrong says what went wrong");
  });
  it("says where a call stands while it is open, and updates the same moment once it ends", () => {
    const row = calls.get(call.callId as string) as CallRow;
    const open: CallRow = { ...row, call: null, result: null };
    const opened = { ...call, rows: [open] };
    assert.equal(momentPreview(opened, calls), "streaming…", "a streamed request says so while open");
    assert.equal(liveLine(opened, calls), "streaming…");
    assert.equal(momentPreview({ ...call, rows: [{ ...open, request: { ...open.request, data: { ...open.request.data, stream: false } } }] }, calls), "in flight…");
    assert.equal(opened.id, call.id, "the same stage id before and after, so the live item updates in place");
  });
  it("names the call a submit or a response is tied to, and the submit a call was joined to, from the trace alone", () => {
    const rel = relatedCall(submit, primary, calls);
    assert.deepEqual(rel && { stageId: rel.stageId, callId: rel.callId, model: rel.model, correlation: rel.correlation, stateText: rel.stateText }, { stageId: call.id, callId: call.callId, model: "gpt-4o", correlation: "temporal", stateText: "4.1 s · streamed" });
    assert.equal(relatedCall(response, primary, calls)?.stageId, call.id);
    assert.equal(relatedCall(page, primary, calls), null);
    assert.deepEqual(callOwner(call.callId as string, primary, calls), { stageId: submit.id, title: "Submitted text", correlation: "temporal" });
    assert.equal(callOwner("mc_nobody", primary, calls), null);
  });
});
