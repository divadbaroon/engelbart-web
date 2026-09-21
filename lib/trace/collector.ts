// The trace collector: takes the JSON lines the sandbox gateways write on
// stdout, stamps them with the run they belong to, and writes them to the
// database in order. Identity comes from here, never from the sandbox:
// nothing the imported application does can claim another run's trace.
//
// Timeline rows stay small. A model call's prompt and answer go to their
// own row, announced on the timeline by a short event; the browser fetches
// the row when the person opens the call.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Recorder } from "@/lib/runtime/types";
import { parseGatewayLine, type Correlation, type GatewayLine, type TraceSource } from "@/lib/trace/types";

export type Collector = {
  // One stdout line from a gateway. True when it was one of ours.
  line: (line: string) => boolean;
  // A timeline event from the worker's own knowledge (the wrapper's
  // instrumentation report, say).
  note: (source: TraceSource, kind: string, data: Record<string, unknown>, ids?: EventIds) => void;
  // Settles when a gateway has announced itself, or never.
  listening: (gateway: string, timeoutMs: number) => Promise<{ port: number } | null>;
  flush: () => Promise<void>;
  stats: () => CollectorStats;
};

export type EventIds = { at?: string; interactionId?: string | null; requestId?: string | null; callId?: string | null; correlation?: Correlation | null };
export type CollectorStats = { events: number; calls: number; rejected: number; failed: number; browser: number; network: number };

// The keys every line carries or may carry as identity; the rest is data.
const ENVELOPE = new Set(["engelbart", "v", "source", "kind", "ts", "interactionId", "requestId", "callId", "correlation"]);
const INFLIGHT_MAX_AGE_MS = 5 * 60_000;

const log = (message: string, fields: Record<string, unknown> = {}) =>
  console.log(`[trace-collector] ${message}${Object.keys(fields).length ? " " + JSON.stringify(fields) : ""}`);

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === "string" ? v : null);
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

export function createCollector(supabase: SupabaseClient, runId: string, record?: Recorder): Collector {
  let seq: number | null = null;
  let queue: Promise<void> = Promise.resolve();
  const stats: CollectorStats = { events: 0, calls: 0, rejected: 0, failed: 0, browser: 0, network: 0 };
  // Application requests the preview gateway has seen start but not end,
  // and the ids each model call was given when it began.
  const inflight = new Map<string, { at: number; interactionId: string | null; category: string | null }>();
  // Which interaction each application request belonged to, kept after
  // the request has finished. A model call can name the request it was
  // made for, and this is what turns that name into a link: the id is
  // only accepted when the preview gateway reported the same request
  // itself, and the interaction is taken from that report rather than
  // from the claim. So the strongest thing a claim can do is point at a
  // request the collector already saw.
  const requests = new Map<string, string | null>();
  const REQUESTS_KEPT = 500;
  const callIds = new Map<string, EventIds>();
  const announced = new Map<string, { port: number }>();
  const waiting = new Map<string, ((v: { port: number } | null) => void)[]>();
  // A missing table (the migration not applied yet) would otherwise log
  // once per event; once per table is enough to say what is wrong.
  const complained = new Set<string>();

  const nextSeq = async () => {
    if (seq === null) {
      const { data } = await supabase.from("engelbart_trace_events").select("seq").eq("run_id", runId).order("seq", { ascending: false }).limit(1).maybeSingle();
      seq = typeof data?.seq === "number" ? data.seq + 1 : 0;
    }
    return seq++;
  };

  const failed = (table: string, what: string, message: string) => {
    stats.failed += 1;
    if (complained.has(table)) return;
    complained.add(table);
    log(`${what} could not be written to ${table}: ${message}`, { run: runId });
    record?.event("error", `trace: ${what} could not be written to ${table}: ${message}`, { kind: "TraceWriteError", table });
  };

  const insertEvent = (source: TraceSource, kind: string, at: string, data: Record<string, unknown>, ids: EventIds = {}) => {
    queue = queue.then(async () => {
      const row = {
        run_id: runId, seq: await nextSeq(), at, source, kind, data,
        interaction_id: ids.interactionId ?? null, request_id: ids.requestId ?? null, call_id: ids.callId ?? null, correlation: ids.correlation ?? null,
      };
      const { error } = await supabase.from("engelbart_trace_events").insert(row);
      if (error) failed("engelbart_trace_events", `${kind} event`, error.message);
      else stats.events += 1;
    });
  };

  const correlationOf = (v: unknown): Correlation | null => (v === "explicit" || v === "temporal" ? v : null);
  const idsOf = (ev: GatewayLine): EventIds => ({ interactionId: str(ev.interactionId), requestId: str(ev.requestId), callId: str(ev.callId), correlation: correlationOf(ev.correlation) });
  const dataOf = (ev: GatewayLine) => Object.fromEntries(Object.entries(ev).filter(([k]) => !ENVELOPE.has(k)));

  // A model call made while exactly one application request was being
  // handled most likely belongs to it. That is association by time, and it
  // is recorded as such; with several requests open, none is chosen and
  // the candidates are kept on the event instead.
  const temporalLink = (now: number): { ids: EventIds; candidates: string[] } => {
    for (const [id, r] of inflight) if (now - r.at > INFLIGHT_MAX_AGE_MS) inflight.delete(id);
    const open = [...inflight.entries()].filter(([, r]) => r.category !== "prefetch");
    if (open.length !== 1) return { ids: {}, candidates: open.map(([id]) => id) };
    const [requestId, r] = open[0];
    return { ids: { requestId, interactionId: r.interactionId, correlation: "temporal" }, candidates: [] };
  };

  // The call named the request it was made for, and the preview gateway
  // reported that request: the two ends agree, so this is a link and
  // not an association.
  const claimedLink = (ev: GatewayLine): { ids: EventIds; candidates: string[] } | null => {
    const requestId = str(ev.requestId);
    if (!requestId || !requests.has(requestId)) return null;
    return { ids: { requestId, interactionId: requests.get(requestId) ?? null, correlation: "explicit" }, candidates: [] };
  };

  const insertCall = (ev: GatewayLine) => {
    const request = obj(ev.request);
    const upstream = obj(ev.upstream) ?? { scheme: null, host: null, path: null, has_query: false };
    const raw = obj(ev.raw);
    const sizes = obj(ev.sizes) ?? {};
    const link = claimedLink(ev) ?? temporalLink(Date.parse(str(ev.started_at) ?? ev.ts) || Date.now());
    const ids: EventIds = { callId: String(ev.callId), ...link.ids };
    callIds.set(String(ev.callId), ids);
    const row = {
      run_id: runId, call_id: String(ev.callId), capture: ev.capture === "metadata" ? "metadata" : "full",
      provider: str(ev.provider), api: str(ev.api), method: str(ev.method) ?? "POST", upstream,
      model: str(request?.model), streamed: typeof request?.stream === "boolean" ? request.stream : null,
      phase: "request", started_at: str(ev.started_at) ?? ev.ts,
      request, request_parse: obj(ev.request_parse), request_headers: obj(ev.headers),
      raw_request: str(raw?.request), sizes: { ...sizes, ...(raw?.request_truncated ? { request_truncated: 1 } : {}) },
      interaction_id: link.ids.interactionId ?? null, request_id: link.ids.requestId ?? null, correlation: link.ids.correlation ?? null,
    };
    queue = queue.then(async () => {
      const { error } = await supabase.from("engelbart_model_calls").insert(row);
      if (error) failed("engelbart_model_calls", "model call", error.message);
      else stats.calls += 1;
    });
    insertEvent("model-gateway", "model.request", ev.ts, {
      callId: ev.callId, provider: row.provider, api: row.api, method: row.method, host: upstream.host, path: upstream.path,
      model: row.model, stream: row.streamed, messageCount: num(request?.message_count), promptChars: num(request?.prompt_chars),
      parsed: obj(ev.request_parse)?.ok === true, ...(link.candidates.length ? { candidates: link.candidates } : {}),
    }, ids);
    log(`model.request ${ev.callId} ${row.method} ${upstream.host ?? "?"}${upstream.path ?? ""}`, { run: runId, model: row.model, stream: row.streamed, messages: num(request?.message_count), ...(ids.requestId ? { request: ids.requestId, interaction: ids.interactionId, correlation: link.ids.correlation } : {}) });
  };

  const finishCall = (ev: GatewayLine) => {
    const response = obj(ev.response);
    const raw = obj(ev.raw);
    const sizes = obj(ev.sizes) ?? {};
    const error = obj(ev.error);
    const isError = ev.kind === "model.error";
    const patch = {
      phase: isError ? "error" : "response", status: num(ev.status), ended_at: str(ev.ended_at) ?? ev.ts,
      latency_ms: num(ev.latency_ms), ttfb_ms: num(ev.ttfb_ms), ttft_ms: num(ev.ttft_ms),
      streamed: typeof ev.streamed === "boolean" ? ev.streamed : null, aborted: ev.aborted === true,
      response, response_headers: obj(ev.headers),
      error: error ? { ...error, phase: str(ev.phase) } : null,
      usage: obj(response?.usage), usage_available: response?.usage_available === true,
      raw_response: str(raw?.response),
    };
    queue = queue.then(async () => {
      const { data, error: dbError } = await supabase.from("engelbart_model_calls").update(patch).eq("run_id", runId).eq("call_id", String(ev.callId)).select("id, sizes").maybeSingle();
      if (dbError) return failed("engelbart_model_calls", "model call result", dbError.message);
      if (!data) return log(`no request row for ${ev.callId}; its result is kept on the timeline only`, { run: runId });
      const merged = { ...(obj(data.sizes) ?? {}), ...sizes, ...(raw?.response_truncated ? { response_truncated: 1 } : {}) };
      await supabase.from("engelbart_model_calls").update({ sizes: merged }).eq("id", data.id);
    });
    const output = obj(response?.output);
    const ids = callIds.get(String(ev.callId)) ?? { callId: String(ev.callId) };
    callIds.delete(String(ev.callId));
    insertEvent("model-gateway", ev.kind, ev.ts, {
      callId: ev.callId, status: patch.status, latencyMs: patch.latency_ms, ttfbMs: patch.ttfb_ms, ttftMs: patch.ttft_ms, streamed: patch.streamed, aborted: patch.aborted,
      model: str(response?.model), finishReason: str(response?.finish_reason), chunks: num(response?.chunks), complete: response?.complete === true,
      outputChars: typeof output?.text === "string" ? output.text.length : num(output?.chars), usageAvailable: patch.usage_available,
      error: error ? { type: str(error.type), code: str(error.code), phase: str(ev.phase) } : null,
    }, ids);
    log(`${ev.kind} ${ev.callId}`, { run: runId, status: patch.status, latencyMs: patch.latency_ms, ttftMs: patch.ttft_ms, usage: patch.usage_available ? "yes" : "unavailable", ...(error ? { error: str(error.type) } : {}) });
  };

  return {
    line(text) {
      const ev = parseGatewayLine(text);
      if (!ev) return false;
      switch (ev.kind) {
        case "gateway.listening": {
          const port = num(ev.port) ?? 0;
          const gateway = str(ev.gateway) ?? ev.source;
          announced.set(gateway, { port });
          for (const resolve of waiting.get(gateway) ?? []) resolve({ port });
          waiting.delete(gateway);
          record?.event("status", `${ev.source} listening on port ${port} (capture: ${ev.capture ?? "full"})`, { phase: "trace", gateway, port, capture: ev.capture, upstreams: ev.upstreams });
          insertEvent(ev.source as TraceSource, "gateway.listening", ev.ts, { gateway, port, capture: ev.capture, upstreams: ev.upstreams });
          log(`${ev.source} listening`, { run: runId, port, capture: ev.capture });
          return true;
        }
        case "gateway.rejected":
          stats.rejected += 1;
          if (stats.rejected <= 5 || stats.rejected % 100 === 0) {
            record?.event("status", `${ev.source} refused a request: ${ev.reason}${ev.host ? ` (${ev.host})` : ""}`, { phase: "trace", gateway: ev.source, reason: ev.reason, host: ev.host, count: stats.rejected });
          }
          return true;
        case "model.request":
          if (typeof ev.callId !== "string") return true;
          insertCall(ev);
          return true;
        case "model.response":
        case "model.error":
          if (typeof ev.callId !== "string") return true;
          finishCall(ev);
          return true;
        case "network.request": {
          const requestId = str(ev.requestId);
          if (requestId) {
            inflight.set(requestId, { at: Date.parse(str(ev.started_at) ?? ev.ts) || Date.now(), interactionId: str(ev.interactionId), category: str(ev.category) });
            requests.set(requestId, str(ev.interactionId));
            if (requests.size > REQUESTS_KEPT) requests.delete(requests.keys().next().value as string);
          }
          stats.network += 1;
          insertEvent(ev.source as TraceSource, ev.kind, ev.ts, dataOf(ev), idsOf(ev));
          return true;
        }
        case "network.response":
        case "network.error": {
          const requestId = str(ev.requestId);
          if (requestId) inflight.delete(requestId);
          insertEvent(ev.source as TraceSource, ev.kind, ev.ts, dataOf(ev), idsOf(ev));
          return true;
        }
        default:
          if (ev.source === "browser") stats.browser += 1;
          insertEvent(ev.source as TraceSource, ev.kind, ev.ts, dataOf(ev), idsOf(ev));
          return true;
      }
    },
    note(source, kind, data, ids = {}) {
      insertEvent(source, kind, ids.at ?? new Date().toISOString(), data, ids);
    },
    listening(gateway, timeoutMs) {
      const known = announced.get(gateway);
      if (known) return Promise.resolve(known);
      return new Promise((resolve) => {
        const list = waiting.get(gateway) ?? [];
        list.push(resolve);
        waiting.set(gateway, list);
        setTimeout(() => resolve(announced.get(gateway) ?? null), timeoutMs);
      });
    },
    flush: () => queue,
    stats: () => ({ ...stats }),
  };
}
