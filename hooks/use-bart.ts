"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadBartThread, startBartThread } from "@/app/workspace/[workspaceId]/bart-actions";
import type { BartEvent, BartMessage, MessageContext, Ref, ToolState } from "@/lib/bart/protocol";

// The conversation with Bart for a workspace: loaded from the thread on
// arrival, so a refresh keeps it; one turn at a time streamed from the
// route; Clear starts a new thread.
export type ToolLine = { id: string; name: string; label: string; state: ToolState };
export type Pending = { text: string; tools: ToolLine[] };

export function useBart(projectId: string) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<BartMessage[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    let stale = false;
    setLoaded(false);
    setError(null);
    loadBartThread(projectId).then((r) => {
      if (stale) return;
      if (!r.ok) setError(r.error);
      setThreadId(r.ok ? r.thread?.threadId ?? null : null);
      setMessages(r.ok ? r.thread?.messages ?? [] : []);
      setLoaded(true);
    });
    return () => { stale = true; };
  }, [projectId]);

  const stop = useCallback(() => { controller.current?.abort(); controller.current = null; }, []);

  const send = useCallback(async (message: string, model: string, context: MessageContext) => {
    const text = message.trim();
    if (!text || controller.current) return;
    const ac = new AbortController();
    controller.current = ac;
    setError(null);
    setPending({ text: "", tools: [] });
    const local: BartMessage = { id: `local:${Date.now()}`, role: "user", content: text, refs: [], context, model: null, createdAt: new Date().toISOString() };
    setMessages((ms) => [...ms, local]);
    let answer = "";
    let refs: Ref[] = [];
    let finished = false;
    try {
      const res = await fetch("/api/bart", {
        method: "POST", headers: { "content-type": "application/json" }, signal: ac.signal,
        body: JSON.stringify({ threadId, projectId, repoId: context.repoId, runId: context.runId, recordingId: context.recordingId ?? null, selection: context.selection, model, message: text }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Bart could not be reached (${res.status}).`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let i: number;
        while ((i = buffer.indexOf("\n\n")) >= 0) {
          const chunk = buffer.slice(0, i);
          buffer = buffer.slice(i + 2);
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          let event: BartEvent;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }
          switch (event.type) {
            case "thread":
              setThreadId(event.threadId);
              setMessages((ms) => ms.map((m) => (m.id === local.id ? { ...m, id: event.userMessageId } : m)));
              break;
            case "text":
              answer += event.delta;
              setPending((p) => (p ? { ...p, text: p.text + event.delta } : { text: event.delta, tools: [] }));
              break;
            case "tool":
              setPending((p) => {
                const tools = p?.tools ?? [];
                const line: ToolLine = { id: event.id, name: event.name, label: event.label, state: event.state };
                return { text: p?.text ?? "", tools: tools.some((t) => t.id === event.id) ? tools.map((t) => (t.id === event.id ? line : t)) : [...tools, line] };
              });
              break;
            case "done":
              refs = event.refs;
              finished = true;
              setMessages((ms) => [...ms, { id: event.messageId, role: "assistant", content: answer.trim(), refs, context, model: event.model, createdAt: new Date().toISOString() }]);
              setPending(null);
              break;
            case "error":
              throw new Error(event.message);
          }
        }
      }
      if (!finished) throw new Error("Bart stopped before finishing.");
    } catch (err) {
      const partial = answer.trim();
      if (partial) setMessages((ms) => [...ms, { id: `partial:${Date.now()}`, role: "assistant", content: partial, refs, context, model, createdAt: new Date().toISOString() }]);
      setPending(null);
      if (!ac.signal.aborted) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (controller.current === ac) controller.current = null;
    }
  }, [projectId, threadId]);

  const reset = useCallback(async () => {
    stop();
    setMessages([]);
    setPending(null);
    setError(null);
    const r = await startBartThread(projectId);
    if (r.ok) setThreadId(r.threadId); else setError(r.error);
  }, [projectId, stop]);

  return { threadId, messages, pending, error, loaded, busy: pending !== null, send, stop, reset };
}
