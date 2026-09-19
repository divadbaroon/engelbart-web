"use client";

import { useCallback, useEffect, useState } from "react";
import type { Selection } from "@/lib/trace/selection";

// The selected moment of the run in the middle, and whether the drawer
// under the canvas is open on it. Another run starts with nothing
// selected.
export type TraceSelection = { selection: Selection | null; detail: boolean };

export function useTraceSelection(runId: string | undefined) {
  const [state, setState] = useState<TraceSelection>({ selection: null, detail: false });
  const select = useCallback((selection: Selection, options: { detail?: boolean } = {}) =>
    setState((s) => ({ selection, detail: options.detail ?? s.detail })), []);
  const clear = useCallback(() => setState({ selection: null, detail: false }), []);
  const setDetail = useCallback((detail: boolean) => setState((s) => ({ ...s, detail })), []);
  useEffect(() => { setState({ selection: null, detail: false }); }, [runId]);
  return { ...state, select, clear, setDetail };
}
