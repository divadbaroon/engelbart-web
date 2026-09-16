import type { EnvReport } from "@/lib/environment";
import type { PatchOrigin, RepoPatch } from "@/lib/patch";

// What is known about running the repository: when a trail was last
// captured, on which commit, how many files it patches, and whether it
// first came from another project.
export type RepoTrail = { at: string; commit: string | null; patchFiles: number; shared: boolean };

// A GitHub repository attached to a project. Rows come from engelbart_repos.
// Kept free of React and of Supabase so the desktop app can share it.
export type Repo = {
  id: string;
  owner: string;
  name: string;
  fullName: string;   // owner/name
  url: string;
  defaultBranch: string;
  description: string;
  language: string;
  createdAt: string;
  envReport: EnvReport | null;   // the latest run's environment scan
  patch: RepoPatch | null;       // edits the repair agent made to get it running
  trail: RepoTrail | null;       // the saved way to run it, if any
};

export type RepoRow = {
  id: string;
  owner: string;
  name: string;
  url: string;
  default_branch: string;
  description: string;
  language: string;
  created_at: string;
  env_report: EnvReport | null;
  patch: RepoPatch | null;
  recipe_at: string | null;
  recipe_commit: string | null;              // launch_recipe->>commit
  recipe_origin: PatchOrigin | null;         // launch_recipe->origin
  recipe_patch_files: string[] | null;       // launch_recipe->patch->files
};

// The recipe itself stays on the server; only what describes it is read.
export const REPO_COLUMNS = "id, owner, name, url, default_branch, description, language, created_at, env_report, patch, recipe_at, recipe_commit:launch_recipe->>commit, recipe_origin:launch_recipe->origin, recipe_patch_files:launch_recipe->patch->files";

export function toRepo(row: RepoRow): Repo {
  return {
    id: row.id, owner: row.owner, name: row.name, fullName: `${row.owner}/${row.name}`, url: row.url,
    defaultBranch: row.default_branch, description: row.description, language: row.language, createdAt: row.created_at, envReport: row.env_report ?? null, patch: row.patch ?? null,
    trail: row.recipe_at ? { at: row.recipe_at, commit: row.recipe_commit ?? null, patchFiles: Array.isArray(row.recipe_patch_files) ? row.recipe_patch_files.length : 0, shared: !!row.recipe_origin?.shared } : null,
  };
}

// What the reader may paste: a github.com URL with or without scheme, .git
// or a deeper path, or a bare owner/name.
export function parseGitHubRepo(input: string): { owner: string; name: string } | null {
  const text = input.trim();
  if (!text) return null;
  const m =
    text.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[/?#].*)?$/) ??
    text.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/);
  if (!m) return null;
  const [, owner, name] = m;
  if (owner.startsWith(".") || name.startsWith(".")) return null;
  return { owner, name };
}

export const repoMeta = (repo: Repo) =>
  [repo.defaultBranch, repo.language].filter(Boolean).join(" · ") || repo.description || "GitHub";
