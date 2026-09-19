"use client";

import { useEffect, useRef, type FormEvent } from "react";
import { ChevronDown, CornerDownLeft, Plus, SlidersHorizontal, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { SelectionText } from "@/lib/trace/selection";
import type { MessageContext } from "@/lib/bart/protocol";
import { BART_MODELS, bartModelLabel } from "@/lib/bart/models";
import type { BartSession, BartSurface } from "@/hooks/use-bart-session";

// Where a question is written. The draft and the model belong to the
// session, so moving between the Bart tab and the panel over the trace
// keeps both. What the question is about comes in as `context`: stable
// ids for the run, the repository, the selected moment and the open
// recording, never the words on the screen.
type Props = {
  session: BartSession;
  context: MessageContext;
  surface: BartSurface;                 // take focus only when this surface was asked for
  placeholder: string;
  selectionText: SelectionText | null;  // the moment named above the input
  recording: { id: string; name: string } | null;
  onClearSelection: () => void;
  compact?: boolean;
};

export function BartComposer({ session, context, surface, placeholder, selectionText, recording, onClearSelection, compact = false }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const hasDraft = session.draft.trim().length > 0;
  const { key, surface: asked } = session.focus;
  useEffect(() => { if (key && asked === surface) input.current?.focus(); }, [key, asked, surface]);

  const send = (e: FormEvent) => { e.preventDefault(); session.submit(context); };

  return (
    <form onSubmit={send} className={cn("flex shrink-0 flex-col rounded-xl border bg-background", compact ? "gap-2 px-2.5 pt-2.5 pb-2" : "gap-2.5 px-3 pt-3 pb-2.5")}>
      {(selectionText || recording) && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {selectionText ? (
            <>
              <span className="shrink-0">Looking at</span>
              <span className="min-w-0 truncate text-foreground">{selectionText.title} · {selectionText.at}</span>
            </>
          ) : <span className="shrink-0">In</span>}
          {recording && <span className="min-w-0 shrink truncate rounded border px-1 py-px text-[11px] text-foreground" title="Bart's trace questions read inside this recording">{recording.name}</span>}
          {selectionText && <button type="button" onClick={onClearSelection} aria-label="Clear the selection" className="ml-auto shrink-0 rounded p-0.5 hover:text-foreground"><X className="size-3" /></button>}
        </div>
      )}
      <Input
        ref={input}
        value={session.draft}
        onChange={(e) => session.setDraft(e.target.value)}
        placeholder={placeholder}
        className={cn("h-auto border-0 bg-transparent px-0.5 py-0 shadow-none focus-visible:ring-0", compact ? "text-[13px] md:text-[13px]" : "text-[15px] md:text-[15px]")}
      />
      <div className="flex items-center justify-between gap-2">
        {compact ? <span /> : (
          <Button type="button" variant="outline" size="icon" aria-label="Add context" className="size-[26px] rounded-md text-muted-foreground">
            <Plus className="size-3.5" />
          </Button>
        )}
        <div className="flex items-center gap-0.5">
          {!compact && (
            <Button type="button" variant="ghost" size="icon" aria-label="Settings" className="size-[26px] rounded-md text-muted-foreground">
              <SlidersHorizontal className="size-3.5" />
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className={cn("gap-1 rounded-md px-1.5 font-normal text-muted-foreground", compact ? "h-[22px] text-[12px]" : "h-[26px] text-[13px]")}>
                {bartModelLabel(session.model)}
                <ChevronDown className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="min-w-[160px]">
              <DropdownMenuRadioGroup value={session.model} onValueChange={session.pickModel}>
                {BART_MODELS.map((m) => <DropdownMenuRadioItem key={m.id} value={m.id} className="text-[13px]">{m.label}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {session.busy ? (
            <Button type="button" size="icon" variant="outline" aria-label="Stop" title="Stop" onClick={session.stop} className={cn("rounded-md", compact ? "size-[22px]" : "size-[26px]")}>
              <Square className="size-3 fill-current" />
            </Button>
          ) : (
            <Button type="submit" size="icon" variant={hasDraft ? "default" : "ghost"} aria-label="Send" className={cn("rounded-md", compact ? "size-[22px]" : "size-[26px]", !hasDraft && "text-muted-foreground/60")}>
              <CornerDownLeft className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
