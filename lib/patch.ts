// What the pipeline's repair agent changed in the sandbox copy of a
// repository to get it running. Free of React and of Supabase so the
// desktop app can share it.
import type { SandboxEvent } from "@/lib/sandbox";

// Where a patch that was applied again came from: the run that first
// made it, in this project or another one.
export type PatchOrigin = { commit: string | null; at: string; shared: boolean };

export type RepoPatch = {
  summary: string;
  reason: string;
  files: string[];
  diff: string;
  truncated: boolean;   // the diff was cut at the storage limit; it cannot be replayed
  attempt: number;
  runId: string;
  at: string;
  worked: boolean | null;   // did the run reach running after this? null while unknown
  replayed: boolean;        // re-applied from a saved recipe rather than made in this run
  origin?: PatchOrigin | null;
};

export function toPatch(ev: Record<string, unknown>, runId: string, at: string): RepoPatch | null {
  if (typeof ev.diff !== "string") return null;
  return {
    summary: typeof ev.summary === "string" ? ev.summary : "",
    reason: typeof ev.reason === "string" ? ev.reason : "",
    files: Array.isArray(ev.files) ? ev.files.filter((f): f is string => typeof f === "string") : [],
    diff: ev.diff,
    truncated: !!ev.truncated,
    attempt: typeof ev.attempt === "number" ? ev.attempt : 1,
    runId, at, worked: null,
    replayed: ev.status === "replayed",
  };
}

// The latest patch a run reported, from its event log. `worked` is filled
// in from the run's status by the caller.
export function patchFromEvents(events: SandboxEvent[], runId: string): RepoPatch | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.kind === "status" && e.data?.phase === "patch" && (e.data.status === "applied" || e.data.status === "replayed") && typeof e.data.diff === "string") {
      return toPatch(e.data, runId, e.at);
    }
  }
  return null;
}

// One line of a unified diff, classified for display.
export type DiffLine = { kind: "file" | "hunk" | "add" | "del" | "ctx" | "meta"; text: string };

export function diffLines(diff: string): DiffLine[] {
  return diff.split("\n").map((text) => {
    if (text.startsWith("diff --git") || text.startsWith("+++ ") || text.startsWith("--- ")) return { kind: "file", text };
    if (text.startsWith("@@")) return { kind: "hunk", text };
    if (text.startsWith("+")) return { kind: "add", text };
    if (text.startsWith("-")) return { kind: "del", text };
    if (text.startsWith("index ") || text.startsWith("new file") || text.startsWith("deleted file") || text.startsWith("similarity") || text.startsWith("rename")) return { kind: "meta", text };
    return { kind: "ctx", text };
  });
}
