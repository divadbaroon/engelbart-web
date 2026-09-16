"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { createProject } from "@/app/workspace/actions";

// The "New project" control on the Projects home. The button becomes a
// card-shaped form in the grid, so a new project takes shape where it
// will appear; Enter creates it and opens its workspace.
export function NewProjectButton({ onOpen, open }: { open: boolean; onOpen: () => void }) {
  return (
    <Button variant="outline" size="sm" disabled={open} onClick={onOpen} className="gap-1.5 font-normal">
      <Plus className="size-3.5" />
      New project
    </Button>
  );
}

export function NewProjectCard({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    if (pending) return;
    start(async () => {
      const result = await createProject(name, description);
      if (!result.ok) { setError(result.error); return; }
      router.push(`/workspace/${result.id}`);
    });
  };

  return (
    <Card className="flex min-h-[240px] flex-col gap-0 rounded-lg border-neutral-300 p-6 shadow-none">
      <form
        className="flex flex-1 flex-col"
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } }}
      >
        <Input
          autoFocus
          value={name}
          disabled={pending}
          placeholder="Project name"
          aria-label="Project name"
          onChange={(e) => { setName(e.target.value); setError(null); }}
          className="h-auto border-0 bg-transparent p-0 text-[17px] leading-snug font-medium shadow-none placeholder:text-muted-foreground/60 focus-visible:ring-0"
        />
        <textarea
          value={description}
          disabled={pending}
          placeholder="What this project is for (optional)"
          aria-label="Project description"
          rows={3}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          className="mt-4 w-full resize-none bg-transparent text-[15px] leading-normal text-neutral-800 outline-none placeholder:text-muted-foreground/60 disabled:opacity-50"
        />
        {error && <p role="alert" className="mt-2 text-[12px] text-destructive">{error}</p>}
        <div className="mt-auto flex items-center gap-2 pt-6">
          <Button type="submit" size="sm" disabled={pending || !name.trim()}>
            {pending ? "Creating…" : "Create"}
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onClose} className="font-normal text-muted-foreground">
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
