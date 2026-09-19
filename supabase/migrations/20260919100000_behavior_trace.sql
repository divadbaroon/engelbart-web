-- A run's behavior trace: what the person did in the running application,
-- what the application asked over the network, and what it asked a model.
-- The timeline is one table of small typed events. Model calls get their
-- own rows, since each carries a prompt, an answer and the settings
-- between them, and can be large. Both are written by the worker with the
-- service key, after redaction; the browser only reads them, through the
-- run it can already see. Whether a run is traced, and whether content is
-- kept or only its shape, is the run's own setting.

alter table engelbart_sandbox_runs add column if not exists trace text not null default 'off';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'engelbart_sandbox_runs_trace_check') then
    alter table engelbart_sandbox_runs add constraint engelbart_sandbox_runs_trace_check check (trace in ('off', 'metadata', 'full'));
  end if;
end $$;

create table if not exists engelbart_trace_events (
  id              bigint generated always as identity primary key,
  run_id          uuid not null references engelbart_sandbox_runs(id) on delete cascade,
  seq             integer not null,
  at              timestamptz not null,                       -- the sandbox's clock
  received_at     timestamptz not null default now(),
  source          text not null check (source in ('browser', 'preview-gateway', 'model-gateway', 'wrapper', 'collector')),
  kind            text not null,                              -- ui.click, network.request, model.request, ...
  interaction_id  text,
  request_id      text,
  call_id         text,
  correlation     text check (correlation in ('explicit', 'temporal')),
  data            jsonb,                                      -- small: never prompt or answer text
  unique (run_id, seq)
);

create table if not exists engelbart_model_calls (
  id                uuid primary key default gen_random_uuid(),
  run_id            uuid not null references engelbart_sandbox_runs(id) on delete cascade,
  call_id           text not null,
  capture           text not null check (capture in ('metadata', 'full')),
  provider          text,
  api               text,
  method            text not null,
  upstream          jsonb not null,                           -- {scheme, host, path, has_query}
  model             text,
  streamed          boolean,
  phase             text not null default 'request' check (phase in ('request', 'response', 'error')),
  status            integer,
  started_at        timestamptz not null,
  ended_at          timestamptz,
  latency_ms        real,
  ttfb_ms           real,
  ttft_ms           real,
  request           jsonb,                                    -- the call as the model saw it
  request_parse     jsonb,
  request_headers   jsonb,                                    -- allowlisted names only
  response          jsonb,                                    -- the answer, rebuilt from the stream
  response_headers  jsonb,
  error             jsonb,
  usage             jsonb,
  usage_available   boolean not null default false,
  raw_request       text,
  raw_response      text,
  sizes             jsonb,
  aborted           boolean not null default false,
  interaction_id    text,
  request_id        text,
  correlation       text check (correlation in ('explicit', 'temporal')),
  unique (run_id, call_id)
);

create index if not exists engelbart_trace_events_run_idx on engelbart_trace_events (run_id, seq);
create index if not exists engelbart_model_calls_run_idx on engelbart_model_calls (run_id, started_at);

alter table engelbart_trace_events enable row level security;
alter table engelbart_model_calls  enable row level security;

-- Readable through the run; only the worker writes.
drop policy if exists engelbart_trace_events_read on engelbart_trace_events;
create policy engelbart_trace_events_read on engelbart_trace_events
  for select using (run_id in (select id from engelbart_sandbox_runs));

drop policy if exists engelbart_model_calls_read on engelbart_model_calls;
create policy engelbart_model_calls_read on engelbart_model_calls
  for select using (run_id in (select id from engelbart_sandbox_runs));

-- Realtime: the browser follows the timeline live. Model call rows are
-- fetched on demand: they can be megabytes, and every one of them is
-- announced by a small timeline event anyway.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'engelbart_trace_events') then
    alter publication supabase_realtime add table engelbart_trace_events;
  end if;
end $$;
