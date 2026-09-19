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
import { useScopedTraceView, useTraceView } from "@/hooks/use-trace-view";
import { useRecordings } from "@/hooks/use-recordings";
import { useAnnotations } from "@/hooks/use-annotations";
import { recordingStats, windowOf, type Recording, type TraceNav } from "@/lib/trace/recording";
import type { TraceRecordings } from "@/components/trace/behavior-trace";
import { useTraceSelection } from "@/hooks/use-trace-selection";
import { describeSelection, selectedStage } from "@/lib/trace/selection";
import type { MessageContext, Ref } from "@/lib/bart/protocol";
import { askPlaceholder, refLabel, toSelectionRef } from "@/lib/bart/labels";
import { useBartSession } from "@/hooks/use-bart-session";
import { BartPanel } from "@/components/bart-panel";
import { TraceBart } from "@/components/trace/trace-bart";
import type { CodeOpen } from "@/components/code-browser";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NavRail, type SidebarMode } from "@/components/nav-rail";
import { ProjectSidebar } from "@/components/project-sidebar";
import { CenterPanel } from "@/components/center-panel";
import { ProjectTabs, ProjectContent } from "@/components/project-workspace";
import { RepoTabs, RepoContent, type RepoTab } from "@/components/repo-workspace";
import { chooseTab, closeSide, normalize, sendAside, showTab, sideToMiddle, TAB_LABEL, type Slots } from "@/lib/workspace-slots";

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
  sideTabs: Record<string, RepoTab>;   // the tab shown on the side, per repository
  openPaperIds: string[];
  selectedGoalId: string | null;
};
const MODES: SidebarMode[] = ["plan", "github", "papers"];
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
  const [sideTabs, setSideTabs] = useState<Record<string, RepoTab>>({});
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
      const middles: Record<string, RepoTab> = {}, sides: Record<string, RepoTab> = {};
      for (const r of repos) {
        const slots = normalize(saved.repoTabs?.[r.id], saved.sideTabs?.[r.id]);
        if (saved.repoTabs?.[r.id] || slots.side) middles[r.id] = slots.middle;
        if (slots.side) sides[r.id] = slots.side;
      }
      setRepoTabs(middles);
      setSideTabs(sides);
      if (saved.selectedGoalId && findGoal(plan.goals, saved.selectedGoalId)) setSelectedGoalId(saved.selectedGoalId);
    }
    setRestored(true);
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!restored) return;
    const state: Remembered = { mode, sidebarOpen, center, tab, repoTabs, sideTabs, openPaperIds, selectedGoalId };
    try { localStorage.setItem(rememberKey(projectId), JSON.stringify(state)); } catch { /* private mode or full */ }
  }, [restored, projectId, mode, sidebarOpen, center, tab, repoTabs, sideTabs, openPaperIds, selectedGoalId]);

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
  // The trace of the run in the middle, read by the Trace tab, the
  // preview's strip and Bart alike, and the moment selected in it.
  const run = repo ? sandbox.runs[repo.id] : undefined;
  const trace = useTraceView(run);
  const picked = useTraceSelection(run?.id);
  // The run's recordings, and where the Trace tab is: the whole run, the
  // list, or one recording, which the tab shows on the same canvas from a
  // view cut to its window. Bart is told which recording is open.
  const recordings = useRecordings(run);
  // The notes written on this repository's interface. They belong to the
  // repository, so they are loaded with it and outlive any one run.
  const annotations = useAnnotations(repo, run);
  const [traceNav, setTraceNav] = useState<TraceNav>({ kind: "full" });
  useEffect(() => { setTraceNav({ kind: "full" }); }, [run?.id]);
  const openRecording = traceNav.kind === "recording" ? recordings.list.find((r) => r.id === traceNav.id) ?? null : null;
  useEffect(() => { if (traceNav.kind === "recording" && recordings.loaded && !openRecording) setTraceNav({ kind: "list" }); }, [traceNav.kind, recordings.loaded, openRecording]);
  const scopedTrace = useScopedTraceView(trace, openRecording ? windowOf(openRecording) : null);
  const stats = (rec: Recording) => recordingStats(trace.events, Object.values(trace.calls), rec, trace.frames);
  // A moment chosen from outside the open recording (the preview's strip, a
  // reference in an answer) is shown in the full trace rather than ringed
  // where it cannot be seen. From the list there is no canvas at all, so a
  // chosen moment always brings one back.
  const reveal = (target: { stageId?: string; callId?: string }) => {
    if (traceNav.kind === "list") { setTraceNav({ kind: "full" }); return; }
    if (!openRecording) return;
    const inside = target.stageId ? scopedTrace.stages.some((s) => s.id === target.stageId) : target.callId ? scopedTrace.callRows.has(target.callId) : true;
    if (!inside) setTraceNav({ kind: "full" });
  };
  // One conversation for the workspace, shown at full size on the right
  // panel's Bart tab and in the corner of the trace canvas. Both write
  // into it, so a question asked beside the evidence is there in the
  // panel too.
  const bart = useBartSession(projectId);
  const [traceBartOpen, setTraceBartOpen] = useState(false);
  const selectionText = repo ? describeSelection(scopedTrace.stages, scopedTrace.callRows, picked.selection) : null;
  const bartRecording = openRecording ? { id: openRecording.id, name: openRecording.name } : null;
  // A note the person asked about. A referent like the selected moment:
  // it says what "this" means, and constrains nothing else. It is dropped
  // when the note itself goes.
  const [askedAnnotation, setAskedAnnotation] = useState<string | null>(null);
  useEffect(() => { setAskedAnnotation(null); }, [repo?.id]);
  const askedNote = askedAnnotation && annotations.list.some((a) => a.id === askedAnnotation) ? askedAnnotation : null;
  // What a question is about: identities only. Nothing on the screen
  // travels with it; the route reads the trace itself.
  const bartContext: MessageContext = {
    runId: run?.id ?? null,
    repoId: repo?.id ?? null,
    selection: toSelectionRef(picked.selection),
    recordingId: bartRecording?.id ?? null,
    annotationId: askedNote,
  };
  // "Ask Bart about this" from the trace: open the window over the canvas
  // and put the cursor in it. The moment is already the selection.
  const askBart = () => { setTraceBartOpen(true); bart.ask("mini"); };
  // Where a repository's tabs are: one in the middle, at most one on the
  // side (lib/workspace-slots). `show` is for things that need a tab seen
  // and leave it where it is if it is already on the side.
  const slotsOf = (id: string): Slots => ({ middle: repoTabs[id] ?? "readme", side: sideTabs[id] ?? null });
  const update = (id: string, f: (s: Slots) => Slots) => {
    const next = f(slotsOf(id));
    setRepoTabs((all) => ({ ...all, [id]: next.middle }));
    setSideTabs((all) => { const n = { ...all }; if (next.side) n[id] = next.side; else delete n[id]; return n; });
  };
  const show = (id: string, t: RepoTab) => update(id, (sl) => showTab(sl, t));
  const sideTab = repo ? sideTabs[repo.id] ?? null : null;
  // A reference in one of Bart's answers, opened in the middle: a moment or
  // a call in the Trace tab with the drawer on it, a file in the Code tab,
  // the README.
  const [codeOpen, setCodeOpen] = useState<CodeOpen | null>(null);
  const openRef = (ref: Ref) => {
    if (!repo) return;
    switch (ref.kind) {
      case "moment": {
        const callId = ref.stageId.startsWith("stage:call:") ? ref.stageId.slice("stage:call:".length) : null;
        reveal(callId ? { callId } : { stageId: ref.stageId });
        picked.select(callId ? { kind: "call", callId, jump: { pane: "overview", focus: null } } : { kind: "stage", stageId: ref.stageId }, { detail: true });
        show(repo.id, "trace");
        break;
      }
      case "call":
        reveal({ callId: ref.callId });
        picked.select({ kind: "call", callId: ref.callId, jump: { pane: ref.pane ?? "overview", focus: null } }, { detail: true });
        show(repo.id, "trace");
        break;
      case "file":
        setCodeOpen((o) => ({ path: ref.path, line: ref.from, key: (o?.key ?? 0) + 1 }));
        show(repo.id, "code");
        break;
      case "annotation":
        annotations.focusOn(ref.id);
        show(repo.id, "preview");
        break;
      case "readme":
        show(repo.id, "readme");
        break;
    }
  };
  // A chip for a reference in an answer. An annotation is named by what
  // it says, so the chip reads as the note rather than as an id.
  const labelBartRef = (ref: Ref) => {
    if (ref.kind !== "annotation") return refLabel(ref, trace.stages, trace.callRows);
    const note = annotations.list.find((a) => a.id === ref.id);
    if (!note) return "annotation (not in this repository)";
    return note.body.length > 40 ? `${note.body.slice(0, 39)}…` : note.body;
  };
  const bartPanel = (
    <BartPanel
      session={bart}
      context={bartContext}
      repo={repo ?? null}
      selectionText={selectionText}
      recording={bartRecording}
      onClearSelection={picked.clear}
      onOpenRef={openRef}
      labelRef={labelBartRef}
    />
  );
  // The same session in the corner of the canvas, asking about whatever is
  // selected there. It floats: the canvas keeps its size and its camera.
  const traceBart = (
    <TraceBart
      session={bart}
      context={bartContext}
      repo={repo ?? null}
      open={traceBartOpen}
      onOpenChange={setTraceBartOpen}
      placeholder={askPlaceholder(selectedStage(scopedTrace.stages, picked.selection))}
      selectionText={selectionText}
      recording={bartRecording}
      onClearSelection={picked.clear}
      onOpenRef={openRef}
      labelRef={labelBartRef}
      onOpenPanel={() => { setTraceBartOpen(false); bart.ask("tab"); }}
    />
  );
  const traceRecordings: TraceRecordings | null = repo ? {
    recordings, nav: traceNav, onNav: setTraceNav, stats, reveal,
    open: (id) => { setTraceNav({ kind: "recording", id }); show(repo.id, "trace"); },
  } : null;
  // The repository's content for a slot: the same everything, only the tab
  // and the place differ.
  const content = (slot: "middle" | "side", t: RepoTab) => repo && traceRecordings && (
    <RepoContent
      slot={slot}
      traceAside={sideTab === "trace"}
      scopedTrace={scopedTrace}
      recording={traceRecordings}
      annotations={annotations}
      onAskAboutAnnotation={(id) => { setAskedAnnotation(id); bart.ask("tab"); }}
      traceBart={traceBart}
      repo={repo}
      tab={t}
      run={sandbox.runs[repo.id]}
      events={sandbox.events[sandbox.runs[repo.id]?.id ?? ""] ?? []}
      error={sandbox.errors[repo.id]}
      readme={readmes[repo.id]}
      notesGoal={selectedGoal}
      onNotesSaved={noteSaved}
      previewVersion={previewVersions[repo.id] ?? 0}
      onFileSaved={() => setPreviewVersions((v) => ({ ...v, [repo.id]: (v[repo.id] ?? 0) + 1 }))}
      trace={trace}
      selection={picked.selection}
      detail={picked.detail}
      onSelect={picked.select}
      onDetail={picked.setDetail}
      onAskBart={askBart}
      onOpenTrace={() => show(repo.id, "trace")}
      onOpenPreview={() => show(repo.id, "preview")}
      codeOpen={codeOpen}
      onPrepare={() => sandbox.prepare(repo.id)}
      onPrepareFresh={() => sandbox.prepare(repo.id, { fresh: true })}
      onLaunch={(runId) => sandbox.launch(runId, repo.id)}
      onStop={(runId) => sandbox.stop(runId, repo.id)}
      onOpenEnvironment={() => show(repo.id, "env")}
      onOpenTerminal={() => show(repo.id, "terminal")}
      onRunWithoutPatch={() => void runWithoutPatch(repo.id)}
      onSaveHint={(hint) => saveHint(repo.id, hint)}
                />
  );
  const openPapers = openPaperIds.map((id) => papers.papers.find((p) => p.id === id)).filter((p): p is Paper => !!p);
  const activePaperId = center.kind === "project" && isPaperTab(tab) ? tab.slice("paper:".length) : null;
  const statusOf = (id: string): RepoStatus => {
    const run = sandbox.runs[id];
    return isRunRunning(run) || run?.status === "usable" ? "ready" : isRunActive(run) ? "preparing" : isRunCloned(run) ? "cloned" : run?.status === "failed" ? "failed" : "none";
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
              bart={bartPanel}
              bartFocus={bart.focus}
              side={repo && sideTab ? { title: TAB_LABEL[sideTab], content: content("side", sideTab), onToMiddle: () => update(repo.id, sideToMiddle), onClose: () => update(repo.id, closeSide) } : null}
              tabs={
                repo ? (
                  <RepoTabs
                    repo={repo}
                    tab={repoTabs[repo.id] ?? "readme"}
                    onTabChange={(t) => update(repo.id, (sl) => chooseTab(sl, t))}
                    run={sandbox.runs[repo.id]}
                    onClose={() => setCenter({ kind: "project" })}
                    sideTab={sideTab}
                    onSendAside={(t) => update(repo.id, (sl) => sendAside(sl, t))}
                  />
                ) : (
                  <ProjectTabs tab={tab} onTabChange={setTab} openPapers={openPapers} onClosePaper={closePaper} />
                )
              }
            >
              {repo ? content("middle", repoTabs[repo.id] ?? "readme") : (
                <ProjectContent tab={tab} openPapers={openPapers} paperUrls={papers.urls} notesGoal={selectedGoal} onNotesSaved={noteSaved} />
              )}
            </CenterPanel>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </TooltipProvider>
  );
}
