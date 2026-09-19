"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { envelope, previewOrigin, readUp, type DownMessage, type Rect, type Resolution, type UnavailableFrame } from "@/lib/annotations/protocol";
import { diagnose, type Diagnosis } from "@/lib/annotations/probe";

// The workspace's half of annotate mode: arm the picker in the preview,
// take what it reports back, and ask it where the saved notes are now.
// Nothing here reads the preview's DOM — it cannot, the document is on
// the sandbox's origin — so every fact about an element comes from the
// page, and everything about who is writing and what they are writing
// stays on this side.
//
// The picker is disarmed the moment something is picked: leaving it on
// would keep an outline chasing the pointer while the note is written,
// and the note is about the element that was chosen.
export type Picked = { anchor: unknown; rect: Rect | null; label: string; frameLabel: string | null };
export type Markable = { id: string; anchor: unknown };

export type Picker = {
  active: boolean;
  picked: Picked | null;
  answered: boolean;                 // the preview has a bridge and answered
  silent: boolean;                   // it was asked and said nothing: this document cannot be annotated
  why: Diagnosis | null;             // and, once the gateway has been asked, which of the reasons it is
  unavailable: UnavailableFrame[];   // frames that cannot be annotated, reported rather than papered over
  resolutions: Record<string, Resolution>;
  start: () => void;
  stop: () => void;
  dismiss: () => void;               // put the composer away; the element stays unannotated
  flash: (id: string) => void;       // take the person to one, if the page found it
};

const ANSWER_MS = 1500;

export function usePicker(
  frame: React.RefObject<HTMLIFrameElement | null>,
  previewUrl: string | null,
  enabled: boolean,
  marks: Markable[],
  onMarker: (id: string) => void,
): Picker {
  const origin = previewOrigin(previewUrl);
  const [active, setActive] = useState(false);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [answered, setAnswered] = useState(false);
  const [silent, setSilent] = useState(false);
  const [why, setWhy] = useState<Diagnosis | null>(null);
  const [unavailable, setUnavailable] = useState<UnavailableFrame[]>([]);
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>({});
  const marker = useRef(onMarker);
  marker.current = onMarker;

  const post = useCallback((msg: DownMessage) => {
    const win = frame.current?.contentWindow;
    if (!win || !origin) return;
    try { win.postMessage(envelope(msg), origin); } catch { /* the frame is gone */ }
  }, [frame, origin]);

  // Only the document in this frame, on the origin it was served from,
  // is listened to. Anything else posting into this window is not the
  // preview, whatever it claims to be.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!origin || e.origin !== origin) return;
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const msg = readUp(e.data);
      if (!msg) return;
      switch (msg.type) {
        case "ready": setAnswered(true); setUnavailable(msg.unavailable); return;
        case "exited": setActive(false); return;
        case "marker": marker.current(msg.id); return;
        case "resolved":
          setResolutions((all) => { const next = { ...all }; for (const i of msg.items) next[i.id] = i.resolution; return next; });
          return;
        case "picked":
          setPicked({ anchor: msg.anchor, rect: msg.rect, label: msg.label, frameLabel: msg.frameLabel });
          setActive(false);
          post({ type: "mode", on: false });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [origin, frame, post]);

  // Esc leaves from this side too: the preview swallows the key while the
  // pointer is in it, but the focus is often out here.
  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") { setActive(false); post({ type: "mode", on: false }); } }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, post]);

  // A document with no bridge in it — an untraced run, or one whose
  // Content-Security-Policy refused the injection — simply never answers.
  // That is said as it is rather than shown as a picker that does nothing.
  useEffect(() => {
    if (!active) { setAnswered(false); setSilent(false); setWhy(null); return; }
    post({ type: "mode", on: true });
    const t = setTimeout(() => setSilent(true), ANSWER_MS);
    return () => clearTimeout(t);
  }, [active, post]);

  // Silence on its own does not say why, and three different things would
  // have to be done about the three reasons, so the gateway is asked once
  // rather than the interface guessing out loud.
  useEffect(() => {
    if (!silent || answered || why) return;
    let stale = false;
    diagnose(previewUrl).then((d) => { if (!stale) setWhy(d); });
    return () => { stale = true; };
  }, [silent, answered, why, previewUrl]);

  // Markers are up while the picker is: a running application is not a
  // place to leave dots. What the page could not find stays out of
  // `resolutions` and is shown in the list as unresolved.
  const signature = marks.map((m) => m.id).join(",");
  useEffect(() => {
    if (!active) { post({ type: "show", items: [] }); setResolutions({}); return; }
    post({ type: "show", items: marks.map((m) => ({ id: m.id, anchor: m.anchor })) });
    // marks is rebuilt on every render; its identity is the ids in it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, signature, post]);

  useEffect(() => {
    if (enabled) return;
    setActive(false); setPicked(null); setAnswered(false); setSilent(false); setWhy(null); setUnavailable([]); setResolutions({});
  }, [enabled]);

  return {
    active, picked, answered, silent, why, unavailable, resolutions,
    start: useCallback(() => { setPicked(null); setActive(true); }, []),
    stop: useCallback(() => { setActive(false); post({ type: "mode", on: false }); }, [post]),
    dismiss: useCallback(() => setPicked(null), []),
    flash: useCallback((id: string) => post({ type: "flash", id }), [post]),
  };
}
