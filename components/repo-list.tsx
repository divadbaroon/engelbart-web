"use client";

import { GitBranch, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { repoMeta, type Repo } from "@/lib/repos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type RepoStatus = "none" | "preparing" | "ready";

export type RepoListActions = {
  repos: Repo[];
  activeId: string | null;
  statusOf: (id: string) => RepoStatus;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
  draft: string | null;           // the URL being typed, or null when no row is open
  adding: boolean;                // the add is out to the server
  error: string | null;
  onDraftChange: (value: string) => void;
  onStartAdd: () => void;
  onCommitAdd: () => void;
  onCancelAdd: () => void;
};

const DOT: Record<RepoStatus, string> = { none: "bg-transparent", preparing: "bg-neutral-300", ready: "bg-green-500" };
const DOT_TITLE: Record<RepoStatus, string> = { none: "", preparing: "Preparing…", ready: "Ready" };

// The project's repositories, one selected, and a row to paste a GitHub URL into.
export function RepoList({ repos, activeId, statusOf, onOpen, onRemove, draft, adding, error, onDraftChange, onStartAdd, onCommitAdd, onCancelAdd }: RepoListActions) {
  return (
    <>
      <ul className="flex flex-col gap-2">
        {repos.map((repo) => (
          <li key={repo.id} className="group relative">
            <button
              type="button"
              onClick={() => onOpen(repo.id)}
              aria-pressed={activeId === repo.id}
              title={repo.url}
              className={cn(
                "flex h-[46px] w-full items-center gap-2.5 rounded-lg border bg-background px-3.5 text-left transition-colors hover:border-neutral-300",
                activeId === repo.id && "border-neutral-400",
              )}
            >
              <GitBranch className="size-[15px] shrink-0 text-muted-foreground" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{repo.fullName}</span>
                <span className="truncate text-xs text-muted-foreground">{repoMeta(repo)}</span>
              </div>
              <span title={DOT_TITLE[statusOf(repo.id)]} className={cn("size-1.5 shrink-0 rounded-full", DOT[statusOf(repo.id)])} />
            </button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove ${repo.fullName}`}
              title="Remove from project"
              onClick={() => onRemove(repo.id)}
              className="absolute top-1/2 right-1.5 size-6 -translate-y-1/2 rounded text-muted-foreground/60 opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
            >
              <X className="size-3" />
            </Button>
          </li>
        ))}
        {draft !== null && (
          <li className="flex h-[46px] items-center gap-2.5 rounded-lg border bg-background px-3.5">
            <GitBranch className="size-[15px] shrink-0 text-muted-foreground" />
            <Input
              autoFocus
              value={draft}
              disabled={adding}
              placeholder="https://github.com/owner/repository"
              aria-label="GitHub repository URL"
              onChange={(e) => onDraftChange(e.target.value)}
              onBlur={() => { if (!adding) onCommitAdd(); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); onCommitAdd(); }
                if (e.key === "Escape") { e.preventDefault(); onCancelAdd(); }
              }}
              className="h-auto border-0 bg-transparent p-0 text-sm font-medium shadow-none focus-visible:ring-0"
            />
            {adding && <span className="text-xs text-muted-foreground">Checking…</span>}
          </li>
        )}
      </ul>

      {error && <p role="alert" className="px-3 text-[12px] text-destructive">{error}</p>}
      {!repos.length && draft === null && (
        <p className="px-3 text-[13px] text-muted-foreground">No repositories yet. Add a GitHub URL to bring one into this project.</p>
      )}

      <Button variant="ghost" size="sm" disabled={draft !== null} onClick={onStartAdd} className="w-fit px-3 font-normal text-muted-foreground">
        + Add repository
      </Button>
    </>
  );
}
