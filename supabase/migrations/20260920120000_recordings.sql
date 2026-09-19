-- Recordings: a saved slice of a run's trace, by time. The trace events
-- and model calls stay where they are; a recording is only its two
-- boundaries and a name, and opening one reads the existing rows that
-- fall between them. One recording at a time per run. Owned like the
-- run's project; deleting a recording deletes nothing else.

create table if not exists engelbart_recordings (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references engelbart_sandbox_runs(id) on delete cascade,
  project_id  uuid not null references hc_projects(id) on delete cascade,
  user_id     uuid not null default auth.uid(),
  name        text not null check (length(name) between 1 and 120),
  status      text not null default 'recording' check (status in ('recording', 'complete')),
  started_at  timestamptz not null default now(),
  stopped_at  timestamptz,
  created_at  timestamptz not null default now(),
  check ((status = 'recording' and stopped_at is null) or (status = 'complete' and stopped_at is not null)),
  check (stopped_at is null or stopped_at >= started_at)
);

-- Only one recording can be open on a run.
create unique index if not exists engelbart_recordings_one_active on engelbart_recordings (run_id) where status = 'recording';
create index if not exists engelbart_recordings_run on engelbart_recordings (run_id, started_at desc);

alter table engelbart_recordings enable row level security;

drop policy if exists engelbart_recordings_read on engelbart_recordings;
create policy engelbart_recordings_read on engelbart_recordings
  for select using (
    project_id in (select p.id from hc_projects p where p.user_id = (select auth.uid()))
    or project_id in (select hc_member_projects())
  );

-- Writing one: the project must be one this member may write, and it must
-- be the run's own project. Without the second half a member could point a
-- recording at someone else's run while naming a project of their own, and
-- so both read that run by its boundaries and take the one-recording-at-a-
-- time slot on it. The run row is readable by exactly the audience of its
-- project, so this never refuses a recording its owner may legitimately make.
drop policy if exists engelbart_recordings_insert on engelbart_recordings;
create policy engelbart_recordings_insert on engelbart_recordings
  for insert with check (
    user_id = (select auth.uid())
    and (project_id in (select p.id from hc_projects p where p.user_id = (select auth.uid())) or hc_can_write(project_id))
    and exists (
      select 1 from engelbart_sandbox_runs r
      where r.id = engelbart_recordings.run_id and r.project_id = engelbart_recordings.project_id
    )
  );

-- Stopping and renaming. The check is repeated after the change so a row
-- cannot be moved to another project or another project's run.
drop policy if exists engelbart_recordings_update on engelbart_recordings;
create policy engelbart_recordings_update on engelbart_recordings
  for update using (
    project_id in (select p.id from hc_projects p where p.user_id = (select auth.uid()))
    or hc_can_write(project_id)
  ) with check (
    (project_id in (select p.id from hc_projects p where p.user_id = (select auth.uid())) or hc_can_write(project_id))
    and exists (
      select 1 from engelbart_sandbox_runs r
      where r.id = engelbart_recordings.run_id and r.project_id = engelbart_recordings.project_id
    )
  );

drop policy if exists engelbart_recordings_delete on engelbart_recordings;
create policy engelbart_recordings_delete on engelbart_recordings
  for delete using (
    project_id in (select p.id from hc_projects p where p.user_id = (select auth.uid()))
    or hc_can_write(project_id)
  );
