-- Interface annotations: a researcher's note fixed to one element of a
-- repository's running interface. The note is attached to the artifact —
-- the repository — not to the run that happened to be up when it was
-- written, so it outlives that run and is found again the next time the
-- application is brought up. The run, the recording, the commit and the
-- moment are recorded as context: they say where the note came from, and
-- nothing here claims that any of them caused what the note describes.
--
-- The element is `anchor`: the same description of a DOM element the
-- behavior trace stores (ElementTarget, from the bridge's describe()),
-- wrapped with the ancestors and the frame that let it be found again.
-- There is one such description in Engelbart and this is it. The shape is
-- validated by the server action that writes it; here it is only an
-- object of a bounded size.

create table if not exists engelbart_annotations (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references hc_projects(id) on delete cascade,
  repo_id       uuid not null references engelbart_repos(id) on delete cascade,
  -- Context, not ownership: deleting a run or a recording leaves the note
  -- on the interface it was written about.
  run_id        uuid references engelbart_sandbox_runs(id) on delete set null,
  recording_id  uuid references engelbart_recordings(id) on delete set null,
  user_id       uuid not null default auth.uid(),
  body          text not null check (length(btrim(body)) between 1 and 4000),
  anchor        jsonb not null check (jsonb_typeof(anchor) = 'object' and length(anchor::text) <= 16384),
  route         text check (route is null or length(route) <= 2048),
  -- The repository's commit the run was on, when it recorded one. The only
  -- version signal that exists: read when judging whether the element the
  -- note was written about is still the same element.
  commit_sha    text check (commit_sha is null or length(commit_sha) <= 64),
  -- Which moment was selected as the note was written. Derived at render
  -- time from the interaction, call or event id, so it is a pointer to
  -- follow, never a join key: a stage that cannot be found is simply not
  -- offered.
  stage_id      text check (stage_id is null or length(stage_id) <= 200),
  call_id       text check (call_id is null or length(call_id) <= 200),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists engelbart_annotations_repo on engelbart_annotations (repo_id, created_at desc);
create index if not exists engelbart_annotations_run on engelbart_annotations (run_id) where run_id is not null;
create index if not exists engelbart_annotations_recording on engelbart_annotations (recording_id) where recording_id is not null;

alter table engelbart_annotations enable row level security;

-- Read by the project's owner and its members: a note is a research
-- record the whole project works from.
drop policy if exists engelbart_annotations_read on engelbart_annotations;
create policy engelbart_annotations_read on engelbart_annotations
  for select using (
    project_id in (select p.id from hc_projects p where p.user_id = (select auth.uid()))
    or project_id in (select hc_member_projects())
  );

-- Writing one: the project must be one this member may write, the
-- repository must be that project's own, and the run and the recording,
-- when they are named, must belong to the same repository and run. Without
-- those clauses a member could file a note against someone else's
-- repository while naming a project of their own, and so both read it back
-- and have it answered about by Bart under their own project's authority.
drop policy if exists engelbart_annotations_insert on engelbart_annotations;
create policy engelbart_annotations_insert on engelbart_annotations
  for insert with check (
    user_id = (select auth.uid())
    and (project_id in (select p.id from hc_projects p where p.user_id = (select auth.uid())) or hc_can_write(project_id))
    and exists (
      select 1 from engelbart_repos r
      where r.id = engelbart_annotations.repo_id and r.project_id = engelbart_annotations.project_id
    )
    and (
      run_id is null
      or exists (
        select 1 from engelbart_sandbox_runs s
        where s.id = engelbart_annotations.run_id
          and s.project_id = engelbart_annotations.project_id
          and s.repo_id = engelbart_annotations.repo_id
      )
    )
    and (
      recording_id is null
      or exists (
        select 1 from engelbart_recordings rec
        where rec.id = engelbart_annotations.recording_id and rec.run_id = engelbart_annotations.run_id
      )
    )
  );

-- Editing and deleting are the author's alone. Everyone in the project
-- reads the notes and writes their own; who made a judgement about an
-- interface is part of what the note says, and it would not survive being
-- silently editable by someone else. The author must still be able to
-- write to the project, so a member who has been removed stops editing.
-- The checks are repeated after the change so a note cannot be moved to
-- another project, repository or run.
drop policy if exists engelbart_annotations_update on engelbart_annotations;
create policy engelbart_annotations_update on engelbart_annotations
  for update using (
    user_id = (select auth.uid())
    and (project_id in (select p.id from hc_projects p where p.user_id = (select auth.uid())) or hc_can_write(project_id))
  ) with check (
    user_id = (select auth.uid())
    and (project_id in (select p.id from hc_projects p where p.user_id = (select auth.uid())) or hc_can_write(project_id))
    and exists (
      select 1 from engelbart_repos r
      where r.id = engelbart_annotations.repo_id and r.project_id = engelbart_annotations.project_id
    )
    and (
      run_id is null
      or exists (
        select 1 from engelbart_sandbox_runs s
        where s.id = engelbart_annotations.run_id
          and s.project_id = engelbart_annotations.project_id
          and s.repo_id = engelbart_annotations.repo_id
      )
    )
  );

drop policy if exists engelbart_annotations_delete on engelbart_annotations;
create policy engelbart_annotations_delete on engelbart_annotations
  for delete using (
    user_id = (select auth.uid())
    and (project_id in (select p.id from hc_projects p where p.user_id = (select auth.uid())) or hc_can_write(project_id))
  );
