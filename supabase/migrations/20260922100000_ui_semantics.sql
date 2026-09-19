-- A reading of an interface: what the parts of a running application are
-- for, worked out once and then kept.
--
-- The behavior trace records what a document held — a tag, a role, some
-- visible text, a selector. It cannot say that an embedded document is
-- the thing the person is building, that a textarea is where a student
-- answers, or that a column of divs is a conversation. A row here is one
-- model's answer to that question about one document, and it is cached so
-- the question is asked once per interface rather than once per click.
--
-- What it is NOT: it is not evidence, and it never replaces any. Every
-- named thing in `map` carries the ElementTargets it was derived from,
-- verbatim, as the page described them; a label is shown beside a raw
-- description and, when the reading is unsure, behind it. Nothing here is
-- joined to a trace event, and nothing here changes what was recorded.
--
-- Keyed on the repository and a signature of the interface, not on the
-- run and not on the commit. A commit sha is read before the repair patch
-- and the instrumentation are applied, so two runs on one sha can serve
-- different documents; it is kept as context and never as identity. The
-- signature is computed from the reduced list of candidates the page
-- offered (lib/semantics/signature.ts), which is what makes a reload, a
-- rerender, a new message in a conversation or a fresh model output all
-- the same interface.
--
-- `candidates` is the survey the reading was made from. It is kept so the
-- reading can be judged, recomputed and argued with later; it is the only
-- large column here and it is bounded.

create table if not exists engelbart_ui_semantics (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references hc_projects(id) on delete cascade,
  repo_id       uuid not null references engelbart_repos(id) on delete cascade,
  -- Context, not ownership: a reading outlives the run it was taken in,
  -- which is the whole point of caching it.
  run_id        uuid references engelbart_sandbox_runs(id) on delete set null,
  user_id       uuid not null default auth.uid(),
  -- What makes two documents the same interface. Opaque here; its meaning
  -- lives in lib/semantics/signature.ts, and changing that policy changes
  -- which rows are hits, never which rows are valid.
  signature     text not null check (length(signature) between 8 and 128),
  route         text check (route is null or length(route) <= 2048),
  commit_sha    text check (commit_sha is null or length(commit_sha) <= 64),
  -- Which document of the run this reads: a FrameRef, identified by the
  -- path of <iframe>s it sits inside. Never by a frame id, which is minted
  -- per served document and is gone on the next reload.
  frame         jsonb not null check (jsonb_typeof(frame) = 'object' and length(frame::text) <= 4096),
  map           jsonb not null check (jsonb_typeof(map) = 'object' and length(map::text) <= 65536),
  -- The reduced page the reading was made from. Nullable so a row stays
  -- useful if it is ever dropped to save room.
  candidates    jsonb check (candidates is null or (jsonb_typeof(candidates) = 'object' and length(candidates::text) <= 262144)),
  model         text check (model is null or length(model) <= 128),
  created_at    timestamptz not null default now()
);

-- One reading per interface per repository: asking twice is the cost this
-- table exists to avoid.
create unique index if not exists engelbart_ui_semantics_key on engelbart_ui_semantics (repo_id, signature);
create index if not exists engelbart_ui_semantics_repo on engelbart_ui_semantics (repo_id, created_at desc);
create index if not exists engelbart_ui_semantics_run on engelbart_ui_semantics (run_id) where run_id is not null;

alter table engelbart_ui_semantics enable row level security;

-- Read by the project's owner and its members: a reading is shared the
-- way the trace and the notes it improves are shared.
drop policy if exists engelbart_ui_semantics_read on engelbart_ui_semantics;
create policy engelbart_ui_semantics_read on engelbart_ui_semantics
  for select using (
    project_id in (select p.id from hc_projects p where p.user_id = (select auth.uid()))
    or project_id in (select hc_member_projects())
  );

-- Writing one: the project must be one this member may write, the
-- repository must be that project's own, and the run, when named, must
-- belong to both. Without those clauses a member could file a reading
-- against another project's repository and have it shown to that project.
drop policy if exists engelbart_ui_semantics_insert on engelbart_ui_semantics;
create policy engelbart_ui_semantics_insert on engelbart_ui_semantics
  for insert with check (
    user_id = (select auth.uid())
    and (project_id in (select p.id from hc_projects p where p.user_id = (select auth.uid())) or hc_can_write(project_id))
    and exists (
      select 1 from engelbart_repos r
      where r.id = engelbart_ui_semantics.repo_id and r.project_id = engelbart_ui_semantics.project_id
    )
    and (
      run_id is null
      or exists (
        select 1 from engelbart_sandbox_runs s
        where s.id = engelbart_ui_semantics.run_id
          and s.project_id = engelbart_ui_semantics.project_id
          and s.repo_id = engelbart_ui_semantics.repo_id
      )
    )
  );

-- Re-reading an interface replaces the reading, not the row's place in
-- the project: a person asking for a fresh one, or a better model later,
-- writes over what is there. This is derived data and anyone who may
-- write the project may redo it — unlike a note, where who made the
-- judgement is part of what it says.
drop policy if exists engelbart_ui_semantics_update on engelbart_ui_semantics;
create policy engelbart_ui_semantics_update on engelbart_ui_semantics
  for update using (
    project_id in (select p.id from hc_projects p where p.user_id = (select auth.uid())) or hc_can_write(project_id)
  ) with check (
    (project_id in (select p.id from hc_projects p where p.user_id = (select auth.uid())) or hc_can_write(project_id))
    and exists (
      select 1 from engelbart_repos r
      where r.id = engelbart_ui_semantics.repo_id and r.project_id = engelbart_ui_semantics.project_id
    )
  );

drop policy if exists engelbart_ui_semantics_delete on engelbart_ui_semantics;
create policy engelbart_ui_semantics_delete on engelbart_ui_semantics
  for delete using (
    project_id in (select p.id from hc_projects p where p.user_id = (select auth.uid())) or hc_can_write(project_id)
  );
