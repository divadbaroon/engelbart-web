import { createClient } from "@/lib/supabase/server";
import { buildPlan, type GoalRow, type Plan, type TodoRow } from "@/lib/plan";

// Reads run as the signed-in user; row-level security scopes the rows.
export async function loadPlan(projectId: string): Promise<Plan> {
  const supabase = await createClient();
  const [goals, todos] = await Promise.all([
    supabase
      .from("hc_goals")
      .select("id, parent_id, local_id, title, status, description, notes, updated_at")
      .eq("project_id", projectId)
      .not("status", "in", "(archived,abandoned)"),
    supabase
      .from("hc_todos")
      .select("id, goal_id, text, status, position, depth, question")
      .eq("project_id", projectId)
      .order("position"),
  ]);
  if (goals.error) throw new Error(`Could not load goals: ${goals.error.message}`);
  if (todos.error) throw new Error(`Could not load todos: ${todos.error.message}`);
  return buildPlan(goals.data as GoalRow[], todos.data as TodoRow[]);
}
