"use client";

import { useState, type FormEvent } from "react";
import { Circle, Pencil, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { byRunThenMade, formatElapsed, formatWhen, hasReplay, recordingLength, type Recording, type RecordingOnRun } from "@/lib/trace/recording";
import { useElapsed } from "@/components/trace/record-control";
import type { SandboxRun } from "@/lib/sandbox";

type Props = {
  recordings: Recording[];       // made on the run being read
  run: SandboxRun | undefined;   // that run, for the group its recordings sit under
  // The same repository's recordings from other runs. They are read
  // against their own run, so opening one goes there first.
  earlier: RecordingOnRun[];
  onOpenEarlier: (runId: string, recordingId: string) => void;
  loaded: boolean;
  earlierLoaded: boolean;        // the earlier runs' list is fetched on its own

  error: string | null;
  busy: boolean;
  // The one last opened, so coming back from watching it shows where you
  // were. Not a second answer to "which recording is playing" — while one
  // plays this list is not on the screen.
  openId: string | null;
  onOpen: (id: string) => void;
  onStop: () => void;                    // the active recording, from here as well as the Live preview
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onDismissError: () => void;
};

// Every recording this repository has, under the run it was made on.
//
// It used to be one flat list, and every row ended in the same word:
// "failed". That word was the run's status, printed once per recording
// because each row carried its whole run with it — so a page of perfectly
// playable recordings read as a page of broken ones, and the thing they
// had in common, which is the session they were cut from, was the thing
// you had to read seven times to notice.
//
// A run is said once, at the head of its group, by when it was — and
// only that. Its status was there too, for a while, and it was the same
// word in a smaller place: a group of recordings headed "Failed" reads as
// a group of failed recordings. What became of a run belongs to the run,
// and is in Build, on the step it happened in.
//
// Under the date are its recordings, saying only what is true of a recording:
// what it is called and how long it lasted. A recording says something
// about its own state only when there is nothing to watch.
export function RecordingsList({ recordings, run, earlier, loaded, earlierLoaded, error, busy, openId, onOpen, onStop, onRename, onRemove, onDismissError, onOpenEarlier }: Props) {
  // A failed rename or delete is about that one row: it says so above the
  // list and the list stays. Only a load that never arrived replaces it.
  if (error && !loaded) return <p role="alert" className="p-8 text-center text-[13px] text-destructive">{error}</p>;
  // No word for the fetch. A list that has not arrived and a list with
  // nothing in it look the same to somebody waiting, and of the two
  // "Loading recordings…" is the one that is usually wrong: most runs
  // have no recordings and never will, so the sentence promised a list
  // that was never coming.
  //
  // Saying nothing is not the same as saying "No recordings yet", which
  // is an answer, and was being given before either fetch had returned
  // one — so a relaunch read as a loss until the earlier runs dropped in
  // underneath it. Nothing is asserted until both lists are in; until
  // then the groups below are simply empty, which is blank rather than
  // wrong.
  const banner = error && (
    <p role="alert" className="mx-auto flex w-full max-w-[720px] items-start gap-2 px-5 pt-4 text-[12px] text-destructive">
      <span className="min-w-0 flex-1">{error}</span>
      <button type="button" onClick={onDismissError} aria-label="Dismiss" className="shrink-0 text-destructive/70 hover:text-destructive"><X className="size-3.5" /></button>
    </p>
  );
  if (loaded && earlierLoaded && !recordings.length && !earlier.length) {
    return (
      <div className="flex h-full flex-col">
        {banner}
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-8 text-center">
          <p className="text-[13px] font-medium">No recordings yet</p>
          <p className="max-w-[340px] text-[13px] leading-5 text-muted-foreground">Record a run in the Live preview to replay its interface later. The full trace is kept either way.</p>
        </div>
      </div>
    );
  }
  // The open run's own recordings go through the same sort as the rest
  // rather than being pinned above them; they come out on top anyway,
  // because the run being read is usually the newest.
  const here: RecordingOnRun[] = run
    ? recordings.map((recording) => ({ recording, run: { id: run.id, status: run.status, startedAt: run.startedAt, commit: null } }))
    : [];
  const groups = byRun([...here, ...earlier].sort(byRunThenMade));
  const openRunId = run?.id ?? null;
  return (
    <>
      {banner}
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-5 py-4">
        {groups.map(({ run: on, made }) => (
          <section key={on.id} aria-label={`Run of ${formatWhen(on.startedAt)}`} className="flex flex-col">
            <h3 className="flex items-baseline gap-2 px-2 pb-1 text-[12px]">
              <span className="min-w-0 truncate text-muted-foreground">{formatWhen(on.startedAt)}</span>
              <span className="ml-auto shrink-0 tabular-nums text-[11px] text-muted-foreground/60">{made.length}</span>
            </h3>
            <ul className="flex flex-col gap-0.5">
              {made.map((recording) => (
                <Row
                  key={recording.id}
                  rec={recording}
                  busy={busy}
                  here={on.id === openRunId}
                  chosen={recording.id === openId}
                  onOpen={() => (on.id === openRunId ? onOpen(recording.id) : onOpenEarlier(on.id, recording.id))}
                  onStop={onStop}
                  onRename={(name) => onRename(recording.id, name)}
                  onRemove={() => onRemove(recording.id)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

// The sorted list cut where the run changes. The sort already puts a
// run's recordings together and in the order they were made, so this
// walks it once rather than building a map and sorting the keys back into
// the order they were already in.
function byRun(all: RecordingOnRun[]) {
  const groups: { run: RecordingOnRun["run"]; made: Recording[] }[] = [];
  for (const { recording, run } of all) {
    const last = groups[groups.length - 1];
    if (last && last.run.id === run.id) last.made.push(recording);
    else groups.push({ run, made: [recording] });
  }
  return groups;
}

// Renaming and deleting are only offered for a recording of the run being
// read: they are the open run's own actions, and reaching into another
// run's recording from a list would edit something the workspace is not
// currently showing. Going there first is one click, and then it is here.
function Row({ rec, busy, here, chosen, onOpen, onStop, onRename, onRemove }: {
  rec: Recording;
  busy: boolean;
  here: boolean;
  chosen: boolean;
  onOpen: () => void;
  onStop: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
}) {
  const [mode, setMode] = useState<"view" | "rename" | "delete">("view");
  const [draft, setDraft] = useState(rec.name);
  const live = rec.status === "recording";
  const elapsed = useElapsed(live ? rec : null);
  const submit = (e: FormEvent) => { e.preventDefault(); if (draft.trim()) onRename(draft); setMode("view"); };

  if (mode === "rename") {
    return (
      <li>
        <form onSubmit={submit} className="flex items-center gap-2 px-2 py-1.5">
          <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { setDraft(rec.name); setMode("view"); } }} aria-label="Recording name" className="h-7 max-w-[320px] text-[13px]" />
          <Button type="submit" size="sm" className="h-7 px-2 font-normal">Save</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => { setDraft(rec.name); setMode("view"); }} className="h-7 px-2 font-normal text-muted-foreground">Cancel</Button>
        </form>
      </li>
    );
  }
  if (mode === "delete") {
    return (
      <li>
        <p className="flex items-center gap-2 px-2 py-1.5 text-[12px]">
          <span className="min-w-0 flex-1 truncate">Delete “{rec.name}”? The trace under it stays.</span>
          <Button size="sm" variant="destructive" onClick={onRemove} className="h-6 shrink-0 px-2 font-normal">Delete</Button>
          <Button size="sm" variant="ghost" onClick={() => setMode("view")} className="h-6 shrink-0 px-2 font-normal text-muted-foreground">Keep</Button>
        </p>
      </li>
    );
  }
  const length = recordingLength(rec);
  const gone = !hasReplay(rec);
  return (
    <li className="group relative">
      <button
        type="button"
        onClick={onOpen}
        aria-current={chosen || undefined}
        className={cn(
          "flex w-full items-baseline gap-2 rounded-md border px-2 py-1.5 text-left",
          chosen ? "border-border bg-muted/60" : "border-transparent hover:border-border hover:bg-muted/40",
        )}
      >
        {live && <Circle className="size-2 shrink-0 self-center animate-pulse fill-red-500 text-red-500" />}
        <span className="min-w-0 flex-1 truncate text-[13px]">{rec.name}</span>
        {/* Only said when there is nothing to watch. A recording of a run
            that failed is not itself a failure, and the row used to
            report the run's status as if it were. */}
        {gone && <span className="shrink-0 text-[11px] text-muted-foreground">No replay saved</span>}
        <span className="shrink-0 tabular-nums text-[12px] text-muted-foreground">
          {live ? formatElapsed(elapsed) : length !== null ? formatElapsed(length) : ""}
        </span>
      </button>
      <div className="absolute inset-y-0 right-1.5 flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        {live && (
          <Button variant="outline" size="sm" disabled={busy} onClick={onStop} title="Stop recording; the run keeps going" className="h-6 px-2 font-normal">Stop</Button>
        )}
        {here && (
          <>
            <Button variant="ghost" size="icon" aria-label={`Rename ${rec.name}`} title="Rename" onClick={() => { setDraft(rec.name); setMode("rename"); }} className="size-7 bg-background text-muted-foreground">
              <Pencil className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon" aria-label={`Delete ${rec.name}`} title="Delete" onClick={() => setMode("delete")} className="size-7 bg-background text-muted-foreground">
              <Trash2 className="size-3.5" />
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
