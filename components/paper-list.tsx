"use client";

import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Paper } from "@/lib/papers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PaperListProps = {
  papers: Paper[];
  activeId: string | null;
  onOpen: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onCommit: (id: string) => void;
};

export function PaperList({ papers, activeId, onOpen, onAdd, onRename, onCommit }: PaperListProps) {
  return (
    <>
      <ul className="flex flex-col gap-2">
        {papers.map((paper) =>
          paper.isNew ? (
            <li key={paper.id} className="flex items-start gap-2.5 rounded-lg border bg-background px-3.5 py-3">
              <FileText className="mt-0.5 size-[15px] shrink-0 text-muted-foreground" />
              <Input
                autoFocus
                value={paper.name}
                placeholder="Paper title, DOI, or arXiv ID"
                onChange={(e) => onRename(paper.id, e.target.value)}
                onBlur={() => onCommit(paper.id)}
                className="h-5 border-0 bg-transparent p-0 text-sm font-medium shadow-none focus-visible:ring-0"
              />
            </li>
          ) : (
            <li key={paper.id}>
              <button
                type="button"
                onClick={() => onOpen(paper.id)}
                aria-pressed={activeId === paper.id}
                title="Open in workspace"
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-lg border bg-background px-3.5 py-3 text-left transition-colors hover:border-neutral-300",
                  activeId === paper.id && "border-neutral-400",
                )}
              >
                <FileText className="mt-0.5 size-[15px] shrink-0 text-muted-foreground" />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm leading-5 font-medium text-pretty">{paper.name}</span>
                  <span className="text-xs text-muted-foreground">{paper.meta}</span>
                </div>
              </button>
            </li>
          ),
        )}
      </ul>

      <Button variant="ghost" size="sm" onClick={onAdd} className="w-fit px-3 font-normal text-muted-foreground">
        + Add paper
      </Button>
    </>
  );
}
