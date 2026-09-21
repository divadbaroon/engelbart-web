"use client";

import type { ReactNode } from "react";
import type { SandboxRun } from "@/lib/sandbox";

// Nothing on the trace side can say anything without a run that was
// traced, and all three of Activity, the Visualizer and Replay would
// otherwise each find their own words for it. One sentence per reason,
// in one place, so the three companion tools disagree about nothing —
// not even about what is missing.
export function runProblem(run: SandboxRun | undefined): string | null {
  if (!run) return "Open the repository to prepare it in a sandbox. Everything on this side starts with the run.";
  if (run.trace === "off") return "This run was started without a trace, so nothing was watched. Prepare the repository again to record one.";
  return null;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="p-8 text-center text-[13px] leading-5 text-muted-foreground">{children}</p>;
}
