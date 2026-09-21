// What zero-source-edit model capture actually reaches, measured.
//
//   npm run capture:coverage
//
// Each client is installed at a real version and run as its own process
// under the preload, against a real gateway. What is reported is what
// happened: whether the call was seen, and which of the three hooks
// carried it. Nothing here is asserted from reading the code.
//
// The claim this supports is not "universal interception". It is
// generic, zero-source-edit Node model-call interception for the launch
// and runtime paths listed as supported, and an honest list of the ones
// that are not.
import { execFile, execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createGateway } from "../../sandbox/trace/model-gateway.mjs";

const PRELOAD = path.resolve("sandbox/trace/preload.cjs");
const TOKEN = "tok_coverage_" + crypto.randomBytes(6).toString("hex");
const KEEP = process.argv.includes("--keep");
const NO_NEXT = process.argv.includes("--no-next");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice(7);

// name → [package spec, the script that uses it]. Aliased installs so
// two versions of one package can sit side by side.
const CLIENTS: [string, string, string][] = [
  ["OpenAI v4 (node-fetch)", "openaiv4@npm:openai@4.61.0", `
    const { default: OpenAI } = await import("openaiv4");
    const c = new OpenAI({ apiKey: KEY, baseURL: BASE, maxRetries: 0 });
    const r = await c.chat.completions.create({ model: "gpt-4o", messages: MESSAGES });
    say(r.choices[0].message.content);`],
  ["OpenAI v5 (global fetch)", "openaiv5@npm:openai@5.12.2", `
    const { default: OpenAI } = await import("openaiv5");
    const c = new OpenAI({ apiKey: KEY, baseURL: BASE, maxRetries: 0 });
    const r = await c.chat.completions.create({ model: "gpt-4o", messages: MESSAGES });
    say(r.choices[0].message.content);`],
  ["Anthropic SDK, current", "anthropicnew@npm:@anthropic-ai/sdk@0.127.0", `
    const { default: Anthropic } = await import("anthropicnew");
    const c = new Anthropic({ apiKey: KEY, baseURL: BASE, maxRetries: 0 });
    const m = await c.messages.create({ model: "claude-opus-5", max_tokens: 16, messages: [{ role: "user", content: "hello" }] });
    say(m.content[0].text);`],
  ["Anthropic SDK, node-fetch era", "anthropicold@npm:@anthropic-ai/sdk@0.27.3", `
    const { default: Anthropic } = await import("anthropicold");
    const c = new Anthropic({ apiKey: KEY, baseURL: BASE, maxRetries: 0 });
    const m = await c.messages.create({ model: "claude-3-opus-20240229", max_tokens: 16, messages: [{ role: "user", content: "hello" }] });
    say(m.content[0].text);`],
  ["axios, default adapter", "axios@1.7.7", `
    const { default: axios } = await import("axios");
    const r = await axios.post(BASE + "/chat/completions", { model: "gpt-4o", messages: MESSAGES });
    say(r.data.choices[0].message.content);`],
  ["axios, fetch adapter", "axios@1.7.7", `
    const { default: axios } = await import("axios");
    const r = await axios.post(BASE + "/chat/completions", { model: "gpt-4o", messages: MESSAGES }, { adapter: "fetch" });
    say(r.data.choices[0].message.content);`],
  ["raw http.request", "", `
    const https = await import("node:http");
    const u = new URL(BASE + "/chat/completions");
    const body = JSON.stringify({ model: "gpt-4o", messages: MESSAGES });
    const text = await new Promise((resolve, reject) => {
      const q = https.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: "POST", headers: { "content-type": "application/json" } }, (res) => {
        let t = ""; res.on("data", (c) => { t += c; }); res.on("end", () => resolve(t));
      });
      q.on("error", reject); q.end(body);
    });
    say(JSON.parse(text).choices[0].message.content);`],
  ["built-in fetch", "", `
    const r = await fetch(BASE + "/chat/completions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "gpt-4o", messages: MESSAGES }) });
    say((await r.json()).choices[0].message.content);`],
  ["undici, imported directly", "undici@6.19.8", `
    const { request } = await import("undici");
    const r = await request(BASE + "/chat/completions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "gpt-4o", messages: MESSAGES }) });
    say(JSON.parse(await r.body.text()).choices[0].message.content);`],
  ["a worker thread", "", `
    const { Worker } = await import("node:worker_threads");
    // A worker runs this file too, and so has its own short window
    // before it has heard back from the gateway. Next's route and
    // compiler workers boot well inside it; this one waits so it is
    // measuring capture rather than that window.
    const source = 'const {parentPort}=require("node:worker_threads");' +
      'setTimeout(()=>fetch(process.env.COVERAGE_BASE+"/chat/completions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({model:"gpt-4o",messages:[{role:"user",content:"from a worker"}]})})' +
      '.then(r=>r.json()).then(j=>parentPort.postMessage(j.choices[0].message.content)).catch(e=>parentPort.postMessage("ERR "+e.message)),200);';
    const worker = new Worker(source, { eval: true });
    say(await new Promise((resolve) => worker.on("message", resolve)));
    await worker.terminate();`],
];

type Result = { name: string; ran: boolean; seen: boolean; via: string[]; note: string };

// Which hook carried the model call, as opposed to which hooks the
// process has used for anything. Under `next dev` the framework makes
// its own outbound requests, so a realm's running total is not an
// answer. A realm re-reports the moment it carries something, and that
// report lands just before the gateway sees the call: the transport is
// what is new in the last report before it.
function transportOf(events: Record<string, unknown>[]): string[] {
  const upto = events.findIndex((e) => e.kind === "model.request");
  const seen = new Map<string, string[]>();
  let added: string[] = [];
  for (const e of events.slice(0, upto < 0 ? events.length : upto)) {
    if (e.kind !== "capability.modelCapture") continue;
    const realm = `${e.pid}:${e.thread}`;
    const used = (e.used as string[]) ?? [];
    const fresh = used.filter((u) => !(seen.get(realm) ?? []).includes(u));
    seen.set(realm, used);
    if (fresh.length) added = fresh;
  }
  return added;
}

// The launchers, which are a different question from the clients: not
// "does this transport get caught" but "does the preload survive the
// chain of processes between npm and the one that serves a request".
// A real Next application, built and run both ways.
const NEXT_APP: [string, string][] = [
  ["package.json", JSON.stringify({ name: "artifact", private: true, scripts: { dev: "next dev", build: "next build", start: "next start" }, dependencies: { next: "14.2.3", react: "18.3.1", "react-dom": "18.3.1", openai: "4.61.0" } }, null, 2)],
  ["next.config.mjs", "export default {};\n"],
  ["app/layout.js", "export default function Layout({ children }) { return (<html><body>{children}</body></html>); }\n"],
  ["app/page.js", "export default function Page() { return <main>artifact</main>; }\n"],
  // The model client is built here, with its URL in the source, the way
  // an artifact's is. Nothing in this file mentions Engelbart.
  ["app/api/ask/route.js", `
import OpenAI from "openai";
export const dynamic = "force-dynamic";
const client = new OpenAI({ apiKey: "sk-artifact-000000000000000000", baseURL: process.env.ARTIFACT_BASE_URL, maxRetries: 0 });
export async function GET() {
  const answer = await client.chat.completions.create({ model: "gpt-4o", messages: [{ role: "user", content: "hello from next" }] });
  return Response.json({ answer: answer.choices[0].message.content });
}
`],
];

async function nextCoverage(work: string, base: string, gatewayPort: number, upstreamPort: number, events: () => Record<string, unknown>[], reset: () => void): Promise<Result[]> {
  const app = path.join(work, "next-artifact");
  for (const [file, body] of NEXT_APP) {
    fs.mkdirSync(path.join(app, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(app, file), body);
  }
  console.log("installing a Next 14.2.3 application…");
  execFileSync("npm", ["install", "--silent", "--no-audit", "--no-fund"], { cwd: app, stdio: "pipe", timeout: 300_000 });

  const environment = (port: number) => ({
    PATH: process.env.PATH!, HOME: process.env.HOME!, PORT: String(port),
    ARTIFACT_BASE_URL: base,
    // Exactly what hc's instrumentation capability sets, and nothing else.
    NODE_OPTIONS: `--require=${PRELOAD}`,
    ENGELBART_MODEL_CAPTURE: `http://127.0.0.1:${gatewayPort}/t/${TOKEN}`,
    ENGELBART_MODEL_CAPTURE_LOCAL: `127.0.0.1:${upstreamPort}`,
  });

  // How many processes the launcher is running, sampled while it serves.
  // The number only means anything next to the same number without the
  // preload, which is why the control run below exists.
  const descendants = (root: number) => {
    const rows = execFileSync("ps", ["-eo", "pid=,ppid="]).toString().trim().split("\n").map((l) => l.trim().split(/\s+/).map(Number));
    const kids = new Map<number, number[]>();
    for (const [pid, ppid] of rows) kids.set(ppid, [...(kids.get(ppid) ?? []), pid]);
    const all: number[] = [];
    const walk = (p: number) => { for (const c of kids.get(p) ?? []) { all.push(c); walk(c); } };
    walk(root);
    return all.length + 1;
  };

  const serve = async (name: string, script: string, port: number, armed = true): Promise<Result & { peak: number }> => {
    reset();
    // Its own process group, because npm is not the server: killing the
    // parent alone leaves a dev server running, watching the directory
    // the next build is about to rewrite.
    const env = environment(port);
    if (!armed) { delete (env as Record<string, string>).NODE_OPTIONS; delete (env as Record<string, string>).ENGELBART_MODEL_CAPTURE; }
    const server = spawn("npm", ["run", script, "--", "--port", String(port)], { cwd: app, env, stdio: "pipe", detached: true });
    let peak = 0;
    const sampler = setInterval(() => { try { peak = Math.max(peak, descendants(server.pid!)); } catch { /* it is gone */ } }, 250);
    let output = "";
    server.stdout.on("data", (d) => { output += d; });
    server.stderr.on("data", (d) => { output += d; });
    let answered: string | null = null; let note = "";
    try {
      for (let i = 0; i < 240; i++) {
        await sleep(500);
        try {
          const r = await fetch(`http://127.0.0.1:${port}/api/ask`);
          if (r.ok) { answered = (await r.json()).answer; break; }
        } catch { /* not up yet */ }
        if (server.exitCode !== null) { note = `exited ${server.exitCode}: ${output.slice(-200).trim()}`; break; }
      }
      if (!answered && !note) note = `no answer in 120s: ${output.slice(-200).trim()}`;
      await sleep(400);
    } finally {
      clearInterval(sampler);
      const end = (signal: NodeJS.Signals) => { try { process.kill(-server.pid!, signal); } catch { server.kill(signal); } };
      end("SIGTERM");
      await sleep(800);
      end("SIGKILL");
      await sleep(200);
    }
    if (process.env.COVERAGE_DEBUG) for (const e of events()) console.log("   ", e.kind, JSON.stringify({ upstream: e.upstream, used: e.used, pid: e.pid, thread: e.thread, status: e.status, state: e.state }));
    // What the framework itself sent while it was up. None of it is a
    // model call, and the gateway carried all of it anyway.
    const other = events().filter((e) => e.kind === "gateway.relayed").length;
    // hc treats these in a service's output as the application having
    // crashed; Engelbart must never be the reason one appears.
    const marker = ["Traceback (most recent call last)", "ModuleNotFoundError", "UnhandledPromiseRejection", "Error: Cannot find module"].find((m) => output.includes(m));
    return {
      name, ran: answered === "answered", seen: events().some((e) => e.kind === "model.request"),
      via: transportOf(events()), peak,
      note: marker ? `printed "${marker}"` : note || (other ? `${other} framework request(s) relayed, none read as a model call` : ""),
    };
  };

  const dev = await serve("Next 14 dev (next dev)", "dev", 31731);
  // The build runs under the preload too, because hc's capability is set
  // for the whole stage and a build is the first thing it touches. It is
  // here as much to see that nothing breaks as to measure anything.
  console.log("building it…");
  execFileSync("npm", ["run", "build"], { cwd: app, env: environment(31732), stdio: "pipe", timeout: 300_000 });
  const started = await serve("Next 14 production (next start)", "start", 31732);
  // The same launcher again with nothing injected. Capture is allowed to
  // fail to see a call; it is not allowed to change the run.
  const control = await serve("control", "start", 31733, false);
  started.note ||= control.ran
    ? `${started.peak} processes, as without the preload (${control.peak}); the control saw no capture, as it should`
    : `control run did not answer: ${control.note}`;
  return [dev, started];
}

async function main() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "engelbart-coverage-"));
  const specs = [...new Set(CLIENTS.map(([, spec]) => spec).filter(Boolean))];
  console.log(`\nWhat the preload reaches\n${"—".repeat(64)}\ninstalling ${specs.length} clients…`);
  fs.writeFileSync(path.join(work, "package.json"), JSON.stringify({ name: "coverage", private: true, type: "module" }));
  execFileSync("npm", ["install", "--silent", "--no-audit", "--no-fund", ...specs], { cwd: work, stdio: "pipe" });

  const seen: { url: string }[] = [];
  const upstream = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      seen.push({ url: req.url ?? "" });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(/messages/.test(req.url ?? "")
        ? { id: "msg_1", type: "message", role: "assistant", model: "claude", content: [{ type: "text", text: "answered" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }
        : { id: "chatcmpl-1", object: "chat.completion", created: 1, model: "gpt-4o", choices: [{ index: 0, message: { role: "assistant", content: "answered" }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
    });
  });
  const upstreamPort = await new Promise<number>((r) => upstream.listen(0, "127.0.0.1", () => r((upstream.address() as { port: number }).port)));

  let events: Record<string, unknown>[] = [];
  const gateway = createGateway({
    token: TOKEN, capture: "full", modelHosts: [`127.0.0.1:${upstreamPort}`],
    emit: (kind: string, fields: Record<string, unknown>) => events.push({ kind, ...fields }),
  });
  const gatewayPort = (await gateway.listen(0)).port as number;
  const base = `http://127.0.0.1:${upstreamPort}/v1`;

  const results: Result[] = [];
  for (const [name, , body] of CLIENTS) {
    if (ONLY && !name.toLowerCase().includes(ONLY.toLowerCase())) continue;
    events = [];
    const file = path.join(work, `probe-${results.length}.mjs`);
    fs.writeFileSync(file, `
const say = (v) => process.stdout.write(JSON.stringify({ answer: v }) + "\\n");
const BASE = process.env.COVERAGE_BASE;
const KEY = "sk-coverage-0000000000000000000000";
const MESSAGES = [{ role: "user", content: "hello" }];
await new Promise((r) => setTimeout(r, 120));   // a booted application
try { ${body} } catch (err) { process.stdout.write(JSON.stringify({ error: String(err.message).slice(0, 140) }) + "\\n"); }
await new Promise((r) => setTimeout(r, 400));
`);
    const out = await new Promise<string>((resolve) => {
      execFile(process.execPath, [file], {
        cwd: work, timeout: 45_000, killSignal: "SIGKILL",
        env: { PATH: process.env.PATH!, HOME: process.env.HOME!, COVERAGE_BASE: base,
          // Exactly what hc's instrumentation capability sets.
          NODE_OPTIONS: `--require=${PRELOAD}`,
          ENGELBART_MODEL_CAPTURE: `http://127.0.0.1:${gatewayPort}/t/${TOKEN}`,
          ENGELBART_MODEL_CAPTURE_LOCAL: `127.0.0.1:${upstreamPort}` },
      }, (err, stdout, stderr) => resolve(stdout || `{"error":${JSON.stringify(String(err?.message ?? stderr).slice(0, 140))}}`));
    });
    await sleep(150);
    const lines = out.trim().split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return { error: l.slice(0, 120) }; } });
    const answered = lines.find((l) => l.answer === "answered");
    const call = events.find((e) => e.kind === "model.request");
    results.push({
      name, ran: Boolean(answered), seen: Boolean(call),
      via: transportOf(events),
      note: answered ? "" : String(lines.find((l) => l.error)?.error ?? "no answer"),
    });
  }

  if (!NO_NEXT && (!ONLY || "next".startsWith(ONLY.toLowerCase()))) {
    results.push(...await nextCoverage(work, base, gatewayPort, upstreamPort, () => events, () => { events = []; }));
  }

  await gateway.close();
  upstream.close();

  const width = Math.max(...results.map((r) => r.name.length));
  console.log(`\n${"client".padEnd(width)}  ran  captured  via\n${"—".repeat(width + 28)}`);
  for (const r of results) {
    console.log(`${r.name.padEnd(width)}  ${r.ran ? " ok " : "FAIL"}  ${r.seen ? "  yes   " : "   no   "}  ${r.via.join(", ") || "—"}${r.note ? `  (${r.note})` : ""}`);
  }
  const covered = results.filter((r) => r.ran && r.seen).length;
  console.log(`\n${covered}/${results.length} run and captured.`);
  if (KEEP) console.log(`kept: ${work}`); else fs.rmSync(work, { recursive: true, force: true });
  process.exit(results.some((r) => !r.ran) ? 1 : 0);
}

main().catch((err) => { console.error("\nthe coverage run could not finish:", err.message); process.exit(2); });
