"use client";

import { useEffect, useState } from "react";
import { addSubgoal, findGoal, isDone, patchGoal, type Goal, type Plan } from "@/lib/plan";
import { createGoal, updateGoal } from "@/app/workspace/[workspaceId]/actions";
import { addRepo, dropPatch, fetchReadme, removeRepo, setRepoHint } from "@/app/workspace/[workspaceId]/repo-actions";
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

// Where the reader was, kept in the browser per project so a refresh lands
// on the same panel, tab and repository.
type Remembered = {
  mode: SidebarMode;
  sidebarOpen: boolean;
  center: Center;
  tab: string;
  repoTabs: Record<string, RepoTab>;
  openPaperIds: string[];
  selectedGoalId: string | null;
};
const MODES: SidebarMode[] = ["plan", "github", "papers"];
const REPO_TABS: RepoTab[] = ["readme", "code", "preview", "terminal", "env", "notes"];
const rememberKey = (projectId: string) => `engelbart:workspace:${projectId}`;

function readRemembered(projectId: string): Partial<Remembered> | null {
  try {
    const raw = localStorage.getItem(rememberKey(projectId));
    return raw ? (JSON.parse(raw) as Partial<Remembered>) : null;
  } catch {
    return null;
  }
}

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

  // Throw away the repair agent's edits and start the repository over.
  async function runWithoutPatch(repoId: string) {
    const result = await dropPatch(repoId);
    if (!result.ok) return;
    setRepos((rs) => rs.map((r) => (r.id === repoId ? { ...r, patch: null } : r)));
    sandbox.prepare(repoId);
  }
  // The person's line about what to run, kept on the repository for the planner.
  async function saveHint(repoId: string, hint: string) {
    const result = await setRepoHint(repoId, hint);
    if (!result.ok) return;
    setRepos((rs) => rs.map((r) => (r.id === repoId ? { ...r, hint: result.hint } : r)));
  }
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

  // Restore the remembered position once, checking each part still exists,
  // then keep the browser's copy current. `restored` is state, set in the
  // same batch as the restored values, so the first write already carries
  // them: a ref would let the write effect run first and save the defaults.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    const saved = readRemembered(projectId);
    if (saved) {
      if (saved.mode && MODES.includes(saved.mode)) setMode(saved.mode);
      if (saved.sidebarOpen === false) sidebarRef.current?.collapse();
      const savedCenter = saved.center;
      if (savedCenter?.kind === "repo" && repos.some((r) => r.id === savedCenter.id)) setCenter(savedCenter);
      const openIds = (saved.openPaperIds ?? []).filter((id) => papers.papers.some((p) => p.id === id));
      setOpenPaperIds(openIds);
      if (saved.tab && (!isPaperTab(saved.tab) || openIds.includes(saved.tab.slice("paper:".length)))) setTab(saved.tab);
      setRepoTabs(Object.fromEntries(Object.entries(saved.repoTabs ?? {}).filter(([id, t]) => repos.some((r) => r.id === id) && REPO_TABS.includes(t))));
      if (saved.selectedGoalId && findGoal(plan.goals, saved.selectedGoalId)) setSelectedGoalId(saved.selectedGoalId);
    }
    setRestored(true);
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!restored) return;
    const state: Remembered = { mode, sidebarOpen, center, tab, repoTabs, openPaperIds, selectedGoalId };
    try { localStorage.setItem(rememberKey(projectId), JSON.stringify(state)); } catch { /* private mode or full */ }
  }, [restored, projectId, mode, sidebarOpen, center, tab, repoTabs, openPaperIds, selectedGoalId]);

  // Whatever repository is in the middle needs its README and its run's
  // log, whether it got there by a click or by a restore.
  const centerRepoId = center.kind === "repo" ? center.id : null;
  useEffect(() => {
    if (!centerRepoId) return;
    const target = repos.find((r) => r.id === centerRepoId);
    if (target && !(centerRepoId in readmes)) {
      fetchReadme(target.owner, target.name).then((text) => setReadmes((all) => ({ ...all, [centerRepoId]: text })));
    }
    const run = sandbox.runs[centerRepoId];
    if (run) sandbox.load(run.id);
  }, [centerRepoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open papers need their signed links, whether opened by a click or restored.
  useEffect(() => {
    openPaperIds.forEach((id) => void papers.view(id));
  }, [openPaperIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

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
  }

  function closePaper(id: string) {
    setOpenPaperIds((ids) => ids.filter((x) => x !== id));
    if (tab === paperTabValue(id)) setTab("preview");
  }

  // Opening a repo shows its README first and, if it was never run, clones
  // it into a sandbox and starts it in the background. Failed runs are
  // retried from the preview tab.
  function openRepo(id: string) {
    setCenter({ kind: "repo", id });
    setRepoTabs((t) => (t[id] ? t : { ...t, [id]: "readme" }));
    if (!sandbox.runs[id]) sandbox.prepare(id);
  }

  // Add a repository by URL and start bringing it up straight away; the
  // dot on its row shows progress. Shared by the URL box and paper suggestions.
  async function addRepoAndStart(input: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const result = await addRepo(projectId, input);
    if (!result.ok) return result;
    setRepos((rs) => [...rs, result.repo]);
    void sandbox.prepare(result.repo.id);
    return { ok: true };
  }

  async function commitRepoAdd() {
    const input = (repoDraft ?? "").trim();
    if (!input) { setRepoDraft(null); return; }
    setRepoAdding(true);
    setRepoError(null);
    const result = await addRepoAndStart(input);
    setRepoAdding(false);
    if (result.ok) setRepoDraft(null);
    else setRepoError(result.error);
  }

  // Repositories a paper linked to that are not in the project yet. Adding
  // shows on the GitHub panel; any that GitHub refuses are reported there.
  const isKnownRepo = (url: string) => repos.some((r) => `https://github.com/${r.fullName}`.toLowerCase() === url.toLowerCase());
  const suggestion = (() => {
    const next = papers.suggestions.find((s) => s.repos.some((u) => !isKnownRepo(u)));
    return next ? { ...next, repos: next.repos.filter((u) => !isKnownRepo(u)) } : null;
  })();
  async function acceptSuggestion(paperId: string, urls: string[]) {
    papers.dismissSuggestion(paperId);
    const failed: string[] = [];
    for (const url of urls) {
      const result = await addRepoAndStart(url);
      if (!result.ok) failed.push(`${url.replace("https://github.com/", "")}: ${result.error}`);
    }
    setRepoError(failed.length ? failed.join(" ") : null);
    if (failed.length) { setMode("github"); sidebarRef.current?.expand(); }
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
                analyzing: papers.analyzing, suggestion, onAcceptSuggestion: acceptSuggestion, onDismissSuggestion: papers.dismissSuggestion,
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
                  onPrepareFresh={() => sandbox.prepare(repo.id, { fresh: true })}
                  onLaunch={(runId) => sandbox.launch(runId, repo.id)}
                  onStop={(runId) => sandbox.stop(runId, repo.id)}
                  onOpenEnvironment={() => setRepoTabs((all) => ({ ...all, [repo.id]: "env" }))}
                  onRunWithoutPatch={() => void runWithoutPatch(repo.id)}
                  onSaveHint={(hint) => saveHint(repo.id, hint)}
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
