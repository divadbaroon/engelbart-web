"use client";

import { PanelLeft } from "lucide-react";
import type { Paper } from "@/lib/papers";
import type { Repo } from "@/lib/repos";
import { Button } from "@/components/ui/button";
import type { SidebarMode } from "@/components/nav-rail";
import { PlanGoals } from "@/components/plan-goals";
import { RepoList, type RepoStatus } from "@/components/repo-list";
import { PaperList } from "@/components/paper-list";

const TITLES: Record<SidebarMode, string> = { plan: "Plan", github: "GitHub", papers: "Papers" };

export type ListActions<T> = {
  items: T[];
  activeId: string | null;
  onOpen: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onCommit: (id: string) => void;
};

type ProjectSidebarProps = {
  mode: SidebarMode;
  onCollapse: () => void;
  papers: ListActions<Paper>;
  repos: ListActions<Repo> & { statusOf: (id: string) => RepoStatus };
};

export function ProjectSidebar({ mode, onCollapse, papers, repos }: ProjectSidebarProps) {
  return (
    <aside className="flex h-full min-w-0 flex-col gap-[18px] overflow-y-auto bg-[#f6f6f6] px-4 pt-4 pb-6">
      <div className="flex h-7 shrink-0 items-center justify-between">
        <p className="px-3 text-[13px] font-medium">{TITLES[mode]}</p>
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
      {mode === "plan" && <PlanGoals />}
      {mode === "github" && (
        <RepoList
          repos={repos.items}
          activeId={repos.activeId}
          statusOf={repos.statusOf}
          onOpen={repos.onOpen}
          onAdd={repos.onAdd}
          onRename={repos.onRename}
          onCommit={repos.onCommit}
        />
      )}
      {mode === "papers" && (
        <PaperList
          papers={papers.items}
          activeId={papers.activeId}
          onOpen={papers.onOpen}
          onAdd={papers.onAdd}
          onRename={papers.onRename}
          onCommit={papers.onCommit}
        />
      )}
    </aside>
  );
}
