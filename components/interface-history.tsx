"use client";

import { useMemo, useState } from "react";
import { MousePointerClick } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatClock, type InteractionRow, type TraceRow } from "@/lib/trace/timeline";
import type { Confidence, SemanticMatch } from "@/lib/semantics/types";

// Everything the person did to the interface, in order, with what the
// semantic layer made of it.
//
// The canvas answers "what happened in this session"; this answers a
// narrower and more suspicious question: for each act, what did the page
// actually hold, and what did we decide to call it? Those are two
// different claims and they are worth seeing apart, because the second
// one is a guess. The row leads with the guess where there is a good one
// and keeps the raw descriptor in the parenthesis either way, so a label
// that is wrong is obvious rather than convincing — the same rule the
// trace rows follow (`describeTarget`, lib/trace/timeline.ts).
//
// What matched is said plainly. A `testid` is something the application
// put there on purpose; a `shape` is us guessing from how an element
// looks. They should not read the same.

// How a label was arrived at, worst first, because that is the order
// somebody checking them cares about.
const MATCHED_ON: Record<SemanticMatch["matchedOn"], string> = {
  testid: "matched on a test id the page set",
  id: "matched on the element's id",
  selector: "matched on a selector",
  shape: "guessed from the element's shape",
  frame: "matched on the document, not the element",
};

const CONFIDENCE: Record<Confidence, string> = {
  high: "text-foreground",
  medium: "text-foreground",
  low: "text-muted-foreground",
};

// Every act, including the ones the trace rows fold away.
//
// `traceRows` ends in `groupKeys`, which collapses a run of key presses
// in one frame into a single row so the canvas does not become a wall of
// keystrokes. That is right for the canvas and wrong here: on the ROPE
// session it hides 19 of 37 acts, and an artifact driven by the keyboard
// would be almost entirely hidden. The group keeps its rows, so they are
// unfolded rather than recovered from the events again.
export const eachAct = (rows: TraceRow[]): InteractionRow[] =>
  rows.flatMap((r) => (r.kind === "interaction" ? [r] : r.kind === "keys" ? r.rows : []));

// The list as text, for the copy in the tab header. One line per act, in
// the order and the words the rows are in — the clock, what was done,
// what the reading called it where it matched — so that what lands in
// somebody's notes is what they were looking at.
export const actLines = (rows: TraceRow[]): string =>
  eachAct(rows)
    .map((a) => {
      const m = a.semantic?.element ?? null;
      const where = a.frameName !== "the page" ? ` [${a.frameName}]` : "";
      const read = m ? ` — ${m.label} (${m.kind}, ${m.confidence} confidence)` : "";
      return `${formatClock(a.at)}  ${a.label}${where}${read}`;
    })
    .join("\n");

// Whether there is anything to have watched: no run at all and a run
// with tracing off are different things to be told.
export type Watched = "no-run" | "untraced" | "traced";

export function InterfaceHistory({ rows, watched }: { rows: TraceRow[]; watched: Watched }) {
  const acts = useMemo(() => eachAct(rows), [rows]);
  const [openId, setOpenId] = useState<string | null>(null);

  if (!acts.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <MousePointerClick className="size-5 text-muted-foreground/60" />
        <p className="text-[13px] text-muted-foreground">Nothing has been done to the interface yet.</p>
        <p className="max-w-[380px] text-[12px] leading-relaxed text-muted-foreground/80">
          {watched === "traced"
            ? "Use the application in the Live preview. Every click, keystroke and route change lands here with whatever the interface reading called it."
            : watched === "untraced"
              ? "This run was not traced, so nothing was watched. Prepare the repository again with tracing on."
              : "Nothing has been run yet. Prepare the repository, then use it in the Live preview."}
        </p>
      </div>
    );
  }

  return (
    // No bar over the list. It counted the acts, which the list itself
    // shows, and offered a filter to the ones with a weak label — a
    // reader's tool for checking the semantic layer, in the tab where
    // somebody is trying to see what was done. How a label was arrived
    // at is still on every row, one click down, where the claim is.
    <section aria-label="Interface history" className="flex h-full min-h-0 flex-col">
      <ol className="min-h-0 flex-1 overflow-y-auto">
        {acts.map((a) => {
          const m = a.semantic?.element ?? null;
          const open = openId === a.id;
          return (
            <li key={a.id} className="border-b last:border-b-0">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : a.id)}
                aria-expanded={open}
                className="flex w-full items-baseline gap-2.5 px-3 py-1.5 text-left hover:bg-muted/40"
              >
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground/70 tabular-nums">{formatClock(a.at)}</span>
                <span className={cn("min-w-0 flex-1 truncate text-[13px]", m ? CONFIDENCE[m.confidence] : "text-muted-foreground")}>{a.label}</span>
                {a.frameName !== "the page" && <span className="shrink-0 text-[11px] text-muted-foreground/70">{a.frameName}</span>}
              </button>
              {open && (
                <div className="space-y-1 px-3 pb-2 pl-[4.25rem] text-[12px] text-muted-foreground">
                  {a.detail && <p>{a.detail}</p>}
                  <p>
                    {m
                      ? <>Called <span className="font-medium text-foreground">{m.label}</span>, a {m.kind} — {MATCHED_ON[m.matchedOn]}, {m.confidence} confidence.</>
                      : <>Nothing in the interface reading matched this element, so only what the page held is shown.</>}
                  </p>
                  {a.semantic?.region && <p>In the {a.semantic.region}.</p>}
                  {a.semantic?.document && <p>Document read as {a.semantic.document}.</p>}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
