"use server";

import { Sandbox } from "e2b";
import { createClient } from "@/lib/supabase/server";
import { decodeFile, isSafeRepoPath, type FileContent, type FileTree } from "@/lib/code-files";

// The files of a run's sandbox: what the Code tab reads and writes while
// the application is running. Reads go through row-level security on the
// run, so only the project's members reach its sandbox.

const LIVE = ["cloned", "launching", "running"];

async function openSandbox(runId: string): Promise<{ sandbox: Sandbox; workdir: string } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("engelbart_sandbox_runs").select("sandbox_id, workdir, status").eq("id", runId).maybeSingle();
  if (error) return { error: error.message };
  if (!data?.sandbox_id || !data.workdir || !LIVE.includes(data.status)) return { error: "The sandbox is not running." };
  try {
    return { sandbox: await Sandbox.connect(data.sandbox_id), workdir: data.workdir };
  } catch (err) {
    return { error: `The sandbox could not be reached: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// Every file git knows about or would add, so build output and dependencies
// stay out of the way. Directories are implied by the paths.
export async function listSandboxFiles(runId: string): Promise<FileTree> {
  const opened = await openSandbox(runId);
  if ("error" in opened) return opened;
  try {
    const result = await opened.sandbox.commands.run("git ls-files --cached --others --exclude-standard -z", { cwd: opened.workdir, timeoutMs: 30_000 });
    const entries = result.stdout.split("\0").filter(Boolean).map((path) => ({ path, type: "blob" as const, size: 0 }));
    return { entries, truncated: false };
  } catch (err) {
    return { error: `The files could not be listed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function readSandboxFile(runId: string, path: string): Promise<FileContent> {
  if (!isSafeRepoPath(path)) return { error: "That is not a path inside the repository." };
  const opened = await openSandbox(runId);
  if ("error" in opened) return opened;
  try {
    const bytes = await opened.sandbox.files.read(`${opened.workdir}/${path}`, { format: "bytes" });
    return decodeFile(bytes);
  } catch (err) {
    return { error: `The file could not be read: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// Writes go straight to disk in the sandbox; dev servers pick them up and
// the Live preview follows. Nothing reaches GitHub.
export async function writeSandboxFile(runId: string, path: string, text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isSafeRepoPath(path)) return { ok: false, error: "That is not a path inside the repository." };
  const opened = await openSandbox(runId);
  if ("error" in opened) return { ok: false, error: opened.error };
  try {
    await opened.sandbox.files.write(`${opened.workdir}/${path}`, text);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `The file could not be saved: ${err instanceof Error ? err.message : String(err)}` };
  }
}
