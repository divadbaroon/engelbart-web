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
};

export const REPO_COLUMNS = "id, owner, name, url, default_branch, description, language, created_at";

export function toRepo(row: RepoRow): Repo {
  return {
    id: row.id, owner: row.owner, name: row.name, fullName: `${row.owner}/${row.name}`, url: row.url,
    defaultBranch: row.default_branch, description: row.description, language: row.language, createdAt: row.created_at,
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
