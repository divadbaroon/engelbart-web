// How wide the project sidebar needs to be.
//
// It was 18% of the window. A repository list has a natural width — the
// longest name in it — and on a wide screen 18% is that name followed by
// a column of nothing, taken from the workspace beside it. So the
// sidebar is the widest name it has to show, plus the room around it,
// and no more.
//
// The measuring and the arithmetic are separate on purpose. What a
// string is worth in pixels depends on the font the browser actually
// resolved, which only the browser knows; everything else is the padding
// of a row, which is a fact about this layout and is what is worth
// getting right.

// The room a repository row needs either side of the name, added up from
// what the row is actually made of (components/sidebar-row.ts): the sidebar's
// own padding (px-4, so 32), the row's border (1 a side, so 2) and its
// padding (px-3, so 24), the branch icon (15) and its gap (gap-2.5, so
// 10), and the lane the name gives up at the end of the row so that the
// remove button, which is out of flow, never stands over the last few
// letters (`NAME`'s pr-5, so 20).
//
// That is 103. The rest is slack, so the longest name in a project is
// not drawn flush against the button that removes it.
export const NAME_ROOM = 110;

// Below this the sidebar's own header, the "Add repository" row and the
// paper list stop reading as anything, so a project with one short
// repository name still gets a usable panel.
export const MIN_WIDTH = 190;

// And above this a long repository name is taking more of the window
// than it is worth; the name truncates instead, as it always did.
export const MAX_WIDTH = 420;

export function sidebarWidth(widestName: number): number {
  return Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, widestName + NAME_ROOM)));
}

// The widest of these strings, in the font they will be drawn in.
//
// A canvas rather than the DOM: the names are drawn truncated, so a
// rendered row cannot be asked how wide it wanted to be without reaching
// for `scrollWidth` on every one of them, and this costs no layout at
// all. Returns 0 where there is no canvas — on the server, and in a test
// — so the caller falls back to the minimum rather than to nothing.
export function widestText(texts: string[], font: string): number {
  if (!texts.length || typeof document === "undefined") return 0;
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return 0;
  context.font = font;
  return texts.reduce((widest, text) => Math.max(widest, context.measureText(text).width), 0);
}

// What a repository name is drawn in (`text-sm` on the app's sans
// stack). Kept beside the arithmetic so the two cannot drift apart
// without somebody seeing both. Measured at the selected row's weight,
// which is the heavier of the two a name can be drawn at: a panel sized
// for the lighter one would truncate the name as soon as it was chosen.
export const NAME_FONT = '500 14px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
