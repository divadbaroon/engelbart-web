-- The commit a run cloned, so a launch recipe can be tied to the code it
-- was captured on.
alter table engelbart_sandbox_runs add column if not exists commit_sha text;

-- Launch recipes shared across projects. When a public repository reaches
-- running anywhere, what it took (the plan, and any edits the repair agent
-- made) is kept here by commit, so the next project to add that repository
-- replays it instead of paying for discovery and repair again. A project's
-- own row still holds its copy, which it can change (drop the patch, say)
-- without affecting anyone else. Only the worker reads or writes this
-- table: row-level security is on with no policies, so the browser cannot.
create table if not exists engelbart_launch_recipes (
  id uuid primary key default gen_random_uuid(),
  owner text not null,          -- lower-cased GitHub owner
  name text not null,           -- lower-cased repository name
  commit_sha text not null,
  recipe jsonb not null,
  captured_run_id uuid references engelbart_sandbox_runs(id) on delete set null,
  captured_repo_id uuid references engelbart_repos(id) on delete set null,
  captured_at timestamptz not null default now(),
  unique (owner, name, commit_sha)
);
create index if not exists engelbart_launch_recipes_latest on engelbart_launch_recipes (owner, name, captured_at desc);
alter table engelbart_launch_recipes enable row level security;
