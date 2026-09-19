// Reading a survey and a reading, neither of which is trusted.
//
// Two untrusted things meet here. The candidate tree comes from the
// running artifact, which is somebody else's code and may say anything at
// all; the semantic map comes from a model that was shown that code's
// text, which makes it the second thing the artifact could have written.
// So both are rebuilt field by field the way an annotation's anchor is:
// unknown keys dropped, every string capped, every enum checked against a
// closed set, and anything left unusable discarded rather than repaired.
//
// The important one is `ords`. A model may only point at candidates by
// number, and a number that was not in the survey is dropped here. That is
// what stops a reading naming an element nobody saw, and it is why nothing
// in this file ever reads a selector out of a model's answer.
//
// Pure: no DOM, no network, no database.
import type { ElementTarget } from "@/lib/trace/types";
import { readFrame, readTarget, type FrameRef } from "@/lib/annotations/target";
import {
  CONFIDENCES, MAX_CANDIDATES, MAX_DESCRIPTION, MAX_LABEL, SEMANTIC_KINDS,
  type Candidate, type CandidateTree, type Confidence, type SemanticKind, type SemanticNode, type UISemanticMap,
} from "@/lib/semantics/types";

const MAX_NODES = 40;
const MAX_ORDS = 20;
const SEMANTIC_ID = /^[a-z][a-z0-9_]{0,63}$/;

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
};
const kindOf = (v: unknown): SemanticKind => ((SEMANTIC_KINDS as readonly string[]).includes(v as string) ? (v as SemanticKind) : "other");
const confidenceOf = (v: unknown): Confidence => ((CONFIDENCES as readonly string[]).includes(v as string) ? (v as Confidence) : "low");

// ---- the survey, as the page sent it
export function readCandidateTree(v: unknown): CandidateTree | null {
  const raw = obj(v);
  if (!raw) return null;
  const candidates: Candidate[] = [];
  const seen = new Set<number>();
  for (const item of arr(raw.candidates)) {
    if (candidates.length >= MAX_CANDIDATES) break;
    const c = obj(item);
    if (!c) continue;
    const ord = Number.isInteger(c.ord) ? (c.ord as number) : null;
    const target = readTarget(c.target);
    if (ord === null || ord < 1 || seen.has(ord) || !target) continue;
    seen.add(ord);
    const parent = Number.isInteger(c.parent) ? (c.parent as number) : null;
    // A parent that is not itself a candidate, or that is not above this
    // one, is dropped rather than followed: the tree is for reading, and a
    // cycle in it would be somebody's idea of a joke.
    candidates.push({ ord, parent: parent !== null && parent >= 1 && parent < ord && seen.has(parent) ? parent : null, target });
  }
  if (!candidates.length) return null;
  return {
    route: text(raw.route, 2048),
    documentTitle: text(raw.documentTitle, 300),
    frame: readFrame(raw.frame),
    candidates,
    truncated: raw.truncated === true || arr(raw.candidates).length > MAX_CANDIDATES,
  };
}

// ---- the reading, as the model sent it
type ReadMapInput = {
  answer: unknown;              // whatever came back from the model
  tree: CandidateTree;
  signature: string;
};

function readNode(v: unknown, byOrd: Map<number, ElementTarget>, regionIds: Set<string> | null): SemanticNode | null {
  const raw = obj(v);
  if (!raw) return null;
  const semanticId = text(raw.semanticId, 64)?.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") ?? "";
  const label = text(raw.label, MAX_LABEL);
  if (!label || !SEMANTIC_ID.test(semanticId)) return null;
  const ords: number[] = [];
  const targets: ElementTarget[] = [];
  for (const o of arr(raw.ords)) {
    if (ords.length >= MAX_ORDS) break;
    if (!Number.isInteger(o)) continue;
    const target = byOrd.get(o as number);
    if (!target || ords.includes(o as number)) continue;
    ords.push(o as number);
    targets.push(target);
  }
  // A named thing that points at nothing the page showed is not a reading
  // of this page, whatever it says.
  if (!ords.length) return null;
  const regionId = text(raw.regionId, 64);
  return {
    semanticId, label,
    description: text(raw.description, MAX_DESCRIPTION),
    kind: kindOf(raw.kind),
    confidence: confidenceOf(raw.confidence),
    ords, targets,
    regionId: regionId && regionIds?.has(regionId) ? regionId : null,
  };
}

function unique(nodes: SemanticNode[]): SemanticNode[] {
  const out: SemanticNode[] = [], seen = new Set<string>();
  for (const n of nodes) {
    if (seen.has(n.semanticId) || out.length >= MAX_NODES) continue;
    seen.add(n.semanticId);
    out.push(n);
  }
  return out;
}

export function readSemanticMap({ answer, tree, signature }: ReadMapInput): UISemanticMap | null {
  const raw = obj(answer);
  if (!raw) return null;
  const byOrd = new Map(tree.candidates.map((c) => [c.ord, c.target]));
  const regions = unique(arr(raw.regions).map((r) => readNode(r, byOrd, null)).filter((n): n is SemanticNode => n !== null));
  const regionIds = new Set(regions.map((r) => r.semanticId));
  const controls = unique(arr(raw.controls).map((c) => readNode(c, byOrd, regionIds)).filter((n): n is SemanticNode => n !== null));
  return {
    v: 1, signature,
    route: tree.route,
    documentTitle: tree.documentTitle,
    frame: tree.frame,
    documentLabel: text(raw.documentLabel, MAX_LABEL),
    documentConfidence: confidenceOf(raw.documentConfidence),
    regions, controls,
    truncated: tree.truncated,
  };
}

// ---- the row
export type SemanticRow = {
  id: string; project_id: string; repo_id: string; run_id: string | null;
  signature: string; route: string | null; commit_sha: string | null;
  frame: unknown; map: unknown; candidates: unknown;
  model: string | null; created_at: string;
};

export type StoredSemantics = {
  id: string;
  repoId: string;
  runId: string | null;
  signature: string;
  route: string | null;
  commitSha: string | null;
  frame: FrameRef;
  map: UISemanticMap | null;
  candidates: CandidateTree | null;   // kept for the diagnostics panel, not for lookup
  model: string | null;
  createdAt: string;
};

export const SEMANTIC_COLUMNS = "id, project_id, repo_id, run_id, signature, route, commit_sha, frame, map, candidates, model, created_at";

// A stored map is read back through the same rebuilding a fresh one gets:
// what is in the database came from a page and a model, and time in a
// column does not make it trustworthy.
export function toStoredSemantics(r: SemanticRow): StoredSemantics {
  const tree = readCandidateTree(r.candidates);
  const frame = readFrame(r.frame);
  const map = tree ? readSemanticMap({ answer: r.map, tree, signature: r.signature }) : null;
  return {
    id: r.id, repoId: r.repo_id, runId: r.run_id, signature: r.signature,
    route: r.route, commitSha: r.commit_sha, frame,
    map: map ?? null, candidates: tree, model: r.model, createdAt: r.created_at,
  };
}

// The readings, as the rest of the app wants them: the maps, not the
// rows. A row whose reading could not be rebuilt still has its survey,
// and is simply not part of the index.
export const mapsOf = (stored: StoredSemantics[]): UISemanticMap[] =>
  stored.flatMap((s) => (s.map ? [s.map] : []));
