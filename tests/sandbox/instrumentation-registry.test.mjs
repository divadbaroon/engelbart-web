// The registry of sandbox-only edits, and why it is empty.
//
// ROPE was the one artifact Engelbart edited in order to watch it: its
// server action writes the provider's base URL into the source, so no
// environment value could route its calls. Since model capture reaches
// an unmodified Node application through hc's preload, that edit is not
// needed, and it is gone. These hold the two halves of that: nothing is
// registered for ROPE any more, and the mechanism still works for an
// artifact the preload cannot reach.
//
// The proof that pristine ROPE no longer needs the edit is not here —
// it cannot be, since it takes a clone and a real model call. It is
// `npm run capture:check`, which runs ROPE's own generate() under the
// preload against a pristine clone at a pinned commit and checks that
// the repository is byte-for-byte unchanged afterwards.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const wrapper = path.resolve(here, "../../sandbox/hc_run.py");
const registry = path.resolve(here, "../../sandbox/instrumentation");

// instrument(repo), with the environment a traced launch gives it.
function instrument({ repo = "mqo00/rope", dir = registry, off = false } = {}) {
  const script = `
import json, os, sys
sys.path.insert(0, ${JSON.stringify(path.dirname(wrapper))})
os.environ["ENGELBART_TRACE"] = "1"
os.environ["ENGELBART_REPO"] = sys.argv[1]
os.environ["ENGELBART_MODEL_GATEWAY_URL"] = "http://127.0.0.1:43200/t/tok"
os.environ["ENGELBART_INSTRUMENTATION_DIR"] = sys.argv[2]
if sys.argv[3] == "off":
    os.environ["ENGELBART_INSTRUMENTATION"] = "off"
import hc_run
hc_run.INSTRUMENTATION_DIR = sys.argv[2]
hc_run.instrument("/nonexistent-repository")
`;
  const out = execFileSync("python3", ["-c", script, repo, dir, off ? "off" : "on"], { encoding: "utf8" });
  return out.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

describe("the registry of sandbox-only edits", () => {
  it("registers nothing at all", () => {
    const index = JSON.parse(fs.readFileSync(path.join(registry, "index.json"), "utf8"));
    assert.deepEqual(index, {}, `no artifact should need editing to be watched: ${Object.keys(index).join(", ")}`);
  });

  it("no longer edits ROPE, which is the artifact it existed for", () => {
    const [line] = instrument({ repo: "mqo00/rope" });
    assert.equal(line.phase, "instrument");
    assert.equal(line.status, "none");
    assert.equal(line.repo, "mqo00/rope");
  });

  it("keeps no diff file behind for it", () => {
    assert.deepEqual(fs.readdirSync(registry).sort(), ["README.md", "index.json"]);
  });

  it("still looks the artifact up, for one the preload cannot reach", () => {
    // The mechanism is not dead code: an artifact that is not Node, or
    // that will not take a preload, can still be registered. A
    // registered entry whose diff cannot be read is reported as a
    // failure, which is what proves the lookup happened.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "registry-"));
    fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify({ "someone/elsewhere": { diff: "absent.diff", why: "a runtime the preload cannot enter" } }));
    const [line] = instrument({ repo: "someone/elsewhere", dir });
    assert.equal(line.status, "failed");
    assert.match(line.reason, /diff could not be read/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("can be switched off for a run without being emptied", () => {
    // How an acceptance run asks "does the artifact still need this?"
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "registry-"));
    fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify({ "someone/elsewhere": { diff: "absent.diff", why: "a runtime the preload cannot enter" } }));
    const [line] = instrument({ repo: "someone/elsewhere", dir, off: true });
    assert.equal(line.status, "none");
    assert.match(line.reason, /switched off/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
