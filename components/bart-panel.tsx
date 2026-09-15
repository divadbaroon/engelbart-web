"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { ChevronDown, CornerDownLeft, PanelRight, Plus, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

type Message = { id: string; role: "user" | "assistant"; content: string };
type BartPanelProps = { open: boolean; onToggle: () => void };

const MODELS = ["Sonnet 4.5 · Medium", "Opus 4.1 · High", "Haiku 4.5 · Fast"];

export function BartPanel({ open, onToggle }: BartPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [model, setModel] = useState(MODELS[0]);
  const hasDraft = draft.trim().length > 0;

  function send(e: FormEvent) {
    e.preventDefault();
    if (!hasDraft) return;
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", content: draft.trim() }]);
    setDraft("");
  }

  if (!open) {
    return (
      <aside className="flex h-full flex-col items-center bg-[#f6f6f6] pt-4">
        <Button variant="ghost" size="icon" aria-label="Open Bart" onClick={onToggle} className="size-7 text-muted-foreground">
          <PanelRight className="size-4" />
        </Button>
      </aside>
    );
  }

  return (
    <aside className="relative flex h-full min-w-0 flex-col bg-[#f6f6f6] px-5 pb-4">
      <div className="absolute top-4 left-5 right-5 z-10 flex h-7 items-center justify-between">
        <h2 className="text-[13px] font-semibold">Bart</h2>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMessages([])}
              className="h-7 px-1.5 text-xs font-normal text-muted-foreground/70 hover:text-muted-foreground"
            >
              Clear
            </Button>
          )}
          <Button variant="ghost" size="icon" aria-label="Close Bart" title="Close Bart" onClick={onToggle} className="size-7 text-muted-foreground">
            <PanelRight className="size-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]>div]:h-full">
        {messages.length === 0 ? (
          <div className="flex h-full min-h-full flex-col items-center justify-center px-3 pt-14 pb-4 text-center">
            <Image src="/bart-empty-state.svg" alt="" width={132} height={112} priority className="mb-6" />
            <p className="mb-2 text-[15px] font-semibold">What are you working through?</p>
            <p className="max-w-[280px] text-[13px] leading-relaxed text-muted-foreground">
              Ask about your papers, code, data,
              <br />
              results, or what to try next.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 pt-[60px] pb-4">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "max-w-[80%] whitespace-pre-wrap text-[15px] leading-relaxed",
                  m.role === "user" ? "self-end rounded-xl bg-background px-3 py-2" : "self-start",
                )}
              >
                {m.content}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <form onSubmit={send} className="flex shrink-0 flex-col gap-2.5 rounded-xl border bg-background px-3 pt-3 pb-2.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message Bart..."
          className="h-auto border-0 bg-transparent px-0.5 py-0 text-[15px] shadow-none focus-visible:ring-0 md:text-[15px]"
        />
        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="outline" size="icon" aria-label="Add context" className="size-[26px] rounded-md text-muted-foreground">
            <Plus className="size-3.5" />
          </Button>
          <div className="flex items-center gap-0.5">
            <Button type="button" variant="ghost" size="icon" aria-label="Settings" className="size-[26px] rounded-md text-muted-foreground">
              <SlidersHorizontal className="size-3.5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="h-[26px] gap-1 rounded-md px-1.5 text-[13px] font-normal text-muted-foreground">
                  {model}
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="min-w-[200px]">
                <DropdownMenuRadioGroup value={model} onValueChange={setModel}>
                  {MODELS.map((m) => (
                    <DropdownMenuRadioItem key={m} value={m} className="text-[13px]">
                      {m}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="submit"
              size="icon"
              variant={hasDraft ? "default" : "ghost"}
              aria-label="Send"
              className={cn("size-[26px] rounded-md", !hasDraft && "text-muted-foreground/60")}
            >
              <CornerDownLeft className="size-3.5" />
            </Button>
          </div>
        </div>
      </form>
    </aside>
  );
}
