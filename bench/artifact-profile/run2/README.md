# Run 2 — wizmap

Second blind ArtifactProfile generation. Everything here is frozen: the profile
was generated once, validated, hashed and made read-only before any held-out
session was looked at, and nothing in it was edited afterwards.

**The question.** Can the same generic Engelbart architecture that learned ROPE
also learn and truthfully interpret a fundamentally different, non-chat, spatial
research interface without artifact-specific engineering?

**The artifact.** [poloclub/wizmap](https://github.com/poloclub/wizmap) at
`f0f4af47a80bc64b0d81151d5a5040497ba7afcc`, unmodified — an embedding-map
explorer with a WebGL point cloud, continuous pan and zoom, a search panel and a
control bar. No chat, no LLM, no turn-taking, one document. Chosen for being as
unlike ROPE as possible while still running offline in the sandbox.

**The method.** Unmodified artifact → repo + README + source → raw DOM and trace
evidence from **one** discovery session → a fresh model with no conversation
context writes an ArtifactProfile as pure declarative data → freeze → run the
generic pipeline over two completely held-out sessions → evaluate.

**The answer.** Learn: yes. Truthfully: yes. Usefully: not yet, and not for the
reason being tested. Read [REPORT.md](REPORT.md).

The short version: the generator produced a correct, honest model of an interface
with no test attributes, no ARIA, no submissions and a canvas-painted primary
surface, stayed inside what a recording can show, and independently diagnosed
three defects in the instrument watching it. Zero lines of the engine changed.
Then the segmenter — which learned its shape from turn-taking software and cuts
at submissions, model calls, document changes and long silences, none of which
wizmap has — read 82 seconds and ten distinct actions as **one episode**.
Failure attribution came out **A 0 · B 4 · C 4**: no misunderstanding of the
artifact, four anchor failures, four runtime-perception failures.

## What Run 2 exposed in the generic stack

Recorded, not fixed. All four are artifact-general.

1. **The generated-class filter is inverted on kebab-case names.** `[-_][a-z0-9]{6,}$`
   drops `zoom-button`, `embedding-canvas`, `item-wrapper` — 49 of wizmap's 129
   classes, every one hand-written — and keeps all five Svelte scope hashes,
   whose capitals defeat it.
2. **`visibleText` loses a label behind a verbose icon.** It stops at 240
   characters and counts insignificant whitespace against that budget, so of five
   identical buttons three report their label and two report none, silently.
3. **`regions[].within` is recorded and never read.** v2's "several candidate
   ancestors rather than only the LCA" reaches the trace but `appearances()` uses
   `region.target` only, so a channel that would have matched `div.footer` — the
   ancestor sitting right there in the evidence — matches nothing.
4. **The profile language documents the surface key wrongly.** `SCHEMA.md` says a
   document is keyed "…else its path" and that `"top"` means "no document at
   all"; in fact `surfaceKey()` returns `"top"` for *every* non-embedded top-level
   document. Any single-document artifact's surfaces will be dead. ROPE's
   iframes hid this in Run 1.

And one structural finding, predicted before generation in
[PREREGISTERED.md](PREREGISTERED.md): on an artifact with one surface, no
submissions and no model calls, the segmenter has no cut driver but a 20-second
silence, and `moment` — the only lever a taxonomy has — cannot create a cut, only
prevent an absorption. The profile marked 15 controls as moments; segmentation
is byte-identical with them and without them.

## What is here

| | |
|---|---|
| [REPORT.md](REPORT.md) | the full evaluation: fit, anchors, supportability, segmentation, the A/B/C taxonomy, the WebGL honesty test, the verdict |
| [BASELINE.md](BASELINE.md) | everything frozen before generation, with hashes |
| [PREREGISTERED.md](PREREGISTERED.md) | what was already known to be broken, written down before the profile existed |
| [BOOTSTRAP.md](BOOTSTRAP.md) | the two generic changes needed to run wizmap, and the list of things not done to it |
| [profile.json](profile.json) · [NOTES.md](NOTES.md) | the frozen profile and the generator's own account of it |
| [FROZEN.md](FROZEN.md) | its hash and counts |
| [TIMELINES.md](TIMELINES.md) · [SEGMENTATION.md](SEGMENTATION.md) · [ANCHORS.md](ANCHORS.md) · [MISSES.md](MISSES.md) | the measurements |
| [judgements.json](judgements.json) | the blind judge's verdicts |
| `evidence/` | exactly what the generator was given, minus the artifact repository |
| `sessions/` | the three recordings |
| `harness/` | the recording drivers and the evaluation scripts |

The artifact itself is not vendored: it is upstream at the commit named in
`BASELINE.md`.

## Caveat

The three sessions are **driver sessions**, not recordings of a person: a script
drove a headless browser through a plausible use of the artifact with real waits,
including a 48-second gap standing in for someone leaving the desk. Run 1's four
sessions were real use. This is a genuine weakening of Run 2 relative to Run 1.
