"use client";

import { useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Correlation, TraceEvent } from "@/lib/trace/types";
import { formatClock, formatMs, summarizeCall, summarizeInteraction, type CallRow, type InteractionRow, type KeyGroupRow, type NetworkRow, type NoteRow, type TraceRow } from "@/lib/trace/timeline";

// The rows of the trace as list items: an interaction and what followed
// it, a run of keys, a model call, a request nothing claimed, a note. Each
// opens to the raw events behind it; a model call opens in the inspector.

export const Clock = ({ at }: { at: string }) => <span className="w-[92px] shrink-0 font-mono text-[11px] text-muted-foreground">{formatClock(at)}</span>;
export const Chevron = ({ open }: { open: boolean }) => <ChevronRight className={cn("mt-0.5 size-3.5 shrink-0 text-muted-foreground/60 transition-transform", open && "rotate-90")} />;
export const rowPad = (nested: boolean) => (nested ? "pl-[44px] pr-[22px]" : "px-[22px]");

export type Select = { selected: string | null; onSelect: (id: string) => void };

// How two things were tied together, kept quiet: a small tag whose
// tooltip carries the evidence.
export function CorrelationTag({ how, title }: { how: Correlation; title?: string }) {
  return (
    <span title={title ?? (how === "explicit" ? "Linked by an id the page put on the request." : "Associated by timing only.")} className={cn("inline-flex cursor-help rounded border px-1 py-px text-[10px] leading-4 text-muted-foreground", how === "explicit" ? "border-emerald-200 bg-emerald-50/60" : "border-border bg-muted/60")}>
      {how === "explicit" ? "linked" : "temporal"}
    </span>
  );
}

export function RowItem({ row, nested, selected, onSelect }: { row: TraceRow; nested: boolean } & Select) {
  switch (row.kind) {
    case "call": return <CallItem row={row} nested={nested} selected={selected === row.id} onSelect={() => onSelect(row.id)} />;
    case "interaction": return <InteractionItem row={row} nested={nested} />;
    case "keys": return <KeyGroupItem row={row} nested={nested} />;
    case "network": return <NetworkItem row={row} nested={nested} />;
    default: return <NoteItem row={row} nested={nested} />;
  }
}

export function CallItem({ row, nested = false, selected, onSelect }: { row: CallRow; nested?: boolean; selected: boolean; onSelect: () => void }) {
  const s = summarizeCall(row);
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={cn("flex w-full items-center gap-4 border-b py-2.5 text-left text-[13px] hover:bg-[#fafafa]", rowPad(nested), nested && "bg-[#fcfcfc]", selected && "bg-[#f3f3f3] hover:bg-[#f3f3f3]")}
      >
        <Clock at={row.at} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate"><span className="font-medium">{s.model ?? "model call"}</span><span className="text-muted-foreground"> · {s.where}</span></span>
          <span className="truncate text-xs text-muted-foreground">
            {s.messages !== null ? `${s.messages} message${s.messages === 1 ? "" : "s"}` : "request not described"}
            {s.streamed ? " · streamed" : ""}
            {s.outputChars !== null ? ` · ${s.outputChars} characters back` : ""}
            {s.state === "done" && (s.usageAvailable === false ? " · usage unavailable" : "")}
            {s.errorText ? ` · ${s.errorText}` : ""}
          </span>
          {(row.during || row.via) && (
            <span className="truncate text-xs text-muted-foreground/80">
              {row.during ? `during ${row.during}` : ""}{row.during && row.via ? " · " : ""}{row.via ? `after: ${row.via}` : ""} <CorrelationTag how="temporal" />
            </span>
          )}
        </span>
        <span className={cn("shrink-0 text-xs", s.state === "error" ? "text-destructive" : "text-muted-foreground")}>
          {s.state === "in flight" ? <span className="flex items-center gap-1"><Loader2 className="size-3 animate-spin" /> in flight</span>
            : s.state === "aborted" ? "aborted"
            : `${s.status ?? "–"} · ${formatMs(s.latencyMs)}`}
        </span>
      </button>
    </li>
  );
}

// An interaction and what followed it; opens to the raw events.
export function InteractionItem({ row, nested = false }: { row: InteractionRow; nested?: boolean }) {
  const [open, setOpen] = useState(false);
  const after = summarizeInteraction(row);
  const raw: TraceEvent[] = [row.event, ...row.links.flatMap((l) => [l.request, ...(l.result ? [l.result] : [])]), ...row.changes];
  return (
    <li className={cn("border-b", nested && "bg-[#fcfcfc]")}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={cn("flex w-full items-start gap-4 py-2.5 text-left text-[13px] hover:bg-[#fafafa]", rowPad(nested))}>
        <Clock at={row.at} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate">{row.label}</span>
          {row.detail && <span className="truncate text-xs text-muted-foreground">{row.detail}</span>}
          {after.map((line, i) => <span key={i} className="truncate text-xs text-muted-foreground/80">{line}</span>)}
        </span>
        <Chevron open={open} />
      </button>
      {open && <RawEvents events={raw} />}
    </li>
  );
}

// A run of keys in one frame; opens to each press.
export function KeyGroupItem({ row, nested = false }: { row: KeyGroupRow; nested?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={cn("border-b", nested && "bg-[#fcfcfc]")}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={cn("flex w-full items-start gap-4 py-2.5 text-left text-[13px] hover:bg-[#fafafa]", rowPad(nested))}>
        <Clock at={row.at} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate">{row.label}</span>
          <span className="truncate text-xs text-muted-foreground">{row.detail} · {row.presses} press{row.presses === 1 ? "" : "es"}</span>
        </span>
        <Chevron open={open} />
      </button>
      {open && <ol>{row.rows.map((r) => <InteractionItem key={r.id} row={r} nested />)}</ol>}
    </li>
  );
}

export function NetworkItem({ row, nested = false }: { row: NetworkRow; nested?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={cn("border-b", nested && "bg-[#fcfcfc]")}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={cn("flex w-full items-start gap-4 py-2 text-left text-[13px] hover:bg-[#fafafa]", rowPad(nested))}>
        <Clock at={row.at} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-muted-foreground">{row.label} <span className="text-muted-foreground/60">· no interaction linked</span></span>
          {row.detail && <span className="truncate text-xs text-muted-foreground/80">{row.detail}</span>}
        </span>
        <Chevron open={open} />
      </button>
      {open && <RawEvents events={[row.request, ...(row.result ? [row.result] : [])]} />}
    </li>
  );
}

export function NoteItem({ row, nested = false }: { row: NoteRow; nested?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={cn("border-b", nested && "bg-[#fcfcfc]")}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={cn("flex w-full items-start gap-4 py-2 text-left text-[13px] hover:bg-[#fafafa]", rowPad(nested))}>
        <Clock at={row.at} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-muted-foreground">{row.label}</span>
          {row.detail && <span className="truncate text-xs text-muted-foreground/80">{row.detail}</span>}
        </span>
        <Chevron open={open} />
      </button>
      {open && <RawEvents events={[row.event]} />}
    </li>
  );
}

// The events behind a row, as recorded.
export function RawEvents({ events }: { events: TraceEvent[] }) {
  return (
    <div className="border-t bg-[#fafafa] px-[22px] py-2">
      {events.map((e) => (
        <details key={e.id} className="text-xs">
          <summary className="cursor-pointer py-0.5 font-mono text-[11px] text-muted-foreground">
            {formatClock(e.at)} · {e.source} · {e.kind}{e.interactionId ? ` · ${e.interactionId}` : ""}{e.requestId ? ` · ${e.requestId}` : ""}{e.callId ? ` · ${e.callId}` : ""}{e.correlation ? ` · ${e.correlation}` : ""}
          </summary>
          <pre className="max-h-[240px] overflow-auto whitespace-pre-wrap break-all py-1 font-mono text-[11px] leading-[1.5] text-muted-foreground">{JSON.stringify(e.data, null, 2)}</pre>
        </details>
      ))}
    </div>
  );
}
