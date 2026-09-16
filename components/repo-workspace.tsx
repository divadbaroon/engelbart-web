"use client";

import { GitBranch, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Repo } from "@/lib/repos";
import { isRunActive, isRunReady, STATUS_LABEL, terminalLines, type SandboxEvent, type SandboxRun, type TermLine } from "@/lib/sandbox";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Markdown } from "@/components/markdown";

export type RepoTab = "readme" | "preview" | "terminal";

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
  isRunReady(run) ? "bg-green-500" : run?.status === "failed" ? "bg-red-500" : isRunActive(run) ? "animate-pulse bg-neutral-400" : "bg-neutral-300";

// Tab bar for the selected repo: repo chip + README / Live preview (status dot) / Terminal.
export function RepoTabs({ repo, tab, onTabChange, run, onClose }: RepoTabsProps) {
  return (
    <Tabs value={tab} onValueChange={(v) => onTabChange(v as RepoTab)}>
      <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b bg-transparent p-0">
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
        <TabsTrigger value="preview" title={run ? STATUS_LABEL[run.status] : "Not prepared"} className={cn(TAB_TRIGGER, "gap-[7px]")}>
          Live preview
          <span aria-hidden className={cn("size-1.5 rounded-full", dotClass(run))} />
        </TabsTrigger>
        <TabsTrigger value="terminal" className={TAB_TRIGGER}>Terminal</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

// `readme` is undefined while it loads, null when the repo has none GitHub can serve.
type RepoContentProps = {
  repo: Repo;
  tab: RepoTab;
  run: SandboxRun | undefined;
  events: SandboxEvent[];
  error: string | undefined;
  readme: string | null | undefined;
};

export function RepoContent({ repo, tab, run, events, error, readme }: RepoContentProps) {
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

  if (tab === "preview") return <Preview repo={repo} run={run} error={error} tail={terminalLines(events).slice(-5)} />;

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

type PreviewProps = { repo: Repo; run: SandboxRun | undefined; error: string | undefined; tail: TermLine[] };

function Preview({ repo, run, error, tail }: PreviewProps) {
  if (run?.previewUrl) {
    return (
      <section aria-label="Live preview" className="flex h-full flex-col">
        <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3.5 font-mono text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-green-500" />
          <span>{run.previewUrl}</span>
        </div>
        <iframe src={run.previewUrl} title={`${repo.fullName} preview`} className="min-h-0 w-full flex-1" />
      </section>
    );
  }

  const [title, detail] = error
    ? ["Could not prepare " + repo.fullName, error]
    : !run
      ? ["Not prepared yet", "Open the repository to clone it into a sandbox."]
      : isRunActive(run)
        ? [`Preparing ${repo.fullName}…`, STATUS_LABEL[run.status] + " You can keep reading the README meanwhile."]
        : run.status === "failed"
          ? ["Could not prepare " + repo.fullName, run.error ?? "The run failed. See the Terminal for details."]
          : ["Cloned into a sandbox", `The repository is on disk in sandbox ${run.sandboxId ?? ""}. Starting the application comes next.`];

  return (
    <section aria-label="Live preview" className="flex h-full flex-col items-center justify-center gap-1.5 p-6 text-center">
      <span className="text-[13px] text-muted-foreground">{title}</span>
      <span className="max-w-[360px] text-xs leading-normal text-muted-foreground/70">{detail}</span>
      {isRunActive(run) && tail.length > 0 && (
        <pre aria-label="Latest output" className="mt-4 w-full max-w-[520px] overflow-hidden rounded-md border bg-[#f6f6f6] px-3.5 py-2.5 text-left font-mono text-[11px] leading-[1.7] text-muted-foreground">
          {tail.map((l, i) => (
            <div key={i} className="truncate">{l.kind === "command" ? "$ " : ""}{l.text}</div>
          ))}
        </pre>
      )}
    </section>
  );
}
