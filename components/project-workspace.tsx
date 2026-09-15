"use client";

import { FileText, X } from "lucide-react";
import { isPaperTab, paperTabValue, type Paper } from "@/lib/papers";
import type { Goal } from "@/lib/plan";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NotesPad } from "@/components/notes-pad";
import { TAB_TRIGGER } from "@/components/repo-workspace";

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
      <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b bg-transparent p-0">
        {PROJECT_TABS.map((t) => (
          <TabsTrigger key={t.value} value={t.value} className={TAB_TRIGGER}>
            {t.label}
          </TabsTrigger>
        ))}
        {openPapers.map((paper) => (
          <div key={paper.id} className="flex min-w-0 items-center gap-1">
            <TabsTrigger value={paperTabValue(paper.id)} title={paper.name} className={`${TAB_TRIGGER} max-w-[200px] gap-1.5`}>
              <FileText className="size-[13px] shrink-0 opacity-70" />
              <span className="truncate">{paper.name || "Untitled paper"}</span>
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
  notesGoal: Goal | null;
  onNotesSaved: (goalId: string, notes: string, updatedAt: string) => void;
};

export function ProjectContent({ tab, openPapers, notesGoal, onNotesSaved }: ProjectContentProps) {
  const activePaper = isPaperTab(tab) ? openPapers.find((p) => paperTabValue(p.id) === tab) : undefined;

  if (activePaper) {
    return (
      <section className="flex h-full flex-col overflow-y-auto">
        <div className="px-8 pt-7">
          <h1 className="mb-1.5 text-xl leading-snug font-semibold text-pretty">{activePaper.name}</h1>
          <p className="text-[13px] text-muted-foreground">{activePaper.meta}</p>
        </div>
        {/* Replace with your PDF viewer (e.g. react-pdf) */}
        <div className="mx-8 mt-6 mb-7 flex min-h-[240px] flex-1 items-center justify-center rounded-lg border bg-[repeating-linear-gradient(135deg,#f4f4f4_0_10px,#fafafa_10px_20px)] font-mono text-xs text-muted-foreground">
          pdf viewer
        </div>
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
