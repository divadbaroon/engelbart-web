-- Environment values a repository needs to run that are not in its code:
-- API keys, service URLs and the like. One row per repository and name.
-- Values are plain text behind row-level security; anyone who can open a
-- shell in the repository's sandbox can read its environment anyway.
create table if not exists engelbart_repo_env (
  repo_id uuid not null references engelbart_repos(id) on delete cascade,
  name text not null check (name ~ '^[A-Za-z_][A-Za-z0-9_]*$' and length(name) <= 200),
  value text not null check (length(value) <= 16384),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (repo_id, name)
);

alter table engelbart_repo_env enable row level security;

-- Visible to whoever can see the repository.
drop policy if exists engelbart_repo_env_read on engelbart_repo_env;
create policy engelbart_repo_env_read on engelbart_repo_env
  for select using (
    repo_id in (
      select r.id from engelbart_repos r
      where r.project_id in (select p.id from hc_projects p where p.user_id = (select auth.uid()))
         or r.project_id in (select hc_member_projects())
    )
  );

-- Set and removed by whoever can write to the project.
drop policy if exists engelbart_repo_env_write on engelbart_repo_env;
create policy engelbart_repo_env_write on engelbart_repo_env
  for all using (
    repo_id in (
      select r.id from engelbart_repos r
      where r.project_id in (select p.id from hc_projects p where p.user_id = (select auth.uid()))
         or hc_can_write(r.project_id)
    )
  ) with check (
    repo_id in (
      select r.id from engelbart_repos r
      where r.project_id in (select p.id from hc_projects p where p.user_id = (select auth.uid()))
         or hc_can_write(r.project_id)
    )
  );

-- What the pipeline's environment scan found on the latest run: which
-- names the application reads, which were satisfied, which were missing.
-- Names and statuses only, never values.
alter table engelbart_repos add column if not exists env_report jsonb;
