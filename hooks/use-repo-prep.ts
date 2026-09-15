"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PREP_STEPS } from "@/lib/repos";

// Simulates preparing a repo in the background (clone → install → dev server).
// Swap the timers for polling / a subscription to your real job status.
export function useRepoPrep() {
  const [progress, setProgress] = useState<Record<string, number>>({});
  const started = useRef(new Set<string>());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const prepare = useCallback((id: string) => {
    if (started.current.has(id)) return;
    started.current.add(id);
    setProgress((p) => ({ ...p, [id]: 0 }));
    PREP_STEPS.forEach((ms, step) => {
      if (step === 0) return;
      timers.current.push(
        setTimeout(() => setProgress((p) => ({ ...p, [id]: Math.max(p[id] ?? 0, step) })), ms),
      );
    });
  }, []);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  return { progress, prepare };
}
