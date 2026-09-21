// A stand-in artifact for the preload tests: it calls what it believes
// is its provider, one transport per run, and prints what came back.
// Nothing in here knows Engelbart exists, which is the point.
import http from "node:http";
import https from "node:https";

const target = process.env.PROBE_UPSTREAM;
const which = process.argv[2];
const body = JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content: `hello from ${which}` }] });
const streaming = JSON.stringify({ model: "gpt-4o", stream: true, messages: [{ role: "user", content: "stream" }] });
const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");

const collect = (res) => new Promise((resolve) => {
  let text = "";
  res.on("data", (c) => { text += c; });
  res.on("end", () => resolve({ status: res.statusCode, text }));
});

const run = {
  "http.request": () => new Promise((resolve, reject) => {
    const u = new URL(target + "/v1/chat/completions");
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer sk-probe-000000000000000000" } }, (res) => collect(res).then(resolve));
    req.on("error", reject);
    req.end(body);
  }),

  "http.request(url)": () => new Promise((resolve, reject) => {
    const req = http.request(target + "/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" } }, (res) => collect(res).then(resolve));
    req.on("error", reject);
    req.end(body);
  }),

  "http.get": () => new Promise((resolve, reject) => {
    const u = new URL(target + "/v1/models");
    const req = http.get({ hostname: u.hostname, port: u.port, path: u.pathname }, (res) => collect(res).then(resolve));
    req.on("error", reject);
  }),

  // Asked over https, to a host that is not one. The gateway is meant to
  // dial the scheme the route names and answer 502 when it cannot, and
  // the application is meant to get that answer rather than hang.
  "https-route": () => new Promise((resolve) => {
    const u = new URL(target.replace("http:", "https:") + "/v1/chat/completions");
    const req = https.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: "POST", headers: { "content-type": "application/json" } }, (res) => collect(res).then(resolve));
    req.on("error", (err) => resolve({ status: null, text: String(err.message) }));
    req.end(body);
  }),

  // A caller that configured TLS itself. Redirecting would drop what it
  // configured, so it must be left alone and reach the upstream direct.
  "https-with-tls-material": () => new Promise((resolve) => {
    const u = new URL(target + "/v1/chat/completions");
    const req = https.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: "POST", rejectUnauthorized: false, headers: { "content-type": "application/json" } }, (res) => collect(res).then(resolve));
    req.on("error", (err) => resolve({ status: null, text: String(err.message) }));
    req.end(body);
  }),

  fetch: async () => {
    const r = await fetch(target + "/v1/chat/completions", { method: "POST", body, headers: { "content-type": "application/json" } });
    return { status: r.status, text: await r.text() };
  },

  "fetch(Request)": async () => {
    const r = await fetch(new Request(target + "/v1/chat/completions", { method: "POST", body, headers: { "content-type": "application/json" } }));
    return { status: r.status, text: await r.text() };
  },

  "undici.request": async () => {
    const { request } = await import("undici");
    const r = await request(target + "/v1/chat/completions", { method: "POST", body, headers: { "content-type": "application/json" } });
    return { status: r.statusCode, text: await r.body.text() };
  },

  "undici.fetch": async () => {
    const { fetch: undiciFetch } = await import("undici");
    const r = await undiciFetch(target + "/v1/chat/completions", { method: "POST", body, headers: { "content-type": "application/json" } });
    return { status: r.status, text: await r.text() };
  },

  // The failure the audit called the worst available: a hook that is
  // replaced with no error and no missing-data signal.
  "dispatcher-replaced": async () => {
    const { Agent, setGlobalDispatcher } = await import("undici");
    setGlobalDispatcher(new Agent());
    const r = await fetch(target + "/v1/chat/completions", { method: "POST", body, headers: { "content-type": "application/json" } });
    return { status: r.status, text: await r.text() };
  },

  stream: async () => {
    const r = await fetch(target + "/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" }, body: streaming });
    const reader = r.body.getReader();
    let chunks = 0; let text = "";
    for (;;) { const { value, done } = await reader.read(); if (done) break; chunks += 1; text += Buffer.from(value).toString("utf8"); }
    return { status: r.status, chunks, text };
  },

  abort: async () => {
    const controller = new AbortController();
    const r = await fetch(target + "/v1/chat/completions", { method: "POST", signal: controller.signal, headers: { "content-type": "application/json" }, body: streaming });
    const reader = r.body.getReader();
    await reader.read();
    controller.abort();
    try { await reader.read(); } catch { /* the abort is the point */ }
    return { status: r.status, aborted: true };
  },

  // Something beside the application, on an address the run did not name
  // as a model endpoint: its own API route, its database, a sidecar.
  local: async () => {
    const r = await fetch(process.env.PROBE_LOCAL + "/internal", { method: "POST", body: "the application's own business" });
    return { status: r.status, text: await r.text() };
  },

  // The shape that breaks correlation by timing: a server action that
  // answers the browser and then does its work, so the model call is
  // made after the request it belongs to has already finished. ROPE
  // does exactly this.
  server: async () => {
    let done;
    const finished = new Promise((resolve) => { done = resolve; });
    const server = http.createServer((req, res) => {
      // Detached on purpose: nothing awaits this, and the response goes
      // out first.
      (async () => {
        try {
          const r = await fetch(target + "/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" }, body });
          await r.text();
          const second = await new Promise((resolve, reject) => {
            const u = new URL(target + "/v1/chat/completions");
            const sub = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: "POST", headers: { "content-type": "application/json" } }, (sr) => collect(sr).then(resolve));
            sub.on("error", reject);
            sub.end(body);
          });
          done({ second: second.status });
        } catch (err) { done({ error: String(err.message) }); }
      })();
      res.writeHead(202, { "content-type": "text/plain" });
      res.end("accepted");
    });
    const port = await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
    process.stdout.write(JSON.stringify({ ready: port }) + "\n");
    const result = await finished;
    server.close();
    return { status: 200, text: JSON.stringify(result) };
  },

  anthropic: async () => {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: "sk-ant-probe-00000000000000000000", baseURL: target });
    const message = await client.messages.create({ model: "claude-opus-5", max_tokens: 16, messages: [{ role: "user", content: "hello" }] });
    return { status: 200, text: JSON.stringify(message) };
  },
};

// An application that hc has launched has bound a port, answered a
// health check and waited for a browser before anything asks it for a
// model call. This probe would otherwise make one in its first
// millisecond, which no real artifact does, and which is the one window
// where Engelbart deliberately stands aside rather than risk
// redirecting into a gateway it has not heard from.
if (!process.env.PROBE_NOW) await new Promise((resolve) => setTimeout(resolve, 100));

try { out({ ok: true, which, ...(await run[which]()) }); }
catch (err) { out({ ok: false, which, error: String((err && err.message) || err) }); }
// A web server, which is the only shape hc runs, is still alive a
// moment later. The preload's report to the gateway is deliberately
// unref'd so it can never hold a process open, so a probe that exited
// on the same tick would race it.
await new Promise((resolve) => setTimeout(resolve, 150));
