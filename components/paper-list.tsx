"use client";

import { useRef, useState, type DragEvent } from "react";
import { FileText, GitBranch, Link as LinkIcon, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { paperMeta, type Paper } from "@/lib/papers";
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

const pdfsOf = (files: FileList | null) => Array.from(files ?? []).filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));

// The project's papers. Drop PDFs anywhere on the panel, pick them with
// the button, or paste a link; each shows up as it uploads.
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
      className={cn("relative flex min-h-0 flex-1 flex-col gap-[18px] rounded-lg transition-colors", over && "bg-neutral-200/60")}
    >
      {over && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-neutral-400 text-[13px] text-neutral-600">
          Drop PDFs to add them
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {papers.map((paper) =>
          editing?.id === paper.id ? (
            <li key={paper.id} className="flex items-start gap-2.5 rounded-lg border bg-background px-3.5 py-3">
              <FileText className="mt-0.5 size-[15px] shrink-0 text-muted-foreground" />
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
                className="h-5 border-0 bg-transparent p-0 text-sm font-medium shadow-none focus-visible:ring-0"
              />
            </li>
          ) : (
            <li key={paper.id} className="group relative">
              <button
                type="button"
                onClick={() => onOpen(paper.id)}
                onDoubleClick={() => setEditing({ id: paper.id, title: paper.title })}
                aria-pressed={activeId === paper.id}
                title="Open in workspace · double-click to rename"
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-lg border bg-background px-3.5 py-3 pr-8 text-left transition-colors hover:border-neutral-300",
                  activeId === paper.id && "border-neutral-400",
                  suggestion?.paperId === paper.id && "rounded-b-none border-b-0",
                )}
              >
                <FileText className="mt-0.5 size-[15px] shrink-0 text-muted-foreground" />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm leading-5 font-medium text-pretty">{paper.title}</span>
                  {analyzing.has(paper.id) ? (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Loader2 className="size-3 animate-spin" />
                      Reading the paper…
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">{paperMeta(paper)}</span>
                  )}
                </div>
              </button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${paper.title}`}
                title="Remove from project"
                onClick={() => onRemove(paper.id)}
                className="absolute top-2.5 right-1.5 size-6 rounded text-muted-foreground/60 opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
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
          <li key={p.id} className="group relative flex items-start gap-2.5 rounded-lg border border-dashed bg-background px-3.5 py-3 pr-8">
            {p.status === "error" ? (
              <FileText className="mt-0.5 size-[15px] shrink-0 text-destructive" />
            ) : (
              <Loader2 className="mt-0.5 size-[15px] shrink-0 animate-spin text-muted-foreground" />
            )}
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm leading-5 font-medium">{p.title}</span>
              <span className={cn("text-xs", p.status === "error" ? "text-destructive" : "text-muted-foreground")}>
                {p.status === "uploading" ? "Uploading…" : p.status === "fetching" ? "Fetching…" : p.error}
              </span>
            </div>
            {p.status === "error" && (
              <Button variant="ghost" size="icon" aria-label="Dismiss" onClick={() => onDismiss(p.id)} className="absolute top-2.5 right-1.5 size-6 rounded text-muted-foreground/60 hover:text-foreground">
                <X className="size-3" />
              </Button>
            )}
          </li>
        ))}

        {draft !== null && (
          <li className="flex items-center gap-2.5 rounded-lg border bg-background px-3.5 py-3">
            <LinkIcon className="size-[15px] shrink-0 text-muted-foreground" />
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
              className="h-5 border-0 bg-transparent p-0 text-sm font-medium shadow-none focus-visible:ring-0"
            />
          </li>
        )}
      </ul>

      {!papers.length && !pending.length && draft === null && (
        <p className="px-3 text-[13px] text-muted-foreground">No papers yet. Drop PDFs here, or add one below.</p>
      )}

      <div className="flex flex-wrap gap-1">
        <Button variant="ghost" size="sm" onClick={() => picker.current?.click()} className="w-fit px-3 font-normal text-muted-foreground">
          + Upload PDF
        </Button>
        <Button variant="ghost" size="sm" disabled={draft !== null} onClick={() => setDraft("")} className="w-fit px-3 font-normal text-muted-foreground">
          + Add from link
        </Button>
        <input
          ref={picker}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => { const files = pdfsOf(e.target.files); e.target.value = ""; if (files.length) onUpload(files); }}
        />
      </div>
    </div>
  );
}

// Hangs off the bottom of its paper's card: "links to these repositories,
// add them?" Each is checked to start with; adding clones and starts them
// like a pasted URL would.
function SuggestionCard({ suggestion, onAccept, onDismiss }: { suggestion: RepoSuggestion; onAccept: (paperId: string, urls: string[]) => void; onDismiss: (paperId: string) => void }) {
  const [chosen, setChosen] = useState<Set<string>>(new Set(suggestion.repos));
  const toggle = (url: string) => setChosen((prev) => { const next = new Set(prev); if (next.has(url)) next.delete(url); else next.add(url); return next; });
  const many = suggestion.repos.length > 1;
  return (
    <div role="dialog" aria-label="Repositories found in the paper" className="rounded-b-lg border border-t-0 bg-neutral-50 px-3.5">
      <div className="flex flex-col gap-2.5 border-t border-dashed py-3">
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
      <div className="flex gap-1.5">
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
