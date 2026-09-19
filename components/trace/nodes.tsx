"use client";

import { BaseEdge, EdgeLabelRenderer, Handle, Position, type EdgeProps, type Node as FlowNode, type NodeProps } from "@xyflow/react";
import { ArrowRight, CornerDownLeft, Cpu, Eye, Loader2, MousePointer2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ModelCall } from "@/lib/trace/types";
import { count, outputPreview, type ContextCard } from "@/lib/trace/context";
import { formatClock, summarizeCall, type CallRow, type Stage, type StageKind } from "@/lib/trace/timeline";
import type { MomentKind } from "@/lib/trace/moments";

// The things on the canvas, each drawn so its kind reads before its
// words do. On the line: what a person did is a light card with a
// pointer, a model call is the one dark card, what appeared on screen is
// a dashed card with an eye. Beside a selected call: a context card is
// plain, the output is gray and monospace. Nothing can be dragged or
// wired; the handles exist only so edges know where to end, and are
// invisible.

export type MomentNode = FlowNode<{ stage: Stage; kind: MomentKind; preview: string | null; summary: string | null; selected: boolean; related: boolean; call: CallRow | null }, "moment">;
export type CardNode = FlowNode<{ card: ContextCard }, "card">;
export type OutputNode = FlowNode<{ call: ModelCall }, "output">;
export type CaptionNode = FlowNode<{ text: string }, "caption">;
export type TraceNode = MomentNode | CardNode | OutputNode | CaptionNode;

export const HEADER_H = 26;   // a card's header strip; the line meets a card at its middle
const HANDLE = "!pointer-events-none !opacity-0 !h-px !w-px !min-h-0 !min-w-0 !border-0 !bg-transparent";

type Ring = "none" | "weak" | "strong";
type FrameProps = { title: string; meta: string | null; icon?: LucideIcon; children: React.ReactNode; ring?: Ring; dark?: boolean; gray?: boolean; dashed?: boolean; spinning?: boolean };

// A card: a header strip saying what it is, then a short body.
function Frame({ title, meta, icon: Icon, children, ring = "none", dark = false, gray = false, dashed = false, spinning = false }: FrameProps) {
  return (
    <div className={cn("w-full cursor-pointer rounded-md border bg-background text-left text-[12px] leading-[1.5] transition-[border-color,box-shadow,background-color] hover:border-foreground/40", dark && "border-foreground/50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]", gray && "bg-[#fbfbfb]", dashed && "border-dashed border-foreground/40 bg-[#fcfcfc]", ring === "strong" && "border-foreground/60 ring-2 ring-foreground/70 ring-offset-2", ring === "strong" && !dark && "bg-[#f7f7f7]", ring === "weak" && "ring-1 ring-foreground/30 ring-offset-1")}>
      <div style={{ height: HEADER_H }} className={cn("flex items-center gap-1.5 rounded-t-[5px] border-b px-3", dark && "border-foreground/50 bg-foreground text-background")}>
        {Icon && <Icon className={cn("size-3 shrink-0", dark ? "text-background/70" : "text-muted-foreground")} />}
        <span className={cn("shrink-0 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide", dark ? "text-background/80" : "text-muted-foreground")}>{title}</span>
        {meta && <span className={cn("ml-auto min-w-0 truncate text-[10px]", dark ? "text-background/70" : "text-muted-foreground")}>{meta}</span>}
        {spinning && <Loader2 className={cn("size-3 shrink-0 animate-spin", dark ? "text-background/70" : "text-muted-foreground")} />}
      </div>
      <div className="px-3 py-1.5">{children}</div>
    </div>
  );
}

// A moment on the line. Compact, it says what it was and one thing
// more; selected, it is ringed and says one line more. Everything else
// about it is read in the inspector; the only tooltip is the browser's
// own, carrying the full label when the title is cut short.
export const STAGE_ICON: Record<StageKind, LucideIcon> = { explore: MousePointer2, navigate: ArrowRight, submit: CornerDownLeft, call: Cpu, response: Eye };
const WORD: Record<MomentKind, string> = { human: "Human", model: "Model", observed: "Observed" };

function MomentView({ data }: NodeProps<MomentNode>) {
  const { stage, kind, preview, summary, selected, related, call } = data;
  const s = call ? summarizeCall(call) : null;
  const title = kind === "model" ? s?.model ?? stage.title : stage.title;
  return (
    <div className="w-full" title={stage.label}>
      <Frame title={WORD[kind]} meta={formatClock(stage.at)} icon={STAGE_ICON[stage.stage]} ring={selected ? "strong" : related ? "weak" : "none"} dark={kind === "model"} dashed={kind === "observed"} spinning={s?.state === "in flight"}>
        <div className="min-h-[38px]">
          <span className="block truncate text-[13px] font-medium">{title}</span>
          {preview && <span className={cn("block truncate", s?.state === "error" ? "text-destructive" : "text-muted-foreground")}>{preview}</span>}
        </div>
        {selected && summary && summary !== preview && (
          <p className="mt-1.5 truncate border-t pt-1.5 text-muted-foreground">{summary}</p>
        )}
      </Frame>
      <Handle id="in" type="target" position={Position.Left} className={HANDLE} style={{ top: HEADER_H / 2 }} />
      <Handle id="out" type="source" position={Position.Right} className={HANDLE} style={{ top: HEADER_H / 2 }} />
      <Handle id="top" type="target" position={Position.Top} className={HANDLE} />
      <Handle id="up" type="source" position={Position.Top} className={HANDLE} />
      <Handle id="down" type="source" position={Position.Bottom} className={HANDLE} />
    </div>
  );
}

// What the captured request carried, one card each; clicking opens the
// exact content in the inspector.
function CardView({ data }: NodeProps<CardNode>) {
  const { card } = data;
  return (
    <Frame title={card.title} meta={card.meta}>
      <span className={cn("line-clamp-2", !card.kept && "text-muted-foreground")}>{card.summary}</span>
      <Handle type="source" position={Position.Right} className={HANDLE} />
    </Frame>
  );
}

function OutputView({ data }: NodeProps<OutputNode>) {
  const { call } = data;
  const p = outputPreview(call);
  const out = call.response?.output;
  const chars = out ? ("text" in out ? out.text.length : out.chars) : null;
  const meta = p.kind === "pending" ? null : [call.response?.finish_reason ? `finish ${call.response.finish_reason}` : null, chars !== null ? `${count(chars)} chars` : null].filter(Boolean).join(" · ") || null;
  return (
    <Frame title={p.kind === "json" ? "Output · JSON" : "Output"} meta={meta} gray spinning={p.kind === "pending"}>
      {p.kind === "pending" && <span className="text-muted-foreground">waiting for the answer</span>}
      {p.kind === "error" && <span className="text-destructive">{p.message}</span>}
      {p.kind === "empty" && <span className="text-muted-foreground">{p.reason}</span>}
      {p.kind === "counts" && <span className="text-muted-foreground">{count(p.chars)} characters, not kept{p.refusal ? " · refusal" : ""}{p.toolCalls.length ? ` · tool calls: ${p.toolCalls.join(", ")}` : ""}</span>}
      {p.kind === "json" && (
        <span className="block font-mono text-[11px] leading-[1.6]">
          {p.entries.map((e) => <span key={e.key} className="block truncate"><span className="text-muted-foreground">{e.key}:</span> {e.value}</span>)}
          {p.more > 0 && <span className="block text-muted-foreground">+{p.more} more key{p.more === 1 ? "" : "s"}</span>}
          {p.toolCalls.length > 0 && <span className="block text-muted-foreground">tool calls: {p.toolCalls.map((t) => t.name).join(", ")}</span>}
        </span>
      )}
      {p.kind === "text" && (
        <span className="block">
          <span className="line-clamp-4">{p.text}</span>
          {p.toolCalls.length > 0 && <span className="block text-muted-foreground">tool calls: {p.toolCalls.map((t) => t.name).join(", ")}</span>}
        </span>
      )}
      <Handle type="target" position={Position.Top} className={HANDLE} />
    </Frame>
  );
}

// A tie over the line: an arch from one card's top to another's, lifted
// clear of the cards, with its word at the crown. The style and the
// arrowhead, or their absence, come from the edge itself.
const LIFT = 64;
function ArcEdge({ sourceX, sourceY, targetX, targetY, style, markerEnd, label }: EdgeProps) {
  const path = `M ${sourceX} ${sourceY} C ${sourceX} ${sourceY - LIFT}, ${targetX} ${targetY - LIFT}, ${targetX} ${targetY}`;
  return (
    <>
      <BaseEdge path={path} style={style} markerEnd={markerEnd} />
      {label && (
        <EdgeLabelRenderer>
          <div style={{ transform: `translate(-50%, -50%) translate(${(sourceX + targetX) / 2}px, ${(sourceY + targetY) / 2 - LIFT * 0.75}px)` }} className="pointer-events-none absolute rounded bg-background px-1 text-[10px] leading-4 text-muted-foreground">{label}</div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const CaptionView = ({ data }: NodeProps<CaptionNode>) => <div className="whitespace-nowrap text-[10px] font-semibold uppercase leading-3 tracking-wide text-muted-foreground">{data.text}</div>;

export const nodeTypes = { moment: MomentView, card: CardView, output: OutputView, caption: CaptionView };
export const edgeTypes = { arc: ArcEdge };
