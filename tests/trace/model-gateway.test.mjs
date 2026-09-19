// The model gateway against a fixture upstream that streams a recorded
// chat-completions response. What must hold: the application receives
// exactly the provider's bytes as they arrive, the provider receives
// exactly the application's request, and the events tell the whole story
// without a credential in them.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import zlib from "node:zlib";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createGateway } from "../../sandbox/trace/model-gateway.mjs";
import { Redactor, parseTraceLine } from "../../sandbox/trace/common.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => fs.readFileSync(path.join(here, "fixtures", name), "utf8");
const SSE = fixture("openai-chat-stream.sse");
const REQUEST = JSON.parse(fixture("openai-chat-stream.request.json"));
const ANSWER = fixture("openai-chat-stream.answer.json").trim();
const SECRET = "sk-test-secret-key-000000000000000000";
const TOKEN = "tok_test_0123456789";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Events for a compressed body land a tick after the body ends, once zlib
// has flushed, so tests wait for them instead of assuming.
async function waitFor(get, ms = 2000) {
  const deadline = Date.now() + ms;
  for (;;) { const v = get(); if (v || Date.now() > deadline) return v; await sleep(5); }
}

// A stand-in provider. Streams the fixture in bursts with pauses so a
// buffering proxy would be caught; answers JSON when not asked to stream.
function fixtureUpstream() {
  const seen = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const record = { method: req.method, url: req.url, headers: req.headers, body, lastWriteAt: 0 };
      seen.push(record);
      if (req.headers.authorization === "Bearer bad") {
        res.writeHead(401, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: { message: `Incorrect API key provided: ${SECRET}. You can find your API key at https://platform.openai.com.`, type: "invalid_request_error", param: null, code: "invalid_api_key" } }));
      }
      if (req.url.startsWith("/v1/models")) {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ object: "list", data: [{ id: "gpt-4o-2024-08-06" }] }));
      }
      let parsed = {};
      try { parsed = JSON.parse(body); } catch {}
      if (parsed.stream) {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", "x-request-id": "req_fixture_1" });
        const lines = SSE.split("\n\n").filter(Boolean).map((b) => `${b}\n\n`);
        while (lines.length) {
          res.write(lines.splice(0, 8).join(""));
          record.lastWriteAt = performance.now();
          await sleep(15);
        }
        return res.end();
      }
      const json = JSON.stringify({
        id: "chatcmpl-nonstream", object: "chat.completion", created: 1758200001, model: "gpt-4o-2024-08-06",
        choices: [{ index: 0, message: { role: "assistant", content: ANSWER, refusal: null }, logprobs: null, finish_reason: "stop" }],
        usage: { prompt_tokens: 120, completion_tokens: 95, total_tokens: 215 },
      });
      if (req.url.includes("gzip=1")) {
        res.writeHead(200, { "content-type": "application/json", "content-encoding": "gzip" });
        return res.end(zlib.gzipSync(json));
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(json);
    });
  });
  return { server, seen, listen: () => new Promise((r) => server.listen(0, "127.0.0.1", () => r(server.address().port))) };
}

// Read a fetch body chunk by chunk, noting when the first chunk landed.
async function drain(response) {
  const reader = response.body.getReader();
  const parts = [];
  let firstChunkAt = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    firstChunkAt ??= performance.now();
    parts.push(Buffer.from(value));
  }
  return { text: Buffer.concat(parts).toString("utf8"), firstChunkAt };
}

describe("model gateway", () => {
  const upstream = fixtureUpstream();
  const events = [];
  let upstreamPort; let gateway; let gatewayPort;
  const url = (rest, { token = TOKEN, host = `127.0.0.1:${upstreamPort}`, scheme = "http" } = {}) => `http://127.0.0.1:${gatewayPort}/t/${token}/${scheme}/${host}${rest}`;
  const call = (body, headers = {}) => fetch(url("/v1/chat/completions"), {
    method: "POST", body: JSON.stringify(body),
    headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}`, cookie: "session=abc", "openai-organization": "org-123", "user-agent": "OpenAI/JS 4.55.5", "x-stainless-retry-count": "0", ...headers },
  });
  const eventsOf = (kind) => events.filter((e) => e.kind === kind);
  const last = (kind) => eventsOf(kind).at(-1);

  before(async () => {
    upstreamPort = await upstream.listen();
    gateway = createGateway({
      token: TOKEN, capture: "full", allowHttp: true,
      upstreamHosts: [`127.0.0.1:${upstreamPort}`, "127.0.0.1:1"],
      redactor: new Redactor({ OPENAI_API_KEY: SECRET, MONGODB_URI: "mongodb+srv://rope:hunter22@cluster0.example.net/rope" }),
      emit: (kind, fields) => events.push({ kind, ...fields }),
    });
    gatewayPort = (await gateway.listen(0)).port;
  });
  after(async () => { await gateway.close(); upstream.server.close(); });

  it("streams the provider's bytes through unchanged and without waiting", async () => {
    events.length = 0;
    const response = await call(REQUEST);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/event-stream/);
    const { text, firstChunkAt } = await drain(response);
    assert.equal(text, SSE, "the application must receive exactly the fixture");
    const record = upstream.seen.at(-1);
    assert.ok(firstChunkAt < record.lastWriteAt, "the first chunk must reach the client before the upstream finishes sending");
  });

  it("forwards the request byte for byte, credentials included, without adding anything", () => {
    const record = upstream.seen.at(-1);
    assert.equal(record.method, "POST");
    assert.equal(record.url, "/v1/chat/completions");
    assert.equal(record.body, JSON.stringify(REQUEST));
    assert.equal(record.headers.authorization, `Bearer ${SECRET}`);
    assert.equal(record.headers.host, `127.0.0.1:${upstreamPort}`);
    assert.equal(record.headers["openai-organization"], "org-123");
    assert.ok(!record.body.includes("stream_options"), "no include_usage is added");
  });

  it("records the request as the model saw it, redacted", () => {
    const req = last("model.request");
    assert.ok(req, "a model.request event");
    assert.equal(req.capture, "full");
    assert.equal(req.provider, "openai");
    assert.equal(req.api, "openai.chat.completions");
    assert.deepEqual(req.upstream, { scheme: "http", host: `127.0.0.1:${upstreamPort}`, path: "/v1/chat/completions", has_query: false });
    assert.equal(req.request_parse.ok, true);
    assert.equal(req.request.model, "gpt-4o-2024-08-06");
    assert.equal(req.request.stream, true);
    assert.equal(req.request.message_count, 2);
    assert.equal(req.request.settings.temperature, 0.7);
    assert.equal(req.request.settings.max_tokens, 4096);
    assert.equal(req.request.response_format.json_schema.name, "outline_json");
    assert.equal(req.request.messages[1].content, "I want to build Tetris.");
    assert.ok(req.request.system.startsWith("You are ROPE"));
    assert.ok(req.request.system.includes("[redacted:OPENAI_API_KEY]"));
    assert.equal(req.headers.authorization, undefined);
    assert.equal(req.headers.cookie, undefined);
    assert.equal(req.headers["openai-organization"], undefined);
    assert.equal(req.headers["x-stainless-retry-count"], "0");
    assert.equal(req.sizes.request_bytes, Buffer.byteLength(JSON.stringify(REQUEST)));
    assert.ok(req.raw.request.includes("outline_json"));
    assert.equal(req.raw.request_truncated, false);
    assert.ok(!JSON.stringify(req).includes(SECRET), "no secret anywhere in the request event");
  });

  it("rebuilds the streamed answer and reports usage as unavailable", () => {
    const res = last("model.response");
    assert.ok(res, "a model.response event");
    assert.equal(res.callId, last("model.request").callId);
    assert.equal(res.status, 200);
    assert.equal(res.streamed, true);
    assert.equal(res.aborted, false);
    assert.equal(res.response.output.text, ANSWER);
    assert.deepEqual(JSON.parse(res.response.output.text).gameDoc.steps.length, 4);
    assert.equal(res.response.output.role, "assistant");
    assert.equal(res.response.finish_reason, "stop");
    assert.equal(res.response.model, "gpt-4o-2024-08-06");
    assert.equal(res.response.id, "chatcmpl-AbC123XyZ");
    assert.equal(res.response.usage, null);
    assert.equal(res.response.usage_available, false);
    assert.equal(res.response.complete, true);
    assert.equal(res.response.chunks, SSE.split("\n\n").filter(Boolean).length);
    assert.deepEqual(res.response.parse_errors, []);
    assert.equal(res.headers["x-request-id"], "req_fixture_1");
    assert.equal(typeof res.latency_ms, "number");
    assert.ok(res.ttfb_ms <= res.ttft_ms && res.ttft_ms <= res.latency_ms, "ttfb ≤ ttft ≤ latency");
    assert.equal(res.raw.response, SSE);
    assert.equal(res.sizes.response_bytes, Buffer.byteLength(SSE));
  });

  it("handles a non-streamed answer, with usage when the provider sends it", async () => {
    events.length = 0;
    const response = await call({ ...REQUEST, stream: false });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.choices[0].message.content, ANSWER);
    const res = last("model.response");
    assert.equal(res.streamed, false);
    assert.equal(res.response.output.text, ANSWER);
    assert.deepEqual(res.response.usage, { prompt_tokens: 120, completion_tokens: 95, total_tokens: 215 });
    assert.equal(res.response.usage_available, true);
    assert.equal(res.response.chunks, null);
  });

  it("reads through a compressed response while passing the compressed bytes on", async () => {
    events.length = 0;
    const response = await fetch(url("/v1/chat/completions?gzip=1"), {
      method: "POST", body: JSON.stringify({ ...REQUEST, stream: false }),
      headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}`, "accept-encoding": "gzip" },
    });
    assert.equal(response.headers.get("content-encoding"), "gzip");
    const body = await response.json();
    assert.equal(body.choices[0].message.content, ANSWER);
    const res = await waitFor(() => last("model.response"));
    assert.ok(res, "a model.response event after the decoder flushes");
    assert.equal(res.response.output.text, ANSWER);
    assert.equal(res.raw.encoding, "gzip");
    assert.ok(res.sizes.response_bytes < res.sizes.decoded_bytes);
    assert.deepEqual(last("model.request").upstream, { scheme: "http", host: `127.0.0.1:${upstreamPort}`, path: "/v1/chat/completions", has_query: true });
  });

  it("records a provider error without the credential the provider echoed", async () => {
    events.length = 0;
    const response = await call(REQUEST, { authorization: "Bearer bad" });
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.error.code, "invalid_api_key", "the application still sees the provider's own error");
    const err = last("model.error");
    assert.ok(err);
    assert.equal(err.status, 401);
    assert.equal(err.phase, "upstream");
    assert.equal(err.error.code, "invalid_api_key");
    assert.equal(err.error.type, "invalid_request_error");
    assert.ok(err.error.message.includes("[redacted:OPENAI_API_KEY]"));
    assert.ok(!JSON.stringify(events).includes(SECRET));
    assert.equal(eventsOf("model.response").length, 0);
  });

  it("passes other calls to an allowed host through and records them as unclaimed", async () => {
    events.length = 0;
    const response = await fetch(url("/v1/models"), { headers: { authorization: `Bearer ${SECRET}` } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data[0].id, "gpt-4o-2024-08-06");
    const req = last("model.request");
    assert.equal(req.provider, null);
    assert.equal(req.request, null);
    assert.equal(req.request_parse.reason, "no_provider");
    assert.equal(last("model.response").response, null);
  });

  it("refuses a wrong token without touching the upstream", async () => {
    events.length = 0;
    const before = upstream.seen.length;
    const response = await fetch(url("/v1/chat/completions", { token: "tok_wrong_0123456789" }), { method: "POST", body: "{}" });
    assert.equal(response.status, 404);
    assert.equal(upstream.seen.length, before);
    assert.equal(last("gateway.rejected").reason, "bad_token");
    assert.ok(!JSON.stringify(events).includes("tok_wrong"), "the guessed token is not echoed");
  });

  it("refuses an upstream host that is not on the allowlist", async () => {
    events.length = 0;
    const response = await fetch(url("/v1/chat/completions", { host: "evil.example.com", scheme: "https" }), { method: "POST", body: "{}" });
    assert.equal(response.status, 403);
    assert.deepEqual([last("gateway.rejected").reason, last("gateway.rejected").host], ["upstream_not_allowed", "evil.example.com"]);
  });

  it("answers 502 and records a connect error when the upstream is down", async () => {
    events.length = 0;
    const response = await fetch(url("/v1/chat/completions", { host: "127.0.0.1:1" }), { method: "POST", body: JSON.stringify(REQUEST), headers: { "content-type": "application/json" } });
    assert.equal(response.status, 502);
    assert.match(await response.text(), /not reachable/);
    const err = last("model.error");
    assert.equal(err.phase, "connect");
    assert.equal(err.status, null);
    assert.equal(err.callId, last("model.request").callId);
  });

  it("records a client that gives up mid-stream as aborted", async () => {
    events.length = 0;
    const controller = new AbortController();
    const response = await call(REQUEST, { "x-test": "abort" });
    const reader = response.body.getReader();
    await reader.read();
    controller.abort();
    await reader.cancel();
    const err = await waitFor(() => last("model.error"));
    assert.ok(err, "a model.error event");
    assert.equal(err.phase, "client");
    assert.equal(err.aborted, true);
    assert.equal(err.error.type, "client_closed");
    assert.equal(eventsOf("model.response").length, 0);
  });

  it("serves a health check under the token", async () => {
    const response = await fetch(url("/health", { host: "gateway", scheme: "https" }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body, { ok: true, capture: "full", upstreams: [`127.0.0.1:${upstreamPort}`, "127.0.0.1:1"] });
  });
});

describe("model gateway in metadata capture", () => {
  const upstream = fixtureUpstream();
  const events = [];
  let gateway; let gatewayPort; let upstreamPort;
  before(async () => {
    upstreamPort = await upstream.listen();
    gateway = createGateway({ token: TOKEN, capture: "metadata", allowHttp: true, upstreamHosts: [`127.0.0.1:${upstreamPort}`], emit: (kind, fields) => events.push({ kind, ...fields }) });
    gatewayPort = (await gateway.listen(0)).port;
  });
  after(async () => { await gateway.close(); upstream.server.close(); });

  it("keeps shape and settings but no prompt or answer text", async () => {
    const response = await fetch(`http://127.0.0.1:${gatewayPort}/t/${TOKEN}/http/127.0.0.1:${upstreamPort}/v1/chat/completions`, {
      method: "POST", body: JSON.stringify(REQUEST), headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}` },
    });
    assert.equal(await response.text(), SSE);
    const req = events.find((e) => e.kind === "model.request");
    const res = events.find((e) => e.kind === "model.response");
    assert.equal(req.capture, "metadata");
    assert.equal(req.request.model, "gpt-4o-2024-08-06");
    assert.deepEqual(req.request.settings, { max_tokens: 4096, temperature: 0.7 });
    assert.deepEqual(req.request.response_format, { type: "json_schema", schema_name: "outline_json", strict: true });
    assert.deepEqual(req.request.system, { chars: REQUEST.messages[0].content.length });
    assert.deepEqual(req.request.messages.map((m) => m.role), ["system", "user"]);
    assert.equal(req.request.messages[1].content, undefined);
    assert.equal(req.raw, undefined);
    assert.equal(res.raw, undefined);
    assert.deepEqual(res.response.output, { chars: ANSWER.length, refusal: false, tool_calls: [] });
    assert.equal(res.response.usage_available, false);
    const text = JSON.stringify(events);
    assert.ok(!text.includes("Tetris") && !text.includes(SECRET) && !text.includes("You are ROPE"));
  });
});

describe("model gateway as a process", () => {
  const root = path.resolve(here, "../..");
  const script = path.join(root, "sandbox/trace/model-gateway.mjs");

  it("announces itself on stdout as a trace line and on stderr with its prefix", async () => {
    const redactFile = path.join(here, "fixtures", `.redact-${process.pid}.json`);
    fs.writeFileSync(redactFile, JSON.stringify({ OPENAI_API_KEY: SECRET }));
    const child = spawn(process.execPath, [script], {
      env: { ...process.env, ENGELBART_TRACE_TOKEN: TOKEN, ENGELBART_MODEL_GATEWAY_PORT: "0", ENGELBART_TRACE_CAPTURE: "metadata", ENGELBART_MODEL_UPSTREAMS: "api.example.com", ENGELBART_REDACT_FILE: redactFile },
    });
    let out = ""; let err = "";
    child.stdout.on("data", (c) => { out += c; });
    child.stderr.on("data", (c) => { err += c; });
    const deadline = Date.now() + 5000;
    while (!out.includes("\n") && Date.now() < deadline) await sleep(20);
    child.kill("SIGTERM");
    await new Promise((r) => child.on("exit", r));
    const line = parseTraceLine(out.trim().split("\n")[0]);
    assert.ok(line, `a trace line on stdout, got: ${out}`);
    assert.equal(line.kind, "gateway.listening");
    assert.equal(line.source, "model-gateway");
    assert.equal(line.capture, "metadata");
    assert.ok(line.port > 0);
    assert.deepEqual(line.upstreams.slice(0, 2), ["api.example.com", "api.openai-proxy.com"]);
    assert.match(err, /^\[model-gateway\] redacting 1 value/m);
    assert.match(err, /^\[model-gateway\] listening on 127\.0\.0\.1:\d+ capture=metadata/m);
    assert.ok(!fs.existsSync(redactFile), "the redaction file is deleted once read");
    assert.ok(!(out + err).includes(TOKEN) && !(out + err).includes(SECRET));
  });

  it("refuses to start without a token", async () => {
    const child = spawn(process.execPath, [script], { env: { ...process.env, ENGELBART_TRACE_TOKEN: "" } });
    let err = "";
    child.stderr.on("data", (c) => { err += c; });
    const code = await new Promise((r) => child.on("exit", r));
    assert.equal(code, 2);
    assert.match(err, /ENGELBART_TRACE_TOKEN is required/);
  });
});
