"use client";

import { useState } from "react";
import { addSubgoal, findGoal, isDone, patchGoal, type Goal, type Plan } from "@/lib/plan";
import { createGoal, updateGoal } from "@/app/workspace/[workspaceId]/actions";
import { addRepo, fetchReadme, removeRepo } from "@/app/workspace/[workspaceId]/repo-actions";
import { usePanelRef } from "react-resizable-panels";
import { isPaperTab, paperTabValue, type Paper } from "@/lib/papers";
import { usePapers } from "@/hooks/use-papers";
import type { Repo } from "@/lib/repos";
import { isRunActive, isRunCloned, isRunRunning, type SandboxRun } from "@/lib/sandbox";
import { useSandboxRuns } from "@/hooks/use-sandbox-run";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NavRail, type SidebarMode } from "@/components/nav-rail";
import { ProjectSidebar } from "@/components/project-sidebar";
import { CenterPanel } from "@/components/center-panel";
import { ProjectTabs, ProjectContent } from "@/components/project-workspace";
import { RepoTabs, RepoContent, type RepoTab } from "@/components/repo-workspace";

type Center = { kind: "project" } | { kind: "repo"; id: string };
type RepoStatus = "none" | "preparing" | "cloned" | "ready" | "failed";

type AppShellProps = { projectId: string; plan: Plan; repos: Repo[]; runs: Record<string, SandboxRun>; papers: Paper[] };

export function AppShell({ projectId, plan, repos: initialRepos, runs: initialRuns, papers: initialPapers }: AppShellProps) {
  const sidebarRef = usePanelRef();
  const [mode, setMode] = useState<SidebarMode>("plan");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [center, setCenter] = useState<Center>({ kind: "project" });
  const [tab, setTab] = useState("preview");
  const [repoTabs, setRepoTabs] = useState<Record<string, RepoTab>>({});
  const sandbox = useSandboxRuns(initialRuns);

  const papers = usePapers(projectId, initialPapers);
  // Repositories: rows from the database, added by pasting a GitHub URL.
  const [repos, setRepos] = useState<Repo[]>(initialRepos);
  const [repoDraft, setRepoDraft] = useState<string | null>(null);
  const [repoAdding, setRepoAdding] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [readmes, setReadmes] = useState<Record<string, string | null>>({});
  // Per repo, how many files were saved into its sandbox; the preview reloads on each.
  const [previewVersions, setPreviewVersions] = useState<Record<string, number>>({});
  const [openPaperIds, setOpenPaperIds] = useState<string[]>([]);

  // The plan: goals from the database, edited in place and written back
  // through the same functions the CLI uses.
  const [goals, setGoals] = useState<Goal[]>(plan.goals);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(plan.goals[0]?.id ?? null);
  const [planError, setPlanError] = useState<string | null>(null);
  const selectedGoal = selectedGoalId ? findGoal(goals, selectedGoalId) : null;

  async function toggleGoalDone(goal: Goal) {
    const status = isDone(goal) ? "active" : "completed";
    setPlanError(null);
    const result = await updateGoal(goal.id, goal.updatedAt, { status });
    if (result.ok) {
      setGoals((gs) => patchGoal(gs, goal.id, { status, updatedAt: result.updatedAt }));
    } else if (result.conflict && result.current) {
      const theirs = result.current;
      setGoals((gs) => patchGoal(gs, goal.id, theirs));
    } else {
      setPlanError(result.error);
    }
  }

  async function addGoalUnder(parentId: string, title: string) {
    setPlanError(null);
    const result = await createGoal(projectId, title, parentId);
    if (result.ok) setGoals((gs) => addSubgoal(gs, parentId, result.goal));
    else setPlanError(result.error);
  }

  const noteSaved = (goalId: string, notes: string, updatedAt: string) =>
    setGoals((gs) => patchGoal(gs, goalId, { notes, updatedAt }));

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
    void papers.view(id);
  }

  function closePaper(id: string) {
    setOpenPaperIds((ids) => ids.filter((x) => x !== id));
    if (tab === paperTabValue(id)) setTab("preview");
  }

  // Opening a repo shows its README first and, the first time, clones it into
  // a sandbox and starts it in the background. A repo with a run already just
  // loads that run's log; failed runs are retried from the preview tab.
  function openRepo(id: string) {
    setCenter({ kind: "repo", id });
    setRepoTabs((t) => (t[id] ? t : { ...t, [id]: "readme" }));
    const run = sandbox.runs[id];
    if (!run) sandbox.prepare(id);
    else sandbox.load(run.id);
    const target = repos.find((r) => r.id === id);
    if (target && !(id in readmes)) {
      fetchReadme(target.owner, target.name).then((text) => setReadmes((all) => ({ ...all, [id]: text })));
    }
  }

  async function commitRepoAdd() {
    const input = (repoDraft ?? "").trim();
    if (!input) { setRepoDraft(null); return; }
    setRepoAdding(true);
    setRepoError(null);
    const result = await addRepo(projectId, input);
    setRepoAdding(false);
    if (result.ok) {
      setRepos((rs) => [...rs, result.repo]);
      setRepoDraft(null);
      // Start bringing it up straight away; the dot on the row shows progress.
      void sandbox.prepare(result.repo.id);
    } else {
      setRepoError(result.error);
    }
  }

  async function removeRepoRow(id: string) {
    setRepoError(null);
    const result = await removeRepo(id);
    if (!result.ok) { setRepoError(result.error); return; }
    setRepos((rs) => rs.filter((r) => r.id !== id));
    if (center.kind === "repo" && center.id === id) setCenter({ kind: "project" });
  }

  const repo = center.kind === "repo" ? repos.find((r) => r.id === center.id) : undefined;
  const openPapers = openPaperIds.map((id) => papers.papers.find((p) => p.id === id)).filter((p): p is Paper => !!p);
  const activePaperId = center.kind === "project" && isPaperTab(tab) ? tab.slice("paper:".length) : null;
  const statusOf = (id: string): RepoStatus => {
    const run = sandbox.runs[id];
    return isRunRunning(run) ? "ready" : isRunActive(run) ? "preparing" : isRunCloned(run) ? "cloned" : run?.status === "failed" ? "failed" : "none";
  };

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
              plan={{ goals, selectedId: selectedGoalId, onSelect: setSelectedGoalId, onToggleDone: toggleGoalDone, onAddSubgoal: addGoalUnder, error: planError }}
              papers={{
                papers: papers.papers, pending: papers.pending, activeId: activePaperId, onOpen: openPaper,
                onUpload: papers.upload, onAddFromUrl: papers.addFromUrl, onRename: papers.rename, onDismiss: papers.dismiss,
                onRemove: (id) => { papers.remove(id); closePaper(id); },
              }}
              repos={{
                repos, activeId: repo?.id ?? null, statusOf, onOpen: openRepo, onRemove: removeRepoRow,
                draft: repoDraft, adding: repoAdding, error: repoError,
                onDraftChange: setRepoDraft, onStartAdd: () => { setRepoError(null); setRepoDraft(""); },
                onCommitAdd: commitRepoAdd, onCancelAdd: () => { setRepoDraft(null); setRepoError(null); },
              }}
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
                    run={sandbox.runs[repo.id]}
                    onClose={() => setCenter({ kind: "project" })}
                  />
                ) : (
                  <ProjectTabs tab={tab} onTabChange={setTab} openPapers={openPapers} onClosePaper={closePaper} />
                )
              }
            >
              {repo ? (
                <RepoContent
                  repo={repo}
                  tab={repoTabs[repo.id] ?? "readme"}
                  run={sandbox.runs[repo.id]}
                  events={sandbox.events[sandbox.runs[repo.id]?.id ?? ""] ?? []}
                  error={sandbox.errors[repo.id]}
                  readme={readmes[repo.id]}
                  notesGoal={selectedGoal}
                  onNotesSaved={noteSaved}
                  previewVersion={previewVersions[repo.id] ?? 0}
                  onFileSaved={() => setPreviewVersions((v) => ({ ...v, [repo.id]: (v[repo.id] ?? 0) + 1 }))}
                  onPrepare={() => sandbox.prepare(repo.id)}
                  onLaunch={(runId) => sandbox.launch(runId, repo.id)}
                  onStop={(runId) => sandbox.stop(runId, repo.id)}
                />
              ) : (
                <ProjectContent tab={tab} openPapers={openPapers} paperUrls={papers.urls} notesGoal={selectedGoal} onNotesSaved={noteSaved} />
              )}
            </CenterPanel>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </TooltipProvider>
  );
}
