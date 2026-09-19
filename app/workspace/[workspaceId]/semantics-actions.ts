"use server";

import { createClient } from "@/lib/supabase/server";
import { analyzeInterface } from "@/lib/semantics/analyze";
import { readCandidateTree, SEMANTIC_COLUMNS, toStoredSemantics, type SemanticRow, type StoredSemantics } from "@/lib/semantics/model";
import { diffSignature, sayDiff, signatureOf, type SignaturePart } from "@/lib/semantics/signature";

// A repository's readings of its own interfaces: fetch what is cached,
// and work out a new one when a document arrives that nothing has been
// said about.
//
// The survey comes from the page and is untrusted, so it is rebuilt
// before anything else happens. Everything that says who and where —
// project, repository, run — is attached here, from rows this member may
// already read; the page contributes only its own description of itself.
//
// A model is called only on a miss. That is the whole point of the
// signature, and `reason` says which it was so that a person can watch
// the cache work rather than believe it does.

export type SemanticsOutcome =
  | { ok: true; stored: StoredSemantics; hit: boolean; reason: string; signature: string }
  | { ok: false; error: string; signature: string | null };

export async function listSemantics(repoId: string): Promise<{ ok: true; maps: StoredSemantics[] } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("engelbart_ui_semantics").select(SEMANTIC_COLUMNS).eq("repo_id", repoId).order("created_at");
  if (error) return { ok: false, error: describe(error.message) };
  return { ok: true, maps: (data as SemanticRow[]).map(toStoredSemantics) };
}

export type SurveyInput = {
  repoId: string;
  runId?: string | null;
  survey: unknown;          // from the page
  refresh?: boolean;        // read it again even if something is cached
};

export async function ensureSemantics(input: SurveyInput): Promise<SemanticsOutcome> {
  const tree = readCandidateTree(input.survey);
  if (!tree) return { ok: false, error: "That document offered nothing that could be read.", signature: null };
  const { signature, parts } = signatureOf(tree);

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { ok: false, error: "You are not signed in.", signature };

  // The project is the repository's, never the caller's to name.
  const { data: repo, error: repoError } = await supabase.from("engelbart_repos").select("id, project_id").eq("id", input.repoId).maybeSingle();
  if (repoError) return { ok: false, error: describe(repoError.message), signature };
  if (!repo) return { ok: false, error: "That repository is not one you can open.", signature };

  const { data: existing, error: readError } = await supabase
    .from("engelbart_ui_semantics").select(SEMANTIC_COLUMNS).eq("repo_id", input.repoId).eq("signature", signature).maybeSingle();
  if (readError) return { ok: false, error: describe(readError.message), signature };
  if (existing && !input.refresh) {
    const stored = toStoredSemantics(existing as SemanticRow);
    if (stored.map) return { ok: true, stored, hit: true, reason: whyHit(stored), signature };
  }

  // A miss. Say what moved, where there is something to have moved from:
  // a hash that changed explains nothing, and the policy that decides
  // this is a heuristic meant to be judged against real pages.
  const reason = input.refresh ? "Asked for again." : await whyMiss(supabase, input.repoId, tree.route, parts);

  // The run is context and is checked rather than believed: a run named
  // here must be this repository's own, or the insert policy would refuse
  // it and the sentence would be a Postgres error instead of this.
  let runId: string | null = null;
  if (input.runId) {
    const { data: run } = await supabase.from("engelbart_sandbox_runs").select("id, commit_sha").eq("id", input.runId).eq("repo_id", input.repoId).maybeSingle();
    runId = run?.id ?? null;
  }
  const commitSha = runId ? await commitOf(supabase, runId) : null;

  const read = await analyzeInterface(tree, signature);
  if (!read.ok) return { ok: false, error: read.error, signature };

  const row = {
    project_id: repo.project_id, repo_id: input.repoId, run_id: runId, user_id: userId,
    signature, route: tree.route, commit_sha: commitSha,
    frame: tree.frame, map: read.map as unknown as Record<string, unknown>,
    candidates: tree as unknown as Record<string, unknown>, model: read.model,
  };
  const { data: saved, error: writeError } = await supabase
    .from("engelbart_ui_semantics").upsert(row, { onConflict: "repo_id,signature" }).select(SEMANTIC_COLUMNS).single();
  if (writeError) return { ok: false, error: describe(writeError.message), signature };
  return { ok: true, stored: toStoredSemantics(saved as SemanticRow), hit: false, reason, signature };
}

const whyHit = (stored: StoredSemantics): string =>
  `Read already, ${new Date(stored.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}${stored.model ? ` by ${stored.model}` : ""}.`;

// The nearest earlier reading of the same route, and what the signature
// says changed between it and this one. Nothing to compare against is an
// answer too: this interface has not been seen before.
async function whyMiss(
  supabase: Awaited<ReturnType<typeof createClient>>,
  repoId: string,
  route: string | null,
  parts: SignaturePart[],
): Promise<string> {
  const { data } = await supabase
    .from("engelbart_ui_semantics").select(SEMANTIC_COLUMNS).eq("repo_id", repoId).order("created_at", { ascending: false }).limit(10);
  const earlier = ((data ?? []) as SemanticRow[]).map(toStoredSemantics).find((s) => s.route === route && s.candidates);
  if (!earlier?.candidates) return "Nothing has been read for this interface before.";
  const before = signatureOf(earlier.candidates).parts;
  return `The interface changed since ${earlier.signature.slice(0, 8)}: ${sayDiff(diffSignature(before, parts))}`;
}

async function commitOf(supabase: Awaited<ReturnType<typeof createClient>>, runId: string): Promise<string | null> {
  const { data } = await supabase.from("engelbart_sandbox_runs").select("commit_sha").eq("id", runId).maybeSingle();
  return (data?.commit_sha as string | null) ?? null;
}

const describe = (message: string): string =>
  /relation .* does not exist/i.test(message)
    ? "The interface readings table is missing: apply the ui semantics migration."
    : message;
