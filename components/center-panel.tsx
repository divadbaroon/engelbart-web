"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePanelRef } from "react-resizable-panels";
import { PanelRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { MIDDLE_TABS, PANEL_TABS, TAB_LABEL, type MiddleTab, type PanelTab } from "@/lib/workspace-slots";

// One array, so "nothing is mounted" compares equal to itself and the
// state below settles in one more render rather than every render.
const NONE: string[] = [];

type CenterPanelProps = {
  tabs: ReactNode;
  // The middle with a repository open: every surface, and which one is in
  // front. Without one — a paper, the project — there is nothing to keep
  // and `children` is rendered instead.
  middle?: Record<MiddleTab, ReactNode> | null;
  middleTab?: MiddleTab;
  children: ReactNode;
  panes: Record<PanelTab, ReactNode>;   // Bart, the Visualizer, Replay, Activity
  tab: PanelTab;                        // which of them is in front
  onTabChange: (tab: PanelTab) => void;
  focus: number;                        // bumped when something asks for a pane; opens the panel
  repoId: string | null;                // a different repository is a different shell
};

// Middle surfaces that wait to be asked for.
//
// Only Setup, and only because of the shell inside it: mounting
// SandboxShell opens a shell in the sandbox, and opening a repository is
// not asking for one. Unmounting it closes the stream and the server
// kills the PTY when the stream goes
// (app/api/runs/[runId]/terminal/route.ts) — there is no reconnect and
// no scrollback to restore — so once it has been asked for it stays.
const KEPT: MiddleTab[] = ["setup"];

// And the rest, which are there from the moment a repository is opened.
//
// They used to mount when their tab was first pressed, so opening a
// repository and pressing Code began the fetch of the file tree, and
// pressing Live preview began loading the application's page — each of
// them a wait that started when somebody asked to see the thing they
// were waiting for. There is nothing to be gained by that order: the
// README is already fetched when a repository reaches the middle
// (components/app-shell.tsx), and the other two want the same head start.
//
// Mounting the preview does not turn anything on. rrweb capture is gated
// on a recording being open (`useCapture`, components/repo-workspace.tsx)
// and a recording is started by hand, so nothing is recorded that was
// not recorded before. What does move earlier is the interface survey,
// which asks what the page is once it is up — it was going to be asked
// the moment anybody opened the tab, and it is asked once and cached.
const EAGER: MiddleTab[] = MIDDLE_TABS.filter((t) => !KEPT.includes(t));

// Stable shell for the center: tab bar slot on top, then two bordered
// cards, the middle and the right panel, with the same gap between them
// as beside the sidebar. The resize handle is that gap.
//
// The right panel holds the companion tools — Bart, the Visualizer,
// Replay, Annotations and Activity (lib/workspace-slots.ts) — and holds
// them for good. One shows at a time, but the ones behind are not
// unmounted, only hidden, because most of them lose something real when
// their subtree goes: the Visualizer would come back having forgotten
// its camera and its selection, and Replay would come back at the start
// with its stream to fetch again.
//
// Hidden is `display: none`, and that it is safe was measured rather
// than assumed — for the panel and for the middle, which hides its
// surfaces the same way. React Flow declines to measure a container that
// fails `checkVisibility()` and keeps the last size it had, so the
// canvas keeps its camera; xterm's fit addon does nothing on a box of no
// size, so the shell in Setup keeps its cols, rows and scrollback.
export function CenterPanel({ tabs, middle, middleTab, children, panes, tab, onTabChange, focus, repoId }: CenterPanelProps) {
  const column = usePanelRef();
  const [open, setOpen] = useState(true);


  // The panel starts open. The layout can settle collapsed after
  // hydration, so expand it once on mount rather than trusting
  // defaultSize alone.
  useEffect(() => {
    if (column.current?.isCollapsed()) column.current.expand();
  }, [column]);

  // Something asked for a pane — "Open trace", "Open the terminal", a
  // reference in one of Bart's answers. Choosing it is the caller's job;
  // making it visible is this one's.
  useEffect(() => {
    if (!focus) return;
    if (column.current?.isCollapsed()) column.current.expand();
  }, [focus, column]);

  // With no repository open there is no shell and no trace, so the panel
  // falls back to the one pane that is always there rather than showing
  // an empty column.
  const showing = panes[tab] ? tab : "bart";

  // A pane is mounted the first time it is shown and never unmounted
  // until the repository changes. Not all five at once: Replay would
  // fetch a stream and the Visualizer would build a graph for somebody
  // who opened the repository to read the README. Keyed off what is
  // actually shown rather than off
  // what was asked for, so the fallback above cannot leave the panel
  // holding a pane it is not drawing and nothing else.
  //
  // Nothing new is mounted while the panel is closed. A first mount
  // inside a `hidden` subtree has no box to measure, and the terminal
  // asks the sandbox for a shell the size it thinks it is: it would open
  // one at xterm's default 80x24 and then have no way to correct it,
  // because the PTY does not exist yet when the correction is due. The
  // ones already mounted stay, which is the whole point of not swapping
  // this section for the rail.
  const mounted = useKept<PanelTab>(showing, open, repoId);
  // The same rule for the middle, over the one surface that needs it.
  const keptMiddle = useKept<MiddleTab>(middleTab && KEPT.includes(middleTab) ? middleTab : null, true, repoId);
  const toggle = () => (open ? column.current?.collapse() : column.current?.expand());

  return (
    <main className="flex h-full min-w-0 flex-col bg-background px-6 pt-4 pb-5">
      {tabs}
      <div className="mt-5 flex min-h-0 flex-1">
        <ResizablePanelGroup orientation="horizontal" id="engelbart-workspace">
          <ResizablePanel defaultSize="65" minSize="35">
            <div className="h-full overflow-hidden rounded-lg border">
              {middle && middleTab ? (
                <>
                  {/* Every surface in its own keyed slot, which it never
                      leaves, so moving between tabs is a class change
                      rather than a mount. The eager ones are here from
                      the start; Setup joins them the first time it is
                      asked for. */}
                  {[...EAGER, ...keptMiddle].map((t) => (
                    <div key={t} className={t === middleTab ? "h-full" : "hidden"}>{middle[t]}</div>
                  ))}
                </>
              ) : children}
            </div>
          </ResizablePanel>
          <ResizableHandle className="w-6 bg-transparent" />
          <ResizablePanel
            panelRef={column}
            defaultSize="35"
            // Measured, and left as it is. The five tab names come to
            // 332px at their widest — whichever is selected is the bold
            // one — and the header needs 388 with the gap, the close
            // button and the row's own padding. 28% clears that only when
            // the workspace row is 1386px or wider, which a laptop with a
            // sidebar in front of it is not: dragged to its minimum there,
            // the row scrolls, and it scrolls with no scrollbar, so
            // Activity goes quietly out of sight.
            //
            // The honest fix is a minimum in pixels, and the library will
            // not take one: react-resizable-panels 4.12.4 documents
            // `minSize={388}` and `minSize="388px"` as pixels, clamps the
            // drag at exactly 388 as asked, and then lays the group out at
            // 54% instead of the 35% defaultSize asks for (60% with
            // maxSize removed). Measured both ways against the control.
            // No percentage works either, because what 388px is worth as
            // one depends on the window and on how wide the repository
            // names have made the sidebar.
            //
            // So: the default always fits, every window width, and only a
            // deliberate drag to the very minimum can hide a tab.
            minSize="28"
            maxSize="55"
            collapsible
            collapsedSize="4"
            onResize={() => setOpen(!column.current?.isCollapsed())}
          >
            {/* The shell is white and each tool brings its own surface.
                Bart's is a shade of grey, because a conversation is a
                different kind of thing from the three tools beside it:
                the Visualizer, Replay and Activity are evidence about the
                run, and evidence is read on paper. */}
            <div className="h-full overflow-hidden rounded-lg border bg-background">
              {/* Hidden rather than swapped out when the panel is closed,
                  for the same reason the panes behind are: collapsing the
                  column used to kill the shell running in it. */}
              <section aria-label="Companion tools" className={open ? "flex h-full min-w-0 flex-col" : "hidden"}>
                {/* px-2.5, not pl-2.5 pr-1.5: the row was inset 10px on
                    the left and 6px on the right, so the collapse icon sat
                    nearer its edge than the first tab sat to its own. */}
                <header className="flex h-9 shrink-0 items-center gap-1 border-b px-2.5">
                  {/* Only the panes there is something to show in. With
                      no repository open there is no shell, no graph and
                      nothing to replay, and a tab that answers a click
                      with nothing at all is worse than no tab. */}
                  <div role="tablist" aria-label="Right panel" className="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {PANEL_TABS.filter((t) => panes[t]).map((t) => (
                      <PanelTabButton key={t} active={showing === t} onSelect={() => onTabChange(t)}>{TAB_LABEL[t]}</PanelTabButton>
                    ))}
                  </div>
                  <Button variant="ghost" size="icon" aria-label="Close the panel" title="Close the panel" onClick={toggle} className="ml-auto size-7 text-muted-foreground">
                    <PanelRight className="size-4" />
                  </Button>
                </header>
                <div className="flex min-h-0 flex-1 flex-col">
                  {mounted.map((t) => (
                    <div key={t} className={t === showing ? "flex min-h-0 flex-1 flex-col" : "hidden"}>{panes[t]}</div>
                  ))}
                </div>
              </section>
              {!open && (
                <aside className="flex h-full flex-col items-center bg-[#f6f6f6] pt-4">
                  <Button variant="ghost" size="icon" aria-label="Open the panel" title={`Open ${TAB_LABEL[showing]}`} onClick={toggle} className="size-7 text-muted-foreground">
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

// Which surfaces of a bar are in the tree: every one that has been shown
// since this repository was opened, in the order they were first shown.
// Append-only, because the point is that nothing ever leaves; reset the
// moment the repository changes, because a different repository is a
// different sandbox and a different shell.
//
// `NONE` is a module singleton so the empty list is identity-equal to
// itself — without it the render-phase write below would fire every
// render and never settle.
function useKept<T extends string>(showing: T | null, active: boolean, repoId: string | null): T[] {
  const [seen, setSeen] = useState<{ repo: string | null; tabs: string[] }>({ repo: repoId, tabs: NONE });
  const before = seen.repo === repoId ? seen.tabs : NONE;
  const mounted = active && showing && !before.includes(showing) ? [...before, showing] : before;
  if (seen.repo !== repoId || mounted !== seen.tabs) setSeen({ repo: repoId, tabs: mounted });
  return mounted as T[];
}

function PanelTabButton({ active, onSelect, children }: { active: boolean; onSelect: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={cn(
        "shrink-0 rounded-md px-2 py-1 text-[13px]",
        active ? "bg-background font-semibold text-foreground shadow-sm" : "font-normal text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
