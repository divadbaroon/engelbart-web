# Run 2 baseline — wizmap

Frozen 2026-09-20 15:35 PDT. Nothing below may change until Run 2 is evaluated.

## Engelbart

| | |
|---|---|
| commit | `112c957a5d12c0f49295a2cb2a47bbbe0524161e` |
| working tree | 27 modified/untracked paths, saved as `engelbart.baseline.diff` + `.status` |
| **Evidence Stack v2 hash** | `9ae712ea141042284975181318d383f04462e617ea4d4d11726d7707c3dc6a1e` |
| ArtifactProfile schema | version 1, `schema.ts` = `21fe2283f15d5476cf7ee9e4c900942ffe832fd2cf9d8a9f529ff683fcb021c5` |
| bridge (capture) | `eb2685b7239e6c909677b39141f66378127fc74f56c78df548902022b2455288` |

Evidence Stack v2 is the concatenation, in this order, of:
- `sandbox/trace/bridge.js lib/trace/types.ts lib/activity/segment.ts lib/activity/classify.ts lib/activity/taxonomy.ts lib/activity/types.ts lib/activity/profile/schema.ts lib/activity/profile/compile.ts lib/activity/profile/validate.ts lib/activity/profile/fit.ts`

### What v2 adds over the stack Run 1 was recorded with
1. **Continuous editing evidence** — `ui.input` from the DOM `input` event, folded per field, carrying `edits` and `valueLength`; characters never leave the page and a password reports neither. `acts.typing` sums the folded count.
2. **Per-region mutation evidence** — `ui.change` carries `regions[]`, each the nearest nameable ancestor of a changed subtree with its own text and up to two candidate ancestors; `appearances()` yields one appearance per region, falling back to the container for traces recorded before v2.
3. **Generic application identifiers** — `testid` reads eight test-harness attribute conventions; `appId` keeps the value of a `data-*-id` attribute that passes an identifier shape test, and `appIdAttr` keeps which attribute it was (rung 1 and rung 2 respectively).

## Generator

| | |
|---|---|
| model | `claude-opus-5` |
| context | fresh agent, no conversation history |
| may read | the evidence pack only |

## Run 1 is untouched

`bench/artifact-profile/run1/profile.json` = `53157b37afde17962296b7d5111786d2eb3e225d040a6808ace15232ad9159ba` (read-only).

## The artifact

| | |
|---|---|
| repository | `poloclub/wizmap` (upstream, unmodified) |
| commit | `f0f4af47a80bc64b0d81151d5a5040497ba7afcc` |
| how it was launched | `npm install`, then its own `vite` dev server |
| generic bootstrapping applied | two, both documented in `BOOTSTRAP.md`; neither touches the artifact's files |
| semantic instrumentation applied | none |

## Session split

| role | run | events | span |
|---|---|---|---|
| DISCOVERY (in-sample) | `wizmap-discovery` | 30 | 82 s |
| HELD-OUT 1 | `wizmap-search` | 35 | 71 s |
| HELD-OUT 2 | `wizmap-controls` | 35 | 120 s |

Only the discovery session contributed runtime evidence to the pack. Neither held-out
session contributed anything: no events, no folds, no counts, no output.

All three are driver sessions rather than recordings of a person — see `PREREGISTERED.md`.

## What the generator was given

`pack/` and nothing else: `TASK.md`, `SCHEMA.md`, `artifact/` (the wizmap repository at
its upstream commit, 105 files, minus `node_modules`, `.git` and the 146 MB of bundled
datasets), and seven evidence files derived from the discovery session and the running
interface only.

| | |
|---|---|
| evidence pack sha256 | `2b158c5860db88d7223a2fe9d429b133788cb43bc1003c6b398aa8451b6e9934` |
| files in the pack | 114 |

## What it was denied, and why

| denied | reason |
|---|---|
| the Engelbart repository | the generic engine, and Run 1's answer |
| `bench/artifact-profile/run1/**` | a worked example of this exact task |
| the two held-out recordings | they are the test |
| any Activity output, episode or classification | downstream of a profile |
| any hand-written or model-written description of wizmap behaviour | there is none; none was made |
| `PREREGISTERED.md` | it names which anchors are available and which capture paths are broken |
| this conversation | a fresh agent, never a fork |
