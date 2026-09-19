// What the workspace and a served document say to each other about
// annotating. It is a small, closed vocabulary over postMessage, because
// nothing else reaches into the preview: the iframe is on the sandbox's
// own origin, the workspace cannot read its DOM, and the bridge's events
// endpoint only goes the other way.
//
// Everything arriving from the page is untrusted — it is the imported
// application's own document — so `readUp` rebuilds each message rather
// than believing one. The page never sends an identity of any kind: no
// project, no run, no user. Those are attached by the server, from rows
// the signed-in member may already read.
export const ANNOTATE = "annotate";
export const ANNOTATE_V = 1;

export type Rect = { x: number; y: number; w: number; h: number };
export type UnavailableFrame = { selectorInParent: string | null; name: string | null; reason: string };

// How sure the page is that it found the element a note was written
// about. "unresolved" is not a failure to report quietly: it is the
// honest answer, and it is what keeps a note off an element it was not
// written about.
export type Confidence = "resolved" | "approximate" | "unresolved";
export type Resolution = { confidence: Confidence; matchedOn: string | null; changed: string | null; rect: Rect | null };

// Workspace → page. The whole vocabulary: arm the picker, put these
// notes' markers up, take the person to one.
export type DownMessage =
  | { type: "mode"; on: boolean }
  | { type: "show"; items: { id: string; anchor: unknown }[] }
  | { type: "flash"; id: string }
  | { type: "survey" };
export const envelope = (msg: DownMessage) => ({ engelbart: ANNOTATE, v: ANNOTATE_V, dir: "down" as const, ...msg });

// Page → workspace.
export type UpMessage =
  | { type: "ready"; frameId: string | null; route: string | null; title: string | null; unavailable: UnavailableFrame[] }
  | { type: "picked"; anchor: unknown; rect: Rect | null; label: string; frameLabel: string | null }
  | { type: "resolved"; items: { id: string; resolution: Resolution }[] }
  | { type: "marker"; id: string }
  | { type: "exited" }
  // What a document holds, asked for once so a model can read it once.
  // The candidates stay `unknown` here: they are the page's own words
  // about itself, and lib/semantics/model.ts is where they are rebuilt.
  | { type: "surveyed"; frame: unknown; route: string | null; title: string | null; candidates: unknown[]; truncated: boolean; unavailable: UnavailableFrame[] };

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
};
const rect = (v: unknown): Rect | null => {
  const r = obj(v);
  if (!r) return null;
  const n = (k: string) => (typeof r[k] === "number" && Number.isFinite(r[k] as number) ? Math.round(r[k] as number) : null);
  const x = n("x"), y = n("y"), w = n("w"), h = n("h");
  return x === null || y === null || w === null || h === null ? null : { x, y, w, h };
};

// How a frame is named to a person: what the trace would call it, or
// where it sits when it has no name of its own. The anchor keeps the
// whole path; this is only the line above the composer.
function frameLabel(frame: Record<string, unknown> | null): string | null {
  if (!frame) return null;
  const depth = typeof frame.depth === "number" ? frame.depth : 0;
  if (!depth) return null;
  return text(frame.name, 64) ?? text(frame.selectorInParent, 64) ?? `${depth} frame${depth === 1 ? "" : "s"} in`;
}

// The most candidates this window will take from one document, whatever
// it claims to have. The bridge caps itself at 120; this is the same
// bound said again on the side that does not trust the page.
export const MAX_SURVEY = 120;

const readUnavailable = (v: unknown): UnavailableFrame[] =>
  (Array.isArray(v) ? v : []).slice(0, 20).map((item) => {
    const f = obj(item);
    return { selectorInParent: text(f?.selectorInParent, 200), name: text(f?.name, 64), reason: text(f?.reason, 40) ?? "unavailable" };
  });

export function readUp(data: unknown): UpMessage | null {
  const msg = obj(data);
  if (!msg || msg.engelbart !== ANNOTATE || msg.dir !== "up") return null;
  switch (msg.type) {
    case "ready": {
      const frame = obj(msg.frame);
      return { type: "ready", frameId: text(frame?.frameId, 40), route: text(msg.route, 2048), title: text(msg.title, 200), unavailable: readUnavailable(msg.unavailable) };
    }
    case "surveyed": {
      const frame = obj(msg.frame);
      if (!frame) return null;
      // Capped here as well as in the page: the cap in the bridge is what
      // a document we shipped will send, and this is what this window
      // will accept from whatever is actually in the frame.
      const candidates = (Array.isArray(msg.candidates) ? msg.candidates : []).slice(0, MAX_SURVEY);
      return {
        type: "surveyed", frame, route: text(msg.route, 2048), title: text(msg.title, 300),
        candidates, truncated: msg.truncated === true || (Array.isArray(msg.candidates) ? msg.candidates.length : 0) > MAX_SURVEY,
        unavailable: readUnavailable(msg.unavailable),
      };
    }
    case "picked": {
      const anchor = obj(msg.anchor);
      if (!anchor) return null;
      return { type: "picked", anchor, rect: rect(msg.rect), label: text(msg.label, 80) ?? "element", frameLabel: frameLabel(obj(anchor.frame)) };
    }
    case "resolved": {
      const items = (Array.isArray(msg.items) ? msg.items : []).slice(0, 500).flatMap((v) => {
        const r = obj(v);
        const id = text(r?.id, 64);
        const confidence: Confidence | null = r?.confidence === "resolved" ? "resolved" : r?.confidence === "approximate" ? "approximate" : null;
        return id && confidence ? [{ id, resolution: { confidence, matchedOn: text(r?.matchedOn, 24), changed: text(r?.changed, 24), rect: rect(r?.rect) } }] : [];
      });
      return { type: "resolved", items };
    }
    case "marker": {
      const id = text(msg.id, 64);
      return id ? { type: "marker", id } : null;
    }
    case "exited":
      return { type: "exited" };
    default:
      return null;
  }
}

// The origin a preview URL is served from, which is both who may be
// spoken to and who may be believed. Anything else that posts to this
// window is not the preview.
export function previewOrigin(url: string | null | undefined): string | null {
  if (!url) return null;
  try { return new URL(url).origin; } catch { return null; }
}
