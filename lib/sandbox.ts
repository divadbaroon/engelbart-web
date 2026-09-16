// A sandbox run: one attempt to bring a repository up in a hosted sandbox,
// and the events it produced along the way. Rows come from
// engelbart_sandbox_runs and engelbart_sandbox_events. Free of React and of
// Supabase so the desktop app can share it.

export type RunStatus = "queued" | "creating" | "cloning" | "cloned" | "paused" | "launching" | "running" | "failed" | "killed";
export type EventKind = "status" | "command" | "stdout" | "stderr" | "metrics" | "error";

export type SandboxRun = {
  id: string;
  repoId: string;
  sandboxId: string | null;
  template: string;
  status: RunStatus;
  workdir: string | null;
  errorKind: string | null;
  error: string | null;
  port: number | null;
  previewUrl: string | null;
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
  status: RunStatus;
  workdir: string | null;
  error_kind: string | null;
  error: string | null;
  port: number | null;
  preview_url: string | null;
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

export const RUN_COLUMNS = "id, repo_id, sandbox_id, template, status, workdir, error_kind, error, port, preview_url, started_at, finished_at";
export const EVENT_COLUMNS = "id, run_id, seq, at, kind, text, data";

export const toRun = (r: RunRow): SandboxRun => ({
  id: r.id, repoId: r.repo_id, sandboxId: r.sandbox_id, template: r.template, status: r.status, workdir: r.workdir,
  errorKind: r.error_kind, error: r.error, port: r.port, previewUrl: r.preview_url, startedAt: r.started_at, finishedAt: r.finished_at,
});

export const toEvent = (e: EventRow): SandboxEvent => ({
  id: e.id, runId: e.run_id, seq: e.seq, at: e.at, kind: e.kind, text: e.text, data: e.data,
});

// Still doing something: creating the sandbox, cloning, or bringing the app up.
export const isRunActive = (run: SandboxRun | undefined) =>
  !!run && (run.status === "queued" || run.status === "creating" || run.status === "cloning" || run.status === "launching");

// The repository is in a sandbox, waiting to be launched.
export const isRunCloned = (run: SandboxRun | undefined) =>
  !!run && (run.status === "cloned" || run.status === "paused");

// The application is up and has a preview URL.
export const isRunRunning = (run: SandboxRun | undefined) => !!run && run.status === "running" && !!run.previewUrl;

const STATUSES: RunStatus[] = ["queued", "creating", "cloning", "cloned", "paused", "launching", "running", "failed", "killed"];
const isRunStatus = (s: string): s is RunStatus => (STATUSES as string[]).includes(s);

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
  queued: "Queued",
  creating: "Creating sandbox…",
  cloning: "Cloning…",
  cloned: "Cloned",
  paused: "Cloned, sandbox paused",
  launching: "Starting the application…",
  running: "Running",
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
