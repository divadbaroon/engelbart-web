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

// A path inside the repository: relative, no empty or parent segments.
export function isSafeRepoPath(path: string): boolean {
  if (!path || path.startsWith("/") || path.includes("\\") || path.includes("\0")) return false;
  return path.split("/").every((seg) => seg !== "" && seg !== "." && seg !== "..");
}
