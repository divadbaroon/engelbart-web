// A run as steps, and the one line above them saying where it is.
//
// The step list is derived entirely from the event log, so these are
// tests about reading a log: which step a line belongs to, what each step
// says about itself, and — the one that motivated writing them — that the
// header can never claim the application is up and gone at the same time.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planner, runState, runSteps, STEP_ORDER, type StepId } from "../../lib/run-steps.ts";
import { plainError, type RunStatus, type SandboxEvent, type SandboxRun } from "../../lib/sandbox.ts";

let seq = 0;
const at = (n: number) => new Date(Date.UTC(2026, 8, 21, 12, 0, n)).toISOString();
const ev = (kind: SandboxEvent["kind"], text: string, data: Record<string, unknown> | null = null): SandboxEvent => {
  seq += 1;
  return { id: seq, runId: "r1", seq, at: at(seq), kind, text, data };
};

const run = (patch: Partial<SandboxRun> = {}): SandboxRun => ({
  id: "r1", repoId: "repo1", sandboxId: "sb1", template: "base", commit: "abcdef1234", fresh: false,
  trace: "full", status: "running", workdir: "/app", errorKind: null, error: null, port: 3000,
  previewUrl: "https://example.test", services: null, usage: null, brief: null, escalation: null,
  startedAt: at(0), ...patch,
} as SandboxRun);

// The log of a run that came up: cloned, planned by Railpack, started, ready.
const cameUp = (): SandboxEvent[] => {
  seq = 0;
  return [
    ev("status", "creating", { template: "base" }),
    ev("command", "git clone https://github.com/x/y"),
    ev("status", "cloned", { commit: "abcdef1234" }),
    ev("status", "plan", { phase: "plan", source: "railpack", summary: "next dev" }),
    ev("command", "npm install", { stage: "install" }),
    ev("stdout", "added 402 packages\n", { stage: "install" }),
    ev("status", "ready", { phase: "ready", services: ["web"] }),
    ev("status", "trail", { phase: "trail", status: "shared", saved: true }),
  ];
};

const byId = (steps: ReturnType<typeof runSteps>) => Object.fromEntries(steps.map((s) => [s.id, s])) as Record<StepId, ReturnType<typeof runSteps>[number]>;

describe("the steps a run is read as", () => {
  it("names the planning step Run Plan", () => {
    const steps = byId(runSteps(run(), cameUp()));
    assert.equal(steps.plan.title, "Run Plan");
  });

  it("names the saved-setup step Railpack, and still says which planner answered", () => {
    // Two steps, not one: the second is whether this repository already
    // had a command list to replay, the third is the command list the
    // planner produced for this run. They read as the same noun now, on
    // purpose, but the plan still names its own planner off the event,
    // so a repository planned by the run-order planner does not read as
    // Railpack twice over.
    const steps = byId(runSteps(run(), cameUp()));
    assert.equal(steps.trail.title, "Railpack");
    assert.match(steps.plan.summary, /Command list from Railpack/);
    assert.notEqual(steps.trail.id, steps.plan.id);
  });

  it("calls the saved setup a command list, never a trail", () => {
    // "Trail" is what the pipeline and the database call it; on a
    // screen it names nothing. The events still carry `phase: "trail"`,
    // so the word being gone from every line is the whole of the test.
    const none = byId(runSteps(run(), [...cameUp(), ev("status", "trail", { phase: "trail", status: "none" })]));
    assert.equal(none.trail.summary, "No command list yet; analyzing from scratch");
    const own = byId(runSteps(run(), [ev("status", "trail", { phase: "trail", status: "own", capturedAt: at(1), commit: "abcdef1234" })]));
    assert.match(own.trail.summary, /^Replaying this project's command list from /);
    const up = runSteps(run(), cameUp());
    assert.match(byId(up).live.summary, /command list saved and shared/);
    const everything = up.map((step) => `${step.title} ${step.summary}`).join(" ");
    assert.doesNotMatch(everything, /trail/i);
  });

  it("says whether there is a sandbox and what was put on it, not which template answered", () => {
    const up = byId(runSteps(run(), cameUp(), "mqo00/rope"));
    assert.equal(up.sandbox.summary, "Sandbox running · cloned mqo00/rope");
    // A run that is over has had its sandbox killed, so it cannot claim one.
    const gone = byId(runSteps(run({ status: "killed", previewUrl: null }), cameUp(), "mqo00/rope"));
    assert.match(gone.sandbox.summary, /^Sandbox stopped ·/);
    // Docker is the one template choice that is about the repository
    // rather than about us: it is picked because the repository brings
    // up its own services. Read off the creating event, which is what
    // the run was actually made on, rather than off the row.
    const withDocker = cameUp();
    withDocker[0] = { ...withDocker[0], data: { template: "base-docker" } };
    const docker = byId(runSteps(run({ template: "base-docker" }), withDocker, "mqo00/rope"));
    assert.match(docker.sandbox.summary, /^Sandbox running with Docker ·/);
    // With no name passed, the clone's own directory stands in.
    const bare = byId(runSteps(run({ workdir: "/home/user/rope" }), cameUp()));
    assert.equal(bare.sandbox.summary, "Sandbox running · cloned rope");
  });

  it("leads the Run Plan with the command, not with a cut-off brief", () => {
    // What a person opens this step for is what is going to be run. The
    // brief's `purpose` is one or two whole sentences by specification,
    // so a collapsed row could only ever show the first 120 characters
    // of it; that is the half of a sentence nobody can finish, and it
    // used to come before the answer.
    const brief = { phase: "brief", status: "done", brief: { purpose: "Cocoa Canvas is a collaborative canvas web application where users and AI agents draw together on one surface.", primaryApp: { path: "client" } } };
    const railpack = [
      ev("status", "brief", brief),
      ev("status", "plan", { phase: "plan", source: "railpack", start: "npm run dev" }),
    ];
    const one = byId(runSteps(run(), railpack));
    assert.equal(one.plan.summary, "Runs npm run dev in client · Command list from Railpack");
    assert.doesNotMatch(one.plan.summary, /Brief:|collaborative canvas/);

    // The run-order planner names the service a person is meant to open
    // rather than writing a start command, so the command comes off that
    // service and the directory with it.
    const many = [
      ev("status", "discover", { phase: "discover", status: "done", components: ["client", "server", "worker"] }),
      ev("status", "brief", brief),
      ev("status", "plan: run both", {
        phase: "plan", source: "run_order", summary: "run both",
        plan: { entryService: "web", services: [{ id: "api", cwd: "server", argv: ["uvicorn", "main:app"] }, { id: "web", cwd: "client", argv: ["npm", "run", "dev"] }] },
      }),
    ];
    const three = byId(runSteps(run(), many));
    assert.equal(three.plan.summary, "Runs npm run dev in client · Command list from the run order · 3 components");
  });

  it("says what a run started over is doing, not what it is skipping", () => {
    // The worker writes this status off the run's `fresh` flag alone and
    // never looks for a saved list, so the old line — "Starting over
    // without the saved command list" — claimed a first-ever Start over
    // was passing over something that had never existed.
    const steps = byId(runSteps(run(), [ev("status", "trail", { phase: "trail", status: "fresh" })]));
    assert.equal(steps.trail.summary, "Working the commands out from scratch, as asked");
  });

  it("says which planner answered, off the event rather than the step", () => {
    assert.equal(planner("railpack"), "Command list from Railpack");
    assert.equal(planner("run_order"), "Command list from the run order");
    assert.equal(planner(undefined), "");
  });

  it("gives every step a title", () => {
    for (const s of runSteps(undefined, [])) assert.ok(s.title, `${s.id} has no title`);
  });
});

describe("the log, sliced by step", () => {
  it("puts every event in exactly one step, losing none", () => {
    // What each step opens and what "View all logs" opens are the same
    // lines: the steps partition the log rather than filtering it.
    const events = cameUp();
    const steps = runSteps(run(), events);
    const seen = steps.flatMap((s) => s.events.map((e) => e.seq));
    assert.deepEqual([...seen].sort((a, b) => a - b), events.map((e) => e.seq));
    assert.equal(new Set(seen).size, events.length);
  });

  it("gives the install's output to the step that ran it", () => {
    const steps = byId(runSteps(run(), cameUp()));
    assert.ok(steps.start.events.some((e) => e.text.includes("added 402 packages")));
    assert.ok(!steps.plan.events.some((e) => e.text.includes("added 402 packages")));
  });
});

describe("an application that is up but was never looked at", () => {
  // The page is what settles whether an application works: one that
  // crashed on an import still answers a 200 with the crash written on
  // it. So a run whose browser check did not finish is up and available
  // — nothing is stopped, the preview stays — but the run must not read
  // as though the page had been opened and was fine.
  //
  // Three paths reach that point and end differently: the native one at
  // `ready`, the setup rung and the recovery session at `start:
  // answering`. All three open the page in between, so all three are
  // read off the same visit event.
  const look = (visit: Record<string, unknown> | null) => (visit ? [ev("status", "visited", { phase: "visit", ...visit })] : []);
  const native = (visit: Record<string, unknown> | null): SandboxEvent[] => {
    seq = 0;
    return [
      ev("status", "creating", { template: "base" }),
      ev("status", "cloned", { commit: "abcdef1234" }),
      ev("status", "plan", { phase: "plan", source: "railpack", summary: "next dev" }),
      ev("command", "npm run dev", { stage: "start" }),
      ...look(visit),
      ev("status", "ready", { phase: "ready", services: ["web"] }),
    ];
  };
  const answered = (visit: Record<string, unknown> | null, rung: "setup" | "recovery"): SandboxEvent[] => {
    seq = 0;
    return [
      ev("status", "creating", { template: "base" }),
      ev("status", "cloned", { commit: "abcdef1234" }),
      ...(rung === "setup"
        ? [ev("status", "setup", { phase: "setup", status: "done", summary: "installed" })]
        : [ev("status", "recovery", { phase: "recovery", status: "answered", summary: "fixed the port" })]),
      ev("status", "starting", { phase: "start", status: "starting", url: "http://127.0.0.1:3000/" }),
      ...look(visit),
      ev("status", "answering", { phase: "start", status: "answering", url: "http://127.0.0.1:3000/" }),
      ev("status", "ready", { phase: "ready", services: ["web"] }),
    ];
  };
  const NOT_READ = { verified: false, unverified: "there was no time left in this run to open the page" };
  const READ = { verified: true, unverified: null, title: "Welcome", status: 200 };
  const live = run({ status: "running", previewUrl: "https://example.test" });
  const paths: [string, (v: Record<string, unknown> | null) => SandboxEvent[]][] = [
    ["the native path", native],
    ["the setup rung", (v) => answered(v, "setup")],
    ["the recovery session", (v) => answered(v, "recovery")],
  ];

  for (const [name, log] of paths) {
    it(`says so, and warns, on ${name}`, () => {
      const steps = byId(runSteps(live, log(NOT_READ)));
      // The native path has no answering line to hang it off, so it is a
      // sentence of its own there and a clause after the URL elsewhere.
      assert.match(steps.health.summary, /browser verification incomplete: there was no time left/i);
      assert.equal(steps.health.state, "warned");
      // And where a person looks first, without taking the run down.
      assert.match(steps.live.summary, /Live at https:\/\/example\.test/);
      assert.match(steps.live.summary, /browser verification incomplete/i);
      assert.equal(steps.live.state, "warned");
    });

    it(`reads differently when the page was read, on ${name}`, () => {
      const steps = byId(runSteps(live, log(READ)));
      assert.doesNotMatch(steps.health.summary, /verification/);
      assert.equal(steps.health.state, "done");
      assert.doesNotMatch(steps.live.summary, /verification/);
      assert.equal(steps.live.state, "done");
    });

    it(`says nothing either way when no check was recorded, on ${name}`, () => {
      // An older sandbox, or a path that did not open the page at all.
      // Absence of evidence, so the run reads as it always did.
      const steps = byId(runSteps(live, log(null)));
      assert.doesNotMatch(steps.health.summary, /verification/);
      assert.doesNotMatch(steps.live.summary, /verification/);
      assert.notEqual(steps.live.state, "warned");
    });
  }

  it("names the answering URL as well, when there is one", () => {
    const steps = byId(runSteps(live, answered(NOT_READ, "recovery")));
    assert.match(steps.health.summary, /answers at http:\/\/127\.0\.0\.1:3000\/ — browser verification incomplete/);
  });
});

describe("where the run is, in one clause", () => {
  it("says nothing about being up once the sandbox is gone", () => {
    // The case this is here for: the run reached `ready`, so the Live
    // step knows it was up, and then the worker found the sandbox gone.
    const events = cameUp();
    const gone = run({ status: "failed", error: "The sandbox is no longer running.", errorKind: "SandboxGone" });
    const steps = runSteps(gone, events);
    const state = runState(gone, steps);
    const everything = [state.headline, state.detail, ...steps.map((s) => `${s.summary} ${s.error ?? ""}`)].join(" ");
    assert.match(state.headline, /^Failed/);
    assert.equal(state.detail, "The sandbox is no longer running.");
    assert.doesNotMatch(everything, /\bUp\b/);
    assert.doesNotMatch(everything, /\bLive at\b/);
  });

  it("keeps what is still true of a stopped run, and drops what is not", () => {
    const steps = byId(runSteps(run({ status: "killed", previewUrl: null }), cameUp()));
    // The command list really was saved and shared; the application really is not there.
    assert.match(steps.live.summary, /command list saved and shared/);
    assert.doesNotMatch(steps.live.summary, /\bUp\b/);
  });

  it("takes its headline from the status and nothing else", () => {
    // Every status gets exactly one headline, so two of them cannot be
    // shown at once however the log reads.
    const statuses: RunStatus[] = ["queued", "creating", "cloning", "cloned", "paused", "launching", "running", "usable", "no_service", "failed", "killed"];
    const headlines = statuses.map((status) => runState(run({ status, error: null }), runSteps(run({ status }), cameUp())).headline);
    for (const h of headlines) assert.ok(h, "a status with no headline");
    const alive = ["running", "usable"];
    statuses.forEach((status, i) => {
      const claimsAlive = /Running|ready to use/.test(headlines[i]);
      assert.equal(claimsAlive, alive.includes(status), `${status}: "${headlines[i]}"`);
    });
  });

  it("says where a failure happened, once", () => {
    seq = 0;
    const events = [
      ev("status", "creating", { template: "base" }),
      ev("status", "cloned", { commit: "abcdef1234" }),
      ev("status", "plan", { phase: "plan", source: "railpack", summary: "next dev" }),
      ev("command", "npm install", { stage: "install" }),
      ev("status", "check", { phase: "check", status: "failed", reason: "connection refused" }),
    ];
    const failed = run({ status: "failed", error: "The check never passed.", previewUrl: null });
    const steps = runSteps(failed, events);
    const state = runState(failed, steps);
    assert.equal(state.headline, "Failed in Health and repair");
    assert.equal(state.detail, "The check never passed.");
    assert.equal(steps.filter((s) => s.state === "failed").length, 1);
    // The reason is carried on the step that stopped, apart from what
    // that step did, so opening it can show the whole of it.
    const stopped = steps.find((s) => s.state === "failed")!;
    assert.equal(stopped.error, "The check never passed.");
    assert.doesNotMatch(stopped.summary, /never passed/);
    assert.equal(steps.filter((s) => s.error).length, 1);
  });

  it("has a headline before there is a run at all", () => {
    const state = runState(undefined, runSteps(undefined, []));
    assert.equal(state.headline, "Not prepared");
    assert.equal(state.tone, "none");
  });

  it("counts the steps it reports against", () => {
    const state = runState(run({ status: "cloning", previewUrl: null }), runSteps(run({ status: "cloning" }), cameUp().slice(0, 2)));
    assert.match(state.detail, new RegExp(`of ${STEP_ORDER.length}`));
  });
});

// What the workspace says an error was, when the thing that failed was
// somebody else's library.
describe("a run's error, as it is shown", () => {
  // Verbatim, from a run of the ROPE repository whose sandbox timed out.
  const e2b = "The sandbox is no longer running: [unavailable] the connection to sandbox ihdlebk8q66u5vmd3nnh5 "
    + "ended before the stream completed: This error is likely due to sandbox timeout. You can modify the sandbox "
    + "timeout by passing 'timeoutMs' when starting the sandbox or calling '.setTimeout' on the sandbox with the "
    + "desired timeout.";

  it("keeps our sentence and drops the SDK's tail", () => {
    assert.equal(plainError(e2b), "The sandbox is no longer running.");
  });

  it("drops the advice even without the bracketed status", () => {
    // The same advice reaches us through other calls with no gRPC status
    // in front of it. It is addressed to whoever wrote this code.
    assert.equal(
      plainError("The sandbox is no longer running: This error is likely due to sandbox timeout. You can modify the sandbox timeout by passing 'timeoutMs'."),
      "The sandbox is no longer running.",
    );
  });

  it("leaves an error nobody recognises alone", () => {
    // Trimming by length is how a real reason disappears; only the
    // vendor's own shapes are cut.
    assert.equal(plainError("The application stopped (exit 1)."), "The application stopped (exit 1).");
    assert.equal(
      plainError("Installing failed: the lockfile asks for a version of node that is not in this template"),
      "Installing failed: the lockfile asks for a version of node that is not in this template.",
    );
    assert.equal(plainError("Cloning failed: repository not found"), "Cloning failed: repository not found.");
  });

  it("answers nothing for nothing", () => {
    for (const empty of [null, undefined, "", "   "]) assert.equal(plainError(empty), "");
  });

  it("is what both the headline and the failed step show", () => {
    seq = 0;
    const events = [ev("status", "creating", { template: "base" }), ev("status", "cloned", { commit: "abcdef1234" })];
    const gone = run({ status: "failed", error: e2b, previewUrl: null });
    const steps = runSteps(gone, events);
    assert.equal(runState(gone, steps).detail, "The sandbox is no longer running.");
    assert.equal(steps.find((s) => s.state === "failed")!.error, "The sandbox is no longer running.");
    // The untouched text is still on the run, for whoever needs to quote
    // it; it is the workspace that stops repeating it.
    assert.equal(gone.error, e2b);
  });
});
