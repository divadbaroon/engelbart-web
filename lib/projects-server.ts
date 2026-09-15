import { createClient } from "@/lib/supabase/server";
import type { Project } from "@/lib/projects";

// Reads run as the signed-in user, so row-level security decides what is
// visible: the projects they own and the ones they are a member of.

type Row = {
  id: string;
  name: string;
  description: string;
  objective: string;
  cwd: string;
  updated_at: string | null;
  hc_goals: { count: number }[];
  hc_chats: { count: number }[];
};

const COLUMNS = "id, name, description, objective, cwd, updated_at, hc_goals(count), hc_chats(count)";

function toProject(row: Row): Project {
  return {
    id: row.id,
    name: row.name || "Untitled project",
    description: row.description || row.objective || "",
    path: row.cwd,
    goals: row.hc_goals[0]?.count ?? 0,
    chats: row.hc_chats[0]?.count ?? 0,
    updatedAt: row.updated_at,
  };
}

export async function listProjects(): Promise<Project[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hc_projects")
    .select(COLUMNS)
    .is("hc_goals.parent_id", null)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`Could not load projects: ${error.message}`);
  return (data as Row[]).map(toProject);
}

export async function getProject(id: string): Promise<Project | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hc_projects")
    .select(COLUMNS)
    .eq("id", id)
    .is("hc_goals.parent_id", null)
    .maybeSingle();
  if (error) throw new Error(`Could not load project: ${error.message}`);
  return data ? toProject(data as Row) : null;
}
