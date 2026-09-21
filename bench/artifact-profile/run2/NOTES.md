# Notes on the WizMap profile

## What the software is

The repository calls itself **WizMap** (`index.html` title, `README.md`, the icon, the footer).
It is a browser tool for **exploring large machine-learning embeddings**: you give it two
pre-computed JSON files — a `data`/`umap` NDJSON of projected points and a `grid` JSON of
density and topic summaries — and it draws them as a zoomable map. The README describes "a
novel multi-resolution embedding summarization method and a familiar map-like interaction
design". It is the ACL'23 system-demo tool by Wang, Hohman and Chau (arXiv 2306.09328).

Structurally it is **one document** (`App.svelte` renders exactly one `<MapView />`; there is
no routing). Inside that document:

- **The embedding map** (`src/components/embedding/`). Five `<canvas>` layers — the WebGL
  scatter plot, its colour-picking back buffer, the search-result points and two topic-grid
  layers — under two `<svg>` layers holding the KDE contours and the automatic topic labels.
  Panned and zoomed with `d3.zoom`; hovering a point highlights it and shows its text.
- **A top control bar** with five items: `Contour`, `Point`, `Grid`, `Label`, `Time`. The
  first three switch map layers; `Label` opens a menu with a *High Density Region* checkbox
  and a *Number of Labels* slider; `Time` switches on `timeInspectMode` and opens a time
  slider with a play/pause button that animates the embedding over time.
- **A search panel** down the left: one text box that queries the embedding **as you type**
  (there is no submit) and a result list capped at 5 000 (`config.layout.searchLimit`).
- **A footer** bottom-right: a folder button that opens the *Choose an Embedding* dialog, a
  home button that resets the view, `+`/`−` zoom buttons, and a status strip with the
  embedding's name, the data-point count and a scale legend.
- **A draggable point-detail window** ("Point &lt;id&gt;") that opens when you click a
  highlighted point, and **two tooltips** (`#popper-tooltip-top` for a point, `#popper-tooltip-bottom`
  for a grid tile).

The recording in the pack (`wizmap-discovery`, 82 s, 30 rows) is someone loading the bundled
ACL-abstracts embedding, sitting still for 31 s, then zooming in twice, toggling Point, Grid
and Contour, zooming out, resetting the view, zooming in twice more and resetting again.
Nothing was typed, nothing was searched, no point was opened.

## The single most important thing about recording this artifact

**WizMap's main interactions are unrecordable.** Pan, zoom-by-wheel, drag and hover are the
whole point of a map, and `00-how-the-recording-works.md` says none of them leave a trace.
Neither does anything inside a canvas, which is where the points, the grid and the search
highlights are actually drawn.

What saved the profile is that WizMap re-renders **SVG text** when the view moves.
`layoutTopicLabels()` rewrites `g.topics` on every zoom event and at the end of every zoom
gesture, and in this recording that shows up as bursts of 400–1 800 mutations whose region is
`<g class="topics">`. So the `topic-labels` channel plus "no click, key press or text entry"
is a reliable fingerprint of somebody moving around the map. `layoutTopicLabels` has exactly
six call sites (`Embedding.ts:691, 1012, 1057, 1401, 1493`; `EmbeddingLabel.ts:1032`): the
first data load, `zoomed()`, `zoomEnded()`, a group contour checkbox, the label checkbox and
the label-number slider. The load is excluded by the `index == 0` rule sitting above; the
three controls are excluded both by their own higher-priority rules and by the zero-acts
requirement. There is **no resize handler anywhere in the source**, so a window resize does
not redraw them either. That is why `NAVIGATE_MAP` is asserted at `medium` rather than left
UNCLEAR — the evidence really does admit few other readings.

The same trick gives three more rules: the two tooltips write text into the DOM when you
hover (`HOVER_POINT`, `HOVER_TOPIC_TILE`), and the time slider writes its formatted time into
`.thumb-label-span` on every step of a drag *or* of the animation (`TIME_SLIDER_MOVED`).

## A property of the collector you should know before trusting any `classes` anchor

The collector **does not report every class an element has**, and I could not work out its
rule. Demonstrated in the pack:

| element (from `02-raw-dom.md`) | classes the collector reported |
|---|---|
| `button.zoom-button.zoom-button-plus.s-JG…` | `["zoom-button-plus","s-JG…"]` — `zoom-button` dropped |
| `button.item-wrapper.s-ov…` (control bar) | `["s-ov…"]` — `item-wrapper` dropped (trace seq 12, 14, 15) |
| `div.grab-blocker.s-ov…` | `["s-ov…"]` (survey ord 12) |
| `div.scale-legend.s-JG…` | `["s-JG…"]` (trace seq 29) |
| `svg.top-svg.s-ov…` | `["s-ov…"]` (survey ord 14) |
| `canvas.embedding-canvas.s-ov….faded` | `["s-ov…","faded"]` — `embedding-canvas` dropped |
| `canvas.embedding-canvas-back.s-ov…` | `["embedding-canvas-back","s-ov…"]` — kept |

My best guess is that it drops class tokens whose **last hyphen-separated component** is a
generic structural or state word (`wrapper`, `container`, `blocker`, `canvas`, `button`,
`svg`, `legend`, `hidden`, `top`), which fits every row above — but it is a guess from eight
examples and I would not build on it. The practical consequence, and the reason several
anchors in the profile look redundant: **every class-based anchor is written as an `any` with
a second route** (the icon's `id` inside the generated selector, or the visible word). Class
names I have positively seen the collector report are `topics`, `topic-label`, `topic-tile`,
`label-group`, `mouse-track-rect`, `embedding`, `mapview-page`, `main-app`, `footer`, `count`,
`subset-count`, `item`, `name`, `control-bar`, `zoom-button-plus`, `zoom-button-minus`,
`zoom-button-reset`, `faded`. Everything else in the profile is an educated bet.

There is **no test id of any kind** in this interface, **no application `data-…-id`**, exactly
**one** `role` (`tooltip`, on the two popper divs) and **no ARIA labels**. So rungs 1 and 2 of
the anchor ladder are available only through the handful of real `id` attributes:
`search-bar-input`, `slider-label-num`, `checkbox-label`, `time-slider-middle-thumb`,
`dataset-dialog`, `popper-tooltip-top`, `popper-tooltip-bottom`, `app`, plus the `id`s on the
inlined SVG icon groups (`icon-plus`, `icon-minus`, `icon-home`, `icon-folder`, `icon-point`,
`icon-grid`, `icon-label3`, `icon-contour2`, `icon-time2`, `icon-play`, `icon-play-solid`,
`icon-pause-solid`, `icon-search`, `icon-cancel`, `icon-top`, `icon-file`, `icon-wizmap`).

The icon `id`s only ever appear on the `<g>` *inside* the button, and clicks land on the
`<path>` inside that — so they reach me only through the generated `selector`
(`"#icon-plus > path"`, trace seq 8). Those anchors are rung 6 and will warn. I used them
anyway because they are far more stable than what is above them here: they come from the
committed SVG files, not from layout. Where I used `selector`, it is always a `contains` on
an `#icon-…` fragment or on `result-list`, never a positional path like `div:nth-of-type(2)`.

Note the trap I avoided: `#icon-play` is a substring of `#icon-play-solid`, so the footer's
Video link and the time slider's play button would collide. The Video link is anchored on its
`href` instead.

## What I am confident about, and what I am not

**High confidence** (the control or the text is in the recording, or unambiguous in source):
the zoom buttons, the reset button, the three layer toggles, the Time and Label buttons, all
the id-bearing inputs, the dataset links, the topic-labels channel, the footer channel, the
two tooltip channels, and the ordering of the rules.

**Medium**: everything about the search panel, the point-detail window and the time slider,
none of which the session exercised. The behaviour is certain from source; what is uncertain
is whether the collector's region attribution will land on an element my channel anchors
reach.

**Known ambiguity I could not remove**: the folder button (open the embedding chooser) and the
home button (reset the view) carry **identical classes** — `zoom-button zoom-button-reset`
— and differ only in the icon inside them (`Footer.svelte`; trace seq 19 vs. the folder
button). I anchored both on the icon id, which means a click landing on a button's padding
rather than on its glyph matches **neither** control and falls through to the fallback. That
is the right trade: getting it wrong would name a reset as "opened the embedding chooser".

**Low**: `search-result` (a result row has no id, no role, and its only distinctive class,
`clamp-line`, disappears once the row has been expanded). I wrote it anyway because otherwise
expanding a result is invisible, but it is the weakest thing in the file.

## No `from: "person"` channel exists, and I did not fake one

Nothing a person writes in WizMap is ever echoed back as their own words. There are three
text fields: the search box and the two URL fields in the *Choose an Embedding* dialog. The
URL fields are never echoed — submitting them navigates. The search box *is* echoed, but only
by wrapping each query word in `<em>` **inside corpus text** (`SearchPanel.ts`, `formatResults`),
so the text that appears is the dataset's, not the person's. Declaring a person channel over
the result list would attribute 63 000 ACL abstracts to whoever ran the session. So the
`entered` flag will never be true for this artifact and nothing a person typed can ever be
quoted. That is a property of the software, not a gap in the profile.

Related: because the search runs on `input` and there is no form, `submitted` will never be
true either, and `composing` has no natural end — it is true from the moment focus lands in
the search box until it leaves. I therefore did **not** write any rule on `composing` alone;
`SEARCH_EMBEDDING` fires on an actual input event or on the result list changing.

## Rules I considered and did not write

- **"Waiting for the embedding to load."** WizMap fetches a 61 MB NDJSON in this session
  (seq 5) and the README advertises datasets of 1.8 M points, so real waiting happens. But
  `Pred` has no network predicate — `awaiting`/`call` are about *model* calls, and WizMap
  makes none — so I cannot tell a load from a person staring at the screen. The first stretch
  is therefore `MAP_VIEW_OPENED` / UNCLEAR, not WAITING.
- **"Hovered a topic tile"** keyed on the small tooltip bursts (seq 21–23). Those bursts have
  `added: []` and no region at all, so no channel can fire on them; they land in
  `INTERFACE_CHANGED_NO_INPUT` / UNCLEAR. I left it there rather than guess.
- **"Turned the Grid layer *on*"** and its siblings. The control-bar items are toggles, their
  state lives in a `class:activated` binding and in canvases, and the Grid click in the
  recording (seq 14) produced **no `ui.change` at all**. On and off are not distinguishable,
  so every layer rule says "switched … on or off".
- **"Read the search results" / "compared two points".** Reading is not in a recording.
- **Per-layer `sub` names** (`TOGGLE_CONTOUR`, `TOGGLE_POINT`, `TOGGLE_GRID`). First-match-wins
  would have named a stretch containing two toggles after only one of them. One
  `TOGGLE_MAP_LAYER` rule with a `cond` that falls back to the plural wording when two or more
  clicks are in the stretch is honest in both cases.
- **A surface for the Jupyter/Colab embedding.** `wizmap.visualize()` puts the app in an
  `<iframe srcdoc=…>` with `id="wizmap-iframe-<random>"` and no `name`, so the collector would
  key it by its position among its parent's iframes — a number I cannot predict. I added a
  `*wizmap*` glob surface, which covers the GitHub Pages deployment at `/wizmap/` but probably
  not the notebook. A notebook document will get role `other` and its raw key as a label.

## `moment` choices, and why

Marked as moments: the reset button (the schema names "resetting" explicitly), the layer
toggles and the group checkboxes, both label controls, the Time button (it switches
`timeInspectMode`, not just a menu), play/pause, the time-slider thumb, clearing the search,
the dataset links and Create, clicking the map, and following a link out.

Left as doors: both zoom buttons, the folder button, the Label button, the search box, the
result-list controls and both Close buttons. The zoom buttons were the hard call — they are
deeds, but they were pressed six times in 82 s in this one session, and marking them would
fill the timeline with one-second rows, which the schema warns against by name. Clicking the
**map** I did mark as a moment, on the opposite reasoning: in an interface driven by wheel and
drag, a click is rare and is almost always an attempt to open a data point.

## Things I wanted to say and the format would not let me

- **That two channels are the same element seen two ways.** Both tooltips write into a child
  `<span class="popper-content">`. If a change burst is attributed to that span rather than to
  the `id`-bearing div, a point tooltip and a topic tooltip become indistinguishable. I
  handled it with an ordered third channel (`map-tooltip`) and a matching low-priority rule,
  but the profile cannot say "these three are one thing at different resolutions".
- **Ancestry in an anchor.** There is no way to write "a `div.item` *inside the result list*".
  `Anchor` has no parent/descendant combinator, which is why `search-result` is weak and why
  the map control leans on `tag: canvas`.
- **"Exactly one control of this set was used."** `controlUsed` is a membership test; I
  approximated "only one thing was toggled" with a click count, which is not the same thing.
- **Negation inside a `StringTest`.** I wanted to split the two tooltips by the shape of their
  text — a topic name never contains a space, a point's text always does — but `ChannelSpec.text`
  takes a `StringTest`, which has no `not`.
- **That zoom is both ACTING and EXPLORING.** A single isolated zoom click is "switching view";
  six of them in a minute is exploring a map. The nine classes make me pick one per rule, and
  I picked EXPLORING for the repeated case, which is the common one.

## Things I looked for in the pack and could not find

- Any test-harness attribute, any `aria-label`, any `role` other than `tooltip`.
- The survey (`03-dom-survey.md`) never reaches the control bar, the search panel or the
  footer in any of its four states: the walk spends all 120 of its elements on topic labels
  and their `tspan`s. Everything I know about how those controls are *described* comes from
  the ten `ui.click` rows in the trace, not from the survey.
- The `public/data` directory (146 MB, not copied), so I never saw the shape of a real
  `grid.json` — the `jsonPoint`/`image`/`timeGrids` branches in `FloatingWindow.formatContent`
  and `drawContourTimeSlice` are read from source only.
- Any keyboard handling at all. `Escape` closing the native `<dialog>` is browser behaviour,
  not application code, which is why the one key set is marked `inference`.
- Any explanation for the collector's class-dropping, which is the one thing I would most like
  to have had documented.
