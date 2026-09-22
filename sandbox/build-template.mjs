// Builds the E2B templates the runner sandboxes start from: the base image
// plus everything hc's project pipeline needs. Run from the repo root,
// through the env file: the E2B SDK reads E2B_API_KEY from the process
// environment, and nothing in this script loads .env.local for it.
//
//   npm run template                           # both templates
//   npm run template -- base                   # just the small one
//   npm run template -- docker                 # just the Docker one
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
import { execFileSync } from "node:child_process";
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

// Engelbart's own addition to hc, which lives here rather than in the
// checkout so it survives one being lost or rebuilt: a launch capability
// that hands the application a Node preload without the repository
// having to mention it. The patch is small on purpose — the capability
// itself is a module of ours — and the build fails rather than quietly
// producing a template that cannot watch an artifact's model calls.
const trajectory = path.join(here, staged, "src/human_compact/trajectory");
fs.copyFileSync(path.join(here, "hc/project_instrumentation.py"), path.join(trajectory, "project_instrumentation.py"));
try {
  execFileSync("patch", ["-p0", "--no-backup-if-mismatch", "-i", path.join(here, "hc/project_run.patch")], { cwd: trajectory, stdio: "pipe" });
} catch (err) {
  console.error(`sandbox/hc/project_run.patch no longer applies to ${hc}. hc has moved; reconcile the patch before building.`);
  console.error(String(err.stdout ?? "") + String(err.stderr ?? ""));
  process.exit(1);
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
    // The behavior trace: the model gateway the application's model client
    // is pointed at, and the sandbox-only edits some artifacts need for that.
    .copy("trace", "/opt/engelbart/trace", { user: "root" })
    .copy("instrumentation", "/opt/engelbart/instrumentation", { user: "root" })
    // A headless browser for the health step: the page is loaded as a person
    // would, so an app that crashes only once a browser connects is seen.
    .copy("visit.mjs", "/opt/engelbart/visit.mjs", { user: "root" })
    .runCmd("cd /opt/engelbart && npm init -y >/dev/null 2>&1 && npm install --no-audit --no-fund playwright@1 && PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright npx playwright install --with-deps chromium && chmod -R a+rX /opt/ms-playwright /opt/engelbart && apt-get clean && rm -rf /var/lib/apt/lists/*", { user: "root" })
    // Fail the build, not the first run, if anything is missing.
    .runCmd(`node --version && claude --version && railpack --version && bun --version && pnpm --version && uv --version && python3 -c 'import human_compact.trajectory.project_run' && node /opt/engelbart/visit.mjs about:blank 100 | grep -q '"error":null' && ENGELBART_TRACE_TOKEN=check ENGELBART_MODEL_GATEWAY_PORT=0 timeout 10 node /opt/engelbart/trace/model-gateway.mjs 2>/dev/null | head -1 | grep -q '"kind":"gateway.listening"' && ENGELBART_PREVIEW_BIND=127.0.0.1 timeout 10 node /opt/engelbart/trace/preview-gateway.mjs 43199:1 2>/dev/null | head -1 | grep -q '"gateway":"preview"' && node --require /opt/engelbart/trace/preload.cjs -e 'process.exit(process.env.ENGELBART_MODEL_CAPTURE?1:0)' && python3 -c 'import inspect;from human_compact.trajectory import project_run as R,project_instrumentation as I;assert "instrumentation" in inspect.signature(R.start).parameters;assert I.wanted({"modelCapture":True})=={"modelCapture"}'${docker ? " && docker --version && docker compose version && supabase --version" : ""}`);
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
