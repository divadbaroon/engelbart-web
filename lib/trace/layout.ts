// Where things go on the canvas. One axis: the moments left to right in
// time order, all one width, top edges level, so where a moment stands
// never depends on what is selected. Only the selected moment grows, and
// downward; only a selected model call has branches: the request context
// stacked above and to its left, feeding it, and the output hung below
// it. Pure: no DOM, no React.
export const MOMENT_W = 240;    // every moment card
export const SPINE_GAP = 56;    // between moments; a pause is written in it
export const BRANCH_W = 280;    // a context or output card
export const BRANCH_GAP = 44;   // from a moment up to its context, down to its output
export const COL_GAP = 40;      // from the context stack across to the model it feeds
export const CARD_GAP = 36;     // between stacked context cards: each read as its own, the curves apart
export const CAPTION_H = 20;    // room over a branch for its caption

export type Box = { id: string; w: number; h: number };
export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type Branches = { anchor: string; cards: Box[]; output: Box | null };
export type LayoutInput = { moments: Box[]; branches: Branches | null };
export type Layout = {
  positions: Map<string, Point>;
  spine: Rect;                   // every moment
  context: Rect | null;          // the stack of context cards with its caption
  output: Rect | null;           // the output card with its caption
  captions: { context: Point | null; output: Point | null };
};

export function layoutTrace({ moments, branches }: LayoutInput): Layout {
  const positions = new Map<string, Point>();
  moments.forEach((m, i) => positions.set(m.id, { x: i * (MOMENT_W + SPINE_GAP), y: 0 }));
  const spine: Rect = { x: 0, y: 0, w: moments.length ? moments.length * MOMENT_W + (moments.length - 1) * SPINE_GAP : 0, h: Math.max(0, ...moments.map((m) => m.h)) };
  const captions: Layout["captions"] = { context: null, output: null };
  let context: Rect | null = null;
  let output: Rect | null = null;
  const anchor = branches ? moments.find((m) => m.id === branches.anchor) : undefined;
  const at = anchor ? positions.get(anchor.id) : undefined;
  if (branches && anchor && at) {
    if (branches.cards.length) {
      const x = at.x - COL_GAP - BRANCH_W;
      const stackH = branches.cards.reduce((n, c) => n + c.h, 0) + (branches.cards.length - 1) * CARD_GAP;
      const top = -BRANCH_GAP - stackH;
      let y = top;
      for (const c of branches.cards) { positions.set(c.id, { x, y }); y += c.h + CARD_GAP; }
      captions.context = { x, y: top - CAPTION_H };
      context = { x, y: top - CAPTION_H, w: BRANCH_W, h: stackH + CAPTION_H };
    }
    if (branches.output) {
      const x = at.x + (MOMENT_W - BRANCH_W) / 2;
      const y = anchor.h + BRANCH_GAP + CAPTION_H;
      positions.set(branches.output.id, { x, y });
      captions.output = { x, y: y - CAPTION_H };
      output = { x, y: y - CAPTION_H, w: BRANCH_W, h: branches.output.h + CAPTION_H };
    }
  }
  return { positions, spine, context, output, captions };
}
