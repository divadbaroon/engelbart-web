"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addRepo, dropPatch, fetchReadme, removeRepo } from "@/app/workspace/[workspaceId]/repo-actions";
import { usePanelRef } from "react-resizable-panels";
import { isPaperTab, paperTabValue, type Paper } from "@/lib/papers";
import { usePapers } from "@/hooks/use-papers";
import type { Repo } from "@/lib/repos";
import { isRunActive, isRunCloned, isRunRunning, type SandboxRun } from "@/lib/sandbox";
import { useSandboxRuns } from "@/hooks/use-sandbox-run";
import { useScopedTraceView, useTraceView } from "@/hooks/use-trace-view";
import { useArtifactProfile } from "@/hooks/use-artifact-profile";
import { useRecordings } from "@/hooks/use-recordings";
import { useRunHistory } from "@/hooks/use-run-history";
import { useAnnotations } from "@/hooks/use-annotations";
import { useSemantics } from "@/hooks/use-semantics";
import { clearMark, recordingStats, type Recording, windowOf } from "@/lib/trace/recording";
import { clockOffset, stageAt } from "@/lib/trace/replay";
import type { CanvasMark } from "@/components/trace/behavior-trace";
import type { TraceRecordings } from "@/components/trace/replay-panel";
import type { RunScope } from "@/components/trace/run-header";
import { useTraceSelection } from "@/hooks/use-trace-selection";
import { describeSelection, selectedEpisode, selectedStage } from "@/lib/trace/selection";
import { momentKind } from "@/lib/trace/moments";
import type { Shown } from "@/lib/activity/graph";
import type { MessageContext, Ref } from "@/lib/bart/protocol";
import { askPlaceholder, refLabel, toSelectionRef } from "@/lib/bart/labels";
import { useBartSession } from "@/hooks/use-bart-session";
import { BartPanel } from "@/components/bart-panel";
import { TraceBart } from "@/components/trace/trace-bart";
import type { CodeOpen } from "@/components/code-browser";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NavRail, type SidebarMode } from "@/components/nav-rail";
import { MIN_WIDTH, NAME_FONT, sidebarWidth, widestText } from "@/lib/sidebar-width";
import { ProjectSidebar } from "@/components/project-sidebar";
import { CenterPanel } from "@/components/center-panel";
import { ProjectTabs, ProjectContent } from "@/components/project-workspace";
import { RepoTabs, RepoContent } from "@/components/repo-workspace";
import type { SetupTab } from "@/components/setup-panel";
import type { StepId } from "@/lib/run-steps";
import { isPanelTab, normalize, showTab, type MiddleTab, type PanelTab, type Slots, type Surface } from "@/lib/workspace-slots";

type Center = { kind: "project" } | { kind: "repo"; id: string };
type RepoStatus = "none" | "preparing" | "cloned" | "ready" | "failed";

type AppShellProps = { projectId: string; repos: Repo[]; runs: Record<string, SandboxRun>; papers: Paper[] };

// Where the reader was, kept in the browser per project so a refresh lands
// on the same panel, tab and repository.
type Remembered = {
  mode: SidebarMode;
  sidebarOpen: boolean;
  center: Center;
  tab: string;
  repoTabs: Record<string, MiddleTab>;
  panelTabs: Record<string, PanelTab>;   // which of Bart, the Terminal and the Trace is in front, per repository
  openPaperIds: string[];
};

// Written by the version of this file in which the Terminal and the Trace
// were middle tabs that could be sent to the side, and the Notes tab wrote
// against a chosen goal. Read on the first load after the change so a
// remembered layout survives it, and never written again.
type Legacy = { sideTabs?: Record<string, string> };
const MODES: SidebarMode[] = ["github", "papers"];
// No paper open: the project bar has nothing selected, and the middle says
// what there is to do instead.
const NO_PAPER = "";
const rememberKey = (projectId: string) => `engelbart:workspace:${projectId}`;

function readRemembered(projectId: string): (Partial<Remembered> & Legacy) | null {
  try {
    const raw = localStorage.getItem(rememberKey(projectId));
    return raw ? (JSON.parse(raw) as Partial<Remembered> & Legacy) : null;
  } catch {
    return null;
  }
}

export function AppShell({ projectId, repos: initialRepos, runs: initialRuns, papers: initialPapers }: AppShellProps) {
  const sidebarRef = usePanelRef();
  const [mode, setMode] = useState<SidebarMode>("github");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [center, setCenter] = useState<Center>({ kind: "project" });
  // The project bar holds open papers and nothing else now, so its tab is
  // a paper or it is nothing at all. "preview" and "notes" used to be
  // possible here and no longer are.
  const [tab, setTab] = useState(NO_PAPER);
  const [repoTabs, setRepoTabs] = useState<Record<string, MiddleTab>>({});
  const [panelTabs, setPanelTabs] = useState<Record<string, PanelTab>>({});
  // Bumped whenever something asks for one of the panel's tabs, so a
  // closed panel opens to show what was asked for.
  const [panelFocus, setPanelFocus] = useState(0);
  // Which section of Setup is showing. Here rather than in the panel so
  // that something needing one seen can say which — the Live preview's
  // "Add the values" means the Environment, not the build steps.
  const [setupSection, setSetupSection] = useState<SetupTab>("build");
  // Which step's slice of the log Logs is cut to, or the whole run.
  const [logStep, setLogStep] = useState<StepId | null>(null);
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
  const [repoDraft, setRepoDraft] = useState<string | null>(null);
  const [repoAdding, setRepoAdding] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [readmes, setReadmes] = useState<Record<string, string | null>>({});
  // Per repo, how many files were saved into its sandbox; the preview reloads on each.
  const [previewVersions, setPreviewVersions] = useState<Record<string, number>>({});
  const [openPaperIds, setOpenPaperIds] = useState<string[]>([]);


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
      const paper = saved.tab ?? NO_PAPER;
      if (isPaperTab(paper) && openIds.includes(paper.slice("paper:".length))) setTab(paper);
      const middles: Record<string, MiddleTab> = {}, panels: Record<string, PanelTab> = {};
      for (const r of repos) {
        // The old side slot is read as the panel, which is where the only
        // thing it ever usefully held — the trace — lives now.
        const remembered = saved.panelTabs?.[r.id] ?? saved.sideTabs?.[r.id];
        if (!saved.repoTabs?.[r.id] && !remembered) continue;
        const slots = normalize(saved.repoTabs?.[r.id], remembered);
        middles[r.id] = slots.middle;
        panels[r.id] = slots.panel;
      }
      setRepoTabs(middles);
      setPanelTabs(panels);
    }
    setRestored(true);
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // The sidebar is as wide as the longest repository name and no wider.
  // Done here rather than as a `defaultSize` because the width depends on
  // measuring text, which the server cannot do — rendering one number and
  // hydrating another is a mismatch on the panel's own style attribute.
  // It runs when the list of names changes, so adding a repository with a
  // longer name widens the panel to fit it, and never while somebody is
  // dragging the handle, because that does not change any name.
  const names = repos.map((r) => r.fullName).join("\n");
  useEffect(() => {
    if (sidebarRef.current?.isCollapsed()) return;
    sidebarRef.current?.resize(sidebarWidth(widestText(names ? names.split("\n") : [], NAME_FONT)));
  }, [names]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!restored) return;
    const state: Remembered = { mode, sidebarOpen, center, tab, repoTabs, panelTabs, openPaperIds };
    try { localStorage.setItem(rememberKey(projectId), JSON.stringify(state)); } catch { /* private mode or full */ }
  }, [restored, projectId, mode, sidebarOpen, center, tab, repoTabs, panelTabs, openPaperIds]);

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
    if (tab === paperTabValue(id)) setTab(NO_PAPER);
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
  // Which run of this repository is being read, by the Visualizer, the
  // preview's strip and Bart alike. The newest is the one the
  // workspace opens — and until now the only one it could reach, so a
  // relaunch put the session before it, with its recordings, out of sight
  // rather than out of existence. An earlier run chosen here is read by
  // everything on the trace side: the canvas, the activity, the
  // recordings, the profile and what Bart is answering about. The Live
  // preview and the terminal are untouched and keep the live run, which
  // they take from `sandbox.runs` themselves — they can only ever mean
  // the run that is actually running.
  const history = useRunHistory(repo, repo ? sandbox.runs[repo.id] : undefined);
  const run = history.run;
  // What this application's interfaces are for, read once per interface
  // and kept. It is asked for in the Live preview, and the answer names
  // rows in the trace; without it every label is what the page said,
  // which is what the trace shows anyway.
  const semantics = useSemantics(repo, run);
  // What this artifact is, in its own words: a reading this application
  // ships for a repository it knows, or one written for this repository
  // from the repository and one recording of it. Until there is one the
  // session is read blind — never in another artifact's vocabulary.
  const profile = useArtifactProfile(repo, run);
  const trace = useTraceView(run, semantics.index, profile.reading);
  // The run offers what it has recorded, and the profile hook decides
  // whether that is enough to be worth reading. Declared after the trace
  // rather than inside it because the reading is an input to the trace,
  // and the events are an output of it.
  useEffect(() => { profile.offer(trace.events); }, [trace.events, profile.offer]); // eslint-disable-line react-hooks/exhaustive-deps
  const picked = useTraceSelection(run?.id);
  // The run's recordings, and which one is being watched in Replay. That
  // one recording is also what cuts Activity and the Visualizer down to
  // its minutes, and what Bart is told is open. It used to be one branch
  // of a five-way nav inside the Visualizer, which meant "which tool am I
  // looking at" and "which recording is open" were one value and could
  // not both be true.
  const recordings = useRecordings(run);
  // The notes written on this repository's interface. They belong to the
  // repository, so they are loaded with it and outlive any one run.
  const annotations = useAnnotations(repo, run);
  const [openRecordingId, setOpenRecordingId] = useState<string | null>(null);
  // Where the canvas starts from, when the person has asked for a clean
  // one. It is a mark on the clock and nothing else: no row is touched,
  // collection carries on, and the recordings and the notes still hold
  // everything. It belongs to the run, so it survives moving between
  // tabs and goes when the run does.
  const [clearedAt, setClearedAt] = useState<string | null>(null);
  // Which side of the session the canvas draws. Like the clear above it
  // this hides rather than deletes — no row is touched, collection
  // carries on, and Activity, Replay and the export still hold both
  // sides — and like the clear it belongs to the run, so it survives
  // moving between tabs and goes when the run does. Not remembered
  // across sessions for the same reason: opening a run to a graph
  // missing half its moments, with no memory of having asked for that,
  // is exactly the mistake the banners exist to prevent.
  const [shown, setShown] = useState<Shown>("both");
  // Whether the canvas keeps the newest card in frame as it arrives. On
  // to start with, because a run in progress puts each new moment off the
  // right edge and watching one is the reason the tab is open; off the
  // moment you pan away, because a camera that pulls you back while you
  // are reading an earlier card is worse than no camera at all. Beside
  // `shown` and for the same reason: it belongs to the run, and it has to
  // outlive the canvas being cleared, which remounts it.
  const [follow, setFollow] = useState(true);
  // Moving to another run starts on the whole trace of it — unless the
  // move was made in order to open one of its recordings, which is what
  // `pendingRecording` carries across. Without it the recording asked for
  // would be set and then immediately cleared by this.
  const pendingRecording = useRef<string | null>(null);
  useEffect(() => {
    setOpenRecordingId(pendingRecording.current);
    pendingRecording.current = null;
    setClearedAt(null);
    setShown("both");
    setFollow(true);
  }, [run?.id]);
  const openRecording = openRecordingId ? recordings.list.find((r) => r.id === openRecordingId) ?? null : null;
  // Deleted, or not this run's after all: the tab goes back to the list
  // rather than sitting on a recording that is not there.
  useEffect(() => { if (openRecordingId && recordings.loaded && !openRecording) setOpenRecordingId(null); }, [openRecordingId, recordings.loaded, openRecording]);
  const scopedTrace = useScopedTraceView(trace, openRecording ? windowOf(openRecording) : clearedAt ? { start: clearedAt, end: null } : null);
  // The mark comes from the trace's own clock (clearMark). The selection
  // goes with it: a moment no longer on the canvas should not still be
  // what "this" refers to in the conversation.
  const clearCanvas = () => {
    const mark = clearMark(trace.events);
    if (!mark) return;
    setClearedAt(mark);
    picked.clear();
  };
  const showEverything = () => setClearedAt(null);
  // The same rule as the clear, for the same reason: a moment no longer
  // on the canvas should not still be what "this" refers to, and the
  // drawer under the canvas should not be describing a card nobody can
  // see. Asked of the stage's own kind, so a selection on a call is let
  // go when the software's side is hidden even though the wait that
  // replaces it leads back to the same stage — a cleared selection is
  // recoverable, a ring on an invisible card is not.
  const chooseShown = (next: Shown) => {
    setShown(next);
    const stage = selectedStage(scopedTrace.stages, picked.selection);
    if (!stage || next === "both") return;
    if ((momentKind(stage) === "human") !== (next === "person")) picked.clear();
  };
  const stats = (rec: Recording) => recordingStats(trace.events, Object.values(trace.calls), rec, trace.frames);
  // A moment chosen from outside the open recording (the preview's strip, a
  // reference in an answer) is shown in the whole run rather than ringed
  // where it cannot be seen.
  const reveal = (target: { stageId?: string; callId?: string }) => {
    if (!openRecording) return;
    const inside = target.stageId ? scopedTrace.stages.some((s) => s.id === target.stageId) : target.callId ? scopedTrace.callRows.has(target.callId) : true;
    if (!inside) setOpenRecordingId(null);
  };
  // ---- the replay, and keeping it beside the trace
  //
  // A recording that was captured can be watched back where the running
  // application usually is. There is no separate mode for that: the
  // recording being open IS the mode, so nothing can disagree about
  // whether the middle is live.
  //
  // The two records keep different clocks — rrweb stamps the viewer's, the
  // trace carries the sandbox's — and the gateway already measured the
  // difference on every event the browser sent. Without a reading the two
  // are left alone rather than lined up on a guess.
  const replayOffset = useMemo(() => clockOffset(trace.events), [trace.events]);
  // Where a moment has asked the playhead to go. Keyed, so choosing the
  // same moment twice moves it back there rather than doing nothing.
  const [seekTo, setSeekTo] = useState<{ at: string; key: number } | null>(null);
  const watching = openRecording?.id ?? null;
  useEffect(() => { setSeekTo(null); }, [watching]);
  // The playhead names a moment. It only ever selects: it never seeks, or
  // the two would drive each other in a circle.
  const replayMoment = useCallback((at: string) => {
    const stage = stageAt(scopedTrace.stages, at);
    if (!stage) return;
    const now = picked.selection;
    if (now?.kind === "stage" && now.stageId === stage.id) return;
    picked.select({ kind: "stage", stageId: stage.id });
  }, [scopedTrace.stages, picked]);

  // One conversation for the workspace, shown at full size on the right
  // panel's Bart tab and in the corner of the trace canvas. Both write
  // into it, so a question asked beside the evidence is there in the
  // panel too.
  // Choosing a moment anywhere — the canvas, the strip, a reference in an
  // answer — takes the replay to it, when one is open. It hangs off the
  // act of choosing rather than off the selection changing, so the
  // playhead's own selections do not come back as seeks.
  const chooseMoment: typeof picked.select = useCallback((selection, options) => {
    picked.select(selection, options);
    const stage = selectedStage(scopedTrace.stages, selection);
    // A moment chosen from outside — Activity, the preview's strip, a
    // reference in one of Bart's answers — brings its side back rather
    // than being ringed where it cannot be seen. The same rule `reveal`
    // follows for a recording, and the reason the two controls can be
    // left alone the rest of the time.
    if (stage && shown !== "both" && (momentKind(stage) === "human") !== (shown === "person")) setShown("both");
    if (!openRecording) return;
    if (stage) setSeekTo((s) => ({ at: stage.at, key: (s?.key ?? 0) + 1 }));
  }, [picked, openRecording, scopedTrace.stages, shown]);

  const bart = useBartSession(projectId);
  const [traceBartOpen, setTraceBartOpen] = useState(false);
  const selectionText = repo ? describeSelection(scopedTrace.stages, scopedTrace.callRows, picked.selection, scopedTrace.episodes) : null;
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
  // Which tab is in front in each of the repository's two bars
  // (lib/workspace-slots). `show` is for anything that needs a surface
  // seen: it goes to the bar that owns it and leaves the other alone, and
  // opens the right-hand panel if what it wants is in there.
  const slotsOf = (id: string): Slots => ({ middle: repoTabs[id] ?? "readme", panel: panelTabs[id] ?? "bart" });
  const update = (id: string, f: (s: Slots) => Slots) => {
    const next = f(slotsOf(id));
    setRepoTabs((all) => ({ ...all, [id]: next.middle }));
    setPanelTabs((all) => ({ ...all, [id]: next.panel }));
  };
  const show = (id: string, t: Surface) => {
    update(id, (sl) => showTab(sl, t));
    if (isPanelTab(t)) setPanelFocus((n) => n + 1);
  };
  // "Ask Bart" from anywhere that is not the small window over the canvas:
  // the panel's Bart tab, opened and with the cursor in it.
  const openBart = () => {
    if (repo) show(repo.id, "bart"); else setPanelFocus((n) => n + 1);
    bart.ask("tab");
  };
  // A reference in one of Bart's answers, opened in the middle: a moment or
  // a call in the Visualizer with the drawer on it, a file in the Code tab,
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
      placeholder={askPlaceholder(selectedStage(scopedTrace.stages, picked.selection), selectedEpisode(scopedTrace.stages, scopedTrace.episodes, picked.selection))}
      selectionText={selectionText}
      recording={bartRecording}
      onClearSelection={picked.clear}
      onOpenRef={openRef}
      labelRef={labelBartRef}
      onOpenPanel={() => { setTraceBartOpen(false); openBart(); }}
    />
  );
  // How a recording is stopped, registered by the Live preview because the
  // capture of what the page looked like is there. Without one — no
  // preview, nothing captured — stopping is what it always was.
  const stopWithReplay = useRef<(() => Promise<void>) | null>(null);
  const traceRecordings: TraceRecordings | null = repo ? {
    recordings, open: openRecording, stats, reveal,
    stop: () => { void (stopWithReplay.current ? stopWithReplay.current() : recordings.stop()); },
    // A recording of an earlier run is read against that run and no
    // other, so opening one is a move: go to the run, then open it there.
    openEarlier: (runId: string, recordingId: string) => {
      if (runId === run?.id) { setOpenRecordingId(recordingId); show(repo.id, "replay"); return; }
      pendingRecording.current = recordingId;
      history.view(runId);
      show(repo.id, "replay");
    },
    past: history.past,
    // Opening a recording plays it, and cuts Activity and the Visualizer
    // to the same minutes. It used to also take the middle off the
    // running application, because the replay stood where the preview
    // did; Replay is its own tool now, so the artifact stays up beside
    // the record of it.
    onOpen: (id: string) => { setOpenRecordingId(id); show(repo.id, "replay"); },
    onClose: () => setOpenRecordingId(null),
  } : null;
  const traceCanvasMark: CanvasMark = { clearedAt, canClear: trace.events.length > 0, onClear: clearCanvas, onShowEverything: showEverything, shown, onShown: chooseShown, follow, onFollow: setFollow };
  // Which run Activity and the Visualizer are reading, and whether a
  // recording has cut them down. One object for both, so the two tools
  // cannot come to differ about what they are showing.
  const runScope: RunScope = {
    history,
    scopedTo: openRecording,
    onWholeRun: () => setOpenRecordingId(null),
  };
  // The repository's content for one surface: the same everything, only
  // the tab differs. Which bar it is drawn in is not its business.
  const content = (t: Surface) => repo && traceRecordings && (
    <RepoContent
      scopedTrace={scopedTrace}
      scope={runScope}
      recording={traceRecordings}
      replayClock={{ offset: replayOffset, seekTo, onMoment: replayMoment }}
      // With the details, because that is what going to the Visualizer
      // from a line in Activity is for: the canvas alone would ring a
      // card and say no more than the line already did.
      onOpenMoment={(stageId, episodeId) => { chooseMoment({ kind: "stage", stageId, ...(episodeId ? { episodeId } : {}) }, { detail: true }); show(repo.id, "trace"); }}
      canvasMark={traceCanvasMark}
      registerStop={stopWithReplay}
      annotations={annotations}
      onAskAboutAnnotation={(id) => { setAskedAnnotation(id); openBart(); }}
      // The same two steps a reference to a note in one of Bart's answers
      // takes: mark it for the page to find, and bring the page forward.
      // The Live preview is where a note lives; the list only says which
      // ones there are.
      onShowAnnotation={(id) => { if (repo) { annotations.focusOn(id); show(repo.id, "preview"); } }}
      semantics={semantics}
      traceBart={traceBart}
      repo={repo}
      tab={t}
      run={sandbox.runs[repo.id]}
      events={sandbox.events[sandbox.runs[repo.id]?.id ?? ""] ?? []}
      error={sandbox.errors[repo.id]}
      readme={readmes[repo.id]}
      previewVersion={previewVersions[repo.id] ?? 0}
      onFileSaved={() => setPreviewVersions((v) => ({ ...v, [repo.id]: (v[repo.id] ?? 0) + 1 }))}
      trace={trace}
      selection={picked.selection}
      detail={picked.detail}
      onSelect={chooseMoment}
      onDetail={picked.setDetail}
      onAskBart={askBart}
      onOpenTrace={() => show(repo.id, "trace")}
      setup={{ section: setupSection, onSection: setSetupSection, logStep, onLogStep: setLogStep }}
      codeOpen={codeOpen}
      onPrepare={() => sandbox.prepare(repo.id)}
      onRelaunch={() => { if (run) void sandbox.relaunch(run.id, repo.id); }}
      onPrepareFresh={() => sandbox.prepare(repo.id, { fresh: true })}
      onLaunch={(runId) => sandbox.launch(runId, repo.id)}
      onStop={(runId) => sandbox.stop(runId, repo.id)}
      onOpenBuild={() => { setSetupSection("build"); show(repo.id, "setup"); }}
      onOpenTerminal={() => { setSetupSection("terminal"); show(repo.id, "setup"); }}
      onOpenLogs={(step) => { setLogStep(step); setSetupSection("logs"); show(repo.id, "setup"); }}
      onRunWithoutPatch={() => void runWithoutPatch(repo.id)}
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
            defaultSize={MIN_WIDTH} minSize={MIN_WIDTH} maxSize={520}
            collapsible collapsedSize="0"
            onResize={(size) => setSidebarOpen(size.asPercentage > 0)}
          >
            <ProjectSidebar
              mode={mode}
              onCollapse={() => sidebarRef.current?.collapse()}
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
          {/* No `defaultSize`: the sidebar's is in pixels, and a group whose
              panels all carry a default lays them out in the ratio of those
              defaults rather than filling the row — 82 read as 82 pixels put
              the sidebar over half the window. Left without one, this panel
              is handed whatever the sidebar did not take, which is what it
              was always meant to be. */}
          <ResizablePanel minSize={40}>
            <CenterPanel
              panes={{ bart: bartPanel, trace: content("trace"), replay: content("replay"), annotations: content("annotations"), activity: content("activity") }}
              middle={repo ? { readme: content("readme"), code: content("code"), preview: content("preview"), setup: content("setup") } : null}
              middleTab={repo ? repoTabs[repo.id] ?? "readme" : undefined}
              tab={repo ? panelTabs[repo.id] ?? "bart" : "bart"}
              onTabChange={(t) => { if (repo) setPanelTabs((all) => ({ ...all, [repo.id]: t })); }}
              focus={panelFocus}
              repoId={repo?.id ?? null}
              tabs={
                repo ? (
                  <RepoTabs
                    tab={repoTabs[repo.id] ?? "readme"}
                    onTabChange={(t) => {
                      // Setup pressed in the bar opens on the build,
                      // which is what the tab is opened for. Something
                      // asking for a particular section — "Add the
                      // values", a step's logs — sets it and comes
                      // nowhere near here, so it is not overruled.
                      if (t === "setup") setSetupSection("build");
                      setRepoTabs((all) => ({ ...all, [repo.id]: t }));
                    }}
                    run={sandbox.runs[repo.id]}
                  />
                ) : (
                  <ProjectTabs tab={tab} onTabChange={setTab} openPapers={openPapers} onClosePaper={closePaper} />
                )
              }
            >
              <ProjectContent
                tab={tab}
                openPapers={openPapers}
                paperUrls={papers.urls}
                hasRepos={repos.length > 0}
                /* The same action the sidebar's "Add repository" row is:
                   open the draft row, and show the panel it is in. */
                onAddRepo={() => { setMode("github"); setSidebarOpen(true); setRepoError(null); setRepoDraft(""); }}
              />
            </CenterPanel>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </TooltipProvider>
  );
}
