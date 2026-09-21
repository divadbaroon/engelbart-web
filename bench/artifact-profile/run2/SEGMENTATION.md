# Segmentation, unturned — Run 2

The segmenter is the generic one. The only thing the taxonomy contributes to it
is `isMoment`, built from the `moment` flag on the profile's controls. Nothing
below was adjusted for this artifact.

## discovery — DISCOVERY (in-sample)

- 30 events, 1 moments, 1 episodes over 01:22
- episode length: shortest 51s, median 51s, longest 51s
- longest episode covers 62% of the session: "Switched layers of the embedding map on and off from its control bar." (ACTING/TOGGLE_MAP_LAYER, 22 events)
- sub-second episodes: 0
- episodes with nothing recorded in them: 0
- named by a rule: 1; left to whatever else: 0
- controls recognised across the session: zoom-in, grid-toggle, zoom-out
- consecutive episodes carrying the same controls: none — no two neighbours share a control set

## search — HELD-OUT 1 (search-led)

- 35 events, 1 moments, 1 episodes over 01:11
- episode length: shortest 50s, median 50s, longest 50s
- longest episode covers 69% of the session: "Searched the embedding, and the search panel's result list was rewritten." (EXPLORING/SEARCH_EMBEDDING, 27 events)
- sub-second episodes: 0
- episodes with nothing recorded in them: 0
- named by a rule: 1; left to whatever else: 0
- controls recognised across the session: search-input, zoom-in
- consecutive episodes carrying the same controls: none — no two neighbours share a control set

## controls — HELD-OUT 2 (controls + a long gap)

- 35 events, 2 moments, 3 episodes over 02:00
- episode length: shortest 19s, median 26s, longest 53s
- longest episode covers 44% of the session: "Nothing at all was recorded for 53s." (UNCLEAR/NOTHING_RECORDED, 0 events)
- sub-second episodes: 0
- episodes with nothing recorded in them: 1 — 00:41 for 53s
- named by a rule: 3; left to whatever else: 0
- controls recognised across the session: time-menu, label-num-slider, label-density-checkbox, grid-toggle, zoom-in, zoom-out
- consecutive episodes carrying the same controls: none — no two neighbours share a control set

