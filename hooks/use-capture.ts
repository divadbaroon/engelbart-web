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
  // Asked, and nothing has come back either way. Not an error — a preview
  // that is slow to serve its document is briefly silent — but past the
  // point where it is worth saying so, because the alternative is a red
  // dot ticking for four minutes over a recording of nothing.
  silent: boolean;
  // The document under the frame has been replaced: ask the new one. The
  // frame's load event is the only signal the workspace gets that this
  // has happened, so the component that owns the iframe calls this.
  rearm: () => void;
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

// How long the page may say nothing before the header says so. Past the
// last rung of the ladder below, so it is only ever reached after every
// ask has gone unanswered. It is not final: `capturing` arriving later
// takes the line away again.
const SILENT_MS = 4_000;

// When to ask, in milliseconds from the moment there is something to ask
// about. A ladder rather than one ask and one retry, because the ask can
// miss for a reason that has nothing to do with the page — see below.
const ASK_AT = [0, 250, 750, 1500, 3000, 5000];

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
  const [silent, setSilent] = useState(false);
  // Bumped by `rearm`, purely to start the ladder again over a document
  // that has just arrived.
  const [rearms, setRearms] = useState(0);
  const rearm = useCallback(() => { setSilent(false); setRearms((n) => n + 1); }, []);

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

  // Emptying the buffers: when a recording opens, and when the preview is
  // swapped for a different service — not when the page reloads.
  //
  // This used to be the first three lines of the arming effect below,
  // which has `reloads` in its dependencies, so every reload threw away
  // everything recorded up to it. Saving a file in the Code tab reloads
  // the preview, so recording a session in which you edited anything kept
  // only the part after the last save, and a save near the end left a
  // recording with no replay at all. A reload is a new document with a new
  // rrweb, whose fresh snapshot the replayer reads as a second whole
  // picture in the same array — which only works if the array survives it.
  const was = useRef<{ open: boolean; origin: string | null }>({ open: false, origin: null });
  useEffect(() => {
    const open = recording && !!origin;
    const fresh = open && (!was.current.open || origin !== was.current.origin);
    was.current = { open, origin };
    if (!fresh) return;
    stream.current = [];
    painted.current = [];
    setState({ capturing: false, unavailable: null, parts: 0, events: 0, frames: 0, dropped: 0, truncated: false, startedAt: null });
    setSilent(false);
  }, [recording, origin]);

  // Asking the page to record, until it answers.
  //
  // It was one post and a single retry 600ms later, and both could miss
  // for a reason that has nothing to do with the page: `reloads` is the
  // iframe's React key, so a reload inserts a brand-new element, and this
  // effect runs in that same commit — while the frame still holds
  // about:blank. A post with a concrete target origin at a window that is
  // not on that origin is dropped by the browser without a word. If the
  // preview then took longer than 600ms to serve its document, nothing
  // ever asked again: the recording captured nothing while the button
  // ticked away, which is most of what "sometimes it doesn't record" was.
  //
  // So: a ladder, stopped the moment the page answers either way, and
  // `rearm` from the frame's load event, which is the only signal the
  // workspace actually gets that a new document is in it. Asking twice is
  // a no-op in the page (`if (capture) return;`), so an extra rung costs
  // nothing.
  useEffect(() => {
    if (!recording || !origin) return;
    if (state.capturing || state.unavailable) return;
    const timers = ASK_AT.map((ms) => setTimeout(() => tell(true), ms));
    const quiet = setTimeout(() => setSilent(true), SILENT_MS);
    return () => { timers.forEach(clearTimeout); clearTimeout(quiet); };
  }, [recording, origin, reloads, rearms, state.capturing, state.unavailable, tell]);

  const finish = useCallback(async (): Promise<Taken | null> => {
    if (!origin) return null;
    tell(false);
    await new Promise((r) => setTimeout(r, LAST_PART_MS));
    const events = stream.current, canvas = painted.current;
    stream.current = []; painted.current = [];
    const startedAt = state.startedAt;
    setState({ capturing: false, unavailable: null, parts: 0, events: 0, frames: 0, dropped: 0, truncated: false, startedAt: null });
    setSilent(false);
    if (!events.length || startedAt === null) return null;
    return { startedAt, events, canvas, dropped: state.dropped, truncated: state.truncated };
  }, [origin, tell, state.startedAt, state.dropped, state.truncated]);

  return { ...state, silent, rearm, finish };
}
