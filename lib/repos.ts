export type Repo = { id: string; name: string; meta: string; readme?: string; isNew?: boolean };
export type TermLine = { prompt: string; text: string };

// Simulated background preparation: five steps, the last one means the app is ready.
// Replace with real job status from your backend.
export const PREP_STEPS = [0, 1200, 2600, 4000, 5400];
export const isReadyStep = (step: number | undefined) => (step ?? -1) >= PREP_STEPS.length - 1;

const README_WEB = [
  "# Engelbart Web", "",
  "The web client for Engelbart: a research workspace where plans, papers, code, and results live next to Bart, the research assistant.", "",
  "## Getting started", "",
  "Install dependencies and start the dev server:", "",
  "```bash", "pnpm install", "pnpm dev", "```", "",
  "Open [http://localhost:3000](http://localhost:3000). The app reloads as you edit files under `app/`.", "",
  "## Project structure", "",
  "- `app/` — routes and layouts (Next.js App Router)",
  "- `components/` — UI built on [shadcn/ui](https://ui.shadcn.com)",
  "- `lib/` — data access, markdown rendering, and shared types",
  "- `public/` — static assets, including the empty-state illustrations", "",
  "## Environment", "",
  "Copy `.env.example` to `.env.local` and set the following:", "",
  "```bash", "DATABASE_URL=postgres://localhost:5432/engelbart", "GITHUB_APP_ID=", "GITHUB_PRIVATE_KEY=", "```", "",
  "## Scripts", "",
  "1. `pnpm dev` — start the development server",
  "2. `pnpm lint` — run ESLint and type checks",
  "3. `pnpm build` — create a production build", "",
  "> Bart runs as a separate service. See [engelbart/bart-agent](https://github.com/engelbart/bart-agent) for setup.", "",
  "## Contributing", "",
  "Open a pull request against `main`. CI runs lint, type checks, and Playwright smoke tests on every push.",
].join("\n");

const README_AGENT = [
  "# Bart Agent", "",
  "Bart is the research assistant behind Engelbart. It reads the papers, code, data, and results attached to a project and answers questions grounded in them.", "",
  "## Requirements", "",
  "- Python 3.12+",
  "- [uv](https://github.com/astral-sh/uv) for dependency management",
  "- A Postgres database shared with `engelbart/web`", "",
  "## Setup", "",
  "```bash", "uv sync", "uv run uvicorn bart.app:app --reload", "```", "",
  "The API listens on `http://127.0.0.1:8000`. Health check: `GET /healthz`.", "",
  "## How it works", "",
  "1. **Ingest** — papers are chunked and embedded; repositories are indexed by file and symbol.",
  "2. **Retrieve** — each question pulls the most relevant chunks across sources.",
  "3. **Answer** — the model responds with citations back to the paper, file, or result.", "",
  "Configuration lives in `bart/config.py`. Model selection is exposed to the client as `model` on `/chat`.", "",
  "## Testing", "",
  "```bash", "uv run pytest -q", "```", "",
  "> Evaluation runs against the fixtures in [vt-lab/eval-harness](https://github.com/vt-lab/eval-harness).",
].join("\n");

const README_EVAL = [
  "# eval-harness", "",
  "Reproducible evaluation for research assistants. Define a task set, run it against one or more agents, and compare results across runs.", "",
  "## Install", "",
  "```bash", "pnpm install", "pnpm dev", "```", "",
  "## Defining a task", "",
  "Tasks are YAML files under `tasks/`:", "",
  "```yaml", "id: summarize-related-work", "paper: attention-is-all-you-need", "prompt: Summarize the related work section in three sentences.", "rubric: rubrics/summary.md", "```", "",
  "## Running", "",
  "- `pnpm eval --agent bart` — run every task against Bart",
  "- `pnpm eval --task summarize-related-work` — run one task",
  "- `pnpm report` — build the HTML comparison report in `out/`", "",
  "Results are written as JSON to `runs/<timestamp>/` and are safe to commit.", "",
  "## Notes", "",
  "Scores are *rubric-based*, not exact-match. See [docs/scoring.md](docs/scoring.md) for how partial credit is assigned.",
].join("\n");

// Sample data — replace with repos linked to the current project (and their real README.md).
export const SAMPLE_REPOS: Repo[] = [
  { id: "r1", name: "engelbart/web", meta: "main · Next.js", readme: README_WEB },
  { id: "r2", name: "engelbart/bart-agent", meta: "main · Python", readme: README_AGENT },
  { id: "r3", name: "vt-lab/eval-harness", meta: "dev · TypeScript", readme: README_EVAL },
];

const line = (prompt: string, text: string): TermLine => ({ prompt, text });

// One group of lines per preparation step.
export function terminalScript(repo: Repo): TermLine[][] {
  const short = repo.name.split("/")[1] ?? repo.name;
  const clone = [
    line("$", `git clone git@github.com:${repo.name}.git`),
    line("", `Cloning into '${short}'...`),
    line("", "remote: Enumerating objects: 1,284, done."),
  ];
  if (/Python/.test(repo.meta)) {
    return [
      clone,
      [line("$", "uv sync"), line("", "Resolved 48 packages in 320ms"), line("", "Installed 48 packages in 1.9s")],
      [line("$", "uv run uvicorn bart.app:app --reload"), line("", "INFO:     Started reloader process [4821] using WatchFiles")],
      [line("", "INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)")],
      [line("", "INFO:     Application startup complete.")],
    ];
  }
  if (/TypeScript/.test(repo.meta)) {
    return [
      clone,
      [line("$", "pnpm install"), line("", "Packages: +388"), line("", "Done in 4.8s")],
      [line("$", "pnpm dev"), line("", "> eval-harness@0.4.0 dev"), line("", "> vite")],
      [line("", "VITE v6.0.1  ready in 412 ms")],
      [line("", "➜  Local:   http://localhost:5173/")],
    ];
  }
  return [
    clone,
    [line("$", "pnpm install"), line("", "Packages: +412"), line("", "Done in 6.1s")],
    [line("$", "pnpm dev"), line("", "> web@0.1.0 dev"), line("", "> next dev")],
    [line("", "▲ Next.js 15.0.3"), line("", "- Local:   http://localhost:3000")],
    [line("", "✓ Ready in 1.2s")],
  ];
}

export function previewUrl(repo: Repo) {
  if (/Python/.test(repo.meta)) return "http://127.0.0.1:8000";
  if (/TypeScript/.test(repo.meta)) return "http://localhost:5173";
  return "http://localhost:3000";
}
