-- How to read one artifact's behaviour: the vocabulary an activity
-- timeline is written in, worked out once per artifact and then kept.
--
-- Until now there was one taxonomy in the product, ROPE's, and every
-- artifact was described in it. A canvas application whose people join
-- with a name and create cards was told it had a tutor, a message box
-- and an answer, because those are ROPE's words and nothing else was
-- offered. A row here is one model's answer to "what are the things a
-- person does in THIS artifact, and what should they be called" — an
-- ArtifactProfile, the pure-data form of a taxonomy (lib/activity/
-- profile/schema.ts) — cached so the question is asked once per
-- artifact rather than once per page load.
--
-- What it is NOT: it is not evidence and it never replaces any. A
-- profile only supplies names and the tests that choose between them;
-- the acts, appearances and timings it reads are the trace's, unchanged.
-- A profile that names nothing yields UNCLEAR, which is the honest
-- answer and the one the pipeline falls back to. It must never fall
-- back to another artifact's words.
--
-- Keyed on the repository and a signature of the evidence, not on the
-- commit and not on the run — the same ruling the interface readings
-- are under (20260922100000_ui_semantics.sql). A commit sha is read
-- before the repair patch and the instrumentation are applied, so two
-- runs on one sha can present different interfaces; it is kept as
-- context and never as identity. The signature is computed from the
-- evidence a profile was generated from (lib/activity/profile/
-- signature.ts), so a repository whose interface has genuinely moved
-- gets a new row rather than a wrong one.
--
-- A row exists before the profile does. `status` is the lifecycle:
--   pending  generation has been started by someone; do not start again
--   ready    validated and compiled; this is what the timeline uses
--   failed   generation or validation refused it; `error` says why, and
--            the reading falls back to the artifact-blind vocabulary
--   stale    it was ready, and a later run found its anchors no longer
--            match what the page offers; still usable, worth redoing
-- The unique key is what makes `pending` a claim: two page loads race to
-- insert, one wins, the other waits rather than paying for a second
-- generation.

create table if not exists engelbart_artifact_profiles (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references hc_projects(id) on delete cascade,
  repo_id            uuid not null references engelbart_repos(id) on delete cascade,
  -- Context, not ownership: a profile outlives the run it was generated
  -- from, which is the whole point of keeping it.
  run_id             uuid references engelbart_sandbox_runs(id) on delete set null,
  user_id            uuid not null default auth.uid(),

  -- What makes two states of a repository the same artifact, for the
  -- purpose of naming what people do in it. Opaque here; its meaning
  -- lives in lib/activity/profile/signature.ts, and changing that policy
  -- changes which rows are hits, never which rows are valid.
  signature          text not null check (length(signature) between 8 and 128),
  commit_sha         text check (commit_sha is null or length(commit_sha) <= 64),

  status             text not null default 'pending'
                       check (status in ('pending', 'ready', 'failed', 'stale')),

  -- The profile itself, exactly as it was generated and validated —
  -- never edited in place, because a stored profile should stay the
  -- thing that was judged. Null until there is one.
  profile            jsonb check (profile is null or (jsonb_typeof(profile) = 'object' and length(profile::text) <= 524288)),

  -- The language the profile is written in (ArtifactProfile.version),
  -- kept out here so a reader can refuse an unreadable row without
  -- parsing it.
  schema_version     integer not null default 1 check (schema_version between 1 and 1000),
  -- What the instrument could see when the evidence was gathered. The
  -- collector gains fields over time — appId, per-region bursts, real
  -- input edits — and a profile written against a field that a later
  -- trace does not carry, or an earlier one could not offer, is not
  -- comparable. Bumped by lib/activity/profile/capability.ts.
  capability_version integer not null default 1 check (capability_version between 1 and 1000),

  -- What validateProfile() said, kept whether it passed or not: errors
  -- are why a row is `failed`, warnings are worth showing beside a
  -- profile that is working.
  issues             jsonb check (issues is null or (jsonb_typeof(issues) = 'array' and length(issues::text) <= 131072)),
  -- What the last fit report found: anchors that matched nothing, rules
  -- that never fired, text no channel claimed. This is the staleness
  -- signal, and it is computed without a model.
  fit                jsonb check (fit is null or (jsonb_typeof(fit) = 'object' and length(fit::text) <= 131072)),
  -- Why a row is `failed` or `stale`, in words, for the person reading
  -- a timeline that is plainer than they expected.
  error              text check (error is null or length(error) <= 4096),

  -- Who made it and from what. `evidence` is the manifest of the pack —
  -- which files, which run, how many events, how many bytes — not the
  -- pack itself, which is large and reproducible.
  model              text check (model is null or length(model) <= 128),
  generated_by       text check (generated_by is null or length(generated_by) <= 64),
  evidence           jsonb check (evidence is null or (jsonb_typeof(evidence) = 'object' and length(evidence::text) <= 262144)),
  evidence_hash      text check (evidence_hash is null or length(evidence_hash) <= 128),

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- When the profile itself was produced, as distinct from when the row
  -- was claimed.
  generated_at       timestamptz,

  -- A row that says it is ready must have something to be ready with.
  constraint engelbart_artifact_profiles_ready_has_profile
    check (status <> 'ready' or profile is not null),
  constraint engelbart_artifact_profiles_stale_has_profile
    check (status <> 'stale' or profile is not null)
);

-- One profile per artifact per repository. This is also the lock: the
-- first insert claims the generation, and a second one conflicts rather
-- than paying for the same answer twice.
create unique index if not exists engelbart_artifact_profiles_key
  on engelbart_artifact_profiles (repo_id, signature);
create index if not exists engelbart_artifact_profiles_repo
  on engelbart_artifact_profiles (repo_id, created_at desc);
create index if not exists engelbart_artifact_profiles_run
  on engelbart_artifact_profiles (run_id) where run_id is not null;
-- Finding the claims that never finished, so they can be retried rather
-- than blocking an artifact forever.
create index if not exists engelbart_artifact_profiles_pending
  on engelbart_artifact_profiles (updated_at) where status = 'pending';

alter table engelbart_artifact_profiles enable row level security;

-- Read by the project's owner and its members: a profile is shared the
-- way the trace it describes is shared.
drop policy if exists engelbart_artifact_profiles_read on engelbart_artifact_profiles;
create policy engelbart_artifact_profiles_read on engelbart_artifact_profiles
  for select using (
    project_id in (select p.id from hc_projects p where p.user_id = (select auth.uid()))
    or project_id in (select hc_member_projects())
  );

-- Writing one: the project must be one this member may write, the
-- repository must be that project's own, and the run, when named, must
-- belong to both. Without those clauses a member could file a profile
-- against another project's repository and have it describe that
-- project's runs.
drop policy if exists engelbart_artifact_profiles_insert on engelbart_artifact_profiles;
create policy engelbart_artifact_profiles_insert on engelbart_artifact_profiles
  for insert with check (
    user_id = (select auth.uid())
    and (project_id in (select p.id from hc_projects p where p.user_id = (select auth.uid())) or hc_can_write(project_id))
    and exists (
      select 1 from engelbart_repos r
      where r.id = engelbart_artifact_profiles.repo_id and r.project_id = engelbart_artifact_profiles.project_id
    )
    and (
      run_id is null
      or exists (
        select 1 from engelbart_sandbox_runs s
        where s.id = engelbart_artifact_profiles.run_id
          and s.project_id = engelbart_artifact_profiles.project_id
          and s.repo_id = engelbart_artifact_profiles.repo_id
      )
    )
  );

-- Regenerating replaces the profile, not the row's place in the project:
-- a person asking for a fresh reading, a retry after a failure, or a
-- better model later writes over what is there. This is derived data and
-- anyone who may write the project may redo it.
drop policy if exists engelbart_artifact_profiles_update on engelbart_artifact_profiles;
create policy engelbart_artifact_profiles_update on engelbart_artifact_profiles
  for update using (
    project_id in (select p.id from hc_projects p where p.user_id = (select auth.uid())) or hc_can_write(project_id)
  ) with check (
    (project_id in (select p.id from hc_projects p where p.user_id = (select auth.uid())) or hc_can_write(project_id))
    and exists (
      select 1 from engelbart_repos r
      where r.id = engelbart_artifact_profiles.repo_id and r.project_id = engelbart_artifact_profiles.project_id
    )
  );

drop policy if exists engelbart_artifact_profiles_delete on engelbart_artifact_profiles;
create policy engelbart_artifact_profiles_delete on engelbart_artifact_profiles
  for delete using (
    project_id in (select p.id from hc_projects p where p.user_id = (select auth.uid())) or hc_can_write(project_id)
  );
