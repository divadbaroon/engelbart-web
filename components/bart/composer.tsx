"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { ChevronDown, CornerDownLeft, Paperclip, Plus, SlidersHorizontal, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ATTACH, DEFAULT_OPTIONS, EFFORT_NOTE, TEMPERATURE, isTextFile,
  type Attachment, type BartOptions, type Effort,
} from "@/lib/bart/options";
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
  // Asking for Bart and opening the panel Bart is in are two state
  // changes, and the open lands second, so the ask can arrive while this
  // is still inside a hidden subtree. `focus()` on a hidden element does
  // nothing and does not say so, so keep offering it for a few frames
  // rather than once.
  useEffect(() => {
    if (!key || asked !== surface) return;
    let frames = 0, next = 0;
    const take = () => {
      const el = input.current;
      if (!el) return;
      el.focus();
      if (document.activeElement !== el && frames++ < 10) next = requestAnimationFrame(take);
    };
    take();
    return () => cancelAnimationFrame(next);
  }, [key, asked, surface]);

  const send = (e: FormEvent) => { e.preventDefault(); session.submit(context); };

  // A file from the computer, read here and carried with the next
  // question. Text only: the wire takes a string, and an image would
  // need content blocks the route does not build yet. Read in the
  // browser rather than uploaded — nothing is stored anywhere until the
  // question is asked, and then it is stored as part of the question.
  const picker = useRef<HTMLInputElement>(null);
  const [tooBig, setTooBig] = useState<string | null>(null);
  const room = ATTACH.total - session.attachments.reduce((n, a) => n + a.text.length, 0);

  const takeFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(e.target.files ?? []);
    e.target.value = "";                                  // so the same file can be picked twice
    setTooBig(null);
    const free = ATTACH.files - session.attachments.length;
    const refused: string[] = [];
    const taken: Attachment[] = [];
    let left = room;
    for (const file of chosen.slice(0, Math.max(0, free))) {
      if (!isTextFile(file.name, file.type)) { refused.push(file.name); continue; }
      const text = (await file.text()).slice(0, Math.min(ATTACH.perFile, left));
      if (!text.trim()) { refused.push(file.name); continue; }
      left -= text.length;
      taken.push({ name: file.name, text });
    }
    if (taken.length) session.attach(taken);
    if (refused.length) setTooBig(`${refused.join(", ")} — text files only`);
    else if (chosen.length > taken.length) setTooBig(`Up to ${ATTACH.files} files at a time`);
  };

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
      {(session.attachments.length > 0 || tooBig) && (
        <div className="flex flex-wrap items-center gap-1">
          {session.attachments.map((a) => (
            <span key={a.name} className="flex min-w-0 max-w-full items-center gap-1 rounded border px-1.5 py-px text-[11px] text-muted-foreground" title={`${a.name} · ${a.text.length.toLocaleString("en-US")} characters, sent with the question`}>
              <Paperclip className="size-2.5 shrink-0" />
              <span className="min-w-0 truncate text-foreground">{a.name}</span>
              <button type="button" onClick={() => session.unattach(a.name)} aria-label={`Remove ${a.name}`} className="shrink-0 rounded hover:text-foreground"><X className="size-2.5" /></button>
            </span>
          ))}
          {tooBig && <span className="text-[11px] text-muted-foreground">{tooBig}</span>}
        </div>
      )}
      <Input
        ref={input}
        value={session.draft}
        onChange={(e) => session.setDraft(e.target.value)}
        placeholder={placeholder}
        /* px-0, not px-0.5: everything else in this box — the "Looking
           at" line, the attachment chips, the Plus button — starts at the
           composer's own 12px padding edge, and the half-unit put the
           placeholder and the draft 2px to the right of all of them. */
        className={cn("h-auto border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0", compact ? "text-[13px] md:text-[13px]" : "text-[15px] md:text-[15px]")}
      />
      <div className="flex items-center justify-between gap-2">
        {compact ? <span /> : (
          <>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Add context from a file"
              title={room > 0 && session.attachments.length < ATTACH.files ? "Add context from a file on your computer" : "That is as much as one question can carry"}
              disabled={room <= 0 || session.attachments.length >= ATTACH.files}
              onClick={() => picker.current?.click()}
              className="size-[26px] rounded-md text-muted-foreground"
            >
              <Plus className="size-3.5" />
            </Button>
            <input
              ref={picker}
              type="file"
              multiple
              hidden
              accept=".txt,.md,.markdown,.json,.yaml,.yml,.toml,.ini,.cfg,.conf,.csv,.tsv,.log,.html,.htm,.css,.scss,.js,.jsx,.ts,.tsx,.mjs,.cjs,.py,.rb,.go,.rs,.java,.kt,.c,.h,.cc,.cpp,.hpp,.cs,.swift,.sh,.bash,.zsh,.sql,text/*"
              onChange={(e) => void takeFiles(e)}
            />
          </>
        )}
        <div className="flex items-center gap-0.5">
          {!compact && <Settings options={session.options} onOptions={session.setOptions} />}
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

// The knobs on a question: how long Bart may think before answering, and
// how closely it sticks to the likeliest wording. They are one popover
// rather than two controls in the row, because they are settings you
// leave alone most days.
//
// There was a third — the longest an answer could run — and it is gone.
// It is not a question anybody asks before asking a question: the answer
// is as long as the answer is, and a number of tokens is not a length
// anybody can picture. The default still travels on the wire and is
// still clamped there (lib/bart/options.ts); there is just nothing here
// to set it with.
//
// Effort and temperature are exclusive, and that is the API's rule
// rather than a choice made here: a call with a thinking block may not
// also set a temperature (lib/bart/options.ts). So the temperature is
// disabled while an effort is asked for, and says why.
const EFFORTS: Effort[] = ["off", "low", "medium", "high"];
const EFFORT_WORD: Record<Effort, string> = { off: "Off", low: "Low", medium: "Medium", high: "High" };

function Settings({ options, onOptions }: { options: BartOptions; onOptions: (options: BartOptions) => void }) {
  const set = <K extends keyof BartOptions>(key: K, value: BartOptions[K]) => onOptions({ ...options, [key]: value });
  const thinking = options.effort !== "off";
  // Only what this popover can still change. Counting the answer length
  // in here would light the dot for somebody who moved that slider
  // before it was removed, with nothing on screen to explain it and no
  // way to put it back.
  const changed =
    options.effort !== DEFAULT_OPTIONS.effort ||
    options.temperature !== DEFAULT_OPTIONS.temperature;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="How Bart answers"
          title="How Bart answers"
          className={cn("relative size-[26px] rounded-md text-muted-foreground", changed && "text-foreground")}
        >
          <SlidersHorizontal className="size-3.5" />
          {/* A mark, not a number: the point is only that this is not
              sitting at its defaults, so nobody wonders why an answer
              came back different from yesterday's. */}
          {changed && <span aria-hidden className="absolute top-0.5 right-0.5 size-1 rounded-full bg-foreground" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="w-[268px] p-3">
        <div className="flex flex-col gap-3.5">
          <Knob label="Effort" value={EFFORT_WORD[options.effort]} note={EFFORT_NOTE[options.effort]}>
            <div role="group" aria-label="Effort" className="flex gap-1">
              {EFFORTS.map((e) => (
                <button
                  key={e}
                  type="button"
                  aria-pressed={options.effort === e}
                  onClick={() => set("effort", e)}
                  className={cn(
                    "h-6 flex-1 rounded text-[12px] font-medium transition-colors",
                    options.effort === e ? "bg-foreground text-background" : "text-muted-foreground ring-1 ring-inset ring-border hover:bg-muted hover:text-foreground",
                  )}
                >
                  {EFFORT_WORD[e]}
                </button>
              ))}
            </div>
          </Knob>

          <Knob
            label="Temperature"
            value={thinking ? "—" : options.temperature.toFixed(1)}
            note={thinking ? "Set by the model while it is thinking." : options.temperature <= 0.3 ? "Nearly the same answer every time." : options.temperature >= 0.9 ? "As written by the model." : "Some room to vary."}
          >
            <input
              type="range"
              aria-label="Temperature"
              disabled={thinking}
              min={TEMPERATURE.min}
              max={TEMPERATURE.max}
              step={TEMPERATURE.step}
              value={options.temperature}
              onChange={(e) => set("temperature", Number(e.target.value))}
              className="h-1 w-full cursor-pointer appearance-none rounded-full bg-border accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
            />
          </Knob>

          <button
            type="button"
            disabled={!changed}
            onClick={() => onOptions(DEFAULT_OPTIONS)}
            className="self-start text-[12px] text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            Back to defaults
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Knob({ label, value, note, children }: { label: string; value: string; note: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium text-foreground">{label}</span>
        <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">{value}</span>
      </div>
      {children}
      <p className="text-[11px] leading-snug text-muted-foreground">{note}</p>
    </div>
  );
}
