// Bart's mark: three moments and what connects them.
//
// Drawn rather than served. The picture it comes from
// (public/bart_icon2.png) is a screenshot of a dark canvas — the ground is
// baked into it at #1e1e1e and there is no transparent original — so used
// as an image it arrives as a dark tile sitting on a very light panel,
// which is a logo dropped into an interface rather than a part of one.
//
// Everything below is measured off that file rather than eyeballed: the
// ink was separated from the ground, the three discs found as connected
// components, and each centre, radius and inner colour read off. The
// drawing's bounding box is 72.6 × 103.7 image pixels, which is the
// viewBox, so one unit here is one pixel there and a caller sets the size
// with one class.
//
//   node          centre          r      colour
//   top right     65.1,  7.5      7.5    #2a4749
//   left          10.5, 56.9     10.5    #5e7f80
//   bottom        52.6, 92.2     11.5    #bacac9
//   lines                         1.6    #4a5458 (see below)
//
// The palette is the original's, not an interpretation of it: a very dark
// teal, a mid teal, and a pale one, with slate lines. It was lighter and
// greyer here for a while — a guess at what would sit politely on a light
// panel — and the guess flattened the three nodes into one tone and lost
// the teal. The one thing the ground changes is which node is loudest: on
// black the pale node carries the mark, on #f6f6f6 the dark one does.
//
// The lines are the one value that is not the measurement. The picture
// puts them at about #525b5c, which is a line read against black; against
// #f6f6f6 the same grey is the first thing to disappear, and a mark whose
// edges have gone is three dots. They are darkened a step to #4a5458 —
// still quieter than every node but the palest, still nothing you would
// call a colour, and now visibly joining the three.

export function BartMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 72.6 103.7"
      fill="none"
      aria-hidden
      focusable="false"
      className={className}
    >
      {/* Under the nodes, so a line meeting a node is ended by it. */}
      <g stroke="#4a5458" strokeWidth={1.6} strokeLinecap="round">
        <line x1={65.1} y1={7.5} x2={10.5} y2={56.9} />
        <line x1={65.1} y1={7.5} x2={52.6} y2={92.2} />
        <line x1={10.5} y1={56.9} x2={52.6} y2={92.2} />
      </g>
      <circle cx={65.1} cy={7.5} r={7.5} fill="#2a4749" />
      <circle cx={10.5} cy={56.9} r={10.5} fill="#5e7f80" />
      <circle cx={52.6} cy={92.2} r={11.5} fill="#bacac9" />
    </svg>
  );
}
