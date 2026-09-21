"use client";

import { GitBranch, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { repoMeta, type Repo } from "@/lib/repos";
import { ACTIVE, ICON, META, NAME, PLAIN, REMOVE, ROW, SURFACE, TITLE, TITLE_ON } from "@/components/sidebar-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type RepoStatus = "none" | "preparing" | "cloned" | "ready" | "failed";

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

// What a repository is doing, at the end of the line under its name.
//
// The line is the repository's branch and then a word for the state of
// its sandbox — "main · Active". The branch is a fact about the code;
// the state is the one thing about a repository that changes while you
// are looking at it, and it is worth more of that line than the language
// GitHub says the code is written in, which never changes and is a fact
// you look up rather than scan. The language is on the row's tooltip.
//
// Every state has a word, including the ones with nothing to report, so
// that a row is the same height whatever it is doing and a column of
// them reads straight down. Three words carry it — the repository is up,
// it is there but not up, or there is nothing of it here — and
// "Starting…" is the fourth only because it is the one state that is
// going somewhere, and a word that is not moving would be wrong for it.
//
// A run that failed reads Inactive, like one that was never started. A
// repository whose last run failed is in exactly the state of one that
// has not been run, and what went wrong is on the run, under Setup ·
// Build, where the step that failed is red and says so.
//
// These are the five `statusOf` can return (components/app-shell.tsx);
// none of them is new, and nothing here decides which one a repository
// is in.
const STATUS: Record<RepoStatus, string> = {
  none: "Inactive",          // never started
  failed: "Inactive",        // started, did not come up; nothing is running now
  preparing: "Starting…",    // a sandbox is being made, or the app launched
  cloned: "Idle",            // the repository is on disk in a paused sandbox
  ready: "Active",           // the application is up
};

// The project's repositories, one selected, and a row to paste a GitHub URL into.
//
// A repository is an object you pick up, so it is drawn as one: a row
// with edges, on the panel rather than dissolved into it
// (components/sidebar-row.ts). Flat rows made the list read as one grey
// field with text in it, and the selected row — the only thing with a
// fill — read as a slab dropped on top. With every row a surface, the
// selected one only has to be a slightly firmer edge.
export function RepoList({ repos, activeId, statusOf, onOpen, onRemove, draft, adding, error, onDraftChange, onStartAdd, onCommitAdd, onCancelAdd }: RepoListActions) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <ul className="flex flex-col gap-1.5">
        {repos.map((repo) => {
          const active = activeId === repo.id;
          return (
            <li key={repo.id} className="group relative">
              <button
                type="button"
                onClick={() => onOpen(repo.id)}
                aria-pressed={active}
                title={`${repo.url}\n${repoMeta(repo)}`}
                className={cn(ROW, SURFACE, active && ACTIVE)}
              >
                <GitBranch className={ICON} />
                <span className={NAME}>
                  <span className={active ? TITLE_ON : TITLE}>{repo.fullName}</span>
                  <span className={META}>{[repo.defaultBranch, STATUS[statusOf(repo.id)]].filter(Boolean).join(" · ")}</span>
                </span>
              </button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${repo.fullName}`}
                title="Remove from project"
                onClick={() => onRemove(repo.id)}
                className={REMOVE}
              >
                <X className="size-3" />
              </Button>
            </li>
          );
        })}
        {draft !== null && (
          <li className={cn(ROW, SURFACE)}>
            <GitBranch className={ICON} />
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
              className="h-auto min-w-0 border-0 bg-transparent p-0 text-sm font-medium shadow-none focus-visible:ring-0"
            />
            {adding && <span className="shrink-0 text-xs text-muted-foreground">Checking…</span>}
          </li>
        )}
      </ul>

      {error && <p role="alert" className="px-[13px] text-xs text-destructive">{error}</p>}

      {/* No sentence for the empty list. The "Add repository" row below is
          already the whole instruction, and a paragraph saying the same
          thing above it only makes an empty column look emptier. */}

      {/* Another row, not a button parked under the list: it is the last
          thing in the column and it starts where the names do. No border
          on it, though — it is a way in, not a thing in the project. */}
      <button
        type="button"
        disabled={draft !== null}
        onClick={onStartAdd}
        className={cn(ROW, PLAIN, "text-sm text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-50")}
      >
        <Plus className={ICON} />
        <span className="truncate">Add repository</span>
      </button>
    </div>
  );
}
