"use client";

import { useLayoutEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Repo } from "@/lib/repos";
import type { Ref } from "@/lib/bart/protocol";
import type { BartSession } from "@/hooks/use-bart-session";
import { BartMarkdown } from "@/components/bart-markdown";
import { ToolActivity } from "@/components/bart/tool-activity";
import { BartMark } from "@/components/bart/mark";

// The conversation itself, without any chrome: what was said, what is
// being said now, and what Bart is reading to say it. The Bart tab and
// the small panel over the trace canvas both render this, over the same
// session, so there is one conversation however you came to it.
type Props = {
  session: BartSession;
  repo: Repo | null;
  labelRef: (ref: Ref) => string;
  onOpenRef: (ref: Ref) => void;
  compact?: boolean;          // over the canvas: no illustration, tighter, smaller type
};

export function BartConversation({ session, repo, labelRef, onOpenRef, compact = false }: Props) {
  const bottom = useRef<HTMLDivElement>(null);
  // Before the paint, not after it. As a passive effect the commit that
  // first draws a long saved thread was free to reach the screen at the
  // top of the conversation and jump to the latest answer a frame later.
  useLayoutEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [session.messages.length, session.pending?.text.length, session.pending?.tools.length]);
  // Three states, not two. There is nothing to show either because the
  // thread has not come back yet or because there is genuinely nothing
  // in it, and only the second of them is an empty state: the first is a
  // wait. Drawn as one, opening Bart on a saved conversation put the
  // mark and "What are you trying to understand?" on the screen for as
  // long as the round trip took, and then replaced them with the
  // conversation that had been there all along.
  const idle = session.messages.length === 0 && !session.pending;
  const loading = idle && !session.loaded;
  const empty = idle && session.loaded;
  return (
    // The viewport's child is stretched only to centre the empty state.
    // With messages in it that height would cap the content box, so the
    // wheel finds nothing to scroll in a short window.
    <ScrollArea className={cn("min-h-0 flex-1", (empty || loading) && "[&>[data-slot=scroll-area-viewport]>div]:h-full")}>
      {loading ? (
        // The wait, and nothing else on the screen to be taken back.
        <div className={cn("flex h-full min-h-full flex-col items-center justify-center text-center", compact ? "px-4 py-6" : "px-3 py-6")}>
          <p className="text-xs text-muted-foreground/70">Loading the conversation…</p>
        </div>
      ) : empty ? (
        compact ? (
          <div className="flex h-full min-h-full flex-col items-center justify-center px-4 py-6 text-center">
            <p className="max-w-[260px] text-[13px] leading-relaxed text-muted-foreground">
              Ask about the moment you have selected, the model call behind it, or anything else in this run.
            </p>
          </div>
        ) : (
          // Two spacers rather than `justify-center`: the block sits one
          // part down and one and a half parts up, so it lands a little
          // above the middle of the column however tall the column is —
          // deliberately placed rather than floating in the middle of a
          // tall empty rectangle — and the spacers give up their room
          // before the content does, so a short panel never scrolls the
          // mark off the top. It was 1:2 for a while, which is above the
          // middle by an eighth of the column: further than "a little".
          //
          // The lower spacer also starts 40px tall, which lifts the block
          // a further 16px whatever the height. The ratio alone centres it
          // in the column, and the column is not what the eye measures
          // against: the composer sits under it, so the empty area the
          // block is placed in stops above the panel's floor. As a basis
          // rather than padding because it is still a spacer — it shrinks
          // away first in a short panel, where padding would not.
          <div className="flex h-full min-h-full flex-col items-center px-3 py-6 text-center">
            <span aria-hidden className="min-h-0 flex-1 shrink" />
            {/* The mark itself, on the panel, with no tile under it. It
                was the same drawing inside an 88px dark rounded square,
                which is what you get from using the upload as an image —
                its ground is baked in — and a black tile on a #f6f6f6
                panel reads as a logo that arrived from somewhere else.
                Drawn instead, from the same geometry: components/bart/mark.tsx. */}
            <BartMark className="mb-[18px] h-[82px] w-auto" />
            <p className="mb-2.5 text-[15px] leading-6 font-semibold">What are you trying to understand?</p>
            {/* A hard space in "related work" below, so the pair cannot be
                split across the break. Left to itself the greedy wrap put
                "related" at the end of the first line and "work," at the
                start of the second, which reads as two things and leaves
                the lines 281 and 196 wide. Bound, the break falls after
                "artifact," and they come out 235 and 242 — and it holds at
                any width, where a tuned max-width would only hold at this
                one font. */}
            <p className="max-w-[300px] text-[13px] leading-relaxed text-muted-foreground">
              {repo
                ? <>Ask about the paper, repo, live artifact, related&nbsp;work, or your research direction.</>
                : <>Ask about your papers, code, data,<br />results, or what to try next.</>}
            </p>
            <span aria-hidden className="min-h-0 shrink flex-[1.5_1_2.5rem]" />
          </div>
        )
      ) : (
        <div className={cn("flex flex-col", compact ? "gap-3 px-3 pt-3 pb-2" : "gap-4 pt-1 pb-3")}>
          {session.messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className={cn("max-w-[85%] self-end whitespace-pre-wrap rounded-xl bg-background px-3 py-2 leading-relaxed", compact ? "text-[13px]" : "text-[14px]")}>{m.content}</div>
            ) : (
              <div key={m.id} className="min-w-0 self-stretch"><BartMarkdown source={m.content} label={labelRef} onRef={onOpenRef} /></div>
            ),
          )}
          {session.pending && (
            <div className="min-w-0 self-stretch">
              {session.pending.tools.length > 0 && (
                <ul className="mb-2 flex flex-col gap-1">
                  {session.pending.tools.map((t) => <ToolActivity key={t.id} tool={t} />)}
                </ul>
              )}
              {session.pending.text
                ? <BartMarkdown source={session.pending.text} label={labelRef} onRef={onOpenRef} />
                : session.pending.tools.length === 0 && <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />Thinking…</p>}
            </div>
          )}
          {session.error && <p className="text-[13px] text-destructive">{session.error}</p>}
          <div ref={bottom} />
        </div>
      )}
    </ScrollArea>
  );
}
