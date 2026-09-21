// hc's launch capability, exercised the way hc calls it.
//
// The capability exists so that watching an application's model calls
// never means editing the application. What has to hold is that the
// door opens only for the supervisor: the repository, its plan and any
// agent repairing it must not be able to name what runs inside the
// application, and a capability that cannot be delivered must cost the
// watching and never the run.
//
// The module is Python and lives in sandbox/hc/, from where the template
// build copies it into hc's own package. It is driven here through
// python3 rather than reimplemented, so this tests the file that ships.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const module_ = path.resolve(here, "../../sandbox/hc/project_instrumentation.py");
// Resolved, because hc resolves the preload it was given: on macOS
// /var is a symlink and the delivered path is the real one.
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "hc-capability-")));
const repo = path.join(root, "repo");
const preload = path.join(root, "preload.cjs");
const MARKERS = JSON.stringify({ ENGELBART_MODEL_CAPTURE: "http://127.0.0.1:43200/t/tok_abc" });

// One call into resolve(), with the environment hc would have.
function resolve({ capabilities = ["modelCapture"], argv = ["npm", "run", "dev"], env = {}, environ = {}, repositoryRoot = repo } = {}) {
  const script = `
import json, sys
sys.path.insert(0, ${JSON.stringify(path.dirname(module_))})
import project_instrumentation as I
extra, state, detail = I.resolve(set(json.loads(sys.argv[1])), sys.argv[2], argv=json.loads(sys.argv[3]),
                                 command=" ".join(json.loads(sys.argv[3])), env=json.loads(sys.argv[4]), environ=json.loads(sys.argv[5]))
print(json.dumps({"env": extra, "state": state, "detail": detail}))
`;
  const out = execFileSync("python3", ["-c", script, JSON.stringify(capabilities), repositoryRoot, JSON.stringify(argv), JSON.stringify(env), JSON.stringify(environ)], { encoding: "utf8" });
  return JSON.parse(out);
}

const configured = (over = {}) => ({ HC_NODE_PRELOAD: preload, HC_LAUNCH_MARKERS: MARKERS, ...over });

describe("hc's model-capture launch capability", () => {
  before(() => {
    fs.mkdirSync(repo, { recursive: true });
    fs.writeFileSync(preload, "// a preload\n");
  });

  it("delivers exactly one preload, and the marker that authorises it", () => {
    const { env, state, detail } = resolve({ environ: configured() });
    assert.equal(state, "available");
    assert.equal(detail, preload);
    assert.equal(env.NODE_OPTIONS, `--require=${preload}`);
    assert.equal((env.NODE_OPTIONS.match(/--require/g) ?? []).length, 1, "Next does not survive two");
    assert.equal(env.ENGELBART_MODEL_CAPTURE, "http://127.0.0.1:43200/t/tok_abc");
  });

  it("keeps a Node option the project set, beside its own", () => {
    const { env, state } = resolve({ environ: configured(), env: { NODE_OPTIONS: "--max-old-space-size=4096" } });
    assert.equal(state, "available");
    assert.equal(env.NODE_OPTIONS, `--require=${preload} --max-old-space-size=4096`);
  });

  it("stands aside rather than add a second preload to one the project has", () => {
    for (const existing of ["--require=./instrument.js", "--import ./register.mjs"]) {
      const { env, state, detail } = resolve({ environ: configured(), env: { NODE_OPTIONS: existing } });
      assert.equal(state, "unsupported_launcher", existing);
      assert.deepEqual(env, {}, "nothing is set, so what the project asked for is what it gets");
      assert.match(detail, /already sets a Node preload/);
    }
  });

  it("does nothing at all when the run did not ask", () => {
    const { env, state } = resolve({ capabilities: [], environ: configured() });
    assert.equal(state, "unavailable");
    assert.deepEqual(env, {});
  });

  it("does nothing when the supervisor configured no preload", () => {
    const { state, detail } = resolve({ environ: {} });
    assert.equal(state, "unavailable");
    assert.match(detail, /no preload is configured/);
  });

  // The one thing this door exists to prevent. A preload is arbitrary
  // code in the application's own process, so the application must
  // never be able to be the thing that names it.
  it("refuses a preload that lives inside the repository being run", () => {
    const inside = path.join(repo, "sneak.cjs");
    fs.writeFileSync(inside, "// not ours\n");
    const { env, state, detail } = resolve({ environ: configured({ HC_NODE_PRELOAD: inside }) });
    assert.equal(state, "instrumentation_failed");
    assert.deepEqual(env, {});
    assert.match(detail, /inside the repository/);
  });

  it("refuses a preload that is not a plain absolute path to a real file", () => {
    for (const bad of ["trace/preload.cjs", path.join(root, "missing.cjs"), `${preload} --eval x`, root]) {
      const { env, state } = resolve({ environ: configured({ HC_NODE_PRELOAD: bad }) });
      assert.equal(state, "instrumentation_failed", bad);
      assert.deepEqual(env, {});
    }
  });

  // A preload delivered without the marker it waits for can never wake
  // up, and an application that was never watched looks exactly like one
  // that made no model calls. Better to say so.
  it("refuses to deliver a preload whose marker is unusable", () => {
    for (const bad of ["not json", "[]", JSON.stringify({ "lower case": "x" }), JSON.stringify({ A: "two\nlines" }), JSON.stringify({ A: "1", B: "2", C: "3", D: "4", E: "5" })]) {
      const { env, state } = resolve({ environ: configured({ HC_LAUNCH_MARKERS: bad }) });
      assert.equal(state, "instrumentation_failed", bad);
      assert.deepEqual(env, {});
    }
  });

  it("says which launchers it cannot reach instead of guessing", () => {
    const cases = [["bun", ["bun", "run", "dev"]], ["docker", ["docker", "compose", "up"]], ["python3", ["python3", "-m", "uvicorn", "app:api"]], ["bash", ["bash", "start.sh"]], ["deno", ["deno", "task", "start"]], ["hc-static", ["hc-static"]]];
    for (const [name, argv] of cases) {
      const { env, state, detail } = resolve({ argv, environ: configured() });
      assert.equal(state, "unsupported_launcher", name);
      assert.deepEqual(env, {}, `${name} is launched exactly as it would have been`);
      assert.match(detail, new RegExp(name));
    }
  });

  it("reaches the Node launchers a plan actually uses", () => {
    for (const argv of [["npm", "run", "dev"], ["node", "server.js"], ["npx", "next", "start"], ["yarn", "dev"], ["pnpm", "start"], ["/usr/bin/node", "index.js"], ["next", "dev"]]) {
      const { state } = resolve({ argv, environ: configured() });
      assert.equal(state, "available", argv.join(" "));
    }
  });

  it("hides the marker's value on the way to a log", () => {
    const script = `
import json, sys
sys.path.insert(0, ${JSON.stringify(path.dirname(module_))})
import project_instrumentation as I
print(I.mask("started with ENGELBART_MODEL_CAPTURE=http://127.0.0.1:43200/t/tok_abc set", environ=json.loads(sys.argv[1])))
`;
    const out = execFileSync("python3", ["-c", script, JSON.stringify(configured())], { encoding: "utf8" });
    assert.ok(!out.includes("tok_abc"), "a run token an application echoed does not reach the trail");
    assert.match(out, /\[redacted\]/);
  });
});
