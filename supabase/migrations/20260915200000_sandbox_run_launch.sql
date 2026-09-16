-- A run now goes on past the clone: launching the application, then running
-- it. Widen the status check to cover those states.
alter table engelbart_sandbox_runs drop constraint if exists engelbart_sandbox_runs_status_check;
alter table engelbart_sandbox_runs add constraint engelbart_sandbox_runs_status_check
  check (status in ('queued','creating','cloning','cloned','paused','launching','running','failed','killed'));
