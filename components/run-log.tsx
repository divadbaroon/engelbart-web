"use client";

import { useLayoutEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import type { TermLine } from "@/lib/sandbox";

type Props = {
  lines: TermLine[];
  empty: string;         // shown when there are no lines yet
  error?: string;
};

const ROW_PX = 23;   // 13px text at 1.75 line height, before wrapping
const AT_BOTTOM_PX = 40;

// A run's log. Only the lines in view are in the page, so a long build
// costs the same to show as a short one, and the tail keeps following new
// output until the person scrolls up to read something.
export function RunLog({ lines, empty, error }: Props) {
  const scroller = useRef<HTMLElement>(null);
  const lastHeight = useRef(0);   // the scroll height before the latest change
  const count = lines.length;

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_PX,
    overscan: 24,
    initialOffset: () => count * ROW_PX,   // it scrolls here whenever it attaches; the end, like a terminal
  });
  const total = virtualizer.getTotalSize();

  // Keep the end in view as lines arrive, until the person scrolls up to
  // read something; scrolling back to the end resumes it. Whether they were
  // at the end is judged against the height before this change, so a line
  // arriving mid-scroll cannot drag them back down. Rows measure taller
  // than the estimate once wrapped, which is why the total is watched too.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const wasAtEnd = el.scrollTop + el.clientHeight >= lastHeight.current - AT_BOTTOM_PX;
    if (wasAtEnd && count) el.scrollTop = el.scrollHeight;
    lastHeight.current = el.scrollHeight;
  }, [count, total]);

  return (
    <section
      ref={scroller}
      aria-label="Run log"
      // No padding above the first line: the log starts where the bar
      // over it ends. A gap there reads as the pane not having loaded,
      // and it is most visible arriving from a step in Build, where the
      // bar naming the step is immediately followed by empty space.
      className="h-full overflow-y-auto px-[22px] pb-[18px] font-mono text-[13px] leading-[1.75]"
    >
      {!count && <p className="text-muted-foreground">{empty}</p>}
      <div style={{ height: total, position: "relative", width: "100%" }}>
        {virtualizer.getVirtualItems().map((item) => {
          const l = lines[item.index];
          return (
            <div
              key={item.key}
              data-index={item.index}
              ref={virtualizer.measureElement}
              style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${item.start}px)` }}
              className={cn(
                "flex gap-2.5 break-words whitespace-pre-wrap",
                l.kind === "command" ? "text-foreground" : l.kind === "error" ? "text-destructive" : l.kind === "status" ? "text-muted-foreground/60 italic" : "text-muted-foreground",
              )}
            >
              <span aria-hidden className="w-2.5 shrink-0 text-muted-foreground/60">{l.kind === "command" ? "$" : ""}</span>
              <span className="min-w-0 flex-1">{l.text}</span>
            </div>
          );
        })}
      </div>
      {error && count > 0 && <p role="alert" className="mt-2 text-destructive">{error}</p>}
    </section>
  );
}
