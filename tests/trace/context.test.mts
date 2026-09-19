// The cards are a presentation of the captured request: what it carried,
// split only where the text itself is split, with counts where content
// was not kept. Nothing about where the content came from.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { contextCards, conversation, modelSummary, outputPreview, previewValue, promptSections } from "../../lib/trace/context";
import type { ModelCall } from "../../lib/trace/types";

// The captured ROPE call, shortened: a system prompt with starred labels
// and rule-separated sections, one earlier assistant turn, the user's
// message, a strict JSON schema, a streamed JSON answer.
const SYSTEM = `

    You are an experienced Teaching Assistant trying to guide a student through the assignment.

    ***
    *Course*:
    Software Engineering

    *Assignment name*:
    Tetris Design and Implementation

    *Main Steps* (hidden from the student):
    - Creating and Drawing the Board: Initiate a 8x6 Tetris board and display it.
    ***

    As a Teaching Assistant, you need to guide students to self-identify the "Main Steps".

    ***
    Do not give away the answer.
    ***
    Output in json format:
    {
      gameDoc: write the name as the game name (one word).
    }
    `;
const ANSWER = JSON.stringify({ chatContent: "Great start! You've correctly identified \"Creating and Drawing the Board\". Now, think about how pieces are created.", gameDoc: { name: "Tetris", steps: [{ name: "Creating and Drawing the Board", description: "Initiate a 8x6 Tetris board and display it.", show: true }, { name: "Creating and Drawing the Pieces", description: "…", show: false }] }, action: [] });

const call = (over: Partial<ModelCall> = {}): ModelCall => ({
  id: "row", runId: "r", callId: "mc_1", capture: "full", provider: "openai", api: "openai.chat.completions", method: "POST",
  upstream: { scheme: "https", host: "api.openai-proxy.com", path: "/v1/chat/completions", has_query: false },
  model: "gpt-4o-2024-08-06", streamed: true, phase: "response", status: 200, startedAt: "2026-09-19T04:20:51.806Z", endedAt: "2026-09-19T04:20:55.895Z",
  latencyMs: 4097.6, ttfbMs: 300, ttftMs: 2691.9,
  request: {
    model: "gpt-4o-2024-08-06", stream: true, settings: { max_tokens: 4096, temperature: 0.7 },
    response_format: { type: "json_schema", json_schema: { name: "outline_json", strict: true, schema: { type: "object", required: ["chatContent", "gameDoc", "action"], properties: { chatContent: {}, gameDoc: {}, action: {} } } } },
    tools: null, tool_choice: null, system: SYSTEM,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "assistant", content: "{\n  chatContent: \"Hi there! Can you try to enumerate the main steps?\"\n}" },
      { role: "user", content: "create an 8 x 6 board" },
    ],
    message_count: 3, system_chars: SYSTEM.length, prompt_chars: SYSTEM.length + 80,
  },
  requestParse: { ok: true, reason: null }, requestHeaders: null,
  response: { id: null, model: "gpt-4o-2024-08-06", system_fingerprint: null, finish_reason: "stop", choices: 1, output: { role: "assistant", text: ANSWER, text_truncated: false, refusal: null, tool_calls: [] }, usage: null, usage_available: false, chunks: 40, complete: true, parse_errors: [] },
  responseHeaders: null, error: null, usage: null, usageAvailable: false, rawRequest: null, rawResponse: null, sizes: null, aborted: false,
  interactionId: null, requestId: "r_act", correlation: "temporal", ...over,
});

describe("context cards", () => {
  it("derives one card per kind of content the request carried, in reading order", () => {
    const cards = contextCards(call());
    assert.deepEqual(cards.map((c) => c.id), ["system", "history", "input", "contract"]);
    const [system, history, input, contract] = cards;
    assert.equal(system.title, "System instructions");
    assert.match(system.summary, /^You are an experienced Teaching Assistant/);
    assert.equal(system.meta, `${SYSTEM.length.toLocaleString("en-US")} chars · 5 sections`);
    assert.equal(history.meta, "1 previous turn · 71 chars");
    assert.match(history.summary, /^assistant: \{ chatContent: "Hi there!/);
    assert.equal(input.title, "User message");
    assert.equal(input.summary, "“create an 8 x 6 board”");
    assert.equal(input.meta, "21 chars");
    assert.equal(contract.summary, "outline_json · { chatContent, gameDoc, action }");
    assert.equal(contract.meta, "strict JSON schema");
    assert.ok(cards.every((c) => c.kept));
  });
  it("offers tools as a card only when the request offered any, and skips what is absent", () => {
    const withTools = contextCards(call({ request: { ...call().request!, tools: [{ type: "function", function: { name: "lookup_step" } }], tool_choice: "auto", response_format: null, messages: [{ role: "user", content: "hi" }], system: null } }));
    assert.deepEqual(withTools.map((c) => c.id), ["input", "tools"]);
    assert.equal(withTools[1].summary, "lookup_step");
    assert.equal(withTools[1].meta, "1 tool · choice auto");
    assert.deepEqual(contextCards(call({ request: null })), []);
  });
  it("shows counts, not text, when content was not kept", () => {
    const cards = contextCards(call({ capture: "metadata", request: { ...call().request!, system: { chars: 5952 }, messages: [{ role: "system", chars: 5952 }, { role: "assistant", chars: 462 }, { role: "user", chars: 21 }] } }));
    assert.equal(cards[0].summary, "5,952 characters, not kept");
    assert.equal(cards[1].summary, "assistant");
    assert.equal(cards[2].summary, "21 characters, not kept");
    assert.ok(cards.slice(0, 3).every((c) => !c.kept));
    assert.equal(JSON.stringify(cards).includes("board"), false);
  });
  it("splits the message array into system, earlier turns and the latest input, whatever its role", () => {
    const c = conversation(call().request);
    assert.equal(c.system.length, 1);
    assert.deepEqual(c.turns.map((t) => t.role), ["assistant"]);
    assert.equal(c.input?.role, "user");
    const tool = conversation({ ...call().request!, messages: [{ role: "user", content: "x" }, { role: "assistant", tool_calls: [{}] }, { role: "tool", content: "42", tool_call_id: "t1" }] });
    assert.equal(tool.input?.role, "tool");
    assert.equal(tool.turns.length, 2);
    assert.equal(conversation(null).input, null);
  });
});

describe("prompt sections", () => {
  it("splits only at the prompt's own rules and headings, titles sections by their own labels, and keeps the text as written", () => {
    const sections = promptSections(SYSTEM);
    assert.deepEqual(sections.map((s) => s.title), [
      "You are an experienced Teaching Assistant tryin…",
      "Course · Assignment name · Main Steps",
      "As a Teaching Assistant, you need to guide stud…",
      "Do not give away the answer.",
      "Output in json format",
    ]);
    assert.ok(sections[1].text.startsWith("    *Course*:"), "indentation is kept");
    assert.equal(sections.map((s) => s.text).join("").includes("***"), false);
  });
  it("keeps a prompt without boundaries as one section, and uses markdown headings when present", () => {
    assert.deepEqual(promptSections("Be brief.\nAnswer in French."), [{ title: "Be brief.", text: "Be brief.\nAnswer in French." }]);
    assert.deepEqual(promptSections("# Role\nYou grade essays.\n\n## Rubric\n- clarity\n").map((s) => s.title), ["Role", "Rubric"]);
    assert.deepEqual(promptSections("   \n"), []);
  });
});

describe("model and output", () => {
  it("summarizes the model, where it was reached and its settings", () => {
    const m = modelSummary(call());
    assert.equal(m.model, "gpt-4o-2024-08-06");
    assert.equal(m.answeredAs, null);
    assert.equal(m.provider, "OpenAI");
    assert.equal(m.api, "chat.completions");
    assert.equal(m.host, "api.openai-proxy.com");
    assert.deepEqual(m.settings, [{ key: "max_tokens", value: "4096" }, { key: "temperature", value: "0.7" }]);
    assert.equal(m.state, "done");
    assert.equal(modelSummary(call({ phase: "request", status: null })).state, "in flight");
    assert.equal(modelSummary(call({ model: "gpt-4o", response: { ...call().response!, model: "gpt-4o-2024-08-06" } })).answeredAs, "gpt-4o-2024-08-06");
  });
  it("previews a JSON answer by its top-level keys and a text answer by its first words", () => {
    const p = outputPreview(call());
    assert.equal(p.kind, "json");
    if (p.kind === "json") {
      assert.deepEqual(p.entries, [
        { key: "chatContent", value: "“Great start! You've correctly identified \"Creating and Drawing the Boar…”" },
        { key: "gameDoc", value: "{ name, steps }" },
        { key: "action", value: "[0 items]" },
      ]);
      assert.equal(p.more, 0);
    }
    assert.equal(previewValue([{ name: "a", show: true }, { name: "b", show: false }]), "[2 items of { name, show }]");
    const text = outputPreview(call({ response: { ...call().response!, output: { role: "assistant", text: "Sure. ".repeat(60), text_truncated: false, refusal: null, tool_calls: [] } } }));
    assert.equal(text.kind, "text");
    if (text.kind === "text") { assert.ok(text.text.length <= 220); assert.equal(text.truncated, true); }
    assert.deepEqual(outputPreview(call({ phase: "request" })), { kind: "pending" });
    assert.deepEqual(outputPreview(call({ phase: "error", error: { type: "http_401", message: "Incorrect API key" } })), { kind: "error", message: "Incorrect API key" });
    assert.deepEqual(outputPreview(call({ capture: "metadata", response: { ...call().response!, output: { chars: 1209, refusal: false, tool_calls: [] } } })), { kind: "counts", chars: 1209, refusal: false, toolCalls: [] });
  });
});
