// A synthetic captured model call for the fixture session's call mc_1
// (and a second one to compare against). Not any real application's
// prompt: the text is made up, shaped like a tutor's request.
import type { ModelCall } from "../../../lib/trace/types";
import { t } from "../../trace/fixtures/session";

const SYSTEM = `# Role\nYou are a patient tutor for a programming puzzle.\n\n# Rules\nNever give the full solution.\nAsk one question at a time.\n\n# Output\nAnswer as JSON with keys "feedback" and "question".`;

export const call1: ModelCall = {
  id: "00000000-0000-0000-0000-000000000001", runId: "r", callId: "mc_1", capture: "full", provider: "openai", api: "chat.completions", method: "POST",
  upstream: { scheme: "https", host: "api.openai-proxy.com", path: "/v1/chat/completions", has_query: false },
  model: "gpt-4o", streamed: true, phase: "response", status: 200, startedAt: t(20, 460), endedAt: t(24, 557), latencyMs: 4097, ttfbMs: 610, ttftMs: 640,
  request: {
    model: "gpt-4o", stream: true, settings: { temperature: 0.2, max_tokens: 800 }, response_format: { type: "json_schema", json_schema: { name: "tutor_turn" } }, tools: null, tool_choice: null,
    system: SYSTEM,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: "Board state: 8 x 6, empty. Student said: create an 8 x 6 board" },
      { role: "assistant", content: "{\"feedback\":\"ok\",\"question\":\"What next?\"}" },
    ],
    message_count: 3, system_chars: SYSTEM.length, prompt_chars: SYSTEM.length + 120,
  },
  requestParse: { ok: true, reason: null }, requestHeaders: null,
  response: {
    id: "chatcmpl-1", model: "gpt-4o-2024-08-06", system_fingerprint: null, finish_reason: "stop", choices: 1,
    output: { role: "assistant", text: "{\"feedback\":\"Great start! You've correctly identified the board.\",\"question\":\"Which piece goes first?\"}", text_truncated: false, refusal: null, tool_calls: [] },
    usage: null, usage_available: false, chunks: 41, complete: true, parse_errors: [],
  } as ModelCall["response"],
  responseHeaders: null, error: null, usage: null, usageAvailable: false, rawRequest: null, rawResponse: null,
  sizes: { request_bytes: 1830, response_bytes: 2210 }, aborted: false, interactionId: "i_page000001_8", requestId: "r_act", correlation: "temporal",
};

export const call2: ModelCall = {
  ...call1, id: "00000000-0000-0000-0000-000000000002", callId: "mc_2", startedAt: t(40), endedAt: t(43), latencyMs: 3000, interactionId: null, requestId: null, correlation: null,
  request: { ...call1.request!, settings: { temperature: 0.7, max_tokens: 800 }, messages: [...call1.request!.messages, { role: "user", content: "Student said: place the first piece" }], message_count: 4 },
  response: { ...call1.response!, output: { role: "assistant", text: "{\"feedback\":\"Placed.\",\"question\":\"And now?\"}", text_truncated: false, refusal: null, tool_calls: [] } },
};
