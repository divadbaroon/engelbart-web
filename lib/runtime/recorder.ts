import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventKind, RunStatus } from "@/lib/sandbox";
import type { Recorder, RunFields } from "@/lib/runtime/types";

const FIELD_COLUMNS: Record<keyof RunFields, string> = {
  sandboxId: "sandbox_id", workdir: "workdir", errorKind: "error_kind", error: "error", previewUrl: "preview_url", port: "port", services: "services", template: "template",
};

const FINAL: RunStatus[] = ["paused", "failed", "killed"];

// Writes a run's status changes and events to the database, in order, and
// mirrors each one to the server log as a single JSON line so the two can be
// joined on run id and sandbox id.
export function createRecorder(supabase: SupabaseClient, runId: string): Recorder {
  let seq = 0;
  let sandboxId: string | undefined;
  // Inserts are chained so events land in the order they were recorded even
  // when stdout and stderr callbacks interleave.
  let queue: Promise<void> = Promise.resolve();

  const log = (entry: Record<string, unknown>) =>
    console.log(JSON.stringify({ at: new Date().toISOString(), scope: "sandbox", run: runId, sandbox: sandboxId, ...entry }));

  const enqueue = (kind: EventKind, text: string, data?: Record<string, unknown>) => {
    const row = { run_id: runId, seq: seq++, kind, text, data: data ?? null };
    queue = queue.then(async () => {
      const { error } = await supabase.from("engelbart_sandbox_events").insert(row);
      if (error) log({ level: "error", event: "record-failed", kind, message: error.message });
    });
  };

  return {
    event(kind, text, data) {
      if (kind !== "stdout" && kind !== "stderr") log({ level: kind === "error" ? "error" : "info", event: kind, text, ...data });
      enqueue(kind, text, data);
    },
    async status(status, fields = {}) {
      if (fields.sandboxId) sandboxId = fields.sandboxId;
      const patch: Record<string, unknown> = { status };
      for (const [key, value] of Object.entries(fields)) if (value !== undefined) patch[FIELD_COLUMNS[key as keyof RunFields]] = value;
      if (FINAL.includes(status)) patch.finished_at = new Date().toISOString();
      this.event("status", status, fields);
      await queue;
      // A run the user stopped stays stopped, whatever the sandbox reports afterwards.
      const { error } = await supabase.from("engelbart_sandbox_runs").update(patch).eq("id", runId).neq("status", "killed");
      if (error) log({ level: "error", event: "status-failed", status, message: error.message });
    },
    flush: () => queue,
  };
}
