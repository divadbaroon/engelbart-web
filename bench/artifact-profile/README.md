# Can an LLM derive an ArtifactProfile for an unfamiliar artifact?

A frozen experimental baseline. Nothing in here is used by the application,
and nothing in here may be edited: it is a result, not a source file.

## Run 1 — ROPE, 2026-09-20

**Question.** Can an LLM derive a useful `ArtifactProfile` for a research
artifact it has never seen, from the artifact itself, without seeing our
hand-written semantic solution?

**Method.** A fresh `claude-opus-5` agent with no conversation context was
given an evidence pack — the ROPE repository at `1ada0183`, a schema
description, and raw trace evidence from one discovery session — and nothing
else. It never had access to this repository, to `rope.ts`, to the manual
declarative profile, or to any previous reading of a session. Its whole
transcript was audited mechanically afterwards: 43 tool calls, every one
inside the pack, zero forbidden markers.

It generated the profile once. The output was frozen before anything was
compared against anything.

| | |
|---|---|
| `profile.json` sha256 | `53157b37afde17962296b7d5111786d2eb3e225d040a6808ace15232ad9159ba` |
| discovery session | `87a7ceb0` |
| held-out sessions | `0711358e`, `d41b33b2`, `3c9e1514` |
| schema version | 1 |

**Result.** Segmentation 56/57 windows identical to the handwritten cut.
Surface recognition 57/57. Person/system attribution of on-screen text 18/18.
Broad-class agreement with `rope.ts` 92% / 73% / 71% / 89%.

Under blind adjudication on raw evidence — a judge seeing one stretch and one
claim, never the competitor and never which system wrote it — the generated
profile was more supportable than the hand-written taxonomy on every axis, in
every session: 65% of claims fully supported against 53%, unobservable
mental-state inference on 18% of stretches against 39%, and **zero
high-confidence unsupported claims against eight**.

`REPORT.md` is the full evaluation, `ANCHORS.md` the anchor survival analysis,
`judgements.json` all 114 blind verdicts, `NOTES.md` the generator's own
account of what it was and was not confident about.

## What Run 1 changed about the collector

Run 1 was run to learn about the generator and instead found three things
wrong with our instrumentation. They are fixed in `sandbox/trace/bridge.js`
and `lib/activity/segment.ts`, and none of them are about ROPE:

1. **Typing was invisible.** `ui.input` came from the DOM `change` event,
   which fires on blur with a changed value — something a controlled
   component never produces. Across all four sessions it fired once each, on
   the one field that happened to blur.
2. **A burst of DOM changes reported only its lowest common ancestor,** so
   one repaint touching two panels reduced both to whatever contained them.
3. **An application's own name for its own controls was discarded.** ROPE
   labels every control it cares about; the collector read only the
   `data-testid` family.

Old traces, including the four here, read exactly as they did: the evaluation
was re-run after the changes and is byte-identical.
