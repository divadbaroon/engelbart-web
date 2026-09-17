// Builds the E2B templates the runner sandboxes start from: the base image
// plus everything hc's project pipeline needs. Run from the repo root:
//
//   node sandbox/build-template.mjs            # both templates
//   node sandbox/build-template.mjs base       # just the small one
//   node sandbox/build-template.mjs docker     # just the Docker one
//
// Two templates come out of this, both at the largest size E2B allows. The
// base one is what most repositories get. The Docker one adds Docker,
// Compose and the Supabase CLI for repositories that bring up their own
// services; the worker picks it when the repository has a compose file or
// a Supabase config.
//
// HC_SOURCE points at a checkout of hc (pyproject.toml, src/). E2B_TEMPLATE
// names the base template; the app reads the same variable when creating
// sandboxes, and the Docker template is that name plus "-docker".
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Template, defaultBuildLogger } from "e2b";

// Template copy sources resolve relative to this file's folder.
const here = path.dirname(fileURLToPath(import.meta.url));

const hc = process.env.HC_SOURCE ?? "/private/tmp/engelbart-new-project/hc";
const name = process.env.E2B_TEMPLATE ?? "engelbart-runner";
const which = process.argv[2] ?? "both";

// Template sources must sit beside this script, so hc is staged into an
// ignored folder first. Only what pip needs is copied.
const staged = ".hc";
fs.rmSync(path.join(here, staged), { recursive: true, force: true });
for (const entry of ["pyproject.toml", "README.md", "src"]) {
  const source = path.join(hc, entry);
  if (!fs.existsSync(source)) { console.error(`hc source is incomplete: ${source} is missing`); process.exit(1); }
  fs.cpSync(source, path.join(here, staged, entry), {
    recursive: true,
    filter: (src) => !/__pycache__|\.pyc$|\.DS_Store/.test(src),
  });
}

// The pipeline looks for the Supabase CLI under its own home before
// downloading it; a symlink there points at the copy baked in here.
const SUPABASE_CLI = "/home/user/.human-compact/project-environments/supabase-tools";

function runner({ docker }) {
  let t = Template()
    .fromBaseImage()
    // The base image ships Node 20.9 as a tarball under /usr/local, too old for
    // current Vite and for Claude Code. Remove it and install Node 22 (LTS)
    // from NodeSource before anything installs global packages against it.
    .runCmd("rm -rf /usr/local/bin/node /usr/local/bin/nodejs /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/lib/node_modules /usr/local/include/node", { user: "root" })
    .runCmd("curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs && apt-get clean && rm -rf /var/lib/apt/lists/*", { user: "root" })
    // Tooling the pipeline shells out to: Claude Code for its agents, Railpack
    // for plans, package managers its validator allows, uv for Python runtimes.
    .runCmd("npm install -g @anthropic-ai/claude-code pnpm bun", { user: "root" })
    .runCmd("curl -sSL https://railpack.com/install.sh | sh -s -- --bin-dir /usr/local/bin", { user: "root" })
    .runCmd("python3 -m pip install --no-cache-dir uv", { user: "root" });
  if (docker) {
    t = t
      // Docker's own packages: engine, CLI, Compose and Buildx plugins. The
      // daemon is started per run by the runtime, not here.
      .runCmd("curl -fsSL https://get.docker.com | sh && usermod -aG docker user && apt-get clean && rm -rf /var/lib/apt/lists/*", { user: "root" })
      // The Supabase CLI, for repositories with a supabase/ folder.
      .runCmd("curl -fsSL https://api.github.com/repos/supabase/cli/releases/latest | grep -o '\"tag_name\": *\"v[0-9.]*\"' | grep -o 'v[0-9.]*' > /tmp/supabase-version && v=$(cat /tmp/supabase-version) && curl -fsSL \"https://github.com/supabase/cli/releases/download/$v/supabase_${v#v}_linux_amd64.tar.gz\" | tar xz -C /usr/local/bin supabase && supabase --version", { user: "root" })
      .runCmd(`mkdir -p ${SUPABASE_CLI} && chmod 700 /home/user/.human-compact /home/user/.human-compact/project-environments && ln -sf /usr/local/bin/supabase ${SUPABASE_CLI}/supabase`);
  }
  return t
    // hc itself, installed from source.
    .copy(staged, "/opt/hc", { user: "root" })
    .runCmd("python3 -m pip install --no-cache-dir /opt/hc", { user: "root" })
    .copy("hc_run.py", "/opt/engelbart/hc_run.py", { user: "root" })
    .copy("proxy.mjs", "/opt/engelbart/proxy.mjs", { user: "root" })
    // Fail the build, not the first run, if anything is missing.
    .runCmd(`node --version && claude --version && railpack --version && bun --version && pnpm --version && uv --version && python3 -c 'import human_compact.trajectory.project_run'${docker ? " && docker --version && docker compose version && supabase --version" : ""}`);
}

// Both templates get the largest sandbox E2B allows. A front-end production
// build needs a few GiB on its own, and a run killed for memory wastes far
// more in model calls than the sandbox costs. Disk is asked for the same
// way: a Python app with PyTorch plus a React build ran a 10 GiB root
// full; 25 GiB is the most E2B grants, and growth is best effort.
const SIZE = { cpuCount: 8, memoryMB: 8192, minFreeDiskMb: 25 * 1024 };
const builds = [
  { key: "base", name, template: runner({ docker: false }), options: SIZE },
  { key: "docker", name: `${name}-docker`, template: runner({ docker: true }), options: SIZE },
].filter((b) => which === "both" || which === b.key);

for (const b of builds) {
  console.log(`Building template ${b.name} from ${hc}`, b.options);
  try {
    const info = await Template.build(b.template, b.name, { ...b.options, onBuildLogs: defaultBuildLogger() });
    console.log("Built", info);
  } catch (err) {
    console.error(`${err?.name ?? "Error"}: ${err?.message ?? err}`);
    if (err?.stackTrace) console.error(err.stackTrace);
    process.exit(1);
  }
}
