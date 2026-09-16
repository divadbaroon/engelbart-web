// The boundary between the workspace and whatever runs the code. The hosted
// app implements it with E2B; the desktop app can implement it locally.
import type { Repo } from "@/lib/repos";
import type { EventKind, RunStatus, SandboxRun } from "@/lib/sandbox";

// Where a run writes what happened. Every status change, command and chunk
// of output goes through here, so the record is complete by construction.
export type Recorder = {
  status: (status: RunStatus, fields?: Partial<RunFields>) => Promise<void>;
  event: (kind: EventKind, text: string, data?: Record<string, unknown>) => void;
  flush: () => Promise<void>;
};

export type RunFields = {
  sandboxId: string;
  workdir: string;
  errorKind: string;
  error: string;
  previewUrl: string;
  port: number;
};

export type PrepareOutcome =
  | { ok: true; sandboxId: string; workdir: string }
  | { ok: false; kind: string; message: string };

export type LaunchOutcome =
  // `done` settles when the application stops, however that happens; the
  // run's status has been recorded by then.
  | { ok: true; previewUrl: string; port: number; done: Promise<void> }
  | { ok: false; kind: string; message: string };

export type Runtime = {
  // Bring the repository into a fresh sandbox and leave it ready for the next step.
  prepare: (repo: Repo, runId: string, record: Recorder) => Promise<PrepareOutcome>;
  // Bring the application up in the run's sandbox and report where it is served.
  launch: (repo: Repo, run: SandboxRun, record: Recorder) => Promise<LaunchOutcome>;
};
