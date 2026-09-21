# The sandbox runner

A long-lived process that takes queued runs from the database and drives
them through E2B. It is the half of the system that does not live on
Vercel.

```
npm run worker      # locally; reads .env.local
```

## How it reaches the app

It does not. The web app inserts a row into `engelbart_sandbox_runs` and
the runner claims it — an update that only matches a row still queued
and unclaimed, so two runners cannot take the same run. While it holds
one it writes a heartbeat every 15 seconds, and a reaper marks runs
whose runner went quiet.

So the app can be deployed anywhere and the runner can be anywhere with
outbound network, and neither needs to know the other's address. The
table is the whole interface.

## Where it can run

Anything that keeps a process alive: Railway, Fly, Render, a VM. A
`Dockerfile` and a `railway.json` are at the repository root.

**Not Vercel**, and not for a limit that can be raised. The runner is
four intervals that never stop and it holds an open stream for as long
as an application is running. A function that must return would be
declared dead by the runner's own reaper after `STALE_MS`, and every run
it was holding marked "The runner stopped while this run was in
progress." There is no always-on process to deploy it to.

Nothing in it touches the local filesystem, so there is nothing to mount
and no state to carry between restarts — all of it is in the database
and in E2B.

## Environment

| variable | required | what it is |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | the project |
| `SUPABASE_SECRET_KEY` | yes | the secret API key; the runner writes on behalf of any user, which row-level security would otherwise refuse |
| `E2B_API_KEY` | yes | sandboxes |
| `ANTHROPIC_API_KEY` | yes | the agents the pipeline calls |
| `ENGELBART_WORKSPACE_ORIGIN` | in practice | the origins a launched sandbox will take annotate and record messages from: one, or a comma-separated list, most-used first. Guessed when unset, and the guess is wrong for every runner that is not itself on Vercel — see below |
| `E2B_TEMPLATE` | no | defaults to `engelbart-runner` |
| `WORKER_CONCURRENCY` | no | runs being set up at once; default 4 |
| `WORKER_ID` | no | default hostname-pid |

### ENGELBART_WORKSPACE_ORIGIN is the one that bites

Which origins may drive a preview is decided **by this process, at the
moment it launches the sandbox**, and baked into the image's bridge. It
is read when the runner starts, not when a page is opened, so changing
it means restarting the runner *and* preparing a fresh run — an existing
sandbox keeps what it was launched with.

Unset, it guesses `https://$VERCEL_PROJECT_PRODUCTION_URL`, else
`https://$VERCEL_URL`, else `http://localhost:3000`. A runner on a
laptop or in a container has none of the Vercel variables, so it guesses
localhost and pins every sandbox to it. The deployment then gets a
preview that silently drops everything the workspace sends it: the
picker never answers and no replay is ever captured, because both ride
the one channel.

Set it explicitly wherever the runner is hosted:

```
ENGELBART_WORKSPACE_ORIGIN=https://engelbart-web.vercel.app,http://localhost:3000
```

An explicitly blank value means no control channel at all, which is the
only way to spell that. Order matters for one case: a sandbox built from
an image older than the list support honours only the first entry.

## Deploying it

Railway, from this repository:

```
railway init
railway up
```

then set the variables above in the service. `railway.json` pins it to
the Dockerfile, one replica, restart on failure.

One replica is the simple choice, not a requirement — claiming is atomic
and scaling out is safe. What is **not** safe is leaving old runners
running beside the new one. `tsx` compiles the source when the process
starts, so a runner that has been up since last week keeps executing
last week's code until it is replaced, and it will happily claim a run
and do the old thing with it. On a host, a deploy replaces the process.
Locally, that is what `pkill -f 'worker/index.ts'` is for.

## What stays local

`npm run template` builds the E2B images and is not part of this. It
talks to the E2B API and the templates are global to the account, so it
is run once from anywhere after anything under `sandbox/` changes —
including `bridge.js` and `preview-gateway.mjs`, which reach a run only
through a rebuilt image. Deploying the runner does not rebuild them.
