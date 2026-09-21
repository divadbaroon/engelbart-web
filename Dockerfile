# The sandbox runner, as a container.
#
# This is not the web app. The web app is on Vercel and this is the
# process that does the work it queues: it polls the runs table, claims
# what is waiting, and drives each run through E2B. The two never speak
# to each other — they share a Supabase table and nothing else, which is
# why the app can be deployed and the runner can be anywhere with
# outbound network.
#
# It wants a host that keeps a process alive: Railway, Fly, Render, a
# VM. Not Vercel, and not because of a limit that can be raised. The
# worker is four intervals that never stop (worker/index.ts) and it
# holds an open stream for as long as an application is running; a
# function that must return would be declared dead by its own reaper
# after STALE_MS, and every run it was holding marked "The runner
# stopped while this run was in progress."
#
#   docker build -t engelbart-worker .
#   docker run --env-file .env.local engelbart-worker
#
# One replica is the simple choice, but not a requirement: a claim is an
# update that only matches a row that is still queued and unclaimed, so
# workers cannot take the same run twice and scaling out is safe. What
# is not safe is leaving old ones running, because tsx compiles the
# source when the process starts — a container from last week keeps
# running last week's code until it is replaced.
FROM node:22-slim

WORKDIR /app

# Dev dependencies on purpose. The worker is TypeScript executed
# directly by tsx, and tsx and typescript are both devDependencies, so
# the usual `--omit=dev` builds an image that cannot start. NODE_ENV is
# deliberately not set to production before this line, because npm reads
# it and would omit them anyway.
COPY package.json package-lock.json ./
RUN npm ci --include=dev && npm cache clean --force

# Only what the worker's module graph reaches. `app` is in the list for
# one import: lib/bart/repo.ts takes fetchFile and fetchReadme from
# app/workspace/[workspaceId]/repo-actions. tsconfig.json comes with it
# because the `@/*` path alias is resolved from it at runtime, not
# compiled away.
COPY tsconfig.json ./
COPY lib ./lib
COPY app ./app
COPY worker ./worker

# Exec form, so node is PID 1 and receives the SIGTERM the platform
# sends on redeploy. The worker handles it (worker/index.ts, the last
# line) and uses it to hand back the runs it is holding rather than
# leaving them for the reaper to time out ninety seconds later.
CMD ["node", "--import", "tsx", "worker/index.ts"]
