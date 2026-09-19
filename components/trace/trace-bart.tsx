"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Loader2, MessageSquare, PanelRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Repo } from "@/lib/repos";
import type { SelectionText } from "@/lib/trace/selection";
import type { MessageContext, Ref } from "@/lib/bart/protocol";
import type { BartSession } from "@/hooks/use-bart-session";
import { BartConversation } from "@/components/bart/conversation";
import { BartComposer } from "@/components/bart/composer";

// Bart over the trace canvas: the same conversation as the right panel,
// in the corner, for asking about the moment under the cursor without
// leaving the evidence. It floats out of the flow, so opening, closing
// and resizing it neither resize the canvas nor move the camera; the
// canvas keeps every pixel it had.
type Props = {
  session: BartSession;
  context: MessageContext;              // the run, repository, selected moment and open recording
  repo: Repo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placeholder: string;                  // what the selected moment offers to be asked
  selectionText: SelectionText | null;
  recording: { id: string; name: string } | null;
  onClearSelection: () => void;
  onOpenRef: (ref: Ref) => void;
  labelRef: (ref: Ref) => string;
  onOpenPanel: () => void;              // the whole conversation, in the right panel
};

const MIN = { w: 300, h: 240 };
const DEFAULT = { w: 380, h: 420 };
const STEP = 32;                        // one arrow key on the resize grip
const SIZE_KEY = "engelbart:bart:window";

export function TraceBart({ session, context, repo, open, onOpenChange, placeholder, selectionText, recording, onClearSelection, onOpenRef, labelRef, onOpenPanel }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const empty = session.messages.length === 0 && !session.pending;
  const [size, setSize] = useState(DEFAULT);
  const sized = useRef(DEFAULT);        // the size just set, a render ahead of the state
  const drag = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  // Dragged from the top-left corner, because the window is pinned to the
  // bottom-right: pulling away from the corner makes it bigger. It never
  // grows past the canvas it sits on.
  // A canvas that has not been laid out yet measures nothing, and its box
  // would clamp a remembered size down to the minimum; when it cannot
  // hold the smallest window the bound is left to `max-w-full` instead.
  const clamp = (want: { w: number; h: number }, box: DOMRect | null) => {
    const maxW = box && box.width - 24 > MIN.w ? box.width - 24 : 2000;
    const maxH = box && box.height - 24 > MIN.h ? box.height - 24 : 2000;
    return { w: Math.min(Math.max(want.w, MIN.w), maxW), h: Math.min(Math.max(want.h, MIN.h), maxH) };
  };
  const resizeTo = (want: { w: number; h: number }) => {
    const next = clamp(want, wrap.current?.getBoundingClientRect() ?? null);
    sized.current = next;
    setSize(next);
    return next;
  };

  const remember = (next: { w: number; h: number }) => {
    try { window.localStorage.setItem(SIZE_KEY, JSON.stringify(next)); } catch { /* not stored */ }
  };

  // The size the window was last left at, per browser. It is a
  // convenience, not state anything depends on: a blocked or empty store
  // just means the default size.
  useEffect(() => {
    let saved: unknown = null;
    try { saved = JSON.parse(window.localStorage.getItem(SIZE_KEY) ?? "null"); } catch { /* no stored size */ }
    if (!saved || typeof saved !== "object" || !("w" in saved) || !("h" in saved)) return;
    // A frame later, so the canvas has a size to be measured against.
    const id = requestAnimationFrame(() => resizeTo(saved as { w: number; h: number }));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grab = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h };
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const from = drag.current;
    if (!from) return;
    resizeTo({ w: from.w + (from.x - e.clientX), h: from.h + (from.y - e.clientY) });
  };
  const drop = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    remember(sized.current);
  };
  const nudge = (e: KeyboardEvent<HTMLDivElement>) => {
    const by = { ArrowLeft: { w: STEP, h: 0 }, ArrowRight: { w: -STEP, h: 0 }, ArrowUp: { w: 0, h: STEP }, ArrowDown: { w: 0, h: -STEP } }[e.key];
    if (!by) return;
    e.preventDefault();
    remember(resizeTo({ w: size.w + by.w, h: size.h + by.h }));
  };

  return (
    <div ref={wrap} className="pointer-events-none absolute inset-0 z-20 flex items-end justify-end p-3">
      {open ? (
        <section
          aria-label="Bart"
          style={{ width: size.w, height: size.h }}
          className="pointer-events-auto relative flex max-h-full max-w-full flex-col overflow-hidden rounded-xl border bg-[#f6f6f6] shadow-lg"
        >
          <div
            role="separator"
            aria-label="Resize Bart"
            aria-orientation="vertical"
            tabIndex={0}
            onPointerDown={grab}
            onPointerMove={move}
            onPointerUp={drop}
            onPointerCancel={drop}
            onKeyDown={nudge}
            title="Drag to resize"
            className="absolute top-0 left-0 z-10 size-5 cursor-nwse-resize touch-none rounded-tl-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
          >
            <span aria-hidden className="absolute top-[7px] left-[7px] size-2 rounded-tl-[3px] border-t-2 border-l-2 border-muted-foreground/40" />
          </div>
          <header className="flex h-9 shrink-0 items-center gap-0.5 border-b pr-1.5 pl-6 text-[13px]">
            <h2 className="mr-auto font-semibold">Bart</h2>
            {/* The same Clear the panel has, over the same conversation:
                clearing here leaves the panel on a new thread too. */}
            {!empty && (
              <Button variant="ghost" size="sm" onClick={() => void session.reset()} title="Start a new conversation" className="h-7 px-1.5 text-xs font-normal text-muted-foreground/70 hover:text-muted-foreground">
                Clear
              </Button>
            )}
            <Button variant="ghost" size="icon" aria-label="Open Bart in the side panel" title="Open Bart in the side panel" onClick={onOpenPanel} className="size-7 text-muted-foreground">
              <PanelRight className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Close Bart" title="Close" onClick={() => onOpenChange(false)} className="size-7 text-muted-foreground">
              <X className="size-4" />
            </Button>
          </header>
          <BartConversation session={session} repo={repo} labelRef={labelRef} onOpenRef={onOpenRef} compact />
          <div className="shrink-0 px-2.5 pb-2.5">
            <BartComposer
              session={session}
              context={context}
              surface="mini"
              placeholder={placeholder}
              selectionText={selectionText}
              recording={recording}
              onClearSelection={onClearSelection}
              compact
            />
          </div>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          className="pointer-events-auto flex max-w-[280px] items-center gap-1.5 rounded-full border bg-background/95 py-1.5 pr-3 pl-2.5 text-[13px] text-muted-foreground shadow-sm backdrop-blur hover:text-foreground"
        >
          {session.busy ? <Loader2 className="size-3.5 shrink-0 animate-spin" /> : <MessageSquare className="size-3.5 shrink-0" />}
          <span className="min-w-0 truncate">{placeholder}</span>
        </button>
      )}
    </div>
  );
}
