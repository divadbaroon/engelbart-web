// The preview gateway: the sandbox's public face for a traced run. It does
// everything proxy.mjs does (one public port per service, Host/Origin/
// Referer rewritten to the loopback address the service expects, WebSocket
// upgrades passed through) and three things more:
//
//   1. Every HTML document it serves gets the browser bridge injected right
//      after <head>, with a frame id minted here, so each document (top
//      page or embedded frame alike) has an identity before it runs.
//   2. Two endpoints of its own: /__engelbart/bridge.js serves the bridge,
//      /__engelbart/events receives its batches and turns them into trace
//      lines. Run identity is never taken from the browser.
//   3. Requests that are not assets become network.request/response
//      events, joined to an interaction when the bridge tagged them.
//
// The application's bytes are otherwise untouched: bodies are never read,
// non-HTML responses pass through byte for byte, and a response guarded by
// a Content-Security-Policy that would refuse the bridge is served as is
// and reported, not weakened.
//
//   node preview-gateway.mjs <listen-port>:<target-port>[:<target-address>] ...
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Redactor, decompressor, makeEmitter, makeLogger, newId, pickHeaders, stripHopByHop } from "./common.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const BRIDGE_PATH = "/__engelbart/bridge.js";
export const EVENTS_PATH = "/__engelbart/events";
export const HEALTH_PATH = "/__engelbart/health";

const MAX_BATCH_BYTES = 64 * 1024;
const MAX_BATCH_EVENTS = 100;
const MAX_EVENT_BYTES = 4 * 1024;
const MAX_HEAD_SCAN = 64 * 1024;      // how much of a document to hold back while looking for <head>
const EVENTS_PER_SECOND = 200;
const CLOCK_SKEW_MAX_MS = 5 * 60_000; // a browser clock further off than this is not trusted for timestamps

const FRAME_ID = /^f_[a-z0-9]{6,32}$/;
const INTERACTION_ID = /^i_[a-z0-9]{6,32}_\d{1,6}$/;
const EVENT_KIND = /^(ui|frame)\.[a-z]+$/;
const ASSET_EXT = /\.(js|mjs|cjs|css|map|png|jpe?g|gif|svg|webp|avif|ico|bmp|woff2?|ttf|otf|eot|mp4|webm|mp3|wav|ogg|wasm|pdf)$/i;
const ASSET_PREFIX = /^\/(_next\/|__nextjs|__engelbart\/|node_modules\/|@vite\/|@fs\/|@id\/|@react-refresh|static\/|assets\/|favicon|sockjs-node|ws$)/;
const ASSET_DEST = new Set(["script", "style", "image", "font", "media", "manifest", "audio", "video", "track", "worker", "sharedworker", "serviceworker"]);
const DOCUMENT_DEST = new Set(["document", "iframe", "frame", "embed", "object"]);
const REQUEST_HEADERS = new Set(["content-type", "content-length", "accept", "x-requested-with", "sec-fetch-dest", "sec-fetch-mode", "next-router-prefetch", "next-router-state-tree", "rsc"]);
const RESPONSE_HEADERS = new Set(["content-type", "content-length", "content-encoding", "cache-control", "location", "x-request-id", "x-powered-by", "vary"]);
const SECRET_PARAM = /token|key|secret|auth|password|passwd|session|sig|credential|cookie|bearer/i;
// Keys the gateway sets on a browser event's line; a page cannot supply them.
const RESERVED = new Set(["engelbart", "v", "source", "kind", "ts", "frameId", "interactionId", "requestId", "callId", "correlation", "browser_at", "clock_offset_ms"]);

export const frameId = () => "f_" + crypto.randomBytes(8).toString("hex").slice(0, 10);
const escapeAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// The query's names, and short values that don't look secret (the same
// rule the bridge applies): "?id=solution" is worth keeping, "?token=" is not.
export function safeQuery(search) {
  if (!search) return undefined;
  const out = {};
  let n = 0;
  try {
    new URLSearchParams(search).forEach((value, name) => {
      if (n++ >= 8) return;
      out[name.slice(0, 32)] = SECRET_PARAM.test(name) || value.length > 48 ? "[omitted]" : value;
    });
  } catch { return undefined; }
  return n ? out : undefined;
}

// What a Content-Security-Policy says about a same-origin script: allowed,
// allowed with this nonce, or blocked. Only script-src (or default-src in
// its absence) matters to the bridge.
export function scriptPolicy(csp) {
  if (!csp) return { allowed: true };
  const directives = new Map();
  for (const part of String(csp).split(";")) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) directives.set(name.toLowerCase(), values);
  }
  const values = directives.get("script-src") ?? directives.get("script-src-elem") ?? directives.get("default-src");
  if (!values) return { allowed: true };
  const lower = values.map((v) => v.toLowerCase());
  if (lower.includes("'self'") || lower.includes("*")) return { allowed: true };
  const nonce = values.find((v) => /^'nonce-[^']+'$/i.test(v));
  if (nonce) return { allowed: true, nonce: nonce.slice(7, -1) };
  return { allowed: false, directive: values.join(" ") };
}

// Where to put the bridge in a document: after <head>, else after <html>,
// else after the doctype, else at the very start. Returns the byte offset
// in `text` (latin1-decoded, so offsets are byte offsets), or -1 when a
// <head> could still come.
function tagEnd(text, index) {
  const close = text.indexOf(">", index);
  return close < 0 ? -1 : close + 1;
}
function findTag(lower, name, from = 0) {
  let i = from;
  for (;;) {
    i = lower.indexOf("<" + name, i);
    if (i < 0) return -1;
    const next = lower[i + name.length + 1];
    if (next === undefined) return -2;                  // could still be this tag; wait
    if (next === ">" || /\s/.test(next)) return i;
    i += 1;
  }
}
export function injectionPoint(text, final) {
  const lower = text.toLowerCase();
  const head = findTag(lower, "head");
  if (head >= 0) { const end = tagEnd(lower, head); if (end >= 0) return end; if (!final) return -1; }
  if (head === -2 && !final) return -1;
  // A <body> or a lot of content without a <head>: there will not be one.
  const body = findTag(lower, "body");
  if (!final && body < 0 && lower.length < MAX_HEAD_SCAN) return -1;
  const html = findTag(lower, "html");
  if (html >= 0) { const end = tagEnd(lower, html); if (end >= 0) return end; }
  const doctype = lower.indexOf("<!doctype");
  if (doctype >= 0) { const end = tagEnd(lower, doctype); if (end >= 0) return end; }
  return 0;
}

// A pass-through that holds back the beginning of an HTML document until
// its injection point is known, then writes the bridge tag there and lets
// the rest stream. Nothing after the injection is touched.
export function injector(tag, onDone) {
  let pending = [];
  let pendingBytes = 0;
  let done = false;
  const flush = (final) => {
    const text = Buffer.concat(pending).toString("latin1");
    const at = injectionPoint(text, final);
    if (at < 0 && !final && pendingBytes < MAX_HEAD_SCAN) return null;
    const buffer = Buffer.concat(pending);
    const point = at < 0 ? injectionPoint(text, true) : at;
    done = true; pending = []; pendingBytes = 0;
    onDone?.(point);
    return Buffer.concat([buffer.subarray(0, point), Buffer.from(tag, "utf8"), buffer.subarray(point)]);
  };
  return {
    write(chunk) {
      if (done) return chunk;
      pending.push(chunk); pendingBytes += chunk.length;
      return flush(false);
    },
    end() {
      if (done || !pendingBytes) { done = true; return null; }
      return flush(true);
    },
  };
}

// Requests the timeline should know about: navigations, API calls, server
// actions. Scripts, styles, images, fonts and the dev server's own traffic
// are not interactions and are not recorded.
export function classifyRequest(req, pathname) {
  const dest = req.headers["sec-fetch-dest"];
  if (DOCUMENT_DEST.has(dest)) return "document";
  if (ASSET_DEST.has(dest) || ASSET_PREFIX.test(pathname) || ASSET_EXT.test(pathname)) return null;
  if (req.headers["next-action"]) return "action";
  if (req.headers["next-router-prefetch"]) return "prefetch";
  if (!dest && req.method === "GET" && /text\/html/.test(req.headers.accept ?? "") && !/application\/json/.test(req.headers.accept ?? "")) return "document";
  return "api";
}

// One batch from the bridge, checked and turned into trace lines.
export function acceptBatch(batch, { receivedAt, redactor, emit, limiter }) {
  // `emit` here is the browser-source emitter: these are the page's events.
  if (!batch || batch.engelbart !== "bridge" || !Array.isArray(batch.events)) return { ok: false, reason: "not a bridge batch" };
  if (batch.events.length > MAX_BATCH_EVENTS) return { ok: false, reason: `more than ${MAX_BATCH_EVENTS} events` };
  const sentAt = typeof batch.sentAt === "number" ? batch.sentAt : NaN;
  const offset = Number.isFinite(sentAt) && Math.abs(receivedAt - sentAt) <= CLOCK_SKEW_MAX_MS ? receivedAt - sentAt : null;
  let accepted = 0, rejected = 0, dropped = 0;
  for (const ev of batch.events) {
    if (!ev || typeof ev !== "object" || !EVENT_KIND.test(ev.kind ?? "") || !FRAME_ID.test(ev.frameId ?? "") || typeof ev.at !== "number") { rejected++; continue; }
    if (ev.interactionId !== undefined && !INTERACTION_ID.test(ev.interactionId)) { rejected++; continue; }
    if (limiter && !limiter.take()) { dropped++; continue; }
    let data = ev.data && typeof ev.data === "object" && !Array.isArray(ev.data) ? Object.fromEntries(Object.entries(ev.data).filter(([k]) => !RESERVED.has(k))) : {};
    if (JSON.stringify(data).length > MAX_EVENT_BYTES) data = { truncated: true, keys: Object.keys(data).slice(0, 20) };
    if (redactor) data = redactor.json(data);
    const at = offset === null ? receivedAt : ev.at + offset;
    emit(ev.kind, {
      ts: new Date(at).toISOString(), frameId: ev.frameId,
      ...(ev.interactionId ? { interactionId: ev.interactionId } : {}),
      ...(ev.correlation === "temporal" || ev.correlation === "explicit" ? { correlation: ev.correlation } : {}),
      browser_at: ev.at, clock_offset_ms: offset, ...data,
    });
    accepted++;
  }
  if (typeof batch.dropped === "number" && batch.dropped > 0) dropped += batch.dropped;
  return { ok: true, accepted, rejected, dropped, offset };
}

export function rateLimiter(perSecond) {
  let tokens = perSecond, last = Date.now();
  return {
    take() {
      const now = Date.now();
      tokens = Math.min(perSecond, tokens + ((now - last) / 1000) * perSecond); last = now;
      if (tokens < 1) return false;
      tokens -= 1; return true;
    },
  };
}

export function createPreviewGateway({ listenPort, targetPort, targetAddress = "127.0.0.1", bridge, bridgeConfig = null, redactor = new Redactor(), emit, emitBrowser = emit, log, limiter = rateLimiter(EVENTS_PER_SECOND) }) {
  const targetHost = `${targetAddress.includes(":") ? `[${targetAddress}]` : targetAddress}:${targetPort}`;
  const targetOrigin = `http://${targetHost}`;
  const bridgeEtag = `"${crypto.createHash("sha1").update(bridge).digest("hex").slice(0, 16)}"`;
  const configAttr = bridgeConfig ? ` data-config="${escapeAttr(JSON.stringify(bridgeConfig))}"` : "";
  const stats = { requests: 0, documents: 0, injected: 0, blocked: 0, batches: 0, events: 0, rejected: 0, dropped: 0 };
  let complained = 0;

  const forwarded = (incoming) => {
    const headers = { ...stripHopByHop(incoming), host: targetHost };
    if (headers.origin) headers.origin = targetOrigin;
    if (headers.referer) {
      try { const u = new URL(headers.referer); headers.referer = `${targetOrigin}${u.pathname}${u.search}`; } catch { delete headers.referer; }
    }
    return headers;
  };
  const refererPath = (req) => {
    try { const u = new URL(req.headers.referer); return u.pathname + (u.search ? "?…" : ""); } catch { return undefined; }
  };

  function serveBridge(req, res) {
    if (req.headers["if-none-match"] === bridgeEtag) { res.writeHead(304); return res.end(); }
    res.writeHead(200, { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-cache", etag: bridgeEtag, "content-length": Buffer.byteLength(bridge) });
    res.end(req.method === "HEAD" ? undefined : bridge);
  }

  function serveEvents(req, res) {
    const cors = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", "access-control-max-age": "600" };
    if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
    if (req.method !== "POST") { res.writeHead(405, { ...cors, allow: "POST, OPTIONS" }); return res.end(); }
    const chunks = []; let bytes = 0; let over = false;
    req.on("data", (c) => { bytes += c.length; if (bytes > MAX_BATCH_BYTES) { over = true; req.destroy(); return; } chunks.push(c); });
    req.on("error", () => { if (!res.headersSent) { res.writeHead(over ? 413 : 400, cors); res.end(); } });
    req.on("end", () => {
      if (over) { res.writeHead(413, cors); return res.end(); }
      let batch;
      try { batch = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { res.writeHead(400, cors); return res.end(); }
      const result = acceptBatch(batch, { receivedAt: Date.now(), redactor, emit: emitBrowser, limiter });
      if (!result.ok) { if (complained++ < 5) log(`rejected a batch: ${result.reason}`); res.writeHead(400, cors); return res.end(); }
      stats.batches++; stats.events += result.accepted; stats.rejected += result.rejected; stats.dropped += result.dropped;
      if (result.rejected && complained++ < 5) log(`batch had ${result.rejected} malformed event(s) of ${batch.events.length}`);
      if (result.dropped) emit("bridge.dropped", { count: result.dropped, frameId: FRAME_ID.test(batch.frameId ?? "") ? batch.frameId : undefined });
      res.writeHead(204, cors); res.end();
    });
  }

  function relay(req, res) {
    stats.requests++;
    const started = Date.now();
    const startedHr = process.hrtime.bigint();
    let url;
    try { url = new URL(req.url, "http://gateway.invalid"); } catch { url = new URL("/", "http://gateway.invalid"); }
    const pathname = url.pathname;
    const category = classifyRequest(req, pathname);
    const requestId = category ? newId("r") : null;
    const tagged = req.headers["x-engelbart-interaction"];
    const interactionId = typeof tagged === "string" && INTERACTION_ID.test(tagged) ? tagged : null;
    const ids = interactionId ? { interactionId, correlation: "explicit" } : {};
    const wantsDocument = category === "document" && req.method === "GET";
    const headers = forwarded(req.headers);
    // Only an uncompressed document can be injected. Anything else keeps
    // the encoding the browser asked for.
    if (wantsDocument) headers["accept-encoding"] = "identity";

    let requestBytes = 0, responseBytes = 0, ttfb = null, injected = null, reported = false, ended = false;
    const elapsed = () => Number(process.hrtime.bigint() - startedHr) / 1e6;
    if (requestId) {
      emit("network.request", { requestId, ...ids, method: req.method, path: pathname, has_query: !!url.search, query: safeQuery(url.search), category, dest: req.headers["sec-fetch-dest"], referer: refererPath(req), headers: pickHeaders(req.headers, REQUEST_HEADERS), next_action: !!req.headers["next-action"], started_at: new Date(started).toISOString() });
    }
    const finish = (extra) => {
      if (!requestId || reported) return;
      reported = true;
      emit(extra.error ? "network.error" : "network.response", { requestId, ...ids, method: req.method, path: pathname, category, latency_ms: Math.round(elapsed()), ttfb_ms: ttfb, sizes: { request_bytes: requestBytes, response_bytes: responseBytes }, ended_at: new Date().toISOString(), ...extra });
    };

    const upstream = http.request({ host: targetAddress, port: targetPort, method: req.method, path: req.url, headers }, (up) => {
      ttfb = Math.round(elapsed());
      const status = up.statusCode ?? 502;
      const responseHeaders = stripHopByHop(up.headers);
      const type = String(up.headers["content-type"] ?? "");
      const isHtml = /^text\/html/i.test(type);
      const summary = () => ({ status, headers: pickHeaders(up.headers, RESPONSE_HEADERS), streamed: up.headers["transfer-encoding"] === "chunked" || /text\/x-component|text\/event-stream/.test(type), injected });
      if (!(wantsDocument && isHtml && req.method === "GET")) {
        res.writeHead(status, responseHeaders);
        up.on("data", (c) => { responseBytes += c.length; });
        up.pipe(res);
        up.on("end", () => { ended = true; finish(summary()); });
        up.on("error", (err) => { finish({ ...summary(), error: { phase: "upstream", code: err.code, message: err.message } }); res.destroy(); });
        return;
      }
      stats.documents++;
      const policy = scriptPolicy(up.headers["content-security-policy"]);
      const decoder = decompressor(up.headers["content-encoding"]);
      const encoded = !!up.headers["content-encoding"] && !/^identity$/i.test(String(up.headers["content-encoding"]));
      if (!policy.allowed || (encoded && !decoder)) {
        stats.blocked++;
        emit("bridge.blocked", { requestId, path: pathname, reason: !policy.allowed ? "csp" : "encoding", directive: policy.directive, encoding: encoded ? up.headers["content-encoding"] : undefined });
        log(`not injecting into ${pathname}: ${!policy.allowed ? `content-security-policy script-src ${policy.directive}` : `content-encoding ${up.headers["content-encoding"]}`}`);
        res.writeHead(status, responseHeaders);
        up.on("data", (c) => { responseBytes += c.length; });
        up.pipe(res);
        up.on("end", () => { ended = true; finish(summary()); });
        return;
      }
      const id = frameId();
      const tag = `<script src="${BRIDGE_PATH}" data-frame="${id}"${configAttr}${policy.nonce ? ` nonce="${escapeAttr(policy.nonce)}"` : ""}></script>`;
      delete responseHeaders["content-length"];
      delete responseHeaders["content-encoding"];
      res.writeHead(status, responseHeaders);
      const inject = injector(tag, (point) => {
        injected = id; stats.injected++;
        emit("frame.served", { requestId, ...ids, frameId: id, path: pathname, has_query: !!url.search, query: safeQuery(url.search), dest: req.headers["sec-fetch-dest"], referer: refererPath(req), status, injected_at: point, nonce: !!policy.nonce });
      });
      const source = decoder ? up.pipe(decoder) : up;
      up.on("data", (c) => { responseBytes += c.length; });
      source.on("data", (c) => { const out = inject.write(c); if (out) res.write(out); });
      source.on("end", () => { const out = inject.end(); if (out) res.write(out); ended = true; res.end(); finish(summary()); });
      source.on("error", (err) => { finish({ ...summary(), error: { phase: "upstream", code: err.code, message: err.message } }); res.destroy(); });
    });
    upstream.on("error", (err) => {
      finish({ status: null, error: { phase: "connect", code: err.code, message: err.message } });
      if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
      res.end(`engelbart preview: application not reachable on ${targetHost} (${err.message})`);
    });
    res.on("close", () => { if (!ended) finish({ status: res.statusCode || null, aborted: true }); upstream.destroy(); });
    req.on("data", (c) => { requestBytes += c.length; });
    req.pipe(upstream);
  }

  const server = http.createServer((req, res) => {
    const pathname = (req.url ?? "/").split("?")[0];
    if (pathname === BRIDGE_PATH) return serveBridge(req, res);
    if (pathname === EVENTS_PATH) return serveEvents(req, res);
    if (pathname === HEALTH_PATH) { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ ok: true, gateway: "preview", target: targetHost, ...stats })); }
    relay(req, res);
  });
  server.on("upgrade", (req, socket, head) => {
    const upstream = net.connect(targetPort, targetAddress, () => {
      const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
      for (const [name, value] of Object.entries({ ...req.headers, host: targetHost, ...(req.headers.origin ? { origin: targetOrigin } : {}) })) {
        for (const v of Array.isArray(value) ? value : [value]) lines.push(`${name}: ${v}`);
      }
      upstream.write(lines.join("\r\n") + "\r\n\r\n");
      if (head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
  });

  return {
    server, stats, targetHost,
    listen: (bind = "0.0.0.0") => new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(listenPort, bind, () => { server.off("error", reject); resolve(server.address().port); });
    }),
    close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()); }),
  };
}

// ---- command line
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const log = makeLogger("preview-gateway");
  const emit = makeEmitter("preview-gateway");
  const emitBrowser = makeEmitter("browser");
  const mappings = process.argv.slice(2).map((spec) => {
    const [listen, target, ...rest] = spec.split(":");
    return { listenPort: Number(listen), targetPort: Number(target), targetAddress: rest.join(":") || "127.0.0.1" };
  });
  if (!mappings.length || mappings.some((m) => !m.listenPort || !m.targetPort)) {
    console.error("usage: preview-gateway.mjs <listen-port>:<target-port>[:<target-address>] ...");
    process.exit(2);
  }
  const bridgeFile = process.env.ENGELBART_BRIDGE_FILE || path.join(here, "bridge.js");
  let bridge;
  try { bridge = fs.readFileSync(bridgeFile, "utf8"); } catch (err) { log(`cannot read the bridge at ${bridgeFile}: ${err.message}`); process.exit(2); }
  let bridgeConfig = null;
  if (process.env.ENGELBART_BRIDGE_CONFIG) { try { bridgeConfig = JSON.parse(process.env.ENGELBART_BRIDGE_CONFIG); } catch { log("ignoring ENGELBART_BRIDGE_CONFIG: not JSON"); } }
  const redactor = Redactor.fromFile(process.env.ENGELBART_REDACT_FILE, log);
  const bind = process.env.ENGELBART_PREVIEW_BIND || "0.0.0.0";
  const limiter = rateLimiter(EVENTS_PER_SECOND);
  const gateways = mappings.map((m) => createPreviewGateway({ ...m, bridge, bridgeConfig, redactor, emit, emitBrowser, log, limiter }));
  Promise.all(gateways.map((g) => g.listen(bind))).then(() => {
    emit("gateway.listening", { gateway: "preview", port: mappings[0].listenPort, bind, mappings: mappings.map((m) => ({ listen: m.listenPort, target: `${m.targetAddress}:${m.targetPort}` })) });
    for (const m of mappings) log(`listening on ${bind}:${m.listenPort} for ${m.targetAddress}:${m.targetPort}`);
  }).catch((err) => { log(`cannot listen: ${err.message}`); process.exit(1); });
  const summary = () => log(`stats ${JSON.stringify(gateways.length === 1 ? gateways[0].stats : gateways.map((g) => g.stats))}`);
  setInterval(summary, 60_000).unref();
  process.on("SIGTERM", () => { summary(); process.exit(0); });
}
