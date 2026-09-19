"use client";

import { useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { TraceView } from "@/hooks/use-trace-view";
import type { Stage } from "@/lib/trace/timeline";
import { liveLine, shortClock } from "@/lib/trace/moments";
import { summarizeCall } from "@/lib/trace/timeline";
import { LiveTrace } from "@/components/trace/live-trace";

// At the foot of the Live preview: what the trace saw last, in one line,
// with the count of moments so far and the way to the whole trace. Opens
// to the live list. Nothing raw; the canvas and its drawer hold the rest.
type Props = { trace: TraceView; live: boolean; selectedId: string | null; onPick: (stage: Stage) => void; onOpenTrace: (() => void) | null };

export function LiveStrip({ trace, live, selectedId, onPick, onOpenTrace }: Props) {
  const [open, setOpen] = useState(false);
  const { stages, callRows } = trace;
  const last = stages[stages.length - 1];
  const row = last?.stage === "call" && last.callId ? callRows.get(last.callId) : undefined;
  const s = row ? summarizeCall(row) : null;
  const title = last ? (s ? s.model ?? last.title : last.title) : null;
  const line = last ? liveLine(last, callRows) : null;
  return (
    <div className={cn("flex shrink-0 flex-col border-t bg-[#fafafa]", open && "max-h-[45%]")}>
      <div className="flex h-9 shrink-0 items-center gap-2 pl-2 pr-2 text-xs">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left hover:text-foreground">
          <ChevronRight className={cn("size-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
          <span className="shrink-0 font-medium text-foreground">Live trace</span>
          {last ? (
            <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <span className="font-mono text-[11px]">{shortClock(last.at)}</span>
              <span className="truncate text-foreground">{title}</span>
              {s?.state === "in flight" && <Loader2 className="size-3 shrink-0 animate-spin" />}
              {line && <span className="truncate">{line}</span>}
            </span>
          ) : (
            <span className="truncate text-muted-foreground">{live ? "nothing yet; use the application and what you do appears here" : "nothing recorded"}</span>
          )}
          <span className="ml-auto shrink-0 text-muted-foreground">{stages.length} moment{stages.length === 1 ? "" : "s"}</span>
        </button>
        {onOpenTrace && <Button variant="outline" size="sm" onClick={onOpenTrace} className="h-6 shrink-0 px-2 font-normal">Open trace</Button>}
      </div>
      {open && (
        <div className="min-h-0 flex-1 border-t">
          <LiveTrace stages={stages} calls={callRows} selectedId={selectedId} live={live} empty={null} onPick={onPick} />
        </div>
      )}
    </div>
  );
}
