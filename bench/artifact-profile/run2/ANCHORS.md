# Anchor quality and survival — Run 2

## Rung distribution, beside Run 1's generated ROPE profile

An anchor's rung is how stable the thing it points at is: 1 is an identifier the
application chose, 6 is a position in the document. Lower is better. The Run 1
column is context, not a target — ROPE is a different interface.

| profile | rung 1 | 2 | 3 | 4 | 5 | 6 | positional |
|---|---|---|---|---|---|---|---|
| Run 2 — wizmap (generated) · 34 anchors | 3 | 0 | 3 | 7 | 7 | 14 | 14/34 (41%) |
| Run 1 — ROPE (generated) · 19 anchors | 2 | 1 | 2 | 11 | 0 | 3 | 3/19 (16%) |

## Every anchor, session by session

| anchor | rung | discovery | search | controls | verdict |
|---|---|---|---|---|---|
| control `zoom-in` | 6 pos | 4 | 2 | 1 | survived every held-out session |
| control `zoom-out` | 6 pos | 1 | — | 2 | survived where the behaviour recurred |
| control `zoom-reset` | 6 pos | — | — | — | never testable — nothing matched it anywhere |
| control `choose-embedding` | 6 pos | — | — | — | never testable — nothing matched it anywhere |
| control `dataset-link` | 4 | — | — | — | never testable — nothing matched it anywhere |
| control `own-embedding-url` | 3 | — | — | — | never testable — nothing matched it anywhere |
| control `create-embedding` | 4 | — | — | — | never testable — nothing matched it anywhere |
| control `close-dialog` | 4 | — | — | — | never testable — nothing matched it anywhere |
| control `contour-toggle` | 6 pos | — | — | — | never testable — nothing matched it anywhere |
| control `point-toggle` | 6 pos | — | — | — | never testable — nothing matched it anywhere |
| control `grid-toggle` | 6 pos | 1 | — | 1 | survived where the behaviour recurred |
| control `group-checkbox` | 3 | — | — | — | never testable — nothing matched it anywhere |
| control `label-menu` | 6 pos | — | — | — | never testable — nothing matched it anywhere |
| control `label-density-checkbox` | 4 | — | — | 1 | first fired in a held-out session |
| control `label-num-slider` | 4 | — | — | 1 | first fired in a held-out session |
| control `time-menu` | 6 pos | — | — | 1 | first fired in a held-out session |
| control `time-play-pause` | 6 pos | — | — | — | never testable — nothing matched it anywhere |
| control `time-slider-thumb` | 1 | — | — | — | never testable — nothing matched it anywhere |
| control `search-input` | 3 | — | 3 | — | first fired in a held-out session |
| control `search-clear` | 6 pos | — | — | — | never testable — nothing matched it anywhere |
| control `search-result` | 6 pos | — | — | — | never testable — nothing matched it anywhere |
| control `search-show-more` | 4 | — | — | — | never testable — nothing matched it anywhere |
| control `search-back-to-top` | 6 pos | — | — | — | never testable — nothing matched it anywhere |
| control `map` | 5 | — | — | — | never testable — nothing matched it anywhere |
| control `close-point-window` | 5 | — | — | — | never testable — nothing matched it anywhere |
| control `external-link` | 4 | — | — | — | never testable — nothing matched it anywhere |
| channel `topic-labels` | 5 | 6 | 3 | — | survived where the behaviour recurred |
| channel `point-tooltip` | 1 | — | 1 | — | first fired in a held-out session |
| channel `topic-tooltip` | 1 | — | — | 1 | first fired in a held-out session |
| channel `map-tooltip` | 5 | — | — | — | never testable — nothing matched it anywhere |
| channel `point-window` | 5 | — | — | — | never testable — nothing matched it anywhere |
| channel `search-results` | 6 pos | — | 5 | — | first fired in a held-out session |
| channel `time-slider` | 5 | — | — | — | never testable — nothing matched it anywhere |
| channel `footer-status` | 5 | — | — | — | never testable — nothing matched it anywhere |

- **23** — never testable — nothing matched it anywhere
- **7** — first fired in a held-out session
- **3** — survived where the behaviour recurred
- **1** — survived every held-out session

## Surfaces, rules and the fallback, session by session

| | discovery | search | controls | first fired |
|---|---|---|---|---|
| surface `map-view` | — | — | — | never |
| surface `map-view-hosted` | — | — | — | never |
| rule `map-view-opened` (p10) | — | — | — | never |
| rule `load-new-embedding` (p20) | — | — | — | never |
| rule `reload-map` (p30) | — | — | — | never |
| rule `inspect-point` (p40) | — | — | — | never |
| rule `search-embedding` (p50) | — | 1 | — | search |
| rule `play-time-slider` (p60) | — | — | — | never |
| rule `scrub-time-slider` (p70) | — | — | — | never |
| rule `adjust-topic-labels` (p80) | — | — | 1 | controls |
| rule `toggle-map-layer` (p90) | 1 | — | 1 | discovery |
| rule `zoom-map` (p100) | — | — | — | never |
| rule `reset-map-view` (p110) | — | — | — | never |
| rule `click-map` (p120) | — | — | — | never |
| rule `time-inspect-mode` (p130) | — | — | — | never |
| rule `open-label-menu` (p140) | — | — | — | never |
| rule `open-embedding-chooser` (p150) | — | — | — | never |
| rule `dismiss-overlay` (p160) | — | — | — | never |
| rule `follow-external-link` (p170) | — | — | — | never |
| rule `time-slider-moved` (p175) | — | — | — | never |
| rule `navigate-map` (p180) | — | — | — | never |
| rule `hover-point` (p190) | — | — | — | never |
| rule `hover-topic-tile` (p200) | — | — | — | never |
| rule `map-tooltip-shown` (p210) | — | — | — | never |
| rule `interface-changed-no-input` (p220) | — | — | — | never |
| rule `nothing-recorded` (p230) | — | — | 1 | controls |
| **fallback** `not-characterised` | — | — | — | never |

4/24 rules fire at least once across the three sessions.
3 rules fired for the first time in a session the generator never saw: `search-embedding`, `adjust-topic-labels`, `nothing-recorded`.

## What each session's fit report says

### discovery — DISCOVERY (in-sample)

```
1 episodes
documents no surface named: top (1)
text that arrived through no named channel: 1
dead here: surface map-view, surface map-view-hosted, control zoom-reset, control choose-embedding, control dataset-link, control own-embedding-url, control create-embedding, control close-dialog, control contour-toggle, control point-toggle, control group-checkbox, control label-menu, control label-density-checkbox, control label-num-slider, control time-menu, control time-play-pause, control time-slider-thumb, control search-input, control search-clear, control search-result, control search-show-more, control search-back-to-top, control map, control close-point-window, control external-link, channel point-tooltip, channel topic-tooltip, channel map-tooltip, channel point-window, channel search-results, channel time-slider, channel footer-status
rules that read nothing here: map-view-opened, load-new-embedding, reload-map, inspect-point, search-embedding, play-time-slider, scrub-time-slider, adjust-topic-labels, zoom-map, reset-map-view, click-map, time-inspect-mode, open-label-menu, open-embedding-chooser, dismiss-overlay, follow-external-link, time-slider-moved, navigate-map, hover-point, hover-topic-tile, map-tooltip-shown, interface-changed-no-input, nothing-recorded
```

### search — HELD-OUT 1 (search-led)

```
1 episodes
documents no surface named: top (1)
text that arrived through no named channel: 1
dead here: surface map-view, surface map-view-hosted, control zoom-out, control zoom-reset, control choose-embedding, control dataset-link, control own-embedding-url, control create-embedding, control close-dialog, control contour-toggle, control point-toggle, control grid-toggle, control group-checkbox, control label-menu, control label-density-checkbox, control label-num-slider, control time-menu, control time-play-pause, control time-slider-thumb, control search-clear, control search-result, control search-show-more, control search-back-to-top, control map, control close-point-window, control external-link, channel topic-tooltip, channel map-tooltip, channel point-window, channel time-slider, channel footer-status
rules that read nothing here: map-view-opened, load-new-embedding, reload-map, inspect-point, play-time-slider, scrub-time-slider, adjust-topic-labels, toggle-map-layer, zoom-map, reset-map-view, click-map, time-inspect-mode, open-label-menu, open-embedding-chooser, dismiss-overlay, follow-external-link, time-slider-moved, navigate-map, hover-point, hover-topic-tile, map-tooltip-shown, interface-changed-no-input, nothing-recorded
```

### controls — HELD-OUT 2 (controls + a long gap)

```
3 episodes
documents no surface named: top (3)
text that arrived through no named channel: 6
dead here: surface map-view, surface map-view-hosted, control zoom-reset, control choose-embedding, control dataset-link, control own-embedding-url, control create-embedding, control close-dialog, control contour-toggle, control point-toggle, control group-checkbox, control label-menu, control time-play-pause, control time-slider-thumb, control search-input, control search-clear, control search-result, control search-show-more, control search-back-to-top, control map, control close-point-window, control external-link, channel topic-labels, channel point-tooltip, channel map-tooltip, channel point-window, channel search-results, channel time-slider, channel footer-status
rules that read nothing here: map-view-opened, load-new-embedding, reload-map, inspect-point, search-embedding, play-time-slider, scrub-time-slider, zoom-map, reset-map-view, click-map, time-inspect-mode, open-label-menu, open-embedding-chooser, dismiss-overlay, follow-external-link, time-slider-moved, navigate-map, hover-point, hover-topic-tile, map-tooltip-shown, interface-changed-no-input
```

## Written down with nothing cited for it

| what | grounding | note |
|---|---|---|
| key set `dismiss` | inference | Inference, not source: the repository binds no keyboard handler anywhere, but a modal <dialog> is closed by Escape in the browser. WizMap has effectively no keyboard interface — Enter does not run the search, because the search runs on every input event. |
| rule `navigate-map` | abstraction | "NAVIGATE_MAP" is an abstraction: the source calls the pieces zoomed(), curZoomTransform and layoutTopicLabels, and the README calls the design "a familiar map-like interaction design", but it has no single word for moving around the map. Pan and zoom are not separable from the recording, so the name covers both. |
