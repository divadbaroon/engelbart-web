"use server";

import { createClient } from "@/lib/supabase/server";
import { RECORDING_COLUMNS, REPLAYS_BUCKET, byRunThenMade, defaultName, toRecording, type Recording, type RecordingOnRun, type RecordingRow } from "@/lib/trace/recording";
import type { RunStatus } from "@/lib/sandbox";

// Recordings of a run, as the signed-in member: list, start, stop, rename,
// delete. A recording is a name and two clock readings over the run's
// trace; starting one changes nothing about the run or its capture, and
// deleting one deletes nothing else. The clock is this server's; the
// trace's events carry the sandbox's, and the two are compared when a
// recording is opened.
export type RecordingResult = { ok: true; recording: Recording } | { ok: false; error: string };

export async function listRecordings(runId: string): Promise<{ ok: true; recordings: Recording[] } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("engelbart_recordings").select(RECORDING_COLUMNS).eq("run_id", runId).order("started_at");
  if (error) return { ok: false, error: describe(error.message) };
  return { ok: true, recordings: (data as RecordingRow[]).map(toRecording) };
}

// The same repository's recordings from every run but this one.
//
// Recordings belong to a run and are read against that run's trace, so
// this is not the open run's list and is never merged into it. It is the
// answer to the question the empty list used to raise: a relaunch made
// four recordings disappear, and nothing anywhere said they were still
// there, on the run they were made on.
//
// Failures are quiet on purpose. This is context beside the real list,
// and the real list surviving is worth more than a banner about the
// context.
export async function listEarlierRecordings(runId: string): Promise<RecordingOnRun[]> {
  const supabase = await createClient();
  const { data: run } = await supabase.from("engelbart_sandbox_runs").select("repo_id").eq("id", runId).maybeSingle();
  if (!run) return [];
  const { data: runs } = await supabase
    .from("engelbart_sandbox_runs")
    .select("id, status, started_at, commit_sha")
    .eq("repo_id", (run as { repo_id: string }).repo_id)
    .neq("id", runId)
    .order("started_at", { ascending: false });
  const earlier = (runs ?? []) as { id: string; status: RunStatus; started_at: string; commit_sha: string | null }[];
  if (!earlier.length) return [];
  const { data } = await supabase.from("engelbart_recordings").select(RECORDING_COLUMNS).in("run_id", earlier.map((r) => r.id));
  const byRun = new Map(earlier.map((r) => [r.id, r]));
  return ((data ?? []) as RecordingRow[])
    .map((row) => {
      const on = byRun.get(row.run_id);
      return on ? { recording: toRecording(row), run: { id: on.id, status: on.status, startedAt: on.started_at, commit: on.commit_sha } } : null;
    })
    .filter((r): r is RecordingOnRun => r !== null)
    .sort(byRunThenMade);
}

// One recording at a time: if one is open on the run already, it is the
// one returned, not a second.
export async function startRecording(runId: string): Promise<RecordingResult> {
  const supabase = await createClient();
  const { data: run, error: runError } = await supabase.from("engelbart_sandbox_runs").select("project_id").eq("id", runId).maybeSingle();
  if (runError) return { ok: false, error: runError.message };
  if (!run) return { ok: false, error: "That run is no longer there." };
  const { count } = await supabase.from("engelbart_recordings").select("id", { count: "exact", head: true }).eq("run_id", runId);
  const { data, error } = await supabase
    .from("engelbart_recordings")
    .insert({ run_id: runId, project_id: run.project_id, name: defaultName((count ?? 0) + 1), status: "recording", started_at: new Date().toISOString() })
    .select(RECORDING_COLUMNS).single();
  if (!error) return { ok: true, recording: toRecording(data as RecordingRow) };
  if (/duplicate key|unique/i.test(error.message)) {
    // The one-at-a-time index refused it: a recording is already open on
    // this run. Return that one; if it cannot be read back it belongs to
    // someone else's tab, which is a sentence, not a Postgres error.
    const { data: open } = await supabase.from("engelbart_recordings").select(RECORDING_COLUMNS).eq("run_id", runId).eq("status", "recording").maybeSingle();
    if (open) return { ok: true, recording: toRecording(open as RecordingRow) };
    return { ok: false, error: "A recording is already running on this run." };
  }
  return { ok: false, error: describe(error.message) };
}

// `replayPath` is the object the browser has already uploaded, if the
// preview was being captured. It is written in the same update that
// completes the recording, so a recording is never marked complete holding
// a path to something that is not there — the object exists before this is
// called, and the row is what makes it findable.
export async function stopRecording(id: string, replayPath: string | null = null): Promise<RecordingResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("engelbart_recordings")
    .update({ status: "complete", stopped_at: new Date().toISOString(), ...(replayPath ? { replay_path: replayPath } : {}) })
    .eq("id", id).eq("status", "recording")
    .select(RECORDING_COLUMNS).maybeSingle();
  if (error) return { ok: false, error: describe(error.message) };
  if (data) return { ok: true, recording: toRecording(data as RecordingRow) };
  // No row came back: either it was stopped already, from another tab, or
  // the update matched nothing this member may write. Only a recording
  // that is actually complete counts as stopped.
  const { data: existing } = await supabase.from("engelbart_recordings").select(RECORDING_COLUMNS).eq("id", id).maybeSingle();
  if (!existing) return { ok: false, error: "That recording is no longer there." };
  const recording = toRecording(existing as RecordingRow);
  return recording.status === "complete" ? { ok: true, recording } : { ok: false, error: "That recording could not be stopped." };
}

export async function renameRecording(id: string, name: string): Promise<RecordingResult> {
  const clean = name.trim().slice(0, 120);
  if (!clean) return { ok: false, error: "A recording needs a name." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("engelbart_recordings").update({ name: clean }).eq("id", id).select(RECORDING_COLUMNS).maybeSingle();
  if (error) return { ok: false, error: describe(error.message) };
  return data ? { ok: true, recording: toRecording(data as RecordingRow) } : { ok: false, error: "That recording is no longer there." };
}

export async function deleteRecording(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  // A delete that matches nothing returns no error, so the deleted row is
  // asked for: gone means gone, and nothing deleted is said out loud.
  const { data, error } = await supabase.from("engelbart_recordings").delete().eq("id", id).select("id, replay_path").maybeSingle();
  if (error) return { ok: false, error: describe(error.message) };
  if (!data) return { ok: false, error: "That recording could not be deleted." };
  // The row is what made the object findable, so it goes too. Row first:
  // a file left behind is waste, a row pointing at nothing is a broken
  // recording. This is the order the papers path takes, for the same reason.
  const path = (data as { replay_path: string | null }).replay_path;
  if (path) await supabase.storage.from(REPLAYS_BUCKET).remove([path]);
  return { ok: true };
}

const describe = (message: string) =>
  /relation .* does not exist|schema cache/i.test(message) ? "The recordings table is not in the database yet: apply the recordings migration."
  // A column this code reads but the database does not have yet. It
  // reads as a Postgres error and means one thing: a migration that has
  // not been applied.
  : /column .*replay_path|replay_path.* does not exist/i.test(message) ? "This database has no replay column yet: apply the recording replay migration."
  : message;
