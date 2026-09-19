// A run's behavior trace: the timeline of what the person did in the
// running application, what it asked over the network and what it asked a
// model, plus each model call in full. Rows come from engelbart_trace_events
// and engelbart_model_calls. Free of React and of Supabase so the desktop
// app can share it.

// Whether a run is traced, and whether content is kept or only its shape.
export type TraceCapture = "off" | "metadata" | "full";
export type ContentCapture = Exclude<TraceCapture, "off">;

export type TraceSource = "browser" | "preview-gateway" | "model-gateway" | "wrapper" | "collector";

// How two events were tied together: an id one of them carried on
// purpose, or nothing but their timing.
export type Correlation = "explicit" | "temporal";

export type TraceEvent = {
  id: number;
  runId: string;
  seq: number;
  at: string;           // the sandbox's clock
  receivedAt: string;
  source: TraceSource;
  kind: string;         // ui.click, network.request, model.request, instrument.applied, ...
  interactionId: string | null;
  requestId: string | null;
  callId: string | null;
  correlation: Correlation | null;
  data: Record<string, unknown> | null;
};

export type ModelUpstream = { scheme: string; host: string; path: string; has_query: boolean };

// The call as the model saw it, as the gateway's provider module
// described it. In "metadata" capture, text fields are counts instead.
export type ModelRequest = {
  model: string | null;
  stream: boolean;
  settings: Record<string, unknown>;
  response_format: unknown;
  tools: unknown[] | null;
  tool_choice: unknown;
  system: string | { chars: number } | null;
  messages: unknown[];
  message_count: number;
  system_chars: number;
  prompt_chars: number;
  truncated?: boolean;
};

export type ModelToolCall = { id: string | null; type: string; name: string; arguments: string; legacy?: boolean };

export type ModelResponse = {
  id: string | null;
  model: string | null;
  system_fingerprint: string | null;
  finish_reason: string | null;
  choices: number;
  output:
    | { role: string | null; text: string; text_truncated: boolean; refusal: string | null; tool_calls: ModelToolCall[] }
    | { chars: number; refusal: boolean; tool_calls: string[] }
    | null;
  usage: Record<string, unknown> | null;
  usage_available: boolean;
  chunks: number | null;
  complete: boolean;
  parse_errors: { type: string; message: string }[];
};

export type ModelError = { type: string; message: string; code?: string | null; param?: string | null };

export type ModelCall = {
  id: string;
  runId: string;
  callId: string;
  capture: ContentCapture;
  provider: string | null;
  api: string | null;
  method: string;
  upstream: ModelUpstream;
  model: string | null;
  streamed: boolean | null;
  phase: "request" | "response" | "error";
  status: number | null;
  startedAt: string;
  endedAt: string | null;
  latencyMs: number | null;
  ttfbMs: number | null;
  ttftMs: number | null;
  request: ModelRequest | null;
  requestParse: { ok: boolean; reason: string | null } | null;
  requestHeaders: Record<string, string> | null;
  response: ModelResponse | null;
  responseHeaders: Record<string, string> | null;
  error: (ModelError & { phase?: string }) | null;
  usage: Record<string, unknown> | null;
  usageAvailable: boolean;
  rawRequest: string | null;    // only when asked for
  rawResponse: string | null;
  sizes: Record<string, number> | null;
  aborted: boolean;
  interactionId: string | null;
  requestId: string | null;
  correlation: Correlation | null;
};

export type TraceEventRow = {
  id: number; run_id: string; seq: number; at: string; received_at: string; source: TraceSource; kind: string;
  interaction_id: string | null; request_id: string | null; call_id: string | null; correlation: Correlation | null; data: Record<string, unknown> | null;
};

export type ModelCallRow = {
  id: string; run_id: string; call_id: string; capture: ContentCapture; provider: string | null; api: string | null; method: string;
  upstream: ModelUpstream; model: string | null; streamed: boolean | null; phase: ModelCall["phase"]; status: number | null;
  started_at: string; ended_at: string | null; latency_ms: number | null; ttfb_ms: number | null; ttft_ms: number | null;
  request: ModelRequest | null; request_parse: ModelCall["requestParse"]; request_headers: Record<string, string> | null;
  response: ModelResponse | null; response_headers: Record<string, string> | null; error: ModelCall["error"];
  usage: Record<string, unknown> | null; usage_available: boolean; raw_request?: string | null; raw_response?: string | null;
  sizes: Record<string, number> | null; aborted: boolean; interaction_id: string | null; request_id: string | null; correlation: Correlation | null;
};

export const TRACE_EVENT_COLUMNS = "id, run_id, seq, at, received_at, source, kind, interaction_id, request_id, call_id, correlation, data";
// The raw bodies are left out unless asked for: they can be megabytes.
export const MODEL_CALL_COLUMNS = "id, run_id, call_id, capture, provider, api, method, upstream, model, streamed, phase, status, started_at, ended_at, latency_ms, ttfb_ms, ttft_ms, request, request_parse, request_headers, response, response_headers, error, usage, usage_available, sizes, aborted, interaction_id, request_id, correlation";
export const MODEL_CALL_RAW_COLUMNS = `${MODEL_CALL_COLUMNS}, raw_request, raw_response`;

export const toTraceEvent = (r: TraceEventRow): TraceEvent => ({
  id: r.id, runId: r.run_id, seq: r.seq, at: r.at, receivedAt: r.received_at, source: r.source, kind: r.kind,
  interactionId: r.interaction_id, requestId: r.request_id, callId: r.call_id, correlation: r.correlation, data: r.data,
});

export const toModelCall = (r: ModelCallRow): ModelCall => ({
  id: r.id, runId: r.run_id, callId: r.call_id, capture: r.capture, provider: r.provider, api: r.api, method: r.method, upstream: r.upstream,
  model: r.model, streamed: r.streamed, phase: r.phase, status: r.status, startedAt: r.started_at, endedAt: r.ended_at,
  latencyMs: r.latency_ms, ttfbMs: r.ttfb_ms, ttftMs: r.ttft_ms, request: r.request, requestParse: r.request_parse, requestHeaders: r.request_headers,
  response: r.response, responseHeaders: r.response_headers, error: r.error, usage: r.usage, usageAvailable: r.usage_available,
  rawRequest: r.raw_request ?? null, rawResponse: r.raw_response ?? null, sizes: r.sizes, aborted: r.aborted,
  interactionId: r.interaction_id, requestId: r.request_id, correlation: r.correlation,
});

// One line from a gateway's stdout, as the sandbox tooling writes it:
// {"engelbart":"trace","v":1,"source":...,"kind":...,"ts":...,...}.
export type GatewayLine = { engelbart: "trace"; v: number; source: string; kind: string; ts: string; [key: string]: unknown };

export function parseGatewayLine(line: string): GatewayLine | null {
  if (!line.startsWith("{")) return null;
  try {
    const v = JSON.parse(line);
    return v && v.engelbart === "trace" && typeof v.kind === "string" && typeof v.source === "string" ? (v as GatewayLine) : null;
  } catch { return null; }
}
