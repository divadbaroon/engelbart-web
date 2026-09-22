// The dependency install that starts with the clone.
//
// The runner starts it (lib/runtime/e2b.ts) the moment there is a
// repository to install from, a minute before the wrapper exists, and the
// wrapper then imports the same program to join what it started. So the
// lock, the status file and the three control scripts are the contract
// between three readers at three different times, and that is what is
// worth testing: not that a package manager works, but that a second
// install cannot start, that a person with a shell can ask and wait and
// cancel, and that waiting reports how it went.
//
// Driven through python3 against sandbox/prestart.py itself rather than
// reimplemented, so this tests the file that ships.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("the dependency install that starts with the clone", () => {
  const prestart = path.resolve(here, "../../sandbox/prestart.py");
  const make = (files) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "engelbart-install-"));
    for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(root, name), body);
    return root;
  };
  // The real program, run the way the runner runs it. The installs it
  // would start are replaced by putting a `sleep` and a `false` earlier on
  // PATH under the package managers' names, so this exercises the lock,
  // the controls and the status file without fetching anything.
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), "engelbart-bin-"));
  const shim = (name, body) => {
    const file = path.join(bin, name);
    fs.writeFileSync(file, `#!/bin/sh\n${body}\n`);
    fs.chmodSync(file, 0o755);
  };
  before(() => {
    shim("npm", "sleep 30");        // long enough to still be running when asked
    shim("pnpm", "exit 0");
    shim("uv", "echo installed; exit 0");
    shim("yarn", "exit 7");         // a failure, for the status that reports one
  });

  // --wait exits with the install's own status, so a failed install is a
  // non-zero exit here and not a broken call. That is the whole point of
  // install-wait.sh: `bash install-wait.sh && ...` has to mean what it
  // looks like it means.
  const call = (root, ...flags) => {
    let out;
    try {
      out = execFileSync("python3", [prestart, ...flags, root], {
        encoding: "utf8",
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, PYTHONDONTWRITEBYTECODE: "1" },
      });
    } catch (err) {
      if (err.stdout === undefined) throw err;
      out = err.stdout;
    }
    return JSON.parse(out.trim().split("\n").at(-1));
  };

  it("starts the one install the lockfile names", () => {
    assert.deepEqual(call(make({ "pnpm-lock.yaml": "" }), ).command, ["pnpm", "install", "--frozen-lockfile"]);
    assert.deepEqual(call(make({ "uv.lock": "" })).command, ["uv", "sync"]);
  });

  it("starts nothing when there is no lockfile, and says so", () => {
    const said = call(make({}));
    assert.equal(said.started, false);
    assert.match(said.reason, /no lockfile/);
  });

  it("starts nothing when two lockfiles disagree, and names them", () => {
    // Which one the repository means is a question, and a question
    // belongs to the pipeline that can read it.
    const said = call(make({ "package-lock.json": "", "pnpm-lock.yaml": "" }));
    assert.equal(said.started, false);
    assert.match(said.reason, /more than one lockfile: package-lock.json, pnpm-lock.yaml/);
  });

  it("refuses a second install while the first holds the lock", () => {
    const root = make({ "package-lock.json": "" });
    const first = call(root);
    assert.equal(first.started, true);
    // This is the part a sentence in a prompt cannot do.
    const second = call(root);
    assert.equal(second.started, false);
    assert.match(second.reason, /already running as pid/);
    assert.equal(second.pid, first.pid);
    assert.equal(call(root, "--status").status, "running");
    call(root, "--cancel");
  });

  it("writes the three controls as files that run", () => {
    const root = make({ "package-lock.json": "" });
    call(root);
    for (const name of ["install-status.sh", "install-wait.sh", "install-cancel.sh"]) {
      const file = path.join(root, ".engelbart", name);
      assert.ok(fs.existsSync(file), `${name} is missing`);
      assert.ok(fs.statSync(file).mode & 0o111, `${name} is not executable`);
    }
    const said = JSON.parse(execFileSync("bash", [path.join(root, ".engelbart", "install-status.sh")], { encoding: "utf8" }).trim());
    assert.equal(said.status, "running");
    call(root, "--cancel");
  });

  it("cancels on request and releases the lock", () => {
    const root = make({ "package-lock.json": "" });
    const first = call(root);
    assert.equal(call(root, "--cancel").status, "cancelled");
    assert.equal(fs.existsSync(path.join(root, ".engelbart", "install.lock")), false);
    // Released means released: a new one can now be started.
    const again = call(root);
    assert.equal(again.started, true);
    assert.notEqual(again.pid, first.pid);
    call(root, "--cancel");
  });

  it("waits for one that finishes, and reports how it went", () => {
    const ok = make({ "uv.lock": "" });
    call(ok);
    assert.equal(call(ok, "--wait").status, "done");
    assert.equal(call(ok, "--status").exitCode, 0);

    const bad = make({ "yarn.lock": "" });
    call(bad);
    const done = call(bad, "--wait");
    assert.equal(done.status, "failed");
    assert.equal(done.exitCode, 7);
  });

  it("makes install-wait.sh exit non-zero when the install failed", () => {
    // So that `bash install-wait.sh && npm run build` cannot carry on
    // over a dependency tree that was never installed.
    const root = make({ "yarn.lock": "" });
    call(root);
    const wait = path.join(root, ".engelbart", "install-wait.sh");
    assert.throws(() => execFileSync("bash", [wait], { encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } }));

    const ok = make({ "uv.lock": "" });
    call(ok);
    execFileSync("bash", [path.join(ok, ".engelbart", "install-wait.sh")], { encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
  });

  it("keeps what the install printed", () => {
    const root = make({ "uv.lock": "" });
    call(root);
    call(root, "--wait");
    assert.match(fs.readFileSync(path.join(root, ".engelbart", "install.log"), "utf8"), /installed/);
  });
});

describe("how long the install took", () => {
  // Read once while it runs and again after it is over. A duration that
  // keeps growing after the work is finished is not a duration, and a
  // benchmark built on it measures how late someone looked.
  const prestart = path.resolve(here, "../../sandbox/prestart.py");
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), "engelbart-clock-"));
  before(() => {
    fs.writeFileSync(path.join(bin, "uv"), "#!/bin/sh\nsleep 1\n");
    fs.chmodSync(path.join(bin, "uv"), 0o755);
  });
  const call = (root, ...flags) =>
    JSON.parse(execFileSync("python3", [prestart, ...flags, root], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, PYTHONDONTWRITEBYTECODE: "1" },
    }).trim().split("\n").at(-1));

  it("stops counting when the install ends", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "engelbart-clock-root-"));
    fs.writeFileSync(path.join(root, "uv.lock"), "");
    call(root);
    call(root, "--wait");
    const atTheEnd = call(root, "--status");
    assert.equal(atTheEnd.status, "done");
    assert.ok(atTheEnd.finishedAt > 0, "it records when it finished");
    await new Promise((done) => setTimeout(done, 2500));
    assert.equal(call(root, "--status").seconds, atTheEnd.seconds);
  });
});
