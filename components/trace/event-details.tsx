"use client";

import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMs, frameDetail, frameName, type CallRow, type FrameInfo, type Stage } from "@/lib/trace/timeline";
import { momentActions, relatedCall, relationWord, responseQuotes, shortClock, submitEcho } from "@/lib/trace/moments";
import { CorrelationTag, RowItem, type Select } from "@/components/trace/rows";
import { Disclosure } from "@/components/trace/disclosure";

// A moment that is not a model call, opened in its panel: what it was,
// when, what was done, the text the page showed, where it happened, and
// the model call it was tied to when the trace says so. What that rests
// on (the full label, the tie in the trace's own words, the frame's
// path, the rows and raw events) waits under "Show evidence".
export type Back = { label: string; onClick: () => void } | null;
type Props = {
  stage: Stage; stages: Stage[]; calls: Map<string, CallRow>; frames: Map<string, FrameInfo>;
  select: Select; onOpenCall: (callId: string) => void; onAskBart: () => void; onClose: () => void; back: Back;
};

const ms = (iso: string) => Date.parse(iso);

export function EventDetails({ stage, stages, calls, frames, select, onOpenCall, onAskBart, onClose, back }: Props) {
  const first = stage.rows[0];
  const frameId = first && (first.kind === "interaction" || first.kind === "keys") ? first.frameId : null;
  const frame = frameId ? frames.get(frameId) : undefined;
  const embedded = !!frame?.parentFrameId;
  const echo = submitEcho(stage, calls);
  const actions = stage.stage === "response" ? [] : momentActions(stage);
  const quotes = responseQuotes(stage);
  const related = relatedCall(stage, stages, calls);
  const duration = stage.stage === "explore" ? ms(stage.endAt) - ms(stage.at) : null;
  const tie = related ? { correlation: related.correlation, text: related.text } : stage.link;
  return (
    <section aria-label="Event details" className="flex h-full min-h-0 flex-col">
      <Header title={stage.title} back={back} onAskBart={onAskBart} onClose={onClose}>
        <span className="font-mono text-[11px]">{shortClock(stage.at)}</span>
        {duration !== null && <span> · {formatMs(duration)}</span>}
        {stage.stage === "response" && stage.link && <span> · {stage.link.text.split(",")[0]}</span>}
      </Header>
      <div className="min-h-0 flex-1 overflow-y-auto px-[18px] py-3 text-[13px]">
        {echo && (
          <div className="mb-3">
            <p className="text-[14px] leading-6">“{echo.text}”{echo.more > 0 && <span className="text-muted-foreground"> and {echo.more} more</span>}</p>
            <p className="text-xs text-muted-foreground">Observed in the page after the submit{echo.sinceMs !== null ? `, ${formatMs(echo.sinceMs)} later` : ""} · typed text is never recorded</p>
          </div>
        )}
        {quotes.length > 0 && (
          <ul className="mb-3 flex flex-col gap-1.5">
            {quotes.slice(0, 3).map((q, i) => <li key={i} className="line-clamp-3 leading-5">“{q}”</li>)}
            {quotes.length > 3 && <li className="text-xs text-muted-foreground">+{quotes.length - 3} more</li>}
          </ul>
        )}
        {actions.length > 0 && (
          <ul className="mb-3 flex flex-col gap-0.5 leading-5">
            {actions.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        )}
        <dl className="flex flex-col gap-0.5 text-xs leading-5 text-muted-foreground">
          {embedded && <Line label="Frame">{frameName(frames, frameId)}</Line>}
          {related && (
            <Line label="Related">
              <button type="button" onClick={() => onOpenCall(related.callId)} className="text-foreground underline-offset-2 hover:underline">{related.model ?? "model call"}</button>
              <span> · {related.stateText} · </span>
              <CorrelationTag how={related.correlation} title={related.text ?? undefined} />
            </Line>
          )}
          {!related && stage.stage === "submit" && <Line label="Related">no model call was tied to this submit</Line>}
        </dl>
        <Disclosure label="Show evidence" hint={`${stage.rows.length} row${stage.rows.length === 1 ? "" : "s"} · ${stage.events.length} raw event${stage.events.length === 1 ? "" : "s"}`} className="mt-2 border-t">
          <div className="flex flex-col gap-1 pb-2 text-xs leading-5 text-muted-foreground">
            <p>{stage.label}</p>
            {stage.detail && <p>{stage.detail}</p>}
            {tie?.text && <p>{relationWord(tie.correlation) === "linked" ? "Linked" : "By timing"}: {tie.text}</p>}
            {stage.stage === "explore" && <p>No model call was tied to this activity.</p>}
            {stage.stage === "response" && <p>What appeared on screen is not part of the call&apos;s graph; the trace does not record what rendered it.</p>}
            {frame && embedded && <p>Frame: {frameDetail(frame)}</p>}
          </div>
          <ol className="-mx-[18px] border-t">
            {stage.rows.map((row) => <RowItem key={row.id} row={row} nested={false} selected={select.selected} onSelect={select.onSelect} />)}
          </ol>
        </Disclosure>
      </div>
    </section>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-[56px] shrink-0">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

// The head of anything inspected: its title, a way back to the live
// list when it was opened from there, and the two things to do with it.
export function Header({ title, back, onAskBart, onClose, children, className }: { title: React.ReactNode; back: Back; onAskBart: () => void; onClose: () => void; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex shrink-0 flex-col gap-1 border-b px-[18px] py-3", className)}>
      <div className="flex items-start gap-2">
        {back && (
          <Button variant="ghost" size="sm" onClick={back.onClick} title={back.label} aria-label={back.label} className="-ml-2 h-7 gap-1 px-1.5 font-normal text-muted-foreground">
            <ArrowLeft className="size-3.5" />
          </Button>
        )}
        <span className="min-w-0 flex-1 truncate pt-1 text-[13px] font-medium">{title}</span>
        <Button variant="ghost" size="sm" onClick={onAskBart} className="h-7 px-2 font-normal text-muted-foreground">Ask Bart</Button>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-7 px-2 font-normal text-muted-foreground">Close</Button>
      </div>
      {children && <div className={cn("text-xs text-muted-foreground", back && "pl-7")}>{children}</div>}
    </div>
  );
}
