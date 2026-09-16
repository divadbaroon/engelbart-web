-- One row per attempt to bring a repository up in a sandbox, plus an
-- append-only event log per run. The event log is what the Terminal tab
-- renders and what a failed run is debugged from.

create table if not exists engelbart_sandbox_runs (
  id           uuid primary key default gen_random_uuid(),
  repo_id      uuid not null references engelbart_repos(id) on delete cascade,
  project_id   uuid not null references hc_projects(id) on delete cascade,
  user_id      uuid not null,
  sandbox_id   text,
  template     text not null default 'base',
  status       text not null default 'queued'
               check (status in ('queued','creating','cloning','cloned','paused','failed','killed')),
  workdir      text,
  error_kind   text,
  error        text,
  port         integer,
  preview_url  text,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz
);

create table if not exists engelbart_sandbox_events (
  id      bigint generated always as identity primary key,
  run_id  uuid not null references engelbart_sandbox_runs(id) on delete cascade,
  seq     integer not null,
  at      timestamptz not null default now(),
  kind    text not null check (kind in ('status','command','stdout','stderr','metrics','error')),
  text    text not null default '',
  data    jsonb,
  unique (run_id, seq)
);

create index if not exists engelbart_sandbox_runs_repo_idx on engelbart_sandbox_runs (repo_id, started_at desc);

alter table engelbart_sandbox_runs   enable row level security;
alter table engelbart_sandbox_events enable row level security;

drop policy if exists engelbart_sandbox_runs_read on engelbart_sandbox_runs;
create policy engelbart_sandbox_runs_read on engelbart_sandbox_runs
  for select using (
    project_id in (select p.id from hc_projects p where p.user_id = (select auth.uid()))
    or project_id in (select hc_member_projects())
  );

drop policy if exists engelbart_sandbox_runs_insert on engelbart_sandbox_runs;
create policy engelbart_sandbox_runs_insert on engelbart_sandbox_runs
  for insert with check (user_id = auth.uid() and hc_can_write(project_id));

drop policy if exists engelbart_sandbox_runs_update on engelbart_sandbox_runs;
create policy engelbart_sandbox_runs_update on engelbart_sandbox_runs
  for update using (user_id = auth.uid());

drop policy if exists engelbart_sandbox_events_read on engelbart_sandbox_events;
create policy engelbart_sandbox_events_read on engelbart_sandbox_events
  for select using (run_id in (select id from engelbart_sandbox_runs));

drop policy if exists engelbart_sandbox_events_insert on engelbart_sandbox_events;
create policy engelbart_sandbox_events_insert on engelbart_sandbox_events
  for insert with check (run_id in (select id from engelbart_sandbox_runs where user_id = auth.uid()));

-- Realtime: the browser subscribes to new events and status changes.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'engelbart_sandbox_events') then
    alter publication supabase_realtime add table engelbart_sandbox_events;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'engelbart_sandbox_runs') then
    alter publication supabase_realtime add table engelbart_sandbox_runs;
  end if;
end $$;
