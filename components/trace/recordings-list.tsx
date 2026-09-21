"use client";

import { useState, type FormEvent } from "react";
import { Circle, History, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatElapsed, formatWhen, statsLine, type Recording, type RecordingOnRun, type RecordingStats } from "@/lib/trace/recording";
import { useElapsed } from "@/components/trace/record-control";

type Props = {
  recordings: Recording[];
  // The same repository's recordings, from runs that are not the one
  // open. They are read against their own run, so opening one goes
  // there first; nothing about them is merged into the list above.
  earlier: RecordingOnRun[];
  onOpenEarlier: (runId: string, recordingId: string) => void;
  stats: (rec: Recording) => RecordingStats;
  loaded: boolean;
  error: string | null;
  busy: boolean;
  onOpen: (id: string) => void;
  onStop: () => void;                    // the active recording, from here as well as the Live preview
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onDismissError: () => void;
};

// The run's recordings, newest last as they were made: a name to open,
// what each holds, when it was made; rename in place, delete with one
// confirmation in the row. Deleting removes the boundaries, never the
// trace under them.
export function RecordingsList({ recordings, earlier, stats, loaded, error, busy, onOpen, onStop, onRename, onRemove, onDismissError, onOpenEarlier }: Props) {
  // A failed rename or delete is about that one row: it says so above the
  // list and the list stays. Only a load that never arrived replaces it.
  if (error && !loaded) return <p role="alert" className="p-8 text-center text-[13px] text-destructive">{error}</p>;
  if (!loaded) return <p className="p-8 text-center text-[13px] text-muted-foreground">Loading recordings…</p>;
  const banner = error && (
    <p role="alert" className="mx-auto flex w-full max-w-[720px] items-start gap-2 px-6 pt-4 text-[12px] text-destructive">
      <span className="min-w-0 flex-1">{error}</span>
      <button type="button" onClick={onDismissError} aria-label="Dismiss" className="shrink-0 text-destructive/70 hover:text-destructive"><X className="size-3.5" /></button>
    </p>
  );
  if (!recordings.length && !earlier.length) {
    return (
      <div className="flex h-full flex-col">
        {banner}
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-8 text-center">
          <p className="text-[13px] font-medium">No recordings yet</p>
          <p className="max-w-[360px] text-[13px] leading-5 text-muted-foreground">Press Record in the Live preview to save a slice of this run&apos;s trace, and Stop when you are done. The full trace is kept either way.</p>
        </div>
      </div>
    );
  }
  return (
    <>
      {banner}
      <div className="mx-auto flex w-full max-w-[720px] flex-col px-6 py-5">
        {recordings.length ? (
          <ul aria-label="Recordings" className="flex flex-col gap-1">
            {recordings.map((rec) => <Row key={rec.id} rec={rec} stats={stats(rec)} busy={busy} onOpen={() => onOpen(rec.id)} onStop={onStop} onRename={(name) => onRename(rec.id, name)} onRemove={() => onRemove(rec.id)} />)}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-[13px] leading-5 text-muted-foreground">
            Nothing recorded on this run yet. Press Record in the Live preview to save a slice of its trace.
          </p>
        )}
        {!!earlier.length && <Earlier earlier={earlier} onOpen={onOpenEarlier} />}
      </div>
    </>
  );
}

// Recordings made on earlier runs of this repository.
//
// A recording is a window over one run's trace and can only be read
// against that run, so these are not openable in place: choosing one
// moves the tab to the run it was made on. They are listed at all
// because they were silently unreachable before — a relaunch made four
// recordings vanish with nothing anywhere saying they still existed.
function Earlier({ earlier, onOpen }: { earlier: RecordingOnRun[]; onOpen: (runId: string, recordingId: string) => void }) {
  const runs = [...new Set(earlier.map((e) => e.run.id))];
  return (
    <section className="mt-6">
      <h3 className="flex items-center gap-1.5 px-1 text-[12px] font-medium text-muted-foreground">
        <History className="size-3.5" />
        Earlier runs · {earlier.length} recording{earlier.length === 1 ? "" : "s"} on {runs.length} run{runs.length === 1 ? "" : "s"}
      </h3>
      <p className="mb-2 px-1 text-[12px] leading-5 text-muted-foreground/80">
        Each one is a window over the trace of the run it was made on. Opening one reads that run.
      </p>
      <ul aria-label="Recordings from earlier runs" className="flex flex-col gap-1">
        {earlier.map(({ recording, run }) => (
          <li key={recording.id}>
            <button
              type="button"
              onClick={() => onOpen(run.id, recording.id)}
              className="flex w-full items-baseline gap-2 rounded-lg border border-transparent px-4 py-2 text-left hover:border-border hover:bg-muted/40"
            >
              <span className="min-w-0 truncate text-[13px]">{recording.name}</span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
                · run of {formatWhen(run.startedAt)} · {run.status}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Row({ rec, stats, busy, onOpen, onStop, onRename, onRemove }: { rec: Recording; stats: RecordingStats; busy: boolean; onOpen: () => void; onStop: () => void; onRename: (name: string) => void; onRemove: () => void }) {
  const [mode, setMode] = useState<"view" | "rename" | "delete">("view");
  const [draft, setDraft] = useState(rec.name);
  const elapsed = useElapsed(rec.status === "recording" ? rec : null);
  const submit = (e: FormEvent) => { e.preventDefault(); if (draft.trim()) onRename(draft); setMode("view"); };
  return (
    <li className="group flex items-start gap-3 rounded-lg border px-4 py-3 hover:bg-muted/40">
      <div className="min-w-0 flex-1">
        {mode === "rename" ? (
          <form onSubmit={submit} className="flex items-center gap-2">
            <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { setDraft(rec.name); setMode("view"); } }} aria-label="Recording name" className="h-7 max-w-[320px] text-[13px]" />
            <Button type="submit" size="sm" className="h-7 px-2 font-normal">Save</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setDraft(rec.name); setMode("view"); }} className="h-7 px-2 font-normal text-muted-foreground">Cancel</Button>
          </form>
        ) : (
          <button type="button" onClick={onOpen} className="block max-w-full truncate text-left text-[14px] font-medium hover:underline">{rec.name}</button>
        )}
        <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
          {rec.status === "recording" ? (
            <><Circle className="size-2 animate-pulse fill-red-500 text-red-500" /> recording · {formatElapsed(elapsed)} · {stats.moments} moment{stats.moments === 1 ? "" : "s"} · {stats.calls} model call{stats.calls === 1 ? "" : "s"}</>
          ) : statsLine(stats)}
        </p>
        <p className="text-[12px] text-muted-foreground/80">{formatWhen(rec.startedAt)}</p>
        {mode === "delete" && (
          <p className="mt-2 flex items-center gap-2 text-[12px]">
            <span>Delete this recording? The trace under it stays.</span>
            <Button size="sm" variant="destructive" onClick={onRemove} className="h-6 px-2 font-normal">Delete</Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("view")} className="h-6 px-2 font-normal text-muted-foreground">Keep</Button>
          </p>
        )}
      </div>
      {mode === "view" && rec.status === "recording" && (
        <Button variant="outline" size="sm" disabled={busy} onClick={onStop} title="Stop recording; the run keeps going" className="h-7 shrink-0 px-2 font-normal">Stop</Button>
      )}
      {mode === "view" && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <Button variant="ghost" size="icon" aria-label={`Rename ${rec.name}`} title="Rename" onClick={() => { setDraft(rec.name); setMode("rename"); }} className="size-7 text-muted-foreground">
            <Pencil className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" aria-label={`Delete ${rec.name}`} title="Delete" onClick={() => setMode("delete")} className="size-7 text-muted-foreground">
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      )}
    </li>
  );
}
