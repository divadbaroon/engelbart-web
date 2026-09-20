"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { REPLAYS_BUCKET, type Recording } from "@/lib/trace/recording";
import { readStoredReplay, type StoredReplay } from "@/lib/trace/replay";

// The stream of a recording, fetched when one is opened.
//
// It is fetched rather than subscribed to, and it is not kept: a replay is
// the largest thing in this system by a wide margin, and holding several
// of them because several recordings were looked at would be the wrong
// trade. Opening the same one again asks again, and the browser's own
// cache answers.
//
// The object is private. It is read as the signed-in member, through the
// same client the rest of the workspace uses, and the storage policies
// decide — the project id is the first folder of the path.
export type Replay = {
  stored: StoredReplay | null;
  loading: boolean;
  // Why there is nothing to watch, when there is nothing to watch. A
  // recording made before capture existed, or in a preview that could not
  // be framed, has no replay and that is not a failure.
  absent: string | null;
  error: string | null;
};

export function useReplay(recording: Recording | null): Replay {
  const [state, setState] = useState<Replay>({ stored: null, loading: false, absent: null, error: null });
  const path = recording?.replayPath ?? null;
  const open = !!recording;

  useEffect(() => {
    if (!open) { setState({ stored: null, loading: false, absent: null, error: null }); return; }
    if (!path) {
      setState({ stored: null, loading: false, absent: "This recording has no replay: the preview was not being captured while it ran.", error: null });
      return;
    }
    let stale = false;
    setState({ stored: null, loading: true, absent: null, error: null });
    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.storage.from(REPLAYS_BUCKET).download(path);
        if (stale) return;
        if (error || !data) { setState({ stored: null, loading: false, absent: null, error: error?.message ?? "That replay could not be read." }); return; }
        const stored = readStoredReplay(JSON.parse(await data.text()));
        if (stale) return;
        if (!stored) { setState({ stored: null, loading: false, absent: null, error: "That replay could not be read: it is not a stream this version knows." }); return; }
        setState({ stored, loading: false, absent: null, error: null });
      } catch (err) {
        if (!stale) setState({ stored: null, loading: false, absent: null, error: err instanceof Error ? err.message : "That replay could not be read." });
      }
    })();
    return () => { stale = true; };
  }, [open, path]);

  return state;
}

// ---- the player
//
// rrweb's Replayer builds its own iframe inside whatever element it is
// given and rebuilds the recorded document into it. The iframe is
// sandboxed with `allow-same-origin` and nothing else, so nothing in the
// replayed page runs: every <script> becomes <noscript> on rebuild, and no
// script that survived as an attribute has an engine to run in.
//
// We keep it that way, and it costs more than it looks. Scripting off is
// not only "the page does not run": a <canvas> in such a document shows
// its fallback content instead of a bitmap, so no canvas in the replay
// renders at all. rrweb's own answer is `UNSAFE_replayCanvas`, which turns
// this sandbox into `allow-same-origin allow-scripts` on the workspace
// origin — see lib/trace/replay.ts for why that is refused, and
// components/trace/replay-surface.tsx for what is done instead.
//
// There is no callback for the playhead. rrweb's own player polls, and so
// do we, on a frame: it is the same loop that has to run anyway to keep
// the trace beside it.
export type Player = {
  ready: boolean;
  playing: boolean;
  // Where the playhead is, as milliseconds into the recording.
  at: number;
  duration: number;
  play: () => void;
  pause: () => void;
  // Move the playhead. Paused stays paused, playing stays playing: a
  // scrub is not a command to start, and a moment clicked while it runs
  // should not stop it.
  seek: (ms: number) => void;
  // Bumped each time rrweb rebuilds the document from a whole picture,
  // which it does on the first cast and on any seek that cannot be
  // reached by replaying forwards. Every element in the replay is a new
  // element afterwards, so anything the workspace drew onto one is gone
  // and has to be drawn again. Nothing else announces this: the playhead
  // can land on the same millisecond it was already on.
  rebuilt: number;
  error: string | null;
};

type Replayer = {
  play: (t?: number) => void;
  pause: (t?: number) => void;
  destroy: () => void;
  getCurrentTime: () => number;
  getMetaData: () => { startTime: number; endTime: number; totalTime: number };
  getMirror: () => { getNode: (id: number) => unknown };
  on: (event: string, handler: (...args: unknown[]) => void) => unknown;
  iframe: HTMLIFrameElement;
  wrapper: HTMLElement;
};

export function usePlayer(root: React.RefObject<HTMLElement | null>, stored: StoredReplay | null): Player & { replayer: Replayer | null } {
  const [replayer, setReplayer] = useState<Replayer | null>(null);
  const [rebuilt, setRebuilt] = useState(0);
  const [state, setState] = useState<{ ready: boolean; playing: boolean; at: number; duration: number; error: string | null }>(
    { ready: false, playing: false, at: 0, duration: 0, error: null },
  );
  const held = useRef<Replayer | null>(null);

  // One replayer per stream. It is built after paint, because it measures
  // and writes into the DOM, and torn down on the way out: the live
  // preview underneath was never unmounted and is what comes back.
  useEffect(() => {
    const el = root.current;
    if (!stored || !el) return;
    let stale = false;
    let made: Replayer | null = null;
    (async () => {
      try {
        const { Replayer } = await import("@rrweb/replay");
        if (stale || !root.current) return;
        root.current.replaceChildren();
        made = new Replayer(stored.events as never[], {
          root: root.current,
          speed: 1,
          skipInactive: false,
          mouseTail: false,
          // Not UNSAFE_replayCanvas. The canvas is painted by the surface;
          // the replay iframe keeps its sandbox.
          UNSAFE_replayCanvas: false,
        }) as unknown as Replayer;
        if (stale) { made.destroy(); return; }
        held.current = made;
        const meta = made.getMetaData();
        setReplayer(made);
        setState({ ready: true, playing: false, at: 0, duration: Math.max(0, meta.totalTime), error: null });
        // Show the first frame rather than an empty box: a paused player
        // at zero has cast nothing yet.
        made.pause(0);
      } catch (err) {
        if (!stale) setState({ ready: false, playing: false, at: 0, duration: 0, error: err instanceof Error ? err.message : "That replay could not be opened." });
      }
    })();
    return () => {
      stale = true;
      const r = made ?? held.current;
      held.current = null;
      setReplayer(null);
      setState({ ready: false, playing: false, at: 0, duration: 0, error: null });
      try { r?.destroy(); } catch { /* going anyway */ }
      try { el.replaceChildren(); } catch { /* going anyway */ }
    };
  }, [root, stored]);

  // The playhead, polled. Only while playing: a paused player does not
  // move on its own, and a scrub sets it directly.
  useEffect(() => {
    if (!replayer || !state.playing) return;
    let raf = 0;
    const tick = () => {
      const at = replayer.getCurrentTime();
      setState((s) => (s.at === at ? s : { ...s, at }));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [replayer, state.playing]);

  // rrweb says when it reaches the end; without this the button stays on
  // "pause" over a player that has stopped. It also says when it has
  // thrown the document away and built another, which is the moment
  // everything painted onto it stopped existing.
  useEffect(() => {
    if (!replayer) return;
    replayer.on("finish", () => setState((s) => ({ ...s, playing: false })));
    replayer.on("fullsnapshot-rebuilded", () => setRebuilt((n) => n + 1));
  }, [replayer]);

  const play = useCallback(() => {
    if (!replayer) return;
    setState((s) => {
      // Playing from the end starts again, which is what the button means
      // when it is the only one there.
      const from = s.duration && s.at >= s.duration - 50 ? 0 : s.at;
      replayer.play(from);
      return { ...s, playing: true, at: from };
    });
  }, [replayer]);

  const pause = useCallback(() => {
    if (!replayer) return;
    replayer.pause();
    setState((s) => ({ ...s, playing: false, at: replayer.getCurrentTime() }));
  }, [replayer]);

  const seek = useCallback((ms: number) => {
    if (!replayer) return;
    setState((s) => {
      const at = Math.max(0, Math.min(ms, s.duration));
      // pause(t) is rrweb's seek; play(t) is the same seek left running.
      if (s.playing) replayer.play(at); else replayer.pause(at);
      return { ...s, at };
    });
  }, [replayer]);

  return { ...state, play, pause, seek, rebuilt, replayer };
}
