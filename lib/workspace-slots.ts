// Where a repository's surfaces are shown. There are two tab bars, and a
// surface belongs to one of them for good.
//
// The middle bar holds the work: the README, the code, the running
// application, and Setup — what the repository is given to run with, a
// shell in the sandbox, and how the run went. The right bar holds the
// companion tools, one job each: Bart to ask, the Visualizer to see what
// caused what, Replay to watch the session back, Annotations to read
// what was written on the interface, and Activity to read what a person
// was doing.
//
// Annotations sits after Replay and before Activity because the bar runs
// from what you say about the work to what the work did: asking, then
// the causes, then the session played back, then the notes left on it,
// then the reading of the session. It is also the only one of the five
// that is not a reading of a run — notes belong to the repository and
// outlive the sandbox they were written in — which is why it is next to
// the two that are furthest from the machine rather than beside the
// Visualizer.
//
// The Terminal is in Setup and not here. It is not a companion to the
// work the way the other five are — they are all readings of a run, made
// after the fact and beside whatever you are doing, and a shell is a way
// of doing something to the machine. It belongs with the other controls
// over the sandbox.
//
// Nothing moves between the bars any more, so there is no algebra here:
// only the two lists, a name for each surface, and the one function that
// says which bar owns the thing you asked to see. Pure.
export type MiddleTab = "readme" | "code" | "preview" | "setup";
export type PanelTab = "bart" | "trace" | "replay" | "annotations" | "activity";
export type Surface = MiddleTab | PanelTab;
export type Slots = { middle: MiddleTab; panel: PanelTab };

export const MIDDLE_TABS: MiddleTab[] = ["readme", "code", "preview", "setup"];
export const PANEL_TABS: PanelTab[] = ["bart", "trace", "replay", "annotations", "activity"];

// The Visualizer's key stays `trace`: it draws the behavior trace, which
// is what the whole subsystem under lib/trace is called, and renaming the
// key would only move the mismatch into every remembered layout. Replay's
// key is its own, because a recording is not the trace of one.
export const TAB_LABEL: Record<Surface, string> = {
  readme: "README", code: "Code", preview: "Live preview", setup: "Setup",
  bart: "Bart", trace: "Visualizer", replay: "Replay", annotations: "Annotations", activity: "Activity",
};

// Tabs that were renamed rather than removed, so a remembered layout
// lands on the surface that took the old one's place instead of on the
// default. A Map and not an object: the key comes out of localStorage,
// and a plain object would answer "constructor" with a function and
// "__proto__" with the prototype, either of which would then be handed
// on as if it were a tab.
const RENAMED = new Map<string, MiddleTab>([["env", "setup"], ["terminal", "setup"]]);

export const isMiddleTab = (v: unknown): v is MiddleTab => typeof v === "string" && (MIDDLE_TABS as string[]).includes(v);
export const isPanelTab = (v: unknown): v is PanelTab => typeof v === "string" && (PANEL_TABS as string[]).includes(v);

// Bring a surface to the front of whichever bar owns it, and leave the
// other bar alone: opening the Visualizer from the running application
// should not take the running application off the screen.
export function showTab(s: Slots, t: Surface): Slots {
  return isPanelTab(t) ? { ...s, panel: t } : { ...s, middle: t };
}

// A remembered pair, made consistent — and brought forward from when the
// Terminal and the Trace were middle tabs that could be sent aside. A
// middle that now belongs to the panel is not thrown away: it is put
// where it lives now, and the middle falls back to the running
// application, which is what it was beside. A remembered Terminal goes to
// Setup, which is where the shell is now, whichever bar it was written
// in. Anything unrecognised — a tab since deleted, a truncated write —
// reads as the defaults.
export function normalize(middle: unknown, panel: unknown): Slots {
  const moved = isPanelTab(middle) ? middle : null;
  const renamed = typeof middle === "string" ? RENAMED.get(middle) : undefined;
  return {
    middle: isMiddleTab(middle) ? middle : renamed ?? (moved ? "preview" : "readme"),
    panel: isPanelTab(panel) ? panel : moved ?? "bart",
  };
}
