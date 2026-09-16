-- What it took to bring a repository up last time: the pipeline's validated
-- launch plan, saved after a run reaches running. The next run replays it
-- and skips discovery, ordering and the agents; if the replay fails the
-- full pipeline runs again and overwrites it.
alter table engelbart_repos add column if not exists launch_recipe jsonb;
alter table engelbart_repos add column if not exists recipe_run_id uuid references engelbart_sandbox_runs(id) on delete set null;
alter table engelbart_repos add column if not exists recipe_at timestamptz;
