// The plan as the workspace shows it: a project's goals, each with its
// subgoals and todos. Rows come from hc_goals and hc_todos, the tables the
// Engelbart CLI syncs to. Kept free of React and of Supabase.

export type GoalStatus = "active" | "in_progress" | "completed" | "archived" | "abandoned";
export type TodoStatus = "" | "queued" | "building" | "asking" | "done" | "failed";

export type Todo = {
  id: string;
  text: string;
  status: TodoStatus;
  position: number;
  depth: number;
  question: string;
};

export type Goal = {
  id: string;
  parentId: string | null;
  localId: string;
  title: string;
  status: GoalStatus;
  description: string;
  notes: string;
  updatedAt: string | null;
  todos: Todo[];
  subgoals: Goal[];
};

export type Plan = { goals: Goal[] };

export type GoalRow = {
  id: string;
  parent_id: string | null;
  local_id: string;
  title: string;
  status: GoalStatus;
  description: string;
  notes: string;
  updated_at: string | null;
};

export type TodoRow = {
  id: string;
  goal_id: string;
  text: string;
  status: TodoStatus;
  position: number;
  depth: number;
  question: string;
};

export const isDone = (goal: Pick<Goal, "status">) => goal.status === "completed";

// Local ids are the CLI's "g1", "g2", "g10": sort the number, not the text.
function byLocalId(a: GoalRow, b: GoalRow) {
  const na = Number(a.local_id.replace(/\D/g, "")) || 0;
  const nb = Number(b.local_id.replace(/\D/g, "")) || 0;
  return na - nb || a.local_id.localeCompare(b.local_id);
}

export function buildPlan(goalRows: GoalRow[], todoRows: TodoRow[]): Plan {
  const todosByGoal = new Map<string, Todo[]>();
  for (const t of todoRows) {
    const list = todosByGoal.get(t.goal_id) ?? [];
    list.push({ id: t.id, text: t.text, status: t.status, position: t.position, depth: t.depth, question: t.question });
    todosByGoal.set(t.goal_id, list);
  }
  const goals = new Map<string, Goal>();
  for (const r of [...goalRows].sort(byLocalId)) {
    goals.set(r.id, {
      id: r.id, parentId: r.parent_id, localId: r.local_id, title: r.title, status: r.status,
      description: r.description, notes: r.notes, updatedAt: r.updated_at,
      todos: (todosByGoal.get(r.id) ?? []).sort((a, b) => a.position - b.position),
      subgoals: [],
    });
  }
  const roots: Goal[] = [];
  for (const g of goals.values()) {
    const parent = g.parentId ? goals.get(g.parentId) : undefined;
    if (parent) parent.subgoals.push(g);
    else if (!g.parentId) roots.push(g);
    // A child whose parent is archived is left out with it.
  }
  return { goals: roots };
}

export function findGoal(goals: Goal[], id: string): Goal | null {
  for (const g of goals) {
    if (g.id === id) return g;
    const inner = findGoal(g.subgoals, id);
    if (inner) return inner;
  }
  return null;
}

export function patchGoal(goals: Goal[], id: string, patch: Partial<Goal>): Goal[] {
  return goals.map((g) => (g.id === id ? { ...g, ...patch } : { ...g, subgoals: patchGoal(g.subgoals, id, patch) }));
}

export function addSubgoal(goals: Goal[], parentId: string, goal: Goal): Goal[] {
  return goals.map((g) =>
    g.id === parentId ? { ...g, subgoals: [...g.subgoals, goal] } : { ...g, subgoals: addSubgoal(g.subgoals, parentId, goal) },
  );
}

export function todoSummary(goal: Goal) {
  const total = goal.todos.length;
  const done = goal.todos.filter((t) => t.status === "done").length;
  return { done, total };
}
