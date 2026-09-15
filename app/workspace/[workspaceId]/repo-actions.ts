"use server";

import { createClient } from "@/lib/supabase/server";
import { parseGitHubRepo, type Repo } from "@/lib/repos";
import { REPO_COLUMNS, toRepo, type RepoRow } from "@/lib/repos-server";

export type AddRepoResult = { ok: true; repo: Repo } | { ok: false; error: string };

const GITHUB_HEADERS = { Accept: "application/vnd.github+json", "User-Agent": "engelbart-web" };

// What GitHub says about a public repository, or why it could not say.
type Lookup =
  | { found: true; url: string; defaultBranch: string; description: string; language: string }
  | { found: false; reason: "missing" | "unavailable" };

async function lookupRepo(owner: string, name: string): Promise<Lookup> {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${name}`, { headers: GITHUB_HEADERS, cache: "no-store" });
    if (res.status === 404) return { found: false, reason: "missing" };
    if (!res.ok) return { found: false, reason: "unavailable" };
    const r = (await res.json()) as { html_url?: string; default_branch?: string; description?: string | null; language?: string | null };
    return {
      found: true,
      url: r.html_url ?? `https://github.com/${owner}/${name}`,
      defaultBranch: r.default_branch ?? "",
      description: r.description ?? "",
      language: r.language ?? "",
    };
  } catch {
    return { found: false, reason: "unavailable" };
  }
}

// Adds a repository to the project for the signed-in account. The URL is
// parsed, then checked against GitHub so only repositories that exist are
// kept. A private repository looks like a missing one to GitHub without a
// token, so it is refused for now.
export async function addRepo(projectId: string, input: string): Promise<AddRepoResult> {
  const parsed = parseGitHubRepo(input);
  if (!parsed) return { ok: false, error: "Enter a GitHub URL or owner/repository." };

  const lookup = await lookupRepo(parsed.owner, parsed.name);
  if (!lookup.found && lookup.reason === "missing") {
    return { ok: false, error: `github.com/${parsed.owner}/${parsed.name} was not found. It may be private.` };
  }
  const details = lookup.found
    ? lookup
    : { url: `https://github.com/${parsed.owner}/${parsed.name}`, defaultBranch: "", description: "", language: "" };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { ok: false, error: "You are not signed in." };

  const { data, error } = await supabase
    .from("engelbart_repos")
    .insert({
      user_id: userId, project_id: projectId, owner: parsed.owner, name: parsed.name,
      url: details.url, default_branch: details.defaultBranch, description: details.description, language: details.language,
    })
    .select(REPO_COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "That repository is already in this project." };
    return { ok: false, error: error.message };
  }
  return { ok: true, repo: toRepo(data as RepoRow) };
}

export async function removeRepo(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("engelbart_repos").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// The repository's README as GitHub serves it, for public repositories.
export async function fetchReadme(owner: string, name: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${name}/readme`, {
      headers: { ...GITHUB_HEADERS, Accept: "application/vnd.github.raw+json" },
      next: { revalidate: 300 },
    });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}
