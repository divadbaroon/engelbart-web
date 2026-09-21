// Talking to GitHub's API from the server and the worker.

export const GITHUB_HEADERS: Record<string, string> = {
  Accept: "application/vnd.github+json", "User-Agent": "engelbart-web",
  // Optional: lifts the anonymous rate limit of 60 requests an hour.
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
};

// Every file path in the repository at that branch, in one request. Null
// when GitHub would not say: rate limit, private repository, network.
export async function listRepoPaths(owner: string, name: string, branch: string): Promise<string[] | null> {
  try {
    const ref = encodeURIComponent(branch || "HEAD");
    const res = await fetch(`https://api.github.com/repos/${owner}/${name}/git/trees/${ref}?recursive=1`, { headers: GITHUB_HEADERS });
    if (!res.ok) return null;
    const body = (await res.json()) as { tree?: { path: string; type: string }[] };
    return (body.tree ?? []).filter((e) => e.type === "blob").map((e) => e.path);
  } catch {
    return null;
  }
}

// Whether the repository is public. Null when GitHub would not say, which
// callers treat as private.
export async function isPublicRepo(owner: string, name: string): Promise<boolean | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${name}`, { headers: GITHUB_HEADERS });
    if (!res.ok) return null;
    const body = (await res.json()) as { private?: boolean };
    return typeof body.private === "boolean" ? !body.private : null;
  } catch {
    return null;
  }
}

// The text of some files, at a commit. Used to show a model what an
// artifact's own authors called things, so it is bounded on both counts:
// how many files, and how much of each. A file that will not come back
// is skipped rather than retried — the pack is evidence, not an index,
// and a hole in it is survivable.
export async function readRepoFiles(
  owner: string, name: string, ref: string, paths: string[],
  limits: { maxFiles?: number; maxBytes?: number } = {},
): Promise<{ path: string; bytes: number; text?: string }[]> {
  const maxFiles = limits.maxFiles ?? 60;
  const maxBytes = limits.maxBytes ?? 24_000;
  const out: { path: string; bytes: number; text?: string }[] = [];
  for (const path of paths.slice(0, maxFiles)) {
    try {
      const res = await fetch(`https://raw.githubusercontent.com/${owner}/${name}/${encodeURIComponent(ref || "HEAD")}/${path.split("/").map(encodeURIComponent).join("/")}`, { headers: GITHUB_HEADERS });
      if (!res.ok) { out.push({ path, bytes: 0 }); continue; }
      const text = await res.text();
      out.push({ path, bytes: text.length, text: text.length > maxBytes ? `${text.slice(0, maxBytes)}…` : text });
    } catch {
      out.push({ path, bytes: 0 });
    }
  }
  return out;
}
