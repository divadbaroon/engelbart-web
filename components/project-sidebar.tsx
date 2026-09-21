"use client";

import { PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SidebarMode } from "@/components/nav-rail";
import { RepoList, type RepoListActions } from "@/components/repo-list";
import { PaperList, type PaperListActions } from "@/components/paper-list";

// What the panel lists, not where it came from. The rail beside it is
// already showing a GitHub mark, pressed, with "GitHub" on its tooltip;
// the heading repeating the source said nothing the icon had not, and
// said nothing at all about what was under it.
const TITLES: Record<SidebarMode, string> = { github: "Repositories", papers: "Papers" };

type ProjectSidebarProps = {
  mode: SidebarMode;
  onCollapse: () => void;
  papers: PaperListActions;
  repos: RepoListActions;
};

export function ProjectSidebar({ mode, onCollapse, papers, repos }: ProjectSidebarProps) {
  return (
    <aside className="flex h-full min-w-0 flex-col gap-2 overflow-y-auto bg-[#f6f6f6] px-4 pt-4 pb-6">
      <div className="flex h-7 shrink-0 items-center justify-between">
        {/* 13px, not 12: a row is a 1px border and then px-3, so this is
            the pixel its icon starts at and the heading sits over it. */}
        <p className="px-[13px] text-[13px] font-medium">{TITLES[mode]}</p>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
          onClick={onCollapse}
          className="size-7 text-muted-foreground"
        >
          <PanelLeft className="size-4" />
        </Button>
      </div>
      {mode === "github" && <RepoList {...repos} />}
      {mode === "papers" && <PaperList {...papers} />}
    </aside>
  );
}
