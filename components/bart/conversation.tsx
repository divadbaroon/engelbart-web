"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Repo } from "@/lib/repos";
import type { Ref } from "@/lib/bart/protocol";
import type { BartSession } from "@/hooks/use-bart-session";
import { BartMarkdown } from "@/components/bart-markdown";
import { ToolActivity } from "@/components/bart/tool-activity";

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
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [session.messages.length, session.pending?.text.length, session.pending?.tools.length]);
  const empty = session.messages.length === 0 && !session.pending;
  return (
    // The viewport's child is stretched only to centre the empty state.
    // With messages in it that height would cap the content box, so the
    // wheel finds nothing to scroll in a short window.
    <ScrollArea className={cn("min-h-0 flex-1", empty && "[&>[data-slot=scroll-area-viewport]>div]:h-full")}>
      {empty ? (
        compact ? (
          <div className="flex h-full min-h-full flex-col items-center justify-center px-4 py-6 text-center">
            <p className="max-w-[260px] text-[13px] leading-relaxed text-muted-foreground">
              Ask about the moment you have selected, the model call behind it, or anything else in this run.
            </p>
            {!session.loaded && <p className="mt-3 text-xs text-muted-foreground/70">Loading the conversation…</p>}
          </div>
        ) : (
          <div className="flex h-full min-h-full flex-col items-center justify-center px-3 py-6 text-center">
            <Image src="/bart-empty-state.svg" alt="" width={132} height={112} priority className="mb-6" />
            <p className="mb-2 text-[15px] font-semibold">What are you working through?</p>
            <p className="max-w-[300px] text-[13px] leading-relaxed text-muted-foreground">
              {repo
                ? <>Ask what happened in the run, what a model call was sent, or where the code does something.</>
                : <>Ask about your papers, code, data,<br />results, or what to try next.</>}
            </p>
            {!session.loaded && <p className="mt-4 text-xs text-muted-foreground/70">Loading the conversation…</p>}
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
