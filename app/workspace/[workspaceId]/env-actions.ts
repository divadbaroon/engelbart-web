"use server";

import { createClient } from "@/lib/supabase/server";
import { ENV_NAME, MAX_ENV_NAME, MAX_ENV_VALUE, type EnvReport } from "@/lib/environment";

// A repository's saved environment values. Values go in and never come
// back out: the page only learns which names are set and when.

export type SavedEnv = { name: string; updatedAt: string };
export type Environment = { ok: true; saved: SavedEnv[]; report: EnvReport | null } | { ok: false; error: string };
type Outcome = { ok: true } | { ok: false; error: string };

export async function getEnvironment(repoId: string): Promise<Environment> {
  const supabase = await createClient();
  const [values, repo] = await Promise.all([
    supabase.from("engelbart_repo_env").select("name, updated_at").eq("repo_id", repoId).order("name"),
    supabase.from("engelbart_repos").select("env_report").eq("id", repoId).maybeSingle(),
  ]);
  if (values.error) return { ok: false, error: values.error.message };
  if (repo.error) return { ok: false, error: repo.error.message };
  return {
    ok: true,
    saved: ((values.data ?? []) as { name: string; updated_at: string }[]).map((r) => ({ name: r.name, updatedAt: r.updated_at })),
    report: (repo.data as { env_report: EnvReport | null } | null)?.env_report ?? null,
  };
}

export async function setEnvValue(repoId: string, name: string, value: string): Promise<Outcome> {
  const trimmed = name.trim();
  if (!ENV_NAME.test(trimmed) || trimmed.length > MAX_ENV_NAME) return { ok: false, error: "A name is letters, digits and underscores, and cannot start with a digit." };
  if (!value) return { ok: false, error: "Enter a value." };
  if (value.length > MAX_ENV_VALUE || value.includes("\0")) return { ok: false, error: "That value is too long." };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { ok: false, error: "You are not signed in." };
  const { error } = await supabase
    .from("engelbart_repo_env")
    .upsert({ repo_id: repoId, name: trimmed, value, updated_at: new Date().toISOString(), updated_by: userId }, { onConflict: "repo_id,name" });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function removeEnvValue(repoId: string, name: string): Promise<Outcome> {
  const supabase = await createClient();
  const { error } = await supabase.from("engelbart_repo_env").delete().eq("repo_id", repoId).eq("name", name);
  return error ? { ok: false, error: error.message } : { ok: true };
}
