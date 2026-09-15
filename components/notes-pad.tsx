"use client";

import { useEffect, useRef, useState } from "react";
import type { Goal } from "@/lib/plan";
import { Textarea } from "@/components/ui/textarea";
import { updateGoal } from "@/app/workspace/[workspaceId]/actions";

type NotesPadProps = {
  goal: Pick<Goal, "id" | "title" | "notes" | "updatedAt"> | null;
  onSaved: (goalId: string, notes: string, updatedAt: string) => void;
};

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

// Notes belong to the selected goal and are saved to it a moment after the
// last keystroke, through the same function the CLI's web page uses.
export function NotesPad({ goal, onSaved }: NotesPadProps) {
  const [text, setText] = useState(goal?.notes ?? "");
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expect = useRef<string | null>(goal?.updatedAt ?? null);

  // A different goal: show its notes and forget any pending save.
  useEffect(() => {
    setText(goal?.notes ?? "");
    expect.current = goal?.updatedAt ?? null;
    setState({ kind: "idle" });
    if (timer.current) clearTimeout(timer.current);
  }, [goal?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function edit(value: string) {
    setText(value);
    if (!goal) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(goal.id, value), 800);
  }

  async function save(goalId: string, value: string) {
    setState({ kind: "saving" });
    const result = await updateGoal(goalId, expect.current, { notes: value });
    if (result.ok) {
      expect.current = result.updatedAt;
      onSaved(goalId, value, result.updatedAt);
      setState({ kind: "saved" });
      return;
    }
    if (result.conflict && result.current) {
      // Someone else saved first. Show theirs rather than overwrite it.
      expect.current = result.current.updatedAt;
      setText(result.current.notes);
      onSaved(goalId, result.current.notes, result.current.updatedAt);
      setState({ kind: "error", message: "These notes changed elsewhere; showing the latest version." });
      return;
    }
    setState({ kind: "error", message: result.error });
  }

  if (!goal) {
    return (
      <section aria-label="Notes" className="flex h-full items-center justify-center px-10 text-center text-[13px] text-muted-foreground">
        Select a goal in Plan to write notes for it.
      </section>
    );
  }

  return (
    <section aria-label="Notes" className="flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-center justify-end px-10 pt-4">
        <span role="status" className={state.kind === "error" ? "text-[12px] text-destructive" : "text-[12px] text-muted-foreground"}>
          {state.kind === "saving" ? "Saving…" : state.kind === "saved" ? "Saved" : state.kind === "error" ? state.message : ""}
        </span>
      </div>
      <Textarea
        key={goal.id}
        value={text}
        onChange={(e) => edit(e.target.value)}
        placeholder="Start typing…"
        className="h-full min-h-0 flex-1 resize-none rounded-none border-0 bg-transparent px-10 pt-2 pb-8 text-[15px] leading-[1.65] shadow-none focus-visible:ring-0 md:text-[15px]"
      />
    </section>
  );
}
