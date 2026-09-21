// The OpenAI Responses API: the newer of OpenAI's two shapes, and the
// one an application written today is likely to use. It answers the same
// three questions as every provider module — is this request one of
// mine, what did the application ask for, and what did the model answer
// — but almost nothing about the wire format is shared with chat
// completions, so this is a sibling rather than a branch.
//
// What differs, and how it is read here:
//   input          a bare string or a list of items, where chat has messages
//   instructions   a top-level system prompt with no message to live in
//   output         a list of items, where chat has choices with a delta
//   status         where chat has a finish_reason
//   usage          input_tokens / output_tokens, not prompt_ / completion_
//
// Two readings are judgement calls, written down because they decide what
// a number in the trace means:
//   - `instructions` is recorded as a leading message marked
//     `from: "instructions"`, so that a Responses call and the equivalent
//     chat call with a system message count the same messages and the
//     same prompt characters. The marker is what keeps it from being a
//     silent invention.
//   - ttft is the time to the first character of the *answer*. Reasoning
//     deltas do not start it, so a thinking model's ttft is comparable
//     with every chat call already in the corpus; what the thinking cost
//     is recorded in usage.output_tokens_details.reasoning_tokens.
//
// Nothing here alters the exchange. The request is described from a copy
// of the body; the response is rebuilt from a tee of the stream.
import { SseParser } from "../common.mjs";

export const id = "openai.responses";
export const provider = "openai";

// Version-qualified on purpose. A provider match is itself the decision
// to buffer and keep a body, and a bare "/responses" is an ordinary path
// in an ordinary web application. "/v1/responses" is not.
export function match({ method, path }) {
  return method === "POST" && /\/(?:v\d+|openai)\/responses\/?(?:\?|$)/.test(path);
}

// Body keys that are not settings: they are content, tools or shape.
const NOT_SETTINGS = new Set(["model", "input", "instructions", "stream", "tools", "tool_choice", "text"]);

// A content list holds parts of several kinds. Text is text wherever it
// is; a refusal is the model declining, which is still something it
// said; an image or a file is neither, and counts as nothing.
const textOf = (content) => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      if (typeof part.text === "string") return part.text;
      if (typeof part.refusal === "string") return part.refusal;
      return "";
    })
    .join("");
};

const itemText = (item) => {
  if (!item || typeof item !== "object") return "";
  if (item.type === "function_call_output" || item.type === "local_shell_call_output") {
    return typeof item.output === "string" ? item.output : textOf(item.output);
  }
  // A reasoning item's summary and content are text the model produced;
  // its encrypted_content is an opaque blob and is not counted anywhere.
  if (item.type === "reasoning") return textOf(item.summary) + textOf(item.content);
  return textOf(item.content);
};

const OUTPUT_ROLE = new Set(["function_call", "custom_tool_call", "reasoning", "computer_call", "image_generation_call", "code_interpreter_call", "web_search_call", "mcp_call", "local_shell_call", "shell_call", "apply_patch_call"]);
const TOOL_ROLE = new Set(["function_call_output", "custom_tool_call_output", "computer_call_output", "local_shell_call_output", "shell_call_output", "apply_patch_call_output"]);

const roleOf = (item) => {
  if (typeof item?.role === "string") return item.role;
  if (TOOL_ROLE.has(item?.type)) return "tool";
  if (OUTPUT_ROLE.has(item?.type)) return "assistant";
  return null;
};

// One reasoning item resubmitted in the input can carry tens of
// kilobytes of encrypted state, and the gateway's content budget only
// reaches `system` and `messages[].content`. Keep its size, not itself.
const safeItem = (item) =>
  item && typeof item === "object" && typeof item.encrypted_content === "string"
    ? { ...item, encrypted_content: { chars: item.encrypted_content.length } }
    : item;

const EMPTY = {
  model: null, stream: false, settings: {}, response_format: null, tools: null, tool_choice: null,
  system: null, messages: [], message_count: 0, system_chars: 0, prompt_chars: 0,
};

// Describe the request. In "full" capture the description carries the
// prompt itself; in "metadata" it carries only shape and settings.
export function describeRequest(body, { capture }) {
  // The gateway reports a throw here as a malformed body, which would be
  // a lie about the application. Anything that is not an object is
  // simply nothing we can read.
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ...EMPTY, settings: {}, messages: [] };
  const full = capture === "full";

  // `input` is either one user message written as a string, or the list.
  const raw = body.input;
  const items = typeof raw === "string" ? [{ role: "user", content: raw, from: "input_string" }] : Array.isArray(raw) ? raw : [];

  const instructions =
    typeof body.instructions === "string" ? body.instructions
    : Array.isArray(body.instructions) ? body.instructions.map(itemText).join("\n\n")
    : null;

  // Leading system/developer items are the system prompt as the model
  // saw it; they stay in messages too so the record is faithful.
  const lead = [];
  for (const item of items) {
    const role = roleOf(item);
    if (role === "system" || role === "developer") lead.push(itemText(item)); else break;
  }
  const systemText = [instructions, ...lead].filter((s) => typeof s === "string" && s).join("\n\n") || null;

  // `instructions` is a field, not a message, so it would otherwise
  // never reach the prompt everything downstream reads.
  const messages = instructions === null ? items : [{ role: "developer", content: instructions, from: "instructions" }, ...items];

  const settings = {};
  for (const [key, value] of Object.entries(body)) {
    if (NOT_SETTINGS.has(key)) continue;
    if (full) settings[key] = value;
    else if (value === null || ["number", "boolean"].includes(typeof value)) settings[key] = value;
    else if (typeof value === "string") settings[key] = value.length > 200 ? `${value.slice(0, 200)}…` : value;
    else settings[key] = { type: Array.isArray(value) ? "array" : typeof value };
  }
  // `text` is held out of settings because it carries the output format,
  // which has a field of its own; its verbosity is a setting like any other.
  const text = body.text && typeof body.text === "object" ? body.text : null;
  if (text && text.verbosity !== undefined && text.verbosity !== null) settings.verbosity = text.verbosity;

  // Responses writes the JSON-schema contract flat, where chat nests it
  // under json_schema. It is kept as it was sent, with the two keys the
  // metadata capture of a chat call also emits alongside.
  const format = text?.format ?? null;
  const responseFormat = !format ? null
    : full ? { ...format, schema_name: format.name ?? null, strict: format.strict ?? null }
    : { type: format.type ?? null, schema_name: format.name ?? null, strict: format.strict ?? null };

  const tools = Array.isArray(body.tools) ? body.tools : null;
  const toolChoice = body.tool_choice ?? null;

  return {
    model: typeof body.model === "string" ? body.model : null,
    stream: body.stream === true,
    settings,
    response_format: responseFormat,
    // A Responses tool is flat: {type, name, …} rather than
    // {type, function: {name}}. The nested read stays for the
    // OpenAI-compatible proxies that send the older shape.
    tools: full || !tools ? tools : tools.map((t) => ({ type: t?.type ?? null, name: t?.name ?? t?.function?.name ?? null })),
    tool_choice: full || toolChoice === null || typeof toolChoice === "string" ? toolChoice : { type: typeof toolChoice },
    system: full ? systemText : systemText === null ? null : { chars: systemText.length },
    messages: full ? messages.map(safeItem) : messages.map((m) => ({
      role: roleOf(m),
      chars: itemText(m).length,
      parts: Array.isArray(m?.content) ? m.content.length : null,
      item_type: typeof m?.type === "string" ? m.type : undefined,
      tool_calls: m?.type === "function_call" || m?.type === "custom_tool_call" ? 1 : undefined,
    })),
    message_count: messages.length,
    system_chars: systemText?.length ?? 0,
    prompt_chars: messages.reduce((n, m) => n + itemText(m).length, 0),
  };
}

// Responses has no finish_reason. What it has is a status and, when a
// run stopped short, a reason for that. "incomplete" and "cancelled" are
// not words chat ever produces; keeping them is better than flattening
// two different endings into "stop".
const finishFrom = (status, incomplete, output) => {
  if (status === "completed") {
    const last = output[output.length - 1];
    return last && last.type !== "message" ? "tool_calls" : "stop";
  }
  if (status === "incomplete") {
    const reason = incomplete?.reason ?? null;
    if (reason === "max_output_tokens") return "length";
    if (reason === "content_filter") return "content_filter";
    return "incomplete";
  }
  if (status === "failed") return "error";
  if (status === "cancelled") return "cancelled";
  return null;
};

const toolCallOf = (item) => {
  const type = item?.type;
  if (type === "function_call") return { id: item.call_id ?? item.id ?? null, type: "function", name: item.name ?? "", arguments: item.arguments ?? "" };
  // A custom tool call carries its argument string as `input`.
  if (type === "custom_tool_call") return { id: item.call_id ?? item.id ?? null, type: "custom", name: item.name ?? "", arguments: item.input ?? "" };
  if (type === "mcp_call") return { id: item.id ?? null, type: "mcp", name: `${item.server_label ?? "mcp"}.${item.name ?? ""}`, arguments: item.arguments ?? "" };
  return null;
};

// Rebuilds a response from either a streamed SSE body or a single JSON
// body. feed() takes decoded text; finish() returns the normalized result.
export function createReader({ stream, onFirstOutput }) {
  const state = { id: null, model: null, created: null, status: null, incomplete: null, final: null, items: [], usage: null, chunks: 0, done: false, errors: [] };
  let sawOutput = false;
  const noteOutput = () => { if (!sawOutput) { sawOutput = true; onFirstOutput?.(); } };
  const slot = (index) => (state.items[index ?? 0] ??= { type: null, id: null, callId: null, name: null, args: "", refusal: "", texts: new Map() });

  const snapshot = (response) => {
    if (!response || typeof response !== "object") return;
    state.id ??= response.id ?? null;
    state.model ??= response.model ?? null;
    state.created ??= response.created_at ?? null;
    if (response.status) state.status = response.status;
    if (response.incomplete_details) state.incomplete = response.incomplete_details;
    if (response.usage && typeof response.usage === "object") state.usage = response.usage;
  };

  const apply = (type, e) => {
    switch (type) {
      case "response.created": case "response.in_progress": case "response.queued":
        snapshot(e.response); return;
      case "response.completed": case "response.incomplete": case "response.failed":
        snapshot(e.response);
        state.final = e.response ?? state.final;
        state.done = true;
        if (e.response?.error) state.errors.push({ type: e.response.error.code ?? "response_error", message: e.response.error.message ?? "the response failed" });
        return;
      case "error":
        state.errors.push({ type: e.code ?? "error", message: e.message ?? "stream error" });
        return;
      case "response.output_item.added": case "response.output_item.done": {
        const it = slot(e.output_index);
        it.type = e.item?.type ?? it.type;
        it.id = e.item?.id ?? it.id;
        it.callId = e.item?.call_id ?? it.callId;
        it.name = e.item?.name ?? it.name;
        if (e.item?.type === "function_call" && e.item.arguments) it.args = e.item.arguments;
        if (e.item?.type === "custom_tool_call" && e.item.input) it.args = e.item.input;
        return;
      }
      case "response.content_part.added":
        if (e.part?.type === "refusal" && e.part.refusal) slot(e.output_index).refusal += e.part.refusal;
        return;
      case "response.output_text.delta": {
        const it = slot(e.output_index);
        const key = e.content_index ?? 0;
        it.texts.set(key, (it.texts.get(key) ?? "") + (e.delta ?? ""));
        if (e.delta) noteOutput();
        return;
      }
      // The done event carries the whole part, and is authoritative over
      // the deltas that built it.
      case "response.output_text.done":
        slot(e.output_index).texts.set(e.content_index ?? 0, e.text ?? "");
        return;
      case "response.refusal.delta":
        if (e.delta) { slot(e.output_index).refusal += e.delta; noteOutput(); }
        return;
      case "response.refusal.done":
        slot(e.output_index).refusal = e.refusal ?? "";
        return;
      case "response.function_call_arguments.delta": case "response.custom_tool_call_input.delta": case "response.mcp_call_arguments.delta":
        if (e.delta) { slot(e.output_index).args += e.delta; noteOutput(); }
        return;
      case "response.function_call_arguments.done": {
        const it = slot(e.output_index);
        it.args = e.arguments ?? it.args;
        it.name = e.name ?? it.name;
        return;
      }
      case "response.custom_tool_call_input.done":
        slot(e.output_index).args = e.input ?? slot(e.output_index).args;
        return;
      case "response.mcp_call_arguments.done":
        slot(e.output_index).args = e.arguments ?? slot(e.output_index).args;
        return;
      default:
        // Every other event is counted and otherwise left alone: audio,
        // annotations, reasoning, the per-tool progress events.
        return;
    }
  };

  let text = "";
  const sse = stream ? new SseParser(({ event, data }) => {
    state.chunks += 1;
    if (data.trim() === "[DONE]") { state.done = true; return; }
    let parsed;
    try { parsed = JSON.parse(data); } catch (err) { state.errors.push({ type: "parse", message: `bad chunk: ${err.message}` }); return; }
    // Some proxies wrap each event as {data: {...}}, as they do for chat.
    const e = parsed && !parsed.type && parsed.data && typeof parsed.data === "object" ? parsed.data : parsed;
    apply(typeof e?.type === "string" ? e.type : event, e ?? {});
  }) : null;

  // What the answer says, read from the finished response when there is
  // one and from the accumulated events when the stream stopped short.
  const fromFinal = (final) => {
    const output = Array.isArray(final.output) ? final.output : [];
    const parts = output.filter((i) => i?.type === "message").flatMap((i) => (Array.isArray(i.content) ? i.content : []));
    return {
      text: parts.filter((c) => c?.type === "output_text").map((c) => c.text ?? "").join(""),
      refusal: parts.filter((c) => c?.type === "refusal").map((c) => c.refusal ?? "").join(""),
      toolCalls: output.map(toolCallOf).filter(Boolean),
      messages: output.filter((i) => i?.type === "message").length,
      hasOutput: output.length > 0,
    };
  };

  const fromItems = () => {
    const items = state.items.filter(Boolean);
    const said = items.filter((i) => i.type === "message" || i.type === null);
    return {
      text: said.map((i) => [...i.texts.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v).join("")).join(""),
      refusal: items.map((i) => i.refusal).join(""),
      toolCalls: items
        .map((i) => (i.type === "function_call" || i.type === "custom_tool_call" || i.type === "mcp_call"
          ? { id: i.callId ?? i.id ?? null, type: i.type === "function_call" ? "function" : i.type === "custom_tool_call" ? "custom" : "mcp", name: i.name ?? "", arguments: i.args ?? "" }
          : null))
        .filter(Boolean),
      messages: said.length,
      hasOutput: items.length > 0,
    };
  };

  return {
    feed(chunk) {
      if (sse) sse.feed(chunk);
      else text += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    },
    finish() {
      if (sse) sse.finish();
      else if (text.trim()) {
        try {
          const body = JSON.parse(text);
          snapshot(body);
          state.final = body;
        } catch (err) { state.errors.push({ type: "parse", message: `bad body: ${err.message}` }); }
      }
      const read = state.final ? fromFinal(state.final) : fromItems();
      // A body that arrived whole still had a first output character, and
      // the trace asserts ttfb ≤ ttft ≤ latency for every call.
      if (!stream && (read.text || read.refusal || read.toolCalls.length)) noteOutput();

      const output = read.hasOutput || read.text || read.toolCalls.length ? {
        role: read.messages > 0 || read.text ? "assistant" : null,
        text: read.text,
        refusal: read.refusal || null,
        tool_calls: read.toolCalls,
        finish_reason: finishFrom(state.status, state.incomplete, Array.isArray(state.final?.output) ? state.final.output : state.items.filter(Boolean)),
      } : null;

      return {
        id: state.id, model: state.model, created: state.created,
        // Responses has no system fingerprint.
        system_fingerprint: null,
        output,
        choices: read.messages,
        usage: state.usage,
        chunks: stream ? state.chunks : null,
        complete: stream ? state.done : Boolean(state.final),
        errors: state.errors,
      };
    },
  };
}
