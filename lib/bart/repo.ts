// The repository as Bart reads it: from the run's sandbox while it is
// live, so edits and generated files are what the application is really
// running, and from GitHub otherwise. Files that look like secrets are
// never read, and the repository's saved environment values are struck
// from anything returned. Server only.
import { CommandExitError } from "e2b";
import { openSandbox, type OpenedSandbox } from "@/lib/sandbox-access";
import { createClient } from "@/lib/supabase/server";
import { listRepoPaths } from "@/lib/github";
import { decodeFile, isSafeRepoPath, type FileContent } from "@/lib/code-files";
import { isSandboxLive, type SandboxRun } from "@/lib/sandbox";
import type { Repo } from "@/lib/repos";
import { fetchFile, fetchReadme } from "@/app/workspace/[workspaceId]/repo-actions";

export type From = "sandbox" | "github";
export type RepoAccess = { repo: Repo; run: SandboxRun | null; redact: (text: string) => string };

// Paths that are not read whatever they contain.
const DENY = /(^|\/)(\.env(\.[^/]*)?|[^/]*\.(pem|key|p12|pfx|jks|keystore)|id_(rsa|dsa|ecdsa|ed25519)[^/]*|secrets?(\.[^/]*)?|credentials?(\.[^/]*)?|\.npmrc|\.pypirc|\.netrc|service-account[^/]*\.json)$/i;
export const isDenied = (path: string) => DENY.test(path);
// Directories that are never worth searching from GitHub.
const SKIP = /(^|\/)(node_modules|\.git|\.next|dist|build|out|__pycache__|\.venv|venv|target|coverage|vendor)(\/|$)/;
const LOCKS = /(^|\/)([^/]*\.lock|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|poetry\.lock|Cargo\.lock)$/;
const TEXTUAL = /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|swift|c|h|cc|cpp|hpp|cs|php|scala|sh|bash|zsh|sql|md|mdx|txt|json|yaml|yml|toml|ini|cfg|env\.example|html|css|scss|vue|svelte|r|jl|m|ipynb|dockerfile|makefile|gradle|xml|csv)$|(^|\/)(Dockerfile|Makefile|README|LICENSE|Procfile)$/i;

export const SEARCH_LINES = 60;
const LINE_CHARS = 240;
const GITHUB_SEARCH_FILES = 40;
const GITHUB_SEARCH_BYTES = 200_000;

// Strikes the repository's saved environment values from text. Values of
// five characters or fewer are left: they would strike ordinary words.
export async function redactor(repoId: string): Promise<(text: string) => string> {
  const supabase = await createClient();
  const { data } = await supabase.from("engelbart_repo_env").select("name, value").eq("repo_id", repoId);
  const secrets = ((data ?? []) as { name: string; value: string }[]).filter((r) => typeof r.value === "string" && r.value.length >= 6).sort((a, b) => b.value.length - a.value.length);
  if (!secrets.length) return (text) => text;
  return (text) => secrets.reduce((acc, s) => acc.split(s.value).join(`[redacted ${s.name}]`), text);
}

async function sandboxOf(run: SandboxRun | null): Promise<OpenedSandbox | null> {
  if (!run || !isSandboxLive(run)) return null;
  const opened = await openSandbox(run.id);
  return "error" in opened ? null : opened;
}

const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

export async function listFiles(a: RepoAccess): Promise<{ paths: string[]; from: From } | { error: string }> {
  const sb = await sandboxOf(a.run);
  if (sb) {
    try {
      const r = await sb.sandbox.commands.run("git ls-files --cached --others --exclude-standard -z", { cwd: sb.workdir, timeoutMs: 30_000 });
      return { paths: r.stdout.split("\0").filter((p) => p && !isDenied(p)), from: "sandbox" };
    } catch { /* the sandbox went away between the check and the call: GitHub */ }
  }
  const paths = await listRepoPaths(a.repo.owner, a.repo.name, a.repo.defaultBranch);
  if (!paths) return { error: "The files could not be listed: the sandbox is not running and GitHub would not list them (rate limit, private repository, or network)." };
  return { paths: paths.filter((p) => !isDenied(p)), from: "github" };
}

function fromContent(f: FileContent): { text: string } | { error: string } {
  if ("text" in f) return { text: f.text };
  if ("binary" in f) return { error: "That file is binary." };
  if ("tooLarge" in f) return { error: "That file is too large to read." };
  return { error: f.error };
}

export async function readFile(a: RepoAccess, path: string): Promise<{ text: string; from: From } | { error: string }> {
  if (!isSafeRepoPath(path)) return { error: "That is not a path inside the repository." };
  if (isDenied(path)) return { error: "That file is kept out of reach: it looks like an environment file or a key." };
  const sb = await sandboxOf(a.run);
  if (sb) {
    try {
      const got = fromContent(decodeFile(await sb.sandbox.files.read(`${sb.workdir}/${path}`, { format: "bytes" })));
      return "text" in got ? { text: a.redact(got.text), from: "sandbox" } : got;
    } catch (err) {
      if (/not found|no such file|does not exist/i.test(err instanceof Error ? err.message : String(err))) return { error: `There is no file at ${path} in the sandbox.` };
    }
  }
  const got = fromContent(await fetchFile(a.repo.owner, a.repo.name, a.repo.defaultBranch, path));
  return "text" in got ? { text: a.redact(got.text), from: "github" } : got;
}

// The README at the root, whatever its extension.
export async function readReadme(a: RepoAccess): Promise<{ text: string; path: string; from: From } | { error: string }> {
  const listed = await listFiles(a);
  if ("paths" in listed && listed.from === "sandbox") {
    const path = listed.paths.find((p) => /^readme(\.[a-z]+)?$/i.test(p));
    if (path) { const got = await readFile(a, path); if ("text" in got) return { ...got, path }; }
  }
  const text = await fetchReadme(a.repo.owner, a.repo.name);
  if (text === null) return { error: "No README could be read: none at the root of the sandbox, and GitHub returned none." };
  const path = "paths" in listed ? listed.paths.find((p) => /^readme(\.[a-z]+)?$/i.test(p)) ?? "README.md" : "README.md";
  return { text: a.redact(text), path, from: "github" };
}

export type SearchHit = { path: string; line: number; text: string };
export type SearchResult = { hits: SearchHit[]; from: From; partial: string | null } | { error: string };

// Lines containing a literal string, case-insensitive: git grep in the
// sandbox; from GitHub, a bounded read of the likeliest source files.
export async function searchFiles(a: RepoAccess, needle: string, glob: string | null): Promise<SearchResult> {
  const clean = needle.trim();
  if (!clean) return { error: "Empty search." };
  const sb = await sandboxOf(a.run);
  if (sb) {
    const spec = glob && isSafeRepoPath(glob.replace(/\*/g, "x")) ? ` -- ${shellQuote(glob)}` : " -- .";
    const cmd = `git grep -n -I -i -F --max-count=8 -e ${shellQuote(clean)}${spec} ':!*.lock' ':!package-lock.json' ':!pnpm-lock.yaml' ':!yarn.lock' | head -n ${SEARCH_LINES + 1}`;
    try {
      const r = await sb.sandbox.commands.run(cmd, { cwd: sb.workdir, timeoutMs: 30_000 });
      const lines = r.stdout.split("\n").filter(Boolean);
      const hits = lines.slice(0, SEARCH_LINES).map(parseGrepLine).filter((h): h is SearchHit => !!h && !isDenied(h.path)).map((h) => ({ ...h, text: a.redact(h.text) }));
      return { hits, from: "sandbox", partial: lines.length > SEARCH_LINES ? `more than ${SEARCH_LINES} matching lines; the first ${SEARCH_LINES} are shown` : null };
    } catch (err) {
      if (err instanceof CommandExitError && err.exitCode === 1) return { hits: [], from: "sandbox", partial: null };
      if (!(err instanceof CommandExitError)) { /* the sandbox went away: GitHub */ } else return { error: `The search failed: ${err.stderr.trim().split("\n").pop() ?? `exit ${err.exitCode}`}` };
    }
  }
  const listed = await listFiles(a);
  if ("error" in listed) return listed;
  const pattern = glob ? globToRegExp(glob) : null;
  const candidates = listed.paths.filter((p) => !SKIP.test(p) && !LOCKS.test(p) && TEXTUAL.test(p) && (!pattern || pattern.test(p)));
  const chosen = candidates.slice(0, GITHUB_SEARCH_FILES);
  const lower = clean.toLowerCase();
  const hits: SearchHit[] = [];
  for (let i = 0; i < chosen.length && hits.length < SEARCH_LINES; i += 8) {
    const batch = await Promise.all(chosen.slice(i, i + 8).map(async (path) => ({ path, got: await fetchFile(a.repo.owner, a.repo.name, a.repo.defaultBranch, path) })));
    for (const { path, got } of batch) {
      if (!("text" in got) || got.text.length > GITHUB_SEARCH_BYTES) continue;
      got.text.split("\n").forEach((text, n) => { if (hits.length < SEARCH_LINES && text.toLowerCase().includes(lower)) hits.push({ path, line: n + 1, text: a.redact(text.slice(0, LINE_CHARS)) }); });
    }
  }
  const partial = candidates.length > chosen.length ? `the sandbox is not running, so only ${chosen.length} of ${candidates.length} source files were read from GitHub; start the run to search everything` : hits.length >= SEARCH_LINES ? `the first ${SEARCH_LINES} matching lines are shown` : null;
  return { hits, from: "github", partial };
}

function parseGrepLine(line: string): SearchHit | null {
  const m = /^(.*?):(\d+):(.*)$/.exec(line);
  return m ? { path: m[1], line: Number(m[2]), text: m[3].slice(0, LINE_CHARS) } : null;
}

function globToRegExp(glob: string): RegExp {
  const src = glob.split("**").map((part) => part.split("*").map((s) => s.replace(/[.+^${}()|[\]\\?]/g, "\\$&")).join("[^/]*")).join(".*");
  return new RegExp(`(^|/)${src}$`);
}
