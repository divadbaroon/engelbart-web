"use client";

import "@xyflow/react/dist/base.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Background, BackgroundVariant, MarkerType, Panel, ReactFlow, ReactFlowProvider, useReactFlow, useStore, useStoreApi, type Edge, type NodeChange } from "@xyflow/react";
import { Hand, LocateFixed, Maximize2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { contextCards, type CardId } from "@/lib/trace/context";
import { BRANCH_W, MOMENT_W, layoutTrace, type Box, type Point, type Rect } from "@/lib/trace/layout";
import { cardLines, relationWord, type Relation } from "@/lib/trace/moments";
import { stageIdOf, type GraphNode } from "@/lib/activity/graph";
import { formatMs, type CallRow, type Stage } from "@/lib/trace/timeline";
import { edgeTypes, nodeTypes, type TraceNode } from "@/components/trace/nodes";

// The trace as one canvas: every moment of the session as a card on one
// line, left to right in time order, joined by a line that says only
// "then". The selected moment opens where it stands; a selected model
// call also shows, beside it, what its captured request carried and what
// it produced. A tie the trace recorded between two moments is drawn for
// the selected one only: solid when an id carried the join, dotted when
// only timing did. React Flow draws, pans and zooms; nothing on it can be
// wired or edited.
//
// Every position comes from the layout until a person picks a card up,
// after which that card stands where they put it and the layout is
// overruled for it alone — kept in `moved`, and given back all at once
// by the toolbar. A card that was moved is still the same card: the
// lines into it follow, and so does the camera.
// A click on the line names the moment and, where the moment is one of
// the person's behaviours, which behaviour: a submit stage is two cards,
// the writing and the sending, and they are not the same choice.
export type Pick = { kind: "moment"; stageId: string; episodeId?: string } | { kind: "card"; card: CardId } | { kind: "output" };
type Props = {
  // The session as lib/activity read it: the participant's episodes and
  // the system's moments, in one order. The canvas draws this and works
  // nothing out for itself, so the timeline and the canvas cannot come to
  // different conclusions about the same trace.
  graph: GraphNode[];
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
// The canvas opens at life size on the first moment rather than at
// whatever zoom would hold the whole run: a session of any length fits
// only by shrinking every card past reading, and the beginning is where
// a person starts reading anyway. Panning right follows the session.
const START_ZOOM = 1;
const MAX_ZOOM = 2;
const fitZoom = (b: Rect, w: number, h: number) => Math.min((w - 2 * MARGIN) / b.w, (h - 2 * MARGIN) / b.h);
const still = { draggable: false, selectable: false, focusable: false, connectable: false, style: { pointerEvents: "none" as const } };
const clickable = { draggable: true, connectable: false };
const quiet = { selectable: false, focusable: false, interactionWidth: 0 };

// What the canvas holds for this moment, before anything is measured.
type Branches = { anchor: string; cardIds: string[]; outputId: string | null };
type Spec = { nodes: TraceNode[]; edges: Edge[]; momentIds: string[]; branches: Branches | null; selectedNodeId: string | null; relatedNodeId: string | null };

function buildSpec({ graph, stages, calls, selectedId, relation }: Omit<Props, "onPick" | "empty">): Spec {
  const nodes: TraceNode[] = [];
  const edges: Edge[] = [];
  const momentIds: string[] = [];
  const byStage = new Map(stages.map((s) => [s.id, s]));
  const selected = stages.find((s) => s.id === selectedId) ?? null;
  const relatedId = relation ? (relation.from === selectedId ? relation.to : relation.from) : null;
  const caption = (id: string, text: string): TraceNode => ({ id, type: "caption", position: ORIGIN, data: { text }, ...still });
  // Which nodes came from which stage. A submit stage is two moments —
  // the composing and the send — so a stage no longer names one node.
  const drawn = new Map<string, string[]>();

  graph.forEach((node, i) => {
    const stage = byStage.get(node.stageId);
    if (!stage) return;
    momentIds.push(node.id);
    drawn.set(node.stageId, [...(drawn.get(node.stageId) ?? []), node.id]);
    const call = node.kind === "model" ? stage.rows.find((r): r is CallRow => r.kind === "call") ?? null : null;
    const lines = cardLines(stage, calls);
    // What the card says, decided here from the reading rather than in
    // the card from the stage.
    const said =
      node.kind === "participant"
        ? {
            title: node.description, badge: node.broad as string, preview: formatMs(node.durationMs), summary: node.sub,
            // On hover, the reading and then what it was read from — so
            // the collector's name for the stretch is reachable without
            // being what the card appears to be about.
            hover: `${node.broad} · ${node.description}\nRead from ${stage.label}`,
          }
        : node.kind === "observed"
          ? { title: node.label, badge: null, preview: node.text ? `“${node.text}”` : null, summary: lines.summary, hover: stage.label }
          : { title: stage.title, badge: null, preview: lines.preview, summary: lines.summary, hover: stage.label };
    nodes.push({
      id: node.id, type: "moment", position: ORIGIN, style: { width: MOMENT_W }, ...clickable,
      data: { stage, kind: node.kind === "participant" ? "human" : node.kind, at: node.at, ...said, selected: node.stageId === selectedId, related: node.stageId === relatedId, call },
    });
    // The line between moments says only that one came before the other.
    const prev = graph[i - 1];
    if (prev) {
      const gap = ms(node.at) - ms(prev.endAt);
      edges.push({ id: `then:${node.id}`, source: prev.id, sourceHandle: "out", target: node.id, targetHandle: "in", type: "straight", style: EDGE, ...quiet, ...(gap > GAP_MS ? { label: `+${formatMs(gap)}`, ...LABEL } : {}) });
    }
  });

  // A selected model call opens beside itself: what its request carried,
  // feeding it; what it produced, hanging from it. Data flow, drawn as such.
  let branches: Branches | null = null;
  const row = selected?.stage === "call" && selected.callId ? calls.get(selected.callId) : undefined;
  if (selected && row) {
    const anchor = drawn.get(selected.id)?.[0] ?? `moment:${selected.id}`;
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
    // A stage can be two nodes, so the tie has to say which. It leaves
    // the last moment of the stage that caused it — the send, never the
    // composing before it — and arrives at the first of the stage it
    // caused.
    const from = drawn.get(relation.from)?.at(-1);
    const to = drawn.get(relation.to)?.[0];
    const explicit = relation.correlation === "explicit";
    if (from && to) edges.push({ id: "tie", source: from, sourceHandle: "up", target: to, targetHandle: "top", type: "arc", style: explicit ? EDGE : DOTTED, markerEnd: explicit ? ARROW : undefined, label: relationWord(relation.correlation), ...quiet });
  }

  return { nodes, edges, momentIds, branches, selectedNodeId: selected ? drawn.get(selected.id)?.[0] ?? null : null, relatedNodeId: relatedId ? drawn.get(relatedId)?.[0] ?? null : null };
}

function pickFor(id: string, graph: GraphNode[]): Pick | null {
  if (id.startsWith("moment:")) {
    const node = graph.find((n) => n.id === id);
    return { kind: "moment", stageId: stageIdOf(id), ...(node?.kind === "participant" ? { episodeId: node.episodeId } : {}) };
  }
  if (id.startsWith("card:")) return { kind: "card", card: id.slice(id.lastIndexOf(":") + 1) as CardId };
  if (id.startsWith("output:")) return { kind: "output" };
  return null;
}

// Positions from the layout. Where a moment stands needs no measuring;
// its branches and the focus do, so a node is unseen until measured.
type Placed = { nodes: TraceNode[]; ready: boolean; focus: Rect | null; first: Rect | null; last: Rect | null };
function place(spec: Spec, sizes: Map<string, Box>, moved: Map<string, Point>): Placed {
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
  // Where a card actually stands: where the layout put it, unless it was
  // picked up. Everything that reads a position reads this one, so the
  // camera and the edges follow a moved card rather than its ghost.
  const at = (id: string): Point => moved.get(id) ?? l.positions.get(id) ?? extra.get(id) ?? ORIGIN;
  const nodes = spec.nodes.map((n) => ({ ...n, position: at(n.id), measured: measured(n), style: { ...n.style, visibility: sizes.has(n.id) ? undefined : "hidden" } }) as TraceNode);
  const ready = spec.nodes.every((n) => sizes.has(n.id));
  const box = (id: string, w: number): Rect | null => (sizes.has(id) ? { ...at(id), w, h: h(id) } : null);
  const rects: Rect[] = [];
  for (const id of [spec.selectedNodeId, spec.relatedNodeId]) {
    const b = id ? box(id, MOMENT_W) : null;
    if (b) rects.push(b);
  }
  // The branches are measured here rather than taken from the layout, so
  // that a branch card someone moved is still part of what the camera
  // keeps in view.
  if (spec.branches) {
    const branch = [...spec.branches.cardIds, ...(spec.branches.outputId ? [spec.branches.outputId] : [])]
      .flatMap((id) => { const b = box(id, BRANCH_W); return b ? [b] : []; });
    const grouped = union(branch);
    if (grouped) rects.push(grouped);
  }
  // The earliest moment, which the layout puts at the left of the spine:
  // where the canvas opens, and what it opens on again after a clear.
  // The latest is the one the camera follows while a run is still going.
  const first = spec.momentIds.length ? box(spec.momentIds[0], MOMENT_W) : null;
  const last = spec.momentIds.length ? box(spec.momentIds[spec.momentIds.length - 1], MOMENT_W) : null;
  return { nodes, ready, focus: union(rects), first, last };
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

function Canvas({ graph, stages, calls, selectedId, relation, onPick, empty }: Props) {
  const spec = useMemo(() => buildSpec({ graph, stages, calls, selectedId, relation }), [graph, stages, calls, selectedId, relation]);
  const [sizes, setSizes] = useState(() => new Map<string, Box>());
  // Where cards were put by hand, and whether the camera belongs to the
  // person. Free view is off by default: while a run is going the newest
  // moment appears off the right edge, and following it is what someone
  // watching one actually wants. Turning it on stops the canvas moving
  // under them for any reason but their own.
  const [moved, setMoved] = useState(() => new Map<string, Point>());
  const [free, setFree] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const fitted = useRef(false);
  const ensured = useRef<string | null>(null);
  const { fitView, getViewport, setViewport, setCenter, zoomIn, zoomOut } = useReactFlow();
  const store = useStoreApi();
  // The size React Flow itself works with; when it changes, the check below runs again.
  const flowWidth = useStore((s) => s.width);
  const flowHeight = useStore((s) => s.height);

  // React Flow reports each node's size once the browser has it, and
  // where a node was dragged to; the layout runs on the sizes, and a
  // drag overrules the layout for that one card. Nothing else it
  // reports is applied.
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
    setMoved((prev) => {
      let next: Map<string, Point> | null = null;
      for (const c of changes) {
        if (c.type !== "position" || !c.position) continue;
        const had = prev.get(c.id);
        if (had && had.x === c.position.x && had.y === c.position.y) continue;
        next ??= new Map(prev);
        next.set(c.id, { x: c.position.x, y: c.position.y });
      }
      return next ?? prev;
    });
  }, []);
  const placed = useMemo(() => place(spec, sizes, moved), [spec, sizes, moved]);
  const focusRef = useRef<Rect | null>(null);
  const lastRef = useRef<Rect | null>(null);
  useEffect(() => {
    focusRef.current = placed.ready ? placed.focus : null;
    lastRef.current = placed.ready ? placed.last : null;
  }, [placed]);

  // The camera: the whole trace at first, then left alone unless the
  // newest moment or the selected moment and its branches leave the
  // view, when it slides just far enough or, if they cannot fit at this
  // zoom, pulls back just enough. A pull-back remembers the zoom it
  // left; when room comes back (a panel closes) the camera returns
  // there. The person's own pan or zoom lets that memory go, and free
  // view stops all of it.
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

  // The last moment on the line, and the last one the camera went to. A
  // moment already on screen moves nothing: following means never having
  // to pan after the run, not the canvas twitching at every arrival.
  const newest = spec.momentIds.length ? spec.momentIds[spec.momentIds.length - 1] : null;
  const followed = useRef<string | null>(null);

  useEffect(() => {
    if (!placed.ready) return;
    if (!fitted.current) {
      // An empty canvas is not a view to frame. Waiting means the camera
      // is set by the first moment that arrives — which is what a canvas
      // that has just been cleared, or a run that has only just started,
      // has to offer.
      const b = placed.first;
      if (!b) return;
      fitted.current = true;
      ensured.current = selectedId;
      // Opening a run that is already over still opens on its first
      // moment: only moments that arrive after this are followed.
      followed.current = newest;
      // React Flow fits to the size it last measured; while the panel
      // around it settles that can lag the real one, so wait for them to
      // agree, for a moment at most.
      let tries = 0;
      const attempt = () => {
        const c = container.current;
        const s = store.getState();
        if (c && (s.width !== c.clientWidth || s.height !== c.clientHeight) && tries++ < 30) { requestAnimationFrame(attempt); return; }
        const { width: w, height: h } = store.getState();
        if (!w || !h) { void fitView({ padding: 0.1, maxZoom: 1 }).then(() => { settled.current = true; }); return; }
        // Life size unless the card is taller than the canvas, and held
        // at the left margin so the session reads away to the right.
        const zoom = Math.max(MIN_ZOOM, Math.min(START_ZOOM, fitZoom(b, w, h)));
        const y = b.h * zoom <= h - 2 * MARGIN ? h / 2 - (b.y + b.h / 2) * zoom : MARGIN - b.y * zoom;
        void setViewport({ x: MARGIN - b.x * zoom, y, zoom }).then(() => { settled.current = true; });
      };
      requestAnimationFrame(attempt);
      return;
    }
    if (ensured.current === selectedId) return;
    ensured.current = selectedId;
    if (free) return;
    // The opened card and its branches are measured a frame after they
    // appear; read the focus then, not now.
    requestAnimationFrame(() => requestAnimationFrame(() => { const f = focusRef.current; if (f) ensureVisible(f); }));
  }, [placed, selectedId, fitView, setViewport, store, ensureVisible, free, newest]);

  // A moment that was not there a moment ago. Measured a frame later,
  // like the branches, because a card that has not been measured has no
  // box to bring into view.
  useEffect(() => {
    if (free || !settled.current || !placed.ready || !newest || followed.current === newest) return;
    followed.current = newest;
    requestAnimationFrame(() => requestAnimationFrame(() => { const b = lastRef.current; if (b) ensureVisible(b); }));
  }, [free, placed, newest, ensureVisible]);

  // When the canvas itself changes size (a panel opens or closes beside
  // it, the window changes), keep the selected moment in view, and give
  // back what a pull-back took once there is room for it.
  const sized = useRef({ w: 0, h: 0 });
  useEffect(() => {
    const was = sized.current;
    sized.current = { w: flowWidth, h: flowHeight };
    if (free || !settled.current || !was.w || !was.h || (was.w === flowWidth && was.h === flowHeight)) return;
    const focus = focusRef.current;
    if (focus) requestAnimationFrame(() => (pulled.current !== null ? restore(focus) : ensureVisible(focus)));
  }, [flowWidth, flowHeight, ensureVisible, restore, free]);

  // Leaving free view catches up with what happened while it was on;
  // entering it changes nothing, which is the point.
  const toggleFree = () => setFree((was) => { if (was) followed.current = null; return !was; });
  const putBack = () => setMoved(new Map());

  // Whether the pointer that is finishing on a card carried it there.
  // Cleared when a pointer goes down rather than when a drag starts: a
  // drag only starts once the pointer has moved past the threshold, so a
  // plain click after a drag would otherwise still be wearing the last
  // drag's answer and be swallowed.
  const carried = useRef(false);

  const reset = () => {
    letGo();
    const f = placed.focus;
    if (f) void setCenter(f.x + f.w / 2, f.y + f.h / 2, { zoom: 1, duration: 250 });
    else void setViewport({ x: MARGIN, y: MARGIN, zoom: 1 }, { duration: 250 });
  };

  return (
    <div ref={container} onPointerDownCapture={() => { carried.current = false; }} className="relative h-full w-full">
      <ReactFlow<TraceNode>
        nodes={placed.nodes}
        edges={spec.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, node) => {
          // A drag ends in a click as far as the DOM is concerned. A card
          // that was carried somewhere was not chosen, so it does not open.
          if (carried.current) { carried.current = false; return; }
          const pick = pickFor(node.id, graph);
          if (pick) onPick(pick);
        }}
        onNodeDrag={() => { carried.current = true; }}
        onMoveStart={(event) => { if (event) letGo(); }}
        nodeDragThreshold={2}
        nodesDraggable
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
          <Tool
            label={free ? "Free view is on — the camera stays where you put it" : "Free view — stop the camera following the newest moment"}
            active={free}
            onClick={toggleFree}
          ><Hand className="size-3.5" /></Tool>
          {moved.size > 0 && <Tool label="Put the cards back where the layout had them" onClick={putBack}><Undo2 className="size-3.5" /></Tool>}
        </Panel>
      </ReactFlow>
      {empty && <p className="pointer-events-none absolute inset-0 flex items-center justify-center p-8 text-center text-[13px] leading-5 text-muted-foreground">{empty}</p>}
    </div>
  );
}

function Tool({ label, onClick, active = false, children }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={active || undefined} onClick={onClick} className={cn("flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground", active && "bg-muted text-foreground")}>
      {children}
    </button>
  );
}
