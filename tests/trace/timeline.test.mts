// The trace as the page lists it: request and result events fold into one
// call row, notes stay as they are, and the summary says the right word.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { describeNote, describeTarget, formatMs, frameDetail, frameIndex, frameLabel, frameName, prettyJson, summarizeCall, summarizeInteraction, traceRows, traceStages, type CallRow, type FrameInfo, type InteractionRow, type KeyGroupRow } from "../../lib/trace/timeline";
import type { ModelCall, TraceEvent } from "../../lib/trace/types";
import { PAGE, GAME, t, browser, gateway, events } from "./fixtures/session";

const ev = (seq: number, kind: string, data: Record<string, unknown>, callId: string | null = null): TraceEvent => ({
  id: seq, runId: "r", seq, at: `2026-09-19T10:00:0${seq}.000Z`, receivedAt: "", source: "model-gateway", kind, interactionId: null, requestId: null, callId, correlation: null, data,
});

describe("trace rows", () => {
  it("folds a call's request and result into one row and keeps notes", () => {
    const rows = traceRows([
      ev(0, "gateway.listening", { gateway: "model", port: 43200, capture: "full", upstreams: ["api.openai-proxy.com"] }),
      ev(1, "instrument.applied", { files: ["system/app/action.ts"] }),
      ev(2, "model.request", { model: "gpt-4o", host: "api.openai-proxy.com", path: "/v1/chat/completions", stream: true, messageCount: 2 }, "mc_1"),
      ev(3, "model.request", { model: "gpt-4o", host: "api.openai-proxy.com", path: "/v1/chat/completions", stream: true, messageCount: 3 }, "mc_2"),
      ev(4, "model.response", { status: 200, latencyMs: 2100, ttftMs: 400, outputChars: 812, usageAvailable: false, streamed: true }, "mc_1"),
    ], []);
    assert.deepEqual(rows.map((r) => r.kind), ["note", "note", "call", "call"]);
    const [gw, inst, a, b] = rows;
    assert.equal(gw.kind === "note" && gw.label, "Model gateway up");
    assert.ok(gw.kind === "note" && gw.detail?.includes("api.openai-proxy.com"));
    assert.equal(inst.kind === "note" && inst.label, "Sandbox-only instrumentation applied");
    const first = summarizeCall(a as CallRow);
    assert.deepEqual([first.state, first.status, first.latencyMs, first.messages, first.outputChars, first.usageAvailable], ["done", 200, 2100, 2, 812, false]);
    assert.equal(summarizeCall(b as CallRow).state, "in flight");
  });
  it("prefers the fetched call row and reads errors from it", () => {
    const call = { callId: "mc_9", model: "gpt-4o", phase: "error", status: 401, latencyMs: 300, aborted: false, upstream: { scheme: "https", host: "h", path: "/p", has_query: false }, error: { type: "invalid_request_error", message: "Incorrect API key provided: [redacted:OPENAI_API_KEY]", code: "invalid_api_key" }, usageAvailable: false, streamed: true, request: { message_count: 2 } } as unknown as ModelCall;
    const rows = traceRows([ev(0, "model.request", { model: "gpt-4o" }, "mc_9"), ev(1, "model.error", { status: 401, error: { type: "invalid_request_error", code: "invalid_api_key" } }, "mc_9")], [call]);
    const s = summarizeCall(rows[0] as CallRow);
    assert.equal(s.state, "error");
    assert.match(s.errorText ?? "", /Incorrect API key provided: \[redacted:OPENAI_API_KEY\]/);
  });
  it("describes an unknown note by its kind and formats times and JSON", () => {
    assert.equal(describeNote(ev(0, "something.else", {})).label, "something.else");
    assert.deepEqual([formatMs(12), formatMs(2345), formatMs(75_000), formatMs(null)], ["12 ms", "2.3 s", "1m 15s", "–"]);
    assert.equal(prettyJson("{\"a\":1}"), "{\n  \"a\": 1\n}");
    assert.equal(prettyJson("not json"), null);
  });
});

// Browser, gateway and model events of one turn: keys in an embedded
// frame, a submit, the request it caused, the model call during it, the
// answer and what changed on screen.
const at = (s: number, ms = 0) => new Date(Date.UTC(2026, 8, 19, 10, 0, s, ms)).toISOString();
describe("interaction rows", () => {
  const events: TraceEvent[] = [
    gateway(0, "gateway.listening", at(0), {}, { gateway: "preview", port: 43110 }),
    gateway(1, "frame.served", at(1), { requestId: "r_doc" }, { frameId: "f_page000001", path: "/", dest: "document" }),
    browser(2, "frame.loaded", at(1, 500), "f_page000001", null, { url: "/", title: "ROPE", embedded: false, surfaces: { counts: { iframe: 3, textarea: 1 } } }),
    gateway(3, "frame.served", at(2), { requestId: "r_frame" }, { frameId: "f_solu000001", path: "/sandbox/index.html", dest: "iframe", query: { id: "solution" } }),
    browser(4, "frame.loaded", at(2, 200), "f_solu000001", null, { url: "/sandbox/index.html?…", query: { id: "solution" }, embedded: true, surfaces: { counts: { canvas: 1 } } }),
    browser(5, "frame.attached", at(2, 300), "f_solu000001", null, { parentFrameId: "f_page000001", selectorInParent: "#solution", name: "solution", depth: 1, instrumented: "self" }),
    browser(6, "frame.discovered", at(2, 400), "f_page000001", null, { selectorInParent: "#ad", reason: "cross-origin", src: "https://ads.example/x", instrumented: false }),
    browser(7, "ui.focus", at(10), "f_solu000001", "i_solu000001_1", { embedded: true, target: { tag: "body", selector: "body" } }),
    browser(8, "ui.click", at(10, 50), "f_solu000001", "i_solu000001_2", { target: { tag: "canvas", id: "game-canvas", selector: "#game-canvas", size: "500x600" }, trusted: true }),
    browser(9, "ui.key", at(11), "f_solu000001", "i_solu000001_3", { key: "ArrowLeft", class: "control", count: 2, repeat: false, editable: null, target: { tag: "body", selector: "body" }, lastAt: Date.UTC(2026, 8, 19, 10, 0, 11, 300) }),
    browser(10, "ui.key", at(12), "f_solu000001", "i_solu000001_4", { key: "ArrowUp", class: "control", count: 1, repeat: false, editable: null, target: { tag: "body", selector: "body" } }),
    browser(11, "ui.key", at(13), "f_solu000001", "i_solu000001_5", { key: "Space", class: "control", count: 1, repeat: false, editable: null, target: { tag: "body", selector: "body" } }),
    browser(12, "ui.click", at(20), "f_page000001", "i_page000001_1", { target: { tag: "textarea", selector: "form > textarea", placeholder: "Ask the tutor", editable: "text" } }),
    browser(13, "ui.key", at(21), "f_page000001", "i_page000001_2", { key: "Enter", class: "control", count: 1, repeat: false, editable: "text", target: { tag: "textarea", selector: "form > textarea", placeholder: "Ask the tutor", editable: "text" } }),
    gateway(14, "network.request", at(21, 100), { requestId: "r_act", interactionId: "i_page000001_2", correlation: "explicit" }, { method: "POST", path: "/", category: "action", next_action: true }),
    gateway(15, "model.request", at(21, 300), { callId: "mc_1", requestId: "r_act", interactionId: "i_page000001_2", correlation: "temporal" }, { model: "gpt-4o", host: "api.openai-proxy.com", path: "/v1/chat/completions", stream: true, messageCount: 4 }, "model-gateway"),
    gateway(16, "model.response", at(24), { callId: "mc_1", requestId: "r_act", interactionId: "i_page000001_2", correlation: "temporal" }, { status: 200, latencyMs: 2700, outputChars: 640, usageAvailable: false, streamed: true }, "model-gateway"),
    gateway(17, "network.response", at(24, 100), { requestId: "r_act", interactionId: "i_page000001_2", correlation: "explicit" }, { status: 200, latency_ms: 3000, streamed: true }),
    browser(18, "ui.change", at(21, 400), "f_page000001", "i_page000001_2", { part: 1, mutations: 14, durationMs: 2800, sinceInteractionMs: 400, added: ["Try rotating the piece before it lands", "Tip"], removed: ["Thinking…"], container: { tag: "div", id: "chat", selector: "#chat" } }, "temporal"),
    gateway(19, "network.request", at(25), { requestId: "r_log" }, { method: "POST", path: "/api/logClick", category: "api" }),
    gateway(20, "network.response", at(25, 80), { requestId: "r_log" }, { status: 500, latency_ms: 80 }),
    gateway(21, "network.request", at(26), { requestId: "r_pre" }, { method: "GET", path: "/other", category: "prefetch" }),
  ];
  it("labels frames from the evidence, folds keys, and ties the submit to its request, model call and change", () => {
    const rows = traceRows(events, []);
    assert.deepEqual(rows.map((r) => r.kind), ["note", "note", "note", "note", "note", "interaction", "interaction", "keys", "interaction", "interaction", "call", "network"]);
    const [gw, page, frameLoaded, attached, discovered, focus, canvas, keys, click, enter, call, log] = rows;
    assert.equal(gw.kind === "note" && gw.label, "Preview gateway up");
    assert.equal(page.kind === "note" && page.label, "Page loaded: / — ROPE");
    assert.ok(page.kind === "note" && page.detail?.includes("iframe ×3"));
    assert.equal(frameLoaded.kind === "note" && frameLoaded.detail, "embedded frame “solution” · contains canvas ×1");
    assert.equal(attached.kind === "note" && attached.label, "Embedded frame attached: #solution");
    assert.equal(discovered.kind === "note" && discovered.label, "Embedded frame not instrumented: #ad");
    assert.ok(discovered.kind === "note" && discovered.detail?.startsWith("cross-origin"));
    assert.equal(focus.kind === "interaction" && focus.label, "Moved into embedded frame “solution”");
    assert.equal(canvas.kind === "interaction" && canvas.label, "Clicked canvas#game-canvas in embedded frame “solution”");
    assert.equal(keys.kind, "keys");
    if (keys.kind === "keys") {
      assert.equal(keys.label, "Keyboard in embedded frame “solution” · 2.0 s");
      assert.equal(keys.endAt, at(13), "the last press ends the run");
      assert.equal(keys.detail, "ArrowLeft ×2, ArrowUp ×1, Space ×1");
      assert.equal(keys.presses, 4, "every press counts, folded repeats included");
      assert.deepEqual(keys.rows.map((r) => [r.label, r.at]), [["Pressed ArrowLeft ×2 in embedded frame “solution”", at(11)], ["Pressed ArrowUp in embedded frame “solution”", at(12)], ["Pressed Space in embedded frame “solution”", at(13)]]);
    }
    assert.equal(click.kind === "interaction" && click.label, "Clicked “Ask the tutor” (textarea)");
    assert.equal(enter.kind, "interaction");
    if (enter.kind === "interaction") {
      assert.equal(enter.label, "Pressed Enter", "a key on a text surface is its own row, not grouped");
      assert.deepEqual(enter.links.map((l) => [l.request.requestId, l.correlation]), [["r_act", "explicit"]]);
      assert.deepEqual(enter.callIds, ["mc_1"]);
      assert.equal(enter.changes.length, 1);
      assert.deepEqual(summarizeInteraction(enter), ["POST / (server action) → 200 in 3.0 s", "1 model call", "then +“Try rotating the piece before it lands” and 1 more −“Thinking…” (400 ms later)"]);
    }
    assert.equal(call.kind === "call" && call.via, "Pressed Enter");
    assert.equal(call.kind === "call" && call.correlation, "temporal");
    assert.equal(call.kind === "call" && call.during, "POST / (server action)");
    assert.equal(log.kind === "network" && log.label, "POST /api/logClick");
    assert.equal(log.kind === "network" && log.detail, "500 · 80 ms");
    assert.equal(rows.some((r) => r.kind === "network" && r.request.data?.path === "/other"), false, "prefetches are not rows");
    const frames = frameIndex(events);
    assert.equal(frameLabel(frames, "f_page000001"), "the page");
    assert.equal(frameLabel(frames, "f_solu000001"), "embedded frame “solution”");
    assert.equal(frameLabel(frames, "f_unknown"), "frame f_unknown");
    assert.equal(frameName(frames, "f_solu000001"), "solution");
    assert.equal(frameName(frames, "f_page000001"), "the page");
    assert.equal(frameName(frames, null), "the page");
    // Without a name: one identifier-like query value, then a title no other
    // frame shares, then the path with its query, then the selector.
    const info = (over: Partial<FrameInfo>): [string, FrameInfo] => [over.frameId ?? "f_x", { frameId: "f_x", parentFrameId: "f_page000001", embedded: true, path: "/sandbox/index.html", url: null, query: null, title: null, name: null, selectorInParent: "main > iframe:nth-of-type(2)", instrumented: "self", depth: 1, ...over }];
    const two = new Map([info({ frameId: "f_a", title: "Python Game Sandbox", query: { id: "solution" } }), info({ frameId: "f_b", title: "Python Game Sandbox", query: { id: "my-canvas" } })]);
    assert.equal(frameLabel(two, "f_a"), "embedded frame “solution”");
    assert.equal(frameLabel(two, "f_b"), "embedded frame “my-canvas”");
    assert.equal(frameLabel(new Map([info({ title: "Preview" })]), "f_x"), "embedded frame “Preview”");
    assert.equal(frameLabel(new Map([info({ frameId: "f_a", title: "Same" }), info({ frameId: "f_b", title: "Same" })]), "f_a"), "embedded frame /sandbox/index.html");
    assert.equal(frameLabel(new Map([info({ query: { page: "2", step: "3" } })]), "f_x"), "embedded frame /sandbox/index.html?page=2&step=3");
    assert.equal(frameLabel(new Map([info({ query: { token: "[omitted]" }, path: null })]), "f_x"), "embedded frame main > iframe:nth-of-type(2)");
    assert.equal(frameDetail(two.get("f_a")!), "/sandbox/index.html?id=solution · title “Python Game Sandbox” · at main > iframe:nth-of-type(2) · inside f_page000001");
  });
  it("describes targets from what they carry, never from what they mean", () => {
    assert.equal(describeTarget({ tag: "button", text: "Send", id: "chat-submit" }), "“Send” (button)");
    assert.equal(describeTarget({ tag: "a", label: "Home" }), "“Home” (link)");
    assert.equal(describeTarget({ tag: "input", type: "checkbox", name: "agree" }), "checkbox input “agree”");
    assert.equal(describeTarget({ tag: "div", role: "slider", testid: "vol" }), "slider [vol]");
    assert.equal(describeTarget({ tag: "body", selector: "body" }), "the page body");
    assert.equal(describeTarget({ tag: "span", selector: "main > span:nth-of-type(2)" }), "span main > span:nth-of-type(2)");
    assert.equal(describeTarget({ tag: "button", text: "A very long label that goes on and on and on and on" }), "“A very long label that goes on and on a…” (button)");
  });
});

// A whole session the way it was recorded from a real run: a login on the
// page, arrow keys there and in a game frame (the page's logger posting
// after each key), a message typed and sent with Enter, the framework's
// server action (posted to "" and so not tagged by an older bridge), the
// model call during it, the answer appearing, a stray GET later.
describe("stages", () => {
  it("ties the Enter to the untagged server action by timing, and through it to the model call", () => {
    const rows = traceRows(events, []);
    const enter = rows.find((r): r is InteractionRow => r.kind === "interaction" && r.id === "i_page000001_8");
    assert.ok(enter);
    assert.deepEqual(enter.links.map((l) => [l.request.requestId, l.correlation, l.sinceMs]), [["r_conv1", "explicit", 6], ["r_act", "temporal", 13], ["r_conv2", "explicit", 4600]]);
    assert.deepEqual(enter.callIds, ["mc_1"]);
    assert.equal(enter.submit, true);
    const call = rows.find((r): r is CallRow => r.kind === "call");
    assert.ok(call);
    assert.equal(call.interactionId, "i_page000001_8");
    assert.equal(call.correlation, "temporal");
    assert.equal(call.via, "Pressed Enter");
    assert.equal(call.during, "POST / (server action)");
    assert.equal(rows.some((r) => r.kind === "network" && r.request.requestId === "r_act"), false, "the action is no longer a loose request");
    assert.ok(rows.some((r) => r.kind === "network" && r.request.requestId === "r_late"), "a request 12 s after anything stays loose");
    const pageKeys = rows.find((r): r is KeyGroupRow => r.kind === "keys" && r.frameId === PAGE);
    assert.ok(pageKeys);
    assert.equal(pageKeys.presses, 6);
    assert.equal(pageKeys.detail, "ArrowLeft ×4, ArrowUp ×2 · POST /api/logClick ×3 → 500", "keys with only background requests still fold, and say what the requests were");
    const gameKeys = rows.find((r): r is KeyGroupRow => r.kind === "keys" && r.frameId === GAME);
    assert.ok(gameKeys);
    assert.equal(gameKeys.presses, 8, "3 + 1 + 4 presses");
    assert.equal(gameKeys.detail, "ArrowUp ×3, ArrowDown ×1, ArrowRight ×4");
  });
  it("reads as explored, submitted, model call, response appeared, with the rest under diagnostics", () => {
    const { primary, diagnostics } = traceStages(traceRows(events, []));
    assert.deepEqual(primary.map((s) => s.stage), ["explore", "explore", "submit", "call", "response"]);
    assert.deepEqual(primary.map((s) => s.title), ["Explored the page", "Explored solution", "Submitted text", "gpt-4o call", "Response appeared"], "chips carry the short form; the frame's bare identity, no quotes");
    const [page, game, submit, call, response] = primary;
    assert.equal(page.label, "Explored the page · 4.0 s");
    assert.equal(page.detail, "2 clicks · 6 key presses: ArrowLeft ×4, ArrowUp ×2 · 1 field change · 1 visible change · POST /api/logClick ×3 → 500");
    assert.equal(game.label, "Explored embedded frame “solution” · 2.0 s", "the frame's own ?id= value is DOM evidence; the url and selector stay in the details");
    assert.equal(game.detail, "2 clicks · 8 key presses: ArrowRight ×4, ArrowUp ×3, ArrowDown ×1");
    assert.equal(submit.label, "Submitted text from “Start discussing about Tetris requireme…” (textarea)");
    assert.equal(submit.at, t(14), "the move back to the page and the click into the field belong with the submit");
    assert.deepEqual(submit.rows.map((r) => r.id), ["i_page000001_6", "i_page000001_7", "i_page000001_8"]);
    assert.equal(submit.detail, "POST /api/conversation → 500 in 394 ms · POST / (server action) → 200 in 4.5 s (by timing, 13 ms after) · POST /api/conversation → 500 in 10 ms · then +“create an 8 x 6 board” (15 ms later)");
    assert.equal(call.label, "gpt-4o call");
    assert.equal(call.detail, "200 · 4.1 s · 3 messages · streamed · 1209 characters back · usage unavailable");
    assert.deepEqual(call.link, { correlation: "temporal", text: "while POST / (server action) was in flight (the only request open, so by timing) · that request followed the submit by 13 ms (by timing)" });
    assert.equal(response.label, "Response appeared: +“Great start! You've correctly identified \"Creating and Drawing the Bo…” and 1 more");
    assert.equal(response.detail, "97 mutations in 2 bursts · in ul #chat");
    assert.deepEqual(response.link, { correlation: "temporal", text: "3.2 s after the submit, while the model was still answering · by timing" });
    assert.equal(response.events.length, 2);
    // Which model call each stage is about: none while exploring, the first
    // tied to the submit, the call itself, the last before the response.
    assert.deepEqual(primary.map((s) => s.callId), [null, null, submit.callId, call.callId, call.callId]);
    assert.equal(call.callId, call.rows[0].id);
    assert.deepEqual(diagnostics.map((r) => r.kind === "note" ? r.label : r.kind === "network" ? r.label : r.kind), ["Preview gateway up", "Page loaded: / — Create Next App", "Embedded document loaded: /sandbox/index.html?… — Python Game Sandbox", "Embedded frame attached: main > div:nth-of-type(4) > div > iframe:nth-of-type(2)", "GET /"]);
    // A change whose text was taken out and put back (recorded by an older
    // bridge that quoted both) is a rerender here too.
    assert.equal(page.events.filter((e) => e.kind === "ui.change").length, 2);
    // The rerender under the click into the field is evidence, not a step.
    assert.ok(!JSON.stringify(primary.map((s) => [s.label, s.detail])).includes("Rerender"));
    assert.ok(submit.events.some((e) => e.data?.rerendered === 1));
  });
});

// A stage's end came from the browser's clock while its start came from
// the server's, so a response that took no time at all ended before it
// began. Reproduced from run 06c6dab1: the two clocks were 29 ms apart
// and the burst reported a duration of 0.
describe("a response stage's bounds", () => {
  const change = (over: Record<string, unknown>) => browser(6, "ui.change", at(4, 433), PAGE, "i_page000001_1", {
    part: 1, mutations: 17, addedNodes: 8, sinceInteractionMs: 2827,
    added: ["0 of 4 steps"], removed: ["Generating plan…"],
    container: { tag: "div", id: "root", selector: "#root" },
    browser_at: Date.UTC(2026, 8, 19, 10, 0, 4, 404), clock_offset_ms: 29,
    ...over,
  }, "temporal");

  const stageFrom = (c: TraceEvent) => {
    const list: TraceEvent[] = [
      gateway(0, "frame.served", at(0), { requestId: "r_doc" }, { frameId: PAGE, path: "/", dest: "document" }),
      browser(1, "frame.loaded", at(0, 500), PAGE, null, { url: "/", title: "Cocoa", embedded: false }),
      browser(2, "ui.click", at(1, 611), PAGE, "i_page000001_1", { target: { tag: "button", text: "Create", selector: "#root button" }, trusted: true }),
      gateway(3, "network.request", at(1, 607), { requestId: "r_plan", interactionId: "i_page000001_1", correlation: "explicit" }, { method: "POST", path: "/api/notebooks/plan", category: "api" }),
      gateway(4, "model.request", at(1, 659), { callId: "mc_1", requestId: "r_plan", interactionId: "i_page000001_1", correlation: "explicit" }, { model: "gpt-4.1", host: "api.openai.com", path: "/v1/responses", stream: false, messageCount: 1 }, "model-gateway"),
      gateway(5, "model.response", at(4, 333), { callId: "mc_1", requestId: "r_plan", interactionId: "i_page000001_1", correlation: "explicit" }, { status: 200, latencyMs: 2683, outputChars: 712, usageAvailable: true, streamed: false }, "model-gateway"),
      c,
    ];
    const stages = traceStages(traceRows(list, [], frameIndex(list))).primary;
    const response = stages.find((s) => s.stage === "response");
    assert.ok(response, "the burst after the answer should be a response stage");
    return response;
  };

  it("never ends before it begins, and says how its end was found", () => {
    // The browser's last mutation is 29 ms EARLIER than the corrected
    // start. Read as an instant it inverts; read as a length it does not.
    const s = stageFrom(change({ durationMs: 0, firstMutationAt: Date.UTC(2026, 8, 19, 10, 0, 4, 404), lastMutationAt: Date.UTC(2026, 8, 19, 10, 0, 4, 404) }));
    assert.ok(Date.parse(s.endAt) >= Date.parse(s.at), `${s.endAt} must not precede ${s.at}`);
    assert.equal(s.at, at(4, 433));
    assert.equal(s.endAt, at(4, 433));
    assert.equal(s.bounds?.from, "durationMs");
    assert.equal(s.bounds?.spanMs, 0);
    assert.equal(s.bounds?.offsetMs, 29);
    // What the browser said is kept, not thrown away.
    assert.equal(s.bounds?.rawEndAt, at(4, 404));
  });

  it("keeps a burst's real length instead of the distance between two clocks", () => {
    const s = stageFrom(change({ durationMs: 2800, firstMutationAt: Date.UTC(2026, 8, 19, 10, 0, 4, 404), lastMutationAt: Date.UTC(2026, 8, 19, 10, 0, 7, 204) }));
    assert.equal(s.endAt, at(7, 233), "2.8 s after the corrected start, not 2.8 s after the browser's");
    assert.equal(s.bounds?.spanMs, 2800);
  });

  it("falls back to the span between the first and last mutation", () => {
    const s = stageFrom(change({ firstMutationAt: Date.UTC(2026, 8, 19, 10, 0, 4, 404), lastMutationAt: Date.UTC(2026, 8, 19, 10, 0, 5, 404) }));
    assert.equal(s.bounds?.from, "mutationSpan");
    assert.equal(s.bounds?.spanMs, 1000);
    assert.equal(s.endAt, at(5, 433));
  });

  it("gives a burst that reported nothing a zero length rather than a guess", () => {
    const s = stageFrom(change({}));
    assert.equal(s.bounds?.from, "start");
    assert.equal(s.endAt, s.at);
  });
});
