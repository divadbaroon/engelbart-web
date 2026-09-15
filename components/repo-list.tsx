"use client";

import { GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Repo } from "@/lib/repos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type RepoStatus = "none" | "preparing" | "ready";

type RepoListProps = {
  repos: Repo[];
  activeId: string | null;
  statusOf: (id: string) => RepoStatus;
  onOpen: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onCommit: (id: string) => void;
};

const DOT: Record<RepoStatus, string> = { none: "bg-transparent", preparing: "bg-neutral-300", ready: "bg-green-500" };
const DOT_TITLE: Record<RepoStatus, string> = { none: "", preparing: "Preparing…", ready: "Ready" };

export function RepoList({ repos, activeId, statusOf, onOpen, onAdd, onRename, onCommit }: RepoListProps) {
  return (
    <>
      <ul className="flex flex-col gap-2">
        {repos.map((repo) =>
          repo.isNew ? (
            <li key={repo.id} className="flex h-[46px] items-center gap-2.5 rounded-lg border bg-background px-3.5">
              <GitBranch className="size-[15px] shrink-0 text-muted-foreground" />
              <Input
                autoFocus
                value={repo.name}
                placeholder="owner/repository"
                onChange={(e) => onRename(repo.id, e.target.value)}
                onBlur={() => onCommit(repo.id)}
                className="h-auto border-0 bg-transparent p-0 text-sm font-medium shadow-none focus-visible:ring-0"
              />
            </li>
          ) : (
            <li key={repo.id}>
              <button
                type="button"
                onClick={() => onOpen(repo.id)}
                aria-pressed={activeId === repo.id}
                title="Open repository"
                className={cn(
                  "flex h-[46px] w-full items-center gap-2.5 rounded-lg border bg-background px-3.5 text-left transition-colors hover:border-neutral-300",
                  activeId === repo.id && "border-neutral-400",
                )}
              >
                <GitBranch className="size-[15px] shrink-0 text-muted-foreground" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{repo.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{repo.meta}</span>
                </div>
                <span title={DOT_TITLE[statusOf(repo.id)]} className={cn("size-1.5 shrink-0 rounded-full", DOT[statusOf(repo.id)])} />
              </button>
            </li>
          ),
        )}
      </ul>

      <Button variant="ghost" size="sm" onClick={onAdd} className="w-fit px-3 font-normal text-muted-foreground">
        + Add repository
      </Button>
    </>
  );
}
