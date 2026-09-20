"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CanvasFrame } from "@/lib/annotations/protocol";
import { envelope, previewOrigin, readUp } from "@/lib/annotations/protocol";

// Capturing what the preview looked like, while a recording is open.
//
// The recording itself is unchanged by this: it is still a name and two
// clock readings over the run's trace, and it is started and stopped by
// the same button as before. This follows that lifecycle rather than
// having one of its own — there is no second notion of recording here, and
// nothing to get out of step with.
//
// What arrives is an rrweb stream in parts, over the same origin-pinned
// channel the picker and the survey use. It is held in memory until Stop,
// then handed over whole. It never touches the events endpoint: that one
// is unauthenticated, reachable by anyone with the preview URL, and
// broadcast to every viewer of the run.
//
// The parts are kept opaque. Nothing here reads inside them. The pictures
// of canvases the recorder could not see arrive beside them, already
// rebuilt by `readUp`, and are kept beside them.
export type Capture = {
  // Ready when the page has said it started; until then a Stop would have
  // nothing to save, which is worth saying rather than saving an empty file.
  capturing: boolean;
  // The page answered that it cannot record — no recorder on the image, or
  // the recorder would not start. A sentence for the header, not an error.
  unavailable: string | null;
  parts: number;
  events: number;
  frames: number;
  dropped: number;
  truncated: boolean;
  startedAt: number | null;
  // Stop the page recording and take everything it sent. Safe to call when
  // nothing was captured: the answer is then null and the recording is
  // saved without a replay, which is what a recording has always been.
  finish: () => Promise<Taken | null>;
};

export type Taken = { startedAt: number; events: unknown[]; canvas: CanvasFrame[]; dropped: number; truncated: boolean };

// How long to wait after Stop for the last part. The bridge posts what it
// is holding as soon as it is told to stop, so this is the round trip and
// a little: long enough not to clip the end, short enough that Stop still
// feels like Stop.
const LAST_PART_MS = 700;

export function useCapture(
  frame: React.RefObject<HTMLIFrameElement | null>,
  previewUrl: string | null,
  // Whether a recording is open. This is the whole trigger; the hook has
  // no opinion about when one should be.
  recording: boolean,
  // Bumped when the preview reloads, so a new document is asked again. A
  // reload during a recording starts a fresh stream, which the replayer
  // reads as a second whole picture in the same array.
  reloads: number,
): Capture {
  const origin = previewOrigin(previewUrl);
  const stream = useRef<unknown[]>([]);
  const painted = useRef<CanvasFrame[]>([]);
  const [state, setState] = useState<{ capturing: boolean; unavailable: string | null; parts: number; events: number; frames: number; dropped: number; truncated: boolean; startedAt: number | null }>(
    { capturing: false, unavailable: null, parts: 0, events: 0, frames: 0, dropped: 0, truncated: false, startedAt: null },
  );

  // Only the document in this frame, on the origin it was served from.
  useEffect(() => {
    if (!origin) return;
    function onMessage(e: MessageEvent) {
      if (e.origin !== origin) return;
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const msg = readUp(e.data);
      if (msg?.type !== "replay") return;
      if (msg.phase === "unavailable") { setState((s) => ({ ...s, capturing: false, unavailable: msg.reason })); return; }
      if (msg.phase === "start") { setState((s) => ({ ...s, capturing: true, unavailable: null, startedAt: s.startedAt ?? msg.startedAt })); return; }
      stream.current = stream.current.concat(msg.events);
      painted.current = painted.current.concat(msg.canvas);
      setState((s) => ({
        ...s, capturing: true, unavailable: null,
        parts: s.parts + 1, events: stream.current.length, frames: painted.current.length,
        dropped: Math.max(s.dropped, msg.dropped), truncated: s.truncated || msg.truncated,
        startedAt: s.startedAt ?? msg.startedAt,
      }));
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [origin, frame]);

  const tell = useCallback((on: boolean) => {
    const win = frame.current?.contentWindow;
    if (!win || !origin) return;
    try { win.postMessage(envelope({ type: "record", on }), origin); } catch { /* the frame is gone */ }
  }, [frame, origin]);

  // Start when a recording opens, and again when the document under us is
  // replaced: a reload is a new page with a new bridge, which has not been
  // asked for anything.
  useEffect(() => {
    if (!recording || !origin) return;
    stream.current = [];
    painted.current = [];
    setState({ capturing: false, unavailable: null, parts: 0, events: 0, frames: 0, dropped: 0, truncated: false, startedAt: null });
    // The bridge in a document that has only just been served may not be
    // listening yet. Two asks cost nothing: starting twice is a no-op in
    // the page.
    tell(true);
    const again = setTimeout(() => tell(true), 600);
    return () => clearTimeout(again);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, origin, reloads]);

  const finish = useCallback(async (): Promise<Taken | null> => {
    if (!origin) return null;
    tell(false);
    await new Promise((r) => setTimeout(r, LAST_PART_MS));
    const events = stream.current, canvas = painted.current;
    stream.current = []; painted.current = [];
    const startedAt = state.startedAt;
    setState({ capturing: false, unavailable: null, parts: 0, events: 0, frames: 0, dropped: 0, truncated: false, startedAt: null });
    if (!events.length || startedAt === null) return null;
    return { startedAt, events, canvas, dropped: state.dropped, truncated: state.truncated };
  }, [origin, tell, state.startedAt, state.dropped, state.truncated]);

  return { ...state, finish };
}
