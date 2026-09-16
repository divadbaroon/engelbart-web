// What a repository's files say it will need from the sandbox, decided
// before the sandbox exists, since its size is fixed at creation.

const COMPOSE = /(^|\/)(docker-)?compose(\.[\w-]+)?\.ya?ml$/;
const SUPABASE = /(^|\/)supabase\/config\.toml$/;

// A compose file means the app brings up its own services; a Supabase
// config means a local Supabase stack can stand in for the real project.
// Either needs Docker and the memory to run containers. Paths under
// dependency folders do not count.
export function needsDocker(paths: string[]): boolean {
  return paths.some((p) => !/(^|\/)(node_modules|vendor|\.git)\//.test(p) && (COMPOSE.test(p) || SUPABASE.test(p)));
}
