-- Before anything is planned, a run makes a brief of the repository (what it
-- is, which part to run, what it needs), kept on the row so the next run of
-- the same commit reuses it. When the planner gives up, the run escalates
-- instead of failing; how it got where it got, and what its agent calls
-- cost, is kept too.
alter table engelbart_sandbox_runs add column if not exists brief jsonb;
alter table engelbart_sandbox_runs add column if not exists escalation jsonb;
create index if not exists engelbart_sandbox_runs_brief_by_commit
  on engelbart_sandbox_runs (repo_id, commit_sha) where brief is not null;
