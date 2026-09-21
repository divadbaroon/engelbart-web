// Files as the Code tab shows them, whichever side they come from: GitHub
// for a repository at rest, the sandbox once the application is running.
// Kept free of React and of Supabase.

export type TreeEntry = { path: string; type: "blob" | "tree"; size: number };
export type FileTree = { entries: TreeEntry[]; truncated: boolean } | { error: string };
export type FileContent = { text: string } | { binary: true } | { tooLarge: true } | { error: string };

// GitHub's own web view gives up around here too.
export const MAX_FILE_BYTES = 10_000_000;

// Text if it looks like text: under the size cap and no NUL in the first 8 KB.
export function decodeFile(bytes: Uint8Array): FileContent {
  if (bytes.byteLength > MAX_FILE_BYTES) return { tooLarge: true };
  if (bytes.subarray(0, 8000).includes(0)) return { binary: true };
  return { text: new TextDecoder("utf-8", { fatal: false }).decode(bytes) };
}

// The README at the top of the repository, if it has one.
//
// What the pane opens on when nothing has been chosen. A file browser
// whose first screen is "Select a file" asks a question nobody came here
// to answer; the README is the file a repository is written to be read
// from, so it is the answer, and a repository without one keeps the
// prompt rather than being given some other file to stand in for it.
//
// Only the top level: a `docs/README.md` is documentation about a folder,
// not the thing the repository opens with. `README.md` is preferred over
// the rarer spellings, and the case is whatever the repository used.
export function readmeIn(tree: FileTree): string | null {
  if ("error" in tree) return null;
  const top = tree.entries.filter((e) => e.type === "blob" && !e.path.includes("/"));
  return top.find((e) => /^readme\.md$/i.test(e.path))?.path
    ?? top.find((e) => /^readme(\.|$)/i.test(e.path))?.path
    ?? null;
}

// A path inside the repository: relative, no empty or parent segments.
export function isSafeRepoPath(path: string): boolean {
  if (!path || path.startsWith("/") || path.includes("\\") || path.includes("\0")) return false;
  return path.split("/").every((seg) => seg !== "" && seg !== "." && seg !== "..");
}
