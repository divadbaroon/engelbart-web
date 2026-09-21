// Bart's mark: three moments and what connects them.
//
// Drawn rather than served. The picture it comes from is
// public/bart_icon_svg.png, 1347 × 1167 and 218 KB, for a mark that
// appears at 20 px beside a heading and 85 px over an empty
// conversation — so the file is the source and this is the copy, six
// shapes and no request.
//
// Everything below is measured off that file rather than eyeballed: the
// opaque pixels were separated from the transparent ground, the three
// discs found by taking every pixel with a 16-px radius of ink around
// it and clustering the result, and each centre, radius and fill read
// off. One unit here is ten pixels there, so the numbers can be checked
// against the file by multiplying by ten.
//
//   node          centre          r       fill
//   top right     67.7,  7.7      7.7     #28686f
//   left          10.1, 51.7     10.1     #7cacad
//   bottom        52.6, 84.4     12.3     #d0e5e6
//   lines                         1.74    #5b777b
//
// The fills are the medians of each disc's inner half, so no edge pixel
// blended with the ground got into them, and the stroke is the measured
// perpendicular thickness at the midpoint of each edge — 17.0, 17.5 and
// 17.8 px, which is one weight drawn three times, not three weights.
//
// It was drawn from a different file until now (public/bart_icon2.png,
// still there), and that file was a screenshot of the same mark on a
// #1e1e1e canvas. Every disc in it had the ground mixed into its edges
// and its body: the measurements came back #2a4749, #5e7f80 and
// #bacac9, against #28686f, #7cacad and #d0e5e6 here. So the mark has
// been a darkened, greyer copy of itself, and the tell was that its
// teal kept reading as slate — measured correctly, from the wrong
// picture.
//
// The lines are now measured too, at #5b777b. Their value used to be
// the one thing in this file that was a judgement: a line read against
// black is a line that disappears against #f6f6f6, so it had been
// darkened a step by hand. The new file has no ground to read them
// against and needs no such correction.

export function BartMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 75.4 96.7"
      fill="none"
      aria-hidden
      focusable="false"
      className={className}
    >
      {/* Under the nodes, so a line meeting a node is ended by it. */}
      <g stroke="#5b777b" strokeWidth={1.74} strokeLinecap="round">
        <line x1={67.7} y1={7.7} x2={10.1} y2={51.7} />
        <line x1={67.7} y1={7.7} x2={52.6} y2={84.4} />
        <line x1={10.1} y1={51.7} x2={52.6} y2={84.4} />
      </g>
      <circle cx={67.7} cy={7.7} r={7.7} fill="#28686f" />
      <circle cx={10.1} cy={51.7} r={10.1} fill="#7cacad" />
      <circle cx={52.6} cy={84.4} r={12.3} fill="#d0e5e6" />
    </svg>
  );
}
