"use client";

import { FileText, X } from "lucide-react";
import { isPaperTab, paperMeta, paperTabValue, type Paper } from "@/lib/papers";
import type { Goal } from "@/lib/plan";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NotesPad } from "@/components/notes-pad";
import { TAB_LIST, TAB_TRIGGER } from "@/components/repo-workspace";

export const PROJECT_TABS = [
  { value: "preview", label: "Live preview" },
  { value: "terminal", label: "Terminal" },
  { value: "notes", label: "Notes" },
] as const;

type ProjectTabsProps = {
  tab: string;
  onTabChange: (tab: string) => void;
  openPapers: Paper[];
  onClosePaper: (id: string) => void;
};

// Project tab bar: Live preview / Terminal / Notes plus closable tabs for opened papers.
export function ProjectTabs({ tab, onTabChange, openPapers, onClosePaper }: ProjectTabsProps) {
  return (
    <Tabs value={tab} onValueChange={onTabChange}>
      <TabsList className={TAB_LIST}>
        {PROJECT_TABS.map((t) => (
          <TabsTrigger key={t.value} value={t.value} className={TAB_TRIGGER}>
            {t.label}
          </TabsTrigger>
        ))}
        {openPapers.map((paper) => (
          <div key={paper.id} className="flex min-w-0 items-center gap-1">
            <TabsTrigger value={paperTabValue(paper.id)} title={paper.title} className={`${TAB_TRIGGER} max-w-[200px] gap-1.5`}>
              <FileText className="size-[13px] shrink-0 opacity-70" />
              <span className="truncate">{paper.title}</span>
            </TabsTrigger>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close tab"
              title="Close tab"
              onClick={() => onClosePaper(paper.id)}
              className="size-[18px] rounded text-muted-foreground/70 hover:text-foreground"
            >
              <X className="size-2.5" />
            </Button>
          </div>
        ))}
      </TabsList>
    </Tabs>
  );
}

type ProjectContentProps = {
  tab: string;
  openPapers: Paper[];
  paperUrls: Record<string, string>;   // signed links, fetched when a paper is opened
  notesGoal: Goal | null;
  onNotesSaved: (goalId: string, notes: string, updatedAt: string) => void;
};

export function ProjectContent({ tab, openPapers, paperUrls, notesGoal, onNotesSaved }: ProjectContentProps) {
  const activePaper = isPaperTab(tab) ? openPapers.find((p) => paperTabValue(p.id) === tab) : undefined;

  if (activePaper) {
    const url = paperUrls[activePaper.id];
    return (
      <section aria-label={activePaper.title} className="flex h-full flex-col">
        <div className="flex h-9 shrink-0 items-center gap-3 border-b px-3.5 text-xs text-muted-foreground">
          <span className="truncate font-medium text-foreground">{activePaper.title}</span>
          <span className="shrink-0">{paperMeta(activePaper)}</span>
          {url && <a href={url} target="_blank" rel="noreferrer" className="ml-auto shrink-0 hover:text-foreground">Open in a new tab</a>}
        </div>
        {url ? (
          // The browser's own PDF viewer, for now.
          <iframe src={url} title={activePaper.title} className="min-h-0 w-full flex-1 bg-neutral-100" />
        ) : (
          <p className="flex flex-1 items-center justify-center text-[13px] text-muted-foreground">Opening…</p>
        )}
      </section>
    );
  }

  if (tab === "notes") return <NotesPad goal={notesGoal} onSaved={onNotesSaved} />;

  const label = PROJECT_TABS.find((t) => t.value === tab)?.label ?? "";
  return (
    <section className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
      {label}
    </section>
  );
}
