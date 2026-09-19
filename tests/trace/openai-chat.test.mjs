// The pieces under the gateway: the SSE parser, the chat-completions
// reader, the redactor and the byte budgets.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ByteSink, Redactor, SseParser, clip, parseTraceLine, pickHeaders, REQUEST_HEADER_ALLOWLIST } from "../../sandbox/trace/common.mjs";
import { createReader, describeRequest, match } from "../../sandbox/trace/providers/openai-chat.mjs";

const chunk = (delta, finish = null, extra = {}) => `data: ${JSON.stringify({ id: "c1", model: "m", choices: [{ index: 0, delta, finish_reason: finish }], ...extra })}\n\n`;

describe("SSE parser", () => {
  it("splits events across chunk boundaries and tolerates CRLF", () => {
    const got = [];
    const p = new SseParser((e) => got.push(e));
    const text = "event: ping\r\ndata: {\"a\":1}\r\n\r\n: comment\r\ndata: line one\r\ndata: line two\r\n\r\ndata: [DONE]\r\n\r\n";
    for (let i = 0; i < text.length; i += 7) p.feed(Buffer.from(text.slice(i, i + 7)));
    p.finish();
    assert.deepEqual(got, [
      { event: "ping", id: null, data: "{\"a\":1}" },
      { event: null, id: null, data: "line one\nline two" },
      { event: null, id: null, data: "[DONE]" },
    ]);
  });
  it("flushes a final event without a trailing blank line", () => {
    const got = [];
    const p = new SseParser((e) => got.push(e.data));
    p.feed("data: tail");
    p.finish();
    assert.deepEqual(got, ["tail"]);
  });
});

describe("chat-completions reader", () => {
  it("merges streamed tool calls by index and keeps the finish reason", () => {
    const r = createReader({ stream: true });
    r.feed(chunk({ role: "assistant", content: null, tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "lookup", arguments: "" } }] }));
    r.feed(chunk({ tool_calls: [{ index: 0, function: { arguments: "{\"q\":" } }] }));
    r.feed(chunk({ tool_calls: [{ index: 0, function: { arguments: "\"x\"}" } }, { index: 1, id: "call_2", type: "function", function: { name: "other", arguments: "{}" } }] }));
    r.feed(chunk({}, "tool_calls"));
    r.feed("data: [DONE]\n\n");
    const out = r.finish();
    assert.equal(out.complete, true);
    assert.equal(out.chunks, 5);
    assert.equal(out.output.finish_reason, "tool_calls");
    assert.deepEqual(out.output.tool_calls, [
      { id: "call_1", type: "function", name: "lookup", arguments: "{\"q\":\"x\"}" },
      { id: "call_2", type: "function", name: "other", arguments: "{}" },
    ]);
    assert.equal(out.output.text, "");
  });
  it("reads chunks a proxy wrapped as {data: …}, the shape ROPE also accepts", () => {
    const r = createReader({ stream: true });
    r.feed(`data: ${JSON.stringify({ data: { id: "w", model: "m", choices: [{ index: 0, delta: { content: "hel" } }] } })}\n\n`);
    r.feed(`data: ${JSON.stringify({ data: { id: "w", choices: [{ index: 0, delta: { content: "lo" }, finish_reason: "stop" }] } })}\n\n`);
    const out = r.finish();
    assert.equal(out.output.text, "hello");
    assert.equal(out.complete, false, "no [DONE] was seen");
    assert.equal(out.id, "w");
  });
  it("keeps usage from a final chunk when the provider sends one", () => {
    const r = createReader({ stream: true });
    r.feed(chunk({ content: "a" }));
    r.feed(chunk({}, "stop"));
    r.feed(`data: ${JSON.stringify({ id: "c1", choices: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`);
    r.feed("data: [DONE]\n\n");
    assert.deepEqual(r.finish().usage, { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 });
  });
  it("notes the first output and survives a bad chunk", () => {
    let first = 0;
    const r = createReader({ stream: true, onFirstOutput: () => { first += 1; } });
    r.feed(chunk({ role: "assistant", content: "" }));
    assert.equal(first, 0, "an empty role chunk is not output");
    r.feed("data: {not json\n\n");
    r.feed(chunk({ content: "x" }));
    r.feed(chunk({ content: "y" }));
    assert.equal(first, 1);
    const out = r.finish();
    assert.equal(out.output.text, "xy");
    assert.equal(out.errors.length, 1);
    assert.match(out.errors[0].message, /bad chunk/);
  });
  it("reads a refusal", () => {
    const r = createReader({ stream: true });
    r.feed(chunk({ role: "assistant", refusal: "I can't " }));
    r.feed(chunk({ refusal: "help with that." }, "stop"));
    const out = r.finish();
    assert.equal(out.output.refusal, "I can't help with that.");
    assert.equal(out.output.text, "");
  });
});

describe("chat-completions request description", () => {
  const body = {
    model: "gpt-4o", stream: true, temperature: 0.3, seed: 7, user: "u1",
    messages: [
      { role: "system", content: "Be brief." },
      { role: "developer", content: [{ type: "text", text: "Answer in JSON." }] },
      { role: "user", content: [{ type: "text", text: "hi" }, { type: "image_url", image_url: { url: "data:..." } }] },
      { role: "assistant", content: null, tool_calls: [{ id: "c", type: "function", function: { name: "f", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "c", content: "42" },
    ],
    tools: [{ type: "function", function: { name: "f", parameters: {} } }],
    tool_choice: { type: "function", function: { name: "f" } },
    response_format: { type: "json_object" },
  };
  it("matches only chat completions", () => {
    assert.equal(match({ method: "POST", path: "/v1/chat/completions" }), true);
    assert.equal(match({ method: "POST", path: "/openai/v1/chat/completions?api-version=1" }), true);
    assert.equal(match({ method: "GET", path: "/v1/chat/completions" }), false);
    assert.equal(match({ method: "POST", path: "/v1/completions" }), false);
    assert.equal(match({ method: "POST", path: "/v1/embeddings" }), false);
  });
  it("in full capture keeps everything and derives the system prompt", () => {
    const d = describeRequest(body, { capture: "full" });
    assert.equal(d.system, "Be brief.\n\nAnswer in JSON.");
    assert.equal(d.messages.length, 5);
    assert.deepEqual(d.settings, { temperature: 0.3, seed: 7, user: "u1" });
    assert.deepEqual(d.response_format, { type: "json_object" });
    assert.equal(d.tools[0].function.name, "f");
    assert.deepEqual(d.tool_choice, { type: "function", function: { name: "f" } });
    assert.equal(d.prompt_chars, "Be brief.".length + "Answer in JSON.".length + 2 + 2);
  });
  it("in metadata capture keeps shape only", () => {
    const d = describeRequest(body, { capture: "metadata" });
    assert.deepEqual(d.system, { chars: "Be brief.\n\nAnswer in JSON.".length });
    assert.deepEqual(d.messages[2], { role: "user", chars: 2, parts: 2, tool_calls: undefined });
    assert.deepEqual(d.messages[3], { role: "assistant", chars: 0, parts: null, tool_calls: 1 });
    assert.deepEqual(d.tools, [{ type: "function", name: "f" }]);
    assert.deepEqual(d.tool_choice, { type: "object" });
    assert.deepEqual(d.response_format, { type: "json_object", schema_name: null, strict: null });
    assert.ok(!JSON.stringify(d).includes("Be brief"));
  });
  it("treats legacy functions as tools", () => {
    const d = describeRequest({ model: "m", messages: [], functions: [{ name: "g" }], function_call: "auto" }, { capture: "metadata" });
    assert.deepEqual(d.tools, [{ type: "function", name: "g" }]);
    assert.equal(d.tool_choice, "auto");
  });
});

describe("redaction and budgets", () => {
  it("replaces known values, longest first, and key-shaped strings", () => {
    const r = new Redactor({ KEY: "abcdef123456", LONGER: "abcdef123456-extra", SHORT: "ab" });
    assert.equal(r.text("use abcdef123456-extra or abcdef123456 or ab"), "use [redacted:LONGER] or [redacted:KEY] or ab");
    assert.equal(r.text("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.x.y"), "Authorization: Bearer [redacted]");
    assert.equal(r.text("key sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ012345 here"), "key [redacted:api-key] here");
    assert.equal(r.text("mongodb+srv://rope:hunter22@cluster0.example.net/rope"), "mongodb+srv://[redacted]@cluster0.example.net/rope");
    assert.deepEqual(r.json({ a: ["abcdef123456", 1, null], b: { c: "fine" } }), { a: ["[redacted:KEY]", 1, null], b: { c: "fine" } });
  });
  it("clips text and raw bytes to a budget while counting the whole", () => {
    assert.deepEqual(clip("héllo", 3), { text: "hé", bytes: 6, truncated: true });
    assert.deepEqual(clip("hi", 3), { text: "hi", bytes: 2, truncated: false });
    const sink = new ByteSink(5);
    sink.push(Buffer.from("abc")); sink.push(Buffer.from("defgh")); sink.push(Buffer.from("ij"));
    assert.equal(sink.text(), "abcde");
    assert.equal(sink.total, 10);
    assert.equal(sink.truncated, true);
  });
  it("keeps only allowlisted headers and recognizes trace lines", () => {
    assert.deepEqual(pickHeaders({ Authorization: "Bearer x", "Content-Type": "application/json", cookie: "a=b", "x-stainless-lang": "js" }, REQUEST_HEADER_ALLOWLIST), { "content-type": "application/json", "x-stainless-lang": "js" });
    assert.equal(parseTraceLine("hello"), null);
    assert.equal(parseTraceLine("{\"a\":1}"), null);
    assert.equal(parseTraceLine("{\"engelbart\":\"trace\",\"kind\":\"x\"}").kind, "x");
  });
});
