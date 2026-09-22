-- Whether this run may install the repository's dependencies before the
-- pipeline asks for them. Null is the same as true and is what every run
-- does: the moment the clone lands, the runner starts the one install the
-- lockfile unambiguously names, so that the brief and the plan are being
-- written while the download happens rather than after it.
--
-- A column rather than a setting on the worker, for the same reason as
-- `variant`: the question is whether the head start is worth its
-- complexity, and the only honest way to answer it is the same
-- repositories with it and without it in one pass. A worker-wide switch
-- could only run them on different days, against whatever npm, PyPI and
-- the repositories themselves happened to be doing at the time.
--
-- Nothing reads it as anything but "false means no": an older runner that
-- has never heard of it simply starts the install as it always did.
alter table engelbart_sandbox_runs add column if not exists head_start boolean;

comment on column engelbart_sandbox_runs.head_start is
  'Whether the runner may start this repository''s dependency install as soon as the clone lands. Null means yes, which is the default; false turns it off so a benchmark can price it.';
