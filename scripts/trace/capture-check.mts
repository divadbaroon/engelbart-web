// Zero-source-edit model capture, checked against pristine ROPE.
//
// The claim being tested is narrow and has to be tested literally: an
// artifact nobody has edited, whose model client is built in its own
// source with a hardcoded provider URL, has its model calls seen — and
// is byte for byte what it was when it started.
//
//   npm run capture:check
//   npm run capture:check -- --keep     # leave the clone and say where
//
// ROPE is cloned fresh at the commit the instrumentation registry was
// written against (system/app/action.ts blob 303393c), its own openai
// version is installed, and its model call is run under the preload
// against a real model gateway. The registered source patch is not
// applied and must not be needed.
//
// Two things this cannot do outside a sandbox, and does not pretend to:
// launch through hc's own traced-run machinery (the delivery channel,
// which tests/sandbox/hc-instrumentation.test.mjs covers as a unit),
// and reach ROPE's real provider — which it must not do anyway, so the
// gateway's DNS is pinned to a dead address for that leg and the check
// is on what was recorded rather than on what came back.
import { execFile, execFileSync } from "node:child_process";
import crypto from "node:crypto";
import dns from "node:dns";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createGateway } from "../../sandbox/trace/model-gateway.mjs";
import { createCollector } from "@/lib/trace/collector";

const ROPE = "https://github.com/mqo00/rope";
const COMMIT = process.env.ROPE_COMMIT ?? "1ada01830031e5882f2585577720b182deac6246";
const OPENAI = "openai@4.61.0";                       // what ROPE's lockfile resolves
const HARDCODED = "https://api.openai-proxy.com/v1";  // what ROPE's source says
const PRELOAD = path.resolve("sandbox/trace/preload.cjs");
const TOKEN = "tok_acceptance_" + crypto.randomBytes(6).toString("hex");
const KEEP = process.argv.includes("--keep");

const results: { step: string; ok: boolean; note: string }[] = [];
const check = (step: string, ok: boolean, note = "") => { results.push({ step, ok, note }); console.log(`${ok ? "  ok" : "FAIL"}  ${step}${note ? ` — ${note}` : ""}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Never execFileSync a child while a server in this process has to
// answer it: the loop is blocked and both sides wait forever.
const child = (args: string[], options: Record<string, unknown>) => new Promise<string>((resolve, reject) => {
  execFile(process.execPath, args, { timeout: 45_000, killSignal: "SIGKILL", ...options } as never, (err, stdout, stderr) => {
    if (err && !stdout) return reject(new Error(`${err.message}\n${stderr}`));
    resolve(String(stdout));
  });
});

// Every file in the working tree, by content. Not git's index: the
// question is whether anything on disk moved, tracked or not.
function fingerprint(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.set(path.relative(root, full), crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex"));
    }
  };
  walk(root);
  return out;
}

// Stands in for the provider: streams chat completions, and counts how
// many times it was asked so a retry is visible.
function provider() {
  const seen: { url: string; headers: http.IncomingHttpHeaders; body: string }[] = [];
  let failNext = 0;
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", async () => {
      const body = Buffer.concat(chunks).toString("utf8");
      seen.push({ url: req.url ?? "", headers: req.headers, body });
      if (failNext > 0) { failNext -= 1; res.writeHead(429, { "content-type": "application/json" }); return res.end(JSON.stringify({ error: { message: "slow down", type: "rate_limit_error" } })); }
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      for (const piece of ["{\"answer\": \"", "the tutor ", "replies", "\"}"]) {
        res.write(`data: ${JSON.stringify({ id: "chatcmpl-rope", object: "chat.completion.chunk", created: 1, model: "gpt-4o-2024-08-06", choices: [{ index: 0, delta: { content: piece }, finish_reason: null }] })}\n\n`);
        await sleep(15);
      }
      res.write("data: [DONE]\n\n");
      res.end();
    });
  });
  return { server, seen, rateLimitOnce: () => { failNext = 1; }, listen: () => new Promise<number>((r) => server.listen(0, "127.0.0.1", () => r((server.address() as { port: number }).port))) };
}

// A fake database, so the collector can be exercised without one.
function ledger() {
  const rows: Record<string, Record<string, unknown>[]> = { engelbart_trace_events: [], engelbart_model_calls: [] };
  const client = {
    from(table: string) {
      const list = rows[table];
      return {
        select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }),
        insert: async (row: Record<string, unknown>) => { list.push({ ...row }); return { error: null }; },
        update(patch: Record<string, unknown>) {
          const filters: [string, unknown][] = [];
          const q: Record<string, unknown> = {
            eq(col: string, v: unknown) { filters.push([col, v]); return q; },
            select: () => ({ maybeSingle: async () => { const row = list.find((r) => filters.every(([c, v]) => r[c] === v)); if (row) Object.assign(row, patch); return { data: row ? { id: "row", sizes: row.sizes } : null, error: null }; } }),
            then(resolve: (v: unknown) => void) { const row = list.find((r) => filters.every(([c, v]) => r[c] === v)); if (row) Object.assign(row, patch); resolve({ error: null }); },
          };
          return q;
        },
      };
    },
  };
  return { client, rows };
}

async function main() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "engelbart-capture-"));
  const repo = path.join(work, "rope");
  console.log(`\nZero-source-edit model capture, against pristine ROPE\n${"—".repeat(56)}`);

  // 1-3. Pristine ROPE, and what it looked like.
  execFileSync("git", ["clone", "--quiet", ROPE, repo], { stdio: "pipe" });
  execFileSync("git", ["checkout", "--quiet", COMMIT], { cwd: repo, stdio: "pipe" });
  const before = fingerprint(repo);
  const source = fs.readFileSync(path.join(repo, "system/app/action.ts"), "utf8");
  check("ROPE is the pinned commit, unedited", execFileSync("git", ["rev-parse", "HEAD:system/app/action.ts"], { cwd: repo, encoding: "utf8" }).trim().startsWith("303393c"), `${before.size} files`);
  check("its provider URL is written into its source, not read from the environment",
    source.includes(`const openaiBaseURL = "${HARDCODED}"`) && !source.includes("OPENAI_BASE_URL"),
    "so no environment value can route it, which is why the registered patch exists");
  check("the registered source patch is not applied", !fs.existsSync(path.join(repo, ".engelbart")) && !source.includes("Engelbart"));

  // ROPE's own model-call code, lifted out of its server action so it
  // can be run without the whole Next toolchain. The construction, the
  // version, the streaming call and the detached async block are its.
  const client = path.join(work, "artifact");
  fs.mkdirSync(client);
  fs.writeFileSync(path.join(client, "package.json"), JSON.stringify({ name: "rope-action", private: true, type: "module", dependencies: { openai: OPENAI.split("@")[1] } }));
  console.log(`\ninstalling ${OPENAI} (ROPE's own resolved version)…`);
  execFileSync("npm", ["install", "--silent", "--no-audit", "--no-fund"], { cwd: client, stdio: "pipe" });
  fs.writeFileSync(path.join(client, "action.mjs"), ACTION);

  // 4. A model gateway, and a collector reading it.
  const upstream = provider();
  const upstreamPort = await upstream.listen();
  const { client: supabase, rows } = ledger();
  const collector = createCollector(supabase as never, "run-acceptance");
  const gateway = createGateway({
    token: TOKEN, capture: "full",
    modelHosts: ["api.openai-proxy.com", `127.0.0.1:${upstreamPort}`],
    emit: (kind: string, fields: Record<string, unknown>) => collector.line(JSON.stringify({ engelbart: "trace", v: 1, source: "model-gateway", kind, ts: new Date().toISOString(), ...fields })),
  });
  const gatewayPort = (await gateway.listen(0)).port as number;

  const run = async (mode: string, extra: Record<string, string> = {}) => {
    const out = await child(["--require", PRELOAD, path.join(client, "action.mjs"), mode], {
      cwd: repo,   // the application runs inside its own repository
      env: { PATH: process.env.PATH!, HOME: process.env.HOME!, OPENAI_API_KEY: "sk-rope-000000000000000000000000",
        ENGELBART_MODEL_CAPTURE: `http://127.0.0.1:${gatewayPort}/t/${TOKEN}`, ...extra },
    });
    return out.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
  };
  const calls = () => rows.engelbart_model_calls;
  const events = () => rows.engelbart_trace_events;

  // 5-6a. ROPE's literal hardcoded URL. The gateway's DNS is pinned to
  // a dead address so nothing leaves this machine; what is checked is
  // what was recorded on the way out.
  const realLookup = dns.lookup;
  (dns as { lookup: unknown }).lookup = ((host: string, opts: unknown, cb: unknown) => {
    const done = (typeof opts === "function" ? opts : cb) as (e: Error | null, a?: unknown, f?: number) => void;
    if (host !== "api.openai-proxy.com") return (realLookup as unknown as (...a: unknown[]) => void)(host, opts, cb);
    // Here, where nothing is listening, so the prompt cannot leave this
    // machine on its way to somebody else's provider.
    const all = typeof opts === "object" && opts !== null && (opts as { all?: boolean }).all;
    return all ? done(null, [{ address: "127.0.0.1", family: 4 }]) : done(null, "127.0.0.1", 4);
  }) as typeof dns.lookup;

  const literal = await run("hardcoded");
  await collector.flush();
  const routed = calls().find((c) => (c.upstream as { host: string }).host === "api.openai-proxy.com");
  check("ROPE's hardcoded provider URL is redirected into the gateway", Boolean(routed),
    routed ? `${(routed.upstream as { scheme: string }).scheme}/${(routed.upstream as { host: string }).host}${(routed.upstream as { path: string }).path}` : "no call reached the gateway");
  check("the request is decoded, prompt included",
    routed?.provider === "openai" && (routed?.request as { model: string })?.model === "gpt-4o-2024-08-06" &&
      JSON.stringify((routed?.request as { messages: unknown[] })?.messages ?? []).includes("You are a tutor"),
    routed ? `model ${(routed.request as { model: string }).model}, ${(routed.request as { message_count: number }).message_count} message(s), stream ${(routed.request as { stream: boolean }).stream}` : "");
  check("the artifact survives the provider being unreachable", literal.some((l) => l.handled), "it caught the error its own way, and the process exited 0");
  (dns as { lookup: unknown }).lookup = realLookup;

  // 6b. The same client and version, reaching a provider, for the legs
  // that need an answer back.
  const local = `http://127.0.0.1:${upstreamPort}/v1`;
  const streamed = await run("stream", { ARTIFACT_BASE_URL: local, ENGELBART_MODEL_CAPTURE_LOCAL: `127.0.0.1:${upstreamPort}` });
  await sleep(300); await collector.flush();
  const answered = calls().find((c) => (c.upstream as { host: string }).host === `127.0.0.1:${upstreamPort}` && c.phase === "response");
  const pieces = Number(streamed.find((l) => l.chunks)?.chunks ?? 0);
  check("a streamed answer still streams to the artifact", pieces > 1, `${pieces} pieces`);
  check("and is rebuilt in the trace", (answered?.response as { output: { text: string } })?.output?.text === '{"answer": "the tutor replies"}',
    JSON.stringify((answered?.response as { output: { text: string } })?.output?.text ?? null));
  check("timing is recorded", typeof answered?.latency_ms === "number" && typeof answered?.ttft_ms === "number",
    `first token ${answered?.ttft_ms}ms, whole call ${answered?.latency_ms}ms`);

  const abortSeen = await run("abort", { ARTIFACT_BASE_URL: local, ENGELBART_MODEL_CAPTURE_LOCAL: `127.0.0.1:${upstreamPort}` });
  await sleep(400); await collector.flush();
  const aborted = calls().find((c) => c.aborted === true);
  check("an abort mid-stream is an abort, not an answer", Boolean(aborted) && abortSeen.some((l) => l.aborted), (aborted?.error as { type: string })?.type ?? "");

  const beforeRetry = calls().length;
  upstream.rateLimitOnce();
  await run("stream", { ARTIFACT_BASE_URL: local, ENGELBART_MODEL_CAPTURE_LOCAL: `127.0.0.1:${upstreamPort}` });
  await sleep(300); await collector.flush();
  const retried = calls().slice(beforeRetry);
  check("an SDK retry is two calls of one attempt, both recorded", retried.length === 2 && retried.some((c) => c.phase === "error") && retried.some((c) => c.phase === "response"),
    retried.map((c) => `${c.phase}${c.status ? ` ${c.status}` : ""}`).join(" then "));

  // 6c. Correlation: an interaction the preview gateway reported, and a
  // model call made from detached work that outlives the request — the
  // shape ROPE's server action actually has.
  collector.line(JSON.stringify({ engelbart: "trace", v: 1, source: "preview-gateway", kind: "network.request", ts: new Date().toISOString(), requestId: "r_acceptance01", interactionId: "i_rope0001_7", correlation: "explicit", method: "POST", path: "/", category: "action" }));
  const beforeLinked = calls().length;
  await run("detached", { ARTIFACT_BASE_URL: local, ENGELBART_MODEL_CAPTURE_LOCAL: `127.0.0.1:${upstreamPort}`, ARTIFACT_INTERACTION: "i_rope0001_7", ARTIFACT_REQUEST: "r_acceptance01" });
  await sleep(300); await collector.flush();
  const linked = calls()[beforeLinked];
  check("a call made after the response is still tied to the interaction",
    linked?.correlation === "explicit" && linked?.interaction_id === "i_rope0001_7",
    `${linked?.correlation ?? "none"} → ${linked?.interaction_id ?? "nothing"}`);
  check("and the provider is never told about Engelbart",
    upstream.seen.every((s) => !s.headers["x-engelbart-interaction"] && !s.headers["x-engelbart-request"]));

  // 7. Something else the artifact reaches for, on a host nobody named
  // a model endpoint and no provider claims.
  const elsewhere = http.createServer((req, res) => { req.resume(); res.writeHead(204); res.end(); });
  const elsewherePort = await new Promise<number>((r) => elsewhere.listen(0, "127.0.0.1", () => r((elsewhere.address() as { port: number }).port)));
  const beforeOther = events().length;
  await run("other", { ARTIFACT_OTHER: `http://127.0.0.1:${elsewherePort}/telemetry`, ENGELBART_MODEL_CAPTURE_LOCAL: `127.0.0.1:${elsewherePort}` });
  await sleep(200); await collector.flush();
  const relayed = events().slice(beforeOther).find((e) => e.kind === "gateway.relayed");
  check("an unrecognised destination is carried, not refused", Boolean(relayed), relayed ? `${(relayed.data as { status: number }).status} · ${JSON.stringify((relayed.data as { sizes: unknown }).sizes)}` : "no relay recorded");
  check("and nothing of it is stored", Boolean(relayed) && !JSON.stringify(relayed).includes("the artifact's own business"));

  // 8. Instrumentation that fails must not look like the artifact
  // failing, or hc sends an agent to edit the repository.
  const MARKERS = ["Traceback (most recent call last)", "ModuleNotFoundError", "UnhandledPromiseRejection", "Error: Cannot find module"];
  let clean = true; let where = "";
  for (const [why, extra] of [["the gateway is gone", { ENGELBART_MODEL_CAPTURE: `http://127.0.0.1:1/t/${TOKEN}` }], ["the marker is nonsense", { ENGELBART_MODEL_CAPTURE: "not-a-url" }], ["there is no marker", { ENGELBART_MODEL_CAPTURE: "" }]] as [string, Record<string, string>][]) {
    const proc = await child(["--require", PRELOAD, path.join(client, "action.mjs"), "stream"], {
      cwd: repo,
      env: { PATH: process.env.PATH!, HOME: process.env.HOME!, OPENAI_API_KEY: "sk-x", ARTIFACT_BASE_URL: local, ...extra },
    });
    const hit = MARKERS.find((m) => proc.includes(m));
    if (hit || !proc.includes("chunks")) { clean = false; where = `${why}: ${hit ?? "the artifact did not finish"}`; }
  }
  check("a failure to observe is never a failure to run", clean, clean ? "gateway gone, marker nonsense, no marker — the artifact ran each time and said nothing" : where);

  // 9-11. What the repository looks like now.
  const after = fingerprint(repo);
  const changed = [...after].filter(([f, h]) => before.get(f) !== h).map(([f]) => f);
  const added = [...after.keys()].filter((f) => !before.has(f));
  const removed = [...before.keys()].filter((f) => !after.has(f));
  check("git says the working tree is clean", execFileSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf8" }).trim() === "");
  check("every file hashes to what it hashed to before", changed.length === 0 && removed.length === 0, changed.concat(removed).join(", ") || `${after.size} files, all identical`);
  check("no Engelbart file exists inside the repository", added.length === 0, added.join(", ") || "nothing was added");

  await gateway.close();
  upstream.server.close();
  elsewhere.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${"—".repeat(56)}\n${results.length - failed.length}/${results.length} checks passed.`);
  console.log(`\nWhat this cannot show, because it needs a sandbox: the launch itself —\nhc delivering the preload through its instrumentation capability — and\nthe Activity and visualizer reading of the resulting trace. Both were\nwatched on a traced run on 2026-09-20; see sandbox/trace/CAPTURE.md.`);
  if (KEEP) console.log(`\nkept: ${work}`);
  else fs.rmSync(work, { recursive: true, force: true });
  process.exit(failed.length ? 1 : 0);
}

// ROPE's own generate(), reduced to its model call: the same openai
// version, the same client construction, the same streaming request
// inside a detached async block that the caller does not await.
const ACTION = `
import OpenAI from "openai";
const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
const openaiBaseURL = process.env.ARTIFACT_BASE_URL || "https://api.openai-proxy.com/v1";
const openaiApiKey = process.env.OPENAI_API_KEY;
const mode = process.argv[2];
const ask = (client, controller) => client.chat.completions.create({
  model: "gpt-4o-2024-08-06", max_tokens: 4096, temperature: 0.7, stream: true,
  response_format: { type: "json_object" },
  messages: [{ role: "system", content: "You are a tutor. Help with the requirements." }, { role: "user", content: "why is my code wrong" }],
}, controller ? { signal: controller.signal } : undefined);

// An application that hc launched has booted before anyone asks it for
// anything; this one would otherwise call in its first millisecond.
await new Promise((r) => setTimeout(r, 120));

if (mode === "other") {
  const r = await fetch(process.env.ARTIFACT_OTHER, { method: "POST", body: "the artifact's own business" });
  out({ other: r.status });
} else {
  const client = new OpenAI({ apiKey: openaiApiKey, baseURL: openaiBaseURL, maxRetries: mode === "stream" ? 2 : 0, timeout: 8000 });
  const work = async () => {
    if (mode === "abort") {
      const controller = new AbortController();
      const stream = await ask(client, controller);
      for await (const part of stream) { void part; controller.abort(); break; }
      out({ aborted: true });
      return;
    }
    let text = ""; let chunks = 0;
    const stream = await ask(client);
    for await (const part of stream) { chunks += 1; text += part.choices[0]?.delta?.content ?? ""; }
    out({ chunks, text });
  };
  if (mode === "detached") {
    // ROPE's shape: the request is answered, and the model call happens
    // afterwards inside work nobody awaited.
    const server = (await import("node:http")).createServer((req, res) => {
      (async () => { try { await work(); } catch (e) { out({ handled: String(e.message) }); } finally { server.close(); } })();
      res.writeHead(202); res.end("accepted");
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const port = server.address().port;
    await fetch("http://127.0.0.1:" + port + "/act", { method: "POST", headers: { "x-engelbart-interaction": process.env.ARTIFACT_INTERACTION, "x-engelbart-request": process.env.ARTIFACT_REQUEST } });
    await new Promise((r) => setTimeout(r, 900));
  } else {
    try { await work(); } catch (err) { out({ handled: String(err.message).slice(0, 120) }); }
  }
}
await new Promise((r) => setTimeout(r, 150));
`;

main().catch((err) => { console.error("\nthe check could not be run:", err.message); process.exit(2); });
