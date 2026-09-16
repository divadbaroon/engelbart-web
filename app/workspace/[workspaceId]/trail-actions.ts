"use server";

import { createClient } from "@/lib/supabase/server";

// Whether a repository is already known to run, from another project, so
// the workspace can say what preparing it will do before it happens. A
// project's own trail travels with the repository row and needs no lookup.

export type SharedTrail = { at: string; commit: string | null; patchFiles: number };
export type SharedTrailResult = { ok: true; trail: SharedTrail | null } | { ok: false; error: string };

export async function getSharedTrail(repoId: string): Promise<SharedTrailResult> {
  const supabase = await createClient();
  const repo = await supabase.from("engelbart_repos").select("owner, name").eq("id", repoId).maybeSingle();
  if (repo.error) return { ok: false, error: repo.error.message };
  if (!repo.data) return { ok: false, error: "That repository is not in a project you can see." };
  const { owner, name } = repo.data as { owner: string; name: string };
  const { data, error } = await supabase
    .from("engelbart_launch_recipes")
    .select("commit_sha, captured_at, patch_files:recipe->patch->files")
    .eq("owner", owner.toLowerCase()).eq("name", name.toLowerCase())
    .order("captured_at", { ascending: false }).limit(1).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, trail: null };
  const row = data as { commit_sha: string; captured_at: string; patch_files: string[] | null };
  return { ok: true, trail: { at: row.captured_at, commit: row.commit_sha, patchFiles: Array.isArray(row.patch_files) ? row.patch_files.length : 0 } };
}
