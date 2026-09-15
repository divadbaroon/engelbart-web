"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Goal = { id: string; title: string; done: boolean; parentId?: string };

const INITIAL_GOALS: Goal[] = [{ id: "g1", title: "Set up next.js", done: false }];

export function PlanGoals() {
  const [goals, setGoals] = useState<Goal[]>(INITIAL_GOALS);

  const update = (id: string, patch: Partial<Goal>) =>
    setGoals((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)));

  const addSubgoal = () =>
    setGoals((gs) => [...gs, { id: crypto.randomUUID(), title: "", done: false, parentId: "g1" }]);

  return (
    <>
      <ul className="flex flex-col gap-2">
        {goals.map((goal) => (
          <li
            key={goal.id}
            className={cn(
              "flex items-center gap-3 rounded-lg border bg-background px-4",
              goal.parentId ? "ml-6 h-10" : "h-[46px]",
            )}
          >
            <Checkbox
              id={goal.id}
              checked={goal.done}
              onCheckedChange={(v) => update(goal.id, { done: v === true })}
              className="size-3.5 rounded-full border-foreground/70"
            />
            {goal.parentId ? (
              <Input
                autoFocus
                value={goal.title}
                placeholder="New subgoal"
                onChange={(e) => update(goal.id, { title: e.target.value })}
                className={cn(
                  "h-auto border-0 bg-transparent p-0 text-sm font-medium shadow-none focus-visible:ring-0",
                  goal.done && "line-through",
                )}
              />
            ) : (
              <Label
                htmlFor={goal.id}
                className={cn("truncate text-[15px] font-medium", goal.done && "line-through")}
              >
                {goal.title}
              </Label>
            )}
          </li>
        ))}
      </ul>

      <Button
        variant="ghost"
        size="sm"
        onClick={addSubgoal}
        className="w-fit px-3 font-normal text-muted-foreground"
      >
        + Add subgoal
      </Button>
    </>
  );
}
