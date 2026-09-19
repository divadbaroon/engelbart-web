// Finding the meaning of an element that has already been described.
//
// A semantic map is made once. Everything after that is this: a trace
// event carries an ElementTarget, and this module says which named thing
// that target is, or says nothing. It never calls a model, never touches
// the DOM, and never changes its answer for the same inputs.
//
// The ladder is the one resolveAnchor climbs in the page, for the same
// reason and in the same order: a test id was written by a person and
// means what it says; a good id nearly always does; a selector describes
// where something sat rather than what it is; and the shape of an element
// — what it is, what part it plays, what it is called — is the last
// honest thing to try. A rung that would match two different named things
// does not match at all, because half a label is worse than none.
//
// Nothing here replaces anything. A caller asks, and either gets a label
// to show beside the evidence or gets null and shows the evidence alone.
// Pure: no DOM, no network, no database.
import type { ElementTarget } from "@/lib/trace/types";
import type { FrameRef } from "@/lib/annotations/target";
import type { SemanticMatch, SemanticNode, UISemanticMap } from "@/lib/semantics/types";

// The maps of every document of a run, arranged for lookup. Built once
// from the rows and then read; building it twice is wasted work, not a
// wrong answer.
export type SemanticIndex = {
  maps: UISemanticMap[];
  byTestid: Map<string, SemanticNode[]>;
  byId: Map<string, SemanticNode[]>;
  bySelector: Map<string, SemanticNode[]>;
  byShape: Map<string, SemanticNode[]>;
  byFrame: Map<string, UISemanticMap>;
  labels: Map<string, string>;          // semanticId -> label, for naming a region a control sits in
};

export const EMPTY_INDEX: SemanticIndex = {
  maps: [], byTestid: new Map(), byId: new Map(), bySelector: new Map(),
  byShape: new Map(), byFrame: new Map(), labels: new Map(),
};

// Where a frame is, as a string that survives a reload. The frame's id
// does not — it is minted per served document — so the path of <iframe>
// selectors from the top document down is what identifies it.
export const framePath = (f: FrameRef): string => (f.depth === 0 && !f.path.length ? "top" : f.path.join(" → ") || `depth:${f.depth}`);

// What an element is, when nothing was written on it to say. Kept
// deliberately coarse: a tag, the part it plays, and what it is called.
const shapeKey = (t: ElementTarget): string | null => {
  const said = t.label ?? t.name ?? t.text;
  return t.tag && said ? `${t.tag}|${t.role ?? ""}|${said.replace(/\s+/g, " ").trim().slice(0, 60)}` : null;
};

const push = (m: Map<string, SemanticNode[]>, k: string | null | undefined, n: SemanticNode) => {
  if (!k) return;
  const had = m.get(k);
  if (had) had.push(n); else m.set(k, [n]);
};

export function buildIndex(maps: UISemanticMap[]): SemanticIndex {
  const index: SemanticIndex = {
    maps, byTestid: new Map(), byId: new Map(), bySelector: new Map(),
    byShape: new Map(), byFrame: new Map(), labels: new Map(),
  };
  for (const map of maps) {
    index.byFrame.set(framePath(map.frame), map);
    for (const node of [...map.regions, ...map.controls]) {
      index.labels.set(node.semanticId, node.label);
      for (const t of node.targets) {
        push(index.byTestid, t.testid, node);
        push(index.byId, t.id, node);
        push(index.bySelector, t.selector, node);
        push(index.byShape, shapeKey(t), node);
      }
    }
  }
  return index;
}

// One named thing, or nothing. A rung whose bucket holds two different
// named things is skipped: the next rung is narrower, not wider, so a
// crowded bucket means this handle does not tell them apart.
const only = (found: SemanticNode[] | undefined): SemanticNode | null => {
  if (!found?.length) return null;
  const first = found[0];
  return found.every((n) => n.semanticId === first.semanticId) ? first : null;
};

const matched = (n: SemanticNode, matchedOn: SemanticMatch["matchedOn"]): SemanticMatch =>
  ({ semanticId: n.semanticId, label: n.label, kind: n.kind, confidence: n.confidence, regionId: n.regionId, matchedOn });

export function lookupTarget(index: SemanticIndex, target: ElementTarget | null): SemanticMatch | null {
  if (!target) return null;
  const byTestid = target.testid ? only(index.byTestid.get(target.testid)) : null;
  if (byTestid) return matched(byTestid, "testid");
  const byId = target.id ? only(index.byId.get(target.id)) : null;
  if (byId) return matched(byId, "id");
  const bySelector = target.selector ? only(index.bySelector.get(target.selector)) : null;
  if (bySelector) return matched(bySelector, "selector");
  const key = shapeKey(target);
  const byShape = key ? only(index.byShape.get(key)) : null;
  return byShape ? matched(byShape, "shape") : null;
}

// What a whole document is. This is the one that turns "embedded frame ·
// solution" into the name of the thing in it, and it is a separate
// question from what any element inside it is.
export function lookupFrame(index: SemanticIndex, frame: FrameRef | null): SemanticMatch | null {
  if (!frame) return null;
  const map = index.byFrame.get(framePath(frame));
  if (!map?.documentLabel) return null;
  return { semanticId: `document:${framePath(frame)}`, label: map.documentLabel, kind: "region", confidence: map.documentConfidence, regionId: null, matchedOn: "frame" };
}

// Whether a reading is worth putting in front of a raw one. A low
// confidence label is still shown — as a subtitle, beside the evidence —
// but it never takes the place of a description the page itself gave.
export const leads = (m: SemanticMatch | null): boolean => !!m && m.confidence !== "low";

// The region a matched control sits in, by name.
export const regionLabel = (index: SemanticIndex, m: SemanticMatch | null): string | null =>
  (m?.regionId ? index.labels.get(m.regionId) ?? null : null);
