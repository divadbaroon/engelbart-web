"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Loader2, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDuration, runDuration, runSteps, stepDuration, type RunStep, type StepId, type StepState } from "@/lib/run-steps";
import { RunLog } from "@/components/run-log";
import { terminalLines, type SandboxEvent, type SandboxRun } from "@/lib/sandbox";

type Props = {
  run: SandboxRun | undefined;
  events: SandboxEvent[];
  open?: boolean;       // start with the step list showing
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

// The run from the GitHub link to a live application, as steps. Each step
// is a slice of the log with the latest word on it; opening one shows that
// slice. The header alone tells where the run is and how long it has
// been there.
export function RunTimeline({ run, events, open: initiallyOpen = true, className }: Props) {
  const steps = useMemo(() => runSteps(run, events), [run, events]);
  const [open, setOpen] = useState(initiallyOpen);
  const [expanded, setExpanded] = useState<StepId | null>(null);
  const ticking = steps.some((s) => s.since);
  // The clock starts on the browser, so the server's render matches.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    if (!ticking) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ticking]);

  const at = steps.reduce((found, s, i) => (s.state !== "waiting" ? i : found), -1);
  const current = at >= 0 ? steps[at] : null;
  const total = runDuration(steps, now);

  return (
    <section aria-label="Run steps" className={cn("flex flex-col text-[13px]", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-[22px] py-2.5 text-left hover:bg-neutral-50"
      >
        <span aria-hidden className="flex w-[120px] shrink-0 gap-1">
          {steps.map((s) => <span key={s.id} className={cn("h-1 flex-1 rounded-full", BAR[s.state])} />)}
        </span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {current ? (
            <>
              <span className="text-foreground">Step {at + 1} of {steps.length} · {current.title}</span>
              {current.summary && <span> · {current.summary}</span>}
            </>
          ) : (
            "Not started"
          )}
        </span>
        {total !== null && <span className="shrink-0 tabular-nums text-xs text-muted-foreground/70">{formatDuration(total)}</span>}
        {open ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground/60" /> : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />}
      </button>

      {open && (
        <ol className="flex flex-col border-t">
          {steps.map((s, i) => (
            <StepRow key={s.id} step={s} index={i} now={now} expanded={expanded === s.id} onToggle={() => setExpanded((e) => (e === s.id ? null : s.id))} />
          ))}
        </ol>
      )}
    </section>
  );
}

function StepRow({ step, index, now, expanded, onToggle }: { step: RunStep; index: number; now: number | null; expanded: boolean; onToggle: () => void }) {
  const duration = stepDuration(step, now);
  const lines = useMemo(() => (expanded ? terminalLines(step.events) : []), [expanded, step.events]);
  return (
    <li className="border-b last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        disabled={!step.events.length}
        className={cn("flex w-full items-center gap-3 px-[22px] py-2 text-left", step.events.length ? "hover:bg-neutral-50" : "cursor-default")}
      >
        <StateIcon state={step.state} />
        <span className={cn("w-[130px] shrink-0", step.state === "waiting" ? "text-muted-foreground/60" : "text-foreground")}>
          <span className="mr-1.5 tabular-nums text-muted-foreground/50">{index + 1}</span>{step.title}
        </span>
        <span className={cn("min-w-0 flex-1 text-muted-foreground", expanded ? "whitespace-pre-wrap break-words" : "truncate")} title={expanded ? undefined : step.summary}>
          {step.summary}
        </span>
        <span className="shrink-0 tabular-nums text-xs text-muted-foreground/70">{duration !== null && (step.state !== "waiting") ? formatDuration(duration) : ""}</span>
      </button>
      {expanded && (
        <div className="h-[220px] border-t bg-[#fafafa]">
          <RunLog lines={lines} empty="Nothing recorded for this step." />
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
