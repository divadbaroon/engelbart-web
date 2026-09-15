"use server";

import { createClient } from "@/lib/supabase/server";
import type { Goal, GoalStatus } from "@/lib/plan";

// Writes go through the functions the existing product uses. hc_update_goal
// carries the updated_at the client last saw and refuses the write if the
// row moved since, so two editors never silently overwrite each other.

export type UpdateGoalResult =
  | { ok: true; updatedAt: string }
  | { ok: false; conflict: boolean; error: string; current?: { notes: string; status: GoalStatus; title: string; updatedAt: string } };

type GoalFields = { notes?: string; status?: GoalStatus; title?: string };

export async function updateGoal(goalId: string, expect: string | null, fields: GoalFields): Promise<UpdateGoalResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hc_update_goal", { p_goal_id: goalId, p_expect: expect, p_fields: fields });
  if (error) return { ok: false, conflict: false, error: error.message };
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) {
    const conflict = r.conflict === true;
    return {
      ok: false,
      conflict,
      error: typeof r.error === "string" ? r.error : "The change was refused.",
      current: conflict
        ? { notes: String(r.notes ?? ""), status: r.status as GoalStatus, title: String(r.title ?? ""), updatedAt: String(r.updated_at) }
        : undefined,
    };
  }
  return { ok: true, updatedAt: String(r.updated_at) };
}

export type CreateGoalResult = { ok: true; goal: Goal } | { ok: false; error: string };

export async function createGoal(projectId: string, title: string, parentId: string | null): Promise<CreateGoalResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hc_create_goal", { p_project_id: projectId, p_title: title, p_parent_id: parentId });
  if (error) return { ok: false, error: error.message };
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) return { ok: false, error: typeof r.error === "string" ? r.error : "The goal could not be added." };
  return {
    ok: true,
    goal: {
      id: String(r.id), parentId, localId: String(r.local_id ?? ""), title: title.trim() || "Untitled",
      status: "active", description: "", notes: "", updatedAt: String(r.updated_at), todos: [], subgoals: [],
    },
  };
}
