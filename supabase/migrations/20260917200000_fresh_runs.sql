-- A run asked to start over ignores any saved trail, own or shared, so a
-- plan that came up wrong (an app that answered HTTP while crashed inside)
-- can be replaced by a fresh analysis. A fresh run that succeeds saves its
-- plan as usual, overwriting the old one.
alter table engelbart_sandbox_runs add column if not exists fresh boolean not null default false;
