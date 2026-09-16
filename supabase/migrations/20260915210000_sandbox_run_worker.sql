-- Runs are executed by a worker process rather than inside a web request.
-- The worker claims queued runs and heartbeats while it holds them, so a
-- run left behind by a dead worker can be told apart from one in progress.
alter table engelbart_sandbox_runs add column if not exists worker_id text;
alter table engelbart_sandbox_runs add column if not exists claimed_at timestamptz;
alter table engelbart_sandbox_runs add column if not exists heartbeat_at timestamptz;

-- The worker polls for unclaimed queued runs; keep that lookup cheap.
create index if not exists engelbart_sandbox_runs_queued
  on engelbart_sandbox_runs (started_at)
  where status = 'queued' and worker_id is null;
