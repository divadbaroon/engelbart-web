"use client";

import { useEffect, useRef } from "react";
import { envelope, previewOrigin, readUp } from "@/lib/annotations/protocol";

// Asking the running application what it holds.
//
// This is the quietest thing the workspace does to a page. A survey turns
// nothing on: no picker, no overlay, no listener, no trace event. Each
// instrumented document answers with the parts it offers, described by
// the same describe() that names an element anywhere else, and then the
// page is exactly as it was.
//
// It is asked more than once because a document is not all there at once:
// the bridge in the top document arrives before the ones in its embedded
// frames, and a frame may attach seconds after the page has loaded. A
// document that answers twice is no trouble — the workspace asks about an
// interface once and ignores the rest.
const ASK_MS = [400, 1800, 5000];

export function useSurvey(
  frame: React.RefObject<HTMLIFrameElement | null>,
  previewUrl: string | null,
  enabled: boolean,
  reloads: number,
  onSurveyed: (survey: unknown) => void,
) {
  const origin = previewOrigin(previewUrl);
  const heard = useRef(onSurveyed);
  heard.current = onSurveyed;

  // Only the document in this frame, on the origin it was served from.
  // Anything else posting into this window is not the preview, whatever
  // it says about itself.
  useEffect(() => {
    if (!enabled || !origin) return;
    function onMessage(e: MessageEvent) {
      if (e.origin !== origin) return;
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const msg = readUp(e.data);
      if (msg?.type !== "surveyed") return;
      heard.current({ route: msg.route, documentTitle: msg.title, frame: msg.frame, candidates: msg.candidates, truncated: msg.truncated });
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [enabled, origin, frame]);

  useEffect(() => {
    if (!enabled || !origin) return;
    const ask = () => {
      const win = frame.current?.contentWindow;
      if (!win) return;
      try { win.postMessage(envelope({ type: "survey" }), origin); } catch { /* the frame is gone */ }
    };
    const timers = ASK_MS.map((ms) => setTimeout(ask, ms));
    return () => timers.forEach(clearTimeout);
  }, [enabled, origin, frame, reloads]);
}
