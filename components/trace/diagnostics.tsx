"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { diffLines } from "@/lib/patch";
import type { TraceEvent } from "@/lib/trace/types";
import type { TraceRow } from "@/lib/trace/timeline";
import { RowItem, type Select } from "@/components/trace/rows";

// Everything about how the trace was taken, kept out of the trace itself
// and one click away: what the run recorded and in what mode, the
// gateways and the bridge, the instrumentation Engelbart applied in the
// sandbox with its diff, and the rows no moment claims (gateway startup,
// documents and frames, requests no interaction claimed, rerenders).
// Everything here is a fact about the run, whatever the canvas is cut to;
// `recording` names the slice on the canvas when one is open, so the run's
// own counts are never mistaken for the recording's.
export type RunSummary = { counts: string; capture: string; gateways: string; instrumentation: TraceEvent | undefined; repoName: string; recording: string | null };

export function Diagnostics({ rows, select, summary }: { rows: TraceRow[]; select: Select; summary: RunSummary }) {
  const [open, setOpen] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const inst = summary.instrumentation;
  return (
    <div className={cn("shrink-0 border-t", open && "flex max-h-[50%] min-h-0 flex-col")}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2 px-[22px] py-2 text-left text-xs text-muted-foreground hover:bg-[#fafafa]">
        <ChevronRight className={cn("size-3 shrink-0 transition-transform", open && "rotate-90")} />
        <span className="shrink-0 whitespace-nowrap">Diagnostics{rows.length ? ` · ${rows.length} row${rows.length === 1 ? "" : "s"}` : ""}</span>
        <span className="min-w-0 truncate text-muted-foreground/70">· run, capture, gateways, instrumentation, and the rows no moment claims</span>
      </button>
      {open && (
        <div className="min-h-0 overflow-y-auto">
          <dl className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-1 border-b px-[22px] py-3 text-xs leading-5">
            <dt className="text-muted-foreground">Run</dt>
            <dd>{summary.counts} <span className="text-muted-foreground">· capture {summary.capture}</span></dd>
            {summary.recording && (
              <>
                <dt className="text-muted-foreground">Recording</dt>
                <dd className="min-w-0 truncate" title={summary.recording}>{summary.recording} <span className="text-muted-foreground">· the canvas above is cut to it</span></dd>
              </>
            )}
            <dt className="text-muted-foreground">Gateways</dt>
            <dd className="text-muted-foreground">{summary.gateways}</dd>
            <dt className="text-muted-foreground">Instrumentation</dt>
            <dd className="text-muted-foreground">
              {inst ? (
                <>
                  Engelbart changed {(inst.data?.files as string[] | undefined)?.join(", ") ?? "the sandbox copy"} so the model calls of {summary.repoName} pass through it; GitHub is unchanged.{" "}
                  {typeof inst.data?.diff === "string" && <button type="button" onClick={() => setShowDiff((v) => !v)} className="underline underline-offset-2 hover:text-foreground">{showDiff ? "Hide the change" : "Show the change"}</button>}
                </>
              ) : "none recorded"}
            </dd>
          </dl>
          {showDiff && inst && typeof inst.data?.diff === "string" && (
            <div className="border-b">
              {typeof inst.data.why === "string" && <p className="px-[22px] pt-3 text-xs leading-5 text-muted-foreground">{inst.data.why}</p>}
              <pre className="max-h-[260px] overflow-auto px-[22px] py-3 font-mono text-[12px] leading-[1.6]">
                {diffLines(inst.data.diff).map((l, i) => (
                  <div key={i} className={cn("whitespace-pre", l.kind === "file" && "font-semibold", l.kind === "hunk" && "text-sky-700", l.kind === "add" && "bg-green-50 text-green-800", l.kind === "del" && "bg-red-50 text-red-800", l.kind === "meta" && "text-muted-foreground/60", l.kind === "ctx" && "text-muted-foreground")}>{l.text || " "}</div>
                ))}
              </pre>
            </div>
          )}
          {rows.length > 0 && <ol>{rows.map((row) => <RowItem key={row.id} row={row} nested selected={select.selected} onSelect={select.onSelect} />)}</ol>}
        </div>
      )}
    </div>
  );
}
