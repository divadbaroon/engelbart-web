# Run 1's four ROPE recordings, kept as a regression baseline

These are the traces Run 1 was evaluated on. They are here, and not in
`bench/artifact-profile/run1/`, because that directory is frozen byte-for-byte
and nothing may be added to it. This copy exists so that a change to the generic
runtime can be checked against real recordings after the session scratchpad they
were produced in is gone.

They are read-only. Nothing in this directory is part of Run 1's result; Run 1's
result is `bench/artifact-profile/run1/`, unchanged.

| file | run id | events | model calls | sha256 |
|---|---|---|---|---|
| `87a7ceb0.json` | `87a7ceb0-8429-41d2-a90d-a0f5e1af182c` | 525 | 2 | `2bb02be935ef1de9…` |
| `0711358e.json` | `0711358e-55c6-4da5-a37a-ce9b5e530547` | 327 | 1 | `7a704e8c77f8fec9…` |
| `d41b33b2.json` | `d41b33b2-8ff4-4906-9468-53d59e45634c` | 339 | 3 | `ca9982f05a7d25ba…` |
| `3c9e1514.json` | `3c9e1514-f8b6-4c94-a9f7-969e710db7f0` | 182 | 2 | `ebda74ca1f965300…` |

Full hashes, byte counts and time spans are in `manifest.json`.

## Provenance

Recordings of a person using [mqo00/rope](https://github.com/mqo00/rope) at
`1ada01830031e5882f2585577720b182deac6246`, unmodified, in an E2B sandbox behind
the preview gateway, captured by the generic bridge. In Run 1 the first was the
discovery session that the blind generator saw; the other three were held out
and contributed nothing to the evidence pack. Their roles are recorded in
`bench/artifact-profile/run1/BASELINE.md`.

Each file is `{ runId, events, calls }`, where `events` are
`engelbart_trace_events` rows and `calls` are `engelbart_model_calls` rows, in
the shape `toTraceEvent` / `toModelCall` read.

## What they are for

Two things, and no others:

1. **Regression.** Any change to `segment.ts`, `classify.ts`, the bridge or the
   profile runtime is run against all four, and every changed episode boundary
   is reported rather than absorbed into an updated expectation.
2. **Genre coverage.** ROPE is the chat-shaped genre. A generic segmenter that
   improves a continuous interface and quietly breaks turn-taking has not
   improved anything.
