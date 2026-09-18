"use server";

import { createClient } from "@/lib/supabase/server";
import { parseGitHubRepo, type Repo } from "@/lib/repos";
import { REPO_COLUMNS, toRepo, type RepoRow } from "@/lib/repos";
import { decodeFile, isSafeRepoPath, type FileContent, type FileTree, type TreeEntry } from "@/lib/code-files";
import { GITHUB_HEADERS } from "@/lib/github";

export type AddRepoResult = { ok: true; repo: Repo } | { ok: false; error: string };

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

// Removing a repository removes its runs with it, so their sandboxes are
// killed first; a sandbox nobody can reach would otherwise run out its clock.
export async function removeRepo(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: runs } = await supabase
    .from("engelbart_sandbox_runs").select("sandbox_id").eq("repo_id", id).not("sandbox_id", "is", null).not("status", "in", "(failed,killed)");
  if (runs?.length) {
    const { Sandbox } = await import("e2b");
    await Promise.all(runs.map(async (r) => { try { await Sandbox.kill((r as { sandbox_id: string }).sandbox_id); } catch { /* already gone */ } }));
  }
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

// Throw away the repair agent's edits: the next run starts from a clean
// clone, and the saved recipe no longer re-applies them.
export async function dropPatch(repoId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("engelbart_repos").select("launch_recipe").eq("id", repoId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  const recipe = (data as { launch_recipe: Record<string, unknown> | null } | null)?.launch_recipe;
  const cleaned = recipe ? Object.fromEntries(Object.entries(recipe).filter(([k]) => k !== "patch")) : null;
  const update = await supabase.from("engelbart_repos").update({ patch: null, launch_recipe: cleaned }).eq("id", repoId);
  return update.error ? { ok: false, error: update.error.message } : { ok: true };
}

// One line from the person about what to run, kept on the repository and
// handed to the planner on the next run. Empty removes it.
export async function setRepoHint(repoId: string, hint: string): Promise<{ ok: true; hint: string | null } | { ok: false; error: string }> {
  const value = hint.trim().slice(0, 500) || null;
  const supabase = await createClient();
  const { error } = await supabase.from("engelbart_repos").update({ hint: value }).eq("id", repoId);
  return error ? { ok: false, error: error.message } : { ok: true, hint: value };
}

// The whole tree in one request. GitHub caps it at 100,000 entries and
// says so with `truncated`; the browser shows what it got.
export async function fetchTree(owner: string, name: string, branch: string): Promise<FileTree> {
  try {
    const ref = encodeURIComponent(branch || "HEAD");
    const res = await fetch(`https://api.github.com/repos/${owner}/${name}/git/trees/${ref}?recursive=1`, {
      headers: GITHUB_HEADERS,
      next: { revalidate: 300 },
    });
    if (res.status === 403 || res.status === 429) return { error: "GitHub's rate limit was reached. Try again in a few minutes." };
    if (!res.ok) return { error: `GitHub could not list the files (${res.status}).` };
    const body = (await res.json()) as { tree?: { path: string; type: string; size?: number }[]; truncated?: boolean };
    const entries: TreeEntry[] = (body.tree ?? [])
      .filter((e) => e.type === "blob" || e.type === "tree")
      .map((e) => ({ path: e.path, type: e.type as "blob" | "tree", size: e.size ?? 0 }));
    return { entries, truncated: !!body.truncated };
  } catch {
    return { error: "GitHub could not be reached." };
  }
}

// A file's contents. Served from raw.githubusercontent.com, which is not
// rate-limited like the API, when the branch is known.
export async function fetchFile(owner: string, name: string, branch: string, path: string): Promise<FileContent> {
  if (!isSafeRepoPath(path)) return { error: "That is not a path inside the repository." };
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const url = branch
    ? `https://raw.githubusercontent.com/${owner}/${name}/${encodeURIComponent(branch)}/${encoded}`
    : `https://api.github.com/repos/${owner}/${name}/contents/${encoded}`;
  try {
    const res = await fetch(url, {
      headers: branch ? { "User-Agent": "engelbart-web" } : { ...GITHUB_HEADERS, Accept: "application/vnd.github.raw+json" },
      next: { revalidate: 300 },
    });
    if (!res.ok) return { error: `GitHub could not read the file (${res.status}).` };
    return decodeFile(new Uint8Array(await res.arrayBuffer()));
  } catch {
    return { error: "GitHub could not be reached." };
  }
}
