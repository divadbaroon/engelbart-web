"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { summarizeCall, type CallRow, type Stage } from "@/lib/trace/timeline";
import { liveLine, momentKind, shortClock } from "@/lib/trace/moments";
import { STAGE_ICON } from "@/components/trace/nodes";

// What is happening right now: the same stages the canvas draws, as a
// list that grows while the run is used, newest at the bottom. Each item
// is a time, a title and one line; a model call is one item from the
// moment it starts, saying where it stands, and updates in place when it
// ends. Nothing raw is listed here: the canvas and the inspector hold
// the rest.
type Props = { stages: Stage[]; calls: Map<string, CallRow>; selectedId: string | null; live: boolean; empty: string | null; onPick: (stage: Stage) => void };

export function LiveTrace({ stages, calls, selectedId, empty, onPick }: Props) {
  const list = useRef<HTMLOListElement>(null);
  const stuck = useRef(true);   // the reader is at the bottom, so new items keep it there
  useEffect(() => {
    const el = list.current;
    if (el && stuck.current) el.scrollTop = el.scrollHeight;
  }, [stages.length]);
  const onScroll = () => {
    const el = list.current;
    if (el) stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
  };
  return (
    <section aria-label="Live trace" className="flex h-full min-h-0 flex-col">
      {empty && !stages.length ? (
        <p className="p-6 text-center text-[13px] leading-5 text-muted-foreground">{empty}</p>
      ) : (
        <ol ref={list} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto py-1">
          {stages.map((stage) => <Item key={stage.id} stage={stage} calls={calls} selected={stage.id === selectedId} onPick={() => onPick(stage)} />)}
        </ol>
      )}
    </section>
  );
}

function Item({ stage, calls, selected, onPick }: { stage: Stage; calls: Map<string, CallRow>; selected: boolean; onPick: () => void }) {
  const kind = momentKind(stage);
  const row = stage.stage === "call" ? calls.get(stage.callId ?? "") : undefined;
  const s = row ? summarizeCall(row) : null;
  const title = kind === "model" ? s?.model ?? stage.title : stage.title;
  const line = liveLine(stage, calls);
  const Icon = STAGE_ICON[stage.stage];
  return (
    <li>
      <button type="button" onClick={onPick} aria-pressed={selected} className={cn("flex w-full items-start gap-2.5 px-[18px] py-2 text-left hover:bg-background/70", selected && "bg-background hover:bg-background")}>
        <span className="mt-[3px] font-mono text-[11px] text-muted-foreground">{shortClock(stage.at)}</span>
        <span className={cn("mt-1 flex size-4 shrink-0 items-center justify-center rounded-sm", kind === "model" ? "bg-foreground text-background" : kind === "observed" ? "border border-dashed border-foreground/40 text-muted-foreground" : "bg-[#e6e6e6] text-muted-foreground")}>
          <Icon className="size-2.5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5 text-[13px] leading-5">
            <span className="truncate font-medium">{title}</span>
            {s?.state === "in flight" && <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />}
          </span>
          {line && <span className={cn("truncate text-xs leading-4", s?.state === "error" ? "text-destructive" : "text-muted-foreground")}>{line}</span>}
        </span>
      </button>
    </li>
  );
}
