"use client";

import { cn } from "@/lib/utils";
import { diffLines, type PatchOrigin, type RepoPatch } from "@/lib/patch";
import { Button } from "@/components/ui/button";

type Props = {
  patch: RepoPatch;
  onBack: () => void;
  onRunWithoutPatch: (() => void) | null;   // null while a run is in progress
};

// The edits the repair agent made to the sandbox copy, as a diff, with its
// reasons. The person sees exactly how the running copy differs from the
// repository, and can throw the edits away and run clean.
export function PatchView({ patch, onBack, onRunWithoutPatch }: Props) {
  const lines = diffLines(patch.diff);
  return (
    <section aria-label="Changes made to run this" className="flex h-full flex-col">
      <div className="flex shrink-0 items-start gap-4 border-b px-[22px] py-[14px]">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[13px] font-medium">
            Changes made to run this {patch.worked === false && <span className="font-normal text-muted-foreground">· it still did not start</span>}
          </span>
          <span className="text-[13px] leading-5 text-muted-foreground">{patch.summary}</span>
          {patch.reason && <span className="text-xs leading-5 text-muted-foreground/80">{patch.reason}</span>}
          <span className="text-xs text-muted-foreground/70">
            {patch.files.length} file{patch.files.length === 1 ? "" : "s"} in the sandbox copy only. GitHub is unchanged.
            {patch.truncated && " The diff was cut at the storage limit."}
          </span>
          {patch.origin && (
            <span className="text-xs text-muted-foreground/70">
              {describeOrigin(patch.origin)}
            </span>
          )}
        </div>
        <div className="flex shrink-0 gap-1.5">
          {onRunWithoutPatch && (
            <Button variant="outline" size="sm" onClick={onRunWithoutPatch} className="h-7 px-3 font-normal">Run without these changes</Button>
          )}
          <Button variant="ghost" size="sm" onClick={onBack} className="h-7 px-3 font-normal text-muted-foreground">Back</Button>
        </div>
      </div>
      <pre className="min-h-0 flex-1 overflow-auto px-[22px] py-3 font-mono text-[12px] leading-[1.6]">
        {lines.map((l, i) => (
          <div
            key={i}
            className={cn(
              "whitespace-pre",
              l.kind === "file" && "mt-3 font-semibold text-foreground first:mt-0",
              l.kind === "hunk" && "text-sky-700",
              l.kind === "add" && "bg-green-50 text-green-800",
              l.kind === "del" && "bg-red-50 text-red-800",
              l.kind === "meta" && "text-muted-foreground/60",
              l.kind === "ctx" && "text-muted-foreground",
            )}
          >
            {l.text || " "}
          </div>
        ))}
      </pre>
    </section>
  );
}

// "Made in an earlier run on Sep 16 at commit a1b2c3d, applied again here."
function describeOrigin(origin: PatchOrigin): string {
  const when = origin.at ? ` on ${new Date(origin.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : "";
  const where = origin.shared ? "in another project" : "in an earlier run";
  const commit = origin.commit ? ` at commit ${origin.commit.slice(0, 7)}` : "";
  return `Made ${where}${when}${commit}, applied again here.`;
}
