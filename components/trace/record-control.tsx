"use client";

import { useEffect, useState } from "react";
import { Circle, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { formatElapsed, statsLine, type Recording, type RecordingStats } from "@/lib/trace/recording";

// The Record control in the Live preview's header, kept quiet: an
// outlined dot among the other ghost buttons when idle, and the elapsed
// time with a stop square while one is open. Neither touches the run: the
// trace is captured regardless; a recording only marks where a slice of
// it starts and stops.
export function RecordButton({ active, busy, onStart, onStop }: { active: Recording | null; busy: boolean; onStart: () => void; onStop: () => void }) {
  const elapsed = useElapsed(active);
  if (!active) {
    return (
      <Button variant="ghost" size="sm" onClick={onStart} disabled={busy} aria-label="Record" title="Save a slice of this run's trace from now until Stop" className="h-6 gap-1.5 px-2 font-normal text-muted-foreground">
        <Circle className="size-2.5" /> Record
      </Button>
    );
  }
  return (
    <Button variant="ghost" size="sm" onClick={onStop} disabled={busy} aria-label="Stop recording" title="Stop recording; the run keeps going" className="h-6 gap-1.5 px-2 font-normal text-muted-foreground hover:text-foreground">
      <Circle className="size-2.5 animate-pulse fill-red-500 text-red-500" />
      <span className="font-mono tabular-nums">{formatElapsed(elapsed)}</span>
      <Square className="size-2.5 fill-current text-muted-foreground/70" />
    </Button>
  );
}

// After Stop: one line with what was saved and a way to open it. The
// preview goes on underneath.
export function RecordingSaved({ recording, stats, onOpen, onDismiss, className }: { recording: Recording; stats: RecordingStats; onOpen: () => void; onDismiss: () => void; className?: string }) {
  return (
    <div role="status" className={cn("flex h-8 shrink-0 items-center gap-2 border-b bg-muted/40 px-3 text-xs", className)}>
      <Circle className="size-2 fill-red-500 text-red-500" />
      <span className="font-medium">Recording saved</span>
      <span className="min-w-0 truncate text-muted-foreground">{recording.name} · {statsLine(stats)}</span>
      <Button variant="outline" size="sm" onClick={onOpen} className="ml-auto h-6 shrink-0 px-2 font-normal">Open recording</Button>
      <Button variant="ghost" size="icon" aria-label="Dismiss" onClick={onDismiss} className="size-6 shrink-0 text-muted-foreground">
        <X className="size-3" />
      </Button>
    </div>
  );
}

// Milliseconds since the recording started, ticking once a second.
export function useElapsed(active: Recording | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return active ? Math.max(0, now - Date.parse(active.startedAt)) : 0;
}
