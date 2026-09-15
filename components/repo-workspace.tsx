"use client";

import { GitBranch, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isReadyStep, previewUrl, terminalScript, type Repo } from "@/lib/repos";
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
  ready: boolean;
  onClose: () => void;
};

// Tab bar for the selected repo: repo chip + README / Live preview (status dot) / Terminal.
export function RepoTabs({ repo, tab, onTabChange, ready, onClose }: RepoTabsProps) {
  return (
    <Tabs value={tab} onValueChange={(v) => onTabChange(v as RepoTab)}>
      <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b bg-transparent p-0">
        <div className="flex min-w-0 items-center gap-2 pt-2 pb-2.5 text-[13px] text-muted-foreground">
          <GitBranch className="size-3.5 shrink-0" />
          <span className="truncate font-medium text-foreground">{repo.name}</span>
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
        <TabsTrigger value="preview" title={ready ? "Application ready" : "Preparing…"} className={cn(TAB_TRIGGER, "gap-[7px]")}>
          Live preview
          <span aria-hidden className={cn("size-1.5 rounded-full", ready ? "bg-green-500" : "bg-neutral-300")} />
        </TabsTrigger>
        <TabsTrigger value="terminal" className={TAB_TRIGGER}>Terminal</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

type RepoContentProps = { repo: Repo; tab: RepoTab; progress: number | undefined };

export function RepoContent({ repo, tab, progress }: RepoContentProps) {
  const ready = isReadyStep(progress);

  if (tab === "readme") {
    return (
      <section aria-label="README" className="h-full overflow-y-auto">
        <Markdown source={repo.readme ?? `# ${repo.name}\n\nThis repository has no README.`} />
      </section>
    );
  }

  if (tab === "preview") {
    return (
      <section aria-label="Live preview" className="flex h-full flex-col">
        {ready ? (
          <>
            <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3.5 font-mono text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-green-500" />
              <span>{previewUrl(repo)}</span>
            </div>
            {/* Replace with <iframe src={previewUrl(repo)} className="flex-1 w-full" /> once the dev server is real. */}
            <div className="flex min-h-0 flex-1 items-center justify-center bg-[repeating-linear-gradient(135deg,#f4f4f4_0_10px,#fafafa_10px_20px)] font-mono text-xs text-muted-foreground">
              running application
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-6 text-center">
            <span className="text-[13px] text-muted-foreground">Preparing {repo.name}…</span>
            <span className="max-w-[320px] text-xs leading-normal text-muted-foreground/70">
              Installing dependencies and starting the dev server. You can keep reading the README meanwhile.
            </span>
          </div>
        )}
      </section>
    );
  }

  const lines = terminalScript(repo).slice(0, (progress ?? 0) + 1).flat();
  return (
    <section aria-label="Terminal" className="h-full overflow-y-auto px-[22px] py-[18px] font-mono text-[13px] leading-[1.75]">
      {lines.map((l, i) => (
        <div key={i} className={cn("flex gap-2.5 break-words whitespace-pre-wrap", l.prompt ? "text-foreground" : "text-muted-foreground")}>
          <span aria-hidden className="w-2.5 shrink-0 text-muted-foreground/60">{l.prompt}</span>
          <span>{l.text}</span>
        </div>
      ))}
    </section>
  );
}
