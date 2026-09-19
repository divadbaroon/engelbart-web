// The OpenAI chat-completions API (and the many OpenAI-compatible proxies
// that speak it). A provider module answers three questions for the model
// gateway: is this request one of mine, what did the application ask for,
// and what did the model answer once the bytes have gone by.
//
// Nothing here alters the exchange. The request is described from a copy
// of the body; the response is rebuilt from a tee of the stream.
import { SseParser } from "../common.mjs";

export const id = "openai.chat.completions";
export const provider = "openai";

export function match({ method, path }) {
  return method === "POST" && /\/chat\/completions\/?(?:\?|$)/.test(path);
}

// Body keys that are not settings: they are content, tools or shape.
const NOT_SETTINGS = new Set(["model", "messages", "stream", "tools", "tool_choice", "response_format", "functions", "function_call"]);

const textOf = (content) => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => (part && typeof part.text === "string" ? part.text : "")).join("");
  return "";
};
const charsOf = (message) => textOf(message?.content).length;

// Describe the request. In "full" capture the description carries the
// prompt itself; in "metadata" it carries only shape and settings.
export function describeRequest(body, { capture }) {
  const full = capture === "full";
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const settings = {};
  for (const [key, value] of Object.entries(body)) {
    if (NOT_SETTINGS.has(key)) continue;
    if (full) settings[key] = value;
    else if (value === null || ["number", "boolean"].includes(typeof value)) settings[key] = value;
    else if (typeof value === "string") settings[key] = value.length > 200 ? `${value.slice(0, 200)}…` : value;
    else settings[key] = { type: Array.isArray(value) ? "array" : typeof value };
  }

  // Leading system/developer messages are the system prompt as the model
  // saw it; they stay in messages too so the record is faithful.
  const lead = [];
  for (const m of messages) {
    if (m && (m.role === "system" || m.role === "developer")) lead.push(textOf(m.content)); else break;
  }
  const systemText = lead.length ? lead.join("\n\n") : null;

  let tools = Array.isArray(body.tools) ? body.tools : null;
  if (!tools && Array.isArray(body.functions)) tools = body.functions.map((f) => ({ type: "function", function: f, legacy: true }));
  const toolChoice = body.tool_choice ?? body.function_call ?? null;

  const responseFormat = body.response_format ?? null;

  return {
    model: typeof body.model === "string" ? body.model : null,
    stream: body.stream === true,
    settings,
    response_format: full || !responseFormat ? responseFormat : {
      type: responseFormat.type ?? null,
      schema_name: responseFormat.json_schema?.name ?? null,
      strict: responseFormat.json_schema?.strict ?? null,
    },
    tools: full || !tools ? tools : tools.map((t) => ({ type: t.type ?? null, name: t.function?.name ?? t.name ?? null })),
    tool_choice: full || toolChoice === null || typeof toolChoice === "string" ? toolChoice : { type: typeof toolChoice },
    system: full ? systemText : systemText === null ? null : { chars: systemText.length },
    messages: full ? messages : messages.map((m) => ({
      role: m?.role ?? null,
      chars: charsOf(m),
      parts: Array.isArray(m?.content) ? m.content.length : null,
      tool_calls: Array.isArray(m?.tool_calls) ? m.tool_calls.length : undefined,
    })),
    message_count: messages.length,
    system_chars: systemText?.length ?? 0,
    prompt_chars: messages.reduce((n, m) => n + charsOf(m), 0),
  };
}

// Rebuilds a response from either a streamed SSE body or a single JSON
// body. feed() takes decoded text; finish() returns the normalized result.
export function createReader({ stream, onFirstOutput }) {
  const state = { id: null, model: null, created: null, system_fingerprint: null, usage: null, choices: [], chunks: 0, done: false, errors: [] };
  let sawOutput = false;
  const noteOutput = () => { if (!sawOutput) { sawOutput = true; onFirstOutput?.(); } };

  const merge = (raw) => {
    // Some proxies wrap each chunk as {data: {...}}; ROPE reads both shapes.
    const c = raw && !raw.choices && raw.data && typeof raw.data === "object" ? raw.data : raw;
    if (!c || typeof c !== "object") return;
    state.id ??= c.id ?? null;
    state.model ??= c.model ?? null;
    state.created ??= c.created ?? null;
    state.system_fingerprint ??= c.system_fingerprint ?? null;
    if (c.usage && typeof c.usage === "object") state.usage = c.usage;
    if (c.error && !c.choices) state.errors.push(c.error);
    for (const choice of Array.isArray(c.choices) ? c.choices : []) {
      const index = choice.index ?? 0;
      const out = (state.choices[index] ??= { index, role: null, content: "", refusal: "", tool_calls: [], finish_reason: null });
      const d = choice.delta ?? choice.message ?? {};
      if (d.role) out.role = d.role;
      if (typeof d.content === "string" && d.content) { out.content += d.content; noteOutput(); }
      if (typeof d.refusal === "string" && d.refusal) { out.refusal += d.refusal; noteOutput(); }
      for (const tc of Array.isArray(d.tool_calls) ? d.tool_calls : []) {
        const t = (out.tool_calls[tc.index ?? out.tool_calls.length] ??= { id: null, type: "function", name: "", arguments: "" });
        if (tc.id) t.id = tc.id;
        if (tc.type) t.type = tc.type;
        if (tc.function?.name) t.name += tc.function.name;
        if (tc.function?.arguments) { t.arguments += tc.function.arguments; noteOutput(); }
      }
      if (d.function_call) {
        const t = (out.tool_calls[0] ??= { id: null, type: "function", name: "", arguments: "", legacy: true });
        if (d.function_call.name) t.name += d.function_call.name;
        if (d.function_call.arguments) { t.arguments += d.function_call.arguments; noteOutput(); }
      }
      if (choice.finish_reason) out.finish_reason = choice.finish_reason;
    }
  };

  let text = "";
  const sse = stream ? new SseParser(({ data }) => {
    state.chunks += 1;
    if (data.trim() === "[DONE]") { state.done = true; return; }
    try { merge(JSON.parse(data)); } catch (err) { state.errors.push({ type: "parse", message: `bad chunk: ${err.message}` }); }
  }) : null;

  return {
    feed(chunk) {
      if (sse) sse.feed(chunk);
      else text += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    },
    finish() {
      if (sse) sse.finish();
      else if (text.trim()) {
        try { merge(JSON.parse(text)); } catch (err) { state.errors.push({ type: "parse", message: `bad body: ${err.message}` }); }
      }
      const first = state.choices[0] ?? null;
      return {
        id: state.id, model: state.model, created: state.created, system_fingerprint: state.system_fingerprint,
        output: first ? {
          role: first.role, text: first.content, refusal: first.refusal || null,
          tool_calls: first.tool_calls.filter(Boolean), finish_reason: first.finish_reason,
        } : null,
        choices: state.choices.filter(Boolean).length,
        usage: state.usage,
        chunks: stream ? state.chunks : null,
        complete: stream ? state.done : state.choices.length > 0,
        errors: state.errors,
      };
    },
  };
}
