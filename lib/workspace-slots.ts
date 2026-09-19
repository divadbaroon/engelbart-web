// Where a repository's tabs are shown: one in the middle, and at most one
// more in the right panel, where it shares a tab bar with Bart. A tab is
// in exactly one place. The Live preview and the Terminal stay in the
// middle: moving the preview would remount its iframe and reload the
// running application; moving the terminal would drop its shell. Bart is
// not in this list: it is always the right panel's own tab. Pure.
export type RepoTab = "readme" | "code" | "preview" | "terminal" | "trace" | "env" | "notes";
export type Slots = { middle: RepoTab; side: RepoTab | null };

export const REPO_TABS: RepoTab[] = ["readme", "code", "preview", "terminal", "trace", "env", "notes"];
export const TAB_LABEL: Record<RepoTab, string> = { readme: "README", code: "Code", preview: "Live preview", terminal: "Terminal", trace: "Trace", env: "Environment", notes: "Notes" };
export const isRepoTab = (v: unknown): v is RepoTab => typeof v === "string" && (REPO_TABS as string[]).includes(v);

const STAYS: Partial<Record<RepoTab, string>> = {
  preview: "The Live preview stays in the middle: moving it would reload the running application.",
  terminal: "The Terminal stays in the middle: moving it would drop the shell.",
};
export const canSide = (tab: RepoTab) => !(tab in STAYS);
export const staysReason = (tab: RepoTab): string | null => STAYS[tab] ?? null;

// Send a tab to the side. The middle falls back to the Live preview when
// it was showing that tab, so the application stays usable beside it.
export function sendAside(s: Slots, tab: RepoTab): Slots {
  if (!canSide(tab)) return s;
  return { middle: s.middle === tab ? "preview" : s.middle, side: tab };
}

// Choose a tab in the middle bar. A tab that was on the side comes back.
export function chooseTab(s: Slots, tab: RepoTab): Slots {
  return { middle: tab, side: s.side === tab ? null : s.side };
}

// Show a tab because something needs it seen (a reference, "Open trace",
// the environment): nothing moves if it is already on the side.
export function showTab(s: Slots, tab: RepoTab): Slots {
  return s.side === tab ? s : { ...s, middle: tab };
}

export const closeSide = (s: Slots): Slots => ({ ...s, side: null });
export const sideToMiddle = (s: Slots): Slots => (s.side ? { middle: s.side, side: null } : s);

// A remembered pair, made consistent: a tab cannot be in both places, and
// only tabs that may move are on the side.
export function normalize(middle: unknown, side: unknown): Slots {
  const m = isRepoTab(middle) ? middle : "readme";
  const sd = isRepoTab(side) && canSide(side) ? side : null;
  return { middle: sd && sd === m ? "preview" : m, side: sd };
}
