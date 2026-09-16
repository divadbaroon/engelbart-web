"use client";

import { PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SidebarMode } from "@/components/nav-rail";
import { PlanGoals, type PlanActions } from "@/components/plan-goals";
import { RepoList, type RepoListActions } from "@/components/repo-list";
import { PaperList, type PaperListActions } from "@/components/paper-list";

const TITLES: Record<SidebarMode, string> = { plan: "Plan", github: "GitHub", papers: "Papers" };

type ProjectSidebarProps = {
  mode: SidebarMode;
  onCollapse: () => void;
  plan: PlanActions;
  papers: PaperListActions;
  repos: RepoListActions;
};

export function ProjectSidebar({ mode, onCollapse, plan, papers, repos }: ProjectSidebarProps) {
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
      {mode === "plan" && <PlanGoals {...plan} />}
      {mode === "github" && <RepoList {...repos} />}
      {mode === "papers" && <PaperList {...papers} />}
    </aside>
  );
}
