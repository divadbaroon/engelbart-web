"use client";

import { useEffect, useState } from "react";

// The wall clock a duration is measured against, once per second.
//
// `stepDuration` and `runDuration` (lib/run-steps.ts) take a `now` and
// add the time since a step opened to the time already closed. Nothing
// in the run tells them what time it is, on purpose: the closed part is
// a fact in the log and the open part is only true at the instant it is
// read. So the clock lives here, in the browser, and the pure helpers
// stay pure.
//
// It starts null rather than at `Date.now()`, which is what makes the
// server's render and the browser's first render agree — the server has
// no clock to tick and would otherwise print a different number than
// the page it hydrates into. Both helpers accept null and answer with
// closed time alone.
//
// `ticking` is whether anything is actually open. A run that has
// finished has no `since` on any step, so its duration cannot change,
// and an interval redrawing it every second is a timer burning for a
// number that is already final. Two panes draw these durations — the
// Build timeline and the Live preview's preparing state — and this is
// one clock shared, not two intervals that happen to agree.
export function useNow(ticking: boolean): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    if (!ticking) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ticking]);
  return now;
}
