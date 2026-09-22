// The boundary between the workspace and whatever runs the code. The hosted
// app implements it with E2B; the desktop app can implement it locally.
import type { Repo } from "@/lib/repos";
import type { EventKind, PreviewService, RunBrief, RunEscalation, RunStatus, RunUsage, SandboxRun } from "@/lib/sandbox";
import type { EnvReport } from "@/lib/environment";
import type { RepoPatch } from "@/lib/patch";
import type { ContentCapture } from "@/lib/trace/types";
import type { Collector } from "@/lib/trace/collector";

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
  usage: RunUsage | null;
  brief: RunBrief | null;
  escalation: RunEscalation | null;
  template: string;   // which runner image the sandbox came from
  commit: string | null;   // what the clone checked out
};

// Docker means the larger runner image with Docker, Compose and the
// Supabase CLI, for repositories that bring up their own services.
export type PrepareOptions = { docker?: boolean };

export type PrepareOutcome =
  | { ok: true; sandboxId: string; workdir: string; commit: string | null }
  | { ok: false; kind: string; message: string };

// A launch recipe is the pipeline's validated plan from a run that worked,
// opaque to us: it is handed back to the pipeline to replay.
export type LaunchRecipe = Record<string, unknown>;

export type LaunchOutcome =
  // `done` settles when the application stops, however that happens; the
  // run's status has been recorded by then. `recipe` is what worked this
  // time, for saving; `recipeFailed` says the saved one had to be dropped.
  // With `usable`, nothing is served: the repository is installed and
  // checked, and the sandbox stays up with a shell; there is no preview.
  | { ok: true; usable?: boolean; previewUrl: string | null; port: number | null; services: PreviewService[]; done: Promise<void>; recipe: LaunchRecipe | null; recipeFailed: boolean }
  | { ok: false; kind: string; message: string; recipeFailed: boolean };

export type LaunchOptions = {
  recipe?: LaunchRecipe | null;
  // Values saved for the repository, handed to the pipeline for names its
  // scan finds. Never logged.
  env?: Record<string, string> | null;
  // Called once the pipeline has scanned the environment, before the app starts.
  onEnvironment?: (report: EnvReport) => void;
  // Called when the repair agent has edited the repository copy, or a
  // saved patch was re-applied. `worked` is unknown at that point.
  onPatch?: (patch: RepoPatch) => void;
  // The person's one line about what to run, for the planner.
  hint?: string | null;
  // The brief made for this commit by an earlier run, so this one does
  // not make it again.
  brief?: RunBrief | null;
  // Record a behavior trace: model calls through a gateway in the sandbox,
  // with their content ("full") or only its shape ("metadata"), written by
  // the collector. Null means no gateway and no instrumentation.
  trace?: { capture: ContentCapture; collector: Collector } | null;
};

export type Runtime = {
  // Bring the repository into a fresh sandbox and leave it ready for the next step.
  prepare: (repo: Repo, runId: string, record: Recorder, options?: PrepareOptions) => Promise<PrepareOutcome>;
  // Bring the application up in the run's sandbox and report where it is served.
  launch: (repo: Repo, run: SandboxRun, record: Recorder, options?: LaunchOptions) => Promise<LaunchOutcome>;
};
