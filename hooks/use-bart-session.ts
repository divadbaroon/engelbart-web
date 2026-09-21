"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_BART_MODEL, isBartModel } from "@/lib/bart/models";
import type { MessageContext } from "@/lib/bart/protocol";
import { DEFAULT_OPTIONS, readOptions, type Attachment, type BartOptions } from "@/lib/bart/options";
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
const OPTIONS_KEY = "engelbart:bart:options";

export function useBartSession(projectId: string) {
  const bart = useBart(projectId);
  const { send, busy } = bart;
  const [draft, setDraft] = useState("");
  const [model, setModel] = useState(DEFAULT_BART_MODEL);
  // How the next question is to be answered. Remembered like the model
  // is: it is a way of working rather than a property of one question.
  const [options, setOptions] = useState<BartOptions>(DEFAULT_OPTIONS);
  // Files picked in the composer, waiting to go with the next question.
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  // Which composer to put the cursor in, and a key that changes on every
  // ask so the same surface can be asked for twice running.
  const [focus, setFocus] = useState<{ key: number; surface: BartSurface }>({ key: 0, surface: "tab" });

  useEffect(() => { try { const saved = localStorage.getItem(MODEL_KEY); if (isBartModel(saved)) setModel(saved); } catch { /* private mode */ } }, []);
  // The answer length is forced back to the default on the way in and on
  // the way out. It had a slider once and no longer does, so a value one
  // person saved months ago would otherwise keep shaping every answer
  // with nothing on screen either saying so or able to undo it.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(OPTIONS_KEY);
      if (saved) setOptions({ ...readOptions(JSON.parse(saved)), maxTokens: DEFAULT_OPTIONS.maxTokens });
    } catch { /* private mode, or nonsense in the key */ }
  }, []);

  const chooseOptions = useCallback((next: BartOptions) => {
    const safe = { ...readOptions(next), maxTokens: DEFAULT_OPTIONS.maxTokens };
    setOptions(safe);
    try { localStorage.setItem(OPTIONS_KEY, JSON.stringify(safe)); } catch { /* private mode */ }
  }, []);

  const attach = useCallback((files: Attachment[]) => setAttachments((all) => [...all, ...files]), []);
  const unattach = useCallback((name: string) => setAttachments((all) => all.filter((a) => a.name !== name)), []);

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
    setAttachments([]);
    void send(text, model, context, options, attachments);
  }, [draft, busy, send, model, options, attachments]);

  return { ...bart, draft, setDraft, model, pickModel, options, setOptions: chooseOptions, attachments, attach, unattach, focus, ask, submit };
}
