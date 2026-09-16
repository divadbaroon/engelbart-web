// The boundary between the workspace and whatever runs the code. The hosted
// app implements it with E2B; the desktop app can implement it locally.
import type { Repo } from "@/lib/repos";
import type { EventKind, PreviewService, RunStatus, SandboxRun } from "@/lib/sandbox";

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
  services: PreviewService[];
};

export type PrepareOutcome =
  | { ok: true; sandboxId: string; workdir: string }
  | { ok: false; kind: string; message: string };

// A launch recipe is the pipeline's validated plan from a run that worked,
// opaque to us: it is handed back to the pipeline to replay.
export type LaunchRecipe = Record<string, unknown>;

export type LaunchOutcome =
  // `done` settles when the application stops, however that happens; the
  // run's status has been recorded by then. `recipe` is what worked this
  // time, for saving; `recipeFailed` says the saved one had to be dropped.
  | { ok: true; previewUrl: string; port: number; services: PreviewService[]; done: Promise<void>; recipe: LaunchRecipe | null; recipeFailed: boolean }
  | { ok: false; kind: string; message: string; recipeFailed: boolean };

export type LaunchOptions = { recipe?: LaunchRecipe | null };

export type Runtime = {
  // Bring the repository into a fresh sandbox and leave it ready for the next step.
  prepare: (repo: Repo, runId: string, record: Recorder) => Promise<PrepareOutcome>;
  // Bring the application up in the run's sandbox and report where it is served.
  launch: (repo: Repo, run: SandboxRun, record: Recorder, options?: LaunchOptions) => Promise<LaunchOutcome>;
};
