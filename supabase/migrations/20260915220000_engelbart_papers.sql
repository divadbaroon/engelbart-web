-- Papers attached to a project: the PDF lives in a private Storage bucket,
-- everything about it lives here. Object paths are <project id>/<paper id>.pdf,
-- so the storage policies can read the project off the path.

-- The bucket. PDFs only, 50 MB each.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('engelbart-papers', 'engelbart-papers', false, 52428800, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table if not exists engelbart_papers (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  project_id    uuid not null references hc_projects(id) on delete cascade,
  title         text not null,
  authors       text not null default '',
  year          int,
  source_url    text not null default '',      -- where it was fetched from, if a link
  storage_path  text not null unique,          -- object path in the bucket
  size_bytes    bigint not null default 0,
  text_status   text not null default 'pending' check (text_status in ('pending', 'done', 'failed')),
  created_at    timestamptz not null default now()
);

create index if not exists engelbart_papers_project on engelbart_papers (project_id, created_at);

alter table engelbart_papers enable row level security;

-- Readable by the project's owner and its members.
drop policy if exists engelbart_papers_read on engelbart_papers;
create policy engelbart_papers_read on engelbart_papers
  for select using (
    project_id in (select p.id from hc_projects p where p.user_id = (select auth.uid()))
    or project_id in (select hc_member_projects())
  );

-- Added by a signed-in user who can write to the project.
drop policy if exists engelbart_papers_insert on engelbart_papers;
create policy engelbart_papers_insert on engelbart_papers
  for insert with check (user_id = (select auth.uid()) and hc_can_write(project_id));

-- Renamed or removed by whoever added it, or by the project's owner.
drop policy if exists engelbart_papers_update on engelbart_papers;
create policy engelbart_papers_update on engelbart_papers
  for update using (
    user_id = (select auth.uid())
    or project_id in (select p.id from hc_projects p where p.user_id = (select auth.uid()))
  );

drop policy if exists engelbart_papers_delete on engelbart_papers;
create policy engelbart_papers_delete on engelbart_papers
  for delete using (
    user_id = (select auth.uid())
    or project_id in (select p.id from hc_projects p where p.user_id = (select auth.uid()))
  );

-- The files. The first folder of the object path is the project id.
drop policy if exists engelbart_papers_objects_read on storage.objects;
create policy engelbart_papers_objects_read on storage.objects
  for select to authenticated using (
    bucket_id = 'engelbart-papers'
    and (
      ((storage.foldername(name))[1])::uuid in (select p.id from hc_projects p where p.user_id = (select auth.uid()))
      or ((storage.foldername(name))[1])::uuid in (select hc_member_projects())
    )
  );

drop policy if exists engelbart_papers_objects_insert on storage.objects;
create policy engelbart_papers_objects_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'engelbart-papers'
    and hc_can_write(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists engelbart_papers_objects_delete on storage.objects;
create policy engelbart_papers_objects_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'engelbart-papers'
    and (
      owner_id = (select auth.uid())::text
      or ((storage.foldername(name))[1])::uuid in (select p.id from hc_projects p where p.user_id = (select auth.uid()))
    )
  );
