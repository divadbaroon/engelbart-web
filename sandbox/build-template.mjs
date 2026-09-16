// Builds the E2B template the runner sandboxes start from: the base image
// plus everything hc's project pipeline needs. Run from the repo root:
//
//   node sandbox/build-template.mjs
//
// HC_SOURCE points at a checkout of hc (pyproject.toml, src/). E2B_TEMPLATE
// names the template; the app reads the same variable when creating sandboxes.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Template, defaultBuildLogger } from "e2b";

// Template copy sources resolve relative to this file's folder.
const here = path.dirname(fileURLToPath(import.meta.url));

const hc = process.env.HC_SOURCE ?? "/private/tmp/engelbart-new-project/hc";
const name = process.env.E2B_TEMPLATE ?? "engelbart-runner";

// Template sources must sit beside this script, so hc is staged into an
// ignored folder first. Only what pip needs is copied.
const staged = ".hc";
fs.rmSync(path.join(here, staged), { recursive: true, force: true });
for (const entry of ["pyproject.toml", "README.md", "src"]) {
  fs.cpSync(path.join(hc, entry), path.join(here, staged, entry), {
    recursive: true,
    filter: (src) => !/__pycache__|\.pyc$|\.DS_Store/.test(src),
  });
}

const template = Template()
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
  .runCmd("python3 -m pip install --no-cache-dir uv", { user: "root" })
  // hc itself, installed from source.
  .copy(staged, "/opt/hc", { user: "root" })
  .runCmd("python3 -m pip install --no-cache-dir /opt/hc", { user: "root" })
  .copy("hc_run.py", "/opt/engelbart/hc_run.py", { user: "root" })
  .copy("proxy.mjs", "/opt/engelbart/proxy.mjs", { user: "root" })
  // Fail the build, not the first run, if anything is missing.
  .runCmd("node --version && claude --version && railpack --version && bun --version && pnpm --version && uv --version && python3 -c 'import human_compact.trajectory.project_run'");

console.log(`Building template ${name} from ${hc}`);
try {
  const info = await Template.build(template, name, { onBuildLogs: defaultBuildLogger() });
  console.log("Built", info);
} catch (err) {
  console.error(`${err?.name ?? "Error"}: ${err?.message ?? err}`);
  if (err?.stackTrace) console.error(err.stackTrace);
  process.exit(1);
}
