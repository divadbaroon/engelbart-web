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
