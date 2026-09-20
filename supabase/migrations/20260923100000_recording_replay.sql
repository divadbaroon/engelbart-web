-- What a recording looked like, so it can be watched back.
--
-- A recording is still what it was: a name and two clock readings over the
-- run's trace, copying nothing. This adds one optional thing beside it —
-- the rrweb stream captured from the preview while it was open — and keeps
-- it out of the trace tables entirely.
--
-- It is a Storage object, not a column, for the reason the trace already
-- gives for keeping model calls off realtime: this can be megabytes, and
-- every row that must travel to a viewer should be small. The papers
-- bucket is the shape to copy — private, the project id as the first
-- folder so the policies can read it off the path, uploaded straight from
-- the signed-in browser with no service key anywhere near it.
--
-- Nothing about it goes near engelbart_trace_events, which is published to
-- realtime and written by an unauthenticated endpoint in the sandbox. What
-- a page looked like is private to the project by construction: it arrives
-- over the workspace's own origin-pinned channel and is written here by
-- the member who recorded it.

-- The bucket. JSON streams, 200 MB each — a recording longer than the
-- bridge's own 32 MB cap cannot be produced, so this is headroom, not a
-- target.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('engelbart-replays', 'engelbart-replays', false, 209715200, array['application/json'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Where the stream is, if there is one. Nullable and it stays nullable: a
-- recording with no replay is still a recording. Every recording made
-- before this, every run whose preview could not be framed, and every
-- sandbox on an image without the recorder all have none, and none of them
-- is a broken row.
alter table engelbart_recordings add column if not exists replay_path text;

-- One object per recording, so a path cannot be claimed twice.
create unique index if not exists engelbart_recordings_replay_path on engelbart_recordings (replay_path) where replay_path is not null;

-- The files. The first folder of the object path is the project id, as in
-- engelbart-papers, and the same three policies apply for the same reason.
-- There is deliberately no update policy: an object is written once, and a
-- recording that is captured again is written to a path of its own.
drop policy if exists engelbart_replays_objects_read on storage.objects;
create policy engelbart_replays_objects_read on storage.objects
  for select to authenticated using (
    bucket_id = 'engelbart-replays'
    and (
      ((storage.foldername(name))[1])::uuid in (select p.id from hc_projects p where p.user_id = (select auth.uid()))
      or ((storage.foldername(name))[1])::uuid in (select hc_member_projects())
    )
  );

drop policy if exists engelbart_replays_objects_insert on storage.objects;
create policy engelbart_replays_objects_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'engelbart-replays'
    and hc_can_write(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists engelbart_replays_objects_delete on storage.objects;
create policy engelbart_replays_objects_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'engelbart-replays'
    and (
      owner_id = (select auth.uid())::text
      or ((storage.foldername(name))[1])::uuid in (select p.id from hc_projects p where p.user_id = (select auth.uid()))
    )
  );

-- The row policies are unchanged and deliberately so. engelbart_recordings
-- already has an update policy for project writers that re-asserts the
-- run/project pairing after the change (20260920120000_recordings.sql), so
-- writing replay_path is already covered by exactly the audience that may
-- stop the recording in the first place.
