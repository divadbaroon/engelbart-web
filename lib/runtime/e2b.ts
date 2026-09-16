import { Sandbox, CommandExitError } from "e2b";
import type { LaunchOutcome, LaunchRecipe, Recorder, Runtime } from "@/lib/runtime/types";

// The template runner sandboxes start from. Built by sandbox/build-template.mjs.
export const TEMPLATE = process.env.E2B_TEMPLATE ?? "engelbart-runner";
const CLONE_SANDBOX_TIMEOUT_MS = 15 * 60_000;   // killed if untouched after the clone
const CLONE_TIMEOUT_MS = 5 * 60_000;
const RUN_SANDBOX_TIMEOUT_MS = 60 * 60_000;     // how long a launched app stays up untouched
const LAUNCH_DEADLINE_MS = 12 * 60_000;         // install, agents and start, end to end
const WRAPPER = "/opt/engelbart/hc_run.py";
const PROXY = "/opt/engelbart/proxy.mjs";
const PROXY_PORT = 43110;   // the public port; the app's own port stays loopback-only
const RECIPE_FILE = "/home/user/.engelbart-recipe.json";

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
  async prepare(repo, runId, record) {
    let sandbox: Sandbox | undefined;
    try {
      await record.status("creating");
      sandbox = await Sandbox.create(TEMPLATE, {
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
      await record.status("cloned");
      return { ok: true, sandboxId: sandbox.sandboxId, workdir };
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
    if (run.template !== TEMPLATE) return fail(record, "TemplateMismatch", `This run's sandbox was built from "${run.template}", not the current runner image. Prepare the repository again.`);
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

    const cmd = `python3 ${WRAPPER} ${shellQuote(run.workdir)}`;
    record.event("command", cmd);
    const lines = new LineReader();
    let settled = false;
    let ended = false;   // the wrapper reported the run's end itself
    let recipe: LaunchRecipe | null = null;
    let recipeFailed = false;
    // Resolved once the wrapper has gone, whether it reported why or not.
    let finishDone: () => void = () => {};
    const done = new Promise<void>((resolve) => { finishDone = resolve; });
    const outcome = new Promise<LaunchOutcome>((resolve) => {
      const settle = (o: LaunchOutcome) => { if (!settled) { settled = true; resolve(o); } };
      lines.onLine = (line) => {
        const ev = parseEvent(line);
        if (!ev) { record.event("stdout", line + "\n"); return; }
        describe(ev, record);
        if (ev.phase === "recipe") {
          if (ev.status === "captured" && ev.recipe && typeof ev.recipe === "object") recipe = ev.recipe as LaunchRecipe;
          if (ev.status === "failed") recipeFailed = true;
        } else if (ev.phase === "ready" && typeof ev.port === "number") {
          const port = ev.port;
          expose(sandbox, port, typeof ev.host === "string" ? ev.host : "127.0.0.1", record)
            .then((previewUrl) => record.status("running", { previewUrl, port }).then(() => settle({ ok: true, previewUrl, port, done, recipe, recipeFailed })))
            .catch((err) => fail(record, "ProxyError", errorMessage(err), recipeFailed).then(settle));
        } else if (ev.phase === "error") {
          ended = true;
          const message = String(ev.message ?? "The pipeline stopped");
          record.status("failed", { errorKind: `Pipeline:${ev.step ?? ev.status ?? "error"}`, error: message }).then(() => settle({ ok: false, kind: "PipelineError", message, recipeFailed }));
        } else if (ev.phase === "exited") {
          ended = true;
          const message = `The application exited: ${ev.reason ?? ev.status ?? "unknown"}`;
          record.status("failed", { errorKind: "AppExited", error: message }).then(() => settle({ ok: false, kind: "AppExited", message, recipeFailed }));
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
          ...(replaying ? { HC_RECIPE_FILE: RECIPE_FILE } : {}),
        },
        onStdout: (d) => lines.push(d),
        onStderr: (d) => record.event("stderr", d),
      });
      // Whichever comes first: the app is ready, the wrapper exits, or we run out of patience.
      const exited = handle.wait()
        .then((r) => ({ kind: "WrapperExit", message: `The pipeline exited with code ${r.exitCode} before the application was ready.` }))
        .catch((err) => ({ kind: errorKind(err), message: err instanceof CommandExitError ? `The pipeline exited with code ${err.exitCode}: ${lastLine(err.stderr) || lastLine(err.stdout)}` : errorMessage(err) }));
      const timeout = new Promise<{ kind: string; message: string }>((resolve) =>
        setTimeout(() => resolve({ kind: "LaunchTimeout", message: "The application was not ready within 12 minutes." }), LAUNCH_DEADLINE_MS));
      const result = await Promise.race([outcome, exited.then((e) => ({ exit: e })), timeout.then((e) => ({ exit: e }))]);
      if ("exit" in result) {
        lines.flush();
        finishDone();
        if (settled) return outcome;
        const { kind, message } = result.exit;
        if (kind === "LaunchTimeout") { try { await handle.kill(); } catch { /* gone */ } }
        return fail(record, kind, message, recipeFailed);
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
      return fail(record, errorKind(err), errorMessage(err), recipeFailed);
    }
  },
};

// Put the running app behind the in-sandbox proxy and check the public URL
// answers, so "running" means reachable from the browser, not just healthy
// on loopback.
async function expose(sandbox: Sandbox, appPort: number, appHost: string, record: Recorder): Promise<string> {
  const cmd = `node ${PROXY} ${PROXY_PORT} ${appPort} ${shellQuote(appHost)}`;
  record.event("command", cmd);
  await sandbox.commands.run(cmd, {
    background: true,
    timeoutMs: RUN_SANDBOX_TIMEOUT_MS,
    onStdout: (d) => record.event("stdout", d),
    onStderr: (d) => record.event("stderr", d),
  });
  const previewUrl = `https://${sandbox.getHost(PROXY_PORT)}`;
  let last = "";
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const res = await fetch(previewUrl, { redirect: "manual", signal: AbortSignal.timeout(5000) });
      const body = (await res.text()).slice(0, 200).replace(/\s+/g, " ");
      if (res.status < 500 && !/Invalid Host header|not allowed/i.test(body)) {
        record.event("status", `preview ${previewUrl} → ${res.status}`, { previewUrl, status: res.status, body });
        return previewUrl;
      }
      last = `${res.status} ${body}`;
    } catch (err) {
      last = errorMessage(err);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`The application is running but the preview URL did not answer: ${last}`);
}

async function fail(record: Recorder, kind: string, message: string, recipeFailed = false): Promise<LaunchOutcome> {
  record.event("error", message, { kind });
  await record.status("failed", { errorKind: kind, error: message });
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
      record.event("status", `run order: ${ev.progress ?? ev.status}${agent?.seconds ? ` (${agent.seconds}s)` : ""}`, ev);
      return;
    case "plan":
      record.event("status", ev.source === "run_order" ? `plan: ${ev.summary ?? "ready"}` : `plan: ${ev.providers ? (ev.providers as string[]).join(", ") : ev.source} → ${ev.start ?? "start command pending"}`, ev);
      return;
    case "environment":
      if (ev.skipped) record.event("status", `skipping missing environment values: ${(ev.skipped as string[]).join(", ")}`, ev);
      else if (ev.warning) record.event("status", `environment scan: ${ev.warning}`, ev);
      return;
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
    case "ready":
      record.event("status", `application ready at ${ev.url}`, ev);
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
