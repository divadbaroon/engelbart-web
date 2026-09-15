"use client";

import { useState } from "react";
import { usePanelRef } from "react-resizable-panels";
import { isPaperTab, paperTabValue, SAMPLE_PAPERS, type Paper } from "@/lib/papers";
import { isReadyStep, SAMPLE_REPOS, type Repo } from "@/lib/repos";
import { useRepoPrep } from "@/hooks/use-repo-prep";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NavRail, type SidebarMode } from "@/components/nav-rail";
import { ProjectSidebar } from "@/components/project-sidebar";
import { CenterPanel } from "@/components/center-panel";
import { ProjectTabs, ProjectContent } from "@/components/project-workspace";
import { RepoTabs, RepoContent, type RepoTab } from "@/components/repo-workspace";

type Center = { kind: "project" } | { kind: "repo"; id: string };
type Named = { id: string; name: string; meta: string; isNew?: boolean };
type RepoStatus = "none" | "ready" | "preparing";

// Generic list helpers for the editable sidebar lists (papers, repos).
function useEditableList<T extends Named>(initial: T[], blank: (id: string) => T) {
  const [items, setItems] = useState<T[]>(initial);
  const add = () => setItems((xs) => [...xs, blank(crypto.randomUUID())]);
  const rename = (id: string, name: string) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, name } : x)));
  // Leaving the field saves the item, or drops it when left empty.
  const commit = (id: string) =>
    setItems((xs) =>
      xs.flatMap((x) => (x.id !== id ? [x] : x.name.trim() ? [{ ...x, isNew: false, meta: x.meta || "Added just now" }] : [])),
    );
  return { items, add, rename, commit };
}

export function AppShell() {
  const sidebarRef = usePanelRef();
  const [mode, setMode] = useState<SidebarMode>("plan");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [center, setCenter] = useState<Center>({ kind: "project" });
  const [tab, setTab] = useState("preview");
  const [repoTabs, setRepoTabs] = useState<Record<string, RepoTab>>({});
  const { progress, prepare } = useRepoPrep();

  const papers = useEditableList<Paper>(SAMPLE_PAPERS, (id) => ({ id, name: "", meta: "", isNew: true }));
  const repos = useEditableList<Repo>(SAMPLE_REPOS, (id) => ({ id, name: "", meta: "", isNew: true }));
  const [openPaperIds, setOpenPaperIds] = useState<string[]>([]);

  // Clicking the active rail icon toggles the sidebar; any other icon switches mode and opens it.
  function select(next: SidebarMode) {
    if (next === mode && sidebarOpen) {
      sidebarRef.current?.collapse();
      return;
    }
    setMode(next);
    sidebarRef.current?.expand();
  }

  function openPaper(id: string) {
    setOpenPaperIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
    setTab(paperTabValue(id));
    setCenter({ kind: "project" });
  }

  function closePaper(id: string) {
    setOpenPaperIds((ids) => ids.filter((x) => x !== id));
    if (tab === paperTabValue(id)) setTab("preview");
  }

  // Opening a repo shows its README first and starts preparing it in the background.
  function openRepo(id: string) {
    setCenter({ kind: "repo", id });
    setRepoTabs((t) => (t[id] ? t : { ...t, [id]: "readme" }));
    prepare(id);
  }

  const repo = center.kind === "repo" ? repos.items.find((r) => r.id === center.id) : undefined;
  const openPapers = openPaperIds.map((id) => papers.items.find((p) => p.id === id)).filter((p): p is Paper => !!p);
  const activePaperId = center.kind === "project" && isPaperTab(tab) ? tab.slice("paper:".length) : null;
  const statusOf = (id: string): RepoStatus =>
  progress[id] === undefined ? "none" : isReadyStep(progress[id]) ? "ready" : "preparing";

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex min-h-0 flex-1">
        <NavRail mode={mode} onSelect={select} />
        <ResizablePanelGroup orientation="horizontal" id="engelbart-layout" className="min-h-0 flex-1">
          <ResizablePanel
            panelRef={sidebarRef}
            defaultSize="18" minSize="12" maxSize="30"
            collapsible collapsedSize="0"
            onResize={(size) => setSidebarOpen(size.asPercentage > 0)}
          >
            <ProjectSidebar
              mode={mode}
              onCollapse={() => sidebarRef.current?.collapse()}
              papers={{ items: papers.items, activeId: activePaperId, onOpen: openPaper, onAdd: papers.add, onRename: papers.rename, onCommit: papers.commit }}
              repos={{ items: repos.items, activeId: repo?.id ?? null, statusOf, onOpen: openRepo, onAdd: repos.add, onRename: repos.rename, onCommit: repos.commit }}
            />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize={82} minSize={40}>
            <CenterPanel
              tabs={
                repo ? (
                  <RepoTabs
                    repo={repo}
                    tab={repoTabs[repo.id] ?? "readme"}
                    onTabChange={(t) => setRepoTabs((all) => ({ ...all, [repo.id]: t }))}
                    ready={isReadyStep(progress[repo.id])}
                    onClose={() => setCenter({ kind: "project" })}
                  />
                ) : (
                  <ProjectTabs tab={tab} onTabChange={setTab} openPapers={openPapers} onClosePaper={closePaper} />
                )
              }
            >
              {repo ? (
                <RepoContent repo={repo} tab={repoTabs[repo.id] ?? "readme"} progress={progress[repo.id]} />
              ) : (
                <ProjectContent tab={tab} openPapers={openPapers} />
              )}
            </CenterPanel>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </TooltipProvider>
  );
}
