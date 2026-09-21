"use client";

import { useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Repo } from "@/lib/repos";
import { STATUS_LABEL, isSandboxLive, terminalLines, type SandboxEvent, type SandboxRun, type TermLine } from "@/lib/sandbox";
import type { EnvReport } from "@/lib/environment";
import { runSteps, type RunStep, type StepId } from "@/lib/run-steps";
import type { TraceRow } from "@/lib/trace/timeline";
import { RunTimeline } from "@/components/run-timeline";
import { RunLog } from "@/components/run-log";
import { EnvPanel } from "@/components/env-panel";
import { InterfaceHistory, actLines, type Watched } from "@/components/interface-history";
import dynamic from "next/dynamic";

// xterm touches the DOM as soon as it loads.
const SandboxShell = dynamic(() => import("@/components/sandbox-shell"), { ssr: false });

// What the repository is given to run with, and how the run went.
//
// Two kinds of thing under one tab, in one row with a rule between them.
// To the left of the rule are the controls over the sandbox — what it
// reads from its environment, and a shell in it. Those are things you do
// to the machine. To the right is the run as a record: the lifecycle in
// steps, everything it printed, and what was done to the interface once
// it was up. Those are things you read about the machine.
//
// One row rather than two bars because a bar inside a tab inside a tab is
// a level too many, and the rule is enough to say that Terminal and Logs
// are not the same kind of neighbour.
export type SetupTab = "env" | "terminal" | "build" | "logs" | "events";
const TABS: { key: SetupTab; label: string; opens?: true }[] = [
  { key: "env", label: "Environment" },
  { key: "terminal", label: "Terminal" },
  { key: "build", label: "Build", opens: true },
  { key: "logs", label: "Logs" },
  { key: "events", label: "Events" },
];

type Props = {
  repo: Repo;
  run: SandboxRun | undefined;
  events: SandboxEvent[];
  error: string | undefined;
  report: EnvReport | null;   // the scan from the current run's log, else the last saved one
  rows: TraceRow[];           // the run's trace, for what was done to the interface
  watched: Watched;
  // Which section is showing, and — when Logs is showing — which step's
  // slice of the log it is cut to. Held above this component so something
  // that needs a particular one seen can ask for it: the Live preview's
  // "Add the values" means the Environment, and a failed step in Build
  // means Logs at what that step printed.
  section: SetupTab;
  onSection: (section: SetupTab) => void;
  logStep: StepId | null;
  onLogStep: (step: StepId | null) => void;
  onPrepare: () => void;
  onRelaunch: (() => void) | null;   // launch again in the sandbox this run is already in
};

export function SetupPanel({ repo, run, events, error, report, rows, watched, section: tab, onSection: setTab, logStep, onLogStep, onPrepare, onRelaunch }: Props) {
  const missing = report?.missing.length ?? 0;
  // The shell is opened once and then kept, because unmounting it kills
  // the PTY on the other end — the server drops the process when the
  // stream goes, and there is no reconnect and no scrollback to restore.
  // So moving between these five sections must not take it down. Mounted
  // lazily for the same reason it is in CenterPanel: opening Setup is not
  // asking for a shell, and a first mount in a box of no size would ask
  // the sandbox for an 80x24 terminal it could never correct.
  const [shellOpened, setShellOpened] = useState(false);
  if (tab === "terminal" && !shellOpened) setShellOpened(true);
  const live = isSandboxLive(run);
  // Copy sits in this row rather than in a bar of its own inside Logs:
  // the bar under it said "Everything this run printed", which is the
  // name of the tab you just pressed. The lines are derived here because
  // the button is here, and only while Logs is the section showing.
  const cut = useMemo(() => (tab === "logs" && logStep ? runSteps(run, events, repo.fullName).find((s) => s.id === logStep) ?? null : null), [tab, logStep, run, events, repo.fullName]);
  const lines = useMemo(() => (tab === "logs" ? terminalLines(cut ? cut.events : events) : NO_LINES), [tab, cut, events]);
  // What the copy in the header would put on the clipboard, for whichever
  // of the two sections holds a list worth taking away whole. Derived
  // here because the button is here, and only for the section showing.
  const copyable = useMemo(
    () => (tab === "logs" ? lines.map((l) => l.text).join("\n") : tab === "events" ? actLines(rows) : ""),
    [tab, lines, rows],
  );

  return (
    <section aria-label="Setup" className="flex h-full min-h-0 flex-col">
      <div role="tablist" aria-label="Setup" className="flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto border-b px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => (
          <div key={t.key} className="flex shrink-0 items-center gap-0.5">
            {t.opens && <span aria-hidden className="mx-1.5 h-4 w-px bg-border" />}
            <button
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "h-6 shrink-0 rounded px-2 text-[12px]",
                tab === t.key ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {t.key === "env" && missing > 0 && <span className="ml-1 text-destructive">· {missing}</span>}
            </button>
          </div>
        ))}
        {(tab === "logs" || tab === "events") && <CopyAll text={copyable} what={tab === "logs" ? "what is showing" : "every act, in order"} />}
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {/* Kept in the tree once opened, hidden rather than unmounted, so
            a shell survives a look at the Environment. */}
        {shellOpened && (
          <div className={cn("absolute inset-0", tab === "terminal" ? "flex flex-col" : "hidden")}>
            {live ? <SandboxShell runId={run.id} /> : <Bare>{shellEmpty(run, error)}</Bare>}
          </div>
        )}
        {tab === "terminal" ? null
          : tab === "env" ? (
          <EnvPanel repo={repo} run={run} report={report} onPrepare={onPrepare} onRelaunch={onRelaunch} />
        ) : tab === "build" ? (
          // The lifecycle, open: the steps are what the section is for,
          // not context for something else, so there is no strip over
          // them summarising what they already say.
          run ? (
            <div className="h-full overflow-y-auto">
              <RunTimeline run={run} events={events} repoName={repo.fullName} open header={false} onViewLogs={(step) => { onLogStep(step); setTab("logs"); }} />
            </div>
          ) : (
            <Bare>{error ?? "Open the repository to prepare it in a sandbox."}</Bare>
          )
        ) : tab === "logs" ? (
          <Logs run={run} error={error} cut={cut} lines={lines} onStep={onLogStep} />
        ) : (
          <InterfaceHistory rows={rows} watched={watched} />
        )}
      </div>
    </section>
  );
}

const Bare = ({ children }: { children: React.ReactNode }) => (
  <p className="flex h-full items-center justify-center px-8 text-center text-[13px] leading-5 text-muted-foreground">{children}</p>
);

const shellEmpty = (run: SandboxRun | undefined, error: string | undefined) =>
  error ?? (run
    ? `${STATUS_LABEL[run.status].replace(/…$/, "")}. There is no sandbox to open a shell in. What this run printed is under Logs.`
    : "Open the repository to prepare it in a sandbox. A shell opens in it once it is up.");

// One array, so "no lines" is identity-equal to itself and the memo
// below does not hand back a new empty list every render.
const NO_LINES: TermLine[] = [];

// Copy what is on the screen — the run's output under Logs, cut to a
// step where Build sent somebody here about one; every act in order
// under Events. One button in the tab row rather than a bar inside each
// section, because a bar under a tab saying the name of the tab is a
// line of a narrow pane spent on nothing.
function CopyAll({ text, what }: { text: string; what: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => {});
    setTimeout(() => setCopied(false), 1400);
  };
  return (
    <button type="button" onClick={copy} disabled={!text} title={`Copy ${what}`} className="ml-auto flex h-6 shrink-0 items-center gap-1 rounded px-2 text-[12px] text-muted-foreground hover:text-foreground disabled:opacity-40">
      <Copy className="size-3" />{copied ? "Copied" : "Copy"}
    </button>
  );
}

// Everything the run printed, in order — and, when Build sent somebody
// here about one step, only what that step printed.
//
// The filter is the same slicing the step list is built from, so this is
// one log seen through a window rather than a second copy of it. There is
// a bar only while the window is on, saying what is being left out and
// how to take it off; the whole log needs no caption, because the tab it
// is under is the caption.
function Logs({ run, error, cut, lines, onStep }: {
  run: SandboxRun | undefined;
  error: string | undefined;
  cut: RunStep | null;
  lines: TermLine[];
  onStep: (step: StepId | null) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {cut && (
        <div className="flex h-8 shrink-0 items-center gap-2 border-b px-3 text-[12px]">
          <span className="min-w-0 truncate text-muted-foreground">Showing what <span className="text-foreground">{cut.title}</span> printed</span>
          <button type="button" onClick={() => onStep(null)} className="shrink-0 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
            Show the whole run
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1">
        <RunLog
          lines={lines}
          error={error}
          empty={cut ? "Nothing recorded for this step." : error ?? (run ? STATUS_LABEL[run.status] : "Open the repository to prepare it in a sandbox. What it prints appears here.")}
        />
      </div>
    </div>
  );
}
