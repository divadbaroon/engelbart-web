"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePanelRef } from "react-resizable-panels";
import { ArrowLeftToLine, PanelRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

// A tab sent to the side: shown in the right panel, where it shares the
// tab bar with Bart, with a way back to the middle and a way to close it.
export type SideSlot = { title: string; content: ReactNode; onToMiddle: () => void; onClose: () => void };

type CenterPanelProps = {
  tabs: ReactNode;
  children: ReactNode;
  side: SideSlot | null;
  bart: ReactNode;                              // the conversation, at full size
  bartFocus: { key: number; surface: string };  // bumped when something asks for the Bart tab
};

// Stable shell for the center: tab bar slot on top, then two bordered
// cards, the middle and the right panel, with the same gap between them
// as beside the sidebar. The resize handle is that gap.
//
// The right panel holds two tabs: Bart, which is always there, and
// whichever tab was sent over from the middle. One shows at a time, so
// the conversation gets the whole column rather than sitting squeezed
// under something else. It stays mounted while the project/repo context
// changes, and the session lives above it, so switching tabs here never
// resets what was said.
export function CenterPanel({ tabs, children, side, bart, bartFocus }: CenterPanelProps) {
  const column = usePanelRef();
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState<"bart" | "side">("bart");
  const hasSide = !!side;

  // The panel starts open. The layout can settle collapsed after
  // hydration, so expand it once on mount rather than trusting
  // defaultSize alone.
  useEffect(() => {
    if (column.current?.isCollapsed()) column.current.expand();
  }, [column]);

  // A tab arriving on the side is what you asked to see, so it comes to
  // the front; when it leaves, Bart has the panel to itself again.
  useEffect(() => { setActive(hasSide ? "side" : "bart"); }, [hasSide]);

  // "Open the Bart tab", from the small panel over the trace canvas.
  useEffect(() => {
    if (!bartFocus.key || bartFocus.surface !== "tab") return;
    setActive("bart");
    if (column.current?.isCollapsed()) column.current.expand();
  }, [bartFocus, column]);

  const showing = hasSide && active === "side" ? "side" : "bart";
  const toggle = () => (open ? column.current?.collapse() : column.current?.expand());

  return (
    <main className="flex h-full min-w-0 flex-col bg-background px-6 pt-4 pb-5">
      {tabs}
      <div className="mt-5 flex min-h-0 flex-1">
        <ResizablePanelGroup orientation="horizontal" id="engelbart-workspace">
          <ResizablePanel defaultSize="65" minSize="35">
            <div className="h-full overflow-hidden rounded-lg border">{children}</div>
          </ResizablePanel>
          <ResizableHandle className="w-6 bg-transparent" />
          <ResizablePanel
            panelRef={column}
            defaultSize="35"
            minSize="25"
            maxSize="55"
            collapsible
            collapsedSize="4"
            onResize={() => setOpen(!column.current?.isCollapsed())}
          >
            <div className="h-full overflow-hidden rounded-lg border bg-background">
              {open ? (
                <section aria-label="Bart and the tab on the side" className="flex h-full min-w-0 flex-col">
                  <header className="flex h-9 shrink-0 items-center gap-1 border-b pr-1.5 pl-2.5">
                    <div role="tablist" aria-label="Right panel" className="flex min-w-0 items-center gap-0.5">
                      <PanelTab active={showing === "bart"} onSelect={() => setActive("bart")}>Bart</PanelTab>
                      {side && <PanelTab active={showing === "side"} onSelect={() => setActive("side")}>{side.title}</PanelTab>}
                    </div>
                    <span className="ml-auto" />
                    {side && showing === "side" && (
                      <>
                        <Button variant="ghost" size="icon" aria-label="Move to the middle" title="Move to the middle" onClick={side.onToMiddle} className="size-7 text-muted-foreground">
                          <ArrowLeftToLine className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Close" title="Close; the tab stays in the middle bar" onClick={side.onClose} className="size-7 text-muted-foreground">
                          <X className="size-4" />
                        </Button>
                      </>
                    )}
                    <Button variant="ghost" size="icon" aria-label="Close the panel" title="Close the panel" onClick={toggle} className="size-7 text-muted-foreground">
                      <PanelRight className="size-4" />
                    </Button>
                  </header>
                  {/* Only the tab in front is mounted. A hidden panel
                      measures zero, and the trace canvas reads its own
                      size to keep the camera; it would come back to a
                      viewport computed against nothing. Tabs that cost a
                      reload to remount cannot be sent here at all
                      (lib/workspace-slots). */}
                  <div className="min-h-0 flex-1">{showing === "side" && side ? side.content : bart}</div>
                </section>
              ) : (
                <aside className="flex h-full flex-col items-center bg-[#f6f6f6] pt-4">
                  <Button variant="ghost" size="icon" aria-label="Open the panel" title="Open Bart" onClick={toggle} className="size-7 text-muted-foreground">
                    <PanelRight className="size-4" />
                  </Button>
                </aside>
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </main>
  );
}

function PanelTab({ active, onSelect, children }: { active: boolean; onSelect: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={cn(
        "min-w-0 truncate rounded-md px-2 py-1 text-[13px]",
        active ? "bg-background font-semibold text-foreground shadow-sm" : "font-normal text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
