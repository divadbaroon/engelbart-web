-- A repository with nothing to serve can still be set up for use: installed,
-- checked, and left in a live sandbox with a shell. That run is "usable",
-- and what the person runs next is kept on the row.
alter table engelbart_sandbox_runs drop constraint if exists engelbart_sandbox_runs_status_check;
alter table engelbart_sandbox_runs add constraint engelbart_sandbox_runs_status_check
  check (status in ('queued','creating','cloning','cloned','paused','launching','running','usable','no_service','failed','killed'));
alter table engelbart_sandbox_runs add column if not exists usage jsonb;
