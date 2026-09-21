// The preview gateway against a fixture application. What must hold:
// documents come back with the bridge in <head> and a frame id, and
// nothing else about them changes; every other response passes through
// byte for byte; the bridge's endpoints work and refuse junk; requests
// become network events joined to the interaction that tagged them.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import zlib from "node:zlib";
import { Redactor } from "../../sandbox/trace/common.mjs";
import { acceptBatch, classifyRequest, createPreviewGateway, injectionPoint, injector, rateLimiter, safeQuery, scriptPolicy } from "../../sandbox/trace/preview-gateway.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(get, ms = 2000) {
  const deadline = Date.now() + ms;
  for (;;) { const v = get(); if (v || Date.now() > deadline) return v; await sleep(5); }
}
const BRIDGE = "/* bridge */ window.__engelbart_test = 1;";
const PAGE_HEAD = `<!DOCTYPE html><html lang="en"><head prefix="og: x"><meta charset="utf-8"><title>App</title>`;
const PAGE_REST = `</head><body><h1>Hi</h1><iframe src="/sandbox/index.html?id=solution"></iframe></body></html>`;

// A stand-in application: streams its HTML slowly, echoes what it received,
// serves assets, and knows a few awkward shapes.
function fixtureApp() {
  const seen = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString("utf8") });
      const path = req.url.split("?")[0];
      if (path === "/" || path === "/sandbox/index.html") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "x-custom": "kept" });
        res.write(PAGE_HEAD.slice(0, 20)); await sleep(20);
        res.write(PAGE_HEAD.slice(20)); await sleep(20);
        return res.end(PAGE_REST);
      }
      if (path === "/nohead") { res.writeHead(200, { "content-type": "text/html" }); return res.end(`<html><body><p>bare</p></body></html>`); }
      if (path === "/fragment") { res.writeHead(200, { "content-type": "text/html" }); return res.end(`<p>just a fragment</p>`); }
      if (path === "/gz") { res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" }); return res.end(zlib.gzipSync(PAGE_HEAD + PAGE_REST)); }
      if (path === "/csp-nonce") { res.writeHead(200, { "content-type": "text/html", "content-security-policy": "default-src 'self'; script-src 'nonce-abc123' 'strict-dynamic'" }); return res.end(PAGE_HEAD + PAGE_REST); }
      if (path === "/csp-strict") { res.writeHead(200, { "content-type": "text/html", "content-security-policy": "script-src https://cdn.example.org" }); return res.end(PAGE_HEAD + PAGE_REST); }
      if (path === "/app.js") { res.writeHead(200, { "content-type": "application/javascript", "content-length": "22" }); return res.end("console.log('<head>');"); }
      if (path === "/api/echo") { res.writeHead(200, { "content-type": "application/json", "x-request-id": "up_1" }); return res.end(JSON.stringify({ host: req.headers.host, origin: req.headers.origin, referer: req.headers.referer, interaction: req.headers["x-engelbart-interaction"] ?? null, encoding: req.headers["accept-encoding"] ?? null })); }
      if (path === "/api/stream") {
        res.writeHead(200, { "content-type": "text/x-component" });
        res.write("0:[\"$@1\"]\n"); await sleep(20); return res.end("1:\"done\"\n");
      }
      if (path === "/html-not-doc") { res.writeHead(200, { "content-type": "text/html" }); return res.end("<b>partial</b>"); }
      res.writeHead(404, { "content-type": "text/plain" }); res.end("nope");
    });
  });
  return { server, seen, listen: () => new Promise((r) => server.listen(0, "127.0.0.1", () => r(server.address().port))) };
}

describe("pieces", () => {
  it("finds where the bridge goes, waiting for a <head> that may still come", () => {
    assert.equal(injectionPoint("<!doctype html><html><he", false), -1, "the head tag could be arriving");
    assert.equal(injectionPoint("<!doctype html><html><head", false), -1, "its end could be arriving");
    assert.equal(injectionPoint(`<!doctype html><html><head lang="x">`, false), 36);
    assert.equal(injectionPoint("<!doctype html><html><header>", false), -1, "<header> is not <head>");
    assert.equal(injectionPoint("<html><body>", false), 6, "a body without a head: after <html>");
    assert.equal(injectionPoint("<!DOCTYPE html><p>x</p>", true), 15, "after the doctype when nothing else");
    assert.equal(injectionPoint("<p>x</p>", true), 0);
    assert.equal(injectionPoint("<p>x</p>", false), -1, "still waiting while the document is short");
  });
  it("streams a document through with the tag once, never buffering past the head", () => {
    const seen = [];
    const inj = injector("<script>T</script>", (at) => seen.push(at));
    assert.equal(inj.write(Buffer.from("<!doctype html><ht")), null);
    assert.equal(inj.write(Buffer.from("ml><head><meta>")).toString(), "<!doctype html><html><head><script>T</script><meta>");
    assert.equal(inj.write(Buffer.from("<body><head>")).toString(), "<body><head>", "after injection nothing is inspected");
    assert.equal(inj.end(), null);
    assert.deepEqual(seen, [27]);
    const tiny = injector("<script>T</script>", () => {});
    assert.equal(tiny.write(Buffer.from("<p>x</p>")), null);
    assert.equal(tiny.end().toString(), "<script>T</script><p>x</p>");
    const empty = injector("<script>T</script>", () => {});
    assert.equal(empty.end(), null, "an empty document stays empty");
  });
  it("reads a content-security-policy the way a browser would for a same-origin script", () => {
    assert.deepEqual(scriptPolicy(undefined), { allowed: true });
    assert.deepEqual(scriptPolicy("default-src 'self'"), { allowed: true });
    assert.deepEqual(scriptPolicy("default-src 'none'; script-src 'self' https://cdn"), { allowed: true });
    assert.deepEqual(scriptPolicy("script-src 'nonce-abc' 'strict-dynamic'"), { allowed: true, nonce: "abc" });
    assert.deepEqual(scriptPolicy("script-src https://cdn.example.org"), { allowed: false, directive: "https://cdn.example.org" });
    assert.deepEqual(scriptPolicy("default-src 'none'"), { allowed: false, directive: "'none'" });
    assert.deepEqual(scriptPolicy("img-src 'none'"), { allowed: true });
  });
  it("classifies requests: documents and calls are recorded, assets are not", () => {
    const req = (headers, method = "GET") => ({ method, headers });
    assert.equal(classifyRequest(req({ "sec-fetch-dest": "document" }), "/"), "document");
    assert.equal(classifyRequest(req({ "sec-fetch-dest": "iframe" }), "/sandbox/index.html"), "document");
    assert.equal(classifyRequest(req({ accept: "text/html,*/*" }), "/lesson"), "document");
    assert.equal(classifyRequest(req({ "sec-fetch-dest": "script" }), "/main"), null);
    assert.equal(classifyRequest(req({}), "/_next/static/chunks/x.js"), null);
    assert.equal(classifyRequest(req({}), "/logo.png"), null);
    assert.equal(classifyRequest(req({}), "/__nextjs_original-stack-frame"), null);
    assert.equal(classifyRequest(req({ "sec-fetch-dest": "empty", "next-action": "abc" }, "POST"), "/"), "action");
    assert.equal(classifyRequest(req({ "sec-fetch-dest": "empty", "next-router-prefetch": "1" }), "/other"), "prefetch");
    assert.equal(classifyRequest(req({ "sec-fetch-dest": "empty", accept: "application/json" }), "/api/x"), "api");
    assert.equal(classifyRequest(req({}, "POST"), "/api/logClick"), "api");
  });
  it("keeps query names and short values, never anything secret-looking", () => {
    assert.deepEqual(safeQuery("?id=solution&token=abcdef&x=" + "y".repeat(60)), { id: "solution", token: "[omitted]", x: "[omitted]" });
    assert.equal(safeQuery(""), undefined);
  });
  it("accepts a batch, converts browser time, redacts, and drops junk", () => {
    const lines = [];
    const emit = (kind, fields) => lines.push({ kind, ...fields });
    const secret = "sk-test-secret-key-000000000000000000";
    const redactor = new Redactor({ OPENAI_API_KEY: secret });
    const receivedAt = Date.parse("2026-09-19T10:00:00.500Z");
    const batch = { engelbart: "bridge", v: 1, frameId: "f_parent01", sentAt: receivedAt - 1000, dropped: 2, events: [
      { kind: "ui.click", at: receivedAt - 1250, frameId: "f_parent01", interactionId: "i_parent01_1", data: { target: { tag: "button", text: `key ${secret}` } } },
      { kind: "ui.change", at: receivedAt - 1100, frameId: "f_parent01", interactionId: "i_parent01_1", correlation: "temporal", data: { added: ["x"] } },
      { kind: "hack.attempt", at: receivedAt, frameId: "f_parent01", data: {} },
      { kind: "ui.click", at: receivedAt, frameId: "not-a-frame", data: {} },
      { kind: "ui.click", at: receivedAt, frameId: "f_parent01", interactionId: "../../etc", data: {} },
      { kind: "ui.click", at: "now", frameId: "f_parent01", data: {} },
      { kind: "frame.loaded", at: receivedAt, frameId: "f_parent01", data: { big: "x".repeat(5000) } },
      { kind: "frame.attached", at: receivedAt, frameId: "f_parent01", data: { kind: "document", source: "evil", ts: "1999", frameKind: "document" } },
    ] };
    const result = acceptBatch(batch, { receivedAt, redactor, emit });
    assert.deepEqual(result, { ok: true, accepted: 4, rejected: 4, dropped: 2, offset: 1000 });
    assert.deepEqual(lines[3], { kind: "frame.attached", ts: "2026-09-19T10:00:01.500Z", frameId: "f_parent01", browser_at: receivedAt, clock_offset_ms: 1000, frameKind: "document" }, "a page cannot overwrite the envelope");
    assert.equal(lines[0].ts, "2026-09-19T10:00:00.250Z", "browser time shifted by the batch's offset");
    assert.equal(lines[0].interactionId, "i_parent01_1");
    assert.equal(lines[0].correlation, undefined);
    assert.equal(lines[0].target.text, "key [redacted:OPENAI_API_KEY]");
    assert.equal(lines[1].correlation, "temporal");
    assert.deepEqual(lines[2].truncated, true);
    assert.equal(acceptBatch({ events: [] }, { receivedAt, emit }).ok, false);
    const far = acceptBatch({ engelbart: "bridge", sentAt: receivedAt - 3_600_000, events: [{ kind: "ui.click", at: 5, frameId: "f_parent01", data: {} }] }, { receivedAt, emit });
    assert.equal(far.offset, null, "a clock an hour off is not trusted");
    assert.equal(lines.at(-1).ts, new Date(receivedAt).toISOString(), "so the arrival time is used");
    const limiter = rateLimiter(2);
    const limited = acceptBatch({ engelbart: "bridge", sentAt: receivedAt, events: Array.from({ length: 5 }, () => ({ kind: "ui.key", at: receivedAt, frameId: "f_parent01", data: {} })) }, { receivedAt, emit, limiter });
    assert.deepEqual([limited.accepted, limited.dropped], [2, 3]);
  });
});

describe("gateway", () => {
  const app = fixtureApp();
  const lines = [];
  const logs = [];
  let gateway, base, appPort;
  const emit = (kind, fields) => lines.push({ kind, ...fields });
  const of = (kind) => lines.filter((l) => l.kind === kind);
  before(async () => {
    appPort = await app.listen();
    gateway = createPreviewGateway({ listenPort: 0, targetPort: appPort, bridge: BRIDGE, bridgeConfig: { quietMs: 500 }, redactor: new Redactor({ SECRET: "hunter2-hunter2" }), emit, log: (m) => logs.push(m) });
    const port = await gateway.listen("127.0.0.1");
    base = `http://127.0.0.1:${port}`;
  });
  after(async () => { await gateway.close(); app.server.closeAllConnections(); app.server.close(); });
  const doc = (path, headers = {}) => fetch(base + path, { headers: { accept: "text/html,*/*", "sec-fetch-dest": "document", referer: base + "/", ...headers } });

  it("serves a streamed document with the bridge after <head> and a fresh frame id, headers intact", async () => {
    const res = await doc("/?mode=demo&token=zzz");
    const html = await res.text();
    assert.equal(res.headers.get("x-custom"), "kept");
    assert.equal(res.headers.get("content-encoding"), null);
    const m = html.match(/<head prefix="og: x"><script src="\/__engelbart\/bridge.js" data-frame="(f_[a-z0-9]{10})" data-config="([^"]+)"><\/script><meta charset="utf-8">/);
    assert.ok(m, html.slice(0, 200));
    assert.equal(m[2], "{&quot;quietMs&quot;:500}");
    assert.equal(html.replace(m[0], `<head prefix="og: x"><meta charset="utf-8">`), PAGE_HEAD + PAGE_REST, "nothing else changed");
    const served = of("frame.served").find((l) => l.frameId === m[1]);
    assert.ok(served);
    assert.equal(served.path, "/");
    assert.deepEqual(served.query, { mode: "demo", token: "[omitted]" });
    assert.equal(served.dest, "document");
    assert.equal(served.referer, "/");
    const other = await (await doc("/")).text();
    assert.notEqual(other.match(/data-frame="([^"]+)"/)[1], m[1], "every document gets its own frame id");
    const upstream = app.seen.find((s) => s.url === "/?mode=demo&token=zzz");
    assert.equal(upstream.headers["accept-encoding"], "identity");
    assert.equal(upstream.headers.host, `127.0.0.1:${appPort}`);
    assert.equal(upstream.headers.referer, `http://127.0.0.1:${appPort}/`);
    const request = of("network.request").find((l) => l.path === "/" && l.query?.mode === "demo");
    assert.equal(request.category, "document");
    const response = await waitFor(() => of("network.response").find((l) => l.requestId === request.requestId));
    assert.equal(response.status, 200);
    assert.equal(response.injected, m[1]);
    assert.ok(response.latency_ms >= 30, "the fixture streams over 40 ms");
    assert.ok(response.ttfb_ms < response.latency_ms);
    assert.equal(response.sizes.response_bytes, (PAGE_HEAD + PAGE_REST).length);
  });
  it("injects an embedded document the same way and knows it is a frame", async () => {
    const res = await doc("/sandbox/index.html?id=solution", { "sec-fetch-dest": "iframe" });
    const html = await res.text();
    assert.match(html, /<head prefix="og: x"><script src="\/__engelbart\/bridge.js" data-frame="f_/);
    const served = of("frame.served").find((l) => l.path === "/sandbox/index.html");
    assert.equal(served.dest, "iframe");
    assert.deepEqual(served.query, { id: "solution" });
  });
  it("falls back when there is no <head>, and decompresses a document the app insisted on compressing", async () => {
    assert.equal(await (await doc("/nohead")).text(), `<html><script src="/__engelbart/bridge.js" data-frame="${(await waitFor(() => of("frame.served").find((l) => l.path === "/nohead")))?.frameId}" data-config="{&quot;quietMs&quot;:500}"></script><body><p>bare</p></body></html>`);
    const gz = await doc("/gz");
    assert.equal(gz.headers.get("content-encoding"), null);
    const html = await gz.text();
    assert.match(html, /<head prefix="og: x"><script src="\/__engelbart\/bridge.js"/);
    assert.ok(html.endsWith(PAGE_REST));
  });
  it("respects a content-security-policy: reuses a nonce, or leaves the page alone and says so", async () => {
    const nonced = await (await doc("/csp-nonce")).text();
    assert.match(nonced, /data-frame="f_[a-z0-9]+" data-config="[^"]+" nonce="abc123"><\/script>/);
    const strict = await doc("/csp-strict");
    const html = await strict.text();
    assert.equal(html, PAGE_HEAD + PAGE_REST, "served byte for byte");
    assert.equal(strict.headers.get("content-security-policy"), "script-src https://cdn.example.org");
    const blocked = of("bridge.blocked").find((l) => l.path === "/csp-strict");
    assert.equal(blocked.reason, "csp");
    assert.equal(blocked.directive, "https://cdn.example.org");
    assert.ok(logs.some((l) => l.includes("/csp-strict")));
  });
  it("passes everything else through byte for byte, without events for assets", async () => {
    const before = lines.length;
    const js = await fetch(base + "/app.js", { headers: { "sec-fetch-dest": "script" } });
    assert.equal(js.headers.get("content-length"), "22");
    assert.equal(await js.text(), "console.log('<head>');");
    const html = await fetch(base + "/html-not-doc", { headers: { "sec-fetch-dest": "empty", accept: "*/*" } });
    assert.equal(await html.text(), "<b>partial</b>", "html fetched by script, not as a document, is not a frame");
    const notFound = await fetch(base + "/_next/static/missing.js");
    assert.equal(notFound.status, 404);
    assert.equal(lines.slice(before).filter((l) => l.kind.startsWith("network.") && (l.path === "/app.js" || l.path.startsWith("/_next"))).length, 0);
    const api = lines.slice(before).filter((l) => l.path === "/html-not-doc");
    assert.deepEqual(api.map((l) => l.kind), ["network.request", "network.response"]);
    assert.equal(api[0].kind === "network.request" && api[0].injected, undefined);
  });
  it("records application requests with the interaction that tagged them, and forwards the tag", async () => {
    const res = await fetch(base + "/api/echo", { method: "POST", headers: { "content-type": "application/json", "x-engelbart-interaction": "i_parent01_7", origin: "https://43110-sb.e2b.app", "accept-encoding": "gzip" }, body: JSON.stringify({ q: 1 }) });
    const echo = await res.json();
    assert.equal(echo.interaction, "i_parent01_7");
    assert.equal(echo.host, `127.0.0.1:${appPort}`);
    assert.equal(echo.origin, `http://127.0.0.1:${appPort}`);
    assert.equal(echo.encoding, "gzip", "a non-document keeps the encoding the browser asked for");
    const request = of("network.request").find((l) => l.path === "/api/echo");
    assert.equal(request.interactionId, "i_parent01_7");
    assert.equal(request.correlation, "explicit");
    assert.equal(request.method, "POST");
    assert.equal(request.category, "api");
    assert.equal(request.headers["content-type"], "application/json");
    assert.equal(request.headers.origin, undefined, "only allowlisted headers are kept");
    const response = await waitFor(() => of("network.response").find((l) => l.requestId === request.requestId));
    assert.equal(response.interactionId, "i_parent01_7");
    assert.equal(response.status, 200);
    assert.equal(response.headers["x-request-id"], "up_1");
    assert.equal(response.sizes.request_bytes, 7);
    const bad = await fetch(base + "/api/echo", { method: "POST", headers: { "x-engelbart-interaction": "<script>" }, body: "" });
    await bad.text();
    const untagged = of("network.request").filter((l) => l.path === "/api/echo").at(-1);
    assert.equal(untagged.interactionId, undefined, "a malformed tag is not an id");
    const stream = await fetch(base + "/api/stream", { method: "POST", headers: { "next-action": "a1b2", "sec-fetch-dest": "empty" } });
    assert.equal(await stream.text(), "0:[\"$@1\"]\n1:\"done\"\n");
    const action = of("network.request").find((l) => l.path === "/api/stream");
    assert.equal(action.category, "action");
    assert.equal(action.next_action, true);
    const streamed = await waitFor(() => of("network.response").find((l) => l.requestId === action.requestId));
    assert.equal(streamed.streamed, true);
  });
  it("says on its health which origins the bridge it injected will obey", async () => {
    // The one thing that tells a bridge with no picker in it apart from a
    // current bridge refusing this workspace, which look identical from a
    // browser and want opposite things done about them. Both config
    // shapes are reported, the list first, deduplicated.
    const { createPreviewGateway } = await import("../../sandbox/trace/preview-gateway.mjs");
    const one = createPreviewGateway({
      listenPort: 0, targetPort: appPort, bridge: BRIDGE,
      bridgeConfig: { parentOrigin: "http://localhost:3000", parentOrigins: ["https://app.test", "http://localhost:3000"] },
      emit: () => {}, log: () => {},
    });
    await new Promise((r) => one.server.listen(0, "127.0.0.1", r));
    try {
      const at = `http://127.0.0.1:${one.server.address().port}`;
      const health = await (await fetch(at + "/__engelbart/health")).json();
      assert.deepEqual(health.workspaceOrigins, ["https://app.test", "http://localhost:3000"]);
    } finally {
      await new Promise((r) => one.server.close(r));
    }
  });
  it("serves the bridge and its health, and takes batches only in the right shape", async () => {
    const js = await fetch(base + "/__engelbart/bridge.js");
    assert.equal(await js.text(), BRIDGE);
    assert.equal(js.headers.get("content-type"), "application/javascript; charset=utf-8");
    const again = await fetch(base + "/__engelbart/bridge.js", { headers: { "if-none-match": js.headers.get("etag") } });
    assert.equal(again.status, 304);
    const health = await (await fetch(base + "/__engelbart/health")).json();
    assert.equal(health.gateway, "preview");
    // Nothing was configured for this gateway, so it claims no origins
    // rather than an empty promise: a workspace reads a missing list as
    // "this image is too old to say" and does not accuse it of refusing.
    assert.deepEqual(health.workspaceOrigins, []);
    const preflight = await fetch(base + "/__engelbart/events", { method: "OPTIONS" });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "*");
    assert.equal((await fetch(base + "/__engelbart/events")).status, 405);
    assert.equal((await fetch(base + "/__engelbart/events", { method: "POST", body: "{not json" })).status, 400);
    assert.equal((await fetch(base + "/__engelbart/events", { method: "POST", body: JSON.stringify({ hello: 1 }) })).status, 400);
    const big = await fetch(base + "/__engelbart/events", { method: "POST", body: JSON.stringify({ engelbart: "bridge", events: [{ kind: "ui.click", at: 1, frameId: "f_parent01", data: { x: "y".repeat(70_000) } }] }) }).catch((err) => ({ status: 413, err }));
    assert.equal(big.status, 413);
    const now = Date.now();
    const ok = await fetch(base + "/__engelbart/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ engelbart: "bridge", v: 1, frameId: "f_parent01", sentAt: now, events: [
      { kind: "ui.key", at: now - 100, frameId: "f_child0001", interactionId: "i_child0001_3", data: { key: "ArrowLeft", count: 2, target: { tag: "body", title: "pw hunter2-hunter2" } } },
    ] }) });
    assert.equal(ok.status, 204);
    const key = of("ui.key").at(-1);
    assert.equal(key.frameId, "f_child0001");
    assert.equal(key.interactionId, "i_child0001_3");
    assert.equal(key.key, "ArrowLeft");
    assert.equal(key.target.title, "pw [redacted:SECRET]");
    assert.ok(Math.abs(Date.parse(key.ts) - (now - 100)) < 1000);
    assert.equal(lines.some((l) => l.kind === "network.request" && l.path.startsWith("/__engelbart")), false, "the gateway's own endpoints are not application traffic");
    assert.equal(gateway.stats.events, 1);
  });
  it("serves a recorder beside the bridge when the image carries one, and injects both", async () => {
    const withRecorder = createPreviewGateway({ listenPort: 0, targetPort: appPort, bridge: BRIDGE, recorder: "globalThis.rrwebRecord = {};", emit: () => {}, log: () => {} });
    const port = await withRecorder.listen("127.0.0.1");
    const at = `http://127.0.0.1:${port}`;
    try {
      const js = await fetch(at + "/__engelbart/recorder.js");
      assert.equal(await js.text(), "globalThis.rrwebRecord = {};");
      assert.equal(js.headers.get("content-type"), "application/javascript; charset=utf-8");
      // Pinned and identical on every document of every sandbox on this
      // image, so unlike the bridge it may be cached hard.
      assert.match(js.headers.get("cache-control"), /immutable/);
      assert.equal((await fetch(at + "/__engelbart/recorder.js", { headers: { "if-none-match": js.headers.get("etag") } })).status, 304);
      const html = await (await fetch(at + "/", { headers: { accept: "text/html,*/*", "sec-fetch-dest": "document" } })).text();
      // The recorder first: both are classic scripts, so they run in
      // order and the bridge can see whether one is there at all.
      assert.match(html, /<script src="\/__engelbart\/recorder\.js"><\/script><script src="\/__engelbart\/bridge\.js" data-frame="f_/);
    } finally {
      await withRecorder.close();
    }
  });

  it("answers 502 when the application is gone, and records the failure", async () => {
    const dead = createPreviewGateway({ listenPort: 0, targetPort: 1, bridge: BRIDGE, emit, log: () => {} });
    const port = await dead.listen("127.0.0.1");
    const res = await fetch(`http://127.0.0.1:${port}/api/x`, { headers: { "sec-fetch-dest": "empty" } });
    assert.equal(res.status, 502);
    assert.match(await res.text(), /not reachable/);
    const err = await waitFor(() => of("network.error").find((l) => l.path === "/api/x"));
    assert.equal(err.error.phase, "connect");
    await dead.close();
  });
});
