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
// in the path is what keeps strangers from relaying through the sandbox.
//
// Carrying a request and reading one are separate decisions, and the
// gateway makes them in that order.
//
// It carries everything. Failing to recognise a destination is a fact
// about Engelbart, never a reason to refuse an application its network:
// an artifact that would have run without a trace must still run with
// one. The only refusals left are a wrong token, a destination the
// operator denied by name, and the gateway's own address — and none of
// those can reach an application that was working.
//
// It reads only what something declared. A host named as a model
// endpoint, or a request shape a provider module claims, is described,
// decoded and kept. Everything else is relayed with no body buffered, no
// stream decompressed and nothing stored but the fact that it happened.
// Being able to see a request is not a reason to save it.
//
// What the gateway never does: change the request (no added fields, no
// dropped headers beyond hop-by-hop ones), buffer a stream, or write a
// credential anywhere. Authorization, cookies and API keys cross the wire
// and stop there; events only carry headers from a short allowlist, and
// captured text passes through the redactor first.
//
// Environment: ENGELBART_MODEL_GATEWAY_PORT (43200), ENGELBART_MODEL_GATEWAY_BIND
// (127.0.0.1), ENGELBART_TRACE_CAPTURE (full | metadata), ENGELBART_MODEL_UPSTREAMS
// (comma-separated host[:port] read as model endpoints), ENGELBART_MODEL_DENY
// (comma-separated host[:port] refused outright), ENGELBART_REDACT_FILE (JSON of
// name → secret value, read once and deleted), ENGELBART_TRACE_MAX_CONTENT and
// ENGELBART_TRACE_MAX_RAW (byte budgets).
import http from "node:http";
import https from "node:https";
import { pathToFileURL } from "node:url";
import {
  ByteSink, REQUEST_HEADER_ALLOWLIST, RESPONSE_HEADER_ALLOWLIST, Redactor, clip, decompressor,
  makeEmitter, makeLogger, newId, pickHeaders, stripHopByHop, timingSafeEqual,
} from "./common.mjs";
import * as openaiChat from "./providers/openai-chat.mjs";
import * as openaiResponses from "./providers/openai-responses.mjs";

// Hosts read as model endpoints unless the run says otherwise. This is a
// recognition list, not a permission list: a host that is not on it is
// still relayed, just not read.
export const DEFAULT_MODEL_HOSTS = ["api.openai-proxy.com", "api.openai.com", "api.anthropic.com"];
export const DEFAULT_PORT = 43200;
const MAX_CONTENT = 1_048_576;
const MAX_RAW = 2_097_152;

const ROUTE = /^\/t\/([^/]+)\/(https?)\/([^/]+)(\/.*)?$/;
// The gateway's own two endpoints, which name no upstream because they
// are not going anywhere: what it is doing, and what the preload sees.
const CONTROL = /^\/t\/([^/]+)\/gateway\/([a-z]+)$/;
// What the application's own process says about which interaction a
// call belongs to. It reaches the gateway over loopback under the run
// token, and stops there: the provider must never see them.
const INTERACTION_ID = /^i_[a-z0-9]{6,32}_\d{1,6}$/;
const REQUEST_ID = /^r_[A-Za-z0-9_-]{6,32}$/;
const CORRELATION_HEADERS = ["x-engelbart-interaction", "x-engelbart-request"];
const claimOf = (headers) => ({
  interactionId: INTERACTION_ID.test(String(headers["x-engelbart-interaction"] ?? "")) ? String(headers["x-engelbart-interaction"]) : null,
  requestId: REQUEST_ID.test(String(headers["x-engelbart-request"] ?? "")) ? String(headers["x-engelbart-request"]) : null,
});
const withoutClaim = (headers) => {
  const out = { ...headers };
  for (const name of CORRELATION_HEADERS) delete out[name];
  return out;
};

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
    token, capture = "full", modelHosts = DEFAULT_MODEL_HOSTS, denyHosts = [],
    redactor = new Redactor(), emit, log = () => {}, maxContent = MAX_CONTENT, maxRaw = MAX_RAW,
    providers = [openaiChat, openaiResponses],
  } = options;
  if (!token || typeof token !== "string") throw new Error("model gateway needs a token");
  if (typeof emit !== "function") throw new Error("model gateway needs an emitter");
  const declared = new Set(modelHosts.map((h) => h.trim().toLowerCase()).filter(Boolean));
  const denied = new Set(denyHosts.map((h) => h.trim().toLowerCase()).filter(Boolean));
  const full = capture === "full";
  // The names this gateway answers to, filled in once it is listening.
  // Relaying to ourselves is an unbounded loop rather than a request, and
  // no application means it.
  const self = new Set();

  const reject = (res, status, reason, extra = {}) => {
    emit("gateway.rejected", { reason, status, ...extra });
    log(`rejected ${reason}${extra.host ? ` host=${extra.host}` : ""}`);
    res.writeHead(status, { "content-type": "text/plain" });
    res.end(status === 404 ? "not found\n" : `engelbart model gateway: ${reason}\n`);
  };

  const handle = (req, res) => {
    const control = CONTROL.exec(req.url ?? "");
    if (control) {
      if (!timingSafeEqual(control[1], token)) return reject(res, 404, "bad_token");
      if (control[2] === "health") {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ ok: true, capture, upstreams: [...declared], deny: [...denied] }) + "\n");
      }
      // Where the preload says whether it is watching. It has nowhere
      // else to speak: a line on the application's own output would be
      // Engelbart's words inside the artifact's log, and one of the
      // wrong shape there is read as the application having crashed. So
      // it says it here, over the loopback hop it already holds the
      // token for, and the gateway puts it on the trace.
      if (control[2] === "status") return status(req, res);
      return reject(res, 404, "bad_path");
    }
    const route = ROUTE.exec(req.url ?? "");
    if (!route) return reject(res, 404, "bad_path");
    const [, given, scheme, host, rest = "/"] = route;
    if (!timingSafeEqual(given, token)) return reject(res, 404, "bad_token");
    const key = host.toLowerCase();
    // The two refusals that are left, and neither can reach a working
    // application: a loop has no upstream to answer it, and a denied
    // destination is one the operator said this run may not reach. An
    // unrecognised destination is neither of those.
    if (self.has(key)) return reject(res, 508, "relay_loop", { host });
    if (denied.has(key)) return reject(res, 403, "destination_denied", { host });

    const method = req.method ?? "GET";
    // Recognition, and only recognition, makes a relayed request a model
    // call worth reading: the operator named the host, or a provider
    // claims the shape. Both are decided from the route alone, before a
    // byte of the body has been taken, so an unrecognised request never
    // has anywhere to be stored.
    const provider = providers.find((p) => p.match({ method, path: rest, host })) ?? null;
    if (provider || declared.has(key)) relay(req, res, { scheme, host, path: rest, method, provider });
    else passthrough(req, res, { scheme, host, path: rest, method });
  };

  // A small report from something inside the run, kept small. Nothing
  // here is trusted as identity: the run is already known, and the body
  // only says what state the reporter believes it is in.
  const status = (req, res) => {
    const sink = new ByteSink(4096);
    req.on("data", (chunk) => sink.push(chunk));
    req.on("end", () => {
      let report = null;
      try { report = JSON.parse(sink.text()); } catch {}
      if (!report || typeof report !== "object" || Array.isArray(report) || sink.truncated) {
        res.writeHead(400, { "content-type": "text/plain" });
        return res.end("engelbart model gateway: a status is one small JSON object\n");
      }
      const state = typeof report.state === "string" ? report.state.slice(0, 64) : "unknown";
      emit("capability.modelCapture", {
        state, detail: typeof report.detail === "string" ? redactor.text(report.detail).slice(0, 500) : null,
        transports: Array.isArray(report.transports) ? report.transports.slice(0, 8).map((t) => String(t).slice(0, 32)) : null,
        used: Array.isArray(report.used) ? report.used.slice(0, 8).map((t) => String(t).slice(0, 32)) : null,
        pid: Number.isInteger(report.pid) ? report.pid : null,
        runtime: typeof report.runtime === "string" ? report.runtime.slice(0, 64) : null,
      });
      log(`model capture ${state}${report.detail ? `: ${String(report.detail).slice(0, 200)}` : ""}`);
      res.writeHead(204);
      res.end();
    });
  };

  // One upstream request, over the scheme the route named. The gateway
  // never picks the scheme itself, so it can never quietly downgrade a
  // TLS call to plaintext.
  const dial = ({ scheme, host, path, method, headers }) => {
    const [hostname, portText] = host.startsWith("[") ? [host.replace(/\]:?.*$/, "]").slice(1, -1), host.replace(/^\[.*\]:?/, "")] : host.split(":");
    const port = Number(portText) || (scheme === "https" ? 443 : 80);
    const transport = scheme === "https" ? https : http;
    // SNI is a name, and Node warns when it is handed an address.
    const named = scheme === "https" && !/^[\d.]+$/.test(hostname) && !hostname.includes(":");
    return transport.request({ hostname, port, path, method, headers, servername: named ? hostname : undefined });
  };

  // A destination nothing recognised. The bytes are carried both ways and
  // none of them are read: no body is buffered, no stream is
  // decompressed, no request header is kept. What is recorded is that a
  // request happened, where it went and how it went — generic network
  // metadata, and not a model call, because we have no grounds to call it
  // one.
  const passthrough = (req, res, { scheme, host, path, method }) => {
    const startedAt = Date.now();
    const t0 = performance.now();
    const query = path.indexOf("?");
    const upstream = { scheme, host, path: query < 0 ? path : path.slice(0, query), has_query: query >= 0 };
    let requestBytes = 0; let responseBytes = 0; let done = false;

    const finish = (fields) => {
      if (done) return;
      done = true;
      emit("gateway.relayed", {
        method, upstream, capture: "none", reason: "unrecognized",
        started_at: iso(startedAt), ended_at: iso(Date.now()), latency_ms: round(performance.now() - t0),
        sizes: { request_bytes: requestBytes, response_bytes: responseBytes }, ...fields,
      });
      log(`relayed ${method} ${host}${upstream.path} ${fields.status ?? fields.error?.type ?? "-"} (unrecognised: carried, not read)`);
    };

    const up = dial({ scheme, host, path, method, headers: withoutClaim(stripHopByHop({ ...req.headers, host })) });
    req.on("data", (chunk) => { requestBytes += chunk.length; });
    req.pipe(up);

    res.on("close", () => {
      if (done) return;
      up.destroy();
      finish({ status: null, aborted: true, error: { type: "client_closed", message: "the application closed the connection before the response finished" } });
    });

    up.on("error", (err) => {
      if (!res.headersSent) {
        res.writeHead(502, { "content-type": "text/plain" });
        res.end(`engelbart model gateway: ${host} not reachable (${err.message})\n`);
      } else res.destroy();
      finish({ status: null, error: { type: err.code ?? "connect", message: err.message } });
    });

    up.on("response", (upRes) => {
      const ttfb = round(performance.now() - t0);
      const status = upRes.statusCode ?? 502;
      res.writeHead(status, stripHopByHop(upRes.headers));
      res.socket?.setNoDelay?.(true);
      upRes.on("data", (chunk) => { responseBytes += chunk.length; });
      upRes.on("error", (err) => { res.destroy(); finish({ status, ttfb_ms: ttfb, error: { type: err.code ?? "stream", message: err.message } }); });
      upRes.pipe(res);
      upRes.on("end", () => finish({ status, ttfb_ms: ttfb, content_type: String(upRes.headers["content-type"] ?? "") || null }));
    });
  };

  // A destination something recognised. Same relay, and additionally a
  // tee of both sides turned into a model call.
  const relay = (req, res, { scheme, host, path, method, provider }) => {
    const callId = newId("mc");
    const startedAt = Date.now();
    const t0 = performance.now();
    const query = path.indexOf("?");
    const upstream = { scheme, host, path: query < 0 ? path : path.slice(0, query), has_query: query >= 0 };

    const timing = { ttfb: null, ttft: null };
    let description = null; let requestParse = { ok: false, reason: "pending" };
    let finalized = false; let aborted = false; let streamed = false; let delivered = false;
    const requestSink = new ByteSink(maxRaw);

    const finish = (kind, fields) => {
      if (finalized) return;
      finalized = true;
      // Even a call that failed on its way out is a call that was made.
      describe(false);
      const latency = round(performance.now() - t0);
      emit(kind, { callId, latency_ms: latency, ttfb_ms: timing.ttfb, ttft_ms: timing.ttft, ended_at: iso(Date.now()), aborted, streamed, ...fields });
      log(`call ${callId} ${kind} status=${fields.status ?? "-"} latency=${latency}ms${fields.response ? ` chunks=${fields.response.chunks ?? "-"} usage=${fields.response.usage_available ? "yes" : "unavailable"}` : ""}${fields.error ? ` error=${fields.error.message ?? fields.error.type ?? "?"}` : ""}`);
    };

    const claim = claimOf(req.headers);
    const up = dial({ scheme, host, path, method, headers: withoutClaim(stripHopByHop({ ...req.headers, host })) });

    // What was asked, said once. Normally when the request has all been
    // forwarded — but an upstream that cannot be reached can fail before
    // then, and a call whose result arrives before the call itself has
    // no row to be attached to. So whatever ends first says this.
    let described = false;
    const describe = (whole) => {
      if (described) return;
      described = true;
      if (!whole) requestParse = { ok: false, reason: "incomplete" };
      else if (requestSink.truncated) requestParse = { ok: false, reason: "too_large" };
      else if (!provider) requestParse = { ok: false, reason: "no_provider" };
      else if (requestSink.total === 0) requestParse = { ok: false, reason: "empty" };
      else {
        try {
          description = fitContent(redactor.json(provider.describeRequest(JSON.parse(requestSink.text()), { capture })), maxContent);
          requestParse = { ok: true, reason: null };
        } catch (err) { requestParse = { ok: false, reason: `not_json: ${err.message}` }; }
      }
      // Only a recognised destination reaches this far, which is what
      // makes keeping the body defensible: either the operator named this
      // host a model endpoint or a provider claims this request shape.
      // Nothing is stored because a proxy happened to be able to see it.
      const raw = full && requestSink.total > 0 ? { request: redactor.text(requestSink.text()), request_truncated: requestSink.truncated } : undefined;
      emit("model.request", {
        callId, capture, provider: provider?.provider ?? null, api: provider?.id ?? null, method, upstream,
        ...(claim.interactionId || claim.requestId ? { ...claim, correlation: "explicit" } : {}),
        started_at: iso(startedAt), request: description, request_parse: requestParse,
        headers: pickHeaders(req.headers, REQUEST_HEADER_ALLOWLIST),
        sizes: { request_bytes: requestSink.total }, raw,
      });
      log(`call ${callId} ${method} ${host}${upstream.path}${description ? ` model=${description.model} stream=${description.stream} messages=${description.message_count}` : ` (${requestParse.reason})`}`);
    };
    req.on("data", (chunk) => requestSink.push(chunk));
    req.on("end", () => describe(true));
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

  // A websocket handshake or a CONNECT cannot be carried by an HTTP
  // proxy that tees, and pretending otherwise would hand the application
  // a broken connection: the hop-by-hop strip removes the very headers
  // that make it a handshake. So it is said out loud and closed, and
  // nothing redirects one here in the first place.
  for (const kind of ["upgrade", "connect"]) {
    server.on(kind, (req, socket) => {
      emit("gateway.unsupported", { form: kind, method: req.method ?? null, protocol: String(req.headers?.upgrade ?? "") || null });
      log(`${kind} is not a form this gateway can carry; the connection was closed`);
      if (!socket.destroyed) socket.destroy();
    });
  }

  return {
    server,
    capture,
    upstreams: [...declared],
    deny: [...denied],
    listen: (port = DEFAULT_PORT, bind = "127.0.0.1") => new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, bind, () => {
        server.off("error", reject);
        const address = server.address();
        for (const name of [bind, "127.0.0.1", "localhost", "[::1]", "::1"]) self.add(`${name}:${address.port}`.toLowerCase());
        resolve(address);
      });
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
  const modelHosts = [...new Set([...(env.ENGELBART_MODEL_UPSTREAMS ?? "").split(","), ...DEFAULT_MODEL_HOSTS].map((h) => h.trim()).filter(Boolean))];
  const denyHosts = (env.ENGELBART_MODEL_DENY ?? "").split(",").map((h) => h.trim()).filter(Boolean);
  const gateway = createGateway({
    token, capture, modelHosts, denyHosts, emit, log,
    redactor: Redactor.fromFile(env.ENGELBART_REDACT_FILE, log),
    maxContent: Number(env.ENGELBART_TRACE_MAX_CONTENT) || MAX_CONTENT,
    maxRaw: Number(env.ENGELBART_TRACE_MAX_RAW) || MAX_RAW,
  });
  gateway.listen(port, bind).then((address) => {
    emit("gateway.listening", { gateway: "model", port: address.port, bind, capture, upstreams: gateway.upstreams, deny: gateway.deny });
    log(`listening on ${bind}:${address.port} capture=${capture} read=${gateway.upstreams.join(",")} denied=${gateway.deny.join(",") || "none"} (everything else is relayed unread)`);
  }).catch((err) => { log(`cannot listen on ${bind}:${port}: ${err.message}`); process.exit(1); });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { log(`stopping (${signal})`); gateway.close().then(() => process.exit(0)); });
}
