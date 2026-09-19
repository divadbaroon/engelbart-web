"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Layers, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { describeTarget } from "@/lib/trace/timeline";
import { formatWhen } from "@/lib/trace/recording";
import { framePath } from "@/lib/semantics/lookup";
import type { StoredSemantics } from "@/lib/semantics/model";
import type { SemanticNode } from "@/lib/semantics/types";
import type { Reading, Semantics } from "@/hooks/use-semantics";

// What has been read about this application's interfaces, and why each
// reading was or was not asked for again.
//
// This exists to be argued with. A reading is one model's answer about
// one document, cached on a signature computed from a deliberately
// tunable heuristic, and none of that is worth anything unless a person
// can see the signature, see what changed when it moved, see which raw
// elements a label was derived from, and ask for the reading to be made
// again. Every label here is shown beside the descriptor it came from,
// for the same reason.
export function InterfaceReadings({ semantics, traced }: { semantics: Semantics; traced: boolean }) {
  const { readings, asked, loaded, error, busy } = semantics;
  if (error && !loaded) return <p role="alert" className="p-8 text-center text-[13px] text-destructive">{error}</p>;
  if (!loaded) return <p className="p-8 text-center text-[13px] text-muted-foreground">Loading interface readings…</p>;
  if (!readings.length && !asked.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <Layers className="size-5 text-muted-foreground/60" />
        <p className="text-[13px] text-muted-foreground">Nothing read yet.</p>
        <p className="max-w-[380px] text-[12px] leading-relaxed text-muted-foreground/80">
          {traced
            ? "Open the Live preview. Each document the bridge is in offers what it holds, and an interface nobody has read is read once, in the background."
            : "This run has no bridge in it, so no document can say what it holds. Prepare the repository again with a trace."}
        </p>
      </div>
    );
  }
  return (
    <div className="mx-auto w-full max-w-[760px] px-6 py-4">
      {error && <p role="alert" className="mb-3 text-[12px] text-destructive">{error}</p>}
      <div className="mb-3 flex items-center gap-2">
        <p className="text-[12px] text-muted-foreground">
          {readings.length} interface{readings.length === 1 ? "" : "s"} read. A label never replaces what the page said; it is shown beside it.
        </p>
        <Button
          variant="ghost" size="sm" disabled={busy || !traced} onClick={() => semantics.again()}
          title="Ask every document again and read each one afresh. Costs one model call per interface."
          className="ml-auto h-6 gap-1 px-2 font-normal text-muted-foreground"
        >
          <RotateCw className={cn("size-3", busy && "animate-spin")} /> Read again
        </Button>
      </div>
      {asked.length > 0 && (
        <ul className="mb-4 flex flex-col gap-1 rounded-md border bg-muted/30 p-2.5">
          {asked.map((a) => <AskedLine key={a.key} asked={a} />)}
        </ul>
      )}
      <ul className="flex flex-col divide-y">
        {readings.map((r) => <ReadingRow key={r.id} reading={r} onAgain={() => semantics.again(`${framePath(r.frame)}|${r.route ?? ""}`)} canAgain={traced && !busy} />)}
      </ul>
    </div>
  );
}

// What this session asked for, and what came back. The reason is the
// point: a hit that cost nothing and a miss that cost a model call look
// the same on the canvas, and only this says which happened.
function AskedLine({ asked }: { asked: Reading }) {
  const state = asked.state === "reading" ? "reading…" : asked.state === "failed" ? "failed" : asked.hit ? "cached" : "read";
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 text-[11px] leading-relaxed">
      <span className={cn("font-medium", asked.state === "failed" ? "text-destructive" : asked.hit ? "text-muted-foreground" : "text-foreground")}>{state}</span>
      <span className="font-mono text-muted-foreground">{asked.where}</span>
      {asked.route && <span className="text-muted-foreground/70">{asked.route}</span>}
      <span className="text-muted-foreground/70">· {asked.candidates} part{asked.candidates === 1 ? "" : "s"} offered</span>
      {asked.signature && <span className="font-mono text-muted-foreground/70">· {asked.signature.slice(0, 8)}</span>}
      {(asked.reason || asked.error) && <span className={cn("min-w-0 basis-full", asked.error ? "text-destructive" : "text-muted-foreground/70")}>{asked.error ?? asked.reason}</span>}
    </li>
  );
}

function ReadingRow({ reading, onAgain, canAgain }: { reading: StoredSemantics; onAgain: () => void; canAgain: boolean }) {
  const [open, setOpen] = useState(false);
  const [survey, setSurvey] = useState(false);
  const map = reading.map;
  const where = framePath(reading.frame);
  return (
    <li className="flex flex-col gap-1 py-3">
      <div className="flex items-baseline gap-2">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex min-w-0 items-baseline gap-1.5 text-left">
          {open ? <ChevronDown className="size-3 shrink-0 self-center text-muted-foreground" /> : <ChevronRight className="size-3 shrink-0 self-center text-muted-foreground" />}
          <span className="truncate text-[13px]">{map?.documentLabel ?? "Unnamed document"}</span>
          {map?.documentLabel && <Confidence of={map.documentConfidence} />}
        </button>
        <Button variant="ghost" size="sm" disabled={!canAgain} onClick={onAgain} title="Read this interface again, ignoring the cache" className="ml-auto h-6 px-1.5 font-normal text-muted-foreground">Read again</Button>
      </div>
      <p className="truncate text-[11px] text-muted-foreground">
        <span className="font-mono">{where}</span>
        {reading.route && <span className="text-muted-foreground/70"> · {reading.route}</span>}
        {map && <span className="text-muted-foreground/70"> · {map.regions.length} region{map.regions.length === 1 ? "" : "s"}, {map.controls.length} control{map.controls.length === 1 ? "" : "s"}</span>}
        {map?.truncated && <span className="text-amber-700"> · the document offered more than was shown</span>}
        <span className="font-mono text-muted-foreground/70"> · {reading.signature.slice(0, 8)}</span>
        {reading.model && <span className="text-muted-foreground/70"> · {reading.model}</span>}
        <span className="text-muted-foreground/70"> · {formatWhen(reading.createdAt)}</span>
      </p>
      {!map && <p className="text-[11px] text-amber-700">The reading could not be read back; the survey below is still here.</p>}
      {open && (
        <div className="mt-1 flex flex-col gap-2">
          {map && map.regions.length > 0 && <Nodes title="Regions" nodes={map.regions} />}
          {map && map.controls.length > 0 && <Nodes title="Controls" nodes={map.controls} labels={new Map(map.regions.map((r) => [r.semanticId, r.label]))} />}
          {reading.candidates && (
            <div>
              <button type="button" onClick={() => setSurvey((s) => !s)} className="text-[11px] text-muted-foreground hover:text-foreground">
                {survey ? "Hide" : "Show"} the {reading.candidates.candidates.length} element{reading.candidates.candidates.length === 1 ? "" : "s"} it was read from
              </button>
              {survey && (
                <ol className="mt-1 flex flex-col gap-0.5 rounded-md border bg-muted/30 p-2 font-mono text-[10.5px] leading-relaxed text-muted-foreground">
                  {reading.candidates.candidates.map((c) => (
                    <li key={c.ord} className="truncate" title={c.target.selector ?? undefined}>
                      {c.ord}. {describeTarget(c.target)}
                      {c.parent !== null && <span className="text-muted-foreground/60"> · in {c.parent}</span>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

// Each name with the elements it was derived from underneath it. The
// descriptors are the page's own words, unchanged: this is the check
// that a label is about something that was actually there.
function Nodes({ title, nodes, labels }: { title: string; nodes: SemanticNode[]; labels?: Map<string, string> }) {
  return (
    <div>
      <p className="mb-0.5 text-[11px] font-medium text-muted-foreground">{title}</p>
      <ul className="flex flex-col gap-1">
        {nodes.map((n) => (
          <li key={n.semanticId} className="flex flex-col">
            <p className="flex flex-wrap items-baseline gap-x-1.5 text-[12px]">
              <span>{n.label}</span>
              <span className="text-[10.5px] text-muted-foreground/70">{n.kind}</span>
              <Confidence of={n.confidence} />
              {n.regionId && labels?.get(n.regionId) && <span className="text-[10.5px] text-muted-foreground/70">in {labels.get(n.regionId)}</span>}
            </p>
            {n.description && <p className="text-[11px] text-muted-foreground">{n.description}</p>}
            <ul className="flex flex-col">
              {n.targets.map((t, i) => (
                <li key={i} className="truncate pl-3 text-[10.5px] text-muted-foreground/80" title={t.selector ?? undefined}>{describeTarget(t)}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

const Confidence = ({ of }: { of: "high" | "medium" | "low" }) => (
  <span className={cn("text-[10.5px]", of === "high" ? "text-muted-foreground/60" : of === "medium" ? "text-muted-foreground" : "text-amber-700")}>
    {of === "high" ? "" : of === "medium" ? "fair reading" : "a guess"}
  </span>
);
