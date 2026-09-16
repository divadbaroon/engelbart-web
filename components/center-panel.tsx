"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePanelRef } from "react-resizable-panels";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { BartPanel } from "@/components/bart-panel";

type CenterPanelProps = { tabs: ReactNode; children: ReactNode };

// Stable shell for the center: tab bar slot on top, then two bordered cards,
// content and Bart, with the same gap between them as beside the sidebar.
// The resize handle is that gap. Stays mounted while the project/repo
// context changes, so Bart's conversation is never reset.
export function CenterPanel({ tabs, children }: CenterPanelProps) {
  const bartRef = usePanelRef();
  const [bartOpen, setBartOpen] = useState(true);

  // Bart starts open. The layout can settle collapsed after hydration, so
  // expand it once on mount rather than trusting defaultSize alone.
  useEffect(() => {
    if (bartRef.current?.isCollapsed()) bartRef.current.expand();
  }, [bartRef]);

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
            panelRef={bartRef}
            defaultSize="35"
            minSize="25"
            maxSize="55"
            collapsible
            collapsedSize="4"
            onResize={() => setBartOpen(!bartRef.current?.isCollapsed())}
          >
            <div className="h-full overflow-hidden rounded-lg border">
              <BartPanel
                open={bartOpen}
                onToggle={() => (bartOpen ? bartRef.current?.collapse() : bartRef.current?.expand())}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </main>
  );
}
