"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { MAX_BODY } from "@/lib/annotations/target";
import type { Picked } from "@/hooks/use-picker";
import { PANEL_WIDTH, useAnchor } from "@/components/annotate/anchor";

// The note itself is written here, in the workspace, and never in the
// page: the page is an imported application on the sandbox's own origin,
// and its gateway's events endpoint is open to anyone who has the preview
// URL. A researcher's words go from this form to a server action, over
// the signed-in session, and nowhere else.
//
// It floats over the preview rather than inside it, anchored under the
// element that was picked. That keeps it beside what it is about without
// putting anything in the preview's tree: wrapping that iframe in one
// more element would remount it and reload the running application.
export function AnnotationComposer({ frame, picked, busy, error, onSave, onCancel }: {
  frame: RefObject<HTMLIFrameElement | null>;
  picked: Picked;
  busy: boolean;
  error: string | null;
  onSave: (body: string) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const box = useAnchor(frame, picked.rect, true);
  useEffect(() => { input.current?.focus(); }, []);
  if (typeof document === "undefined" || !box) return null;

  const save = () => { if (body.trim() && !busy) onSave(body); };
  return createPortal(
    <>
      {/* What the note is about, still marked while it is written. The
          preview's own outline went away with the picker. */}
      {box.outline && (
        <div aria-hidden className="pointer-events-none fixed z-40 rounded-[2px] border border-neutral-800/70 bg-neutral-900/5" style={{ left: box.outline.left, top: box.outline.top, width: box.outline.width, height: box.outline.height }} />
      )}
      <div
        role="dialog"
        aria-label="Write an annotation"
        className="fixed z-50 flex flex-col gap-2 rounded-lg border bg-background p-3 shadow-lg"
        style={{ left: box.left, top: box.top, width: PANEL_WIDTH }}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.stopPropagation(); onCancel(); }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
        }}
      >
        <p className="truncate text-[11px] text-muted-foreground" title={picked.label}>
          {picked.label}
          {picked.frameLabel && <span className="text-muted-foreground/70"> · in {picked.frameLabel}</span>}
        </p>
        <textarea
          ref={input}
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
          rows={3}
          placeholder="What did you notice here?"
          className="min-h-[64px] w-full resize-y rounded-md border bg-background px-2 py-1.5 text-[13px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {error && <p role="alert" className="text-[11px] text-destructive">{error}</p>}
        {/* justify-end, because the line that used to sit here carried
            `mr-auto` and that is what held the buttons to the right. */}
        <div className="flex items-center justify-end gap-1.5">
          <Button variant="ghost" size="sm" onClick={onCancel} className="h-7 px-2 font-normal text-muted-foreground">Cancel</Button>
          <Button size="sm" onClick={save} disabled={!body.trim() || busy} className="h-7 px-2.5 font-normal">{busy ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </>,
    document.body,
  );
}
