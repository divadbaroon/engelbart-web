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
