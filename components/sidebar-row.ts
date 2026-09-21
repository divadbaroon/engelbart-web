// The row that every line in the project sidebar is.
//
// Repositories and papers are two lists of the same thing — something in
// this project you can open — so they are drawn the same way: an icon, a
// name, and a quiet second line under it. It was two different lists
// before, one flat and one a stack of bordered cards, and switching
// between them in the rail changed the shape of the panel as well as its
// contents.
//
// A row is a contained surface again, but not a card. The panel is grey
// (#f6f6f6, the same grey as the collapsed rail and the Bart pane) and
// each row is a white box on it with the app's own hairline round it —
// bare `border`, which app/globals.css resolves to #e5e5e5 on every
// element, and `rounded-md`, the 6px the app uses for everything drawn
// *inside* a panel frame. The frames themselves are `rounded-lg`. So a
// repository is the same kind of object as a build step or a recording,
// at the same weight, and the sidebar stops being one grey slab.
//
// The strings live here rather than in either list so that neither can
// drift from the other, and so `lib/sidebar-width.ts` — which adds these
// paddings up to size the panel — has one place to read them from.
//
// Under components/ and not lib/ because Tailwind only scans pages,
// components, app and src (tailwind.config.ts): a class named nowhere
// else in the project is not generated at all from a file outside those,
// and the row comes back with the padding silently missing.

// The box every row has, action rows included, so that a name, a link
// being typed and "Add repository" all start at the same pixel. The
// border is in here rather than in `SURFACE` for exactly that reason:
// a row with no edges still has to stand in the same place as one with.
export const ROW = "flex w-full items-center gap-2.5 rounded-md border px-3 py-1.5 text-left";

// A row that is a thing in the project: white paper on the panel's grey,
// with the hairline it came with. Hover moves the edge, not the ground —
// a fill would be a second surface arriving under the pointer.
export const SURFACE = "border-border bg-background transition-colors hover:border-neutral-300";

// The one you are in. A faint fill and a firmer edge, not a slab: the
// fill is six steps under the panel so the row still reads as paper,
// and the border is what actually carries the selection.
export const ACTIVE = "border-neutral-400 bg-[#f0f0f0] hover:border-neutral-400";

// A row that is an action rather than an object — "Add repository", a
// draft being typed. Same box, no edges, and here the ground *is* the
// feedback, because there is no border to move.
export const PLAIN = "border-transparent transition-colors hover:bg-[#ececec]";

// For the things in the panel that are not rows at all and still want
// the same quiet fill under the pointer.
export const HOVER = "transition-colors hover:bg-[#ececec]";

// The leading icon: what kind of thing the row is, at the weight of a
// bullet rather than of a symbol.
export const ICON = "size-[15px] shrink-0 text-muted-foreground/70";

// The room the name and its second line give up at the end of the row so
// that the remove button, which is out of flow and centred over the row,
// never stands on the last few letters. `NAME_ROOM` in
// lib/sidebar-width.ts counts the same lane.
export const NAME = "flex min-w-0 flex-1 flex-col pr-5";

// The name, and the same name on the row you are in. Selection is a
// weight as well as a border, so it reads without relying on the edge.
// Both lists say it the same way rather than each writing it out.
export const TITLE = "truncate text-sm leading-5 text-foreground/90";
export const TITLE_ON = "truncate text-sm leading-5 font-medium text-foreground";

// The second line, under the name: quieter and smaller, and the same
// size in both lists whatever it is carrying.
export const META = "truncate text-xs leading-4 text-muted-foreground";

// The remove button, in the lane `NAME` leaves it: centred on the row,
// and with no fill of its own on hover. A ghost button's accent fill put
// a small box over the row it was in, which read as a second surface
// arriving rather than as a control waking up; the icon going from grey
// to black is the whole of the feedback it needs.
export const REMOVE =
  "absolute top-1/2 right-1.5 size-6 -translate-y-1/2 rounded text-muted-foreground/60 opacity-0 hover:bg-transparent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100";
