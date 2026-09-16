import { Sandbox, CommandExitError } from "e2b";
import type { Recorder, Runtime } from "@/lib/runtime/types";

const TEMPLATE = "base";
const SANDBOX_TIMEOUT_MS = 15 * 60_000;   // killed if still running and untouched after this
const CLONE_TIMEOUT_MS = 5 * 60_000;

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

// E2B: a fresh sandbox per run, tagged with our ids so the E2B dashboard can
// be searched by them. The clone streams into the run's event log. On
// success the sandbox is paused with the repository on disk, so the next
// step can resume the same sandbox instead of cloning again.
export const e2bRuntime: Runtime = {
  async prepare(repo, runId, record) {
    let sandbox: Sandbox | undefined;
    try {
      await record.status("creating");
      sandbox = await Sandbox.create(TEMPLATE, {
        timeoutMs: SANDBOX_TIMEOUT_MS,
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

      await sandbox.pause();
      await record.status("paused");
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
};

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
