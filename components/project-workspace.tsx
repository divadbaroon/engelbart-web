"use client";

import { FileText, Plus, X } from "lucide-react";
import { isPaperTab, paperMeta, paperTabValue, type Paper } from "@/lib/papers";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TAB_LIST, TAB_TRIGGER } from "@/components/repo-workspace";
import { PreviewState, SANDBOX_CUBE } from "@/components/preview-state";

type ProjectTabsProps = {
  tab: string;
  onTabChange: (tab: string) => void;
  openPapers: Paper[];
  onClosePaper: (id: string) => void;
};

// With no repository open, the only thing this project has to show is the
// papers that have been opened, so the bar is those and nothing else. It
// used to carry Live preview, Terminal and Notes as well: the first two
// rendered nothing but their own label, and Notes went with the goal
// picker it wrote against.
export function ProjectTabs({ tab, onTabChange, openPapers, onClosePaper }: ProjectTabsProps) {
  // An empty bar is not an empty bar: `TabsList` carries a bottom border,
  // so with no papers it would draw a hairline across the panel under
  // nothing at all.
  if (!openPapers.length) return null;
  return (
    <Tabs value={tab} onValueChange={onTabChange}>
      <TabsList className={TAB_LIST}>
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
  // The project's own repositories, and the way to add one. With none,
  // this pane is the first thing somebody sees of a project, so it says
  // what to do rather than where to look.
  hasRepos?: boolean;
  onAddRepo?: () => void;
  tab: string;
  openPapers: Paper[];
  paperUrls: Record<string, string>;   // signed links, fetched when a paper is opened
};

export function ProjectContent({ tab, openPapers, paperUrls, hasRepos, onAddRepo }: ProjectContentProps) {
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

  // Nothing is open. There is nothing to show and nothing to pretend to
  // show, so this says what there is to do instead — and in a project
  // with no repositories at all, "choose one from the sidebar" was
  // pointing at an empty list.
  if (!hasRepos && onAddRepo) {
    return (
      <PreviewState
        image={SANDBOX_CUBE}
        title="Add a repository"
        description="Add a repository to see your project here."
        actions={[{ label: "Add a repo", onClick: onAddRepo, primary: true, icon: <Plus className="size-3.5" /> }]}
      />
    );
  }
  return (
    <PreviewState title="Nothing open" description="Choose a repository or a paper from the sidebar." />
  );
}
