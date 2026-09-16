-- Every service a run brought up and where the browser can reach it, the
-- entry service first: [{id, port, previewUrl, isEntry, embeddable}].
-- port and preview_url keep describing the entry service, so anything that
-- only knows about one preview keeps working.
alter table engelbart_sandbox_runs add column if not exists services jsonb;
