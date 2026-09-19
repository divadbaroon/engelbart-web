"use client";

import { Check, Loader2, XCircle } from "lucide-react";
import type { ToolLine } from "@/hooks/use-bart";

// What Bart is reading while it answers, one line per tool: the trace,
// a captured call, a file. Shown only for the turn in flight.
export function ToolActivity({ tool }: { tool: ToolLine }) {
  return (
    <li className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
      {tool.state === "running" ? <Loader2 className="size-3 shrink-0 animate-spin" /> : tool.state === "done" ? <Check className="size-3 shrink-0" /> : <XCircle className="size-3 shrink-0 text-destructive/80" />}
      <span className="min-w-0 truncate">{tool.label}</span>
    </li>
  );
}
