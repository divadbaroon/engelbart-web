"use client";

import { useEffect, useRef, useState } from "react";
import { GitBranch, RotateCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Repo } from "@/lib/repos";
import type { Goal } from "@/lib/plan";
import { isRunActive, isRunCloned, isRunRunning, STATUS_LABEL, terminalLines, type SandboxEvent, type SandboxRun, type TermLine } from "@/lib/sandbox";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Markdown } from "@/components/markdown";
import { CodeBrowser } from "@/components/code-browser";
import { NotesPad } from "@/components/notes-pad";

export type RepoTab = "readme" | "code" | "preview" | "terminal" | "notes";

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

export function RepoContent({ repo, tab, run, events, error, readme, notesGoal, onNotesSaved, previewVersion, onFileSaved, onPrepare, onLaunch, onStop }: RepoContentProps) {
  if (tab === "code") return <CodeBrowser repo={repo} run={run} onSaved={onFileSaved} />;
  if (tab === "notes") return <NotesPad goal={notesGoal} onSaved={onNotesSaved} />;

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

  if (tab === "preview") return <Preview repo={repo} run={run} error={error} tail={terminalLines(events).slice(-6)} version={previewVersion} onPrepare={onPrepare} onLaunch={onLaunch} onStop={onStop} />;

  const lines = terminalLines(events);
  return (
    <section aria-label="Terminal" className="h-full overflow-y-auto px-[22px] py-[18px] font-mono text-[13px] leading-[1.75]">
      {!lines.length && (
        <p className="text-muted-foreground">{error ?? (run ? STATUS_LABEL[run.status] : "Open the repository to prepare it in a sandbox.")}</p>
      )}
      {lines.map((l, i) => (
        <div
          key={i}
          className={cn(
            "flex gap-2.5 break-words whitespace-pre-wrap",
            l.kind === "command" ? "text-foreground" : l.kind === "error" ? "text-destructive" : l.kind === "status" ? "text-muted-foreground/60 italic" : "text-muted-foreground",
          )}
        >
          <span aria-hidden className="w-2.5 shrink-0 text-muted-foreground/60">{l.kind === "command" ? "$" : ""}</span>
          <span>{l.text}</span>
        </div>
      ))}
      {error && lines.length > 0 && <p role="alert" className="mt-2 text-destructive">{error}</p>}
    </section>
  );
}

type PreviewProps = RunControls & { repo: Repo; run: SandboxRun | undefined; error: string | undefined; tail: TermLine[]; version: number };

function Preview({ repo, run, error, tail, version, onPrepare, onLaunch, onStop }: PreviewProps) {
  if (run && isRunRunning(run)) return <RunningPreview repo={repo} run={run} version={version} onStop={onStop} />;

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

  return (
    <section aria-label="Live preview" className="flex h-full flex-col items-center justify-center gap-1.5 p-6 text-center">
      <span className="text-[13px] text-muted-foreground">{title}</span>
      <span className="max-w-[360px] text-xs leading-normal text-muted-foreground/70">{detail}</span>
      {action && (
        <Button variant="outline" size="sm" onClick={action.onClick} className="mt-3 font-normal">{action.label}</Button>
      )}
      {run && isRunActive(run) && tail.length > 0 && (
        <pre aria-label="Latest output" className="mt-4 w-full max-w-[520px] overflow-hidden rounded-md border bg-[#f6f6f6] px-3.5 py-2.5 text-left font-mono text-[11px] leading-[1.7] text-muted-foreground">
          {tail.map((l, i) => (
            <div key={i} className="truncate">{l.kind === "command" ? "$ " : ""}{l.text}</div>
          ))}
        </pre>
      )}
    </section>
  );
}

// The app in an iframe. A save in the Code tab, or the Reload button,
// reloads it and the header says so until the new page has loaded. Dev
// servers push changes themselves; a plain file server never does, and the
// reload covers both.
function RunningPreview({ repo, run, version, onStop }: { repo: Repo; run: SandboxRun; version: number; onStop: (runId: string) => void }) {
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

  return (
    <section aria-label="Live preview" className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3.5 font-mono text-xs text-muted-foreground">
        <span className={cn("size-1.5 rounded-full", loading ? "animate-pulse bg-neutral-400" : "bg-green-500")} />
        <a href={run.previewUrl!} target="_blank" rel="noreferrer" className="truncate hover:text-foreground" title="Open in a new tab">{run.previewUrl}</a>
        <span role="status" className="ml-auto shrink-0 font-sans">{loading === "update" ? "Updating…" : loading === "first" ? "Loading…" : ""}</span>
        <Button variant="ghost" size="icon" aria-label="Reload preview" title="Reload preview" onClick={reload} className="size-6 text-muted-foreground">
          <RotateCw className={cn("size-3", loading && "animate-spin")} />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onStop(run.id)} className="h-6 px-2 font-normal text-muted-foreground">Stop</Button>
      </div>
      <iframe key={reloads} src={run.previewUrl!} title={`${repo.fullName} preview`} onLoad={() => setLoading(null)} className="min-h-0 w-full flex-1 bg-white" />
    </section>
  );
}
