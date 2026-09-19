"use client";

import { SquareDashedMousePointer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isAuthor, type Annotation } from "@/lib/annotations/model";
import { describeTarget } from "@/lib/trace/timeline";
import { formatWhen } from "@/lib/trace/recording";
import { frameLine } from "@/lib/annotations/target";

// The notes written on this repository's interface, oldest first as they
// were made: what each says, what it is on, and where it was written.
// Opening one takes the person to the Live preview and to the element it
// is about; if the page cannot find that element it is said there, not
// guessed at here.
export function AnnotationsList({ annotations, viewerId, loaded, error, onOpen, onAskBart, onRemove, onDismissError }: {
  annotations: Annotation[];
  viewerId: string | null;
  loaded: boolean;
  error: string | null;
  onOpen: (id: string) => void;
  onAskBart: (id: string) => void;
  onRemove: (id: string) => void;
  onDismissError: () => void;
}) {
  if (error && !loaded) return <p role="alert" className="p-8 text-center text-[13px] text-destructive">{error}</p>;
  if (!loaded) return <p className="p-8 text-center text-[13px] text-muted-foreground">Loading annotations…</p>;
  if (!annotations.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <SquareDashedMousePointer className="size-5 text-muted-foreground/60" />
        <p className="text-[13px] text-muted-foreground">No annotations yet.</p>
        <p className="max-w-[360px] text-[12px] leading-relaxed text-muted-foreground/80">
          In the Live preview, choose Annotate and click an element of the running interface to write a note about it.
        </p>
      </div>
    );
  }
  return (
    <div className="mx-auto w-full max-w-[720px] px-6 py-4">
      {error && (
        <p role="alert" className="mb-3 flex items-start gap-2 text-[12px] text-destructive">
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" onClick={onDismissError} className="shrink-0 text-destructive/70 hover:text-destructive">Dismiss</button>
        </p>
      )}
      <ul className="flex flex-col divide-y">
        {annotations.map((a) => (
          <li key={a.id} className="flex flex-col gap-1 py-3">
            <button type="button" onClick={() => onOpen(a.id)} className="text-left text-[13px] leading-relaxed hover:underline">
              {a.body}
            </button>
            <p className="truncate text-[11px] text-muted-foreground">
              {describeTarget(a.anchor.element)}
              {a.route && <span className="text-muted-foreground/70"> · {a.route}</span>}
              {frameLine(a.anchor) && <span className="text-muted-foreground/70"> · embedded</span>}
              <span className="text-muted-foreground/70"> · {formatWhen(a.createdAt)}</span>
              {a.commitSha && <span className="font-mono text-muted-foreground/70"> · {a.commitSha.slice(0, 7)}</span>}
            </p>
            <div className="flex items-center gap-0.5">
              <Button variant="ghost" size="sm" onClick={() => onOpen(a.id)} className="h-6 px-1.5 font-normal text-muted-foreground">Show me</Button>
              <Button variant="ghost" size="sm" onClick={() => onAskBart(a.id)} className="h-6 px-1.5 font-normal text-muted-foreground">Ask Bart</Button>
              {isAuthor(a, viewerId) && <Button variant="ghost" size="sm" onClick={() => onRemove(a.id)} className="h-6 px-1.5 font-normal text-muted-foreground hover:text-destructive">Delete</Button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
