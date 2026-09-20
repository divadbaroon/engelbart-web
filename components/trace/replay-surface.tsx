"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
// The replayer's own stylesheet: it positions its wrapper and draws the
// cursor it reconstructs. rrweb does not inject it.
import "@rrweb/replay/dist/style.css";
import { ArrowLeft, Circle, Loader2, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { formatElapsed, type Recording } from "@/lib/trace/recording";
import { allFrames, framesAt, replayClock, streamStart, toReplayTime, toTraceTime, usedPointer } from "@/lib/trace/replay";
import { useReplay, usePlayer } from "@/hooks/use-replay";

export type ReplayProps = {
  recording: Recording;
  // How far the sandbox's clock runs ahead of this browser's, as the
  // gateway measured it on the run's own events. The replay keeps the
  // browser's clock and the trace keeps the sandbox's, so this is what
  // lets a moment in one be found in the other. Null is a straight
  // answer — no reading — and the two are then shown side by side
  // without being lined up, rather than lined up wrongly.
  offset: number | null;
  onBackToLive: () => void;
  // Both directions are in the trace's own clock, because that is the
  // clock every other thing in the workspace speaks. The conversion lives
  // here, beside the stream that decides where zero is.
  onMoment: (at: string) => void;
  seekTo: { at: string; key: number } | null;
};

// A recording, played back where the running application usually is.
//
// The live preview is still mounted underneath this — hidden, never
// unmounted, because unmounting the iframe would reload the artifact and
// "back to live" would come back to a different page than the one that was
// left. So this draws over it and goes away again.
export function ReplaySurface({ recording, offset, onBackToLive, onMoment, seekTo }: ReplayProps) {
  const stage = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const replay = useReplay(recording);
  const player = usePlayer(stage, replay.stored);
  const { at, duration, ready, playing, seek, rebuilt, replayer } = player;

  // The pin between the two clocks. The reading stored with the stream is
  // the one that was in force while it was recorded and wins over
  // whatever holds now; the live one is the fallback for a stream written
  // before the reading was kept.
  //
  // The playhead is measured from the stream's own first event, because
  // that is where rrweb measures it from, and not from `startedAt` — the
  // instant we asked the page to record, a few milliseconds earlier. The
  // two are close enough that nothing would look wrong, which is exactly
  // why it is worth naming the right one.
  const clock = useMemo(
    () => (replay.stored
      ? replayClock(streamStart(replay.stored.events) ?? replay.stored.startedAt, replay.stored.offset ?? offset)
      : null),
    [replay.stored, offset],
  );

  // The trace hears the playhead; it decides what that means. Not while
  // the clocks are unpinned: a moment named from a guess is worse than no
  // moment named at all.
  const told = useRef(-1);
  useEffect(() => {
    if (!ready || !clock || told.current === at) return;
    told.current = at;
    onMoment(toTraceTime(at, clock));
  }, [at, ready, clock, onMoment]);

  // ...and is heard back. A key rather than the time alone, so choosing
  // the same moment twice still moves the playhead back to it.
  const answered = useRef(0);
  useEffect(() => {
    if (!seekTo || !ready || !clock || answered.current === seekTo.key) return;
    answered.current = seekTo.key;
    const ms = toReplayTime(seekTo.at, clock);
    if (ms !== null) seek(ms);
  }, [seekTo, ready, clock, seek]);

  // Anything that painted itself, shown.
  //
  // Not drawn back onto the canvas: a canvas in the replay cannot show
  // anything at all. rrweb's iframe is sandboxed `allow-same-origin` with
  // no `allow-scripts` — which is exactly what `UNSAFE_replayCanvas: false`
  // buys — and a canvas in a scripting-disabled browsing context
  // represents its fallback content rather than a bitmap, so it lays out
  // at no size whatever its width and height say. Drawing into it works
  // and is invisible (lib/trace/replay.ts).
  //
  // An image in the same document renders normally, so each picture goes
  // into one placed beside the canvas, carrying the canvas's own
  // attributes. Attributes rather than inline style on purpose: `width`
  // and `height` are the intrinsic size and any CSS that sized the canvas
  // outranks them, on an image exactly as on a canvas, so the picture
  // lands in the box the drawing had. Measured against a replay with
  // scripts allowed, which is the only way to see what that box was: 602×602
  // either way when the attributes size it, 302×452 either way when a rule
  // overrides them.
  const frames = useMemo(() => allFrames(replay.stored), [replay.stored]);

  // Give the cursor back when there was one. rrweb decides a recording was
  // made on a touchscreen if it holds a single touch event and hides the
  // pointer for good; a trackpad emits touchmove while scrolling, so an
  // ordinary mouse session replays with nothing to follow
  // (lib/trace/replay.ts). It latches the class once, in its constructor,
  // and the element outlives every rebuild, so clearing it once is enough.
  const pointer = useMemo(() => usedPointer(replay.stored?.events ?? []), [replay.stored]);
  useEffect(() => {
    if (!replayer || !pointer) return;
    replayer.wrapper.querySelector(".replayer-mouse")?.classList.remove("touch-device");
  }, [replayer, pointer]);

  // What every canvas was showing at the playhead. Held apart from `at`
  // deliberately: the playhead moves every frame while playing and this
  // changes only when a new picture comes due.
  const due = useMemo(() => framesAt(frames, at), [frames, at]);
  const key = due.map((f) => `${f.nodeId}@${f.ms}`).sort().join(" ");

  useEffect(() => {
    if (!replayer || !due.length) return;
    const mirror = replayer.getMirror();
    for (const frame of due) {
      const node = mirror.getNode(frame.nodeId) as HTMLCanvasElement | null;
      if (!node || node.tagName !== "CANVAS" || !node.isConnected) continue;
      const shown = showing(node, frame.nodeId);
      if (shown && shown.getAttribute("src") !== frame.dataUrl) shown.src = frame.dataUrl;
    }
    // `key` stands for `due`, and `rebuilt` is not read: it is the signal
    // that rrweb threw the document away and built another, so every
    // element below — ours included — is gone and has to be made again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayer, key, rebuilt]);

  // The recorded page was whatever size the window was; this pane is not.
  // So it is scaled to fit rather than scrolled, and re-scaled when either
  // changes. rrweb writes the recorded size onto its own wrapper, which is
  // where it is read from.
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const outer = box.current, inner = stage.current;
    if (!outer || !inner || !ready) return;
    const fit = () => {
      const wrapper = inner.querySelector<HTMLElement>(".replayer-wrapper");
      const w = wrapper?.offsetWidth ?? 0, h = wrapper?.offsetHeight ?? 0;
      if (!w || !h) return;
      setScale(Math.min(outer.clientWidth / w, outer.clientHeight / h, 1));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(outer);
    const settle = setTimeout(fit, 120);
    return () => { observer.disconnect(); clearTimeout(settle); };
  }, [ready]);

  const problem = replay.error ?? player.error;

  return (
    <section aria-label={`Replay of ${recording.name}`} className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3 text-xs">
        <Button variant="ghost" size="sm" onClick={onBackToLive} className="h-6 gap-1.5 px-2 font-normal text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Back to live
        </Button>
        <span className="h-4 w-px bg-border" />
        <Circle className="size-2 shrink-0 fill-red-500 text-red-500" />
        <span className="min-w-0 truncate font-medium" title={recording.name}>{recording.name}</span>
        <span className="ml-auto shrink-0 text-muted-foreground">
          {replay.loading ? "Loading the replay…" : ready ? "Replay · not live" : replay.absent ? "No replay" : problem ? "Replay unavailable" : "Preparing…"}
        </span>
      </div>

      {replay.absent && (
        <p role="status" className="shrink-0 border-b bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">{replay.absent} The trace of it is on the right.</p>
      )}
      {problem && <p role="alert" className="shrink-0 border-b px-3 py-1.5 text-xs text-destructive">{problem}</p>}
      {ready && !clock && (
        <p role="status" className="shrink-0 border-b bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
          This replay and the trace beside it cannot be lined up: nothing in this run recorded the difference between the two clocks. Both are complete; they just do not move together.
        </p>
      )}
      {replay.stored?.truncated && (
        <p role="status" className="shrink-0 border-b bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">This recording was longer than one replay can hold, and stops early. The trace covers all of it.</p>
      )}

      {/* The recorded page. It is rrweb's own iframe, sandboxed so that
          nothing in the replayed document can run; this only gives it a
          box and a scale. */}
      <div ref={box} className="relative min-h-0 flex-1 overflow-hidden bg-[#f6f6f6]">
        <div
          ref={stage}
          className={cn("absolute top-1/2 left-1/2 origin-center", !ready && "invisible")}
          style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
        />
        {replay.loading && (
          <p className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Loading the replay…
          </p>
        )}
        {!replay.loading && !ready && !problem && !replay.absent && (
          <p className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">Preparing the replay…</p>
        )}
      </div>

      {ready && (
        <div className="flex h-9 shrink-0 items-center gap-3 border-t px-3">
          <Button
            variant="ghost" size="icon"
            aria-label={playing ? "Pause" : "Play"}
            onClick={() => (playing ? player.pause() : player.play())}
            className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
          >
            {playing ? <Pause className="size-3.5 fill-current" /> : <Play className="size-3.5 fill-current" />}
          </Button>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{formatElapsed(at)}</span>
          <input
            type="range"
            aria-label="Position in the recording"
            min={0}
            max={Math.max(1, duration)}
            step={100}
            value={Math.min(at, duration)}
            onChange={(e) => seek(Number(e.target.value))}
            className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-foreground"
          />
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{formatElapsed(duration)}</span>
        </div>
      )}
    </section>
  );
}

// The image standing in for one canvas, made once per rebuild.
//
// The canvas keeps its place in the document so that rrweb's own mirror
// and the sibling it inserts things next to are left exactly as they
// were; it is only hidden, and it gives up its id so the image can have
// it and be styled by the same rules.
const SHOWING = "data-engelbart-frame";

function showing(canvas: HTMLCanvasElement, nodeId: number): HTMLImageElement | null {
  const doc = canvas.ownerDocument;
  if (!doc) return null;
  const made = doc.querySelector(`img[${SHOWING}="${nodeId}"]`);
  if (made) return made as HTMLImageElement;
  const img = doc.createElement("img");
  for (const attr of Array.from(canvas.attributes)) {
    try { img.setAttribute(attr.name, attr.value); } catch { /* a name an image will not take */ }
  }
  img.setAttribute(SHOWING, String(nodeId));
  // Alt text would be read aloud and there is nothing true to say: what
  // the drawing was is what the picture is.
  img.setAttribute("alt", "");
  canvas.removeAttribute("id");
  canvas.style.display = "none";
  canvas.insertAdjacentElement("afterend", img);
  return img;
}
