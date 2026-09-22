import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Sandbox, CommandExitError } from "e2b";
import type { LaunchOptions, LaunchOutcome, LaunchRecipe, Recorder, Runtime } from "@/lib/runtime/types";
import type { AgentCost, PreviewService, RunBlocker, RunBrief, RunEscalation } from "@/lib/sandbox";
import { toEnvReport } from "@/lib/environment";
import { toPatch } from "@/lib/patch";
import type { Repo } from "@/lib/repos";

// The templates runner sandboxes start from. Built by sandbox/build-template.mjs.
// The Docker one has Docker, Compose, the Supabase CLI and more memory.
export const TEMPLATE = process.env.E2B_TEMPLATE ?? "engelbart-runner";
export const DOCKER_TEMPLATE = `${TEMPLATE}-docker`;
const TEMPLATES = [TEMPLATE, DOCKER_TEMPLATE];
const DOCKER_START_MS = 45_000;
const CLONE_SANDBOX_TIMEOUT_MS = 15 * 60_000;   // killed if untouched after the clone
const CLONE_TIMEOUT_MS = 5 * 60_000;
const RUN_SANDBOX_TIMEOUT_MS = 60 * 60_000;     // how long a launched app stays up untouched
// Install, agents and start, end to end. A real app can need a PyTorch
// install, a front-end build and two repair attempts; the sandbox itself
// lives an hour, so the deadline stays under that with room to save the
// trail.
const LAUNCH_DEADLINE_MS = 45 * 60_000;
// A run that has climbed the ladder (resolver, repair, setup for use) gets
// the rest of the sandbox's hour, less what saving a usable state needs.
const LADDER_DEADLINE_MS = 56 * 60_000;
const DEADLINE_TICK_MS = 10_000;
const WRAPPER = "/opt/engelbart/hc_run.py";
const PROXY = "/opt/engelbart/proxy.mjs";
const PROXY_PORT = 43110;   // the first public port; each service gets the next one, and their own ports stay loopback-only
const RECIPE_FILE = "/home/user/.engelbart-recipe.json";
const ENV_FILE = "/home/user/.engelbart-env.json";   // the wrapper deletes it once read
const BRIEF_FILE = "/home/user/.engelbart-brief.json";
// The behavior trace's model gateway: loopback only, one per run, with
// the run's token in its path. The application's model client is pointed
// at it by the wrapper.
const MODEL_GATEWAY = "/opt/engelbart/trace/model-gateway.mjs";
const MODEL_GATEWAY_PORT = 43200;
const REDACT_FILE = "/home/user/.engelbart-redact.json";   // the gateway deletes it once read
const GATEWAY_START_MS = 15_000;
// The preview gateway takes proxy.mjs's place for a traced run: same
// public ports, plus the browser bridge in every document and network
// events for the trace. Its own redaction file, since the model gateway
// deletes the first once read.
const PREVIEW_GATEWAY = "/opt/engelbart/trace/preview-gateway.mjs";
const PREVIEW_REDACT_FILE = "/home/user/.engelbart-redact-preview.json";
const STOP_LAUNCH_TIMEOUT_MS = 30_000;

// Take down everything a launch started inside a sandbox, and leave the
// sandbox itself exactly where it is: the clone, what was installed into
// it, and hc's own record of the project all stay.
//
// This is what makes relaunching cheaper than preparing again. The
// expensive parts of a run are the machine, the clone and the install,
// and none of them change when somebody adds an environment value, so
// none of them are repeated; only the processes go.
//
// It has to be thorough in two directions. A second wrapper started
// beside a first one finds hc holding a live process for this project and
// refuses to start, and the proxy's public port is already bound — so the
// first set must really be gone. And the application itself must go, not
// just its supervisor: a server left listening would answer the new run's
// health check in place of the one it started, and the run would come up
// green still holding the value that was just changed.
//
// Everything the runtime starts lives under /opt/engelbart — the wrapper,
// the proxy and the two gateways — so one pattern reaches all four. The
// application is not one of them: it is a child the pipeline spawned, and
// it is taken by the ports it serves on, which the run row already
// records. The bracket in the pattern keeps pkill from matching the shell
// that is running it, which otherwise kills this command mid-sentence.
export async function stopLaunch(sandboxId: string, ports: number[]): Promise<void> {
  const sandbox = await Sandbox.connect(sandboxId);
  const byPort = [...new Set(ports.filter((p) => Number.isInteger(p) && p > 0))]
    .map((p) => `fuser -k ${p}/tcp || true; `).join("");
  // Quoted, and it has to be: unquoted, the shell expands the bracket
  // against the directory that is actually there and hands pkill the
  // plain path, which then matches the command line pkill is being run
  // from — and the stop kills itself halfway through.
  const pattern = "'/opt/engelbar[t]/'";
  await sandbox.commands.run(
    `pkill -f ${pattern} || true; ${byPort}sleep 1; pkill -9 -f ${pattern} || true; true`,
    { timeoutMs: STOP_LAUNCH_TIMEOUT_MS },
  );
}

const errorKind = (err: unknown) => (err instanceof Error ? err.constructor.name : "Error");
const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

// Sample CPU, memory and disk into the event log. Best effort: metrics lag
// creation by a few seconds and may be empty.
async function recordMetrics(sandbox: Sandbox, record: Recorder) {
  try {
    const samples = await sandbox.getMetrics();
    const m = samples.at(-1);
    if (!m) return;
    record.event("metrics", `cpu ${m.cpuUsedPct.toFixed(0)}% · mem ${(m.memUsed / 1_048_576).toFixed(0)} MB`, {
      cpuUsedPct: m.cpuUsedPct, cpuCount: m.cpuCount, memUsed: m.memUsed, memTotal: m.memTotal, diskUsed: m.diskUsed, diskTotal: m.diskTotal,
    });
  } catch (err) {
    record.event("error", `metrics unavailable: ${errorMessage(err)}`, { kind: errorKind(err) });
  }
}

// E2B: a fresh sandbox per run from the runner template, tagged with our ids
// so the E2B dashboard can be searched by them. The clone streams into the
// run's event log. On success the sandbox stays up with the repository on
// disk, so launch can carry on in the same sandbox straight away.
export const e2bRuntime: Runtime = {
  async prepare(repo, runId, record, options = {}) {
    let sandbox: Sandbox | undefined;
    const template = options.docker ? DOCKER_TEMPLATE : TEMPLATE;
    try {
      await record.status("creating", { template });
      if (options.docker) record.event("status", "the repository brings up its own services; using the runner with Docker", { template });
      sandbox = await Sandbox.create(template, {
        timeoutMs: CLONE_SANDBOX_TIMEOUT_MS,
        metadata: { runId, repoId: repo.id, repo: repo.fullName },
      });
      const workdir = `/home/user/${repo.name}`;
      await record.status("cloning", { sandboxId: sandbox.sandboxId, workdir });

      const branch = repo.defaultBranch ? ` --branch ${shellQuote(repo.defaultBranch)}` : "";
      const cmd = `git clone --progress --depth 1${branch} ${shellQuote(`${repo.url}.git`)} ${shellQuote(workdir)}`;
      record.event("command", cmd);
      const result = await sandbox.commands.run(cmd, {
        timeoutMs: CLONE_TIMEOUT_MS,
        envs: { GIT_TERMINAL_PROMPT: "0" },   // fail instead of waiting for credentials
        onStdout: (d) => record.event("stdout", d),
        onStderr: (d) => record.event("stderr", d),
      });
      record.event("status", `exit ${result.exitCode}`, { exitCode: result.exitCode });

      const listing = await sandbox.commands.run(`ls -A ${shellQuote(workdir)} | head -40`);
      record.event("command", `ls -A ${workdir}`);
      record.event("stdout", listing.stdout);
      await recordMetrics(sandbox, record);
      const commit = await headCommit(sandbox, workdir);
      await record.status("cloned", { commit });
      return { ok: true, sandboxId: sandbox.sandboxId, workdir, commit };
    } catch (err) {
      const kind = errorKind(err);
      const message = err instanceof CommandExitError ? cloneFailure(err) : errorMessage(err);
      record.event("error", message, { kind });
      await record.status("failed", { errorKind: kind, error: message });
      if (sandbox) {
        try { await sandbox.kill(); record.event("status", "sandbox killed"); } catch { /* already gone */ }
      }
      await record.flush();
      return { ok: false, kind, message };
    }
  },

  // Connect to the run's sandbox (resuming it if it was paused) and drive hc's pipeline in it through the
  // wrapper, which prints one JSON event per line. The wrapper stays up as
  // the application's supervisor after we return, and its later lines keep
  // landing in the event log for as long as this process holds the stream.
  async launch(repo, run, record, options = {}) {
    if (!run.sandboxId || !run.workdir) return fail(record, "NoSandbox", "This run has no sandbox to launch in. Prepare the repository again.");
    if (!TEMPLATES.includes(run.template)) return fail(record, "TemplateMismatch", `This run's sandbox was built from "${run.template}", not a current runner image. Prepare the repository again.`);
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return fail(record, "ConfigError", "ANTHROPIC_API_KEY is not set; the pipeline's agents need it.");

    let sandbox: Sandbox;
    try {
      sandbox = await Sandbox.connect(run.sandboxId);
      await sandbox.setTimeout(RUN_SANDBOX_TIMEOUT_MS);
    } catch (err) {
      return fail(record, errorKind(err), `The sandbox is no longer available (${errorMessage(err)}). Prepare the repository again.`);
    }
    await record.status("launching");
    if (run.template === DOCKER_TEMPLATE) await startDocker(sandbox, record);

    // A saved recipe rides in as a file; the wrapper replays it first.
    let replaying = false;
    if (options.recipe) {
      try {
        await sandbox.files.write(RECIPE_FILE, JSON.stringify(options.recipe));
        replaying = true;
        record.event("status", "replaying the launch recipe saved from the last successful run", { recipe: true });
      } catch (err) {
        record.event("status", `could not hand over the saved recipe: ${errorMessage(err)}`);
      }
    }

    // Saved environment values ride in the same way. The event log only
    // ever sees their names.
    let handedEnv = false;
    const envNames = Object.keys(options.env ?? {});
    if (envNames.length) {
      try {
        await sandbox.files.write(ENV_FILE, JSON.stringify(options.env));
        handedEnv = true;
        record.event("status", `using ${envNames.length} saved environment value${envNames.length === 1 ? "" : "s"}: ${envNames.join(", ")}`, { env: envNames });
      } catch (err) {
        record.event("status", `could not hand over the saved environment values: ${errorMessage(err)}`);
      }
    }

    // The brief made for this commit by an earlier run rides in too.
    let handedBrief = false;
    if (options.brief) {
      try {
        await sandbox.files.write(BRIEF_FILE, JSON.stringify(options.brief));
        handedBrief = true;
        record.event("status", "using the repository brief made for this commit by an earlier run", { phase: "brief", status: "handed" });
      } catch (err) {
        record.event("status", `could not hand over the saved brief: ${errorMessage(err)}`);
      }
    }

    // The behavior trace: a model gateway the application's model client
    // is pointed at, whose stdout the collector turns into rows. Without
    // one the run is exactly what it was before tracing existed.
    const trace = options.trace ?? null;
    const gateway = trace ? await startModelGateway(sandbox, repo, trace, options.env ?? {}, record) : null;

    const cmd = `python3 ${WRAPPER} ${shellQuote(run.workdir)}`;
    record.event("command", cmd);
    const lines = new LineReader();
    let settled = false;
    let ended = false;   // the wrapper reported the run's end itself
    // The direct path has its deadline; the first escalation event moves
    // it out to the ladder's, once.
    const launchStart = Date.now();
    let deadlineAt = launchStart + LAUNCH_DEADLINE_MS;
    const extendForLadder = () => { deadlineAt = Math.max(deadlineAt, launchStart + LADDER_DEADLINE_MS); };
    let recipe: LaunchRecipe | null = null;
    let recipeFailed = false;
    // What the run leaves on its row besides its status: the brief, and
    // how it got where it got with what its agent calls cost.
    let brief: RunBrief | null = options.brief ?? null;
    const escalation: RunEscalation = { path: "direct", cost: { total: 0, items: [] } };
    const trail = () => ({ brief, escalation: { ...escalation, cost: { ...escalation.cost, items: [...escalation.cost.items] } } });
    // Resolved once the wrapper has gone, whether it reported why or not.
    let finishDone: () => void = () => {};
    const done = new Promise<void>((resolve) => { finishDone = resolve; });
    const outcome = new Promise<LaunchOutcome>((resolve) => {
      const settle = (o: LaunchOutcome) => { if (!settled) { settled = true; resolve(o); } };
      lines.onLine = (line) => {
        const ev = parseEvent(line);
        if (!ev) { record.event("stdout", line + "\n"); return; }
        describe(ev, record);
        if (ev.phase === "instrument" && trace) {
          trace.collector.note("wrapper", `instrument.${String(ev.status ?? "unknown")}`, Object.fromEntries(Object.entries(ev).filter(([k]) => k !== "phase")));
        }
        if (ev.phase === "resolve" || ev.phase === "setup" || ev.phase === "start" || ev.phase === "conclusion" || (ev.phase === "order" && ev.status === "gave_up") || (ev.phase === "patch" && ev.status === "starting")) extendForLadder();
        if (ev.phase === "recipe") {
          if (ev.status === "captured" && ev.recipe && typeof ev.recipe === "object") recipe = ev.recipe as LaunchRecipe;
          if (ev.status === "failed") recipeFailed = true;
        } else if (ev.phase === "brief") {
          if ((ev.status === "done" || ev.status === "cached") && ev.brief && typeof ev.brief === "object") brief = ev.brief as RunBrief;
        } else if (ev.phase === "cost") {
          const item: AgentCost = { rung: String(ev.rung ?? ""), model: typeof ev.model === "string" ? ev.model : null, cost: typeof ev.cost === "number" ? ev.cost : null, turns: typeof ev.turns === "number" ? ev.turns : null, seconds: typeof ev.seconds === "number" ? ev.seconds : null };
          escalation.cost.items.push(item);
          escalation.cost.total = Math.round((escalation.cost.total + (item.cost ?? 0)) * 10000) / 10000;
        } else if (ev.phase === "resolve" && (ev.status === "plan" || ev.status === "blocked")) {
          escalation.path = "resolved";
          escalation.resolver = { status: String(ev.status), hint: typeof ev.hint === "string" ? ev.hint : undefined, blocker: (ev.blocker as RunBlocker | undefined) ?? undefined, evidence: Array.isArray(ev.evidence) ? (ev.evidence as string[]) : undefined };
          if (ev.status === "blocked") escalation.blocker = (ev.blocker as RunBlocker | undefined) ?? null;
        } else if (ev.phase === "conclusion") {
          if (ev.blocker && typeof ev.blocker === "object") escalation.blocker = ev.blocker as RunBlocker;
        } else if (ev.phase === "setup" && ev.status === "starting") {
          escalation.path = "setup";
        } else if (ev.phase === "environment") {
          const report = toEnvReport(ev, run.id, new Date().toISOString());
          if (report) options.onEnvironment?.(report);
        } else if (ev.phase === "patch" && (ev.status === "applied" || ev.status === "replayed")) {
          if (ev.status === "applied" && escalation.path === "direct") escalation.path = "repaired";
          const patch = toPatch(ev, run.id, new Date().toISOString());
          if (patch) options.onPatch?.(patch);
        } else if (ev.phase === "ready" && typeof ev.port === "number") {
          // An application that answers is not blocked, whatever a rung
          // below concluded on the way here.
          escalation.blocker = null;
          expose(sandbox, readyServices(ev), record, trace, options.env ?? {})
            .then((services) => {
              const entry = services[0];
              const fields = { previewUrl: entry.previewUrl, port: entry.port, services };
              return record.status("running", { ...fields, ...trail() }).then(() => settle({ ok: true, ...fields, done, recipe, recipeFailed }));
            })
            .catch((err) => fail(record, "ProxyError", errorMessage(err), recipeFailed, trail()).then(settle));
        } else if (ev.phase === "usable") {
          // Nothing to serve, or blocked, but installed and checked: the
          // sandbox stays up with a shell, and what to run next is on the row.
          const usage = { summary: String(ev.summary ?? ""), next: String(ev.next ?? ""), check: String(ev.check ?? ""), output: String(ev.output ?? ""), blocker: (ev.blocker as RunBlocker | undefined) ?? null };
          const up = { ok: true as const, usable: true, previewUrl: null, port: null, services: [], done, recipe, recipeFailed };
          record.status("usable", { usage, ...trail() }).then(() => settle(up), () => settle(up));
        } else if (ev.phase === "error") {
          // "conclusion" is only logged: the wrapper goes on to set the
          // repository up for use and reports "usable", or fails here from
          // the setup step. Nothing to serve and not set up is no_service;
          // an application that is blocked and not set up is a failure.
          ended = true;
          const message = String(ev.message ?? "The pipeline stopped");
          const setup = ev.step === "setup";
          const noService = setup && (ev.outcome === "no_service" || ev.outcome === undefined);
          const kind = noService ? "NoService" : setup ? "Blocked" : `Pipeline:${ev.step ?? ev.status ?? "error"}`;
          const failed = { ok: false as const, kind: noService ? "NoService" : setup ? "Blocked" : "PipelineError", message, recipeFailed };
          record.status(noService ? "no_service" : "failed", { errorKind: kind, error: message, ...trail() })
            .catch(() => undefined)
            .then(async () => { if (setup) { try { await sandbox.kill(); record.event("status", "sandbox killed"); } catch { /* already gone */ } } })
            .then(() => settle(failed), () => settle(failed));
        } else if (ev.phase === "exited") {
          ended = true;
          const message = `The application exited: ${ev.reason ?? ev.status ?? "unknown"}`;
          const exited = { ok: false as const, kind: "AppExited", message, recipeFailed };
          record.status("failed", { errorKind: "AppExited", error: message, ...trail() }).then(() => settle(exited), () => settle(exited));
        }
      };
    });

    try {
      const handle = await sandbox.commands.run(cmd, {
        background: true,
        timeoutMs: RUN_SANDBOX_TIMEOUT_MS,
        envs: {
          ANTHROPIC_API_KEY: apiKey,
          HC_USE_API_KEY: "1",
          HC_CHAT_PROVIDER: "claude",
          HC_EXPERIMENTAL: "1",
          HUMAN_COMPACT_HOME: "/home/user/.human-compact",
          // The sandbox is thrown away after the run, so hc's closing
          // repair attempts may run commands to see what happens.
          HC_DISPOSABLE_HOST: "1",
          // Every pip in the run inherits this; a cached copy of each wheel
          // once helped fill a sandbox disk.
          PIP_NO_CACHE_DIR: "1",
          ...(replaying ? { HC_RECIPE_FILE: RECIPE_FILE } : {}),
          ...(handedBrief ? { HC_BRIEF_FILE: BRIEF_FILE } : {}),
          // Which model each agent rung runs on and how much a call may
          // spend; the wrapper has defaults for each.
          ...Object.fromEntries(Object.entries(process.env).filter(([k]) => /^HC_(BRIEF|RESOLVER|REPAIR|SETUP|SETUP_RETRY)_(MODEL|BUDGET_USD)$/.test(k)).map(([k, v]) => [k, v ?? ""])),
          ...(options.hint ? { HC_PROJECT_HINT: options.hint.slice(0, 500) } : {}),
          ...(handedEnv ? { HC_ENV_FILE: ENV_FILE } : {}),
          // With a gateway up, the wrapper applies the repository's registered
          // sandbox-only instrumentation and hands the application the URL.
          ...(gateway ? { ENGELBART_TRACE: "1", ENGELBART_REPO: repo.fullName, ENGELBART_MODEL_GATEWAY_URL: gateway.url } : {}),
          // Two switches an operator can set on the runner itself, for a
          // run made to see what happens without something: the
          // repository's sandbox-only edit, and the preload that watches
          // model calls. Neither can be set by a repository or an agent.
          ...Object.fromEntries(["ENGELBART_INSTRUMENTATION", "ENGELBART_PRELOAD"].filter((k) => process.env[k]).map((k) => [k, process.env[k] as string])),
        },
        onStdout: (d) => lines.push(d),
        onStderr: (d) => record.event("stderr", d),
      });
      // Whichever comes first: the app is ready, the wrapper exits, or we run out of patience.
      const exited = handle.wait()
        .then((r) => ({ kind: "WrapperExit", message: `The pipeline exited with code ${r.exitCode} before the application was ready.` }))
        .catch((err) => ({ kind: errorKind(err), message: err instanceof CommandExitError ? `The pipeline exited with code ${err.exitCode}: ${lastLine(err.stderr) || lastLine(err.stdout)}` : errorMessage(err) }));
      const timeout = new Promise<{ kind: string; message: string }>((resolve) => {
        const tick = () => {
          if (settled || ended) return;
          if (Date.now() >= deadlineAt) resolve({ kind: "LaunchTimeout", message: `The application was not ready within ${Math.round((deadlineAt - launchStart) / 60_000)} minutes.` });
          else setTimeout(tick, DEADLINE_TICK_MS);
        };
        tick();
      });
      const result = await Promise.race([outcome, exited.then((e) => ({ exit: e })), timeout.then((e) => ({ exit: e }))]);
      if ("exit" in result) {
        lines.flush();
        finishDone();
        // The wrapper exits right after reporting its own end; its report
        // is still being written when the exit lands, and it is the answer.
        if (settled || ended) return outcome;
        const { kind, message } = result.exit;
        if (kind === "LaunchTimeout") { try { await handle.kill(); } catch { /* gone */ } }
        return fail(record, kind, message, recipeFailed, trail());
      }
      await recordMetrics(sandbox, record);
      // The app is up. Keep the stream open and mark the run when the
      // wrapper goes away without saying why: the sandbox hit its timeout,
      // was killed, or the wrapper itself died.
      handle.wait()
        .then((r) => ({ kind: "AppExited", message: `The application stopped (exit ${r.exitCode}).` }))
        .catch((err) => ({ kind: err instanceof CommandExitError ? "AppExited" : "SandboxGone", message: err instanceof CommandExitError ? `The application stopped (exit ${err.exitCode}).` : `The sandbox is no longer running: ${errorMessage(err)}` }))
        .then(async ({ kind, message }) => {
          lines.flush();
          if (!ended) { record.event("error", message, { kind }); await record.status("failed", { errorKind: kind, error: message }); }
          await record.flush();
          finishDone();
        });
      return result;
    } catch (err) {
      return fail(record, errorKind(err), errorMessage(err), recipeFailed, trail());
    }
  },
};

// What sandbox/instrumentation registers for a repository: the diff the
// wrapper applies and the upstream hosts the artifact already talks to.
type Instrumentation = { diff: string; why: string; upstreams?: string[]; environment?: Record<string, string> };
function instrumentationFor(repo: Repo): Instrumentation | null {
  try {
    const dir = process.env.ENGELBART_INSTRUMENTATION_DIR ?? path.join(process.cwd(), "sandbox", "instrumentation");
    const index = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8")) as Record<string, Instrumentation>;
    return index[repo.fullName.toLowerCase()] ?? null;
  } catch { return null; }
}

// Start the preview gateway on the same mappings proxy.mjs would take and
// wait for it to announce itself. Best effort: if it does not come up, it
// is stopped and the plain proxy serves the run, which is then traced on
// the model side only.
// The origins allowed to turn annotate mode on inside a served document,
// and to start a replay recording — both ride the same channel. The
// bridge only observes until it is told to, and it is told only by the
// window that embeds the preview, and only when that window's origin is
// one of these. With nothing here the control channel never opens and the
// run is traced exactly as it was before annotations existed.
//
// A list, because one workspace is served from more than one origin and
// this is decided by the process that launches the sandbox — the worker,
// which is not the web app. A worker on somebody's machine has no
// VERCEL_URL, so it pinned every sandbox it launched to localhost, and
// the same run opened from the deployment got a preview that refused the
// picker and saved no pictures, silently, because both messages are
// dropped by the same test. ENGELBART_WORKSPACE_ORIGIN takes a
// comma-separated list for exactly that case.
//
// The fallback is unchanged in shape — one origin, guessed — except that
// Vercel's production domain is preferred over the per-deployment URL,
// which is what VERCEL_URL actually is and which nobody browses.
export function workspaceOrigins(): string[] {
  const set = process.env.ENGELBART_WORKSPACE_ORIGIN;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  // Set-but-empty rather than falsy, because an explicitly blank value is
  // the only way to spell the off-state: unset already means the guess
  // below. Blank splits to one empty entry, which the trim drops, and the
  // caller sends no config at all — the same as " ", and the same as it
  // did before this took a list.
  const raw = set != null ? set.split(",") : [host ? `https://${host}` : "http://localhost:3000"];
  const out: string[] = [];
  for (const one of raw) {
    const text = one.trim();
    if (!text) continue;
    try { const o = new URL(text).origin; if (!out.includes(o)) out.push(o); } catch { /* not an origin: left out rather than guessed at */ }
  }
  return out;
}

async function startPreviewGateway(sandbox: Sandbox, specs: string, trace: NonNullable<LaunchOptions["trace"]>, env: Record<string, string>, record: Recorder): Promise<boolean> {
  const origins = workspaceOrigins();
  const lines = new LineReader();
  lines.onLine = (line) => { if (!trace.collector.line(line)) record.event("stdout", line + "\n"); };
  try {
    await sandbox.files.write(PREVIEW_REDACT_FILE, JSON.stringify(env));
    const cmd = `node ${PREVIEW_GATEWAY} ${specs}`;
    record.event("command", cmd);
    const handle = await sandbox.commands.run(cmd, {
      background: true,
      timeoutMs: RUN_SANDBOX_TIMEOUT_MS,
      envs: {
        ENGELBART_TRACE_CAPTURE: trace.capture, ENGELBART_REDACT_FILE: PREVIEW_REDACT_FILE,
        // Both shapes: `parentOrigins` is what a current bridge reads and
        // `parentOrigin` is what one from an image built before this
        // reads, so a sandbox on an older template keeps the behaviour it
        // had rather than losing the channel altogether.
        ...(origins.length ? { ENGELBART_BRIDGE_CONFIG: JSON.stringify({ parentOrigin: origins[0], parentOrigins: origins }) } : {}),
      },
      onStdout: (d) => lines.push(d),
      onStderr: (d) => record.event("stderr", d),
    });
    const up = await trace.collector.listening("preview", GATEWAY_START_MS);
    if (up) return true;
    record.event("error", "the preview gateway did not start in time; interactions and requests will not be traced", { kind: "TraceGatewayError" });
    try { await handle.kill(); } catch { /* gone */ }
    return false;
  } catch (err) {
    record.event("error", `the preview gateway could not be started: ${errorMessage(err)}; interactions and requests will not be traced`, { kind: "TraceGatewayError" });
    return false;
  }
}

// Start the run's model gateway and wait for it to announce itself. The
// saved environment values go to it as the list of what to redact, in a
// file it deletes once read. Best effort: without a gateway the run goes
// on untraced, and says so.
type ModelGateway = { url: string; port: number };
async function startModelGateway(sandbox: Sandbox, repo: Repo, trace: NonNullable<LaunchOptions["trace"]>, env: Record<string, string>, record: Recorder): Promise<ModelGateway | null> {
  const token = crypto.randomBytes(18).toString("base64url");
  const registered = instrumentationFor(repo);
  const lines = new LineReader();
  lines.onLine = (line) => { if (!trace.collector.line(line)) record.event("stdout", line + "\n"); };
  try {
    await sandbox.files.write(REDACT_FILE, JSON.stringify(env));
    const cmd = `node ${MODEL_GATEWAY}`;
    record.event("command", cmd);
    await sandbox.commands.run(cmd, {
      background: true,
      timeoutMs: RUN_SANDBOX_TIMEOUT_MS,
      envs: {
        ENGELBART_TRACE_TOKEN: token,
        ENGELBART_TRACE_CAPTURE: trace.capture,
        ENGELBART_MODEL_GATEWAY_PORT: String(MODEL_GATEWAY_PORT),
        ENGELBART_REDACT_FILE: REDACT_FILE,
        ...(registered?.upstreams?.length ? { ENGELBART_MODEL_UPSTREAMS: registered.upstreams.join(",") } : {}),
      },
      onStdout: (d) => lines.push(d),
      onStderr: (d) => record.event("stderr", d),
    });
    const up = await trace.collector.listening("model", GATEWAY_START_MS);
    if (!up) {
      record.event("error", "the model gateway did not start in time; model calls will not be traced", { kind: "TraceGatewayError" });
      return null;
    }
    if (registered) record.event("status", `sandbox-only instrumentation is registered for ${repo.fullName}: ${registered.why}`, { phase: "trace", instrumentation: registered.diff, upstreams: registered.upstreams });
    return { url: `http://127.0.0.1:${up.port}/t/${token}`, port: up.port };
  } catch (err) {
    record.event("error", `the model gateway could not be started: ${errorMessage(err)}; model calls will not be traced`, { kind: "TraceGatewayError" });
    return null;
  }
}

// Bring up the Docker daemon in a sandbox built from the Docker template,
// and open its socket to the sandbox user the app runs as. Best effort:
// the pipeline reports what it could not do with it.
async function startDocker(sandbox: Sandbox, record: Recorder) {
  record.event("command", "dockerd");
  try {
    await sandbox.commands.run("dockerd > /var/log/dockerd.log 2>&1", { background: true, user: "root", timeoutMs: RUN_SANDBOX_TIMEOUT_MS });
    const deadline = Date.now() + DOCKER_START_MS;
    while (Date.now() < deadline) {
      const probe = await sandbox.commands.run("docker info --format '{{.ServerVersion}}' && chmod 666 /var/run/docker.sock", { user: "root", timeoutMs: 10_000 }).catch(() => null);
      if (probe?.exitCode === 0) { record.event("status", `docker ${probe.stdout.trim()} is up`); return; }
      await new Promise((r) => setTimeout(r, 1500));
    }
    record.event("status", "docker did not come up in time; continuing without it");
  } catch (err) {
    record.event("status", `docker could not be started: ${errorMessage(err)}`);
  }
}

// What the wrapper's ready event says is listening, entry first. Older
// wrappers only name the entry; that still makes a one-service list. The
// entry keeps the path the app answers on (a Next app under a base path,
// say): its root may well be a 404.
type ReadyService = { id: string; host: string; port: number; isEntry: boolean; embeddable: boolean; path?: string };
function readyServices(ev: WrapperEvent): ReadyService[] {
  const listed = Array.isArray(ev.services) ? (ev.services as Partial<ReadyService>[]) : [];
  const services: ReadyService[] = listed
    .filter((s) => typeof s.port === "number")
    .map((s) => ({ id: String(s.id ?? "app"), host: typeof s.host === "string" ? s.host : "127.0.0.1", port: s.port as number, isEntry: !!s.isEntry, embeddable: s.embeddable !== false }));
  if (!services.some((s) => s.isEntry)) {
    services.unshift({ id: "app", host: typeof ev.host === "string" ? ev.host : "127.0.0.1", port: ev.port as number, isEntry: true, embeddable: true });
  }
  services.sort((a, b) => Number(b.isEntry) - Number(a.isEntry));
  const path = readyPath(ev.url);
  if (path) services[0] = { ...services[0], path };
  return services;
}

function readyPath(url: unknown): string | undefined {
  if (typeof url !== "string") return undefined;
  try {
    const { pathname, search } = new URL(url);
    return pathname === "/" && !search ? undefined : `${pathname}${search}`;
  } catch { return undefined; }
}

// Put every service behind the in-sandbox proxy, one public port each, and
// check the entry's public URL answers, so "running" means reachable from
// the browser, not just healthy on loopback. The others are not probed:
// an API may well answer 404 at its root and still be fine.
async function expose(sandbox: Sandbox, wanted: ReadyService[], record: Recorder, trace: LaunchOptions["trace"] | null, env: Record<string, string>): Promise<PreviewService[]> {
  const mappings = wanted.map((s, i) => ({ ...s, listenPort: PROXY_PORT + i }));
  const specs = mappings.map((m) => shellQuote(`${m.listenPort}:${m.port}:${m.host}`)).join(" ");
  const traced = trace ? await startPreviewGateway(sandbox, specs, trace, env, record) : false;
  if (!traced) {
    const cmd = `node ${PROXY} ${specs}`;
    record.event("command", cmd);
    await sandbox.commands.run(cmd, {
      background: true,
      timeoutMs: RUN_SANDBOX_TIMEOUT_MS,
      onStdout: (d) => record.event("stdout", d),
      onStderr: (d) => record.event("stderr", d),
    });
  }
  const services: PreviewService[] = mappings.map((m) => ({
    id: m.id, port: m.port, previewUrl: `https://${sandbox.getHost(m.listenPort)}${m.path ?? ""}`, isEntry: m.isEntry, embeddable: m.embeddable,
  }));
  for (const s of services.slice(1)) record.event("status", `service ${s.id} at ${s.previewUrl}`, { service: s.id, previewUrl: s.previewUrl, port: s.port });
  const { previewUrl } = services[0];
  let last = "";
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const res = await fetch(previewUrl, { redirect: "manual", signal: AbortSignal.timeout(5000) });
      const body = (await res.text()).slice(0, 200).replace(/\s+/g, " ");
      if (res.status < 500 && !/Invalid Host header|not allowed/i.test(body)) {
        record.event("status", `preview ${previewUrl} → ${res.status}`, { previewUrl, status: res.status, body });
        return services;
      }
      last = `${res.status} ${body}`;
    } catch (err) {
      last = errorMessage(err);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`The application is running but the preview URL did not answer: ${last}`);
}

async function fail(record: Recorder, kind: string, message: string, recipeFailed = false, trail: { brief: RunBrief | null; escalation: RunEscalation } | null = null): Promise<LaunchOutcome> {
  record.event("error", message, { kind });
  await record.status("failed", { errorKind: kind, error: message, ...(trail ?? {}) });
  await record.flush();
  return { ok: false, kind, message, recipeFailed };
}

type WrapperEvent = { phase: string; [key: string]: unknown };

function parseEvent(line: string): WrapperEvent | null {
  if (!line.startsWith("{")) return null;
  try {
    const v = JSON.parse(line);
    return v && typeof v === "object" && typeof v.phase === "string" ? (v as WrapperEvent) : null;
  } catch {
    return null;
  }
}

// Turn a wrapper event into something the Terminal can show and the events
// table can be searched by. Application output keeps its stream; the rest
// become status lines with the full event kept as data.
function describe(ev: WrapperEvent, record: Recorder) {
  const agent = ev.agent as { name?: string; status?: string; phase?: string; seconds?: number; call?: number } | null | undefined;
  switch (ev.phase) {
    case "log":
      record.event(ev.stream === "stderr" ? "stderr" : "stdout", String(ev.text ?? ""), { stage: ev.stage });
      return;
    case "stage":
      record.event("command", `${ev.command ?? ev.stage}`, { stage: ev.stage, cwd: ev.cwd, attempt: ev.attempt });
      return;
    case "discover":
      if (ev.status === "done") {
        const comps = (ev.components as { id: string; types: string[] }[]) ?? [];
        record.event("status", `discovered ${comps.length} component${comps.length === 1 ? "" : "s"}: ${comps.map((c) => `${c.id} (${c.types.join("/")})`).join(", ")}`, ev);
      }
      return;
    case "order":
      record.event("status", ev.status === "gave_up" ? `run order gave up: ${String(ev.reason ?? "").slice(0, 400)}` : `run order: ${ev.progress ?? ev.status}${agent?.seconds ? ` (${agent.seconds}s)` : ""}`, ev);
      return;
    case "plan":
      record.event("status", ev.source === "run_order" ? `plan: ${ev.summary ?? "ready"}` : `plan: ${ev.providers ? (ev.providers as string[]).join(", ") : ev.source} → ${ev.start ?? "start command pending"}`, ev);
      return;
    case "environment": {
      if (ev.warning) { record.event("status", `environment scan: ${ev.warning}`, ev); return; }
      const skipped = (ev.skipped as string[] | undefined) ?? [];
      const provided = (ev.provided as string[] | undefined) ?? [];
      const ignored = (ev.ignored as string[] | undefined) ?? [];
      const instrumented = (ev.instrumented as string[] | undefined) ?? [];
      const parts = [
        provided.filter((n) => !instrumented.includes(n)).length ? `using saved values for ${provided.filter((n) => !instrumented.includes(n)).join(", ")}` : "",
        instrumented.length ? `routing model calls through the gateway via ${instrumented.join(", ")}` : "",
        skipped.length ? `skipping missing environment values: ${skipped.join(", ")}` : "",
        ignored.length ? `saved values not read by this app: ${ignored.join(", ")}` : "",
      ].filter(Boolean);
      record.event("status", parts.join(" · ") || "environment: nothing missing", ev);
      return;
    }
    case "run": {
      const who = agent?.name ? ` · ${agent.name}: ${agent.phase ?? agent.status}` : "";
      record.event("status", `${ev.status}${ev.stage ? ` [${ev.stage}]` : ""}${ev.reason ? ` — ${ev.reason}` : ""}${who}`, ev);
      return;
    }
    case "approval":
      record.event("status", `approved: ${ev.summary ?? (ev.changes as string[] | undefined)?.join("; ") ?? "install"}`, ev);
      return;
    case "recipe":
      if (ev.status === "replaying") record.event("status", `replaying saved ${ev.kind ?? ""} launch plan`, { kind: ev.kind, saved: ev.saved });
      else if (ev.status === "captured") record.event("status", "launch plan saved for next time", { kind: (ev.recipe as { kind?: string } | undefined)?.kind });
      else if (ev.status === "failed") record.event("status", `saved launch plan did not work (${ev.reason ?? "unknown"}); running the full pipeline`, ev);
      else record.event("status", `launch plan ${ev.status}: ${ev.reason ?? ""}`, ev);
      return;
    case "patch": {
      const files = Array.isArray(ev.files) ? (ev.files as string[]) : [];
      const text =
        ev.status === "starting" ? `repair agent: looking for a fix (attempt ${ev.attempt})`
        : ev.status === "applied" ? `repair agent edited ${files.length} file${files.length === 1 ? "" : "s"}: ${ev.summary ?? files.join(", ")}`
        : ev.status === "replayed" ? `re-applied the saved edits: ${ev.summary ?? files.join(", ")}`
        : ev.status === "none" ? `repair agent changed nothing${ev.reason ? `: ${ev.reason}` : ""}`
        : `repair agent ${ev.status}${ev.reason ? `: ${ev.reason}` : ""}`;
      // The diff is kept in the event's data, not its text; the summary says enough.
      record.event("status", text, ev);
      return;
    }
    case "instrument": {
      const files = Array.isArray(ev.files) ? (ev.files as string[]) : [];
      const text =
        ev.status === "applied" ? `sandbox-only instrumentation applied to ${files.join(", ")} so model calls pass through the gateway; committed in the sandbox copy only, never upstream`
        : ev.status === "present" ? `sandbox-only instrumentation already in place in ${files.join(", ")} from an earlier launch; handing the application the gateway's URL`
        : ev.status === "none" ? `no sandbox-only instrumentation is registered for ${ev.repo ?? "this repository"}; model calls are traced only if the application reads its provider's base URL from the environment`
        : `instrumentation ${ev.status}${ev.reason ? `: ${ev.reason}` : ""}`;
      // The diff rides in the event's data, like a repair patch.
      record.event("status", text, ev);
      return;
    }
    case "supabase":
      record.event("status", `local Supabase: ${ev.status}${ev.reason ? ` — ${ev.reason}` : ""}`, ev);
      return;
    case "ready": {
      const names = Array.isArray(ev.services) ? (ev.services as { id?: string; port?: number }[]).map((s) => `${s.id} :${s.port}`) : [];
      record.event("status", `application ready at ${ev.url}${names.length > 1 ? ` (services: ${names.join(", ")})` : ""}`, ev);
      return;
    }
    case "conclusion":
      record.event("status", ev.status === "blocked" ? `blocked (${(ev.blocker as { kind?: string } | undefined)?.kind ?? "unknown"}): ${ev.reason ?? ""}` : `nothing to serve: ${ev.reason ?? ""}`, ev);
      return;
    case "brief": {
      const b = ev.brief as { purpose?: string; primaryApp?: { path?: string; confidence?: string } } | undefined;
      const text = ev.status === "starting" ? `brief: reading the repository (${ev.model ?? ""})`
        : ev.status === "done" || ev.status === "cached" ? `brief${ev.status === "cached" ? " (from an earlier run)" : ""}: ${b?.purpose ?? ""}${b?.primaryApp?.path ? ` · run ${b.primaryApp.path} (${b.primaryApp.confidence ?? "?"} confidence)` : ""}`
        : ev.status === "handed" ? String(ev.text ?? "brief handed over")
        : `brief ${ev.status}: ${ev.reason ?? ""}`;
      // The brief itself rides in the data, not the line.
      record.event("status", text.slice(0, 600), ev);
      return;
    }
    case "resolve":
      record.event("status", ev.status === "starting" ? `resolver: a second opinion on why it stopped (${ev.model ?? ""})`
        : ev.status === "reading" ? `resolver: reading ${Array.isArray(ev.files) ? (ev.files as string[]).join(", ") : "files"}`
        : ev.status === "plan" ? `resolver: corrected the plan — ${ev.hint ?? ""}`
        : ev.status === "blocked" ? `resolver: blocked (${(ev.blocker as { kind?: string } | undefined)?.kind ?? "unknown"}) — ${(ev.blocker as { what?: string } | undefined)?.what ?? ""}`
        : `resolver ${ev.status}: ${ev.reason ?? ""}`, ev);
      return;
    case "cost":
      record.event("status", `${ev.rung} (${ev.model ?? "?"}): ${typeof ev.cost === "number" ? `$${ev.cost.toFixed(3)}` : "cost unknown"}${typeof ev.turns === "number" ? `, ${ev.turns} turns` : ""}${ev.error ? ` — ${ev.error}` : ""} · run total $${typeof ev.total === "number" ? ev.total.toFixed(3) : "?"}`, ev);
      return;
    case "setup":
      record.event("status", ev.status === "starting" ? `setup agent: ${ev.goal === "start" ? "starting the application" : "installing the repository for use"} (attempt ${ev.attempt ?? 1})`
        : ev.status === "replaying" ? "setup: replaying the saved setup script"
        : ev.status === "done" ? `setup: ${ev.summary ?? "done"}` : `setup failed: ${ev.reason ?? String(ev.output ?? "").slice(-200)}`, ev);
      return;
    case "check":
      record.event("status", ev.status === "ok" ? "check passed" : `check failed: ${ev.reason ?? String(ev.output ?? "").slice(-200)}`, ev);
      return;
    case "start":
      record.event("status", ev.status === "starting" ? `setup: starting the application, waiting for ${ev.url ?? "it"}`
        : ev.status === "answering" ? `setup: the application answers at ${ev.url ?? ""}`
        : ev.status === "leftover" ? `setup: stopping what the agent left on port ${ev.port ?? "?"}`
        : `setup: the application did not start: ${ev.reason ?? ""}`, ev);
      return;
    case "usable":
      record.event("status", `set up and ready to use: ${ev.summary ?? ""}`, ev);
      return;
    case "error":
      record.event("error", String(ev.message ?? "pipeline error"), ev);
      return;
    case "exited":
      record.event("error", `application exited (${ev.status}): ${ev.reason ?? ""}`, ev);
      return;
    default:
      record.event("status", `${ev.phase}: ${JSON.stringify(ev).slice(0, 300)}`, ev);
  }
}

// Reassemble whole lines from stream chunks.
class LineReader {
  private buffer = "";
  onLine: (line: string) => void = () => {};
  push(chunk: string) {
    this.buffer += chunk;
    let i;
    while ((i = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, i).replace(/\r$/, "");
      this.buffer = this.buffer.slice(i + 1);
      if (line.trim()) this.onLine(line);
    }
  }
  flush() {
    if (this.buffer.trim()) this.onLine(this.buffer);
    this.buffer = "";
  }
}

const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
const lastLine = (s: string) => s.trim().split("\n").pop() ?? "";

// Git asks for credentials when GitHub will not serve a repository anonymously,
// which is what a private or deleted repository looks like from here.
function cloneFailure(err: CommandExitError) {
  if (/could not read Username|Authentication failed|Repository not found/i.test(err.stderr)) {
    return "GitHub refused the clone. The repository may be private or no longer exist.";
  }
  return `git exited with ${err.exitCode}: ${lastLine(err.stderr)}`;
}

// The commit the clone checked out, for tying a recipe to the code it
// was captured on. Null when git will not say; nothing depends on it.
async function headCommit(sandbox: Sandbox, workdir: string): Promise<string | null> {
  try {
    const result = await sandbox.commands.run(`git -C ${shellQuote(workdir)} rev-parse HEAD`, { timeoutMs: 10_000 });
    const sha = result.stdout.trim();
    return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
  } catch {
    return null;
  }
}
