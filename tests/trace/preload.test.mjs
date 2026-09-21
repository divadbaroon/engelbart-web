// The preload, against real transports and a real gateway.
//
// What must hold, in order of how much it would cost to get wrong:
//
//  1. The artifact runs. Every transport gets the answer it would have
//     got, including when Engelbart cannot follow the call, and nothing
//     Engelbart says ever lands on the artifact's own output.
//  2. It only wakes where it belongs. No marker, no interception.
//  3. What it does catch arrives as a model call, decoded by the
//     gateway, with the prompt in it.
//  4. What it deliberately does not catch stays uncaught, and quietly:
//     an address beside the application, a caller that configured TLS,
//     a handshake.
//
// The probe (fixtures/preload-probe.mjs) is a stand-in artifact that
// knows nothing about any of this. It is run as a real child process
// with --require, the way hc runs one.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createGateway } from "../../sandbox/trace/model-gateway.mjs";
import { Redactor } from "../../sandbox/trace/common.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const PRELOAD = path.resolve(here, "../../sandbox/trace/preload.cjs");
const PROBE = path.resolve(here, "fixtures/preload-probe.mjs");
const root = path.resolve(here, "../..");
const TOKEN = "tok_preload_0123456789";
const KEY = "sk-probe-000000000000000000";

// Answers chat completions the way a provider does, streaming when asked.
function provider() {
  const seen = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
      const text = Buffer.concat(chunks).toString("utf8");
      seen.push({ method: req.method, url: req.url, headers: req.headers, body: text });
      if (req.url.startsWith("/v1/models")) {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ object: "list", data: [{ id: "gpt-4o" }] }));
      }
      if (req.url.startsWith("/v1/messages")) {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5", content: [{ type: "text", text: "answered" }], stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 2 } }));
      }
      let parsed = {};
      try { parsed = JSON.parse(text); } catch { /* the probe always sends JSON */ }
      if (parsed.stream) {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
        for (const part of ["one ", "two ", "three"]) {
          res.write(`data: ${JSON.stringify({ id: "chatcmpl-p", object: "chat.completion.chunk", created: 1, model: "gpt-4o", choices: [{ index: 0, delta: { content: part }, finish_reason: null }] })}\n\n`);
          await new Promise((r) => setTimeout(r, 20));
        }
        res.write("data: [DONE]\n\n");
        return res.end();
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "chatcmpl-p", object: "chat.completion", created: 1, model: "gpt-4o",
        choices: [{ index: 0, message: { role: "assistant", content: "answered" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 } }));
    });
  });
  return { server, seen, listen: () => new Promise((r) => server.listen(0, "127.0.0.1", () => r(server.address().port))) };
}

describe("the preload", () => {
  const upstream = provider();
  const beside = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => { res.writeHead(200, { "content-type": "text/plain" }); res.end("beside:" + Buffer.concat(chunks).toString("utf8")); });
  });
  let upstreamPort; let besidePort; let gateway; let gatewayPort;
  let events = [];

  // One probe run, as its own process, exactly as hc would launch it.
  const probe = (which, { marker = true, env = {} } = {}) => new Promise((resolve, reject) => {
    events = [];
    const child = execFile(process.execPath, ["--require", PRELOAD, PROBE, which], {
      cwd: root,
      env: {
        PATH: process.env.PATH, HOME: process.env.HOME,
        PROBE_UPSTREAM: `http://127.0.0.1:${upstreamPort}`,
        PROBE_LOCAL: `http://127.0.0.1:${besidePort}`,
        ENGELBART_MODEL_CAPTURE_LOCAL: `127.0.0.1:${upstreamPort}`,
        ...(marker ? { ENGELBART_MODEL_CAPTURE: `http://127.0.0.1:${gatewayPort}/t/${TOKEN}` } : {}),
        ...env,
      },
    }, (err, stdout, stderr) => {
      if (err && !stdout) return reject(new Error(`${which}: ${err.message}\n${stderr}`));
      const lines = stdout.trim().split("\n").filter(Boolean);
      resolve({ report: JSON.parse(lines[lines.length - 1]), stdout, stderr });
    });
    child.on("error", reject);
  });

  // The gateway's events for the last probe, once they have settled.
  const settle = async (ms = 400) => { await new Promise((r) => setTimeout(r, ms)); return events; };
  const of = (kind) => events.filter((e) => e.kind === kind);

  before(async () => {
    upstreamPort = await upstream.listen();
    besidePort = await new Promise((r) => beside.listen(0, "127.0.0.1", () => r(beside.address().port)));
    gateway = createGateway({
      token: TOKEN, capture: "full",
      modelHosts: [`127.0.0.1:${upstreamPort}`],
      redactor: new Redactor({ OPENAI_API_KEY: KEY }),
      emit: (kind, fields) => events.push({ kind, ...fields }),
    });
    gatewayPort = (await gateway.listen(0)).port;
  });
  after(async () => { await gateway.close(); upstream.server.close(); beside.close(); });

  describe("wakes only where it belongs", () => {
    it("does nothing at all without the marker", async () => {
      const { report, stdout, stderr } = await probe("fetch", { marker: false });
      assert.equal(report.status, 200);
      assert.equal(JSON.parse(report.text).choices[0].message.content, "answered");
      assert.equal(upstream.seen.at(-1).url, "/v1/chat/completions", "the provider saw the call arrive directly");
      await settle(200);
      assert.deepEqual(events, [], "the gateway saw nothing");
      assert.equal(stderr, "", "and nothing was said");
      assert.equal(stdout.trim().split("\n").length, 1, "only the probe's own line");
    });

    it("stays asleep in a process that belongs to Engelbart", async () => {
      const { report } = await probe("fetch", { env: { ENGELBART_TRACE_TOKEN: "pretend-this-is-a-gateway" } });
      assert.equal(report.status, 200);
      await settle(200);
      assert.equal(of("model.request").length, 0, "a gateway's own traffic is not the artifact's");
    });

    it("says it is watching, once, before the application runs", async () => {
      await probe("fetch");
      await settle();
      const said = of("capability.modelCapture");
      assert.ok(said.length >= 1, "the run is told whether it can be watched");
      assert.equal(said[0].state, "available");
      assert.match(said[0].runtime, /^node /);
      assert.ok(said.some((s) => s.state === "active"), "and told again once something was actually caught");
    });
  });

  describe("catches what an artifact's model client actually uses", () => {
    // The transport that matters most: openai v4 and every node-fetch
    // based SDK arrive at http.request and never touch globalThis.fetch.
    for (const which of ["http.request", "http.request(url)", "fetch", "fetch(Request)", "undici.request", "undici.fetch", "dispatcher-replaced"]) {
      it(`${which}: the answer is unchanged and the call is a model call`, async () => {
        const { report, stderr } = await probe(which);
        assert.equal(report.ok, true, report.error);
        assert.equal(report.status, 200);
        assert.equal(JSON.parse(report.text).choices[0].message.content, "answered", "byte for byte what the provider sent");
        assert.equal(stderr, "", "and the artifact's own output is untouched");
        await settle();
        const request = of("model.request").at(-1);
        assert.ok(request, `${which} reached the gateway`);
        assert.equal(request.provider, "openai");
        assert.equal(request.request.model, "gpt-4o");
        assert.equal(request.request.messages[0].content, `hello from ${which}`, "the prompt itself");
        assert.deepEqual(request.upstream, { scheme: "http", host: `127.0.0.1:${upstreamPort}`, path: "/v1/chat/completions", has_query: false });
        const response = of("model.response").at(-1);
        assert.equal(response.response.output.text, "answered");
        assert.equal(response.response.usage.total_tokens, 5);
      });
    }

    it("the provider receives exactly what the application sent", async () => {
      await probe("http.request");
      const seen = upstream.seen.at(-1);
      assert.equal(seen.headers.authorization, `Bearer ${KEY}`, "the credential still reaches the provider");
      assert.equal(seen.headers.host, `127.0.0.1:${upstreamPort}`, "addressed to the provider, not to the gateway");
      assert.equal(JSON.parse(seen.body).messages[0].content, "hello from http.request");
    });

    it("keeps a credential out of the trace all the same", async () => {
      await probe("http.request");
      await settle();
      assert.ok(!JSON.stringify(events).includes(KEY), "not in the events");
      const request = of("model.request").at(-1);
      assert.equal(request.headers.authorization, undefined);
      assert.equal(request.headers.cookie, undefined);
      assert.match(request.raw.request, /hello from http\.request/, "the prompt is kept");
    });

    it("a real SDK's client works and is decoded", async () => {
      const { report } = await probe("anthropic");
      assert.equal(report.ok, true, report.error);
      assert.equal(JSON.parse(report.text).content[0].text, "answered");
      await settle();
      // No provider module claims Anthropic's shape yet, so the gateway
      // carries it and says so rather than guessing at the schema.
      const request = of("model.request").at(-1);
      assert.equal(request.upstream.path, "/v1/messages");
      assert.equal(request.provider, null);
      assert.equal(request.request_parse.reason, "no_provider");
    });

    it("a stream still streams, in pieces", async () => {
      const { report } = await probe("stream");
      assert.equal(report.ok, true, report.error);
      assert.ok(report.chunks > 1, `arrived in ${report.chunks} pieces, not one`);
      for (const part of ["one ", "two ", "three"]) assert.ok(report.text.includes(part), `the stream carried ${part.trim()}`);
      await settle();
      const response = of("model.response").at(-1);
      assert.equal(response.streamed, true);
      assert.equal(response.response.output.text, "one two three");
    });

    it("an abort still aborts, and is recorded as one", async () => {
      const { report } = await probe("abort");
      assert.equal(report.ok, true, report.error);
      await settle(600);
      const error = of("model.error").at(-1);
      assert.ok(error, "the call ended as an error, not as an answer");
      assert.equal(error.aborted, true);
      assert.equal(error.error.type, "client_closed");
    });
  });

  // Timing says "a model call made while exactly one request was open
  // probably belongs to it". That is an association, and it is only
  // right while one request is open. The ids the browser and the
  // preview gateway already put on the request make it a link instead.
  describe("says which interaction a call belongs to, rather than leaving it to the clock", () => {
    const INTERACTION = "i_abc123_42";
    const REQUEST = "r_seenbythegateway";
    let child; let result;

    before(async () => {
      events = [];
      child = spawn(process.execPath, ["--require", PRELOAD, PROBE, "server"], {
        cwd: root,
        env: { PATH: process.env.PATH, HOME: process.env.HOME,
          PROBE_UPSTREAM: `http://127.0.0.1:${upstreamPort}`, PROBE_LOCAL: `http://127.0.0.1:${besidePort}`,
          ENGELBART_MODEL_CAPTURE_LOCAL: `127.0.0.1:${upstreamPort}`,
          ENGELBART_MODEL_CAPTURE: `http://127.0.0.1:${gatewayPort}/t/${TOKEN}` },
      });
      const lines = [];
      let buffer = "";
      child.stdout.on("data", (d) => {
        buffer += d;
        for (const line of buffer.split("\n").slice(0, -1)) lines.push(JSON.parse(line));
        buffer = buffer.slice(buffer.lastIndexOf("\n") + 1);
      });
      const until = async (test) => { for (let i = 0; i < 200; i++) { const hit = lines.find(test); if (hit) return hit; await new Promise((r) => setTimeout(r, 25)); } return null; };
      const ready = await until((l) => l.ready);
      assert.ok(ready, "the probe's server came up");
      // A browser interaction, as the preview gateway would pass it on.
      const answer = await fetch(`http://127.0.0.1:${ready.ready}/act`, { method: "POST", headers: { "x-engelbart-interaction": INTERACTION, "x-engelbart-request": REQUEST } });
      assert.equal(answer.status, 202, "the application answers before its work is done");
      result = await until((l) => l.which === "server");
      await new Promise((r) => setTimeout(r, 300));
    });
    after(() => { child.kill(); });

    it("does the detached work, both calls", () => {
      assert.ok(result, "the probe finished");
      assert.equal(JSON.parse(result.text).second, 200);
    });

    it("carries the interaction through work that outlives the request", () => {
      const calls = of("model.request");
      assert.equal(calls.length, 2, "both the fetch and the http.request, made after the response was sent");
      for (const call of calls) {
        assert.equal(call.correlation, "explicit", "known, not guessed");
        assert.equal(call.interactionId, INTERACTION);
        assert.equal(call.requestId, REQUEST);
      }
    });

    it("keeps the ids on the hop and off the provider", () => {
      for (const seen of upstream.seen.slice(-2)) {
        assert.equal(seen.headers["x-engelbart-interaction"], undefined, "the provider is not told about Engelbart");
        assert.equal(seen.headers["x-engelbart-request"], undefined);
      }
    });
  });

  // The invariant, tested as a failure rather than asserted as a
  // principle: the thing that watches must not be able to break the
  // thing it watches.
  describe("gets out of the way when it cannot do its job", () => {
    it("sends calls straight out when the gateway is not there", async () => {
      // Nothing is listening on this port. Redirecting into it would
      // turn every model call into a connection error.
      const dead = 1;
      const { report, stderr } = await probe("fetch", { env: { ENGELBART_MODEL_CAPTURE: `http://127.0.0.1:${dead}/t/${TOKEN}` } });
      assert.equal(report.ok, true, report.error);
      assert.equal(report.status, 200, "the application got its answer");
      assert.equal(JSON.parse(report.text).choices[0].message.content, "answered");
      assert.equal(stderr, "", "and was not told why");
    });

    it("lets a call made before the gateway answered go, and says it did", async () => {
      // Deliberate, and the trade is stated where it is made: until the
      // gateway has answered once, a call is worth more than the sight
      // of it. What must not happen is that the call quietly vanishes
      // from the account of the run.
      const { report } = await probe("fetch", { env: { PROBE_NOW: "1" } });
      assert.equal(report.status, 200, "the call went through");
      await settle();
      const missed = of("capability.modelCapture").find((s) => /unwatched/.test(s.detail ?? ""));
      if (of("model.request").length === 0) assert.ok(missed, `it went unwatched and was not accounted for: ${of("capability.modelCapture").map((s) => s.detail).join(" | ")}`);
    });

    it("keeps the artifact's output clean whatever happens", async () => {
      // hc reads certain lines in a service's output as the application
      // having crashed, and sends an agent to repair the repository.
      // Nothing Engelbart does may produce one.
      const markers = ["Traceback (most recent call last)", "ModuleNotFoundError", "UnhandledPromiseRejection", "Error: Cannot find module"];
      for (const which of ["fetch", "local", "https-with-tls-material", "https-route"]) {
        const { stdout, stderr } = await probe(which, { env: { ENGELBART_MODEL_CAPTURE: `http://127.0.0.1:1/t/${TOKEN}` } });
        for (const marker of markers) {
          assert.ok(!stdout.includes(marker) && !stderr.includes(marker), `${which} printed "${marker}"`);
        }
        assert.equal(stderr, "", `${which} said nothing on stderr`);
      }
    });
  });

  describe("leaves alone what it must", () => {
    it("an address beside the application is never redirected", async () => {
      const { report } = await probe("local");
      assert.equal(report.text, "beside:the application's own business");
      await settle();
      assert.equal(of("model.request").length, 0);
      assert.equal(of("gateway.relayed").length, 0, "the gateway never saw it at all");
    });

    it("a caller that configured TLS keeps the connection it configured", async () => {
      // It fails, because the upstream is not TLS. What matters is that
      // it fails the way it would have without Engelbart, rather than
      // being quietly downgraded to a plaintext hop.
      const { report } = await probe("https-with-tls-material");
      assert.equal(report.status, null);
      await settle();
      assert.equal(of("model.request").length, 0, "not carried, and not silently made to work");
    });

    it("an https destination is dialled as https, and its failure reaches the application", async () => {
      const { report } = await probe("https-route");
      await settle();
      const request = of("model.request").at(-1);
      assert.equal(request.upstream.scheme, "https", "the gateway dials the scheme the application meant");
      assert.equal(report.status, 502, "and the application is answered rather than left hanging");
      assert.equal(of("model.error").at(-1).phase, "connect");
    });

    it("a request no provider claims still goes through", async () => {
      const { report } = await probe("http.get");
      assert.equal(report.status, 200);
      assert.equal(JSON.parse(report.text).data[0].id, "gpt-4o");
    });
  });
});
