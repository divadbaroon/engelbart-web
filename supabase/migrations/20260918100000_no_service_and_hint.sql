-- A run can end with the pipeline's conclusion that the repository has no
-- web application of its own to serve: a library, a dataset, a tool. That
-- is an answer, not a failure, so it gets its own status.
alter table engelbart_sandbox_runs drop constraint if exists engelbart_sandbox_runs_status_check;
alter table engelbart_sandbox_runs add constraint engelbart_sandbox_runs_status_check
  check (status in ('queued','creating','cloning','cloned','paused','launching','running','no_service','failed','killed'));

-- One line from the person about what to run, for repositories with
-- several applications and no declared entry point. Handed to the planner.
alter table engelbart_repos add column if not exists hint text;
