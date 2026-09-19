"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { PANEL_WIDTH, useAnchor } from "@/components/annotate/anchor";
import { MAX_BODY } from "@/lib/annotations/target";
import { isAuthor, type Annotation } from "@/lib/annotations/model";
import { describeTarget } from "@/lib/trace/timeline";
import type { Resolution } from "@/lib/annotations/protocol";

// A saved note, opened from its marker: what was written, what it is on,
// and how sure the page is that it found that element again. Editing and
// deleting are the author's; everyone else reads it, and is told so
// rather than shown a control that would be refused.
export function AnnotationNote({ frame, note, resolution, viewerId, onEdit, onDelete, onAskBart, onClose }: {
  frame: RefObject<HTMLIFrameElement | null>;
  note: Annotation;
  resolution: Resolution | null;
  viewerId: string | null;
  onEdit: (body: string) => void;
  onDelete: () => void;
  onAskBart: () => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);
  const input = useRef<HTMLTextAreaElement>(null);
  const box = useAnchor(frame, resolution?.rect ?? null, true);
  const mine = isAuthor(note, viewerId);
  useEffect(() => { if (editing) input.current?.focus(); }, [editing]);
  useEffect(() => { setBody(note.body); }, [note.body]);
  if (typeof document === "undefined" || !box) return null;

  return createPortal(
    <>
      {box.outline && (
        <div aria-hidden className="pointer-events-none fixed z-40 rounded-[2px] border border-neutral-800/70 bg-neutral-900/5" style={{ left: box.outline.left, top: box.outline.top, width: box.outline.width, height: box.outline.height }} />
      )}
      <div
        role="dialog"
        aria-label="Annotation"
        className="fixed z-50 flex flex-col gap-2 rounded-lg border bg-background p-3 shadow-lg"
        style={{ left: box.left, top: box.top, width: PANEL_WIDTH }}
        onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); if (editing) setEditing(false); else onClose(); } }}
      >
        <p className="truncate text-[11px] text-muted-foreground" title={describeTarget(note.anchor.element)}>{describeTarget(note.anchor.element)}</p>
        {editing ? (
          <textarea
            ref={input}
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
            rows={3}
            className="min-h-[64px] w-full resize-y rounded-md border bg-background px-2 py-1.5 text-[13px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        ) : (
          <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed">{note.body}</p>
        )}
        <ResolutionLine resolution={resolution} note={note} />
        <div className="flex items-center gap-1">
          {editing ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => { setBody(note.body); setEditing(false); }} className="h-7 px-2 font-normal text-muted-foreground">Cancel</Button>
              <Button size="sm" onClick={() => { onEdit(body); setEditing(false); }} disabled={!body.trim() || body.trim() === note.body} className="h-7 px-2.5 font-normal">Save</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={onAskBart} className="h-7 px-2 font-normal text-muted-foreground">Ask Bart about this</Button>
              {mine && <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="h-7 px-2 font-normal text-muted-foreground">Edit</Button>}
              {mine && <Button variant="ghost" size="sm" onClick={onDelete} className="h-7 px-2 font-normal text-muted-foreground hover:text-destructive">Delete</Button>}
              <Button variant="ghost" size="sm" onClick={onClose} className="ml-auto h-7 px-2 font-normal text-muted-foreground">Close</Button>
            </>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}

// How the note found its element, said plainly. A note whose element
// changed is worth knowing about; so is one written against a different
// commit, which is the only version signal a run records.
export function ResolutionLine({ resolution, note }: { resolution: Resolution | null; note: Annotation }) {
  const state = resolution?.confidence ?? "unresolved";
  if (state === "resolved") return null;
  return (
    <p className="text-[11px] leading-snug text-muted-foreground">
      {state === "approximate"
        ? <>Matched the closest element{resolution?.changed === "text" ? ", but its text has changed since the note was written" : resolution?.matchedOn === "candidate" ? " by what it is and what it says; its selector no longer matches" : ""}.</>
        : <>Not found on this page{note.route ? <> — the note was written on <span className="font-mono">{note.route}</span></> : null}.</>}
      {note.commitSha && <> Written at commit <span className="font-mono">{note.commitSha.slice(0, 7)}</span>.</>}
    </p>
  );
}
