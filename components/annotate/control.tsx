"use client";

import { SquareDashedMousePointer } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// The Annotate control, beside Record and Open trace in the Live preview
// header: off it is a word, on it says how to leave. It is shown only for
// a traced run, because the picker is the bridge's and a run without one
// has nothing to point with. How many notes there are is the Notes button
// beside it, which is the thing that opens them.
export function AnnotateControl({ active, onStart, onStop }: { active: boolean; onStart: () => void; onStop: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={active ? onStop : onStart}
      aria-pressed={active}
      title={active ? "Click an element in the preview to annotate it, or press Escape" : "Point at an element of the running interface and write a note about it"}
      className={cn("h-6 shrink-0 gap-1 px-2 font-normal", active ? "bg-neutral-100 text-foreground" : "text-muted-foreground")}
    >
      <SquareDashedMousePointer className="size-3" />
      {active ? "Annotating · Esc to exit" : "Annotate"}
    </Button>
  );
}
