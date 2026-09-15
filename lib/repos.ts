// A GitHub repository attached to a project. Rows come from engelbart_repos.
// Kept free of React and of Supabase so the desktop app can share it.
export type Repo = {
  id: string;
  owner: string;
  name: string;
  fullName: string;   // owner/name
  url: string;
  defaultBranch: string;
  description: string;
  language: string;
  createdAt: string;
};

export type TermLine = { prompt: string; text: string };

// What the reader may paste: a github.com URL with or without scheme, .git
// or a deeper path, or a bare owner/name.
export function parseGitHubRepo(input: string): { owner: string; name: string } | null {
  const text = input.trim();
  if (!text) return null;
  const m =
    text.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[/?#].*)?$/) ??
    text.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/);
  if (!m) return null;
  const [, owner, name] = m;
  if (owner.startsWith(".") || name.startsWith(".")) return null;
  return { owner, name };
}

export const repoMeta = (repo: Repo) =>
  [repo.defaultBranch, repo.language].filter(Boolean).join(" · ") || repo.description || "GitHub";

// Simulated background preparation: five steps, the last one means the app
// is ready. Replaced by the hosted runtime's job status once E2B lands.
export const PREP_STEPS = [0, 1200, 2600, 4000, 5400];
export const isReadyStep = (step: number | undefined) => (step ?? -1) >= PREP_STEPS.length - 1;

const line = (prompt: string, text: string): TermLine => ({ prompt, text });

// One group of lines per preparation step, shaped by the repo's language.
export function terminalScript(repo: Repo): TermLine[][] {
  const clone = [
    line("$", `git clone https://github.com/${repo.fullName}.git`),
    line("", `Cloning into '${repo.name}'...`),
    line("", "remote: Enumerating objects, done."),
  ];
  if (/python/i.test(repo.language)) {
    return [
      clone,
      [line("$", "uv sync"), line("", "Resolved packages"), line("", "Installed packages")],
      [line("$", "uv run app"), line("", "INFO:     Started server process")],
      [line("", "INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)")],
      [line("", "INFO:     Application startup complete.")],
    ];
  }
  return [
    clone,
    [line("$", "npm install"), line("", "added packages"), line("", "Done")],
    [line("$", "npm run dev"), line("", `> ${repo.name} dev`)],
    [line("", "- Local:   http://localhost:3000")],
    [line("", "✓ Ready")],
  ];
}

export function previewUrl(repo: Repo) {
  return /python/i.test(repo.language) ? "http://127.0.0.1:8000" : "http://localhost:3000";
}
