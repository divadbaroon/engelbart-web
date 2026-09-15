import { createClient } from "@/lib/supabase/server";
import type { Repo } from "@/lib/repos";

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

// Reads run as the signed-in user; row-level security scopes the rows.
export async function listRepos(projectId: string): Promise<Repo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("engelbart_repos")
    .select(REPO_COLUMNS)
    .eq("project_id", projectId)
    .order("created_at");
  if (error) throw new Error(`Could not load repositories: ${error.message}`);
  return (data as RepoRow[]).map(toRepo);
}
