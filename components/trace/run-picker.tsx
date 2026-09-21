"use client";

import { Check, ChevronDown, Circle, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { RunStatus, SandboxRun } from "@/lib/sandbox";
import { formatWhen } from "@/lib/trace/recording";

type Props = {
  runs: SandboxRun[];              // newest first, the live one included
  run: SandboxRun | undefined;     // the one being read
  live: SandboxRun | undefined;    // the newest, which is what the tab opens on
  recordings: (runId: string) => number;
  onView: (runId: string | null) => void;
};

// Which run of this repository the trace is being read from.
//
// There has only ever been one — the newest — and everything belonging to
// the ones before it went quiet: the trace, the recordings, the activity.
// So this names them. A run is said by when it started and what became of
// it, because those are the two things somebody looking for a session
// remembers, and by how many recordings were made on it, because that is
// usually what they are looking for.
//
// Only the trace follows this choice. The Live preview, the terminal and
// the Record button stay on the run that is actually running, which is
// the one they can do anything about.
export function RunPicker({ runs, run, live, recordings, onView }: Props) {
  if (runs.length < 2 || !run) return null;
  const past = run.id !== live?.id;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          title="Read the trace of another run of this repository"
          className={`h-7 min-w-0 gap-1 px-2 font-normal ${past ? "text-foreground" : "text-muted-foreground"}`}
        >
          {past ? <History className="size-3.5 shrink-0" /> : <Dot status={run.status} />}
          <span className="min-w-0 truncate">{past ? formatWhen(run.startedAt) : "Latest run"}</span>
          <ChevronDown className="size-3 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[60vh] w-[320px] overflow-y-auto">
        <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
          Runs of this repository. Only the trace changes; the preview and the terminal stay on the latest.
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {runs.map((r) => {
          const n = recordings(r.id);
          return (
            <DropdownMenuItem key={r.id} onSelect={() => onView(r.id === live?.id ? null : r.id)} className="gap-2 text-[13px]">
              <Check className={`size-3.5 shrink-0 ${r.id === run.id ? "opacity-100" : "opacity-0"}`} />
              <span className="min-w-0 flex-1 truncate">
                {formatWhen(r.startedAt)}
                {r.id === live?.id && <span className="text-muted-foreground"> · latest</span>}
              </span>
              {!!n && <span className="shrink-0 text-[11px] text-muted-foreground">{n} rec</span>}
              <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground"><Dot status={r.status} />{r.status}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// A run that is still going says so; one that stopped says how it
// stopped, because "failed" and "killed" are different answers to "why is
// there nothing in this one".
const GOING: RunStatus[] = ["queued", "creating", "cloning", "cloned", "launching", "running", "usable"];
function Dot({ status }: { status: RunStatus }) {
  const going = GOING.includes(status);
  const bad = status === "failed" || status === "no_service";
  return <Circle className={`size-2 shrink-0 ${going ? "animate-pulse fill-emerald-500 text-emerald-500" : bad ? "fill-destructive text-destructive" : "fill-muted-foreground/50 text-muted-foreground/50"}`} />;
}

// The band under the header while an earlier run is being read. The
// canvas of a finished run looks exactly like the canvas of a live one
// that has gone quiet, so this is the only thing standing between reading
// an old session and thinking the current one stopped recording.
export function PastRunBanner({ run, onLatest }: { run: SandboxRun; onLatest: () => void }) {
  return (
    <p className="flex shrink-0 items-center gap-2 border-b bg-muted/40 px-[22px] py-1.5 text-[12px] text-muted-foreground">
      <History className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        Reading the run from {formatWhen(run.startedAt)} · {run.status}. Nothing here is live.
      </span>
      <Button variant="ghost" size="sm" onClick={onLatest} className="h-6 shrink-0 px-2 font-normal">Latest run</Button>
    </p>
  );
}
