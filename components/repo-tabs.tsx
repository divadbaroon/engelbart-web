"use client";

import { GitBranch, PanelRight, PanelRightOpen, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Repo } from "@/lib/repos";
import { isRunActive, isRunCloned, isRunRunning, STATUS_LABEL, type SandboxRun } from "@/lib/sandbox";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { REPO_TABS, TAB_LABEL, staysReason, type RepoTab } from "@/lib/workspace-slots";

export type { RepoTab };

// The shadcn list fixes its height under an orientation variant, which a
// plain `h-auto` cannot override; the tabs are taller than that, so their
// underline drifted below the bar's border. Everything sits on the
// bottom edge so the active underline lands on the border line.
export const TAB_LIST =
  "group-data-[orientation=horizontal]/tabs:h-auto h-auto w-full items-end justify-start gap-6 rounded-none border-b bg-transparent p-0";

export const TAB_TRIGGER =
  "-mb-px h-auto flex-none rounded-none border-0 border-b-2 border-transparent px-0 pt-2.5 pb-3 font-normal text-muted-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none";

type RepoTabsProps = {
  repo: Repo;
  tab: RepoTab;
  onTabChange: (tab: RepoTab) => void;
  run: SandboxRun | undefined;
  onClose: () => void;
  sideTab: RepoTab | null;               // the tab shown on the side
  onSendAside: (tab: RepoTab) => void;   // the active tab, to the side
};

const dotClass = (run: SandboxRun | undefined) =>
  isRunRunning(run) ? "bg-green-500" : run?.status === "failed" ? "bg-red-500" : isRunActive(run) ? "animate-pulse bg-neutral-400" : isRunCloned(run) ? "bg-neutral-400" : "bg-neutral-300";

// Tab bar for the selected repo: repo chip, the tabs (Live preview with
// its status dot; a tab on the side marked, and brought back when
// chosen), and at the end the button that sends the active tab to the
// side. The preview and the terminal say why they stay.
export function RepoTabs({ repo, tab, onTabChange, run, onClose, sideTab, onSendAside }: RepoTabsProps) {
  const stays = staysReason(tab);
  return (
    <Tabs value={tab} onValueChange={(v) => onTabChange(v as RepoTab)}>
      <TabsList className={TAB_LIST}>
        <div className="flex shrink-0 items-center gap-2 pt-2 pb-2.5 text-[13px] text-muted-foreground">
          <GitBranch className="size-3.5 shrink-0" />
          <span className="max-w-[200px] truncate font-medium text-foreground" title={repo.fullName}>{repo.fullName}</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back to project workspace"
            title="Back to project workspace"
            onClick={onClose}
            className="size-[18px] rounded text-muted-foreground/70 hover:text-foreground"
          >
            <X className="size-2.5" />
          </Button>
          <span className="ml-1 h-4 w-px bg-border" />
        </div>
        {REPO_TABS.map((t) => (
          <TabsTrigger
            key={t}
            value={t}
            title={t === "preview" ? (run ? STATUS_LABEL[run.status] : "Not prepared") : sideTab === t ? "On the side; choose it to bring it back" : undefined}
            className={cn(TAB_TRIGGER, (t === "preview" || sideTab === t) && "gap-[7px]")}
          >
            {TAB_LABEL[t]}
            {t === "preview" && <span aria-hidden className={cn("size-1.5 rounded-full", dotClass(run))} />}
            {sideTab === t && <PanelRight aria-hidden className="size-3 text-muted-foreground/70" />}
          </TabsTrigger>
        ))}
        <div className="ml-auto flex shrink-0 items-center pt-1.5 pb-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Open ${TAB_LABEL[tab]} on the side`}
            aria-disabled={!!stays}
            title={stays ?? `Open ${TAB_LABEL[tab]} on the side, beside the middle one`}
            onClick={() => { if (!stays) onSendAside(tab); }}
            className={cn("size-7 text-muted-foreground", stays && "cursor-default opacity-40 hover:bg-transparent hover:text-muted-foreground")}
          >
            <PanelRightOpen className="size-4" />
          </Button>
        </div>
      </TabsList>
    </Tabs>
  );
}
