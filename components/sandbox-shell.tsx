"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Below this the element is not being laid out for a reader: the panel
// around it is collapsing, or it has just been hidden behind another of
// the panel's tabs. Roughly fifteen columns and three rows at this font.
const REAL_LAYOUT = { width: 120, height: 48 };

// A shell in the run's sandbox, in the repository's directory. Output
// arrives over a server-sent event stream; keystrokes go up in small
// batches, one request at a time so they stay in order. Closing the tab
// ends the shell.
export default function SandboxShell({ runId, className }: { runId: string; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ status: "connecting" | "open" | "closed" | "error"; detail?: string }>({ status: "connecting" });

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 12,
      lineHeight: 1.3,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      scrollback: 5000,
      theme: { background: "#ffffff", foreground: "#1a1a1a", cursor: "#1a1a1a", selectionBackground: "#d4d4d8", black: "#1a1a1a", brightBlack: "#71717a" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();

    let pid: number | null = null;
    let queue = "";
    let sending = false;
    let gone = false;
    const encoder = new TextEncoder();
    const toBase64 = (bytes: Uint8Array) => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
    const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

    const post = (body: Record<string, unknown>) =>
      fetch(`/api/runs/${runId}/terminal`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pid, ...body }) });

    const flush = async () => {
      if (sending || gone || pid === null || !queue) return;
      sending = true;
      const input = queue;
      queue = "";
      try {
        const res = await post({ input: toBase64(encoder.encode(input)) });
        if (!res.ok) {
          const { error } = await res.json().catch(() => ({ error: res.statusText }));
          term.write(`\r\n\x1b[31m${error ?? "The input could not be sent."}\x1b[0m\r\n`);
        }
      } catch { /* the stream's own error handling reports the loss */ }
      sending = false;
      if (queue) void flush();
    };
    term.onData((data) => { queue += data; void flush(); });

    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const resized = () => {
      // A box too small to be a shell anybody asked for is a panel on its
      // way to being closed or hidden, not a layout. Fitting to it would
      // clamp the terminal to a couple of columns and tell the PTY so,
      // and the scrollback reflow that follows cannot be undone.
      if (el.clientWidth < REAL_LAYOUT.width || el.clientHeight < REAL_LAYOUT.height) return;
      fit.fit();
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { if (pid !== null && !gone) void post({ resize: { cols: term.cols, rows: term.rows } }); }, 150);
    };
    const observer = new ResizeObserver(resized);
    observer.observe(el);

    const events = new EventSource(`/api/runs/${runId}/terminal?cols=${term.cols}&rows=${term.rows}`);
    events.addEventListener("pty", (e) => {
      pid = (JSON.parse((e as MessageEvent).data) as { pid: number }).pid;
      setState({ status: "open" });
      term.focus();
      void flush();
    });
    events.addEventListener("data", (e) => term.write(fromBase64((e as MessageEvent).data)));
    events.addEventListener("exit", (e) => {
      gone = true;
      events.close();
      setState({ status: "closed", detail: `The shell exited (${(e as MessageEvent).data || "0"}).` });
    });
    events.addEventListener("fail", (e) => {
      gone = true;
      events.close();
      setState({ status: "error", detail: (e as MessageEvent).data });
    });
    events.onerror = () => {
      if (gone) return;
      gone = true;
      events.close();
      setState({ status: "error", detail: pid === null ? "The shell could not be opened. The sandbox may not be running." : "The connection to the shell was lost." });
    };

    return () => {
      gone = true;
      events.close();   // the server kills the PTY when the stream goes
      observer.disconnect();
      clearTimeout(resizeTimer);
      term.dispose();
    };
  }, [runId]);

  return (
    <div className={cn("relative flex h-full min-h-0 flex-col", className)}>
      <div ref={host} className="min-h-0 flex-1 px-3 py-2 [&_.xterm]:h-full" />
      {/* Coming up and already over are two different things and were
          one line in the corner. `term.open` paints the white terminal
          and its blinking cursor the moment this mounts, before the
          first packet, so a shell that takes a few seconds to open read
          as a shell that was open and had nothing to say — with the one
          word that said otherwise pinned to the bottom-left, which is
          where the last line of a session's output goes, not where
          somebody waiting for it is looking.

          Absolutely positioned, and it has to stay that way: `fit.fit()`
          sizes the pty off the host div above, and `resized()` refuses
          to measure it at all under REAL_LAYOUT, so a sibling in flow
          would take height off it and settle the terminal at the wrong
          cols and rows — which, once the scrollback has reflowed, is
          not undoable. Opaque for the same reason it is centred: the
          cursor is underneath it. */}
      {state.status === "connecting" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-white text-[13px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Opening a shell in the sandbox…
        </div>
      )}
      {(state.status === "closed" || state.status === "error") && (
        <div className={cn("pointer-events-none absolute inset-x-0 bottom-0 px-3.5 py-1.5 text-[11px]", state.status === "error" ? "text-destructive" : "text-muted-foreground")}>
          {state.detail}
        </div>
      )}
    </div>
  );
}
