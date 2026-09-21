"use client";

import { useRef, useState, type DragEvent } from "react";
import { FileText, GitBranch, Link as LinkIcon, Loader2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { paperMeta, type Paper } from "@/lib/papers";
import { ACTIVE, HOVER, ICON, META, NAME, REMOVE, ROW, SURFACE, TITLE, TITLE_ON } from "@/components/sidebar-row";
import type { PendingPaper, RepoSuggestion } from "@/hooks/use-papers";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

export type PaperListActions = {
  papers: Paper[];
  pending: PendingPaper[];
  activeId: string | null;
  onOpen: (id: string) => void;
  onUpload: (files: File[]) => void;
  onAddFromUrl: (input: string) => Promise<boolean>;
  onRename: (id: string, title: string) => void;
  onRemove: (id: string) => void;
  onDismiss: (id: string) => void;   // clear a failed upload from the list
  analyzing: Set<string>;   // papers being read for links right now
  // Repositories found in a just-added paper, minus any already in the project.
  suggestion: RepoSuggestion | null;
  onAcceptSuggestion: (paperId: string, repoUrls: string[]) => void;
  onDismissSuggestion: (paperId: string) => void;
};

// Each of the pair at the foot of the list: the row's height, type and
// icon column — the wrapper's px-[7px] and this px-1.5 put the first Plus
// at the 13px the rows above start their icons at, which is their border
// plus their padding — but only as wide as its own label, so the two sit
// on one line.
const ADD = "flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-2 text-left text-sm text-muted-foreground hover:text-foreground";

const pdfsOf = (files: FileList | null) => Array.from(files ?? []).filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));

// The project's papers. Drop PDFs anywhere on the panel, pick them with
// the button, or paste a link; each shows up as it uploads.
//
// The same row as a repository (components/sidebar-row.ts), and for the
// same reason: the rail switches between two lists of things in this
// project, and the panel under it should not change shape when it does.
// Papers were bordered cards with the list’s own gaps between them while
// repositories were flat rows, so GitHub and Papers looked like two
// different panels rather than one panel showing two things. They are
// both contained rows now, and still one shape.
export function PaperList({ papers, pending, activeId, onOpen, onUpload, onAddFromUrl, onRename, onRemove, onDismiss, analyzing, suggestion, onAcceptSuggestion, onDismissSuggestion }: PaperListActions) {
  const [over, setOver] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const depth = useRef(0);   // dragenter/leave fire for every child; count them

  const onDragEnter = (e: DragEvent) => { e.preventDefault(); depth.current += 1; setOver(true); };
  const onDragLeave = () => { depth.current -= 1; if (depth.current <= 0) { depth.current = 0; setOver(false); } };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    depth.current = 0;
    setOver(false);
    const files = pdfsOf(e.dataTransfer.files);
    if (files.length) onUpload(files);
  };

  async function commitDraft() {
    const text = (draft ?? "").trim();
    if (!text) { setDraft(null); return; }
    setAdding(true);
    const ok = await onAddFromUrl(text);
    setAdding(false);
    if (ok) setDraft(null);
  }

  function commitRename() {
    if (!editing) return;
    if (editing.title.trim()) onRename(editing.id, editing.title);
    setEditing(null);
  }

  return (
    <div
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn("relative flex min-h-0 min-w-0 flex-1 flex-col rounded-md transition-colors", over && "bg-neutral-200/60")}
    >
      {over && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md border-2 border-dashed border-neutral-400 text-[13px] text-neutral-600">
          Drop PDFs to add them
        </div>
      )}

      <ul className="flex flex-col gap-1.5">
        {papers.map((paper) =>
          editing?.id === paper.id ? (
            <li key={paper.id} className={cn(ROW, SURFACE)}>
              <FileText className={ICON} />
              <Input
                autoFocus
                value={editing.title}
                aria-label="Paper title"
                onChange={(e) => setEditing({ id: paper.id, title: e.target.value })}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitRename(); }
                  if (e.key === "Escape") { e.preventDefault(); setEditing(null); }
                }}
                className="h-auto min-w-0 border-0 bg-transparent p-0 text-sm font-medium shadow-none focus-visible:ring-0"
              />
            </li>
          ) : (
            <li key={paper.id} className="group relative">
              <button
                type="button"
                onClick={() => onOpen(paper.id)}
                onDoubleClick={() => setEditing({ id: paper.id, title: paper.title })}
                aria-pressed={activeId === paper.id}
                // The title is drawn to one line like a repository's name,
                // so the whole of it is here — with what a double click
                // does, which is the one thing about this row you cannot
                // see.
                title={`${paper.title}\nOpen in workspace · double-click to rename`}
                className={cn(
                  ROW,
                  SURFACE,
                  activeId === paper.id && ACTIVE,
                  // The suggestion hangs off the bottom of this row, so
                  // the two share an edge rather than each keeping their
                  // own and drawing a seam.
                  suggestion?.paperId === paper.id && "rounded-b-none",
                )}
              >
                <FileText className={ICON} />
                <span className={NAME}>
                  <span className={activeId === paper.id ? TITLE_ON : TITLE}>{paper.title}</span>
                  {analyzing.has(paper.id) ? (
                    <span className="flex items-center gap-1.5 truncate text-xs leading-4 text-muted-foreground">
                      <Loader2 className="size-3 shrink-0 animate-spin" />
                      Reading the paper…
                    </span>
                  ) : (
                    <span className={META}>{paperMeta(paper)}</span>
                  )}
                </span>
              </button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${paper.title}`}
                title="Remove from project"
                onClick={() => onRemove(paper.id)}
                className={REMOVE}
              >
                <X className="size-3" />
              </Button>
              {suggestion?.paperId === paper.id && (
                <SuggestionCard key={suggestion.paperId} suggestion={suggestion} onAccept={onAcceptSuggestion} onDismiss={onDismissSuggestion} />
              )}
            </li>
          ),
        )}

        {pending.map((p) => (
          <li key={p.id} className={cn(ROW, "relative border-dashed bg-background")}>
            {p.status === "error" ? (
              <FileText className={cn(ICON, "text-destructive")} />
            ) : (
              <Loader2 className={cn(ICON, "animate-spin")} />
            )}
            <span className={NAME}>
              <span className={TITLE}>{p.title}</span>
              <span className={cn("truncate text-xs leading-4", p.status === "error" ? "text-destructive" : "text-muted-foreground")}>
                {p.status === "uploading" ? "Uploading…" : p.status === "fetching" ? "Fetching…" : p.error}
              </span>
            </span>
            {p.status === "error" && (
              <Button variant="ghost" size="icon" aria-label="Dismiss" onClick={() => onDismiss(p.id)} className={cn(REMOVE, "opacity-100")}>
                <X className="size-3" />
              </Button>
            )}
          </li>
        ))}

        {draft !== null && (
          <li className={cn(ROW, SURFACE)}>
            <LinkIcon className={ICON} />
            <Input
              autoFocus
              value={draft}
              disabled={adding}
              placeholder="Link to a PDF or arXiv page"
              aria-label="Paper link"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => { if (!adding) commitDraft(); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commitDraft(); }
                if (e.key === "Escape") { e.preventDefault(); setDraft(null); }
              }}
              className="h-auto min-w-0 border-0 bg-transparent p-0 text-sm font-medium shadow-none focus-visible:ring-0"
            />
            {adding && <span className="shrink-0 text-xs text-muted-foreground">Checking…</span>}
          </li>
        )}
      </ul>

      {!papers.length && !pending.length && draft === null && (
        <p className="px-[13px] py-1.5 text-[13px] leading-5 text-muted-foreground">No papers yet. Drop PDFs here, or add one below.</p>
      )}

      {/* The two ways in, side by side at the end of the column where
          "Add repository" is in the other list. They are one thing —
          bring a paper into the project — with two doors, so they belong
          on one line; the wrap is there because a narrow panel cannot
          hold both, and a button that runs off the edge is worse than a
          button on the next line. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1 px-[7px]">
        <button type="button" onClick={() => picker.current?.click()} className={cn(ADD, HOVER)}>
          <Plus className={ICON} />
          <span className="truncate">Upload PDF</span>
        </button>
        <button
          type="button"
          disabled={draft !== null}
          onClick={() => setDraft("")}
          className={cn(ADD, HOVER, "disabled:pointer-events-none disabled:opacity-50")}
        >
          <Plus className={ICON} />
          <span className="truncate">Add link</span>
        </button>
      </div>
      <input
        ref={picker}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        onChange={(e) => { const files = pdfsOf(e.target.files); e.target.value = ""; if (files.length) onUpload(files); }}
      />
    </div>
  );
}

// Hangs off the bottom of its paper's row: "links to these repositories,
// add them?" Each is checked to start with; adding clones and starts them
// like a pasted URL would.
function SuggestionCard({ suggestion, onAccept, onDismiss }: { suggestion: RepoSuggestion; onAccept: (paperId: string, urls: string[]) => void; onDismiss: (paperId: string) => void }) {
  const [chosen, setChosen] = useState<Set<string>>(new Set(suggestion.repos));
  const toggle = (url: string) => setChosen((prev) => { const next = new Set(prev); if (next.has(url)) next.delete(url); else next.add(url); return next; });
  const many = suggestion.repos.length > 1;
  return (
    <div role="dialog" aria-label="Repositories found in the paper" className="rounded-md rounded-t-none border border-t-0 bg-[#f0f0f0] px-3">
      <div className="flex flex-col gap-2.5 py-3">
      <p className="text-[13px] leading-5 text-pretty text-muted-foreground">
        Links to {many ? `${suggestion.repos.length} repositories` : "a repository"}.
      </p>
      <ul className="flex flex-col gap-1.5">
        {suggestion.repos.map((url) => {
          const id = `suggest-${suggestion.paperId}-${url}`;
          return (
            <li key={url} className="flex items-center gap-2">
              <Checkbox id={id} checked={chosen.has(url)} onCheckedChange={() => toggle(url)} />
              <label htmlFor={id} className="flex min-w-0 cursor-pointer items-center gap-1.5 text-[13px]">
                <GitBranch className="size-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{url.replace("https://github.com/", "")}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {/* Wraps, like the pair at the foot of the list: at the panel's
          minimum width the two do not fit on one line, and a button
          hanging off the edge is worse than a button on the next. */}
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" disabled={!chosen.size} onClick={() => onAccept(suggestion.paperId, suggestion.repos.filter((u) => chosen.has(u)))} className="h-7 px-3 font-normal">
          Add and start
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onDismiss(suggestion.paperId)} className="h-7 px-3 font-normal text-muted-foreground">
          Not now
        </Button>
      </div>
      </div>
    </div>
  );
}
