// An annotation as the app holds it: the row, the domain object, and the
// mapping between them. A note belongs to a repository — the artifact —
// and names the run, recording, commit and moment it was written in as
// context. Deleting any of those leaves the note where it is. Pure.
import { readAnchor, type AnnotationAnchor } from "@/lib/annotations/target";

export type Annotation = {
  id: string;
  projectId: string;
  repoId: string;
  runId: string | null;
  recordingId: string | null;
  userId: string;
  body: string;
  anchor: AnnotationAnchor;
  route: string | null;
  commitSha: string | null;
  stageId: string | null;
  callId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AnnotationRow = {
  id: string; project_id: string; repo_id: string; run_id: string | null; recording_id: string | null;
  user_id: string; body: string; anchor: unknown; route: string | null; commit_sha: string | null;
  stage_id: string | null; call_id: string | null; created_at: string; updated_at: string;
};

export const ANNOTATION_COLUMNS = "id, project_id, repo_id, run_id, recording_id, user_id, body, anchor, route, commit_sha, stage_id, call_id, created_at, updated_at";

// An anchor that cannot be read is left empty rather than dropping the
// row: the researcher's note is the part that matters, and an empty
// element simply resolves to nothing and is listed without a marker.
const EMPTY_ANCHOR: AnnotationAnchor = { element: {}, ancestors: [], frame: { frameId: null, name: null, selectorInParent: null, path: [], depth: 0, kind: "document" }, route: null, documentTitle: null };

export function toAnnotation(r: AnnotationRow): Annotation {
  const read = readAnchor(r.anchor);
  return {
    id: r.id, projectId: r.project_id, repoId: r.repo_id, runId: r.run_id, recordingId: r.recording_id,
    userId: r.user_id, body: r.body, anchor: read.ok ? read.anchor : EMPTY_ANCHOR,
    route: r.route, commitSha: r.commit_sha, stageId: r.stage_id, callId: r.call_id,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

// Who may change it. Reading is the project's; editing and deleting are
// the author's, in the database and here, so the interface says the same
// thing the policy does instead of offering a control that fails.
export const isAuthor = (a: Annotation, userId: string | null) => !!userId && a.userId === userId;
