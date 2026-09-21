// The Responses API reader. The fixture is a real call the gateway
// recorded and could not read — run 06c6dab1, cocoa-canvas — so the
// first test here is the one that would have caught the gap.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createReader, describeRequest, id, match, provider } from "../../sandbox/trace/providers/openai-responses.mjs";
import { match as chatMatch } from "../../sandbox/trace/providers/openai-chat.mjs";

const recorded = JSON.parse(readFileSync(new URL("./fixtures/openai-responses-call.json", import.meta.url), "utf8"));
const sse = (type, body = {}) => `event: ${type}\ndata: ${JSON.stringify({ type, ...body })}\n\n`;

describe("which requests this reads", () => {
  it("claims a Responses call and leaves everything else alone", () => {
    assert.equal(match({ method: "POST", path: "/v1/responses" }), true);
    assert.equal(match({ method: "POST", path: "/v1/responses?store=false" }), true);
    assert.equal(match({ method: "POST", path: "/openai/v1/responses?api-version=2025-04-01" }), true);
    assert.equal(match({ method: "POST", path: "/api/v1/responses" }), true);
    // Not a version-qualified path: an ordinary application route.
    assert.equal(match({ method: "POST", path: "/responses" }), false);
    assert.equal(match({ method: "POST", path: "/survey/responses" }), false);
    // Retrieving a stored response sends no body to describe.
    assert.equal(match({ method: "GET", path: "/v1/responses/resp_1" }), false);
    assert.equal(match({ method: "POST", path: "/v1/responses/resp_1/cancel" }), false);
  });
  it("does not overlap with the chat reader", () => {
    assert.equal(match({ method: "POST", path: "/v1/chat/completions" }), false);
    assert.equal(chatMatch({ method: "POST", path: "/v1/responses" }), false);
    assert.equal(provider, "openai");
    assert.equal(id, "openai.responses");
  });
});

describe("describing the request", () => {
  it("reads the call the run recorded", () => {
    const d = describeRequest(recorded.request, { capture: "full" });
    assert.equal(d.model, "gpt-4.1");
    assert.equal(d.stream, false);
    assert.equal(d.message_count, 1);
    assert.equal(d.messages[0].role, "user");
    assert.equal(d.prompt_chars, 864);
    assert.match(d.messages[0].content, /hci research/);
  });

  it("treats a bare string input as the user's message", () => {
    const d = describeRequest({ model: "gpt-5", input: "plan a canvas" }, { capture: "full" });
    assert.equal(d.message_count, 1);
    assert.equal(d.prompt_chars, "plan a canvas".length);
    assert.deepEqual(d.messages[0], { role: "user", content: "plan a canvas", from: "input_string" });
  });

  it("keeps instructions as the system prompt and as a marked message", () => {
    const d = describeRequest({ model: "gpt-5", instructions: "Be terse.", input: [{ role: "user", content: "hi" }] }, { capture: "full" });
    assert.equal(d.system, "Be terse.");
    assert.equal(d.system_chars, 9);
    assert.equal(d.message_count, 2);
    assert.equal(d.messages[0].from, "instructions");
    assert.equal(d.prompt_chars, 11);
  });

  it("counts content parts, refusals and tool items the way chat does", () => {
    const d = describeRequest({
      model: "gpt-5",
      input: [
        { role: "user", content: [{ type: "input_text", text: "look" }, { type: "input_image", image_url: "…" }] },
        { type: "function_call", name: "lookup", arguments: "{\"q\":1}", call_id: "fc_1" },
        { type: "function_call_output", call_id: "fc_1", output: "42" },
        { role: "assistant", content: [{ type: "refusal", refusal: "no" }] },
      ],
    }, { capture: "metadata" });
    assert.equal(d.message_count, 4);
    // An image part counts as nothing; a tool call's arguments are not prompt text.
    assert.equal(d.prompt_chars, 4 + 0 + 2 + 2);
    assert.deepEqual(d.messages.map((m) => m.role), ["user", "assistant", "tool", "assistant"]);
    assert.equal(d.messages[1].tool_calls, 1);
    assert.equal(d.messages[1].item_type, "function_call");
  });

  it("reads the flat json_schema shape and the verbosity setting", () => {
    const d = describeRequest({
      model: "gpt-5", input: "x",
      text: { format: { type: "json_schema", name: "plan", strict: true, schema: { type: "object" } }, verbosity: "low" },
    }, { capture: "metadata" });
    assert.equal(d.response_format.type, "json_schema");
    assert.equal(d.response_format.schema_name, "plan");
    assert.equal(d.response_format.strict, true);
    assert.equal(d.settings.verbosity, "low");
    assert.equal(d.settings.text, undefined);
  });

  it("names a flat tool and keeps a built-in tool's type", () => {
    const d = describeRequest({ model: "gpt-5", input: "x", tools: [{ type: "function", name: "lookup", parameters: {} }, { type: "web_search" }] }, { capture: "metadata" });
    assert.deepEqual(d.tools, [{ type: "function", name: "lookup" }, { type: "web_search", name: null }]);
  });

  it("keeps the size of a resubmitted reasoning blob, not the blob", () => {
    const d = describeRequest({ model: "gpt-5", input: [{ type: "reasoning", summary: [{ type: "summary_text", text: "hm" }], encrypted_content: "x".repeat(40_000) }] }, { capture: "full" });
    assert.deepEqual(d.messages[0].encrypted_content, { chars: 40_000 });
    assert.equal(d.prompt_chars, 2);
  });

  it("never throws on a body that is not a Responses request", () => {
    for (const body of [null, undefined, 42, "text", [], { input: 7 }]) {
      const d = describeRequest(body, { capture: "full" });
      assert.equal(d.model, null);
      assert.deepEqual(d.messages, []);
      assert.equal(d.prompt_chars, 0);
    }
  });
});

describe("reading the answer", () => {
  it("reads the whole of the call the run recorded", () => {
    let ttft = 0;
    const r = createReader({ stream: false, onFirstOutput: () => { ttft += 1; } });
    r.feed(JSON.stringify(recorded.response));
    const out = r.finish();
    assert.equal(out.model, "gpt-4.1-2025-04-14");
    assert.equal(out.id, "resp_07ce15189d496b97006ab08eb2673487d0b597b8485b8dd4ff");
    assert.equal(out.output.text.length, 712);
    assert.match(out.output.text, /Planning and Launching HCI Research/);
    assert.equal(out.output.role, "assistant");
    assert.equal(out.output.finish_reason, "stop");
    assert.deepEqual(out.output.tool_calls, []);
    assert.equal(out.choices, 1);
    assert.deepEqual(out.usage, { input_tokens: 200, input_tokens_details: { cache_write_tokens: 0, cached_tokens: 0 }, output_tokens: 156, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 356 });
    assert.equal(out.chunks, null);
    assert.equal(out.complete, true);
    assert.deepEqual(out.errors, []);
    // A body that arrived whole still had a first output character.
    assert.equal(ttft, 1);
  });

  it("assembles a streamed answer and counts what arrived", () => {
    let ttft = null;
    const r = createReader({ stream: true, onFirstOutput: () => { ttft ??= "first delta"; } });
    r.feed(sse("response.created", { response: { id: "resp_2", model: "gpt-5", created_at: 1, status: "in_progress" } }));
    r.feed(sse("response.output_item.added", { output_index: 0, item: { id: "msg_1", type: "message", role: "assistant" } }));
    assert.equal(ttft, null, "nothing has been said yet");
    r.feed(sse("response.output_text.delta", { output_index: 0, content_index: 0, delta: "Hel" }));
    r.feed(sse("response.output_text.delta", { output_index: 0, content_index: 0, delta: "lo" }));
    r.feed(sse("response.output_text.done", { output_index: 0, content_index: 0, text: "Hello" }));
    r.feed(sse("response.completed", { response: { id: "resp_2", model: "gpt-5", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Hello" }] }], usage: { input_tokens: 3, output_tokens: 1, total_tokens: 4 } } }));
    r.feed("data: [DONE]\n\n");
    const out = r.finish();
    assert.equal(ttft, "first delta");
    assert.equal(out.output.text, "Hello");
    assert.equal(out.output.finish_reason, "stop");
    assert.equal(out.model, "gpt-5");
    assert.equal(out.chunks, 7, "six events and the [DONE] that closed them");
    assert.equal(out.complete, true);
    assert.equal(out.usage.output_tokens, 1);
  });

  it("assembles streamed tool-call arguments and says the turn was a tool call", () => {
    const r = createReader({ stream: true });
    r.feed(sse("response.created", { response: { id: "r", model: "m", status: "in_progress" } }));
    r.feed(sse("response.output_item.added", { output_index: 0, item: { id: "fc_1", type: "function_call", call_id: "call_1", name: "lookup", arguments: "" } }));
    r.feed(sse("response.function_call_arguments.delta", { output_index: 0, delta: "{\"q\":" }));
    r.feed(sse("response.function_call_arguments.delta", { output_index: 0, delta: "\"x\"}" }));
    r.feed(sse("response.function_call_arguments.done", { output_index: 0, arguments: "{\"q\":\"x\"}" }));
    r.feed(sse("response.completed", { response: { id: "r", model: "m", status: "completed", output: [{ type: "function_call", id: "fc_1", call_id: "call_1", name: "lookup", arguments: "{\"q\":\"x\"}" }] } }));
    const out = r.finish();
    assert.deepEqual(out.output.tool_calls, [{ id: "call_1", type: "function", name: "lookup", arguments: "{\"q\":\"x\"}" }]);
    assert.equal(out.output.finish_reason, "tool_calls");
    assert.equal(out.output.text, "");
    assert.equal(out.choices, 0);
  });

  it("keeps what arrived when a stream stops short, and says it is not complete", () => {
    const r = createReader({ stream: true });
    r.feed(sse("response.created", { response: { id: "r", model: "m", status: "in_progress" } }));
    r.feed(sse("response.output_item.added", { output_index: 0, item: { id: "msg", type: "message", role: "assistant" } }));
    r.feed(sse("response.output_text.delta", { output_index: 0, content_index: 0, delta: "half a th" }));
    const out = r.finish();
    assert.equal(out.complete, false);
    assert.equal(out.output.text, "half a th");
    assert.equal(out.output.finish_reason, null, "nothing said how it ended");
    assert.equal(out.model, "m");
  });

  it("reads the reason a run stopped short", () => {
    const stopped = (status, details) => {
      const r = createReader({ stream: true });
      r.feed(sse(`response.${status}`, { response: { id: "r", model: "m", status, incomplete_details: details, output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "cut" }] }] } }));
      return r.finish().output.finish_reason;
    };
    assert.equal(stopped("incomplete", { reason: "max_output_tokens" }), "length");
    assert.equal(stopped("incomplete", { reason: "content_filter" }), "content_filter");
    assert.equal(stopped("incomplete", { reason: "something new" }), "incomplete");
  });

  it("records a failure the response reports about itself", () => {
    const r = createReader({ stream: true });
    r.feed(sse("response.failed", { response: { id: "r", model: "m", status: "failed", error: { code: "server_error", message: "upstream fell over" }, output: [] } }));
    const out = r.finish();
    assert.deepEqual(out.errors, [{ type: "server_error", message: "upstream fell over" }]);
    assert.equal(out.complete, true);
  });

  it("keeps a refusal as a refusal, not as the answer", () => {
    const r = createReader({ stream: true });
    r.feed(sse("response.refusal.delta", { output_index: 0, delta: "I can't help with that" }));
    r.feed(sse("response.completed", { response: { id: "r", model: "m", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "refusal", refusal: "I can't help with that" }] }] } }));
    const out = r.finish();
    assert.equal(out.output.refusal, "I can't help with that");
    assert.equal(out.output.text, "");
  });

  it("leaves reasoning out of the answer and out of the first-output timing", () => {
    let ttft = null;
    const r = createReader({ stream: true, onFirstOutput: () => { ttft ??= "started"; } });
    r.feed(sse("response.reasoning_summary_text.delta", { output_index: 0, delta: "thinking…" }));
    assert.equal(ttft, null, "thinking is not answering");
    r.feed(sse("response.output_text.delta", { output_index: 1, content_index: 0, delta: "4" }));
    assert.equal(ttft, "started");
    r.feed(sse("response.completed", { response: { id: "r", model: "m", status: "completed", output: [
      { type: "reasoning", summary: [{ type: "summary_text", text: "thinking…" }] },
      { type: "message", role: "assistant", content: [{ type: "output_text", text: "4" }] },
    ], usage: { input_tokens: 1, output_tokens: 9, output_tokens_details: { reasoning_tokens: 8 }, total_tokens: 10 } } }));
    const out = r.finish();
    assert.equal(out.output.text, "4");
    assert.equal(out.usage.output_tokens_details.reasoning_tokens, 8, "what the thinking cost is still recorded");
  });

  it("survives a bad chunk and a proxy's wrapper", () => {
    const r = createReader({ stream: true });
    r.feed("data: not json\n\n");
    r.feed(`data: ${JSON.stringify({ data: { type: "response.output_text.delta", output_index: 0, content_index: 0, delta: "wrapped" } })}\n\n`);
    const out = r.finish();
    assert.equal(out.output.text, "wrapped");
    assert.equal(out.errors.length, 1);
    assert.match(out.errors[0].message, /bad chunk/);
  });

  it("never returns a tool call the gateway cannot clip", () => {
    // The gateway does clip(t.arguments) and t.name unconditionally.
    const r = createReader({ stream: true });
    r.feed(sse("response.completed", { response: { id: "r", model: "m", status: "completed", output: [
      { type: "function_call", id: "fc" },
      { type: "custom_tool_call", id: "ct" },
      { type: "mcp_call", id: "mc", server_label: "docs" },
    ] } }));
    for (const call of r.finish().output.tool_calls) {
      assert.equal(typeof call.name, "string");
      assert.equal(typeof call.arguments, "string");
    }
  });
});
