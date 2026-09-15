"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { isDone, todoSummary, type Goal } from "@/lib/plan";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

export type PlanActions = {
  goals: Goal[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleDone: (goal: Goal) => void;
  onAddSubgoal: (parentId: string, title: string) => Promise<void>;
  error: string | null;
};

// The plan: each top-level goal, its subgoals indented under it, and a row
// to add a subgoal under whichever goal is selected.
export function PlanGoals({ goals, selectedId, onSelect, onToggleDone, onAddSubgoal, error }: PlanActions) {
  const [draft, setDraft] = useState<{ parentId: string; title: string } | null>(null);

  async function commitDraft() {
    if (!draft) return;
    const { parentId, title } = draft;
    setDraft(null);
    if (title.trim()) await onAddSubgoal(parentId, title);
  }

  if (!goals.length) {
    return <p className="px-3 text-[13px] text-muted-foreground">No goals yet. Start one from the Engelbart CLI and it will appear here.</p>;
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {goals.map((goal) => (
          <GoalRows key={goal.id} goal={goal} depth={0} selectedId={selectedId} onSelect={onSelect} onToggleDone={onToggleDone} />
        ))}
        {draft && (
          <li className="ml-6 flex h-10 items-center gap-3 rounded-lg border bg-background px-4">
            <span className="size-3.5 rounded-full border border-foreground/30" aria-hidden="true" />
            <Input
              autoFocus
              value={draft.title}
              placeholder="New subgoal"
              aria-label="New subgoal"
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              onBlur={commitDraft}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commitDraft(); }
                if (e.key === "Escape") { e.preventDefault(); setDraft(null); }
              }}
              className="h-auto border-0 bg-transparent p-0 text-sm font-medium shadow-none focus-visible:ring-0"
            />
          </li>
        )}
      </ul>

      {error && <p role="alert" className="px-3 text-[12px] text-destructive">{error}</p>}

      <Button
        variant="ghost"
        size="sm"
        disabled={!selectedId || !!draft}
        title={selectedId ? undefined : "Select a goal first"}
        onClick={() => selectedId && setDraft({ parentId: selectedId, title: "" })}
        className="w-fit px-3 font-normal text-muted-foreground"
      >
        + Add subgoal
      </Button>
    </>
  );
}

type GoalRowsProps = {
  goal: Goal;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleDone: (goal: Goal) => void;
};

function GoalRows({ goal, depth, selectedId, onSelect, onToggleDone }: GoalRowsProps) {
  const done = isDone(goal);
  const selected = goal.id === selectedId;
  const { done: todosDone, total } = todoSummary(goal);
  return (
    <>
      <li
        className={cn(
          "flex items-center gap-3 rounded-lg border bg-background px-4",
          depth === 0 ? "h-[46px]" : "h-10",
          depth === 1 && "ml-6",
          depth >= 2 && "ml-12",
          selected && "border-foreground/40",
        )}
      >
        <Checkbox
          id={`goal-${goal.id}`}
          checked={done}
          aria-label={done ? `Reopen ${goal.title}` : `Complete ${goal.title}`}
          onCheckedChange={() => onToggleDone(goal)}
          className="size-3.5 rounded-full border-foreground/70"
        />
        <button
          type="button"
          onClick={() => onSelect(goal.id)}
          aria-current={selected ? "true" : undefined}
          title={goal.title}
          className={cn(
            "min-w-0 flex-1 truncate text-left font-medium outline-none",
            depth === 0 ? "text-[15px]" : "text-sm",
            done && "text-muted-foreground line-through",
          )}
        >
          {goal.title || "Untitled"}
        </button>
        {total > 0 && (
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground" title={`${todosDone} of ${total} todos done`}>
            {todosDone}/{total}
          </span>
        )}
      </li>
      {goal.subgoals.map((sub) => (
        <GoalRows key={sub.id} goal={sub} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} onToggleDone={onToggleDone} />
      ))}
    </>
  );
}
