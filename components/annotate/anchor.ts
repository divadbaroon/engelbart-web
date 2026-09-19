"use client";

import { useLayoutEffect, useState, type RefObject } from "react";
import type { Rect } from "@/lib/annotations/protocol";

// Where a small panel goes when it belongs to an element inside the
// preview. The rect comes from the page, in that document's viewport;
// the frame's own box turns it into this one's. Both the composer and an
// open note float over the iframe rather than inside it: wrapping that
// iframe in one more element would remount it and reload the running
// application.
export const PANEL_WIDTH = 320;
const GAP = 8;

export type Anchored = { left: number; top: number; outline: { left: number; top: number; width: number; height: number } | null };

export function useAnchor(frame: RefObject<HTMLIFrameElement | null>, rect: Rect | null, on: boolean): Anchored | null {
  const [box, setBox] = useState<Anchored | null>(null);
  useLayoutEffect(() => {
    function place() {
      const el = frame.current;
      if (!el || !on) { setBox(null); return; }
      const f = el.getBoundingClientRect();
      const outline = rect ? { left: f.left + rect.x, top: f.top + rect.y, width: rect.w, height: rect.h } : null;
      const left = Math.min(Math.max(GAP, outline ? outline.left : f.left + f.width / 2 - PANEL_WIDTH / 2), window.innerWidth - PANEL_WIDTH - GAP);
      const below = outline ? outline.top + outline.height + GAP : f.top + f.height / 2;
      setBox({ left, top: Math.max(GAP, Math.min(below, window.innerHeight - 200)), outline });
    }
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [frame, rect, on]);
  return box;
}
