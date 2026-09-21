# What model capture reaches

Model capture reads an artifact's model calls without editing the artifact.
hc launches the application with one preload (`preload.cjs`) and one marker
(`ENGELBART_MODEL_CAPTURE`, the gateway's own URL); the preload moves
outbound requests to the gateway; the gateway decodes what a provider
module claims and carries everything else untouched.

The claim this file supports is narrow and deliberately so:

> Generic zero-source-edit Node model-call interception for supported
> launch and runtime paths.

Not universal interception. What follows is the measured list of the paths
that work, and the honest list of the ones that do not.

## Measured

Two scripts produce these rows, and both run against real packages, a real
gateway and a real HTTP upstream. Nothing here is read off the source.

    npm run capture:coverage     # the table below
    npm run capture:check        # one pristine artifact, 19 checks

`capture:coverage` installs each client at a pinned version and runs it as
its own process, delivered exactly the way hc's instrumentation capability
delivers it: `NODE_OPTIONS=--require=…` plus the marker, and nothing else.

| runtime / client | version | ran | captured | carried by |
|---|---|---|---|---|
| OpenAI SDK v4 | 4.61.0 | yes | yes | `https.request` |
| OpenAI SDK v5 | 5.12.2 | yes | yes | `globalThis.fetch` |
| Anthropic SDK, current | 0.127.0 | yes | yes | `globalThis.fetch` |
| Anthropic SDK, node-fetch era | 0.27.3 | yes | yes | `https.request` |
| axios, default adapter | 1.7.7 | yes | yes | `http.request` |
| axios, `adapter: "fetch"` | 1.7.7 | yes | yes | `globalThis.fetch` |
| raw `http.request` | node 22 | yes | yes | `http.request` |
| built-in `fetch` | node 22 | yes | yes | `globalThis.fetch` |
| `undici.request` | 6.19.8 | yes | yes | global dispatcher |
| worker thread | node 22 | yes | yes | `globalThis.fetch` |
| Next 14, `next dev` | 14.2.3 | yes | yes | `http.request` |
| Next 14, `next build && next start` | 14.2.3 | yes | yes | `http.request` |

Twelve of twelve run and are captured. Three things in that table are worth
saying out loud, because each was a failure at some point in building it:

**One transport does not cover Node.** Five of the twelve are carried by
`fetch`, six by `http`/`https`, one by the undici dispatcher, and which
one a client uses is not a property of the client. The same OpenAI 4.61.0
in the same Next application takes `http` under both launchers, while
OpenAI 5 in a bare process takes `fetch`. A capture built on any single
layer would have a hole in this table.

**A dispatcher hook has to survive being replaced.** `undici.request` is
captured through the global dispatcher, and `setGlobalDispatcher` is a
public API an application may call at any time. The hook is installed by
watching `Object.defineProperty` for undici's dispatcher symbol rather than
by setting it once, so a later replacement is re-wrapped rather than
silently dropping capture. It shadows `dispatch` as an own property on the
real agent; a `Proxy` around the agent hangs undici, because its methods
then run with the proxy as `this` and its private state is unreachable.

**Every realm arms and checks for itself.** `NODE_OPTIONS` is inherited, so
the preload runs in each new process and each new worker thread, and each
one probes the gateway and reports its own state rather than trusting the
main thread's. Five processes armed in the measured `next dev` run — npm,
the CLI, the server and its workers — and the one that served the route is
the one that carried the call. A worker thread that makes the call itself
is the row above.

Arming is also free of side effects on the launcher, which
`capture:coverage` checks with a control: the same `next start`, the same
request, nothing injected. It runs the same two processes as the armed
one, answers the same, sees no capture (as it should), and neither run
prints a line hc's app-error detector would read as a crash. Capture is
allowed to fail to see a call. It is not allowed to change the run.

### What the framework's own traffic did

In the `next dev` row the gateway also carried three requests the
application never made: Next's version check to `registry.npmjs.org` and
two telemetry pings to `telemetry.nextjs.org`. All three were relayed to
the real internet and answered normally (200, 204, 204). None was recorded
as a model call, and none of their bodies was stored — an unrecognised
destination produces one `gateway.relayed` line with method, host, status,
sizes and duration, and nothing else.

That is the whole fail-open rule in one observation: Engelbart carries what
it cannot read. A request is never refused for being unrecognisable, and
recognition — an operator-declared model host, or a provider module that
claims the shape — is what gates storage, decided from the route before a
single byte of body is buffered.

### One pristine artifact, end to end

`capture:check` clones `mqo00/rope` at `1ada0183`, hashes all 74 files,
installs `openai@4.61.0`, and runs ROPE's own `generate()` under the
preload against a real gateway and the real collector. Nineteen checks:
the artifact behaves, streaming still streams, the request and response are
captured and decoded, timing is recorded, an abort is an abort, an SDK
retry is two calls, a call made after the HTTP response is still tied to
its interaction explicitly, the provider is never told about Engelbart, an
unrecognised destination is carried rather than refused, a failure to
observe is never a failure to run, `git` says the tree is clean, every file
hashes to what it hashed to before, and no Engelbart file exists inside the
repository.

## Not supported

None of these is half-attempted. Where the limit is the launcher, it is
detected before launch and the run reports `unsupported_launcher`; the
artifact still starts, unmodified. Where the limit is a runtime inside an application Engelbart is otherwise
watching — a Next edge route or middleware — the repository is read
before launch and the run reports `partial`, naming the paths, so that
"capture saw nothing" and "capture could not look there" are different
readings. Where the model call happens somewhere else entirely — another
container, another machine, another language — nothing detects it, and
the honest statement is that those are not model-call capture at all. In no case is the artifact patched to compensate.

| | why | what happens |
|---|---|---|
| Next Edge runtime / middleware | the edge runtime is not Node: no `NODE_OPTIONS`, no `node:http`, and its `fetch` is the runtime's own | not captured, but detected: before launch the wrapper reads the repository for `export const runtime = "edge"` and for Next middleware, and the run reports `partial` naming those paths. Node routes in the same application are captured normally |
| Bun | `bun` does not honour `NODE_OPTIONS=--require`; `--preload` is its own flag with its own semantics | `unsupported_launcher` before launch, from the launcher name |
| Deno | same: no `--require`, and permissions gate the loopback hop | `unsupported_launcher` |
| a Docker child environment | the marker and the preload path exist in hc's namespace, not in the container's, and `127.0.0.1` inside a container is not the gateway | `unsupported_launcher` for `docker`/`docker-compose`; if reached another way, the preload never arms because the marker is absent |
| Python, Ruby, Go, Rust, native binaries | nothing loads a CommonJS preload | `unsupported_launcher`; a shell-script rung reports it explicitly |
| a model called from the browser | the page's `fetch` is the browser's, and the preview gateway sees the request as ordinary application traffic | captured as `network.request`, not as a model call |
| an external service the artifact calls, which itself calls a model | the model call happens on another machine | the artifact's own request is relayed and recorded as an unrecognised destination |

Two more that are refusals rather than gaps, both deliberate:

- **A request carrying its own TLS material** (`ca`, `cert`, `key`, `pfx`,
  `rejectUnauthorized`, `checkServerIdentity`) is left alone. Moving it to
  a plaintext loopback hop would quietly weaken what the caller asked for.
- **An `Upgrade` request** (websockets) is left alone, and the gateway
  refuses `upgrade`/`connect` rather than half-proxying them.

## The traced run, end to end

On 2026-09-20 this was run once through the machinery a person uses:
a queued run for `mqo00/rope`, a runner, a sandbox from the
`engelbart-runner` image, hc, the `modelCapture` capability, the preload,
and ROPE's own Next application. The registered source patch was switched
off for the run (`ENGELBART_INSTRUMENTATION=off`), and the registry the
runner read was empty. Nothing set `NODE_OPTIONS` from outside that path.

Run `878bd9f0`, sandbox `int9ifl6i6chyaj5fw19g`, ROPE at `1ada0183`.

**hc delivered the preload, and only to the application.** Every process
in the sandbox, read from its own `/proc/<pid>/environ`:

| pid | process | `--require` preload | marker | trace token |
|---|---|---|---|---|
| 1583 | `node /opt/engelbart/trace/model-gateway.mjs` | no | no | yes |
| 1592 | `python3 /opt/engelbart/hc_run.py /home/user/rope` | no | no | no |
| 1788 | `node /opt/engelbart/trace/preview-gateway.mjs` | no | no | no |
| 1635 | `npm run dev` | yes | yes | no |
| 1650 | `sh -c next dev -p 3333` | yes | yes | no |
| 1651 | `node .../next dev -p 3333` | yes | yes | no |
| 1663 | `next-server (v14.2.3)` | yes | yes | no |

On the server process the option reads
`NODE_OPTIONS=--require=/opt/engelbart/trace/preload.cjs --max-old-space-size=3977`:
one `--require`, beside the application's own option rather than instead
of it. Engelbart's own three processes carry neither the preload nor the
marker, so nothing of Engelbart's watches itself.

**Four realms armed and each checked the gateway for itself** — pids
1635, 1651, 1663 and a Next worker, 1676, each reporting `available`
over undici, http and fetch, which is only sent once the gateway has
answered. The server process then reported `active`.

**Two tutor questions, asked in a browser.** Both answered by the real
provider, and both captured:

| | first | second |
|---|---|---|
| model | gpt-4o-2024-08-06 | gpt-4o-2024-08-06 |
| provider / api | openai / openai.chat.completions | same |
| status | 200 | 200 |
| streamed | yes, 263 chunks rebuilt | yes |
| latency / first token | 3563.6 ms / 2170.1 ms | 2238.8 ms / 817.9 ms |
| messages in the request | 3 | 5 |
| answer | 1180 characters, matching the page | 1208 characters |
| correlation | **explicit** | **explicit** |
| aborted / duplicated | no / no | no / no |

Two calls for two questions: no SDK retry, no double-recorded call.

**The correlation is claimed and corroborated, not guessed.** For the
first: a `ui.submit` in interaction `i_5e4771c6df_9` at 01:28:13.905, the
preview gateway recording that server action as request `r_b_5jwEILuOIg`
at 01:28:13.917, the preload carrying both ids on the gateway hop, and
the collector accepting them because it had already recorded that
request — taking the interaction from its own row, not from the claim.
The provider never saw either id.

**Activity drew it as one thing that happened.** From the same rows,
through the same functions the Visualizer and the canvas call:
`ACTING/SUBMIT_RESPONSE — Submitted the response.` → the model node for
`mc_34JgM5yAFO-p` → `The tutor answered — "Great question! Start by
focusing on the initial setup of the game…"`. Nine stages, ten canvas
nodes, and `captureState` for the run reads `active`, carried over fetch
and http, from six reports.

**Fail-open, unprompted.** The application made ten requests Engelbart
does not recognise — npm's registry, Next's telemetry, Google Fonts and
seven font files — and the gateway carried all ten to the real internet
(200 and 204). Each left one `gateway.relayed` line with method, host,
path, status, sizes and duration, and no body and no request headers.
None became a model call. Nothing in either model call's stored form
carries an `Authorization` header, a cookie or anything shaped like a
key; the kept request headers are `accept`, `user-agent`, `content-type`,
`content-length` and the SDK's own `x-stainless-*`.

**The same information as the patched path, and one thing more.** Against
the last runs that used ROPE's source patch, the captured call carries
the same model, provider, message count, streaming, status, latency and
answer length. The difference is the correlation: the patched runs
recorded `temporal`, or nothing at all; the preload run recorded
`explicit` for both calls.

**A run where capture cannot arm.** Run `3510be6f`, the same repository,
the same machinery, with the runner's preload path pointed at a file
that does not exist. ROPE installed, started, and answered on its preview
URL. hc reported `instrumentation_failed` naming the missing file, both
in the run's log and on the trace, and `captureState` reads that rather
than silence: no model calls, and a run that says why. No repair rung ran
and no app-error marker appeared — a failure to observe cost the
watching, not the run.

**The repository, after both runs.** In each sandbox: `git status`
empty, `git diff` empty, `git log` carrying only ROPE's own commit, all
74 tracked files hashing exactly as a fresh clone of `1ada0183` hashes,
and no file inside the repository named for Engelbart or mentioning it.

The registered patch for ROPE was removed after this run.
`sandbox/instrumentation/` now registers nothing, and
`tests/sandbox/instrumentation-registry.test.mjs` holds it empty while
keeping the mechanism for an artifact the preload cannot reach.

## Where the pieces are

| | |
|---|---|
| `sandbox/trace/preload.cjs` | the three hooks, the arming gate, the readiness gate, the status report |
| `sandbox/trace/model-gateway.mjs` | the relay, provider decoding, redaction, `gateway.relayed` |
| `sandbox/hc/project_instrumentation.py` | which launchers can take a preload, and refusing the ones that cannot |
| `sandbox/hc_run.py` | asking for the capability, and reporting its state on the run |
| `tests/trace/preload.test.mjs` | 25 tests over the hooks themselves |
| `tests/sandbox/hc-instrumentation.test.mjs` | 11 tests over delivery and refusal |
| `scripts/trace/capture-coverage.mts` | the table above |
| `scripts/trace/capture-check.mts` | the pristine-artifact run |
