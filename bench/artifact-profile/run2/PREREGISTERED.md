# Run 2 — what was already true before the profile was generated

Written before the blind generator was run, and not changed afterwards. These are
properties of the generic Evidence Stack v2 observed on wizmap, found while
building the evidence pack. **None of them was fixed.** They are recorded here so
that when the profile fails, the failure can be attributed to layer C (runtime
perception) rather than to layer A (artifact understanding) on the strength of
evidence that predates the profile.

The instruction for this run is explicit: no further generic runtime changes
before the experiment unless wizmap literally cannot run or record. It runs, and
it records. So these stand as findings.

## Sessions recorded

```
discovery   30 events   82s  click 10, change 12
search      35 events   71s  click  8, change 11, input 8
controls    35 events  120s  click 12, change 13, input 2
```

All three are driver sessions: a script drove a headless browser through a
plausible use of the artifact with real waits between actions, including a 48 s
gap in `controls` to stand in for someone leaving the desk. They are not
recordings of a person. Run 1's four sessions were recordings of real use, so
this is a genuine weakening of Run 2 relative to Run 1 and is reported as such.

## C1 — the generated-class filter is inverted on this artifact

`usefulClasses` drops a class matching `GENERATED_CLASS`
(`sandbox/trace/bridge.js:120`). Over the 129 distinct classes wizmap uses, it
drops **49 and keeps 80**, and the split runs the wrong way:

dropped (all hand-written, all meaningful) — `zoom-button`, `zoom-control`,
`embedding-canvas`, `embedding-wrapper`, `search-point-canvas`, `item-wrapper`,
`play-pause-button`, `close-button`, `add-more-button`, `scroll-up-button`,
`search-panel-wrapper`, `search-list-container`, `slider-container`,
`floating-window`, `footer-container`, `back-slider`, `grab-blocker`,
`popper-tooltip`, `scale-legend`, `direction-indicator`, and 29 more.

kept — `s-H0d2FahnGNOH`, `s-JGw2lZm6jsjW`, `s-_i_Kb1cILe8P`, `s-n1WHAIkRHwGF`,
`s-ovhWPbaoO3ET`. Those five are Svelte's compiled scope hashes: the only classes
in the entire interface that are genuinely generated and genuinely unstable.

The clause that does it is `[-_][a-z0-9]{6,}$` — "ends in a separator followed by
six or more lowercase alphanumerics" — which is an ordinary two-word kebab-case
name (`zoom-` + `button`) at least as often as it is a hash. The scope hashes
escape both that clause and `^[a-zA-Z]{1,2}[-_][a-z0-9]{5,}$` because their tails
contain capitals.

Consequence for the profile: rung-5 class anchors are available for
`zoom-button-plus`, `zoom-button-minus` and `zoom-button-reset` (their last
segment is short enough to survive) but not for the container `zoom-button`, and
not for `item-wrapper`, which is the class on all five control-bar buttons. It
did not bite in Run 1 because ROPE's classes are Tailwind utilities, which the
separate `UTILITY_CLASS` filter removes first, and its own names are short.

## C2 — an element's own label is lost when a verbose icon precedes it

`visibleText` walks text nodes and stops at `out.length > max * 3`, i.e. 240
characters (`sandbox/trace/bridge.js`, `visibleText`). Insignificant whitespace
between elements counts against that budget. wizmap's control-bar buttons are an
inline SVG icon followed by `<div class="name">Contour</div>`; the pretty-printed
SVG contributes about twenty whitespace-only text nodes before the label is
reached.

Measured on the five control-bar buttons, walking the collector's own algorithm:

| button | textContent | what the collector reports |
|---|---|---|
| Contour | `Contour` | *(no text)* |
| Point | `Point` | *(no text)* |
| Grid | `Grid` | `Grid` |
| Label | `Label Automatic Labeling …` | `Label Automatic Labeling High Density Region Number of Labels 20` |
| Time | `Time 1980…2020` | `Time` |

Contour and Point reach their first text node at walk position 20; Grid, Label
and Time at 12 or 13. The threshold falls between them.

This is generic and it is silent: a missing `text` field is indistinguishable
from an element that has no text. Any interface that puts an inline SVG icon
before a label — a very common pattern — can lose the label for some buttons and
keep it for others, with no indication that anything was dropped.

The label survives one level down: a click on `div.name` records the `div` as
`target` with `text: "Contour"`, and the `<button>` as `control` with no text. So
the three control-bar buttons are distinguishable in this recording, but only
through the element that happened to be under the pointer.

## C3 — the artifact's primary interaction leaves no trace at all

wizmap is driven by dragging and wheeling over a canvas. The collector records no
pointer movement, no drag, no wheel, no scroll and no hover, for any artifact.
An entire minute of panning and zooming across an embedding produces **zero
events**. This is stated plainly in the evidence pack
(`00-how-the-recording-works.md`) so the generator cannot be blamed for not
knowing it.

What is observable instead: the zoom *buttons* are clicks, and the repaint they
cause produces useful v2 region evidence — `<g class="topics">` inside
`<svg>` inside `<div class="embedding">`, with the new topic labels as its added
text — plus the footer's zoom readout changing. So a zoom performed with a button
is legible and the same zoom performed with the wheel is invisible. Any rule
about "moving around the map" will therefore be right about one and silent about
the other.

## C4 — the collector's survey never reaches this interface's controls

`surveyCandidates` stops after 120 elements (`SURVEY_MAX`,
`sandbox/trace/bridge.js:1149`), in document order. wizmap's first descendants
are the generated SVG topic-label layer. All four surveys spend their budget like
this:

```
div×13  svg×1  rect×21  g×22  text×20  tspan×40  canvas×3
```

103 of 120 slots go to the label layer. The walk never reaches the control bar,
the search panel, the zoom buttons or the footer — so `#search-bar-input`,
`#checkbox-label` and `#slider-label-num`, the three stable ids in the interface
that a rule would most want, appear in **no** survey, including the one taken
with search results on screen. The only ids the survey ever reports are `#app`
and the two popper tooltips.

The evidence pack therefore also contains `02-raw-dom.md`, the document straight
from the browser with no collector in the way, so that the generator's
understanding of the interface is not capped at 120 elements. That keeps layer A
separable from layer C: the generator has the information, and whether the
runtime would record it is a different question.

## What is anchorable at all

From the raw DOM, before any profile exists:

- rung 1 — `#search-bar-input`, `#checkbox-label`, `#slider-label-num`,
  `#time-slider-middle-thumb`, `#dataset-dialog`, `#app`
- rung 4 — link and button text: "ACL Abstracts", "Paper", "Code", "Video",
  "Back to top", "Show More", "Create", "Close", "(what is this?)", and the
  control-bar labels where C2 lets them through
- rung 5 — `.zoom-button-plus`, `.zoom-button-minus`, `.zoom-button-reset`,
  `.control-bar`, `.search-bar`, `.result-list`, `.count-label`, `.embedding`,
  `.embedding-svg`, `.topics`, `.topic-label`, `.label-menu`, `.time-menu`,
  `.slider`, `.checkbox`, `.middle-thumb`, `.footer`, `.total-count`,
  `.subset-count`
- not available at all — no `data-testid` or any other test attribute, no
  application `data-…-id`, no `aria-label`, no `title` on anything interactive,
  no `role` except `tooltip` on two hidden divs. The interface has exactly one
  surface: one document, at one route, for the whole session.

The conservative value test on `appId` fired correctly on real input: the only
`data-…-id` in the document is `data-vite-dev-id` on the dev server's injected
`<style>` tags, whose value is an absolute file path, and it was rejected on the
shape of its value rather than by a name list.

## S1 — what can cut this session at all (structural, recorded before the profile existed)

A prediction, not a defect, written down so the segmentation result cannot be
read back into it afterwards.

`traceStages` groups the three recordings into **1, 1 and 2 moments** respectively.
Everything after that is `windows()` in `lib/activity/segment.ts`, which cuts a
stage at: a change of part role (composing / sending / waiting), a change of
model call, a change of surface, a model call opening or closing, a submission,
a silence of at least `gapMs` (20 s), or a reload.

On wizmap:

| cut driver | available here? |
|---|---|
| surface changed | no — one document, one route, for the whole session |
| model call opened or closed | no — the artifact makes no model calls |
| part role changed (composing → sending → waiting) | no — nothing is ever submitted |
| something was submitted | no — there is no form and no submit |
| reload | no |
| silence ≥ 20 s | yes — once, the 48 s gap in `controls` |

So the only structural cut available in two of the three sessions is the 20 s
gap, and the discovery session contains none. Everything else depends on
`minEpisodeMs` (2.5 s) and on `isMoment`, which is built entirely from the
`moment` flag the profile puts on its controls (`classify.ts:167-168`). That flag
decides only whether a short window survives as its own episode or is absorbed
into the next one as a transition.

The prediction is therefore: **on this artifact the profile's `moment` flags are
the segmentation.** If the generator marks no control as a moment, these sessions
should read as one or two very long episodes each; if it marks the view-mode and
zoom controls, they should read as a run of short deeds separated by the pauses
between them. Either outcome is a finding about the generic architecture meeting
a continuous-interaction artifact, and neither will be tuned.
