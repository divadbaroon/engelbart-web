// A sandbox run: one attempt to bring a repository up in a hosted sandbox,
// and the events it produced along the way. Rows come from
// engelbart_sandbox_runs and engelbart_sandbox_events. Free of React and of
// Supabase so the desktop app can share it.

import { toEnvReport, type EnvReport } from "@/lib/environment";

// usable: nothing to serve, but installed, checked and open in a shell.
// no_service: the pipeline concluded the repository has nothing to serve
// and could not set it up for use either.
export type RunStatus = "queued" | "creating" | "cloning" | "cloned" | "paused" | "launching" | "running" | "usable" | "no_service" | "failed" | "killed";

// What a usable run left for the person: what was set up, what the check
// proved, and what to run next, as the setup agent wrote it. `blocker` is
// set when the repository has an application that could not be started
// here (a key, a service, a device): NEXT.md then opens with it.
export type RunUsage = { summary: string; next: string; check: string; output: string; blocker?: RunBlocker | null };
export type RunBlocker = { kind: "secret" | "service" | "hardware" | "data" | "upstream" | "unknown"; what: string; names?: string[] };

// The librarian's brief: what the repository is, made once per commit
// before anything is planned. Shape as the wrapper's schema; loose here.
export type RunBrief = {
  purpose: string;
  primaryApp: { path: string; why: string; confidence: "high" | "medium" | "low" };
  parts: { path: string; kind: string; install: string; start: string; port?: number; requires: string[] }[];
  requires: { name: string; kind: string; neededFor: string; optional: boolean }[];
  examples: string[];
  traps: string[];
  nothingToServe: { value: boolean; reason: string };
  hintForPlanner: string;
};

// How the run got where it got: straight through, after the repair agent,
// after the resolver corrected the plan, or set up for use; the resolver's
// verdict and the blocker when there was one; and what every agent call
// cost.
export type AgentCost = { rung: string; model: string | null; cost: number | null; turns: number | null; seconds: number | null };
export type RunEscalation = {
  path: "direct" | "repaired" | "resolved" | "setup";
  resolver?: { status: string; hint?: string; blocker?: RunBlocker; evidence?: string[] } | null;
  blocker?: RunBlocker | null;
  cost: { total: number; items: AgentCost[] };
};
export type EventKind = "status" | "command" | "stdout" | "stderr" | "metrics" | "error";

// One service a run brought up, reachable from the browser at previewUrl.
// A frontend and its API are two of these; the entry service is what the
// preview shows first. Services that forbid framing are opened in a tab.
export type PreviewService = {
  id: string;
  port: number;
  previewUrl: string;
  isEntry: boolean;
  embeddable: boolean;
};

export type SandboxRun = {
  id: string;
  repoId: string;
  sandboxId: string | null;
  template: string;
  commit: string | null;   // what the clone checked out
  fresh: boolean;          // asked to ignore any saved trail
  status: RunStatus;
  workdir: string | null;
  errorKind: string | null;
  error: string | null;
  port: number | null;
  previewUrl: string | null;
  services: PreviewService[] | null;
  usage: RunUsage | null;
  brief: RunBrief | null;
  escalation: RunEscalation | null;
  startedAt: string;
  finishedAt: string | null;
};

export type SandboxEvent = {
  id: number;
  runId: string;
  seq: number;
  at: string;
  kind: EventKind;
  text: string;
  data: Record<string, unknown> | null;
};

export type RunRow = {
  id: string;
  repo_id: string;
  sandbox_id: string | null;
  template: string;
  commit_sha: string | null;
  fresh?: boolean;
  status: RunStatus;
  workdir: string | null;
  error_kind: string | null;
  error: string | null;
  port: number | null;
  preview_url: string | null;
  services: PreviewService[] | null;
  usage: RunUsage | null;
  brief?: RunBrief | null;
  escalation?: RunEscalation | null;
  started_at: string;
  finished_at: string | null;
};

export type EventRow = {
  id: number;
  run_id: string;
  seq: number;
  at: string;
  kind: EventKind;
  text: string;
  data: Record<string, unknown> | null;
};

export const RUN_COLUMNS = "id, repo_id, sandbox_id, template, commit_sha, status, workdir, error_kind, error, port, preview_url, services, usage, brief, escalation, started_at, finished_at, fresh";
export const EVENT_COLUMNS = "id, run_id, seq, at, kind, text, data";

export const toRun = (r: RunRow): SandboxRun => ({
  id: r.id, repoId: r.repo_id, sandboxId: r.sandbox_id, template: r.template, commit: r.commit_sha, fresh: r.fresh === true, status: r.status, workdir: r.workdir,
  errorKind: r.error_kind, error: r.error, port: r.port, previewUrl: r.preview_url, services: r.services, usage: r.usage ?? null, brief: r.brief ?? null, escalation: r.escalation ?? null, startedAt: r.started_at, finishedAt: r.finished_at,
});

export const toEvent = (e: EventRow): SandboxEvent => ({
  id: e.id, runId: e.run_id, seq: e.seq, at: e.at, kind: e.kind, text: e.text, data: e.data,
});

// Still doing something: waiting for the worker, creating the sandbox,
// cloning, or bringing the app up. "cloned" is in here because the worker
// launches straight after the clone; the page must keep listening through it.
export const isRunActive = (run: SandboxRun | undefined) =>
  !!run && (run.status === "queued" || run.status === "creating" || run.status === "cloning" || run.status === "cloned" || run.status === "launching");

// The repository is in a paused sandbox from before runs launched on their
// own; it can be asked to launch.
export const isRunCloned = (run: SandboxRun | undefined) => !!run && run.status === "paused";

// There is a sandbox with the repository on disk that can be reached:
// files can be read and written and a shell opened.
export const isSandboxLive = (run: SandboxRun | undefined): run is SandboxRun & { sandboxId: string } =>
  !!run?.sandboxId && (run.status === "cloned" || run.status === "launching" || run.status === "running" || run.status === "usable");

// Set up for use: installed and checked, with a shell open, but no page.
export const isRunUsable = (run: SandboxRun | undefined) => !!run && run.status === "usable";

// The application is up and has a preview URL.
export const isRunRunning = (run: SandboxRun | undefined) => !!run && run.status === "running" && !!run.previewUrl;

const STATUSES: RunStatus[] = ["queued", "creating", "cloning", "cloned", "paused", "launching", "running", "usable", "no_service", "failed", "killed"];
const isRunStatus = (s: string): s is RunStatus => (STATUSES as string[]).includes(s);

// The latest environment scan a run reported, from its event log; live,
// unlike the copy stored on the repository.
export const environmentFromEvents = (events: SandboxEvent[], runId: string): EnvReport | null => {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.kind === "status" && e.data?.phase === "environment" && Array.isArray(e.data.variables)) return toEnvReport(e.data, runId, e.at);
  }
  return null;
};

// Events can arrive late over one path after a newer one came over the other;
// only ever move a run forward.
export const isLaterStatus = (next: RunStatus, current: RunStatus) => STATUSES.indexOf(next) > STATUSES.indexOf(current);

// What the latest status event in a batch says about the run: the status
// itself and any fields recorded with it (sandbox id, workdir, error).
export function statusFromEvents(events: SandboxEvent[]): Partial<SandboxRun> | null {
  const latest = [...events].reverse().find((e) => e.kind === "status" && isRunStatus(e.text));
  if (!latest) return null;
  const d = latest.data ?? {};
  const patch: Partial<SandboxRun> = { status: latest.text as RunStatus };
  if (typeof d.sandboxId === "string") patch.sandboxId = d.sandboxId;
  if (typeof d.workdir === "string") patch.workdir = d.workdir;
  if (typeof d.error === "string") patch.error = d.error;
  if (typeof d.errorKind === "string") patch.errorKind = d.errorKind;
  if (typeof d.previewUrl === "string") patch.previewUrl = d.previewUrl;
  if (typeof d.port === "number") patch.port = d.port;
  return patch;
}

export const STATUS_LABEL: Record<RunStatus, string> = {
  queued: "Waiting for a runner…",
  creating: "Creating sandbox…",
  cloning: "Cloning…",
  cloned: "Cloned. Starting the application…",
  paused: "Cloned, sandbox paused",
  launching: "Starting the application…",
  running: "Running",
  usable: "Set up and ready to use",
  no_service: "Nothing to serve",
  failed: "Failed",
  killed: "Stopped",
};

// Insert new events into a list, keeping order by seq and dropping duplicates.
// Realtime delivery and a later full fetch can both hand over the same rows.
export function mergeEvents(existing: SandboxEvent[], incoming: SandboxEvent[]): SandboxEvent[] {
  const bySeq = new Map(existing.map((e) => [e.seq, e]));
  for (const e of incoming) bySeq.set(e.seq, e);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

// Output arrives in chunks that need not end on line boundaries. Rebuild the
// lines the terminal should show, keeping which stream each came from.
export type TermLine = { kind: EventKind; text: string };

export function terminalLines(events: SandboxEvent[]): TermLine[] {
  const lines: TermLine[] = [];
  let open: TermLine | null = null;
  for (const e of events) {
    if (e.kind === "stdout" || e.kind === "stderr") {
      // Carriage returns are git's progress redraws; keep only the last frame.
      const parts = e.text.replace(/\r\n/g, "\n").split("\n");
      for (let i = 0; i < parts.length; i++) {
        const frame = parts[i].split("\r").pop() ?? "";
        const last = i === parts.length - 1;
        if (open && open.kind === e.kind) open.text = parts[i].includes("\r") ? frame : open.text + frame;
        else if (!(last && frame === "")) { open = { kind: e.kind, text: frame }; lines.push(open); }   // a chunk ending in a newline opens nothing
        if (!last) open = null;
      }
      continue;
    }
    open = null;
    if (e.kind === "metrics") continue;
    lines.push({ kind: e.kind, text: e.text });
  }
  return lines;
}
