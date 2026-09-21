"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Play, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Repo } from "@/lib/repos";
import { RunTimeline } from "@/components/run-timeline";
import { formatDay, runSteps, type StepId } from "@/lib/run-steps";
import { getSharedTrail, type SharedTrail } from "@/app/workspace/[workspaceId]/trail-actions";
import { environmentFromEvents, isRunActive, isRunCloned, isRunRunning, isRunUsable, isSandboxLive, plainError, STATUS_LABEL, type PreviewService, type SandboxEvent, type SandboxRun } from "@/lib/sandbox";
import { Button } from "@/components/ui/button";
import { CUBES, PreviewState } from "@/components/preview-state";
import { Markdown } from "@/components/markdown";
import { CodeBrowser, type CodeOpen } from "@/components/code-browser";
import { SetupPanel, type SetupTab } from "@/components/setup-panel";
import { PatchView } from "@/components/patch-view";
import { patchFromEvents, type RepoPatch } from "@/lib/patch";
import { BehaviorTrace, type CanvasMark } from "@/components/trace/behavior-trace";
import { ActivityPanel } from "@/components/trace/activity-panel";
import { AnnotationsPanel } from "@/components/trace/annotations-panel";
import { ReplayPanel, type ReplayClock, type TraceRecordings } from "@/components/trace/replay-panel";
import type { RunScope } from "@/components/trace/run-header";
import { RecordButton, RecordingSaved } from "@/components/trace/record-control";
import { useCapture } from "@/hooks/use-capture";
import { REPLAYS_BUCKET, replayStoragePath } from "@/lib/trace/recording";
import { clockOffset, type StoredReplay } from "@/lib/trace/replay";
import { createClient } from "@/lib/supabase/client";
import { AnnotateControl } from "@/components/annotate/control";
import { AnnotationComposer } from "@/components/annotate/composer";
import { AnnotationNote } from "@/components/annotate/note";
import { usePicker } from "@/hooks/use-picker";
import { useSurvey } from "@/hooks/use-survey";
import type { Semantics } from "@/hooks/use-semantics";
import { sayWhy } from "@/lib/annotations/probe";
import type { Annotations } from "@/hooks/use-annotations";
import type { TraceView } from "@/hooks/use-trace-view";
import type { Selection } from "@/lib/trace/selection";

import type { Surface } from "@/lib/workspace-slots";
import { RepoTabs, TAB_LIST, TAB_TRIGGER, type MiddleTab } from "@/components/repo-tabs";
export { RepoTabs, TAB_LIST, TAB_TRIGGER, type MiddleTab };

// `readme` is undefined while it loads, null when the repo has none GitHub can serve.
type RunControls = {
  onPrepare: () => void;                 // clone into a fresh sandbox and start
  onRelaunch: () => void;                // start the application again in the sandbox this run is already in
  onPrepareFresh: () => void;            // the same, ignoring any saved command list
  onLaunch: (runId: string) => void;     // start the app in an existing cloned sandbox
  onStop: (runId: string) => void | Promise<void>;   // kill the sandbox
  onOpenBuild: () => void;               // show Setup's Build, where the run is put together
  onOpenTerminal: () => void;            // show Setup's Terminal, the shell in the sandbox
  // Show Logs, cut to what one step printed. The steps already slice the
  // log, so this carries a filter and never a copy.
  onOpenLogs: (step: StepId | null) => void;
  onRunWithoutPatch: () => void;         // drop the repair agent's edits and prepare again
};

type RepoContentProps = RunControls & {
  // Which section of Setup to show, held in the shell so the Live
  // preview's "Add the values" can ask for the Environment by name.
  setup: { section: SetupTab; onSection: (section: SetupTab) => void; logStep: StepId | null; onLogStep: (step: StepId | null) => void };
  repo: Repo;
  tab: Surface;
  run: SandboxRun | undefined;
  events: SandboxEvent[];
  error: string | undefined;
  readme: string | null | undefined;
  // Bumped each time a file is saved into the sandbox; the preview reloads on it.
  previewVersion: number;
  onFileSaved: () => void;
  // The run's trace, shared with Bart, and the moment selected in it.
  trace: TraceView;
  selection: Selection | null;
  detail: boolean;
  onSelect: (selection: Selection, options?: { detail?: boolean }) => void;
  onDetail: (open: boolean) => void;
  onAskBart: () => void;
  onOpenTrace: () => void;               // bring the Visualizer to the front of the right panel
  codeOpen: CodeOpen | null;             // a file a Bart answer pointed at
  scopedTrace: TraceView;                // what Activity and the Visualizer show: the run, or the open recording's slice of it
  recording: TraceRecordings;            // the run's recordings, and the one open in Replay
  replayClock: ReplayClock;              // the two clocks, and where the playhead is being sent
  scope: RunScope;                       // which run these three are reading, and how much of it
  onOpenMoment: (stageId: string, episodeId: string) => void;   // from an Activity episode into the Visualizer
  canvasMark: CanvasMark;                // where the Visualizer's canvas starts from, when a clean one was asked for
  annotations: Annotations;              // the notes written on this repository's interface
  onAskAboutAnnotation: (id: string) => void;
  onShowAnnotation: (id: string) => void;      // to the Live preview, at the element the note is on   // ask Bart about one of them
  semantics: Semantics;                         // what the parts of this application's interfaces are for
  traceBart: ReactNode;                  // Bart's small window, floating over the trace canvas
  // Where the Live preview puts its way of stopping a recording, so the
  // Stop buttons on the trace and the recordings list use the same one.
  registerStop: React.RefObject<(() => Promise<void>) | null>;
};

// The trace's selection callbacks, shared by the preview's strip and the Visualizer.
export type TraceControls = { trace: TraceView; selection: Selection | null; onSelect: RepoContentProps["onSelect"]; onOpenTrace: () => void; onAskBart: () => void; recording: TraceRecordings; annotations: Annotations; onAskAboutAnnotation: (id: string) => void; semantics: Semantics; registerStop: RepoContentProps["registerStop"] };

export function RepoContent({ repo, tab, run, events, error, readme, previewVersion, onFileSaved, trace, selection, detail, onSelect, onDetail, onAskBart, onOpenTrace, codeOpen, scopedTrace, recording, replayClock, scope, onOpenMoment, canvasMark, annotations, onAskAboutAnnotation, onShowAnnotation, semantics, traceBart, registerStop, onPrepare, onRelaunch, onPrepareFresh, onLaunch, onStop, onOpenBuild, onOpenTerminal, onOpenLogs, onRunWithoutPatch, setup }: RepoContentProps) {
  // The environment scan and any repair edits from this run's log if it
  // has them, else the last ones saved on the repository.
  const envReport = (run && environmentFromEvents(events, run.id)) ?? repo.envReport;
  const livePatch = run && patchFromEvents(events, run.id);
  const patch: RepoPatch | null = livePatch
    ? {
        ...livePatch,
        worked: run.status === "running" || run.status === "usable" ? true : run.status === "failed" ? false : null,
        // Where a replayed patch came from is known to the worker, not the log.
        origin: repo.patch?.runId === run.id ? repo.patch.origin ?? null : null,
      }
    : repo.patch;
  if (tab === "code") return <CodeBrowser repo={repo} run={run} onSaved={onFileSaved} open={codeOpen} />;
  if (tab === "setup") {
    return <SetupPanel repo={repo} run={run} events={events} error={error} report={envReport} rows={trace.rows} watched={!run ? "no-run" : run.trace === "off" ? "untraced" : "traced"} section={setup.section} onSection={setup.onSection} logStep={setup.logStep} onLogStep={setup.onLogStep} onPrepare={onPrepare} onRelaunch={isSandboxLive(run) ? onRelaunch : null} />;
  }

  // The three companion tools over one session: what somebody was doing,
  // what caused what, and what the page looked like while it happened.
  // One responsibility each, all three reading the same scoped view of
  // the same run — none of them classifies, lays out or fetches anything
  // the others do not see. Annotations sits beside them and is not one of
  // them: notes are the repository's, not the run's.
  if (tab === "annotations") {
    return <AnnotationsPanel annotations={annotations} semantics={semantics.index} onOpen={onShowAnnotation} onAskBart={onAskAboutAnnotation} />;
  }
  if (tab === "activity") {
    return <ActivityPanel run={run} trace={scopedTrace} scope={scope} onOpenMoment={onOpenMoment} />;
  }
  if (tab === "trace") {
    return <BehaviorTrace repo={repo} run={run} trace={scopedTrace} selection={selection} detail={detail} onSelect={onSelect} onDetail={onDetail} onAskBart={onAskBart} scope={scope} recordings={recording} canvas={canvasMark} bart={traceBart} />;
  }
  if (tab === "replay") {
    return <ReplayPanel run={run} recordings={recording} clock={replayClock} />;
  }
  if (tab === "preview") {
    return <Preview repo={repo} run={run} error={error} events={events} version={previewVersion} patch={patch} controls={{ trace, selection, onSelect, onOpenTrace, onAskBart, recording, annotations, onAskAboutAnnotation, semantics, registerStop }} onPrepare={onPrepare} onPrepareFresh={onPrepareFresh} onLaunch={onLaunch} onStop={onStop} onOpenBuild={onOpenBuild} onOpenTerminal={onOpenTerminal} onOpenLogs={onOpenLogs} onRunWithoutPatch={onRunWithoutPatch} />;
  }

  if (tab === "readme") {
    return (
      <section aria-label="README" className="h-full overflow-y-auto">
        {readme === undefined ? (
          <p className="px-10 pt-6 text-[13px] text-muted-foreground">Loading README…</p>
        ) : (
          // The three strings the renderer needs to point a relative
          // image or link at the repository it was written in, passed
          // one by one so the memo still holds.
          <Markdown
            source={readme ?? `# \n\nNo README could be read from GitHub. It may be missing, or the repository may be private.`}
            owner={repo.owner}
            name={repo.name}
            branch={repo.defaultBranch}
          />
        )}
      </section>
    );
  }

  return null;
}

// The preview never launches again in place: that is the Environment
// tab's answer to a value saved while a run is up, and it belongs where
// the values are.
type PreviewProps = Omit<RunControls, "onRelaunch"> & { repo: Repo; run: SandboxRun | undefined; error: string | undefined; events: SandboxEvent[]; version: number; patch: RepoPatch | null; controls: TraceControls };

function Preview({ repo, run, error, events, version, patch, controls, onPrepare, onPrepareFresh, onLaunch, onStop, onOpenBuild, onOpenTerminal, onOpenLogs, onRunWithoutPatch }: PreviewProps) {
  const [showPatch, setShowPatch] = useState(false);
  // Restart, as asked for rather than as confirmed.
  //
  // It is two server round trips — killing the sandbox, which destroys a
  // machine and takes seconds, and then asking for a new run — and until
  // the second one landed this pane went on drawing the state it was
  // already in, so the press looked like it had missed. The first answer
  // to arrive is the kill, so it flickered through "Stopped" on the way
  // to starting, which is a state nobody asked to see.
  //
  // Not a second source of truth. Nothing reads it but the four values
  // below, and the first real answer of any kind — an active run, or a
  // failure — takes it away again.
  const [restarting, setRestarting] = useState(false);
  useEffect(() => {
    if (restarting && (error || (run && isRunActive(run)))) setRestarting(false);
  }, [restarting, error, run]);
  // Restart and Start over are the same two steps — throw the sandbox
  // away, then put the repository together again — differing only in
  // whether the saved command list is replayed or ignored. The sandbox
  // has to go first when there is one, because `prepare` declines
  // outright while a run of the repository is still active
  // (hooks/use-sandbox-run.ts), which is exactly the state somebody
  // restarting from a build that is stuck is in.
  //
  // Start over lives here rather than in the two panes that offer it, so
  // that the whole pane can answer at once. A button going quiet with a
  // running application still under it is not much of an answer, and the
  // first thing to come back is the kill, which would flash "Stopped" on
  // the way to starting. The running preview does come down immediately,
  // iframe and all — which is the point, since it is about to be
  // destroyed, and it is what makes the press feel like it landed.
  const startAgain = async (fresh: boolean) => {
    if (restarting) return;
    setRestarting(true);
    if (run && (isRunActive(run) || isSandboxLive(run))) await onStop(run.id);
    if (fresh) onPrepareFresh(); else onPrepare();
  };
  const restart = () => void startAgain(false);
  const startOver = () => void startAgain(true);
  if (showPatch && patch) {
    return <PatchView patch={patch} onBack={() => setShowPatch(false)} onRunWithoutPatch={run && isRunActive(run) ? null : () => { setShowPatch(false); onRunWithoutPatch(); }} />;
  }
  // Not while a restart has been asked for: the answer to that is the
  // pane below, and these two would go on drawing the run it is throwing
  // away.
  if (!restarting) {
  if (run && isRunUsable(run)) return <UsablePreview repo={repo} run={run} events={events} patch={patch} onShowPatch={() => setShowPatch(true)} onOpenTerminal={onOpenTerminal} onOpenLogs={onOpenLogs} onStartOver={startOver} />;
  if (run && isRunRunning(run)) return <RunningPreview repo={repo} run={run} events={events} version={version} controls={controls} onStop={onStop} onStartOver={startOver} />;
  }

  // What the build is doing, rather than what state it is in.
  //
  // The line under the title used to be `STATUS_LABEL[run.status]`, so a
  // repository coming up said "Starting kjfeng/cocoa-canvas…" and then,
  // underneath, "Starting the application…" — the same verb twice, and
  // nothing about the ten minutes between them. This is the same reading
  // of the log the Build tab does (`runSteps`), cut to the one step the
  // run is in: the step's name and the latest line it wrote. Not the
  // list — printing the whole timeline here is what this pane had before
  // and what the note below says was taken out on purpose.
  //
  // A run with nothing in its log yet has no active step, and falls back
  // to the status label, which is what is on the screen today.
  const step = run && isRunActive(run) ? runSteps(run, events, repo.fullName).find((s) => s.state === "active") : undefined;
  // A summary that already opens with its step's name is the whole line.
  // The sandbox step is called "Sandbox" and its summary opens "Sandbox
  // running", so prefixing the title gave "Sandbox · Sandbox running ·
  // cloning mqo00/rope…": the word said twice before anything is.
  const doing = step?.summary
    ? step.summary.startsWith(step.title) ? step.summary : `${step.title} · ${step.summary}`
    : run ? STATUS_LABEL[run.status] : "";

  // The headline, one sentence under it, and the thing to press. One
  // sentence: while the run is going that sentence is its current step,
  // so this line is the run, up to date; when it is over it is why. Where
  // to go next is a button, not a second paragraph saying the same.
  // Each state as data rather than as markup: the cube, the line saying
  // where you are, the sentence saying why the pane is empty, and the
  // thing to press. `PreviewState` draws all of them the same way, so
  // there is one layout here and not seven.
  //
  // Every state carries its own cube, from the approved sheet, matched
  // to the state the sheet drew it over: sparks while it comes up,
  // surprised where it did not, eyes closed where it was stopped, and
  // frowning where there is nothing to reach. A pane that is empty
  // because something went wrong is still a pane somebody is looking at,
  // and leaving those bare made the artwork something you only saw on
  // the two days a repository behaved.
  const started = { label: "Start", onClick: onPrepare, primary: true, icon: <Play className="size-3 fill-current" /> };
  // Restart is the way out of a run that is not going to come up, so on
  // every state that has stopped it is the one thing to do and carries
  // the weight: a filled button, with Open Build quiet beside it.
  //
  // Not while it is still coming up. There the same button would be a
  // black invitation to throw away a run that is working, so it keeps the
  // outline and that row has no filled button on it at all — which is
  // correct, because the thing to do while a build is building is wait.
  const again = { label: "Restart", onClick: restart, primary: true, icon: <RotateCw className="size-3" /> };
  const waiting = { ...again, primary: false };
  const [image, title, detail, action] = restarting
    ? [CUBES.starting, `Starting ${repo.fullName}…`, "Stopping the sandbox, then putting the repository together again…", waiting]
    : error
    ? [CUBES.failed, "Could not prepare " + repo.fullName, error, again]
    : !run
      ? [CUBES.idle, "Live preview", "Your running project will appear here.", started]
      : isRunActive(run)
        ? [CUBES.starting, run.status === "launching" ? `Starting ${repo.fullName}…` : `Preparing ${repo.fullName}…`, doing, waiting]
        : run.status === "no_service"
          ? [CUBES.unavailable, "Nothing to serve in " + repo.fullName, plainError(run.error) || "The pipeline found no web application of its own to run.", again]
        : run.status === "failed"
          ? [CUBES.crashed, "Could not run " + repo.fullName, plainError(run.error) || "The run failed. See Setup’s Logs for what the tools printed.", again]
          : isRunCloned(run)
            ? [CUBES.idle, "Live preview", "Your running project will appear here.", { label: "Start", onClick: () => onLaunch(run.id), primary: true, icon: <Play className="size-3 fill-current" /> }]
            : [CUBES.stopped, STATUS_LABEL[run.status], plainError(run.error) || "Prepare the repository again to start over.", again];

  const patchBox = run?.status === "failed" && patch && (
    <div className="flex max-w-[420px] flex-col items-start gap-2 rounded-md border bg-[#f6f6f6] px-4 py-3 text-xs text-muted-foreground">
      <span>The pipeline edited {patch.files.length} file{patch.files.length === 1 ? "" : "s"} in the sandbox copy to try to make it run, but it still did not start.</span>
      <Button variant="ghost" size="sm" onClick={() => setShowPatch(true)} className="h-7 px-2 font-normal">View the changes</Button>
    </div>
  );
  // A box naming the environment values the run came up without used to
  // stand here, with a way to the Environment tab. What it named is what
  // the Environment tab is a list of, and it carries the count on the tab
  // itself (components/setup-panel.tsx), so this was the same fact
  // announced on the tab that is trying to show an application.

  // No brief here. It stood under every state this pane draws, which is
  // a paragraph about what the repository is for placed under the news
  // that it would not run — an answer to a question nobody standing in
  // front of this pane is asking. It is still under the pane for a run
  // that came up and had nothing to serve, where what the repository is
  // for is exactly the next thing to know.

  // Nothing to preview.
  //
  // It used to print the whole step list here — where the run got to,
  // what each step found, how long each took — which is Setup · Build,
  // drawn a second time on the tab that is supposed to hold the running
  // application. Somebody who opens the Live preview is asking one
  // question. So: what state it is in, one sentence, and three things to
  // press. While it is building the sentence is the step it is on, which
  // with the cube above it is the whole of what this tab knows.
  return (
    <PreviewState
      image={image}
      title={title}
      description={detail}
      /* The same row whatever the run is doing, building included: a
         build that is stuck is exactly when somebody wants the way out
         of it.

         Two buttons, not three. "Ask Bart for help" was the third, and
         Bart is a tab of its own and a button in the corner of the
         Visualizer; a third way in, on the pane that is trying to show
         an application, made the row a menu. What is left is the thing
         to do and the place to see why. */
      actions={[action, run && { label: "Open Build", onClick: onOpenBuild }]}
    >
      {!run && <TrailInsight repo={repo} />}
      {patchBox && (
        <div className="mt-5 flex w-full max-w-[440px] flex-col items-start gap-3 text-left">
          {patchBox}
        </div>
      )}
    </PreviewState>
  );
}

// Nothing to serve, but installed and checked: what was set up, and what
// the person runs next, with the shell one tab over.
// Stopping is not offered here and is not taken: there is no running
// application to stop, and Start over throws the sandbox away itself.
function UsablePreview({ repo, run, events, patch, onShowPatch, onOpenTerminal, onOpenLogs, onStartOver }: { repo: Repo; run: SandboxRun; events: SandboxEvent[]; patch: RepoPatch | null; onShowPatch: () => void; onOpenTerminal: () => void; onOpenLogs: (step: StepId | null) => void; onStartOver: () => void }) {
  const usage = run.usage;
  const replayed = events.some((e) => e.data?.phase === "trail" && (e.data?.status === "own" || e.data?.status === "shared"));
  return (
    <section aria-label="Set up for use" className="flex h-full flex-col overflow-y-auto">
      <div className="flex shrink-0 items-start justify-between gap-4 px-[22px] pt-[18px] pb-3.5">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[13px] text-foreground">{usage?.blocker ? `Set up, but blocked by ${usage.blocker.kind === "secret" ? "a missing key" : usage.blocker.kind === "service" ? "a missing service" : usage.blocker.kind === "hardware" ? "hardware it needs" : usage.blocker.kind === "data" ? "data it needs" : "the code as published"}: ${repo.fullName}` : `Set up and ready to use: ${repo.fullName}`}</span>
          <span className="text-xs leading-normal text-muted-foreground/70">{usage?.blocker ? usage.blocker.what : usage?.summary || "No page to show; the repository is installed and its check passed. The shell is in Setup, under Terminal."}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {replayed && <Button variant="ghost" size="sm" onClick={onStartOver} title="Analyze and set up from scratch, ignoring the saved command list" className="font-normal text-muted-foreground">Start over</Button>}
          {patch && <Button variant="ghost" size="sm" onClick={onShowPatch} className="font-normal text-muted-foreground">View the edits</Button>}
          <Button variant="outline" size="sm" onClick={onOpenTerminal} className="font-normal">Open the shell</Button>
        </div>
      </div>
      <RunTimeline run={run} events={events} repoName={repo.fullName} open={false} onViewLogs={onOpenLogs} className="border-y" />
      <div className="px-[22px] pt-4"><BriefBox run={run} /></div>
      {usage?.next ? (
        <div className="px-[22px] py-4">
          <p className="mb-2 text-xs text-muted-foreground">What to run next, as the setup agent wrote it in <span className="font-mono">.engelbart/NEXT.md</span>:</p>
          <div className="rounded-md border bg-[#f6f6f6] px-4 py-3">
            <Markdown source={usage.next} />
          </div>
        </div>
      ) : null}
      {usage?.output ? (
        <details className="px-[22px] pb-4 text-xs text-muted-foreground">
          <summary className="cursor-pointer">Output of the check</summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-md border bg-[#f6f6f6] p-3 font-mono text-[11px] leading-snug whitespace-pre-wrap">{usage.output}</pre>
        </details>
      ) : null}
    </section>
  );
}

// What the run learned about the repository before planning, and how it
// got where it got: straight through, repaired, corrected by the resolver,
// or set up for use; with what its agent calls cost.
function BriefBox({ run }: { run: SandboxRun }) {
  const brief = run.brief;
  const esc = run.escalation;
  // Only when the run read the repository and wrote down what it is for.
  // It used to open on "How this run went" whenever there was an
  // escalation and no brief, which is a title standing in for a fact:
  // the line you fold open a box by has to be the thing the box says,
  // and a run that has nothing to say about itself does not get a box.
  // What the escalation did is in the steps, dated.
  if (!brief) return null;
  const required = (brief.requires ?? []).filter((r) => !r.optional);
  const path = esc?.path === "repaired" ? "after the repair agent edited the copy"
    : esc?.path === "resolved" ? `after the resolver ${esc.resolver?.status === "plan" ? "corrected the plan" : "confirmed the blocker"}`
    : esc?.path === "setup" ? "set up for use by the setup agent" : "";
  const cost = esc?.cost?.total ? `$${esc.cost.total.toFixed(2)} in agent calls` : "";
  return (
    <details className="max-w-[640px] rounded-md border bg-[#f6f6f6] px-4 py-3 text-xs text-muted-foreground">
      <summary className="cursor-pointer text-foreground">
        {brief.purpose.slice(0, 160)}
        {brief.primaryApp?.path ? <span className="text-muted-foreground"> · runs <span className="font-mono">{brief.primaryApp.path}</span> ({brief.primaryApp.confidence} confidence)</span> : null}
      </summary>
      <div className="mt-2 flex flex-col gap-1.5">
        {required.length > 0 && <span>Needs: {required.map((r) => `${r.name} (${r.kind}, ${r.neededFor})`).join("; ")}.</span>}
        {brief.traps?.length ? <span>Traps: {brief.traps.slice(0, 3).join(" · ")}</span> : null}
        {brief.examples?.length ? <span>Ready inputs: <span className="font-mono">{brief.examples.slice(0, 4).join(", ")}</span></span> : null}
        {esc?.resolver?.hint && <span>Resolver: {esc.resolver.hint}</span>}
        {esc?.blocker && <span>Blocker ({esc.blocker.kind}): {esc.blocker.what}</span>}
        {(path || cost) && <span className="text-muted-foreground/80">{[path, cost].filter(Boolean).join(" · ")}</span>}
        <span className="text-muted-foreground/80">The whole brief is in <span className="font-mono">.engelbart/BRIEF.md</span> in the sandbox.</span>
      </div>
    </details>
  );
}

// What preparing will do, before it is done: replay this project's saved
// command list, replay one from another project, or analyze from scratch.
//
// The row this reads is `repo.trail`: the name the database and the
// pipeline give it. On the screen it is the command list, which is what
// it holds — see lib/run-steps.ts.
function TrailInsight({ repo }: { repo: Repo }) {
  const [shared, setShared] = useState<SharedTrail | null | undefined>(undefined);
  useEffect(() => {
    if (repo.trail) return;
    let live = true;
    getSharedTrail(repo.id).then((r) => { if (live) setShared(r.ok ? r.trail : null); });
    return () => { live = false; };
  }, [repo.id, repo.trail]);

  const when = formatDay;
  const describe = (t: { at: string; commit: string | null; patchFiles: number }) =>
    [`from ${when(t.at)}`, t.commit ? `at ${t.commit.slice(0, 7)}` : "", t.patchFiles ? `${t.patchFiles} patched file${t.patchFiles === 1 ? "" : "s"}` : "no edits needed"].filter(Boolean).join(", ");

  let text: string | null = null;
  if (repo.trail) text = `Known how to run: ${repo.trail.shared ? "a command list first captured in another project" : "this project's command list"} ${describe(repo.trail)}. Preparing replays it, usually within a few minutes.`;
  else if (shared) text = `Known from another project: a command list ${describe(shared)}. Preparing replays it, usually within a few minutes.`;
  else if (shared === null) text = "Not run anywhere yet. Preparing analyzes the repository from scratch; one with a database or missing values can take ten minutes.";
  if (!text) return null;
  return <p className="mt-4 max-w-[420px] rounded-md border bg-[#f6f6f6] px-4 py-3 text-xs leading-relaxed text-muted-foreground">{text}</p>;
}

// The app in an iframe. A save in the Code tab, or the Reload button,
// reloads it and the header says so until the new page has loaded. Dev
// servers push changes themselves; a plain file server never does, and the
// reload covers both. A run with several services (a frontend and its API,
// say) gets a picker; a service that forbids framing opens in a tab instead.
// The steps that brought it up stay one click away above the page.
// No patch here. A chip reading "Patched · 5 files" sat at the head of
// the row, over the running application, saying that the pipeline had
// edited the sandbox copy to make it run — which is true of the run, not
// of the page under it, and the row is the controls over the page. The
// edits are still read from the two panes that are about the run: the one
// for a repository that came up with nothing to serve, and the one for a
// run that failed.
function RunningPreview({ repo, run, events, version, controls, onStop, onStartOver }: { repo: Repo; run: SandboxRun; events: SandboxEvent[]; version: number; controls: TraceControls; onStop: (runId: string) => void | Promise<void>; onStartOver: () => void }) {
  const rec = controls.recording.recordings;
  const services = useMemo<PreviewService[]>(
    () => (run.services?.length ? run.services : [{ id: "app", port: run.port ?? 0, previewUrl: run.previewUrl!, isEntry: true, embeddable: true }]),
    [run.services, run.port, run.previewUrl],
  );
  const [serviceId, setServiceId] = useState(services[0].id);
  const service = services.find((s) => s.id === serviceId) ?? services[0];
  const [reloads, setReloads] = useState(0);
  const [loading, setLoading] = useState<"first" | "update" | null>("first");
  // Mounting already loads the page; only saves after that trigger a reload.
  const seen = useRef(version);
  useEffect(() => {
    if (version === seen.current) return;
    seen.current = version;
    setReloads((n) => n + 1);
    setLoading("update");
  }, [version]);
  const reload = () => { setReloads((n) => n + 1); setLoading("update"); };
  const pick = (id: string) => { if (id !== service.id) { setServiceId(id); setLoading("first"); } };
  // Annotate mode talks to the document in this frame. The ref is the
  // only new thing on the iframe: it must keep its key and its place in
  // the tree, or React remounts it and the running application reloads.
  const frame = useRef<HTMLIFrameElement>(null);
  const traced = run.trace !== "off";
  const notes = controls.annotations;
  const [openNote, setOpenNote] = useState<string | null>(null);
  const marks = useMemo(() => notes.list.map((a) => ({ id: a.id, anchor: a.anchor })), [notes.list]);
  const picker = usePicker(frame, service.embeddable ? service.previewUrl : null, traced && service.embeddable, marks, setOpenNote);
  // What this document holds, asked for in the background as soon as the
  // page is up. It turns nothing on and records nothing: the answer goes
  // to the workspace, which reads an interface it has not read before and
  // otherwise uses what it already knows.
  //
  // Asked again when the run gains a document or goes somewhere new. A
  // preview is not one interface: the frame holding an artifact's output
  // often attaches only when somebody opens the tab it is on, minutes
  // after the page settled, and a screen that replaces another is a
  // different interface at the same frame. Asking only at load would
  // leave both unread. The workspace reads each interface once, so an
  // extra question about one it already knows costs nothing.
  const documents = useMemo(
    () => controls.trace.events.filter((e) => e.kind === "frame.attached" || e.kind === "ui.route").length,
    [controls.trace.events],
  );
  useSurvey(frame, service.embeddable ? service.previewUrl : null, traced && service.embeddable && controls.semantics.enabled, reloads + controls.semantics.round + documents, controls.semantics.offer);
  // What the page looked like, while a recording is open. It follows the
  // recording rather than having a life of its own: Record starts it, Stop
  // takes what it has. A preview that cannot be framed has nothing to
  // record, and a recording without one is a recording as before.
  const capture = useCapture(frame, service.embeddable ? service.previewUrl : null, traced && service.embeddable && !!rec.active, reloads);
  const [saving, setSaving] = useState(false);
  // Stop: take the stream, put it in the bucket, then complete the
  // recording with the path. The object exists before the row points at
  // it, which is the order the papers path takes — a recording that says
  // it has a replay always has one. A failed upload is not a failed
  // recording: the boundaries are what a recording is, and they are saved
  // either way.
  const stopRecording = async () => {
    if (saving) return;
    const open = rec.active;
    setSaving(true);
    try {
      const taken = await capture.finish();
      let path: string | null = null;
      if (open && taken) {
        const body: StoredReplay = { v: 1, startedAt: taken.startedAt, offset: clockOffset(controls.trace.events), truncated: taken.truncated, dropped: taken.dropped, events: taken.events, canvas: taken.canvas };
        const at = replayStoragePath(open.projectId, open.id);
        const { error } = await createClient().storage.from(REPLAYS_BUCKET)
          .upload(at, new Blob([JSON.stringify(body)], { type: "application/json" }), { contentType: "application/json", upsert: true });
        if (!error) path = at;
      }
      await rec.stop(path);
    } finally {
      setSaving(false);
    }
  };
  // Every Stop in the workspace is this one. Kept current rather than
  // registered once, so it closes over the recording that is actually open.
  const register = controls.registerStop;
  useEffect(() => {
    register.current = stopRecording;
    return () => { if (register.current === stopRecording) register.current = null; };
  });
  const note = notes.list.find((a) => a.id === openNote) ?? null;
  // A note chosen somewhere else — the list, a reference in an answer —
  // is shown where it lives: the markers go up, the page is scrolled to
  // it, and the note opens. If the page cannot find its element the note
  // opens anyway, saying so, rather than the click doing nothing.
  const focus = notes.focus;
  useEffect(() => {
    if (!focus) return;
    picker.start();
    setOpenNote(focus.id);
    const t = setTimeout(() => picker.flash(focus.id), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.key, focus?.id]);
  const save = async (body: string) => {
    if (!picker.picked) return;
    const made = await notes.add({ body, anchor: picker.picked.anchor, recordingId: rec.active?.id ?? null, stageId: controls.selection?.kind === "stage" ? controls.selection.stageId : null, callId: controls.selection?.kind === "call" ? controls.selection.callId : null });
    if (made) picker.dismiss();
  };
  // The preview is the running application and nothing else. A recording
  // being watched back used to take this place over, which meant the
  // artifact and the record of it could never be seen at once and the
  // middle had a second mode nothing in the tab bar admitted to. Replay
  // is a tool of its own now (components/trace/replay-panel.tsx), so this
  // is always live.
  return (
    <section aria-label="Live preview" className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3.5 font-mono text-xs text-muted-foreground">
        {services.length > 1 && (
          <div role="tablist" aria-label="Service" className="flex shrink-0 items-center gap-0.5 font-sans">
            {services.map((s) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={s.id === service.id}
                title={`${s.id} on port ${s.port}`}
                onClick={() => pick(s.id)}
                className={cn("rounded px-1.5 py-0.5 transition-colors hover:text-foreground", s.id === service.id ? "bg-neutral-100 text-foreground" : "text-muted-foreground")}
              >
                {s.id}
              </button>
            ))}
          </div>
        )}
        <a href={service.previewUrl} target="_blank" rel="noreferrer" className="truncate hover:text-foreground" title="Open in a new tab">{service.previewUrl}</a>
        <span role="status" className="ml-auto shrink-0 font-sans">{!service.embeddable ? "" : loading === "update" ? "Updating…" : loading === "first" ? "Loading…" : ""}</span>
        {/* Five controls, in the order they are reached for: the one
            that redraws the page, then the two that make a record of what
            you are about to do, then the two that end the run — mildest
            first, so Stop is at the end of the row and nothing sits
            between it and the edge. Reload leads because it is the one
            you press without deciding anything: it changes nothing and
            starts nothing, where the four after it all begin something.

            Two are gone. A Notes button opened a popover listing the
            notes written on this page, which is a second way to the
            thing the page is already showing; and a Visualizer button
            brought a tab forward that is one click away in the panel
            beside it. Neither did anything the surface it pointed at
            does not do. */}
        <Button variant="ghost" size="icon" aria-label="Reload preview" title="Reload preview" disabled={!service.embeddable} onClick={reload} className="size-6 text-muted-foreground">
          <RotateCw className={cn("size-3", loading && service.embeddable && "animate-spin")} />
        </Button>
        {/* Reading an earlier run: there is nothing to record. The
            preview is always the live run, and a recording is a window
            over the trace of the run being read. */}
        {traced && <RecordButton active={rec.active} busy={rec.busy || saving} past={controls.recording.past} onStart={() => void rec.start()} onStop={() => void stopRecording()} />}
        {traced && service.embeddable && <AnnotateControl active={picker.active} onStart={picker.start} onStop={picker.stop} />}
        {events.some((e) => e.data?.phase === "trail" && (e.data?.status === "own" || e.data?.status === "shared")) && (
          <Button variant="ghost" size="sm" onClick={onStartOver} title="Stop, then analyze from scratch ignoring the saved command list" className="h-6 px-2 font-sans font-normal text-muted-foreground">Start over</Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => onStop(run.id)} className="h-6 px-2 font-sans font-normal text-muted-foreground">Stop</Button>
      </div>
      {rec.lastStopped && <RecordingSaved recording={rec.lastStopped} stats={controls.recording.stats(rec.lastStopped)} onOpen={() => { controls.recording.onOpen(rec.lastStopped!.id); rec.dismissStopped(); }} onDismiss={rec.dismissStopped} />}
      {rec.error && <p role="alert" className="shrink-0 border-b px-3 py-1.5 text-xs text-destructive">{rec.error}</p>}
      {notes.error && <p role="alert" className="shrink-0 border-b px-3 py-1.5 text-xs text-destructive">{notes.error}</p>}
      {/* Whether anything is actually being recorded.
          The button's red dot comes from the recording row, which exists
          the moment Start is pressed and says nothing about the page. The
          page's own answer — it started, or it cannot, and why — was
          computed by useCapture and never drawn, so a recording that
          never began looked exactly like one that was working, for as
          long as you cared to watch it. A recording still marks its slice
          of the trace either way, which is why none of these is an error. */}
      {rec.active && !service.embeddable && (
        <p role="status" className="shrink-0 border-b px-3 py-1.5 text-xs text-muted-foreground">
          {service.id} cannot be shown in a frame, so there is nothing to record from: this will mark its slice of the trace, with no replay to watch.
        </p>
      )}
      {rec.active && service.embeddable && capture.unavailable && (
        <p role="status" className="shrink-0 border-b px-3 py-1.5 text-xs text-muted-foreground">
          This preview is not being recorded: {capture.unavailable}. The recording will mark its slice of the trace, with no replay to watch.
        </p>
      )}
      {rec.active && service.embeddable && !capture.unavailable && !capture.capturing && capture.silent && (
        <p role="status" className="shrink-0 border-b px-3 py-1.5 text-xs text-muted-foreground">
          This preview has not answered the request to record, so nothing is being captured yet. Its sandbox may be running an image with no recorder in it — rebuild the runner template and start the run again.
        </p>
      )}
      {/* A document with no bridge in it, and frames inside it that could
          not be reached, are said plainly rather than left to look like a
          picker that does nothing. */}
      {picker.active && picker.silent && !picker.answered && (
        <p role="status" className="shrink-0 border-b px-3 py-1.5 text-xs text-muted-foreground">
          {picker.why ? sayWhy(picker.why) : "This preview did not answer; asking its gateway why…"}
        </p>
      )}
      {picker.active && picker.unavailable.length > 0 && (
        <p role="status" className="shrink-0 border-b px-3 py-1.5 text-xs text-muted-foreground">
          {picker.unavailable.length} embedded frame{picker.unavailable.length === 1 ? "" : "s"} cannot be annotated ({picker.unavailable.map((f) => `${f.selectorInParent ?? f.name ?? "frame"}: ${f.reason}`).join(", ")}). The frame itself can be, from the page around it.
        </p>
      )}
      {/* No build strip here. It stood between the toolbar and the
          application — the run's state, its URL and how long it had been
          up — and all three are either in the row above it or in Build,
          which is a tab. The preview is the running application and the
          controls over it, and nothing else. */}
      {service.embeddable ? (
        <iframe ref={frame} key={`${service.id}:${reloads}`} src={service.previewUrl} title={`${repo.fullName} ${service.id} preview`} onLoad={() => { setLoading(null); capture.rearm(); }} className="min-h-0 w-full flex-1 bg-white" />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-6 text-center">
          <span className="text-[13px] text-muted-foreground">{service.id} does not allow being shown in a frame.</span>
          <Button asChild variant="outline" size="sm" className="mt-3 font-normal">
            <a href={service.previewUrl} target="_blank" rel="noreferrer">Open in a new tab</a>
          </Button>
        </div>
      )}
      {picker.picked && <AnnotationComposer frame={frame} picked={picker.picked} busy={notes.busy} error={notes.error} onSave={(body) => void save(body)} onCancel={picker.dismiss} />}
      {note && !picker.picked && (
        <AnnotationNote
          frame={frame} note={note} resolution={picker.resolutions[note.id] ?? null} viewerId={notes.viewerId} semantics={controls.semantics.index}
          onEdit={(body) => void notes.edit(note.id, body)}
          onDelete={() => { setOpenNote(null); void notes.remove(note.id); }}
          onAskBart={() => controls.onAskAboutAnnotation(note.id)}
          onClose={() => setOpenNote(null)}
        />
      )}
      {/* And no trace strip under it. It named the last moment of the
          run and offered the Visualizer, which is the tab beside this
          one; on a run with nothing in it yet it said so, which is a row
          of the window spent on an absence. The trace is the Visualizer. */}
    </section>
  );
}
