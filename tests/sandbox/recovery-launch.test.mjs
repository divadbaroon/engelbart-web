// The launch description, and what the wrapper will and will not perform.
//
// The recovery session hands back a launcher and its arguments instead of
// a shell script, and that is the whole reason the session can be watched
// at all: a named program can be given a Node preload, and `bash
// start.sh` cannot. So what matters here is not that the wrapper starts
// something — that needs a sandbox — but that it refuses the shapes which
// would quietly cost the run its trace or let a launch out of the
// repository.
//
// Driven through python3 against sandbox/hc_run.py itself rather than
// reimplemented, so this tests the file that ships. The wrapper imports
// hc only inside main(), so importing the module needs nothing installed.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const wrapper = path.resolve(here, "../../sandbox/hc_run.py");

// A home of its own. APP_ENV_FILE is $HOME/.engelbart-app-env.sh, read at
// import, and the wrapper now always writes it — so anything that drives
// recover() or setup_for_use() would otherwise leave a file in the home
// directory of whoever ran the tests. Set here rather than case by case,
// because it survives the importlib.reload some cases do.
const home = fs.mkdtempSync(path.join(os.tmpdir(), "engelbart-home-"));

// One python3 per case, with the wrapper's folder on the path. The script
// prints one JSON object; anything it writes before that is the wrapper's
// own event lines, which are ignored.
function run(script) {
  const out = execFileSync("python3", ["-c", script], {
    encoding: "utf8",
    env: { ...process.env, HOME: home, PYTHONPATH: path.dirname(wrapper), PYTHONDONTWRITEBYTECODE: "1" },
  });
  const lines = out.trim().split("\n").filter((l) => l.startsWith("{"));
  return JSON.parse(lines.at(-1));
}

const PRELUDE = "import json, hc_run as W\n";

describe("the launch description", () => {
  let schema;
  before(() => {
    schema = run(`${PRELUDE}print(json.dumps(W.LAUNCH_SCHEMA))`);
  });

  it("asks for a program and its arguments, not a command line", () => {
    const service = schema.properties.services.items;
    assert.deepEqual(service.required, ["name", "launcher", "args", "cwd", "port", "isEntry"]);
    assert.equal(service.properties.args.type, "array");
    assert.equal(service.properties.args.items.type, "string");
    // The description has to say so too: a model reading "args" as a
    // string is how a shell line gets back in.
    assert.match(service.properties.args.description, /already split/);
    assert.match(service.properties.launcher.description, /[Nn]ot a shell/);
  });

  it("offers only the blockers nothing in the sandbox can supply", () => {
    const { kinds } = run(`${PRELUDE}print(json.dumps({"kinds": list(W.HARD_BLOCKERS)}))`);
    assert.deepEqual(schema.properties.blocker.properties.kind.enum, kinds);
    assert.deepEqual(kinds, ["secret", "service", "hardware", "data"]);
  });
});

describe("a service's directory", () => {
  let root;
  before(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "engelbart-launch-"));
    fs.mkdirSync(path.join(root, "web"));
  });

  const cwd = (raw) =>
    run(`${PRELUDE}
try:
    print(json.dumps({"ok": True, "where": W.service_cwd(${JSON.stringify(root)}, ${JSON.stringify(raw)})}))
except ValueError as exc:
    print(json.dumps({"ok": False, "why": str(exc)}))`);

  it("takes the repository root and a directory inside it", () => {
    assert.equal(cwd(".").where, fs.realpathSync(root));
    assert.equal(cwd("web").where, fs.realpathSync(path.join(root, "web")));
  });

  it("refuses a directory outside the repository", () => {
    const escaped = cwd("../..");
    assert.equal(escaped.ok, false);
    assert.match(escaped.why, /outside the repository/);
  });

  it("refuses a directory that is not there", () => {
    const missing = cwd("api");
    assert.equal(missing.ok, false);
    assert.match(missing.why, /does not exist/);
  });
});

describe("which way a run recovers", () => {
  const variant = (value) =>
    run(`${PRELUDE}
import importlib, os
os.environ["HC_RECOVERY"] = ${JSON.stringify(value)}
print(json.dumps({"recovery": importlib.reload(W).RECOVERY}))`).recovery;

  it("is the ladder unless the run asked for a session", () => {
    assert.equal(variant("session"), "session");
    assert.equal(variant("ladder"), "ladder");
    assert.equal(variant(""), "ladder");
    // An old sandbox meeting a name it does not know still runs.
    assert.equal(variant("whatever-comes-next"), "ladder");
  });
});

describe("what the recovery session is told, and what it may not say", () => {
  it("makes a repository with nothing to serve answerable", () => {
    // Without it the only ending a library could reach was running out
    // of rounds and being reported as an application that did not start.
    const schema = run(`${PRELUDE}print(json.dumps(W.LAUNCH_SCHEMA))`);
    assert.ok(schema.required.includes("nothingToServe"));
    assert.match(schema.properties.nothingToServe.description, /library/);
  });

  it("tells it not to name a supplied value where a value goes", () => {
    const schema = run(`${PRELUDE}print(json.dumps(W.LAUNCH_SCHEMA))`);
    const env = schema.properties.services.items.properties.env.description;
    assert.match(env, /[Dd]o not put supplied values here/);
    assert.match(env, /already in the environment/);
  });
});

describe("the values the person supplied", () => {
  // They reach hc's own steps through hc. Everything the wrapper starts
  // itself — the setup rung's scripts, the recovery session's launch —
  // gets them from this process, or starts without them.
  it("reach a script the wrapper runs", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "engelbart-env-"));
    fs.writeFileSync(path.join(root, "s.sh"), 'echo "seen=$A_SUPPLIED_VALUE"\n');
    const said = run(`${PRELUDE}
W.SAVED_ENV["A_SUPPLIED_VALUE"] = "the-value"
ok, out = W.run_script(${JSON.stringify(path.join(root, "s.sh"))}, ${JSON.stringify(root)}, 30)
print(json.dumps({"ok": ok, "out": out}))`);
    assert.equal(said.ok, true);
    assert.equal(said.out, "seen=the-value");
  });
});

describe("the patch that is saved for next time", () => {
  it("leaves the harness's own folder out of it", () => {
    // .engelbart/ is written again from the recipe's own fields on a
    // replay, so a patch that also carries it cannot apply: git refuses
    // a new file that is already in the working directory, and the
    // replay — the whole point of saving a recipe — is lost.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "engelbart-diff-"));
    const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8" });
    git("init", "-q", ".");
    git("config", "user.email", "t@t");
    git("config", "user.name", "t");
    fs.writeFileSync(path.join(root, "app.js"), "start()\n");
    git("add", ".");
    git("commit", "-qm", "first");

    fs.writeFileSync(path.join(root, "app.js"), "start(port)\n");   // a real edit
    fs.mkdirSync(path.join(root, ".engelbart"));
    for (const name of [".gitignore", "install.json", "install-status.sh", "BRIEF.md"]) {
      fs.writeFileSync(path.join(root, ".engelbart", name), "written by the runner\n");
    }
    const said = run(`${PRELUDE}
diff, files, truncated = W.capture_diff(${JSON.stringify(root)})
print(json.dumps({"files": files, "mentions": ".engelbart" in diff}))`);
    assert.deepEqual(said.files, ["app.js"]);
    assert.equal(said.mentions, false);
  });
});

describe("what hc's planner is told about the install already going", () => {
  // The lock stops two installs running at once. It cannot stop hc
  // planning a second one for afterwards, and `npm ci` deletes
  // node_modules before it starts — so a plan that installs again throws
  // the head start away entirely. The hint is the only channel there is.
  const hint = (status) =>
    run(`${PRELUDE}
W.REPO = "/nowhere"
W.INSTALL.state = lambda root: json.loads(${JSON.stringify(JSON.stringify(status))})
print(json.dumps({"hint": W.install_hint()}))`).hint;

  it("says the dependencies are in hand while it is still running", () => {
    const said = hint({ status: "running", command: ["npm", "ci"] });
    assert.match(said, /ALREADY INSTALLING/);
    assert.match(said, /Do not plan that install again/);
  });

  it("says so after it finished", () => {
    assert.match(hint({ status: "done", command: ["npm", "ci"] }), /ALREADY INSTALLED/);
  });

  it("says what to do if it plans an install anyway", () => {
    // `npm ci` deletes node_modules before it starts, so a plan that
    // reaches for the clean install is a plan that throws the head start
    // away. The planner owns its own steps; this sentence is the only
    // channel into it.
    assert.match(hint({ status: "done", command: ["npm", "ci"] }), /npm install.*not.*npm ci/);
  });

  it("says nothing when the install failed or never ran", () => {
    // Then hc should install: a hint that claimed otherwise would leave
    // the repository with no dependencies at all.
    assert.equal(hint({ status: "failed", command: ["npm", "ci"], exitCode: 1 }), "");
    assert.equal(hint({ status: "none" }), "");
    assert.equal(hint({ status: "cancelled", command: ["npm", "ci"] }), "");
  });
});

describe("how the recovery session is allowed to end", () => {
  // recover() driven with a stand-in for the session, so the endings can
  // be read off directly. What matters is which of them count as a run a
  // person can use, because "usable" is what the workspace shows as
  // ready and what a benchmark counts as a success.
  const ending = (files, answer, brief) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "engelbart-end-"));
    fs.mkdirSync(path.join(root, ".engelbart"));
    for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(root, ".engelbart", name), body);
    return run(`${PRELUDE}
events = []
W.emit = lambda **e: events.append(e)
W.RECOVERY_ROUNDS = 1
W.BRIEF = json.loads(${JSON.stringify(JSON.stringify(brief))})
W.agent = lambda *a, **k: (json.loads(${JSON.stringify(JSON.stringify(answer))}), {"error": None, "cost": 0.01, "turns": 3, "seconds": 1, "model": "opus"})
got = W.recover(${JSON.stringify(root)}, "the pipeline could not start it")
said = next((e for e in events if e.get("phase") == "usable"), None)
print(json.dumps({"usable": got, "phases": [e.get("phase") + ":" + str(e.get("status") or "") for e in events],
                  "blocker": (said or {}).get("blocker")}))`);
  };

  const LIBRARY = { primaryApp: { path: "" }, nothingToServe: { value: true, reason: "a python package" } };
  const APP = { primaryApp: { path: "." }, nothingToServe: { value: false, reason: "" } };

  it("is usable for a library whose check passes and that says it has nothing to serve", () => {
    const said = ending({ "check.sh": "exit 0\n" }, { summary: "installed", check: "imports", nothingToServe: true }, LIBRARY);
    assert.equal(said.usable, true);
    assert.ok(said.phases.includes("usable:"), said.phases.join(" "));
    assert.equal(said.blocker, null);   // nothing is in its way; there was never an application
  });

  it("is not usable when the check it left does not pass", () => {
    // The old test was that a file named check.sh existed. A failing
    // check proves the opposite of what usable claims.
    const said = ending({ "check.sh": "exit 1\n" }, { summary: "installed", check: "imports", nothingToServe: true }, LIBRARY);
    assert.equal(said.usable, false);
    assert.ok(said.phases.includes("check:failed"), said.phases.join(" "));
    assert.ok(!said.phases.some((p) => p.startsWith("usable")), said.phases.join(" "));
  });

  it("is not usable when it left no check at all", () => {
    const said = ending({}, { summary: "installed", check: "", nothingToServe: true }, LIBRARY);
    assert.equal(said.usable, false);
  });

  it("does not call a repository the brief says is an application a clean library ending", () => {
    // One of the two is wrong. The run still ends usable — installed,
    // with a check that passes, is worth keeping — but as an
    // application that did not start, with that written down, not as a
    // library that was never meant to.
    const said = ending({ "check.sh": "exit 0\n" }, { summary: "installed", check: "imports", nothingToServe: true }, APP);
    assert.equal(said.usable, true);
    assert.equal(said.blocker.kind, "unknown");
    assert.match(said.blocker.what, /did not start/);
  });

  it("is usable for an application blocked by something the sandbox cannot supply", () => {
    const said = ending({ "check.sh": "exit 0\n" },
      { summary: "installed", check: "imports", nothingToServe: false, blocker: { kind: "secret", what: "an API key" } }, APP);
    assert.equal(said.usable, true);
    assert.ok(said.phases.includes("usable:"), said.phases.join(" "));
  });

  it("is not usable for a blocked application when no check was left", () => {
    // The blocker is the most common of the three endings and the one
    // where nothing was ever started, so the check is the only evidence
    // there is that the repository was set up at all.
    const said = ending({}, { summary: "installed", check: "", nothingToServe: false, blocker: { kind: "secret", what: "an API key" } }, APP);
    assert.equal(said.usable, false);
  });

  it("is not usable for a blocked application when the check it left fails", () => {
    const said = ending({ "check.sh": "exit 1\n" },
      { summary: "installed", check: "imports", nothingToServe: false, blocker: { kind: "secret", what: "an API key" } }, APP);
    assert.equal(said.usable, false);
  });
});

describe("what an agent with a shell is given", () => {
  // The values reach hc's own plan steps through hc. An agent session
  // runs its builds and tests in this process's environment, so without
  // them it proves the application works against a configuration the
  // application will never see — or, more often, cannot build at all.
  const env = (tools) =>
    run(`${PRELUDE}
import subprocess
W.SAVED_ENV["A_SUPPLIED_VALUE"] = "the-value"
seen = {}
def spy(command, **kw):
    seen.update(kw.get("env") or {})
    raise subprocess.TimeoutExpired(command, 1)
subprocess.run = spy
W.emit = lambda **e: None
W.agent("t", "p", "opus", 1, tools=${tools === null ? "None" : JSON.stringify(tools)})
print(json.dumps({"value": seen.get("A_SUPPLIED_VALUE")}))`).value;

  it("hands the supplied values to a rung that can run commands", () => {
    assert.equal(env(["Read", "Bash"]), "the-value");
  });

  it("never lets a saved value replace one the runner is standing on", () => {
    // A repository that saved its own ANTHROPIC_API_KEY would otherwise
    // point the recovery session at the application's account: someone
    // else's money, or an authentication failure with no sign of why.
    // The rule is the inverse of start_service's, and right in both.
    const said = run(`${PRELUDE}
import os, subprocess
os.environ["ANTHROPIC_API_KEY"] = "the-runners-own"
W.SAVED_ENV.update({"ANTHROPIC_API_KEY": "the-applications", "ANTHROPIC_BASE_URL": "https://not.ours", "OPENAI_API_KEY": "the-applications"})
os.environ.pop("ANTHROPIC_BASE_URL", None)
seen = {}
def spy(command, **kw):
    seen.update(kw.get("env") or {})
    raise subprocess.TimeoutExpired(command, 1)
subprocess.run = spy
W.emit = lambda **e: None
W.agent("t", "p", "opus", 1, tools=["Bash"])
print(json.dumps({"key": seen.get("ANTHROPIC_API_KEY"), "base": seen.get("ANTHROPIC_BASE_URL"), "other": seen.get("OPENAI_API_KEY")}))`);
    assert.equal(said.key, "the-runners-own");
    // And an unset name is not a free slot. An application's endpoint
    // landing here would send the runner's own key somewhere else,
    // which is worse than the collision that made us look.
    assert.equal(said.base, null);
    // Everything that is genuinely the application's still arrives.
    assert.equal(said.other, "the-applications");
  });

  // A repository to work in, and somewhere that is not this machine's
  // home for the values file to go. The real path is $HOME, which a test
  // has no business writing to.
  const somewhere = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "engelbart-appenv-"));
    fs.mkdirSync(path.join(root, ".engelbart"));
    return { root, values: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "engelbart-home-")), ".engelbart-app-env.sh") };
  };

  it("gives the whole set to a command run under the wrapper", () => {
    // What agent_values holds back is not lost. The values live in a
    // file only this user can read, outside the repository so no patch
    // or commit can carry them, and the wrapper is what runs a build or
    // a test under the configuration the application actually gets.
    const { root, values } = somewhere();
    const said = run(`${PRELUDE}
import os, pathlib, subprocess
W.APP_ENV_FILE = pathlib.Path(${JSON.stringify(values)})
W.SAVED_ENV.update({"ANTHROPIC_BASE_URL": "https://the-applications", "OPENAI_API_KEY": "the-applications"})
wrapper = W.write_app_env(${JSON.stringify(root)})
out = subprocess.run(["bash", wrapper, "sh", "-c", 'echo "$ANTHROPIC_BASE_URL|$OPENAI_API_KEY"'], capture_output=True, text=True)
print(json.dumps({"seen": out.stdout.strip(), "mode": oct(W.APP_ENV_FILE.stat().st_mode & 0o777),
                  "inRepo": (W.APP_ENV_FILE.resolve().is_relative_to(${JSON.stringify(root)}))}))`);
    assert.equal(said.seen, "https://the-applications|the-applications");
    assert.equal(said.mode, "0o600");
    assert.equal(said.inRepo, false);
  });

  it("empties the values when the last one is deleted, and keeps the wrapper", () => {
    // Two things at once. A value the person deleted must not come back
    // to life because the last run's file was merely left alone — and a
    // setup.sh saved by an earlier run may put the wrapper in front of
    // its build, so taking the wrapper away would break the replay of
    // work that has nothing to do with the deleted value.
    const { root, values } = somewhere();
    fs.writeFileSync(path.join(root, ".engelbart", "setup.sh"),
      'bash "$(dirname "$0")/with-app-env.sh" sh -c \'echo "built with [$OPENAI_API_KEY]"\'\n');
    const said = run(`${PRELUDE}
import pathlib, subprocess
W.APP_ENV_FILE = pathlib.Path(${JSON.stringify(values)})
W.SAVED_ENV.update({"OPENAI_API_KEY": "from-the-run-before"})
W.write_app_env(${JSON.stringify(root)})
before = subprocess.run(["bash", ${JSON.stringify(root)} + "/.engelbart/setup.sh"], capture_output=True, text=True)
W.SAVED_ENV.clear()
wrapper = W.write_app_env(${JSON.stringify(root)})
after = subprocess.run(["bash", ${JSON.stringify(root)} + "/.engelbart/setup.sh"], capture_output=True, text=True)
print(json.dumps({"before": before.stdout.strip(), "after": after.stdout.strip(), "code": after.returncode,
                  "wrapper": bool(wrapper) and pathlib.Path(wrapper).exists(),
                  "values": W.APP_ENV_FILE.read_text()}))`);
    assert.equal(said.before, "built with [from-the-run-before]");
    // The saved script still runs...
    assert.equal(said.code, 0);
    assert.equal(said.wrapper, true);
    // ...and the deleted value is gone rather than carried over.
    assert.equal(said.after, "built with []");
    assert.equal(said.values, "");
  });

  it("keeps them from a rung that cannot", () => {
    // A reviewer that only reads has no use for a secret and no reason
    // to hold one.
    assert.equal(env(["Read", "Grep"]), null);
    assert.equal(env(null), null);
  });
});

describe("the clock the run is actually measured against", () => {
  // The runner hands the wrapper its deadline (lib/runtime/e2b.ts,
  // HC_DEADLINE_AT). Three 25-minute rounds against a 56-minute deadline
  // means the clock, not the round count, is usually what ends a session
  // — and a round the clock ends leaves no check, no diff and no recipe,
  // so a repository someone could have used comes back as a failure.
  const at = (secondsFromNow) =>
    `import importlib, os, time\nos.environ["HC_DEADLINE_AT"] = str(time.time() + ${secondsFromNow})\nW = importlib.reload(W)\n`;

  it("bounds a timeout by what is left, keeping a reserve to save the work", () => {
    const said = run(`${PRELUDE}${at(600)}print(json.dumps({"bound": W.bounded(3000), "left": int(W.time_left())}))`);
    // 600 left, 120 held back: a call may run for about 480, not 3000.
    // About, because a second or two passes between setting the deadline
    // and asking — which is the point of asking rather than assuming.
    assert.ok(said.bound > 470 && said.bound <= 480, `bounded to ${said.bound}`);
    assert.equal(said.left, said.bound);
  });

  it("leaves every timeout alone when no deadline was handed in", () => {
    // A test, or a local drive. Nothing invents a deadline of its own.
    const said = run(`${PRELUDE}
import importlib, os
os.environ.pop("HC_DEADLINE_AT", None)
W = importlib.reload(W)
print(json.dumps({"bound": W.bounded(3000), "left": W.time_left()}))`);
    assert.equal(said.bound, 3000);
    assert.equal(said.left, null);
  });

  it("does not start an agent it has no time to finish", () => {
    // Not started rather than started and killed: an interrupted agent
    // has still spent the money and left the repository half-edited.
    const said = run(`${PRELUDE}${at(30)}
W.emit = lambda **e: None
answer, info = W.agent("recovery", "p", "opus", 1, tools=["Bash"])
print(json.dumps({"answer": answer, "error": info["error"], "cost": info["cost"]}))`);
    assert.deepEqual(said.answer, {});
    assert.match(said.error, /no time left/);
    assert.equal(said.cost, null);
  });

  it("does not run a check it has no time to finish", () => {
    const said = run(`${PRELUDE}${at(30)}
ok, out = W.run_script("/tmp/check.sh", "/tmp", 300)
print(json.dumps({"ok": ok, "out": out}))`);
    assert.equal(said.ok, false);
    assert.match(said.out, /no time left/);
  });

  it("stops the session cleanly rather than starting a round the clock will cut", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "engelbart-clock-"));
    fs.mkdirSync(path.join(root, ".engelbart"));
    const said = run(`${PRELUDE}${at(200)}
events = []
W.emit = lambda **e: events.append(e)
W.BRIEF = {"primaryApp": {"path": "."}, "nothingToServe": {"value": False}}
W.agent = lambda *a, **k: (_ for _ in ()).throw(AssertionError("a round was started with 80 seconds to spare"))
got = W.recover(${JSON.stringify(root)}, "the pipeline could not start it")
print(json.dumps({"usable": got, "said": [e.get("phase") + ":" + str(e.get("status") or "") for e in events]}))`);
    // 200 left, 120 reserved, 80 usable — under the three minutes a round
    // needs to be worth starting, so no round is started at all.
    assert.equal(said.usable, false);
    assert.ok(said.said.includes("recovery:out_of_time"), said.said.join(" "));
  });
});

describe("what survives a session that was cut off", () => {
  it("records what it had already edited", () => {
    // The edits are the expensive part of a round, and a session that
    // times out mid-turn has still made them. Reading the working tree
    // costs a second, which is what the reserve is for; without this the
    // whole round is spent and nothing at all is kept.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "engelbart-cutoff-"));
    const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8" });
    git("init", "-q", ".");
    git("config", "user.email", "t@t");
    git("config", "user.name", "t");
    fs.writeFileSync(path.join(root, "server.js"), "listen(80)\n");
    git("add", ".");
    git("commit", "-qm", "first");
    fs.mkdirSync(path.join(root, ".engelbart"));

    const said = run(`${PRELUDE}
import pathlib
events = []
W.emit = lambda **e: events.append(e)
W.RECOVERY_ROUNDS = 1
W.BRIEF = {"primaryApp": {"path": "."}, "nothingToServe": {"value": False}}
def cut_off(*a, **k):
    # What a session does before it runs out of time: it edits.
    pathlib.Path(${JSON.stringify(root)}, "server.js").write_text("listen(process.env.PORT)\\n")
    return {}, {"error": "ran out of time", "cost": 0.4, "turns": 9, "seconds": 1, "model": "opus"}
W.agent = cut_off
got = W.recover(${JSON.stringify(root)}, "the pipeline could not start it")
patch = next((e for e in events if e.get("phase") == "patch"), None)
print(json.dumps({"usable": got, "patch": patch and {"files": patch.get("files"), "interrupted": patch.get("interrupted"),
                                                     "hasDiff": bool((patch.get("diff") or "").strip())},
                  "said": [e.get("phase") + ":" + str(e.get("status") or "") for e in events]}))`);
    assert.equal(said.usable, false);
    assert.ok(said.patch, `no patch was emitted: ${said.said.join(" ")}`);
    assert.deepEqual(said.patch.files, ["server.js"]);
    assert.equal(said.patch.interrupted, true);
    assert.equal(said.patch.hasDiff, true);
  });

  it("reports what a killed script printed instead of raising over it", () => {
    // subprocess hands TimeoutExpired raw bytes even under text=True, so
    // a script that printed something and then ran out of time used to
    // replace its own timeout with a TypeError.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "engelbart-killed-"));
    fs.writeFileSync(path.join(root, "slow.sh"), "echo getting started\nsleep 30\n");
    const said = run(`${PRELUDE}
ok, out = W.run_script(${JSON.stringify(path.join(root, "slow.sh"))}, ${JSON.stringify(root)}, 1)
print(json.dumps({"ok": ok, "out": out}))`);
    assert.equal(said.ok, false);
    assert.match(said.out, /getting started/);
    assert.match(said.out, /stopped after 1 s/);
  });
});

describe("replaying setup that was never finished", () => {
  // complete:false is setup saved because a session ran out of rounds,
  // budget or time. Its scripts are worth running again — the
  // dependencies land and the tree comes back — but it is a head start,
  // not a result, and reporting it as one shows a person an application
  // that was never started as ready.
  const replay = (recipe) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "engelbart-replay-"));
    fs.mkdirSync(path.join(root, ".engelbart"));
    return run(`${PRELUDE}
events = []
W.emit = lambda **e: events.append(e)
W.BRIEF = {"primaryApp": {"path": "."}, "nothingToServe": {"value": False}}
got = W.setup_for_use(${JSON.stringify(root)}, "saved", recipe=json.loads(${JSON.stringify(JSON.stringify(recipe))}))
print(json.dumps({"usable": got, "said": [e.get("phase") + ":" + str(e.get("status") or "") for e in events]}))`);
  };
  const saved = { version: 1, kind: "setup", summary: "installed", setup: "exit 0\n", check: "exit 0\n", next: "run it" };

  it("runs the saved scripts and then asks the run to carry on", () => {
    const said = replay({ ...saved, complete: false });
    assert.equal(said.usable, false);
    assert.ok(said.said.includes("recipe:incomplete"), said.said.join(" "));
    // The scripts still ran: that is the head start.
    assert.ok(said.said.includes("setup:replaying") && said.said.includes("check:ok"), said.said.join(" "));
    assert.ok(!said.said.some((p) => p.startsWith("usable")), said.said.join(" "));
  });

  it("still reports a finished one as usable", () => {
    // A library, or an application blocked by something outside this
    // sandbox. Nothing more to try, so nothing more to do.
    const said = replay({ ...saved, complete: true });
    assert.equal(said.usable, true);
    assert.ok(said.said.includes("usable:"), said.said.join(" "));
  });

  it("treats a recipe saved before the flag existed as finished", () => {
    const said = replay(saved);
    assert.equal(said.usable, true);
  });
});

describe("the last look at the page", () => {
  it("does not open a browser it has no time to close", () => {
    // Readiness keeps a fifteen-second reserve, but the visit that
    // decides whether the page actually works came after it with sixty
    // seconds of its own — long enough to turn a finished run into a
    // killed one.
    const said = run(`${PRELUDE}
import importlib, os, time
os.environ["HC_DEADLINE_AT"] = str(time.time() + 5)
W = importlib.reload(W)
print(json.dumps(W.visit("http://127.0.0.1:1/")))`);
    assert.match(said.error, /no time left/);
  });
});

describe("an unfinished recipe, all the way to a fresh clone", () => {
  it("carries the session's edits, and replaying restores them", () => {
    // The whole sequence, because each half looked right on its own: the
    // recovery emitted the right patch, and the replay applied the patch
    // it was given — which was null. A saved setup that rebuilds the
    // scripts but not the code replays against the code that did not
    // work, and every round the session spent is spent again.
    const origin = fs.mkdtempSync(path.join(os.tmpdir(), "engelbart-origin-"));
    const git = (where, ...a) => execFileSync("git", a, { cwd: where, encoding: "utf8" });
    git(origin, "init", "-q", ".");
    git(origin, "config", "user.email", "t@t");
    git(origin, "config", "user.name", "t");
    fs.writeFileSync(path.join(origin, "server.js"), "listen(80)\n");
    git(origin, "add", ".");
    git(origin, "commit", "-qm", "as cloned");

    // 1. a session that edits the repository, leaves a check that passes,
    //    and runs out of rounds before it ever starts the application.
    const worked = fs.mkdtempSync(path.join(os.tmpdir(), "engelbart-worked-"));
    execFileSync("git", ["clone", "-q", origin, worked]);
    const recipe = run(`${PRELUDE}
import pathlib
events = []
W.emit = lambda **e: events.append(e)
W.RECOVERY_ROUNDS = 1
W.BRIEF = {"primaryApp": {"path": "."}, "nothingToServe": {"value": False}}
def session(*a, **k):
    root = pathlib.Path(${JSON.stringify(worked)})
    (root / "server.js").write_text("listen(process.env.PORT)\\n")
    (root / ".engelbart").mkdir(exist_ok=True)
    (root / ".engelbart/setup.sh").write_text("exit 0\\n")
    (root / ".engelbart/check.sh").write_text("grep -q process.env.PORT server.js\\n")
    return ({"summary": "fixed the port", "check": "the port is read from the environment", "nothingToServe": False},
            {"error": None, "cost": 0.4, "turns": 9, "seconds": 1, "model": "opus"})
W.agent = session
got = W.recover(${JSON.stringify(worked)}, "the pipeline could not start it")
saved = next((e.get("recipe") for e in events if e.get("phase") == "recipe" and e.get("status") == "captured"), None)
print(json.dumps({"usable": got, "recipe": saved}))`);

    assert.equal(recipe.usable, true, "installed and checked is still worth having");
    assert.equal(recipe.recipe.complete, false, "it never started the application");
    assert.ok(recipe.recipe.patch, "the recipe carries the edits");
    assert.deepEqual(recipe.recipe.patch.files, ["server.js"]);

    // 2. a fresh clone of the same commit, replaying that recipe.
    const fresh = fs.mkdtempSync(path.join(os.tmpdir(), "engelbart-fresh-"));
    execFileSync("git", ["clone", "-q", origin, fresh]);
    assert.match(fs.readFileSync(path.join(fresh, "server.js"), "utf8"), /listen\(80\)/);
    const replayed = run(`${PRELUDE}
events = []
W.emit = lambda **e: events.append(e)
W.BRIEF = {"primaryApp": {"path": "."}, "nothingToServe": {"value": False}}
got = W.setup_for_use(${JSON.stringify(fresh)}, "saved", recipe=json.loads(${JSON.stringify(JSON.stringify(recipe.recipe))}))
print(json.dumps({"usable": got, "said": [e.get("phase") + ":" + str(e.get("status") or "") for e in events]}))`);

    // The edit is back, so the check the session wrote passes here too...
    assert.match(fs.readFileSync(path.join(fresh, "server.js"), "utf8"), /process\.env\.PORT/);
    assert.ok(replayed.said.includes("check:ok"), replayed.said.join(" "));
    // ...and the run carries on to try the application, rather than
    // reporting an application nobody ever started as ready.
    assert.equal(replayed.usable, false);
    assert.ok(replayed.said.includes("recipe:incomplete"), replayed.said.join(" "));
  });
});

describe("a page nobody managed to read", () => {
  it("is not called verified, and is not saved as a finished recipe", () => {
    // The application answers on its port, so the run goes live and a
    // person can use it. But the check that decides whether it actually
    // works is opening the page, and when that did not happen — the run
    // hit its deadline, the browser fell over — the run used to report
    // ready and save complete:true, promising the next run this had been
    // checked when nothing had checked it.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "engelbart-unread-"));
    const said = run(`${PRELUDE}
events = []
W.emit = lambda **e: events.append(e)
W.APP = {"url": "http://127.0.0.1:1/", "log": "/dev/null", "name": "web", "port": 1,
         "proc": type("P", (), {"poll": lambda self: None, "returncode": None})()}
W.SIDECARS[:] = []
W.answers = lambda url: True
W.visit = lambda url: {"error": "there was no time left in this run to open the page"}
W.start_service = lambda root, service, capabilities, gateway: dict(W.APP, isEntry=True, capture="available")
W.request_capture = lambda root: None
ok = W.start_services(${JSON.stringify(root)}, [{"name": "web", "launcher": "node", "args": ["s.js"], "cwd": ".", "port": 1, "isEntry": True}])
looked = next((e for e in events if e.get("phase") == "visit"), None)
answering = next((e for e in events if e.get("phase") == "start" and e.get("status") == "answering"), None)
recipe = W.recovery_recipe(${JSON.stringify(root)}, {"summary": "up"}, [{"name": "web"}], None, "", False, "r",
                           complete=bool(W.LAST_VERIFIED))
print(json.dumps({"up": ok, "verified": W.LAST_VERIFIED, "answered": bool(answering),
                  "onVisit": looked and looked.get("verified"), "said": looked and looked.get("unverified"),
                  "complete": recipe["complete"]}))`);
    assert.equal(said.up, true, "it is up: the port answered");
    assert.equal(said.answered, true, "and it says so, as it always did");
    // The browser check is recorded on the visit event, which is the one
    // event the native path, the setup rung and this session all emit.
    assert.equal(said.onVisit, false);
    assert.match(said.said, /no time left/);
    // And the same fact decides what is saved for next time.
    assert.equal(said.verified, false);
    assert.equal(said.complete, false);
  });
});
