// What an annotation is fixed to.
//
// The element itself is `ElementTarget` — the same description the
// behavior trace stores, straight from the bridge's describe(). There is
// no second targeting system: an annotation's element and a trace event's
// element are the same shape, read by the same code, described by the
// same describeTarget(). What an annotation adds is only what is needed
// to find that element again later: a few ancestors to recognise it by,
// and which frame it was in.
//
// Nothing here is trusted. The page an annotation is made in is imported
// and untrusted, and everything below arrives from it, so `readAnchor`
// rebuilds the anchor field by field rather than accepting one: unknown
// keys are dropped, every string is capped, and a URL keeps its path and
// loses its query the way the bridge's safeUrl does. Pure: no DOM, no
// network, no database.
import type { ElementTarget } from "@/lib/trace/types";

// How a frame is named. `frameId` is minted per served document and is
// never durable — it is kept only to talk to the page in this session.
// What survives a reload is the rest.
export type FrameRef = {
  frameId: string | null;
  name: string | null;               // the frame's name or title, as the trace names it
  selectorInParent: string | null;   // where the <iframe> sits in its parent
  path: string[];                    // every <iframe> from the top document down to this one
  depth: number;                     // 0 is the top preview document
  kind: "document" | "srcdoc" | "blank" | "blob" | "data";
};

export type AnnotationAnchor = {
  element: ElementTarget;
  ancestors: ElementTarget[];   // nearest first, at most three: recognition, not a path
  frame: FrameRef;
  route: string | null;         // the document's path when the note was written
  documentTitle: string | null;
};

// Which frame a note is in, in a few words. Nothing when it is the page
// itself, which is where most notes are.
export function frameLine(anchor: AnnotationAnchor): string | null {
  const f = anchor.frame;
  const depth = f.depth || f.path.length;
  if (!depth) return null;
  const where = f.name ? `“${f.name}”` : f.selectorInParent ? `at ${f.selectorInParent}` : "an embedded document";
  return `In ${where}, ${depth} frame${depth === 1 ? "" : "s"} inside the page${f.path.length ? ` (${f.path.join(" → ")})` : ""}.`;
}

export const MAX_ANCESTORS = 3;
export const MAX_BODY = 4000;

// ---- reading one from the wire

const CAP: Record<string, number> = {
  tag: 64, selector: 1000, id: 128, name: 64, type: 32, role: 64,
  text: 200, label: 200, placeholder: 200, title: 200, testid: 128,
  href: 2048, action: 2048, method: 16, size: 32, editable: 32, route: 2048,
};
const STRING_KEYS = Object.keys(CAP) as (keyof ElementTarget & keyof typeof CAP)[];
const FRAME_KINDS = new Set<FrameRef["kind"]>(["document", "srcdoc", "blank", "blob", "data"]);
const FRAME_ID = /^f_[a-z0-9]{6,32}$/;

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const text = (v: unknown, max: number): string | undefined => {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s ? s.slice(0, max) : undefined;
};

// A link keeps where it points and loses what it carries, exactly as the
// bridge does: a query string can hold a token, and none of it is needed
// to know which element this is.
function safeHref(v: unknown, max: number): string | undefined {
  const s = text(v, max);
  if (!s) return undefined;
  const q = s.search(/[?#]/);
  if (q < 0) return s;
  const hash = s.indexOf("#");
  const query = s.indexOf("?");
  if (query >= 0 && (hash < 0 || query < hash)) return `${s.slice(0, query)}?…${hash > query ? s.slice(hash, hash + 40) : ""}`;
  return s;
}

// One element, rebuilt from whatever the page sent. Returns null when
// nothing usable is left: an anchor with no tag and no selector could not
// be found again and is not worth storing.
export function readTarget(v: unknown): ElementTarget | null {
  const raw = obj(v);
  if (!raw) return null;
  const out: ElementTarget = {};
  for (const k of STRING_KEYS) {
    const value = k === "href" || k === "action" ? safeHref(raw[k], CAP[k]) : text(raw[k], CAP[k]);
    if (value) (out as Record<string, string>)[k] = value;
  }
  const classes = Array.isArray(raw.classes)
    ? raw.classes.filter((c): c is string => typeof c === "string").slice(0, 8).map((c) => c.slice(0, 64)).filter(Boolean)
    : [];
  if (classes.length) out.classes = classes;
  if (raw.disabled === true) out.disabled = true;
  const r = obj(raw.rect);
  if (r && ["x", "y", "w", "h"].every((k) => typeof r[k] === "number" && Number.isFinite(r[k] as number))) {
    out.rect = { x: Math.round(r.x as number), y: Math.round(r.y as number), w: Math.round(r.w as number), h: Math.round(r.h as number) };
  }
  return out.tag || out.selector ? out : null;
}

export function readFrame(v: unknown): FrameRef {
  const raw = obj(v) ?? {};
  const id = text(raw.frameId, 40);
  const depth = typeof raw.depth === "number" && Number.isFinite(raw.depth) ? Math.min(10, Math.max(0, Math.round(raw.depth))) : 0;
  const kind = FRAME_KINDS.has(raw.kind as FrameRef["kind"]) ? (raw.kind as FrameRef["kind"]) : "document";
  const path = (Array.isArray(raw.path) ? raw.path : [])
    .slice(0, 10).map((v) => text(v, 1000)).filter((v): v is string => !!v);
  return {
    frameId: id && FRAME_ID.test(id) ? id : null,
    name: text(raw.name, 200) ?? null,
    selectorInParent: text(raw.selectorInParent, 1000) ?? path[path.length - 1] ?? null,
    path, depth, kind,
  };
}

export type AnchorResult = { ok: true; anchor: AnnotationAnchor } | { ok: false; error: string };

export function readAnchor(v: unknown): AnchorResult {
  const raw = obj(v);
  if (!raw) return { ok: false, error: "That annotation has no element." };
  const element = readTarget(raw.element);
  if (!element) return { ok: false, error: "That element could not be described well enough to find again." };
  const ancestors = (Array.isArray(raw.ancestors) ? raw.ancestors : [])
    .slice(0, MAX_ANCESTORS).map(readTarget).filter((t): t is ElementTarget => t !== null);
  return {
    ok: true,
    anchor: {
      element, ancestors,
      frame: readFrame(raw.frame),
      route: text(raw.route, CAP.route) ?? element.route ?? null,
      documentTitle: text(raw.documentTitle, 300) ?? null,
    },
  };
}

// The note itself. Whitespace is the author's up to the ends; the length
// is the database's constraint, said here first so the failure is a
// sentence and not a Postgres error.
export function readBody(v: unknown): { ok: true; body: string } | { ok: false; error: string } {
  if (typeof v !== "string") return { ok: false, error: "An annotation needs a note." };
  const body = v.trim();
  if (!body) return { ok: false, error: "An annotation needs a note." };
  if (body.length > MAX_BODY) return { ok: false, error: `That note is too long: ${body.length} characters, and ${MAX_BODY} is the most.` };
  return { ok: true, body };
}
