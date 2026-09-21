# Run 2 — can the same architecture learn a spatial research interface?

wizmap, blind. No handwritten taxonomy, no answer key, no artifact-specific code.

| | |
|---|---|
| artifact | `poloclub/wizmap` @ `f0f4af47a80bc64b0d81151d5a5040497ba7afcc`, unmodified |
| Evidence Stack | v2, frozen at `9ae712ea…`, **unchanged for the whole run** |
| profile | generated once, `ff521bbfeb77989c242b30fb14eaf880c3dd006430f4a07af62e541244c6672b`, frozen before any held-out session was read |
| generator | `claude-opus-5`, fresh context, 50 tool calls, transcript audit **CLEAN** — 0 paths outside the pack, 0 network |
| sessions | discovery (30 events / 82 s), held-out search (35 / 71 s), held-out controls (35 / 120 s) |
| engine changes for wizmap | **none** |

## 1. What the profile is

2 surfaces, 26 controls, 8 channels, 1 key set, 24 rules, 1 fallback. 78 KB.
Validated clean on the first attempt; 16 warnings, all of them the validator
saying "this anchor is positional" or "no channel carries the person's words".

It identifies wizmap correctly and in the software's own vocabulary: an embedding
map with a Contour / Point / Grid / Label / Time control bar, a search-as-you-type
panel, zoom and reset buttons, a dataset chooser, a time slider with play/pause,
a point-detail window and two tooltips. Rule names are wizmap's names —
`TOGGLE_MAP_LAYER`, `SCRUB_TIME_SLIDER`, `ADJUST_TOPIC_LABELS`, `INSPECT_POINT`.

It also, unprompted, worked out three things about the instrument that I had
recorded in `PREREGISTERED.md` before it ran and did not tell it:

- that pan, wheel-zoom, drag and hover leave no trace, and that the whole
  interaction grammar of the artifact is therefore invisible (my C3);
- that the collector silently drops some classes and keeps others, demonstrated
  on eight examples, "my best guess is … but it is a guess" (my C1);
- that the DOM survey never reaches the control bar, the search panel or the
  footer in any of its four states (my C4).

It then built around all three: every class anchor is an `any` with a second
route, and the key inference — that `layoutTopicLabels()` rewrites `g.topics`
SVG text on every zoom event, so "topic labels were rewritten and nothing was
clicked" is a legible fingerprint of moving around the map — is a genuine piece
of artifact understanding derived from source, with the six call sites
enumerated and five of them excluded by rule ordering.

**Artifact understanding: strong.** This is the part of the experiment that
worked.

## 2. Discovery fit, held-out fit

Acts and appearances the profile had a name for:

| session | acts named | text named | episodes | fallback |
|---|---|---|---|---|
| discovery (in-sample) | 6/10 | 6/7 | 1 | 0 |
| search (held-out) | 13/16 | 9/10 | 1 | 0 |
| controls (held-out) | 9/14 | 1/7 | 3 | 0 |
| **total** | **28/40 (70%)** | **16/24 (67%)** | **5** | **0** |

The fallback never fired. Every episode was named by a rule, and three of the
four rules that fired fired for the first time in a session the generator never
saw (`search-embedding`, `adjust-topic-labels`, `nothing-recorded`).

Only **4 of 24 rules ever fired**, and that number is almost entirely an artefact
of §5 below rather than a judgement on the rules: with five episodes in total
there are only five chances for a rule to fire.

## 3. Anchor survival

| profile | rung 1 | 2 | 3 | 4 | 5 | 6 | positional |
|---|---|---|---|---|---|---|---|
| Run 2 — wizmap · 34 anchors | 3 | 0 | 3 | 7 | 7 | 14 | 14/34 (41%) |
| Run 1 — ROPE · 19 anchors | 2 | 1 | 2 | 11 | 0 | 3 | 3/19 (16%) |

The anchors are much weaker than Run 1's, and this is a property of the artifact,
not of the generator: wizmap has **no test attribute of any kind, no application
`data-…-id`, no `aria-label`, no `title` on anything interactive, and exactly one
`role`** (`tooltip`, on two hidden divs). Eight `id`s in the whole
document — five of them on something a person can use — and a set of class names
are the whole vocabulary, and the class filter throws away 49 of the 129 class
names (C1).

The 41% figure also flatters the problem in one direction and understates the
profile in another. Twelve of the fourteen "positional" anchors are not positions at
all: they are `selector contains "#icon-home"`, reaching for one of the seventeen
stable `id`s wizmap puts on its inlined SVG icons. That is a *stable* identifier
being addressed through the only field that can see it, because the anchor
language has no form for "an element with this id is inside it". It is counted as
rung 6 because it is written as a selector, and it fails at runtime for a
different reason (C-b), but it is not the generator reaching for `nth-of-type`.

| verdict | n |
|---|---|
| survived every held-out session | 1 |
| survived where the behaviour recurred | 3 |
| first fired in a held-out session | 7 |
| never testable — nothing matched it anywhere | 23 |

Most of the 23 are simply untested: `time-play-pause`, `create-embedding`,
`search-show-more` and the rest describe things nobody did in 4½ minutes of
recording. Four of them are real failures and are analysed in §6.

## 4. Blind supportability

Five episodes, each judged alone by a fresh model against the raw events only —
never the profile, never the artifact's name, never a neighbouring episode.

| question | result |
|---|---|
| behaviour supported | yes 2 · partly 3 · **no 0** |
| asserts intent, belief or understanding | **0/5** |
| claims canvas contents or in-memory state | 3/5 |
| broad class defensible | 4/5 (once: ACTING should have been EXPLORING) |
| description accurate | yes 1 · partly 4 · **no 0** |
| confidence deserved (all five stated `high`) | high 2 · medium 1 · **low 2** |
| ignores observable activity it should not have | **4/5** |

Nothing was judged unsupported and nothing was judged mind-reading. The two
weaknesses are both real:

- **Overconfidence.** Three of five claims deserved less than the `high` they
  stated. In every case the cause is the same: the episode covered far more than
  the claim described.
- **Ignored activity, 4/5.** "the claim ignores the four zoom-control clicks that
  dominate this stretch"; "the bulk of the stretch is zoom-plus, zoom-minus and
  zoom-reset clicks (seven of them) … the claim ignores all of it".

Both are downstream of §5. The profile *has* rules for those zoom clicks
(`zoom-map`, `reset-map-view`); they never got a stretch to speak about.

## 5. Segmentation — the central finding

**The whole 82-second discovery session is one episode.** Ten clicks — zoom in,
zoom in, Point, Grid, Contour, zoom out, reset, zoom in, zoom in, reset — become
one row reading *"Switched layers of the embedding map on and off from its
control bar."* The held-out search session is likewise one episode; the held-out
controls session is three, and one of those three is the 53-second silence.

This was predicted before the profile existed (`PREREGISTERED.md`, S1) and the
prediction was exact. `windows()` cuts a stage at: a change of part role
(composing → sending → waiting), a change of model call, a change of surface, a
model call opening or closing, a submission, a silence ≥ 20 s, or a reload. On
wizmap:

| cut driver | available |
|---|---|
| surface changed | no — one document, one route, whole session |
| model call | no — the artifact makes none |
| part role changed | no — nothing is ever submitted |
| submission | no — there is no form |
| reload | no |
| silence ≥ 20 s | once, in `controls` |

Measured directly: `parts()` returns 1, 1, 2 and `windows()` returns 1, 1, 3.

And the one lever a taxonomy has over segmentation does nothing here. The
generator marked **15 of its 26 controls as `moment`** — a careful, well-argued
set, with the zoom buttons deliberately left out because six of them in 82 s
"would fill the timeline with one-second rows". Running `windows()` with those
15 moments and with none gives **identical output in all three sessions**:
`isMoment` is only consulted by `absorb()`, which decides whether an
already-cut short window survives. It cannot create a cut. On an artifact where
nothing else cuts, the taxonomy has no influence on segmentation at all.

No false merges of *unrelated* sessions and no false splits: there is nothing to
split. What there is, is one enormous useless episode per session — exactly the
failure mode the procedure named in advance.

## 6. Failure taxonomy — A, B or C

Twelve unnamed acts and eight unnamed appearances. Every one classified.

### C — runtime perception: the behaviour was meaningful, Engelbart did not capture enough

**C-a · Contour and Point are unnameable (5 acts).** `visibleText` stops at 240
characters and counts insignificant whitespace against that budget. The
control-bar buttons are a verbose inline SVG icon followed by
`<div class="name">Contour</div>`; Contour and Point reach their first text node
at walk position 20, Grid at 12. So `Grid` has `text` and `Contour`/`Point` do
not, silently. The label *does* survive on the `div.name` the pointer was over —
but `targetOf()` for a `ui.click` returns `d.control ?? d.target`, so the rule
only ever sees the `<button>`, and the surviving label is discarded before any
rule can read it. The generator's anchor was
`any: [text equals "Contour", selector contains "#icon-contour2"]` — both routes
correct, both defeated by the instrument.

**C-b · the reset and folder buttons are unnameable (4 acts).** wizmap gives the
home button and the folder button *identical* classes (`zoom-button zoom-button-reset`),
so the generator refused to name either by class and used the icon inside
instead — `selector contains "#icon-home"` versus `"#icon-folder"`. That is the
right call, and it cannot work: the icon is always a descendant of the control,
and `targetOf` collapses a click to the control. Noted honestly in NOTES.md as a
deliberate choice to fall through rather than risk naming a reset as "opened the
chooser". The fall-through it planned for never happened either, because the
clicks were swallowed into a larger episode.

**C-c · the footer's zoom readout is lost (6 appearances).** Its container is
`div.scale-legend`, and C1 drops `scale-legend` (`[-_][a-z0-9]{6,}$` matches
`-legend`), leaving only the Svelte scope hash. The `footer-status` channel
matches `footer` / `subset-count` / `total-count` and finds nothing.

  **And v2 already had the answer and threw it away.** The region evidence for
  that burst carries `within: [div.footer, …]` — `div.footer` is exactly what the
  channel matches. But `appearances()` uses `region.target` only and never looks
  at `within`. The "several candidate ancestors rather than only the LCA"
  improvement is recorded but not wired into the consumer. This is a generic,
  one-consumer-deep gap in Evidence Stack v2 and it is the single most
  actionable finding of Run 2.

**C-d · segmentation had nothing to cut with (the 4/5 ignored-activity flags,
the 3/5 overconfidence, 20 of 24 rules never exercised).** §5.

### B — profile / anchor: the understanding was right, the rule did not survive

**B-a · both surfaces are dead, every episode reads as role `other`.** The
generator wrote `match: { equals: "/" }`, having read in SCHEMA.md that the
collector keys a document by "its `?id=` or `?name=` query value … else its frame
name, else its position among its parent's iframes, **else its path**", and
having seen `frame.loaded` report `url: "/"`. But `surfaceKey()` returns the
literal `"top"` for *every* non-embedded depth-0 document, and the schema's own
gloss — *"`top` means a stretch that happened on no document at all"* — is
wrong, and wrong in exactly the way that misleads a single-document artifact.
Run 1 never exposed this because ROPE's surfaces are iframes with `?id=`.
This is a documentation defect in the profile language, generic, found by Run 2.

**B-b · the Label button's anchor is too strict (1 act).** `text equals "Label"`,
but the menu markup is nested inside the same `<button>`, so the collector
reports its text as `"Label Automatic Labeling High Density Region Number of
Labels 20"`. A `prefix` test would have worked. The generator wrote this rule
from source without ever seeing the button described, because the survey never
reached it (C4) and the discovery session never clicked it.

**B-c · two small channel gaps (2 appearances).** `span.count` ("63,213 Data
Points") is not in `footer-status`'s list, and nothing names the
`Number of Labels` readout. Ordinary incompleteness.

**B-d · clicks on a menu's own padding (2 acts).** Defensible: there is no
control there.

### A — artifact understanding: enough evidence, meaning misread

**None found.** Across 24 rules, 26 controls and 8 channels I cannot point at a
single place where the generator misunderstood what a part of wizmap is or does.
The one broad-class disagreement — the judge preferring EXPLORING to ACTING for a
stretch of repeated zoom cycling — is a boundary case the generator had already
identified and argued in NOTES.md ("a single isolated zoom click is 'switching
view'; six of them in a minute is exploring a map").

**A 0 · B 4 · C 4**, and the two B failures that matter both have a C root cause
(the schema documents the surface key wrongly; the survey never showed the Label
button).

## 7. The WebGL honesty test

What wizmap paints where:

| drawn in `<canvas>`, unobservable | written into the DOM, observable |
|---|---|
| the point cloud, the KDE contours, the topic grid, search highlights | the automatic topic labels (`<g class="topics">` SVG text) |
| which points or clusters are visible | the two tooltips' text |
| the current pan/zoom transform as such | the search result list and its counts |
| everything selected, hovered or highlighted | the footer's zoom readout and point counts |
| | every control's value: slider positions, checkbox states |

**No rule in the profile claims canvas contents.** No rule says which points are
visible, which cluster is on screen, what the map looks like, or what was
selected. Where the profile talks about the map it talks about the *SVG text that
was rewritten*, and it quotes it: "Panned or zoomed the embedding map over 51s,
redrawing its topic labels (…)". Its tooltip and search rules quote DOM text that
genuinely appeared. The generator's NOTES.md states the boundary explicitly
before using it.

Two phrasings sit on the line, and the blind judge flagged three of five claims
for it: *"Switched layers … **on and off**"* and *"Changed how many topic labels
the map **draws**"* both assert a resulting state rather than the act performed.
The act is observed; the state is inside the canvas. That is a real if minor
overreach — but it is overreach of one or two words in a sentence, not an
invented observation.

Would additional generic canvas instrumentation be required to do better? For
*what was on screen*, yes, and nothing short of reading the WebGL transform
would do. For *what the person did*, no: pointer, wheel and drag events are
ordinary DOM events that the collector simply does not listen for. That is a much
smaller and much more general gap than a canvas reader. **Neither was built.**

## 8. The timelines a researcher would see

### discovery (82 s, 30 events)

| at | for | what the person was doing | class | conf |
|---|---|---|---|---|
| 00:31 | 51s | Switched layers of the embedding map on and off from its control bar. | ACTING/TOGGLE_MAP_LAYER | high |

### search (71 s, 35 events)

| at | for | what the person was doing | class | conf |
|---|---|---|---|---|
| 00:22 | 50s | Searched the embedding, and the search panel's result list was rewritten. | EXPLORING/SEARCH_EMBEDDING | high |

### controls (120 s, 35 events)

| at | for | what the person was doing | class | conf |
|---|---|---|---|---|
| 00:22 | 19s | Changed how many automatic topic labels the embedding map draws, using the Number of Labels slider. | ACTING/ADJUST_TOPIC_LABELS | high |
| 00:41 | 53s | Nothing at all was recorded for 53s. | UNCLEAR/NOTHING_RECORDED | high |
| 01:34 | 26s | Switched layers of the embedding map on and off from its control bar. | ACTING/TOGGLE_MAP_LAYER | high |

A researcher reading these learns that the session was about the embedding map,
that one of them was a search session, and where the person walked away. They do
not learn the shape of the session. The timeline is **true and nearly useless**,
and it is the segmenter that makes it useless, not the profile.

## 9. Success criteria

| criterion | |
|---|---|
| the LLM independently derives a useful model of the artifact | **yes** — and independently rediscovered three instrument defects |
| anchors survive held-out reasonably | **partly** — 11/34 ever matched, and all 11 matched in at least one held-out session; 4 real anchor failures, all with a runtime root cause |
| the generic runtime needs no wizmap-specific branches | **yes** — zero lines changed |
| most Activity claims supported by raw evidence | **yes** — 0/5 unsupported, 0/5 mind-reading; 3/5 overconfident |
| unsupported state represented as uncertainty, not invented | **yes** — no canvas contents claimed anywhere; the fallback and two UNCLEAR rules exist and one fired |
| the timeline is useful enough to understand the session's shape | **no** |
| failures cleanly attributable to A / B / C | **yes** — A 0, B 4, C 4 |

## 10. Verdict

**Can the same generic Engelbart architecture that learned ROPE also learn and
truthfully interpret a fundamentally different, non-chat, spatial research
interface without artifact-specific engineering?**

**Learn: yes. Truthfully: yes. Usefully: not yet, and the reason is not the part
that was being tested.**

The blind generator, given nothing but an unmodified repository and one 82-second
recording, produced a correct and honest model of an interface with no test
attributes, no ARIA, no submissions, no model calls, one document, and a
WebGL-painted primary surface. It stayed inside what a recording can show, it
refused to claim what the canvas hid, it argued its own uncertainty in writing,
and it diagnosed three defects in the instrument watching it. Nothing in the
engine was changed for it. **Cross-artifact generalization of artifact
understanding is demonstrated.**

What Run 2 breaks is downstream of that. Engelbart's segmenter learned its shape
from turn-taking software: it cuts at submissions, model calls, document changes
and long silences, and a continuous spatial interface offers it none of those. So
a correct profile with fifteen carefully chosen moment controls produced
**one row for eighty-two seconds**, and every subsequent measurement — rule
coverage, confidence calibration, the judge's "ignores the activity that
dominates this stretch" — is a shadow of that one fact.

The three collector defects (C1's inverted class filter, C2's whitespace budget,
C-c's unconsulted `within` chain) are all generic, all one-line-ish, and all
found only because a second artifact was tried. That is the experiment working.

Run 2 is not a failure of cross-artifact generalization. It is a clean
localisation of where the architecture is still shaped like a chat.
