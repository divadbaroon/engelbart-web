"use client";

import "@xyflow/react/dist/base.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Background, BackgroundVariant, MarkerType, Panel, ReactFlow, ReactFlowProvider, useReactFlow, useStore, useStoreApi, type Edge, type NodeChange } from "@xyflow/react";
import { LocateFixed, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { contextCards, type CardId } from "@/lib/trace/context";
import { BRANCH_W, MOMENT_W, layoutTrace, type Box, type Point, type Rect } from "@/lib/trace/layout";
import { momentKind, momentPreview, momentSummary, relationWord, type Relation } from "@/lib/trace/moments";
import { formatMs, type CallRow, type Stage } from "@/lib/trace/timeline";
import { edgeTypes, nodeTypes, type TraceNode } from "@/components/trace/nodes";

// The trace as one canvas: every moment of the session as a card on one
// line, left to right in time order, joined by a line that says only
// "then". The selected moment opens where it stands; a selected model
// call also shows, beside it, what its captured request carried and what
// it produced. A tie the trace recorded between two moments is drawn for
// the selected one only: solid when an id carried the join, dotted when
// only timing did. React Flow draws, pans and zooms; nothing on it can be
// dragged, wired or edited, and every position comes from the layout.
export type Pick = { kind: "moment"; stageId: string } | { kind: "card"; card: CardId } | { kind: "output" };
type Props = {
  stages: Stage[];
  calls: Map<string, CallRow>;
  selectedId: string | null;    // the selected moment
  relation: Relation | null;    // how the selected moment is tied to a model call, if the trace says
  onPick: (pick: Pick) => void;
  empty: string | null;         // what to say when there is nothing to draw
};

const ORIGIN: Point = { x: 0, y: 0 };
const GAP_MS = 500;
const ms = (iso: string) => Date.parse(iso);
const STROKE = "#a3a3a3";
const EDGE = { stroke: STROKE, strokeWidth: 1.25 };
const DOTTED = { ...EDGE, strokeDasharray: "2 4" };
const ARROW = { type: MarkerType.ArrowClosed, width: 14, height: 14, color: STROKE };
const LABEL = { labelStyle: { fontSize: 10, fill: "#737373" }, labelBgStyle: { fill: "#ffffff" }, labelBgPadding: [4, 2] as [number, number], labelBgBorderRadius: 3 };
const MARGIN = 24;      // screen pixels the selected moment keeps from the edge
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2;
const fitZoom = (b: Rect, w: number, h: number) => Math.min((w - 2 * MARGIN) / b.w, (h - 2 * MARGIN) / b.h);
const still = { draggable: false, selectable: false, focusable: false, connectable: false, style: { pointerEvents: "none" as const } };
const clickable = { draggable: false, connectable: false };
const quiet = { selectable: false, focusable: false, interactionWidth: 0 };

// What the canvas holds for this moment, before anything is measured.
type Branches = { anchor: string; cardIds: string[]; outputId: string | null };
type Spec = { nodes: TraceNode[]; edges: Edge[]; momentIds: string[]; branches: Branches | null; selectedNodeId: string | null; relatedNodeId: string | null };

function buildSpec({ stages, calls, selectedId, relation }: Omit<Props, "onPick" | "empty">): Spec {
  const nodes: TraceNode[] = [];
  const edges: Edge[] = [];
  const momentIds: string[] = [];
  const selected = stages.find((s) => s.id === selectedId) ?? null;
  const relatedId = relation ? (relation.from === selectedId ? relation.to : relation.from) : null;
  const caption = (id: string, text: string): TraceNode => ({ id, type: "caption", position: ORIGIN, data: { text }, ...still });

  stages.forEach((stage, i) => {
    const id = `moment:${stage.id}`;
    momentIds.push(id);
    const call = stage.stage === "call" ? stage.rows.find((r): r is CallRow => r.kind === "call") ?? null : null;
    nodes.push({
      id, type: "moment", position: ORIGIN, style: { width: MOMENT_W }, ...clickable,
      data: { stage, kind: momentKind(stage), preview: momentPreview(stage, calls), summary: momentSummary(stage), selected: stage.id === selectedId, related: stage.id === relatedId, call },
    });
    // The line between moments says only that one came before the other.
    const prev = stages[i - 1];
    if (prev) {
      const gap = ms(stage.at) - ms(prev.endAt);
      edges.push({ id: `then:${stage.id}`, source: `moment:${prev.id}`, sourceHandle: "out", target: id, targetHandle: "in", type: "straight", style: EDGE, ...quiet, ...(gap > GAP_MS ? { label: `+${formatMs(gap)}`, ...LABEL } : {}) });
    }
  });

  // A selected model call opens beside itself: what its request carried,
  // feeding it; what it produced, hanging from it. Data flow, drawn as such.
  let branches: Branches | null = null;
  const row = selected?.stage === "call" && selected.callId ? calls.get(selected.callId) : undefined;
  if (selected && row) {
    const anchor = `moment:${selected.id}`;
    const cards = row.call ? contextCards(row.call) : [];
    const cardIds: string[] = [];
    for (const card of cards) {
      const id = `card:${row.id}:${card.id}`;
      cardIds.push(id);
      nodes.push({ id, type: "card", position: ORIGIN, data: { card }, style: { width: BRANCH_W }, ...clickable });
      edges.push({ id: `e:${id}`, source: id, target: anchor, targetHandle: "top", type: "default", style: EDGE, markerEnd: ARROW, ...quiet });
    }
    if (cards.length) nodes.push(caption("caption:context", "Captured request context"));
    let outputId: string | null = null;
    if (row.call) {
      outputId = `output:${row.id}`;
      nodes.push({ id: outputId, type: "output", position: ORIGIN, data: { call: row.call }, style: { width: BRANCH_W }, ...clickable });
      edges.push({ id: `e:${outputId}`, source: anchor, sourceHandle: "down", target: outputId, type: "default", style: EDGE, markerEnd: ARROW, ...quiet });
      nodes.push(caption("caption:output", "Captured output"));
    }
    branches = { anchor, cardIds, outputId };
  }

  // The tie the trace recorded for the selected moment, over the line:
  // solid and pointed when an id carried the join, dotted when timing did.
  if (relation && selected && (relation.from === selected.id || relation.to === selected.id)) {
    const explicit = relation.correlation === "explicit";
    edges.push({ id: "tie", source: `moment:${relation.from}`, sourceHandle: "up", target: `moment:${relation.to}`, targetHandle: "top", type: "arc", style: explicit ? EDGE : DOTTED, markerEnd: explicit ? ARROW : undefined, label: relationWord(relation.correlation), ...quiet });
  }

  return { nodes, edges, momentIds, branches, selectedNodeId: selected ? `moment:${selected.id}` : null, relatedNodeId: relatedId ? `moment:${relatedId}` : null };
}

function pickFor(id: string): Pick | null {
  if (id.startsWith("moment:")) return { kind: "moment", stageId: id.slice(7) };
  if (id.startsWith("card:")) return { kind: "card", card: id.slice(id.lastIndexOf(":") + 1) as CardId };
  if (id.startsWith("output:")) return { kind: "output" };
  return null;
}

// Positions from the layout. Where a moment stands needs no measuring;
// its branches and the focus do, so a node is unseen until measured.
type Placed = { nodes: TraceNode[]; ready: boolean; focus: Rect | null };
function place(spec: Spec, sizes: Map<string, Box>): Placed {
  // React Flow keeps only the sizes its nodes carry, so each node gets
  // its measurement back; fitting and edges depend on it.
  const measured = (n: TraceNode) => { const s = sizes.get(n.id); return s ? { width: s.w, height: s.h } : undefined; };
  const h = (id: string) => sizes.get(id)?.h ?? 0;
  const l = layoutTrace({
    moments: spec.momentIds.map((id) => ({ id, w: MOMENT_W, h: h(id) })),
    branches: spec.branches ? { anchor: spec.branches.anchor, cards: spec.branches.cardIds.map((id) => ({ id, w: BRANCH_W, h: h(id) })), output: spec.branches.outputId ? { id: spec.branches.outputId, w: BRANCH_W, h: h(spec.branches.outputId) } : null } : null,
  });
  const extra = new Map<string, Point>();
  if (l.captions.context) extra.set("caption:context", l.captions.context);
  if (l.captions.output) extra.set("caption:output", l.captions.output);
  const nodes = spec.nodes.map((n) => ({ ...n, position: l.positions.get(n.id) ?? extra.get(n.id) ?? ORIGIN, measured: measured(n), style: { ...n.style, visibility: sizes.has(n.id) ? undefined : "hidden" } }) as TraceNode);
  const ready = spec.nodes.every((n) => sizes.has(n.id));
  const rects: Rect[] = [];
  for (const id of [spec.selectedNodeId, spec.relatedNodeId]) {
    const p = id ? l.positions.get(id) : undefined;
    if (id && p) rects.push({ x: p.x, y: p.y, w: MOMENT_W, h: h(id) });
  }
  if (l.context) rects.push(l.context);
  if (l.output) rects.push(l.output);
  return { nodes, ready, focus: union(rects) };
}

function union(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  const x = Math.min(...rects.map((r) => r.x)), y = Math.min(...rects.map((r) => r.y));
  return { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) - x, h: Math.max(...rects.map((r) => r.y + r.h)) - y };
}

export function TraceCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

function Canvas({ stages, calls, selectedId, relation, onPick, empty }: Props) {
  const spec = useMemo(() => buildSpec({ stages, calls, selectedId, relation }), [stages, calls, selectedId, relation]);
  const [sizes, setSizes] = useState(() => new Map<string, Box>());
  const container = useRef<HTMLDivElement>(null);
  const fitted = useRef(false);
  const ensured = useRef<string | null>(null);
  const { fitView, getViewport, setViewport, setCenter, zoomIn, zoomOut } = useReactFlow();
  const store = useStoreApi();
  // The size React Flow itself works with; when it changes, the check below runs again.
  const flowWidth = useStore((s) => s.width);
  const flowHeight = useStore((s) => s.height);

  // React Flow reports each node's size once the browser has it; the
  // layout runs on those sizes. Nothing else it reports is applied:
  // positions are the layout's, and nothing moves by hand.
  const onNodesChange = useCallback((changes: NodeChange<TraceNode>[]) => {
    setSizes((prev) => {
      let next: Map<string, Box> | null = null;
      for (const c of changes) {
        if (c.type !== "dimensions" || !c.dimensions) continue;
        const had = prev.get(c.id);
        if (had && had.w === c.dimensions.width && had.h === c.dimensions.height) continue;
        next ??= new Map(prev);
        next.set(c.id, { id: c.id, w: c.dimensions.width, h: c.dimensions.height });
      }
      return next ?? prev;
    });
  }, []);
  const placed = useMemo(() => place(spec, sizes), [spec, sizes]);
  const focusRef = useRef<Rect | null>(null);
  useEffect(() => { focusRef.current = placed.ready ? placed.focus : null; }, [placed]);

  // The camera: the whole trace at first, then left alone unless the
  // selected moment and its branches leave the view, when it slides just
  // far enough or, if they cannot fit at this zoom, pulls back just
  // enough. A pull-back remembers the zoom it left; when room comes back
  // (a panel closes) the camera returns there. The person's own pan or
  // zoom lets that memory go.
  const settled = useRef(false);               // the first fit has landed
  const pulled = useRef<number | null>(null);  // the zoom a pull-back left
  const centerOn = useCallback((b: Rect, zoom: number) => {
    const { width: w, height: h } = store.getState();
    void setViewport({ x: w / 2 - (b.x + b.w / 2) * zoom, y: h / 2 - (b.y + b.h / 2) * zoom, zoom }, { duration: 250 });
  }, [store, setViewport]);
  const ensureVisible = useCallback((b: Rect) => {
    const { width: w, height: h } = store.getState();
    if (!w || !h) return;
    const v = getViewport();
    const sx = b.x * v.zoom + v.x, sy = b.y * v.zoom + v.y, sw = b.w * v.zoom, sh = b.h * v.zoom;
    if (sx >= MARGIN && sy >= MARGIN && sx + sw <= w - MARGIN && sy + sh <= h - MARGIN) return;
    if (sw <= w - 2 * MARGIN && sh <= h - 2 * MARGIN) {
      const dx = sx < MARGIN ? MARGIN - sx : sx + sw > w - MARGIN ? w - MARGIN - (sx + sw) : 0;
      const dy = sy < MARGIN ? MARGIN - sy : sy + sh > h - MARGIN ? h - MARGIN - (sy + sh) : 0;
      void setViewport({ x: v.x + dx, y: v.y + dy, zoom: v.zoom }, { duration: 250 });
      return;
    }
    pulled.current ??= v.zoom;
    centerOn(b, Math.max(MIN_ZOOM, fitZoom(b, w, h)));
  }, [store, getViewport, setViewport, centerOn]);
  const restore = useCallback((b: Rect) => {
    const { width: w, height: h } = store.getState();
    const target = pulled.current;
    if (!w || !h || target === null) return;
    const zoom = Math.max(MIN_ZOOM, Math.min(target, fitZoom(b, w, h)));
    if (zoom >= target) pulled.current = null;
    centerOn(b, zoom);
  }, [store, centerOn]);
  const letGo = () => { pulled.current = null; };

  useEffect(() => {
    if (!placed.ready) return;
    if (!fitted.current) {
      fitted.current = true;
      ensured.current = selectedId;
      // React Flow fits to the size it last measured; while the panel
      // around it settles that can lag the real one, so wait for them to
      // agree, for a moment at most.
      let tries = 0;
      const attempt = () => {
        const c = container.current;
        const s = store.getState();
        if (c && (s.width !== c.clientWidth || s.height !== c.clientHeight) && tries++ < 30) { requestAnimationFrame(attempt); return; }
        void fitView({ padding: 0.1, maxZoom: 1 }).then(() => { settled.current = true; });
      };
      requestAnimationFrame(attempt);
      return;
    }
    if (ensured.current === selectedId) return;
    ensured.current = selectedId;
    // The opened card and its branches are measured a frame after they
    // appear; read the focus then, not now.
    requestAnimationFrame(() => requestAnimationFrame(() => { const f = focusRef.current; if (f) ensureVisible(f); }));
  }, [placed, selectedId, fitView, store, ensureVisible]);

  // When the canvas itself changes size (a panel opens or closes beside
  // it, the window changes), keep the selected moment in view, and give
  // back what a pull-back took once there is room for it.
  const sized = useRef({ w: 0, h: 0 });
  useEffect(() => {
    const was = sized.current;
    sized.current = { w: flowWidth, h: flowHeight };
    if (!settled.current || !was.w || !was.h || (was.w === flowWidth && was.h === flowHeight)) return;
    const focus = focusRef.current;
    if (focus) requestAnimationFrame(() => (pulled.current !== null ? restore(focus) : ensureVisible(focus)));
  }, [flowWidth, flowHeight, ensureVisible, restore]);

  const reset = () => {
    letGo();
    const f = placed.focus;
    if (f) void setCenter(f.x + f.w / 2, f.y + f.h / 2, { zoom: 1, duration: 250 });
    else void setViewport({ x: MARGIN, y: MARGIN, zoom: 1 }, { duration: 250 });
  };

  return (
    <div ref={container} className="relative h-full w-full">
      <ReactFlow<TraceNode>
        nodes={placed.nodes}
        edges={spec.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, node) => { const pick = pickFor(node.id); if (pick) onPick(pick); }}
        onMoveStart={(event) => { if (event) letGo(); }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        selectionOnDrag={false}
        panOnDrag
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick={false}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        deleteKeyCode={null}
        multiSelectionKeyCode={null}
        selectionKeyCode={null}
        className="bg-background"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#e6e6e6" />
        <Panel position="bottom-left" className="m-3 flex gap-0.5 rounded-md border bg-background p-0.5 shadow-sm">
          <Tool label="Zoom in" onClick={() => { letGo(); void zoomIn({ duration: 150 }); }}><ZoomIn className="size-3.5" /></Tool>
          <Tool label="Zoom out" onClick={() => { letGo(); void zoomOut({ duration: 150 }); }}><ZoomOut className="size-3.5" /></Tool>
          <Tool label="Fit the trace" onClick={() => { letGo(); void fitView({ padding: 0.1, maxZoom: 1, duration: 250 }); }}><Maximize2 className="size-3.5" /></Tool>
          <Tool label="Reset to the selected moment" onClick={reset}><LocateFixed className="size-3.5" /></Tool>
        </Panel>
      </ReactFlow>
      {empty && <p className="pointer-events-none absolute inset-0 flex items-center justify-center p-8 text-center text-[13px] leading-5 text-muted-foreground">{empty}</p>}
    </div>
  );
}

function Tool({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} className={cn("flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground")}>
      {children}
    </button>
  );
}
