// What the wrapper says about the parts of an application its capture
// cannot enter.
//
// Next runs middleware, and any route that declares `runtime = "edge"`,
// outside Node. No preload reaches there, and this milestone does not
// try to. What it must not do is let that look like silence: a run
// where an edge route made the model call and a run where nobody asked
// a model anything would otherwise produce the same empty trace. So the
// wrapper looks for those declarations before launch and says the
// capability is partial.
//
// The scan is driven through python3, so this tests the file that ships.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

const here = path.dirname(fileURLToPath(import.meta.url));
const wrapper = path.resolve(here, "../../sandbox/hc_run.py");
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "hc-edge-")));

const write = (dir, files) => {
  for (const [rel, body] of Object.entries(files)) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  }
  return dir;
};

const tree = (name, files) => write(fs.mkdirSync(path.join(root, name), { recursive: true }) ?? path.join(root, name), files);

// edge_paths(root), as the wrapper calls it.
function scan(dir) {
  const script = `
import json, sys
sys.path.insert(0, ${JSON.stringify(path.dirname(wrapper))})
import hc_run
paths, stopped = hc_run.edge_paths(sys.argv[1])
print(json.dumps({"paths": paths, "stopped": stopped}))
`;
  return JSON.parse(execFileSync("python3", ["-c", script, dir], { encoding: "utf8" }));
}

// request_capture(root), with a gateway listening, as a launch does it.
// Asynchronously, because the gateway it reports to is this process:
// execFileSync would hold the event loop and the report would time out
// against a server that never got to answer.
async function requestCapture(dir, gateway, preload) {
  const script = `
import json, os, sys
sys.path.insert(0, ${JSON.stringify(path.dirname(wrapper))})
os.environ["ENGELBART_TRACE"] = "1"
os.environ["ENGELBART_MODEL_GATEWAY_URL"] = sys.argv[2]
os.environ["ENGELBART_PRELOAD"] = sys.argv[3]
import hc_run
hc_run.PRELOAD = sys.argv[3]
asked = hc_run.request_capture(sys.argv[1])
print(json.dumps({"asked": asked}))
`;
  const { stdout } = await run("python3", ["-c", script, dir, gateway, preload], { encoding: "utf8" });
  return stdout.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

describe("the parts of an application capture cannot enter", () => {
  before(() => {
    tree("next-edge", {
      "next.config.mjs": "export default {};\n",
      "middleware.ts": "export function middleware() {}\n",
      "app/api/tutor/route.ts": "export async function POST() { return Response.json({}); }\n",
      "app/api/stream/route.ts": 'export const runtime = "edge";\nexport async function POST() {}\n',
      "pages/api/legacy.js": "export const config = { runtime: 'edge' };\nexport default function h() {}\n",
      "node_modules/some-pkg/index.js": 'export const runtime = "edge";\n',
      ".next/server/compiled.js": 'export const runtime = "edge";\n',
    });
    tree("next-node", {
      "next.config.mjs": "export default {};\n",
      "app/api/tutor/route.ts": "export async function POST() { return Response.json({}); }\n",
      "app/page.tsx": "export default function Page() { return null; }\n",
      "lib/notes.ts": 'const note = "this route used to say runtime: edge";\n',
    });
    tree("not-an-app", {
      "src/middleware.ts": "export function middleware() {}\n",   // middleware of something else
      "index.js": "console.log('hello');\n",
    });
  });
  after(() => fs.rmSync(root, { recursive: true, force: true }));

  it("finds every declaration of a runtime the preload cannot enter", () => {
    const { paths, stopped } = scan(path.join(root, "next-edge"));
    assert.deepEqual(paths, ["app/api/stream/route.ts", "middleware.ts", "pages/api/legacy.js"]);
    assert.equal(stopped, false);
  });

  it("does not count what is only compiled or installed", () => {
    // The same declaration inside node_modules or .next says nothing
    // about this application's own routes, and both are large.
    const { paths } = scan(path.join(root, "next-edge"));
    assert.ok(!paths.some((p) => p.startsWith("node_modules/") || p.startsWith(".next/")), paths.join(", "));
  });

  it("says nothing about an application that is all Node", () => {
    // Including one whose source mentions the words in passing: a
    // wrong "partial" would teach people to ignore the state.
    assert.deepEqual(scan(path.join(root, "next-node")), { paths: [], stopped: false });
  });

  it("does not call a stray middleware file an edge path", () => {
    // Middleware is only Next's middleware where a Next application is.
    assert.deepEqual(scan(path.join(root, "not-an-app")), { paths: [], stopped: false });
  });

  it("reports the capability as partial, on the run and on the trace", async () => {
    const seen = [];
    const gateway = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => { body += c; });
      req.on("end", () => { seen.push({ url: req.url, body: JSON.parse(body || "{}") }); res.writeHead(204); res.end(); });
    });
    const port = await new Promise((r) => gateway.listen(0, "127.0.0.1", () => r(gateway.address().port)));
    const preload = path.join(root, "preload.cjs");
    fs.writeFileSync(preload, "// a preload\n");

    const lines = await requestCapture(path.join(root, "next-edge"), `http://127.0.0.1:${port}/t/tok_edge`, preload);
    gateway.close();

    const said = lines.find((l) => l.phase === "capability");
    assert.ok(said, `a capability line: ${JSON.stringify(lines)}`);
    assert.equal(said.state, "partial");
    assert.deepEqual(said.paths, ["app/api/stream/route.ts", "middleware.ts", "pages/api/legacy.js"]);
    assert.match(said.detail, /edge runtime/);

    assert.equal(seen.length, 1, "and the trace hears it too");
    assert.equal(seen[0].url, "/t/tok_edge/gateway/status");
    assert.equal(seen[0].body.state, "partial");
  });

  it("still asks for the capability, because the Node paths are still worth watching", async () => {
    // Partial is not a reason to stop watching what can be watched.
    const preload = path.join(root, "preload.cjs");
    const lines = await requestCapture(path.join(root, "next-edge"), "http://127.0.0.1:9/t/tok_gone", preload);
    const asked = lines.find((l) => "asked" in l);
    assert.deepEqual(asked.asked, { modelCapture: true });
  });

  it("says on the trace, not only in the log, when capture could not be installed at all", async () => {
    // The state that matters most: with no preload in the sandbox there
    // are no reports from any realm, so without this the trace would
    // hold nothing about capture and a run with no model calls would be
    // unreadable.
    const seen = [];
    const gateway = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => { body += c; });
      req.on("end", () => { seen.push(JSON.parse(body || "{}")); res.writeHead(204); res.end(); });
    });
    const port = await new Promise((r) => gateway.listen(0, "127.0.0.1", () => r(gateway.address().port)));
    const lines = await requestCapture(path.join(root, "next-node"), `http://127.0.0.1:${port}/t/tok_none`, path.join(root, "no-preload-here.cjs"));
    gateway.close();

    const said = lines.find((l) => l.phase === "capability");
    assert.equal(said.state, "instrumentation_failed");
    assert.match(said.detail, /is not in this sandbox/);
    assert.deepEqual(lines.find((l) => "asked" in l).asked, null, "and the capability is not asked for");
    assert.equal(seen.length, 1);
    assert.equal(seen[0].state, "instrumentation_failed");
  });

  it("and a gateway that does not answer costs the report, never the run", async () => {
    // The report is best effort; the run's own log still carries it.
    const preload = path.join(root, "preload.cjs");
    const lines = await requestCapture(path.join(root, "next-edge"), "http://127.0.0.1:9/t/tok_gone", preload);
    assert.ok(lines.some((l) => l.phase === "capability" && l.state === "partial"));
  });
});
