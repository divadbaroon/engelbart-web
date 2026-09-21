"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Check, ChevronDown, ChevronRight, Loader2, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDuration, runDuration, runState, runSteps, stepDuration, type RunState, type RunStep, type StepId, type StepState } from "@/lib/run-steps";
import { terminalLines, type SandboxEvent, type SandboxRun } from "@/lib/sandbox";
import { RunLog } from "@/components/run-log";
import { useNow } from "@/hooks/use-now";

type Props = {
  run: SandboxRun | undefined;
  events: SandboxEvent[];
  // What the first step calls the repository it cloned. Passed in rather
  // than read off the run, which carries an id and a working directory
  // but not the name the project knows it by.
  repoName?: string;
  open?: boolean;       // start with the step list showing
  // Whether the strip above the steps is drawn. It is the summary of the
  // run *and* the control that opens the list, so it is there wherever
  // the timeline is a thing you unfold beside something else. Under
  // Setup · Build the list is the whole tab and is never folded away, so
  // the strip has nothing left to do.
  header?: boolean;
  // Open the Logs tab at what this step printed. The steps already
  // partition the log — `RunStep.events` is that step's slice — so this
  // hands over a filter, not a copy.
  //
  // It is no longer what a click does. Pressing a step unfolds that
  // step's output under it, which is what pressing a step used to do and
  // what somebody means by it: the question is almost always "what did
  // *this* one print", and answering it by replacing the pane with
  // another tab, scrolled somewhere, made you find your place again.
  // The jump is still offered, from inside the unfolded panel, for the
  // times the answer is longer than a panel.
  onViewLogs?: (step: StepId) => void;
  className?: string;
};

const BAR: Record<StepState, string> = {
  waiting: "bg-neutral-200",
  active: "bg-neutral-800 animate-pulse",
  done: "bg-neutral-700",
  warned: "bg-amber-500",
  skipped: "bg-neutral-300",
  failed: "bg-red-500",
};

const HEADLINE: Record<RunState["tone"], string> = {
  none: "text-muted-foreground",
  working: "text-foreground",
  live: "text-foreground",
  ended: "text-foreground",
  failed: "text-destructive",
};

// The run from the GitHub link to a live application, as steps.
//
// The lifecycle and nothing else: what each step did, how long it took,
// and which one the run is in. What the tools themselves printed is in
// Logs, one tab over, because a build that failed needs the width of the
// pane to read and because the raw stream is worth having on its own —
// somebody looking for a line does not always know which step wrote it.
// The two are not two copies of anything: a step is a slice of that same
// log, and clicking a step opens Logs cut to its slice.
export function RunTimeline({ run, events, repoName, open: initiallyOpen = true, header = true, onViewLogs, className }: Props) {
  const steps = useMemo(() => runSteps(run, events, repoName), [run, events, repoName]);
  const [unfolded, setOpen] = useState(initiallyOpen);
  // Which step's output is showing. One at a time: two open panels in a
  // column this narrow leaves no list to read them against.
  const [expanded, setExpanded] = useState<StepId | null>(null);
  const open = unfolded || !header;   // with no strip there is nothing to fold it with
  // The clock starts on the browser, so the server's render matches.
  // Shared with the Live preview's preparing state, which draws the same
  // duration from the same helpers (hooks/use-now.ts).
  const now = useNow(steps.some((s) => s.since));

  // A failure unfolds the list, so the step it happened in is on the
  // screen rather than behind a chevron.
  const failed = steps.some((s) => s.state === "failed");
  useEffect(() => { if (failed) setOpen(true); }, [failed]);

  const state = runState(run, steps);
  const total = runDuration(steps, now);

  return (
    <section aria-label="Run steps" className={cn("flex flex-col text-[13px]", className)}>
      {header && (
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-[22px] py-2.5 text-left hover:bg-neutral-50"
      >
        <span aria-hidden className="mt-[7px] flex w-[120px] shrink-0 gap-1">
          {steps.map((s) => <span key={s.id} className={cn("h-1 flex-1 rounded-full", BAR[s.state])} />)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={cn("truncate", HEADLINE[state.tone])}>{state.headline}</span>
          {state.detail && <span className="truncate text-xs leading-normal text-muted-foreground" title={state.detail}>{state.detail}</span>}
        </span>
        {total !== null && <span className="mt-px shrink-0 tabular-nums text-xs text-muted-foreground/70">{formatDuration(total)}</span>}
        {open ? <ChevronDown className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60" /> : <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60" />}
      </button>
      )}

      {open && (
        <ol className={cn("flex flex-col", header && "border-t")}>
          {steps.map((s, i) => (
            <StepRow
              key={s.id}
              step={s}
              index={i}
              now={now}
              expanded={expanded === s.id}
              onToggle={() => setExpanded((e) => (e === s.id ? null : s.id))}
              onViewLogs={onViewLogs}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function StepRow({ step, index, now, expanded, onToggle, onViewLogs }: {
  step: RunStep;
  index: number;
  now: number | null;
  expanded: boolean;
  onToggle: () => void;
  onViewLogs?: (step: StepId) => void;
}) {
  const duration = stepDuration(step, now);
  const failed = step.state === "failed";
  const has = step.events.length > 0;
  // Read only while the panel is open: a run has a dozen steps and the
  // whole log behind them, and nobody is looking at eleven of them.
  const lines = useMemo(() => (expanded ? terminalLines(step.events) : []), [expanded, step.events]);
  return (
    <li className={cn("border-b last:border-b-0", failed && "bg-destructive/[0.03]")}>
      <button
        type="button"
        onClick={has ? onToggle : undefined}
        aria-expanded={has ? expanded : undefined}
        disabled={!has}
        title={has ? (expanded ? `Hide what ${step.title} printed` : `What ${step.title} printed`) : undefined}
        className={cn("group flex w-full items-center gap-3 px-[22px] py-2 text-left", has ? "hover:bg-neutral-50" : "cursor-default")}
      >
        <StateIcon state={step.state} />
        <span className={cn("w-[130px] shrink-0", step.state === "waiting" ? "text-muted-foreground/60" : failed ? "text-destructive" : "text-foreground")}>
          <span className="mr-1.5 tabular-nums text-muted-foreground/50">{index + 1}</span>{step.title}
        </span>
        <span className={cn("min-w-0 flex-1 truncate", failed ? "text-destructive/90" : "text-muted-foreground")} title={step.summary}>
          {step.summary}
        </span>
        {/* Only where there is something to unfold. On the step that
            failed it stands rather than waits for a hover: that is the
            one whose output is wanted. */}
        {has && (
          <ChevronRight
            aria-hidden
            className={cn(
              "size-3.5 shrink-0 transition-[transform,opacity]",
              expanded ? "rotate-90 text-muted-foreground" : failed ? "text-destructive" : "text-muted-foreground/60 opacity-0 group-hover:opacity-100",
            )}
          />
        )}
        <span className="w-[54px] shrink-0 whitespace-nowrap text-right tabular-nums text-xs text-muted-foreground/70">{duration !== null && (step.state !== "waiting") ? formatDuration(duration) : ""}</span>
      </button>
      {expanded && (
        <div className="border-t bg-[#fafafa]">
          {onViewLogs && (
            <div className="flex justify-end px-[22px] pt-1.5">
              <button
                type="button"
                onClick={() => onViewLogs(step.id)}
                title={`Open the Logs tab cut to ${step.title}`}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Open in Logs <ArrowUpRight className="size-3" />
              </button>
            </div>
          )}
          {/* As tall as its own output, up to the point where it would
              push the rest of the list off the pane. A step that printed
              four lines used to leave two hundred pixels of empty grey
              under them. 23px is `RunLog`'s own row. */}
          <div style={{ height: Math.min(220, Math.max(56, lines.length * 23 + 16)) }}>
            <RunLog lines={lines} empty="Nothing recorded for this step." />
          </div>
        </div>
      )}
    </li>
  );
}

function StateIcon({ state }: { state: StepState }) {
  const box = "flex size-4 shrink-0 items-center justify-center rounded-full";
  switch (state) {
    case "active": return <span className={box}><Loader2 className="size-3.5 animate-spin text-neutral-700" /></span>;
    case "done": return <span className={cn(box, "bg-neutral-800 text-white")}><Check className="size-2.5" strokeWidth={3} /></span>;
    case "warned": return <span className={cn(box, "bg-amber-500 text-white")}><Check className="size-2.5" strokeWidth={3} /></span>;
    case "failed": return <span className={cn(box, "bg-red-500 text-white")}><X className="size-2.5" strokeWidth={3} /></span>;
    case "skipped": return <span className={cn(box, "border border-neutral-300 text-neutral-400")}><Minus className="size-2.5" strokeWidth={3} /></span>;
    default: return <span className={cn(box, "border border-neutral-300")} />;
  }
}
