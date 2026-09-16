-- Edits the pipeline's repair agent made to the sandbox copy of a
-- repository to get it running, as a diff with the agent's reasons:
-- {summary, reason, files, diff, truncated, attempt, runId, at, worked}.
-- The repository on GitHub is never changed; this is what to show the
-- person so they know what they are looking at.
alter table engelbart_repos add column if not exists patch jsonb;
