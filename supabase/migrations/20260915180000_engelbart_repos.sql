-- GitHub repositories attached to a project. Written from the live schema;
-- safe to rerun against a database that already has it.

create table if not exists engelbart_repos (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  project_id     uuid not null references hc_projects(id) on delete cascade,
  url            text not null,
  owner          text not null,
  name           text not null,
  default_branch text not null default '',
  description    text not null default '',
  language       text not null default '',
  created_at     timestamptz not null default now(),
  unique (project_id, owner, name)
);

create index if not exists engelbart_repos_project on engelbart_repos (project_id);

alter table engelbart_repos enable row level security;

-- Readable by the project's owner and its members.
drop policy if exists engelbart_repos_read on engelbart_repos;
create policy engelbart_repos_read on engelbart_repos
  for select using (
    project_id in (select p.id from hc_projects p where p.user_id = (select auth.uid()))
    or project_id in (select hc_member_projects())
  );

-- Added by a signed-in user who can write to the project.
drop policy if exists engelbart_repos_insert on engelbart_repos;
create policy engelbart_repos_insert on engelbart_repos
  for insert with check (user_id = (select auth.uid()) and hc_can_write(project_id));

-- Removable by whoever added it, or by the project's owner.
drop policy if exists engelbart_repos_delete on engelbart_repos;
create policy engelbart_repos_delete on engelbart_repos
  for delete using (
    user_id = (select auth.uid())
    or project_id in (select p.id from hc_projects p where p.user_id = (select auth.uid()))
  );
