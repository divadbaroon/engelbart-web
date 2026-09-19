"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_BART_MODEL, isBartModel } from "@/lib/bart/models";
import type { MessageContext } from "@/lib/bart/protocol";
import { useBart } from "@/hooks/use-bart";

// One conversation with Bart, held by the workspace rather than by a
// panel, because Bart is shown in more than one place: the Bart tab and
// the small panel over the trace canvas. Both read and write this, so a
// question asked beside the trace is in the tab when you get there, and
// a half-typed one survives the walk between them. The thread itself is
// still the hook's; this adds only what the two surfaces share.
export type BartSurface = "tab" | "mini";
export type BartSession = ReturnType<typeof useBartSession>;

const MODEL_KEY = "engelbart:bart:model";

export function useBartSession(projectId: string) {
  const bart = useBart(projectId);
  const { send, busy } = bart;
  const [draft, setDraft] = useState("");
  const [model, setModel] = useState(DEFAULT_BART_MODEL);
  // Which composer to put the cursor in, and a key that changes on every
  // ask so the same surface can be asked for twice running.
  const [focus, setFocus] = useState<{ key: number; surface: BartSurface }>({ key: 0, surface: "tab" });

  useEffect(() => { try { const saved = localStorage.getItem(MODEL_KEY); if (isBartModel(saved)) setModel(saved); } catch { /* private mode */ } }, []);

  const pickModel = useCallback((id: string) => {
    if (!isBartModel(id)) return;
    setModel(id);
    try { localStorage.setItem(MODEL_KEY, id); } catch { /* private mode */ }
  }, []);

  const ask = useCallback((surface: BartSurface) => setFocus((f) => ({ key: f.key + 1, surface })), []);

  // The context is the caller's: which run, repository, selected moment
  // and open recording the question was asked from.
  const submit = useCallback((context: MessageContext) => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    void send(text, model, context);
  }, [draft, busy, send, model]);

  return { ...bart, draft, setDraft, model, pickModel, focus, ask, submit };
}
