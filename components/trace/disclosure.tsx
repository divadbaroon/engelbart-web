"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// A fold for what is kept but not read first: the evidence behind a
// summary, the technical detail of a call. Closed until asked; nothing
// under it is removed.
export function Disclosure({ label, hint, children, className }: { label: string; hint?: string | null; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-1.5 py-2 text-left text-xs text-muted-foreground hover:text-foreground">
        <ChevronRight className={cn("size-3 shrink-0 transition-transform", open && "rotate-90")} />
        <span className="shrink-0">{open ? label.replace(/^Show /, "Hide ") : label}</span>
        {hint && <span className="min-w-0 truncate text-muted-foreground/70">· {hint}</span>}
      </button>
      {open && children}
    </div>
  );
}
