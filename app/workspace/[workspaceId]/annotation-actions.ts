"use server";

import { createClient } from "@/lib/supabase/server";
import { ANNOTATION_COLUMNS, toAnnotation, type Annotation, type AnnotationRow } from "@/lib/annotations/model";
import { readAnchor, readBody } from "@/lib/annotations/target";

// A repository's interface annotations, as the signed-in member: list,
// write, edit, delete. Everything about an annotation that says who and
// where is attached here, on the server, from rows this member may
// already read — the page the note was written in is imported and
// untrusted, and the only things it contributes are the note and the
// description of the element, both rebuilt before they are stored.
// Editing and deleting are the author's alone, in the database and here.
export type AnnotationResult = { ok: true; annotation: Annotation } | { ok: false; error: string };

export type NewAnnotation = {
  repoId: string;
  runId?: string | null;
  recordingId?: string | null;
  body: string;
  anchor: unknown;              // from the page: validated, never taken as given
  stageId?: string | null;      // which moment was selected as it was written
  callId?: string | null;
};

export async function listAnnotations(repoId: string): Promise<{ ok: true; annotations: Annotation[]; viewerId: string | null } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const { data, error } = await supabase.from("engelbart_annotations").select(ANNOTATION_COLUMNS).eq("repo_id", repoId).order("created_at");
  if (error) return { ok: false, error: describe(error.message) };
  return { ok: true, annotations: (data as AnnotationRow[]).map(toAnnotation), viewerId: claims?.claims.sub ?? null };
}

export async function createAnnotation(input: NewAnnotation): Promise<AnnotationResult> {
  const body = readBody(input.body);
  if (!body.ok) return body;
  const anchor = readAnchor(input.anchor);
  if (!anchor.ok) return anchor;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { ok: false, error: "You are not signed in." };

  // The project is the repository's, never the caller's to name.
  const { data: repo, error: repoError } = await supabase.from("engelbart_repos").select("project_id").eq("id", input.repoId).maybeSingle();
  if (repoError) return { ok: false, error: repoError.message };
  if (!repo) return { ok: false, error: "That repository is no longer there." };

  // The run and the recording are context, and each must belong to what
  // it is being filed under. The policy says this too; it is said here so
  // a mismatch is a sentence rather than a silent refusal.
  let commitSha: string | null = null;
  let runId: string | null = null;
  if (input.runId) {
    const { data: run, error: runError } = await supabase.from("engelbart_sandbox_runs").select("repo_id, project_id, commit_sha").eq("id", input.runId).maybeSingle();
    if (runError) return { ok: false, error: runError.message };
    if (!run) return { ok: false, error: "That run is no longer there." };
    if (run.repo_id !== input.repoId || run.project_id !== repo.project_id) return { ok: false, error: "That run is not this repository's." };
    runId = input.runId;
    commitSha = run.commit_sha ?? null;
  }
  let recordingId: string | null = null;
  if (input.recordingId) {
    const { data: rec, error: recError } = await supabase.from("engelbart_recordings").select("run_id").eq("id", input.recordingId).maybeSingle();
    if (recError) return { ok: false, error: recError.message };
    if (!rec) return { ok: false, error: "That recording is no longer there." };
    if (!runId || rec.run_id !== runId) return { ok: false, error: "That recording is not this run's." };
    recordingId = input.recordingId;
  }

  const { data, error } = await supabase
    .from("engelbart_annotations")
    .insert({
      project_id: repo.project_id, repo_id: input.repoId, run_id: runId, recording_id: recordingId, user_id: userId,
      body: body.body, anchor: anchor.anchor, route: anchor.anchor.route, commit_sha: commitSha,
      stage_id: text(input.stageId, 200), call_id: text(input.callId, 200),
    })
    .select(ANNOTATION_COLUMNS).single();
  if (error) return { ok: false, error: describe(error.message) };
  return { ok: true, annotation: toAnnotation(data as AnnotationRow) };
}

// The note is the only part that can be edited: what it is attached to is
// what it was written about, and moving that would make it a different
// observation.
export async function editAnnotation(id: string, body: string): Promise<AnnotationResult> {
  const clean = readBody(body);
  if (!clean.ok) return clean;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("engelbart_annotations")
    .update({ body: clean.body, updated_at: new Date().toISOString() })
    .eq("id", id).select(ANNOTATION_COLUMNS).maybeSingle();
  if (error) return { ok: false, error: describe(error.message) };
  return data ? { ok: true, annotation: toAnnotation(data as AnnotationRow) } : { ok: false, error: notAuthor };
}

export async function deleteAnnotation(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  // A delete that matches nothing returns no error, so the deleted row is
  // asked for: nothing deleted is said out loud.
  const { data, error } = await supabase.from("engelbart_annotations").delete().eq("id", id).select("id").maybeSingle();
  if (error) return { ok: false, error: describe(error.message) };
  return data ? { ok: true } : { ok: false, error: notAuthor };
}

// An update or delete that matches no row is nearly always the author-only
// policy refusing it, and an RLS refusal is silent.
const notAuthor = "That annotation is someone else's: only the person who wrote a note can change or delete it.";

const text = (v: string | null | undefined, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

const describe = (message: string) =>
  /relation .* does not exist|schema cache/i.test(message) ? "The annotations table is not in the database yet: apply the annotations migration." : message;
