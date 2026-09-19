import { createClient } from "@/lib/supabase/server";
import { REPO_COLUMNS, toRepo, type Repo, type RepoRow } from "@/lib/repos";

export { REPO_COLUMNS, toRepo, type RepoRow };

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

// One repository, if it is in the project and the signed-in user can see it.
export async function getRepo(projectId: string, id: string): Promise<Repo | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("engelbart_repos").select(REPO_COLUMNS).eq("id", id).eq("project_id", projectId).maybeSingle();
  if (error) throw new Error(`Could not load repository: ${error.message}`);
  return data ? toRepo(data as RepoRow) : null;
}
