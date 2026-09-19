-- Bart's conversations. A thread belongs to a workspace (an hc project);
-- its messages are in order. A message records what was in the middle
-- when it was asked (the run, the repository, the selected moment), so a
-- thread can span runs and artifacts within the workspace. Read and
-- written as the signed-in member, through the same project policies as
-- the repositories; nothing crosses workspaces.

create table if not exists engelbart_bart_threads (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references hc_projects(id) on delete cascade,
  user_id     uuid not null default auth.uid(),
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists engelbart_bart_threads_project on engelbart_bart_threads (project_id, updated_at desc);

create table if not exists engelbart_bart_messages (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references engelbart_bart_threads(id) on delete cascade,
  seq         integer not null,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  context     jsonb,          -- {runId, repoId, selection: {stageId, callId}} when asked
  refs        jsonb,          -- the evidence an answer cites, as references by id
  model       text,
  created_at  timestamptz not null default now(),
  unique (thread_id, seq)
);

alter table engelbart_bart_threads  enable row level security;
alter table engelbart_bart_messages enable row level security;

-- Threads: the project's owner and its members read; whoever can write to
-- the project starts one and touches it.
drop policy if exists engelbart_bart_threads_read on engelbart_bart_threads;
create policy engelbart_bart_threads_read on engelbart_bart_threads
  for select using (
    project_id in (select p.id from hc_projects p where p.user_id = (select auth.uid()))
    or project_id in (select hc_member_projects())
  );

drop policy if exists engelbart_bart_threads_insert on engelbart_bart_threads;
create policy engelbart_bart_threads_insert on engelbart_bart_threads
  for insert with check (
    user_id = (select auth.uid())
    and (project_id in (select p.id from hc_projects p where p.user_id = (select auth.uid())) or hc_can_write(project_id))
  );

drop policy if exists engelbart_bart_threads_update on engelbart_bart_threads;
create policy engelbart_bart_threads_update on engelbart_bart_threads
  for update using (
    project_id in (select p.id from hc_projects p where p.user_id = (select auth.uid()))
    or hc_can_write(project_id)
  );

-- Messages follow their thread.
drop policy if exists engelbart_bart_messages_read on engelbart_bart_messages;
create policy engelbart_bart_messages_read on engelbart_bart_messages
  for select using (thread_id in (select id from engelbart_bart_threads));

drop policy if exists engelbart_bart_messages_insert on engelbart_bart_messages;
create policy engelbart_bart_messages_insert on engelbart_bart_messages
  for insert with check (
    thread_id in (
      select t.id from engelbart_bart_threads t
      where t.project_id in (select p.id from hc_projects p where p.user_id = (select auth.uid()))
         or hc_can_write(t.project_id)
    )
  );
