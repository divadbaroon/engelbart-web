"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Repo } from "@/lib/repos";
import type { Goal } from "@/lib/plan";
import { RunLog } from "@/components/run-log";
import { RunTimeline } from "@/components/run-timeline";
import { formatDay } from "@/lib/run-steps";
import { getSharedTrail, type SharedTrail } from "@/app/workspace/[workspaceId]/trail-actions";
import { Input } from "@/components/ui/input";
import { environmentFromEvents, isRunActive, isRunCloned, isRunRunning, isRunUsable, isSandboxLive, STATUS_LABEL, terminalLines, type PreviewService, type SandboxEvent, type SandboxRun } from "@/lib/sandbox";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Markdown } from "@/components/markdown";
import { CodeBrowser, type CodeOpen } from "@/components/code-browser";
import { NotesPad } from "@/components/notes-pad";
import { EnvPanel } from "@/components/env-panel";
import { PatchView } from "@/components/patch-view";
import { patchFromEvents, type RepoPatch } from "@/lib/patch";
import { BehaviorTrace, type CanvasMark, type TraceRecordings } from "@/components/trace/behavior-trace";
import { RecordButton, RecordingSaved } from "@/components/trace/record-control";
import { AnnotateControl } from "@/components/annotate/control";
import { AnnotationComposer } from "@/components/annotate/composer";
import { AnnotationNote } from "@/components/annotate/note";
import { usePicker } from "@/hooks/use-picker";
import { useSurvey } from "@/hooks/use-survey";
import type { Semantics } from "@/hooks/use-semantics";
import { sayWhy } from "@/lib/annotations/probe";
import type { Annotations } from "@/hooks/use-annotations";
import { LiveStrip } from "@/components/trace/live-strip";
import type { TraceView } from "@/hooks/use-trace-view";
import { selectedStage, type Selection } from "@/lib/trace/selection";
import type { Stage } from "@/lib/trace/timeline";

// xterm touches the DOM as soon as it loads.
const SandboxShell = dynamic(() => import("@/components/sandbox-shell"), { ssr: false });

import { RepoTabs, TAB_LIST, TAB_TRIGGER, type RepoTab } from "@/components/repo-tabs";
export { RepoTabs, TAB_LIST, TAB_TRIGGER, type RepoTab };

// `readme` is undefined while it loads, null when the repo has none GitHub can serve.
type RunControls = {
  onPrepare: () => void;                 // clone into a fresh sandbox and start
  onPrepareFresh: () => void;            // the same, ignoring any saved trail
  onLaunch: (runId: string) => void;     // start the app in an existing cloned sandbox
  onStop: (runId: string) => void | Promise<void>;   // kill the sandbox
  onOpenEnvironment: () => void;         // switch to the Environment tab
  onOpenTerminal: () => void;            // switch to the Terminal tab, where the shell is
  onRunWithoutPatch: () => void;         // drop the repair agent's edits and prepare again
  onSaveHint: (hint: string) => Promise<void>;   // keep the person's line about what to run
};

type RepoContentProps = RunControls & {
  repo: Repo;
  tab: RepoTab;
  run: SandboxRun | undefined;
  events: SandboxEvent[];
  error: string | undefined;
  readme: string | null | undefined;
  // Notes belong to the goal selected in Plan, the same as on the project tabs.
  notesGoal: Goal | null;
  onNotesSaved: (goalId: string, notes: string, updatedAt: string) => void;
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
  onOpenTrace: () => void;               // switch to the Trace tab
  onOpenPreview: () => void;             // and back to the Live preview
  codeOpen: CodeOpen | null;             // a file a Bart answer pointed at
  slot: "middle" | "side";               // where this content is shown
  traceAside: boolean;                   // the trace is on the side: no "Open trace", no way back
  scopedTrace: TraceView;                // what the Trace tab shows: the run, or the open recording's slice of it
  recording: TraceRecordings;            // the run's recordings, the Record button's state, where the Trace tab is
  canvasMark: CanvasMark;                // where the Trace tab's canvas starts from, when a clean one was asked for
  annotations: Annotations;              // the notes written on this repository's interface
  onAskAboutAnnotation: (id: string) => void;   // ask Bart about one of them
  semantics: Semantics;                         // what the parts of this application's interfaces are for
  traceBart: ReactNode;                  // Bart's small window, floating over the trace canvas
};

// The trace's selection callbacks, shared by the preview's strip and the Trace tab.
export type TraceControls = { trace: TraceView; selection: Selection | null; onSelect: RepoContentProps["onSelect"]; onOpenTrace: () => void; traceAside: boolean; recording: TraceRecordings; annotations: Annotations; onAskAboutAnnotation: (id: string) => void; semantics: Semantics };

export function RepoContent({ repo, tab, run, events, error, readme, notesGoal, onNotesSaved, previewVersion, onFileSaved, trace, selection, detail, onSelect, onDetail, onAskBart, onOpenTrace, onOpenPreview, codeOpen, slot, traceAside, scopedTrace, recording, canvasMark, annotations, onAskAboutAnnotation, semantics, traceBart, onPrepare, onPrepareFresh, onLaunch, onStop, onOpenEnvironment, onOpenTerminal, onRunWithoutPatch, onSaveHint }: RepoContentProps) {
  // The environment scan and any repair edits from this run's log if it
  // has them, else the last ones saved on the repository.
  const envReport = (run && environmentFromEvents(events, run.id)) ?? repo.envReport;
  const lines = useMemo(() => terminalLines(events), [events]);
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
  if (tab === "notes") return <NotesPad goal={notesGoal} onSaved={onNotesSaved} />;
  if (tab === "env") return <EnvPanel repo={repo} run={run} report={envReport} onPrepare={onPrepare} />;

  // The Live preview and the Trace tab are one branch on purpose. Both
  // return the same shape -- the preview first, the canvas second -- so
  // React keeps the iframe's subtree across the switch and the running
  // application is never reloaded; only the wrapper's class changes.
  // On the side the trace stands alone: the preview is in the middle.
  if (tab === "preview" || tab === "trace") {
    const canvas = tab === "trace" ? <BehaviorTrace repo={repo} run={run} runTrace={trace} trace={scopedTrace} selection={selection} detail={detail} onSelect={onSelect} onDetail={onDetail} onAskBart={onAskBart} slot={slot} onBack={slot === "middle" ? onOpenPreview : null} recordings={recording} notes={{ annotations, onOpen: (id) => { annotations.focusOn(id); onOpenPreview(); }, onAskBart: onAskAboutAnnotation }} semantics={semantics} canvas={canvasMark} bart={traceBart} /> : null;
    if (tab === "trace" && slot === "side") return canvas;
    return (
      <>
        <div className={tab === "trace" ? "hidden h-full" : "h-full"}>
          <Preview repo={repo} run={run} error={error} events={events} version={previewVersion} missing={envReport?.missing ?? []} localError={envReport?.localError ?? null} patch={patch} controls={{ trace, selection, onSelect, onOpenTrace, traceAside, recording, annotations, onAskAboutAnnotation, semantics }} onPrepare={onPrepare} onPrepareFresh={onPrepareFresh} onLaunch={onLaunch} onStop={onStop} onOpenEnvironment={onOpenEnvironment} onOpenTerminal={onOpenTerminal} onRunWithoutPatch={onRunWithoutPatch} onSaveHint={onSaveHint} />
        </div>
        {canvas}
      </>
    );
  }

  if (tab === "readme") {
    return (
      <section aria-label="README" className="h-full overflow-y-auto">
        {readme === undefined ? (
          <p className="p-8 text-[13px] text-muted-foreground">Loading README…</p>
        ) : (
          <Markdown source={readme ?? `# \n\nNo README could be read from GitHub. It may be missing, or the repository may be private.`} />
        )}
      </section>
    );
  }

  // The run's log, and a shell in its sandbox once there is one to open.
  const log = <RunLog lines={lines} error={error} empty={error ?? (run ? STATUS_LABEL[run.status] : "Open the repository to prepare it in a sandbox.")} />;
  const body = !run || !isSandboxLive(run) ? log : (
    <ResizablePanelGroup orientation="vertical" id={`terminal-${repo.id}`} className="h-full">
      <ResizablePanel defaultSize="55" minSize="15">{log}</ResizablePanel>
      <ResizableHandle className="h-px bg-border" />
      <ResizablePanel defaultSize="45" minSize="15">
        <SandboxShell runId={run.id} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
  if (!run) return body;
  return (
    <div className="flex h-full flex-col">
      <RunTimeline run={run} events={events} open={false} className="shrink-0 border-b" />
      <div className="min-h-0 flex-1">{body}</div>
    </div>
  );
}

type PreviewProps = RunControls & { repo: Repo; run: SandboxRun | undefined; error: string | undefined; events: SandboxEvent[]; version: number; missing: string[]; localError: string | null; patch: RepoPatch | null; controls: TraceControls };

function Preview({ repo, run, error, events, version, missing, localError, patch, controls, onPrepare, onPrepareFresh, onLaunch, onStop, onOpenEnvironment, onOpenTerminal, onRunWithoutPatch, onSaveHint }: PreviewProps) {
  const [showPatch, setShowPatch] = useState(false);
  if (showPatch && patch) {
    return <PatchView patch={patch} onBack={() => setShowPatch(false)} onRunWithoutPatch={run && isRunActive(run) ? null : () => { setShowPatch(false); onRunWithoutPatch(); }} />;
  }
  if (run && isRunUsable(run)) return <UsablePreview repo={repo} run={run} events={events} patch={patch} onShowPatch={() => setShowPatch(true)} onOpenTerminal={onOpenTerminal} onStop={onStop} onStartOver={onPrepareFresh} />;
  if (run && isRunRunning(run)) return <RunningPreview repo={repo} run={run} events={events} version={version} patch={patch} controls={controls} onShowPatch={() => setShowPatch(true)} onStop={onStop} onStartOver={onPrepareFresh} />;
  // A run that is over but was traced still has its trace to open.
  const traced = run && run.trace !== "off" && controls.trace.stages.length > 0 && !controls.traceAside;

  const [title, detail, action] = error
    ? ["Could not prepare " + repo.fullName, error, { label: "Try again", onClick: onPrepare }]
    : !run
      ? ["Not prepared yet", "Open the repository to clone it into a sandbox and start it.", { label: "Prepare", onClick: onPrepare }]
      : isRunActive(run)
        ? [run.status === "launching" ? `Starting ${repo.fullName}…` : `Preparing ${repo.fullName}…`, STATUS_LABEL[run.status] + " You can keep reading the README meanwhile.", null]
        : run.status === "no_service"
          ? ["Nothing to serve in " + repo.fullName, run.error ?? "The pipeline found no web application of its own to run.", { label: "Analyze again", onClick: onPrepare }]
        : run.status === "failed"
          ? ["Could not run " + repo.fullName, run.error ?? "The run failed. See the Terminal for details.", { label: "Try again", onClick: onPrepare }]
          : isRunCloned(run)
            ? ["Cloned into a sandbox", "The repository is on disk but the application was never started. Start it to get a preview.", { label: "Run application", onClick: () => onLaunch(run.id) }]
            : [STATUS_LABEL[run.status], run.error ?? "Prepare the repository again to start over.", { label: "Prepare again", onClick: onPrepare }];

  const patchBox = run?.status === "failed" && patch && (
    <div className="flex max-w-[420px] flex-col items-start gap-2 rounded-md border bg-[#f6f6f6] px-4 py-3 text-xs text-muted-foreground">
      <span>The pipeline edited {patch.files.length} file{patch.files.length === 1 ? "" : "s"} in the sandbox copy to try to make it run, but it still did not start.</span>
      <Button variant="ghost" size="sm" onClick={() => setShowPatch(true)} className="h-7 px-2 font-normal">View the changes</Button>
    </div>
  );
  const missingBox = run?.status === "failed" && missing.length > 0 && (
    <div className="flex max-w-[420px] flex-col items-start gap-2 rounded-md border bg-[#f6f6f6] px-4 py-3 text-xs text-muted-foreground">
      <span>
        The application started without {missing.length === 1 ? "a value it reads" : `${missing.length} values it reads`}:{" "}
        <span className="font-mono text-foreground">{missing.join(", ")}</span>.
      </span>
      {localError && <span className="text-muted-foreground/80">A local Supabase was tried instead, but: {localError}</span>}
      <Button variant="ghost" size="sm" onClick={onOpenEnvironment} className="h-7 px-2 font-normal">Add the values</Button>
    </div>
  );

  // A run that replayed a saved trail can be redone without it: the trail
  // may be what is wrong, and a fresh analysis that comes up replaces it.
  const replayed = events.some((e) => e.data?.phase === "trail" && (e.data?.status === "own" || e.data?.status === "shared"));
  const startOver = replayed && !isRunActive(run) && (
    <Button variant="ghost" size="sm" onClick={onPrepareFresh} title="Analyze from scratch, ignoring the saved trail" className="shrink-0 font-normal text-muted-foreground">Start over without the trail</Button>
  );

  // A line for the planner, for repositories with several applications and
  // no declared entry point. Kept on the repository; used on the next run.
  const hintField = !(run && isRunActive(run)) && <HintField key={repo.id} hint={repo.hint} onSave={onSaveHint} />;
  const briefBox = run && <BriefBox run={run} />;

  // With a run to show, the steps take the page: where it is, what each
  // step found, and what to do next at the top.
  if (run) {
    return (
      <section aria-label="Live preview" className="flex h-full flex-col overflow-y-auto">
        <div className="flex shrink-0 items-start justify-between gap-4 px-[22px] pt-[18px] pb-3.5">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-[13px] text-foreground">{title}</span>
            <span className="text-xs leading-normal text-muted-foreground/70">{detail}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {startOver}
            {traced && <Button variant="ghost" size="sm" onClick={controls.onOpenTrace} className="shrink-0 font-normal text-muted-foreground">Open trace</Button>}
            {action && <Button variant="outline" size="sm" onClick={action.onClick} className="shrink-0 font-normal">{action.label}</Button>}
          </div>
        </div>
        <RunTimeline run={run} events={events} open className="border-y" />
        {(patchBox || missingBox || hintField || briefBox) && (
          <div className="flex flex-col gap-3 px-[22px] py-4">
            {briefBox}
            {patchBox}
            {missingBox}
            {hintField}
          </div>
        )}
      </section>
    );
  }

  return (
    <section aria-label="Live preview" className="flex h-full flex-col items-center justify-center gap-1.5 p-6 text-center">
      <span className="text-[13px] text-muted-foreground">{title}</span>
      <span className="max-w-[360px] text-xs leading-normal text-muted-foreground/70">{detail}</span>
      {action && (
        <Button variant="outline" size="sm" onClick={action.onClick} className="mt-3 font-normal">{action.label}</Button>
      )}
      <TrailInsight repo={repo} />
      <div className="mt-4 w-full max-w-[420px] text-left">{hintField}</div>
    </section>
  );
}

// Nothing to serve, but installed and checked: what was set up, and what
// the person runs next, with the shell one tab over.
function UsablePreview({ repo, run, events, patch, onShowPatch, onOpenTerminal, onStop, onStartOver }: { repo: Repo; run: SandboxRun; events: SandboxEvent[]; patch: RepoPatch | null; onShowPatch: () => void; onOpenTerminal: () => void; onStop: (runId: string) => void | Promise<void>; onStartOver: () => void }) {
  const usage = run.usage;
  const replayed = events.some((e) => e.data?.phase === "trail" && (e.data?.status === "own" || e.data?.status === "shared"));
  return (
    <section aria-label="Set up for use" className="flex h-full flex-col overflow-y-auto">
      <div className="flex shrink-0 items-start justify-between gap-4 px-[22px] pt-[18px] pb-3.5">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[13px] text-foreground">{usage?.blocker ? `Set up, but blocked by ${usage.blocker.kind === "secret" ? "a missing key" : usage.blocker.kind === "service" ? "a missing service" : usage.blocker.kind === "hardware" ? "hardware it needs" : usage.blocker.kind === "data" ? "data it needs" : "the code as published"}: ${repo.fullName}` : `Set up and ready to use: ${repo.fullName}`}</span>
          <span className="text-xs leading-normal text-muted-foreground/70">{usage?.blocker ? usage.blocker.what : usage?.summary || "No page to show; the repository is installed and its check passed. The shell is in the Terminal tab."}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {replayed && <Button variant="ghost" size="sm" onClick={async () => { await onStop(run.id); onStartOver(); }} title="Analyze and set up from scratch, ignoring the saved trail" className="font-normal text-muted-foreground">Start over</Button>}
          {patch && <Button variant="ghost" size="sm" onClick={onShowPatch} className="font-normal text-muted-foreground">View the edits</Button>}
          <Button variant="outline" size="sm" onClick={onOpenTerminal} className="font-normal">Open the shell</Button>
        </div>
      </div>
      <RunTimeline run={run} events={events} open={false} className="border-y" />
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
  if (!brief && !esc) return null;
  const required = (brief?.requires ?? []).filter((r) => !r.optional);
  const path = esc?.path === "repaired" ? "after the repair agent edited the copy"
    : esc?.path === "resolved" ? `after the resolver ${esc.resolver?.status === "plan" ? "corrected the plan" : "confirmed the blocker"}`
    : esc?.path === "setup" ? "set up for use by the setup agent" : "";
  const cost = esc?.cost?.total ? `$${esc.cost.total.toFixed(2)} in agent calls` : "";
  return (
    <details className="max-w-[640px] rounded-md border bg-[#f6f6f6] px-4 py-3 text-xs text-muted-foreground">
      <summary className="cursor-pointer text-foreground">
        {brief ? brief.purpose.slice(0, 160) : "How this run went"}
        {brief?.primaryApp?.path ? <span className="text-muted-foreground"> · runs <span className="font-mono">{brief.primaryApp.path}</span> ({brief.primaryApp.confidence} confidence)</span> : null}
      </summary>
      <div className="mt-2 flex flex-col gap-1.5">
        {required.length > 0 && <span>Needs: {required.map((r) => `${r.name} (${r.kind}, ${r.neededFor})`).join("; ")}.</span>}
        {brief?.traps?.length ? <span>Traps: {brief.traps.slice(0, 3).join(" · ")}</span> : null}
        {brief?.examples?.length ? <span>Ready inputs: <span className="font-mono">{brief.examples.slice(0, 4).join(", ")}</span></span> : null}
        {esc?.resolver?.hint && <span>Resolver: {esc.resolver.hint}</span>}
        {esc?.blocker && <span>Blocker ({esc.blocker.kind}): {esc.blocker.what}</span>}
        {(path || cost) && <span className="text-muted-foreground/80">{[path, cost].filter(Boolean).join(" · ")}</span>}
        {brief && <span className="text-muted-foreground/80">The whole brief is in <span className="font-mono">.engelbart/BRIEF.md</span> in the sandbox.</span>}
      </div>
    </details>
  );
}

// One line from the person about what to run, such as "serve autogen-studio"
// for a repository with several applications. Enter saves; empty removes.
function HintField({ hint, onSave }: { hint: string | null; onSave: (hint: string) => Promise<void> }) {
  const [draft, setDraft] = useState(hint ?? "");
  const [saving, setSaving] = useState(false);
  const dirty = draft.trim() !== (hint ?? "");
  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try { await onSave(draft); } finally { setSaving(false); }
  };
  return (
    <div className="flex max-w-[420px] flex-col gap-2 rounded-md border bg-[#f6f6f6] px-4 py-3 text-xs text-muted-foreground">
      <span>{hint ? "Hint for the planner, used on the next run:" : "Several applications and no clear entry point? Tell the planner what to run."}</span>
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void save(); } }}
          placeholder="e.g. serve the autogen-studio app in python/packages/autogen-studio"
          maxLength={500}
          className="h-7 bg-background text-xs"
        />
        <Button variant="ghost" size="sm" onClick={() => void save()} disabled={!dirty || saving} className="h-7 shrink-0 px-2 font-normal">{saving ? "Saving…" : "Save"}</Button>
      </div>
    </div>
  );
}

// What preparing will do, before it is done: replay this project's trail,
// replay one from another project, or analyze from scratch.
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
  if (repo.trail) text = `Known how to run: ${repo.trail.shared ? "a trail first captured in another project" : "this project's trail"} ${describe(repo.trail)}. Preparing replays it, usually within a few minutes.`;
  else if (shared) text = `Known from another project: a trail ${describe(shared)}. Preparing replays it, usually within a few minutes.`;
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
function RunningPreview({ repo, run, events, version, patch, controls, onShowPatch, onStop, onStartOver }: { repo: Repo; run: SandboxRun; events: SandboxEvent[]; version: number; patch: RepoPatch | null; controls: TraceControls; onShowPatch: () => void; onStop: (runId: string) => void | Promise<void>; onStartOver: () => void }) {
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
  useSurvey(frame, service.embeddable ? service.previewUrl : null, traced && service.embeddable && controls.semantics.enabled, reloads + controls.semantics.round, controls.semantics.offer);
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
  // A moment chosen in the strip is selected, and the trace opens on it.
  const pickMoment = (stage: Stage) => {
    controls.recording.reveal(stage.stage === "call" && stage.callId ? { callId: stage.callId } : { stageId: stage.id });
    controls.onSelect(stage.stage === "call" && stage.callId ? { kind: "call", callId: stage.callId, jump: { pane: "overview", focus: null } } : { kind: "stage", stageId: stage.id }, { detail: true });
    controls.onOpenTrace();
  };

  return (
    <section aria-label="Live preview" className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3.5 font-mono text-xs text-muted-foreground">
        <span className={cn("size-1.5 rounded-full", loading && service.embeddable ? "animate-pulse bg-neutral-400" : "bg-green-500")} />
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
        {patch && (
          <button type="button" onClick={onShowPatch} title="The pipeline edited the sandbox copy to make it run" className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 font-sans text-amber-800 hover:bg-amber-100">
            Patched · {patch.files.length} file{patch.files.length === 1 ? "" : "s"}
          </button>
        )}
        <a href={service.previewUrl} target="_blank" rel="noreferrer" className="truncate hover:text-foreground" title="Open in a new tab">{service.previewUrl}</a>
        <span role="status" className="ml-auto shrink-0 font-sans">{!service.embeddable ? "" : loading === "update" ? "Updating…" : loading === "first" ? "Loading…" : ""}</span>
        <Button variant="ghost" size="icon" aria-label="Reload preview" title="Reload preview" disabled={!service.embeddable} onClick={reload} className="size-6 text-muted-foreground">
          <RotateCw className={cn("size-3", loading && service.embeddable && "animate-spin")} />
        </Button>
        {events.some((e) => e.data?.phase === "trail" && (e.data?.status === "own" || e.data?.status === "shared")) && (
          <Button variant="ghost" size="sm" onClick={async () => { await onStop(run.id); onStartOver(); }} title="Stop, then analyze from scratch ignoring the saved trail" className="h-6 px-2 font-normal text-muted-foreground">Start over</Button>
        )}
        {traced && <RecordButton active={rec.active} busy={rec.busy} onStart={() => void rec.start()} onStop={() => void rec.stop()} />}
        {traced && service.embeddable && <AnnotateControl active={picker.active} count={notes.list.length} onStart={picker.start} onStop={picker.stop} />}
        {traced && !controls.traceAside && <Button variant="ghost" size="sm" onClick={controls.onOpenTrace} className="h-6 px-2 font-normal text-muted-foreground">Open trace</Button>}
        <Button variant="ghost" size="sm" onClick={() => onStop(run.id)} className="h-6 px-2 font-normal text-muted-foreground">Stop</Button>
      </div>
      {rec.lastStopped && <RecordingSaved recording={rec.lastStopped} stats={controls.recording.stats(rec.lastStopped)} onOpen={() => { controls.recording.open(rec.lastStopped!.id); rec.dismissStopped(); }} onDismiss={rec.dismissStopped} />}
      {rec.error && <p role="alert" className="shrink-0 border-b px-3 py-1.5 text-xs text-destructive">{rec.error}</p>}
      {notes.error && <p role="alert" className="shrink-0 border-b px-3 py-1.5 text-xs text-destructive">{notes.error}</p>}
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
      <RunTimeline run={run} events={events} open={false} className="max-h-[60%] shrink-0 overflow-y-auto border-b" />
      {service.embeddable ? (
        <iframe ref={frame} key={`${service.id}:${reloads}`} src={service.previewUrl} title={`${repo.fullName} ${service.id} preview`} onLoad={() => setLoading(null)} className="min-h-0 w-full flex-1 bg-white" />
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
      {traced && <LiveStrip trace={controls.trace} live selectedId={selectedStage(controls.trace.stages, controls.selection)?.id ?? null} onPick={pickMoment} onOpenTrace={controls.traceAside ? null : controls.onOpenTrace} />}
    </section>
  );
}
