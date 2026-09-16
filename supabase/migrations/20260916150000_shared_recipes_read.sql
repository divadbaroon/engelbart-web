-- Signed-in people may read the shared recipes, so the workspace can say
-- whether a repository is already known before it is prepared. Rows only
-- exist for public repositories, and hold the pipeline's plan and the
-- repair agent's edits to public code: nothing private. Writing stays
-- with the worker.
drop policy if exists engelbart_launch_recipes_read on engelbart_launch_recipes;
create policy engelbart_launch_recipes_read on engelbart_launch_recipes
  for select to authenticated using (true);
