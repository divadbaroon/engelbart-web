# Run 1 — blind ArtifactProfile generation

## Frozen before generation

| | |
|---|---|
| Engelbart commit | `112c957a5d12c0f49295a2cb2a47bbbe0524161e` |
| Engelbart working tree | substrate milestone, uncommitted (21 paths) |
| Working-tree hash | `3ffd31090be53d0c` over `git status --short`; full diff saved as baseline.diff |
| ArtifactProfile schema version | `version: 1` |
| schema.ts hash | `20c5ef93b8582b881bf90b49940215b309ecf2370cb8c02f05ef427ef6343d5d` |
| Evidence pack hash | `8105a4b0bd0253e9eac2522f23b67c969fff5a2921c70b0ec0e98c298b82fa5c` |
| Artifact | mqo00/rope @ `1ada01830031e5882f2585577720b182deac6246` (upstream, unmodified) |
| Generator model | claude-opus-5 (fresh agent, no conversation context) |

## Session split

| role | run | events | episodes (handwritten) | span |
|---|---|---|---|---|
| DISCOVERY (in-sample) | `87a7ceb0-8429-41d2-a90d-a0f5e1af182c` | 525 | 13 | 212s |
| HELD-OUT 1 | `0711358e-55c6-4da5-a37a-ce9b5e530547` | 327 | 11 | 1595s |
| HELD-OUT 2 | `d41b33b2-8ff4-4906-9468-53d59e45634c` | 339 | 24 | 2745s |
| HELD-OUT 3 | `3c9e1514-f8b6-4c94-a9f7-969e710db7f0` | 182 | 9 | 55s |

Only the discovery session contributed runtime evidence to the pack. The three held-out
sessions contributed nothing: no events, no folds, no counts, no output.

## What the generator was given

`artifact/` (the ROPE repository at its upstream commit, 74 files), and eight evidence files
derived from the discovery session only: the setup brief, the document census, the distinct
elements acted on, the key names, where text arrived, the raw interaction stream, the
application's own model calls, and the reduced DOM of each distinct screen.

## What it was denied, and why

| denied | reason |
|---|---|
| the Engelbart repository | it contains the handwritten answer |
| `lib/activity/rope.ts` | it *is* the handwritten answer |
| `tests/fixtures/rope-profile.json` | the manual declarative profile |
| `tests/activity/**` | the parity tests encode the expected readings |
| all Activity output, episodes, classifications | downstream of the answer |
| **the stored UI semantic maps** | `lib/semantics/analyze.ts:38-39` primes its prompt with this artifact's own vocabulary — "Tutor conversation", "Student response", "Generate game", "Solution game", and a purpose example describing this exact software. Every stored map is therefore downstream of a prompt that was told the answer. Only the **raw** survey (the reduced DOM, no model in the loop) went into the pack. |
| this conversation | a fresh agent, never a fork |

## Run 1 — frozen 2026-09-20 14:58

| | |
|---|---|
| profile.json sha256 | `53157b37afde17962296b7d5111786d2eb3e225d040a6808ace15232ad9159ba` |
| bytes |    40616 |
| transcript audit | CLEAN — 43 tool calls, all scoped to the pack; 0 paths into the Engelbart repo, host or network |
| frozen at | `experiment/run1/profile.json` (read-only) |

Nothing was edited after freezing. The handwritten taxonomy was not opened until after this point.
