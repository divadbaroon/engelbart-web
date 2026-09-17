"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { GitBranch, RotateCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Repo } from "@/lib/repos";
import type { Goal } from "@/lib/plan";
import { RunLog } from "@/components/run-log";
import { RunTimeline } from "@/components/run-timeline";
import { formatDay } from "@/lib/run-steps";
import { getSharedTrail, type SharedTrail } from "@/app/workspace/[workspaceId]/trail-actions";
import { environmentFromEvents, isRunActive, isRunCloned, isRunRunning, isSandboxLive, STATUS_LABEL, terminalLines, type PreviewService, type SandboxEvent, type SandboxRun } from "@/lib/sandbox";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Markdown } from "@/components/markdown";
import { CodeBrowser } from "@/components/code-browser";
import { NotesPad } from "@/components/notes-pad";
import { EnvPanel } from "@/components/env-panel";
import { PatchView } from "@/components/patch-view";
import { patchFromEvents, type RepoPatch } from "@/lib/patch";

// xterm touches the DOM as soon as it loads.
const SandboxShell = dynamic(() => import("@/components/sandbox-shell"), { ssr: false });

export type RepoTab = "readme" | "code" | "preview" | "terminal" | "env" | "notes";

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
};

const dotClass = (run: SandboxRun | undefined) =>
  isRunRunning(run) ? "bg-green-500" : run?.status === "failed" ? "bg-red-500" : isRunActive(run) ? "animate-pulse bg-neutral-400" : isRunCloned(run) ? "bg-neutral-400" : "bg-neutral-300";

// Tab bar for the selected repo: repo chip + README / Code / Live preview (status dot) / Terminal / Notes.
export function RepoTabs({ repo, tab, onTabChange, run, onClose }: RepoTabsProps) {
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
        <TabsTrigger value="readme" className={TAB_TRIGGER}>README</TabsTrigger>
        <TabsTrigger value="code" className={TAB_TRIGGER}>Code</TabsTrigger>
        <TabsTrigger value="preview" title={run ? STATUS_LABEL[run.status] : "Not prepared"} className={cn(TAB_TRIGGER, "gap-[7px]")}>
          Live preview
          <span aria-hidden className={cn("size-1.5 rounded-full", dotClass(run))} />
        </TabsTrigger>
        <TabsTrigger value="terminal" className={TAB_TRIGGER}>Terminal</TabsTrigger>
        <TabsTrigger value="env" className={TAB_TRIGGER}>Environment</TabsTrigger>
        <TabsTrigger value="notes" className={TAB_TRIGGER}>Notes</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

// `readme` is undefined while it loads, null when the repo has none GitHub can serve.
type RunControls = {
  onPrepare: () => void;                 // clone into a fresh sandbox and start
  onLaunch: (runId: string) => void;     // start the app in an existing cloned sandbox
  onStop: (runId: string) => void;       // kill the sandbox
  onOpenEnvironment: () => void;         // switch to the Environment tab
  onRunWithoutPatch: () => void;         // drop the repair agent's edits and prepare again
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
};

export function RepoContent({ repo, tab, run, events, error, readme, notesGoal, onNotesSaved, previewVersion, onFileSaved, onPrepare, onLaunch, onStop, onOpenEnvironment, onRunWithoutPatch }: RepoContentProps) {
  // The environment scan and any repair edits from this run's log if it
  // has them, else the last ones saved on the repository.
  const envReport = (run && environmentFromEvents(events, run.id)) ?? repo.envReport;
  const lines = useMemo(() => terminalLines(events), [events]);
  const livePatch = run && patchFromEvents(events, run.id);
  const patch: RepoPatch | null = livePatch
    ? {
        ...livePatch,
        worked: run.status === "running" ? true : run.status === "failed" ? false : null,
        // Where a replayed patch came from is known to the worker, not the log.
        origin: repo.patch?.runId === run.id ? repo.patch.origin ?? null : null,
      }
    : repo.patch;
  if (tab === "code") return <CodeBrowser repo={repo} run={run} onSaved={onFileSaved} />;
  if (tab === "notes") return <NotesPad goal={notesGoal} onSaved={onNotesSaved} />;
  if (tab === "env") return <EnvPanel repo={repo} run={run} report={envReport} onPrepare={onPrepare} />;

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

  if (tab === "preview") {
    return <Preview repo={repo} run={run} error={error} events={events} version={previewVersion} missing={envReport?.missing ?? []} localError={envReport?.localError ?? null} patch={patch} onPrepare={onPrepare} onLaunch={onLaunch} onStop={onStop} onOpenEnvironment={onOpenEnvironment} onRunWithoutPatch={onRunWithoutPatch} />;
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

type PreviewProps = RunControls & { repo: Repo; run: SandboxRun | undefined; error: string | undefined; events: SandboxEvent[]; version: number; missing: string[]; localError: string | null; patch: RepoPatch | null };

function Preview({ repo, run, error, events, version, missing, localError, patch, onPrepare, onLaunch, onStop, onOpenEnvironment, onRunWithoutPatch }: PreviewProps) {
  const [showPatch, setShowPatch] = useState(false);
  if (showPatch && patch) {
    return <PatchView patch={patch} onBack={() => setShowPatch(false)} onRunWithoutPatch={run && isRunActive(run) ? null : () => { setShowPatch(false); onRunWithoutPatch(); }} />;
  }
  if (run && isRunRunning(run)) return <RunningPreview repo={repo} run={run} events={events} version={version} patch={patch} onShowPatch={() => setShowPatch(true)} onStop={onStop} />;

  const [title, detail, action] = error
    ? ["Could not prepare " + repo.fullName, error, { label: "Try again", onClick: onPrepare }]
    : !run
      ? ["Not prepared yet", "Open the repository to clone it into a sandbox and start it.", { label: "Prepare", onClick: onPrepare }]
      : isRunActive(run)
        ? [run.status === "launching" ? `Starting ${repo.fullName}…` : `Preparing ${repo.fullName}…`, STATUS_LABEL[run.status] + " You can keep reading the README meanwhile.", null]
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
          {action && <Button variant="outline" size="sm" onClick={action.onClick} className="shrink-0 font-normal">{action.label}</Button>}
        </div>
        <RunTimeline run={run} events={events} open className="border-y" />
        {(patchBox || missingBox) && (
          <div className="flex flex-col gap-3 px-[22px] py-4">
            {patchBox}
            {missingBox}
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
    </section>
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
function RunningPreview({ repo, run, events, version, patch, onShowPatch, onStop }: { repo: Repo; run: SandboxRun; events: SandboxEvent[]; version: number; patch: RepoPatch | null; onShowPatch: () => void; onStop: (runId: string) => void }) {
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
        <Button variant="ghost" size="sm" onClick={() => onStop(run.id)} className="h-6 px-2 font-normal text-muted-foreground">Stop</Button>
      </div>
      <RunTimeline run={run} events={events} open={false} className="max-h-[60%] shrink-0 overflow-y-auto border-b" />
      {service.embeddable ? (
        <iframe key={`${service.id}:${reloads}`} src={service.previewUrl} title={`${repo.fullName} ${service.id} preview`} onLoad={() => setLoading(null)} className="min-h-0 w-full flex-1 bg-white" />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-6 text-center">
          <span className="text-[13px] text-muted-foreground">{service.id} does not allow being shown in a frame.</span>
          <Button asChild variant="outline" size="sm" className="mt-3 font-normal">
            <a href={service.previewUrl} target="_blank" rel="noreferrer">Open in a new tab</a>
          </Button>
        </div>
      )}
    </section>
  );
}
