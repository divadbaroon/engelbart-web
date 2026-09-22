-- Which way a run is allowed to recover when the pipeline cannot start the
-- repository. Null and 'ladder' are the same thing and are what every run
-- has done until now: a repair agent, then a resolver, then a setup agent,
-- each a separate call that reads a summary of the last one. 'session' is
-- one continuing agent session that keeps its context across the whole
-- recovery and hands back a launch description the pipeline executes.
--
-- A column on the run rather than a setting on the worker, because the
-- point of it is to compare the two on the same repositories in one
-- benchmark pass: a worker-wide switch could only run them one after the
-- other, which confounds the comparison with whatever changed in between.
-- It is carried exactly as `fresh` is — written at insert, read at claim,
-- forwarded into the sandbox.
--
-- Nothing reads it as an enum: the wrapper treats anything it does not
-- recognise as 'ladder', so an old worker meeting a new value still runs.
alter table engelbart_sandbox_runs add column if not exists variant text;

comment on column engelbart_sandbox_runs.variant is
  'How this run may recover from a failed launch: null or ''ladder'' for the repair/resolve/setup rungs, ''session'' for one continuing agent session. Unrecognised values are treated as ''ladder''.';

-- The benchmark asks "how did each arm do on these repositories", which is
-- a scan of one arm's runs over a set of repos. Partial, because the column
-- is null for every run made before this and for every run that does not
-- name an arm.
create index if not exists engelbart_sandbox_runs_variant
  on engelbart_sandbox_runs (variant, repo_id) where variant is not null;
