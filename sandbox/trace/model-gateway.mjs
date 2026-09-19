// The model gateway: a transparent HTTP proxy inside the sandbox that the
// application's model client is pointed at instead of its provider. Each
// request is forwarded to the provider byte for byte, the response is
// streamed straight back, and a tee of both sides is turned into trace
// events on stdout for the worker to collect.
//
//   ENGELBART_TRACE_TOKEN=<secret> node model-gateway.mjs
//
// The application reaches the provider through a path that names it:
//
//   http://127.0.0.1:43200/t/<token>/https/api.openai-proxy.com/v1/chat/completions
//
// Every sandbox port is reachable from the internet, so the per-run token
// in the path is what keeps strangers from relaying through the sandbox
// with the application's credentials. The upstream host must also be on
// the allowlist: by default the hosts the application already used.
//
// What the gateway never does: change the request (no added fields, no
// dropped headers beyond hop-by-hop ones), buffer a stream, or write a
// credential anywhere. Authorization, cookies and API keys cross the wire
// and stop there; events only carry headers from a short allowlist, and
// captured text passes through the redactor first.
//
// Environment: ENGELBART_MODEL_GATEWAY_PORT (43200), ENGELBART_MODEL_GATEWAY_BIND
// (127.0.0.1), ENGELBART_TRACE_CAPTURE (full | metadata), ENGELBART_MODEL_UPSTREAMS
// (comma-separated host[:port] allowlist), ENGELBART_REDACT_FILE (JSON of
// name → secret value, read once and deleted), ENGELBART_TRACE_MAX_CONTENT and
// ENGELBART_TRACE_MAX_RAW (byte budgets), ENGELBART_ALLOW_HTTP_UPSTREAM (tests).
import http from "node:http";
import https from "node:https";
import { pathToFileURL } from "node:url";
import {
  ByteSink, REQUEST_HEADER_ALLOWLIST, RESPONSE_HEADER_ALLOWLIST, Redactor, clip, decompressor,
  makeEmitter, makeLogger, newId, pickHeaders, stripHopByHop, timingSafeEqual,
} from "./common.mjs";
import * as openaiChat from "./providers/openai-chat.mjs";

export const DEFAULT_UPSTREAMS = ["api.openai-proxy.com", "api.openai.com", "api.anthropic.com"];
export const DEFAULT_PORT = 43200;
const MAX_CONTENT = 1_048_576;
const MAX_RAW = 2_097_152;

const ROUTE = /^\/t\/([^/]+)\/(https?)\/([^/]+)(\/.*)?$/;
const iso = (ms) => new Date(ms).toISOString();
const round = (ms) => Math.round(ms * 10) / 10;

// A reader for responses no provider claims, or for error bodies: keeps
// the decoded text and nothing else.
const textReader = (max) => {
  const sink = new ByteSink(max);
  return { feed: (c) => sink.push(typeof c === "string" ? Buffer.from(c) : c), finish: () => ({ text: sink.text(), truncated: sink.truncated }) };
};

// The message texts of a full request description clipped to a byte
// budget, so one enormous prompt cannot swamp a trace row. The raw body
// keeps its own, larger budget.
function fitContent(description, budget) {
  if (!description || Buffer.byteLength(JSON.stringify(description)) <= budget) return description;
  const slots = 1 + (description.messages?.length ?? 0);
  const cap = Math.max(2048, Math.floor(budget / slots));
  const clipText = (s) => (typeof s === "string" && s.length > cap ? `${s.slice(0, cap)}…[truncated ${s.length - cap} chars]` : s);
  const out = { ...description, truncated: true, system: clipText(description.system) };
  out.messages = (description.messages ?? []).map((m) => {
    if (!m || typeof m !== "object") return m;
    if (typeof m.content === "string") return { ...m, content: clipText(m.content) };
    if (Array.isArray(m.content)) return { ...m, content: m.content.map((p) => (p && typeof p.text === "string" ? { ...p, text: clipText(p.text) } : p)) };
    return m;
  });
  return out;
}

export function createGateway(options) {
  const {
    token, capture = "full", upstreamHosts = DEFAULT_UPSTREAMS, allowHttp = false,
    redactor = new Redactor(), emit, log = () => {}, maxContent = MAX_CONTENT, maxRaw = MAX_RAW,
    providers = [openaiChat],
  } = options;
  if (!token || typeof token !== "string") throw new Error("model gateway needs a token");
  if (typeof emit !== "function") throw new Error("model gateway needs an emitter");
  const allowed = new Set(upstreamHosts.map((h) => h.trim().toLowerCase()).filter(Boolean));
  const full = capture === "full";

  const reject = (res, status, reason, extra = {}) => {
    emit("gateway.rejected", { reason, status, ...extra });
    log(`rejected ${reason}${extra.host ? ` host=${extra.host}` : ""}`);
    res.writeHead(status, { "content-type": "text/plain" });
    res.end(status === 404 ? "not found\n" : `engelbart model gateway: ${reason}\n`);
  };

  const handle = (req, res) => {
    const route = ROUTE.exec(req.url ?? "");
    if (!route) return reject(res, 404, "bad_path");
    const [, given, scheme, host, rest = "/"] = route;
    if (!timingSafeEqual(given, token)) return reject(res, 404, "bad_token");
    if (host === "gateway" && rest === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ ok: true, capture, upstreams: [...allowed] }) + "\n");
    }
    if (scheme === "http" && !allowHttp) return reject(res, 403, "http_upstream_not_allowed", { host });
    if (!allowed.has(host.toLowerCase())) return reject(res, 403, "upstream_not_allowed", { host });
    relay(req, res, { scheme, host, path: rest });
  };

  const relay = (req, res, { scheme, host, path }) => {
    const callId = newId("mc");
    const method = req.method ?? "GET";
    const startedAt = Date.now();
    const t0 = performance.now();
    const query = path.indexOf("?");
    const upstream = { scheme, host, path: query < 0 ? path : path.slice(0, query), has_query: query >= 0 };
    const provider = providers.find((p) => p.match({ method, path, host })) ?? null;
    const [hostname, portText] = host.startsWith("[") ? [host.replace(/\]:?.*$/, "]").slice(1, -1), host.replace(/^\[.*\]:?/, "")] : host.split(":");
    const port = Number(portText) || (scheme === "https" ? 443 : 80);
    const transport = scheme === "https" ? https : http;

    const timing = { ttfb: null, ttft: null };
    let description = null; let requestParse = { ok: false, reason: "pending" };
    let finalized = false; let aborted = false; let streamed = false; let delivered = false;
    const requestSink = new ByteSink(maxRaw);

    const finish = (kind, fields) => {
      if (finalized) return;
      finalized = true;
      const latency = round(performance.now() - t0);
      emit(kind, { callId, latency_ms: latency, ttfb_ms: timing.ttfb, ttft_ms: timing.ttft, ended_at: iso(Date.now()), aborted, streamed, ...fields });
      log(`call ${callId} ${kind} status=${fields.status ?? "-"} latency=${latency}ms${fields.response ? ` chunks=${fields.response.chunks ?? "-"} usage=${fields.response.usage_available ? "yes" : "unavailable"}` : ""}${fields.error ? ` error=${fields.error.message ?? fields.error.type ?? "?"}` : ""}`);
    };

    const headers = stripHopByHop({ ...req.headers, host });
    const up = transport.request({ hostname, port, path, method, headers, servername: scheme === "https" ? hostname : undefined });

    req.on("data", (chunk) => requestSink.push(chunk));
    req.on("end", () => {
      // The whole request has been forwarded; describe what was asked.
      if (requestSink.truncated) requestParse = { ok: false, reason: "too_large" };
      else if (!provider) requestParse = { ok: false, reason: "no_provider" };
      else if (requestSink.total === 0) requestParse = { ok: false, reason: "empty" };
      else {
        try {
          description = fitContent(redactor.json(provider.describeRequest(JSON.parse(requestSink.text()), { capture })), maxContent);
          requestParse = { ok: true, reason: null };
        } catch (err) { requestParse = { ok: false, reason: `not_json: ${err.message}` }; }
      }
      const raw = full && requestSink.total > 0 ? { request: redactor.text(requestSink.text()), request_truncated: requestSink.truncated } : undefined;
      emit("model.request", {
        callId, capture, provider: provider?.provider ?? null, api: provider?.id ?? null, method, upstream,
        started_at: iso(startedAt), request: description, request_parse: requestParse,
        headers: pickHeaders(req.headers, REQUEST_HEADER_ALLOWLIST),
        sizes: { request_bytes: requestSink.total }, raw,
      });
      log(`call ${callId} ${method} ${host}${upstream.path}${description ? ` model=${description.model} stream=${description.stream} messages=${description.message_count}` : ` (${requestParse.reason})`}`);
    });
    req.pipe(up);

    // A close before the response was delivered is the application giving
    // up. A close after delivery is routine, even if the tee is still
    // flushing a decoder and the event has not been written yet.
    res.on("close", () => {
      if (delivered || finalized) return;
      aborted = true;
      up.destroy();
      finish("model.error", { status: null, phase: "client", error: { type: "client_closed", message: "the application closed the connection before the response finished" } });
    });

    up.on("error", (err) => {
      if (!res.headersSent) {
        res.writeHead(502, { "content-type": "text/plain" });
        res.end(`engelbart model gateway: ${host} not reachable (${err.message})\n`);
      } else res.destroy();
      finish("model.error", { status: null, phase: "connect", error: { type: err.code ?? "connect", message: err.message } });
    });

    up.on("response", (upRes) => {
      timing.ttfb = round(performance.now() - t0);
      const status = upRes.statusCode ?? 502;
      const ok = status >= 200 && status < 300;
      const contentType = String(upRes.headers["content-type"] ?? "");
      streamed = /text\/event-stream/i.test(contentType) || (!contentType && description?.stream === true);

      res.writeHead(status, stripHopByHop(upRes.headers));
      res.socket?.setNoDelay?.(true);

      const reader = ok && provider && description
        ? provider.createReader({ stream: streamed, onFirstOutput: () => { timing.ttft ??= round(performance.now() - t0); } })
        : textReader(maxRaw);
      const decoded = new ByteSink(maxRaw);
      const tee = (chunk) => { decoded.push(chunk); reader.feed(chunk); };
      const decoder = decompressor(upRes.headers["content-encoding"]);
      const parseErrors = [];
      if (decoder) { decoder.on("data", tee); decoder.on("error", (err) => parseErrors.push({ type: "decode", message: err.message })); }
      let wire = 0;

      upRes.on("data", (chunk) => {
        wire += chunk.length;
        res.write(chunk);
        if (decoder) decoder.write(chunk); else tee(chunk);
      });
      upRes.on("error", (err) => { res.destroy(); finish("model.error", { status, phase: "stream", error: { type: err.code ?? "stream", message: err.message } }); });
      upRes.on("end", () => {
        delivered = true;
        res.end();
        const conclude = () => {
          const result = reader.finish();
          const base = {
            status, headers: pickHeaders(upRes.headers, RESPONSE_HEADER_ALLOWLIST),
            sizes: { response_bytes: wire, decoded_bytes: decoded.total },
            raw: full ? { response: redactor.text(decoded.text()), response_truncated: decoded.truncated, encoding: upRes.headers["content-encoding"] ?? null } : undefined,
          };
          if (!ok) {
            let error = { type: `http_${status}`, message: `upstream answered ${status}` };
            try {
              const body = JSON.parse(result?.text ?? "");
              const e = body?.error && typeof body.error === "object" ? body.error : body;
              error = { type: e?.type ?? `http_${status}`, message: e?.message ?? error.message, code: e?.code ?? null, param: e?.param ?? null };
            } catch {}
            return finish("model.error", { ...base, phase: "upstream", error: redactor.json(error) });
          }
          if (!provider || !description) return finish("model.response", { ...base, response: null });
          const output = result.output;
          const outText = output ? clip(output.text ?? "", maxContent) : null;
          const response = {
            id: result.id, model: result.model, system_fingerprint: result.system_fingerprint,
            finish_reason: output?.finish_reason ?? null, choices: result.choices,
            output: !output ? null : full ? {
              role: output.role, text: redactor.text(outText.text), text_truncated: outText.truncated, refusal: redactor.text(output.refusal),
              tool_calls: output.tool_calls.map((t) => ({ ...t, arguments: redactor.text(clip(t.arguments, maxContent).text) })),
            } : { chars: (output.text ?? "").length, refusal: Boolean(output.refusal), tool_calls: output.tool_calls.map((t) => t.name) },
            usage: result.usage ?? null, usage_available: Boolean(result.usage),
            chunks: result.chunks, complete: result.complete,
            parse_errors: [...parseErrors, ...(result.errors ?? [])],
          };
          finish("model.response", { ...base, response });
        };
        if (decoder) { decoder.once("end", conclude); decoder.once("error", conclude); decoder.end(); } else conclude();
      });
    });
  };

  const server = http.createServer(handle);
  server.on("clientError", (err, socket) => { if (!socket.destroyed) socket.end("HTTP/1.1 400 Bad Request\r\n\r\n"); });

  return {
    server,
    capture,
    upstreams: [...allowed],
    listen: (port = DEFAULT_PORT, bind = "127.0.0.1") => new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, bind, () => { server.off("error", reject); resolve(server.address()); });
    }),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const env = process.env;
  const log = makeLogger("model-gateway");
  const emit = makeEmitter("model-gateway");
  const token = env.ENGELBART_TRACE_TOKEN;
  if (!token) { log("ENGELBART_TRACE_TOKEN is required"); process.exit(2); }
  const port = Number(env.ENGELBART_MODEL_GATEWAY_PORT) || DEFAULT_PORT;
  const bind = env.ENGELBART_MODEL_GATEWAY_BIND || "127.0.0.1";
  const capture = env.ENGELBART_TRACE_CAPTURE === "metadata" ? "metadata" : "full";
  const upstreamHosts = [...new Set([...(env.ENGELBART_MODEL_UPSTREAMS ?? "").split(","), ...DEFAULT_UPSTREAMS].map((h) => h.trim()).filter(Boolean))];
  const gateway = createGateway({
    token, capture, upstreamHosts, emit, log,
    allowHttp: env.ENGELBART_ALLOW_HTTP_UPSTREAM === "1",
    redactor: Redactor.fromFile(env.ENGELBART_REDACT_FILE, log),
    maxContent: Number(env.ENGELBART_TRACE_MAX_CONTENT) || MAX_CONTENT,
    maxRaw: Number(env.ENGELBART_TRACE_MAX_RAW) || MAX_RAW,
  });
  gateway.listen(port, bind).then((address) => {
    emit("gateway.listening", { gateway: "model", port: address.port, bind, capture, upstreams: gateway.upstreams });
    log(`listening on ${bind}:${address.port} capture=${capture} upstreams=${gateway.upstreams.join(",")}`);
  }).catch((err) => { log(`cannot listen on ${bind}:${port}: ${err.message}`); process.exit(1); });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { log(`stopping (${signal})`); gateway.close().then(() => process.exit(0)); });
}
