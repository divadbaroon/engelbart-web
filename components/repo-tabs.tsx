"use client";
import { STATUS_LABEL, type SandboxRun } from "@/lib/sandbox";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MIDDLE_TABS, TAB_LABEL, type MiddleTab } from "@/lib/workspace-slots";

export type { MiddleTab };

// The shadcn list fixes its height under an orientation variant, which a
// plain `h-auto` cannot override; the tabs are taller than that, so their
// underline drifted below the bar's border. Everything sits on the
// bottom edge so the active underline lands on the border line.
export const TAB_LIST =
  "group-data-[orientation=horizontal]/tabs:h-auto h-auto w-full items-end justify-start gap-6 rounded-none border-b bg-transparent p-0";

export const TAB_TRIGGER =
  "-mb-px h-auto flex-none rounded-none border-0 border-b-2 border-transparent px-0 pt-2.5 pb-3 font-normal text-muted-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none";

type RepoTabsProps = {
  tab: MiddleTab;
  onTabChange: (tab: MiddleTab) => void;
  run: SandboxRun | undefined;
};

// Tab bar for the selected repo: the four surfaces the middle holds.
//
// It used to open with a chip naming the repository, with a cross on it
// for going back to the project. Which repository this is is said by the
// sidebar, where the row is filled and marked, one pane to the left and
// always on the screen; saying it again at the top of the middle made
// the bar half a switcher and half a set of tabs. The way back to the
// project is opening a paper, and removing the repository.
//
// There is no longer a button that sends a tab to the side either: the
// right panel's three are fixed (lib/workspace-slots), so a tab is only
// ever in one place and there is nothing to move.
export function RepoTabs({ tab, onTabChange, run }: RepoTabsProps) {
  return (
    <Tabs value={tab} onValueChange={(v) => onTabChange(v as MiddleTab)}>
      <TabsList className={TAB_LIST}>
        {MIDDLE_TABS.map((t) => (
          <TabsTrigger
            key={t}
            value={t}
            title={t === "preview" ? (run ? STATUS_LABEL[run.status] : "Not prepared") : undefined}
            className={TAB_TRIGGER}
          >
            {TAB_LABEL[t]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
