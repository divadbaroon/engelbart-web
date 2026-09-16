import { createClient } from "@/lib/supabase/server";
import { PAPER_COLUMNS, toPaper, type Paper, type PaperRow } from "@/lib/papers";

// Reads run as the signed-in user; row-level security scopes the rows.
export async function listPapers(projectId: string): Promise<Paper[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("engelbart_papers")
    .select(PAPER_COLUMNS)
    .eq("project_id", projectId)
    .order("created_at");
  if (error) throw new Error(`Could not load papers: ${error.message}`);
  return (data as PaperRow[]).map(toPaper);
}
