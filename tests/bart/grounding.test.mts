// What Bart is told about a run, from the fixture session and a synthetic
// call: every moment by id with its tie named as recorded, a moment in
// full with the echo marked as observed, a call a part at a time within
// a bound, two calls compared as facts, and search by content.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CALL_PARTS, callReport, compareCalls, momentReport, searchTrace, slice, tableOfContents, traceModel } from "../../lib/bart/grounding";
import { events } from "../trace/fixtures/session";
import { call1, call2 } from "./fixtures/call";

describe("bart grounding", () => {
  const m = traceModel(events, [call1]);

  it("builds the same stages the Trace tab shows, keyed by call id", () => {
    assert.deepEqual(m.stages.map((s) => s.id), ["stage:i_page000001_1", "stage:i_game000001_1", "stage:i_page000001_8", "stage:call:mc_1", "stage:response:i_page000001_8"]);
    assert.equal(m.callRows.get("mc_1")?.call?.model, "gpt-4o");
    assert.equal(m.calls.mc_1, call1);
  });

  it("lists every moment on one line with its id and the tie the trace recorded", () => {
    const toc = tableOfContents(m);
    const lines = toc.split("\n");
    assert.equal(lines[0], "5 moments:");
    assert.match(lines[1], /^#1 {2}\d\d:\d\d:\d\d {2}Explored the page {2}\(stage:i_page000001_1\)/);
    assert.match(lines[3], /Submitted text {2}\(stage:i_page000001_8\).*→ call mc_1 \(by timing\)/);
    assert.match(lines[4], /Model call gpt-4o {2}\(call mc_1\).*← tied to stage:i_page000001_8 by timing/);
    assert.match(lines[5], /Response appeared {2}\(stage:response:i_page000001_8\).*← during call mc_1 \(by timing\)/);
    assert.doesNotMatch(toc, /caused/);
  });
  it("keeps the table of contents to the last moments when a run is long", () => {
    assert.match(tableOfContents(m, 2), /^5 moments; the last 2:\n#4 /);
    assert.equal(tableOfContents(traceModel([], [])), "No moments yet: nothing was done in the application, or nothing has been recorded.");
  });

  it("reports a human moment: acts in order, the echo as observed, the tie as timing", () => {
    const r = momentReport(m, "stage:i_page000001_8")!;
    assert.match(r, /^Moment stage:i_page000001_8: Submitted text, at \d\d:\d\d:\d\d/);
    assert.match(r, /Source: the browser bridge recorded these acts \(trace\)/);
    assert.match(r, /Acts, in order: Clicked .*; Enter ×1\./);
    assert.match(r, /Echoed in the page after the submit.*“create an 8 x 6 board”.*not what was typed: typed characters are never recorded/);
    assert.match(r, /Tied to model call mc_1 \(gpt-4o, .*\) by timing/);
    assert.match(r, /Timing is an association, not proof/);
    assert.doesNotMatch(r, /Evidence:/);
  });
  it("adds the rows and raw event kinds as evidence on request", () => {
    const r = momentReport(m, "stage:i_page000001_1", true)!;
    assert.match(r, /\nEvidence: \d+ rows, \d+ raw events\./);
    assert.match(r, /Raw event kinds: .*click/);
  });
  it("reports a model moment through its call, and an observed moment without a renderer", () => {
    const call = momentReport(m, "stage:call:mc_1")!;
    assert.match(call, /Source: the model gateway recorded this call/);
    assert.match(call, /Call mc_1: gpt-4o at api\.openai-proxy\.com/);
    assert.match(call, /Tied to stage:i_page000001_8 \(Submitted text\) by timing/);
    assert.equal(momentReport(m, "mc_1"), call, "a call id resolves to its stage");
    const seen = momentReport(m, "stage:response:i_page000001_8")!;
    assert.match(seen, /Text that appeared: “Great start!/);
    assert.match(seen, /The trace does not record what rendered this text/);
    assert.match(seen, /Appeared during model call mc_1/);
    assert.equal(momentReport(m, "stage:nope"), null);
  });

  it("describes a call a part at a time, each within the slice bound", () => {
    for (const part of CALL_PARTS) assert.ok(callReport(m, call1, part).text.length <= 12_200, part);
    const summary = callReport(m, call1, "summary").text;
    assert.match(summary, /^Model call mc_1 \(source: the captured request and response\)/);
    assert.match(summary, /Model: gpt-4o \(answered as gpt-4o-2024-08-06\) · provider openai · chat\.completions · POST api\.openai-proxy\.com\/v1\/chat\/completions/);
    assert.match(summary, /Request: 3 messages, .* in the system prompt · no tools · response format json_schema \(tutor_turn\)/);
    assert.match(summary, /Settings: temperature=0\.2, max_tokens=800/);
    assert.match(summary, /Output: \d+ characters, finish stop · parses as JSON/);
    assert.match(summary, /Usage: not returned by the provider/);
    assert.match(summary, /Tied to stage:i_page000001_8 \(Submitted text\) by timing; an association, not proof/);
    assert.match(summary, /\[\[call:mc_1:context\]\]/);
  });
  it("gives the system prompt in the sections the prompt marks, and the messages as sent", () => {
    const sys = callReport(m, call1, "system").text;
    assert.match(sys, /^System prompt \(\d+ characters\), in the 3 sections the prompt itself marks/);
    assert.match(sys, /## 2 · Rules\nNever give the full solution\./);
    const msgs = callReport(m, call1, "messages").text;
    assert.match(msgs, /^3 messages as sent: 1 system, 1 prior turn, then the latest input \(assistant\)\./);
    assert.match(msgs, /### 1 · user\nBoard state: 8 x 6/);
    const out = callReport(m, call1, "output").text;
    assert.match(out, /assistant · finish stop · streamed in 41 chunks\n\n\{\n {2}"feedback"/);
    assert.equal(callReport(m, call1, "tools").text, "No tools were offered in this request.");
    assert.equal(callReport(m, call1, "raw_request").text, "The raw request body is not available.");
  });
  it("cuts a long part and says where to continue", () => {
    const long = { ...call1, rawResponse: "x".repeat(30_000) };
    const first = callReport(m, long, "raw_response");
    assert.equal(first.next, 12_000);
    assert.match(first.text, /… \[18000 more characters; call again with offset 12000\]$/);
    const last = callReport(m, long, "raw_response", 24_000);
    assert.equal(last.next, null);
    assert.equal(last.text.length, 6_000);
    assert.equal(slice("abc", 10).text, "");
  });
  it("says when content was not kept", () => {
    const meta = { ...call1, capture: "metadata" as const, request: { ...call1.request!, system: { chars: 140 }, messages: [] } };
    assert.match(callReport(m, meta, "summary").text, /Content was not kept for this run/);
    assert.match(callReport(m, meta, "system").text, /^Content was not kept/);
  });

  it("compares two calls as facts: same model, differing settings, the added message", () => {
    const c = compareCalls(m, call1, call2);
    assert.match(c, /Same model: gpt-4o\./);
    assert.match(c, /Settings differ in temperature: 0\.2 → 0\.7\./);
    assert.match(c, /Same response format\./);
    assert.match(c, /Identical system prompt/);
    assert.match(c, /Messages: 3 vs 4\. In the second but not the first: user: “Student said: place the first piece”\./);
    assert.match(c, /Outputs: \d+ characters vs \d+ characters/);
    assert.match(c, /Tied to: stage:i_page000001_8 \(by timing\) vs nothing\./);
  });

  it("searches moments and calls by their content", () => {
    const hits = searchTrace(m, "8 x 6");
    assert.match(hits, /^\d+ hits for “8 x 6”:\n/);
    assert.match(hits, /- stage:i_page000001_8 \(Submitted text, \d\d:\d\d:\d\d\) · echo: /);
    assert.match(hits, /- call mc_1 \(gpt-4o, \d\d:\d\d:\d\d\) · messages: /);
    assert.match(searchTrace(m, "full solution"), /call mc_1 .* · system prompt: /);
    assert.equal(searchTrace(m, "zebra"), "Nothing in the trace mentions “zebra”.");
    assert.equal(searchTrace(m, "  "), "Empty query.");
  });
});
