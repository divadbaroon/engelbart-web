## discovery

| | Run 2, as frozen | A: same trace, Runtime v3 | Run 2B: fresh trace, Runtime v3 |
|---|---|---|---|
| events | 30 | 30 (same file) | 36 |
| moments (stages) | 1 | 1 | 1 |
| episodes | **1** | **8** | **8** |
| span | 01:22 | 01:22 | 01:23 |
| gesture events | 0 (unrecordable) | 0 (unrecordable) | 3 — 1 wheel, 2 drag |
| gesture acts counted | 0 | 0 | 6 |

**A — the very same Run 2 trace, re-read with Runtime v3 — 8 rows**

| at | for | class / sub | acts | evts | what it says |
|---|---|---|---|---|---|
| 00:31 | 9s | EXPLORING/ZOOM_MAP | 2 clicks | 4 | Zoomed the embedding map with its zoom buttons; it redrew its topic labels (“summarization-summaries- document-summary question-answer- answering-qa generation-text-…”). |
| 00:40 | 6s | ACTING/TOGGLE_MAP_LAYER | 1 clicks | 2 | Switched the point layer of the embedding map on or off. |
| 00:46 | 5s | ACTING/TOGGLE_MAP_LAYER | 1 clicks | 1 | Switched the topic grid layer of the embedding map on or off. |
| 00:51 | 4s | ACTING/TOGGLE_MAP_LAYER | 1 clicks | 1 | Switched the contour layer of the embedding map on or off. |
| 00:55 | 3s | EXPLORING/ZOOM_MAP | 1 clicks | 3 | Zoomed the embedding map with its zoom buttons. |
| 00:58 | 12s | ACTING/RESET_MAP_VIEW | 1 clicks | 5 | Reset the embedding map back to its default view. |
| 01:09 | 13s | EXPLORING/ZOOM_MAP | 2 clicks | 4 | Zoomed the embedding map with its zoom buttons; it redrew its topic labels (“summarization-document- summary-summaries sentiment-analysis- classification-opinion tran…”). |
| 01:22 | 0ms | ACTING/RESET_MAP_VIEW | 1 clicks | 2 | Reset the embedding map back to its default view. |

**Run 2B — a fresh recording made with Runtime v3 — 8 rows**

| at | for | class / sub | acts | evts | what it says |
|---|---|---|---|---|---|
| 00:25 | 16s | EXPLORING/ZOOM_MAP | 2 clicks, 5 gestures | 9 | Zoomed the embedding map with its zoom buttons; it redrew its topic labels (“summarization-summaries- document-summary question-answer- answering-qa generation-text-…”). |
| 00:41 | 6s | ACTING/TOGGLE_MAP_LAYER | 1 clicks | 2 | Switched the point layer of the embedding map on or off. |
| 00:47 | 5s | ACTING/TOGGLE_MAP_LAYER | 1 clicks | 1 | Switched the topic grid layer of the embedding map on or off. |
| 00:52 | 4s | ACTING/TOGGLE_MAP_LAYER | 1 clicks | 1 | Switched the contour layer of the embedding map on or off. |
| 00:56 | 3s | EXPLORING/ZOOM_MAP | 1 clicks | 3 | Zoomed the embedding map with its zoom buttons. |
| 00:59 | 4s | ACTING/RESET_MAP_VIEW | 1 clicks | 3 | Reset the embedding map back to its default view. |
| 01:03 | 21s | EXPLORING/ZOOM_MAP | 2 clicks, 1 gestures | 7 | Zoomed the embedding map with its zoom buttons; it redrew its topic labels (“summarization-document- summary-summaries sentiment-analysis- classification-opinion tran…”). |
| 01:23 | 0ms | ACTING/RESET_MAP_VIEW | 1 clicks | 2 | Reset the embedding map back to its default view. |

## search

| | Run 2, as frozen | A: same trace, Runtime v3 | Run 2B: fresh trace, Runtime v3 |
|---|---|---|---|
| events | 35 | 35 (same file) | 39 |
| moments (stages) | 1 | 1 | 1 |
| episodes | **1** | **4** | **4** |
| span | 01:11 | 01:11 | 01:12 |
| gesture events | 0 (unrecordable) | 0 (unrecordable) | 2 — 1 wheel, 1 drag |
| gesture acts counted | 0 | 0 | 5 |

**A — the very same Run 2 trace, re-read with Runtime v3 — 4 rows**

| at | for | class / sub | acts | evts | what it says |
|---|---|---|---|---|---|
| 00:22 | 42s | EXPLORING/SEARCH_EMBEDDING | 5 clicks, 45 typing | 22 | Searched the embedding, and the search panel's result list was rewritten. |
| 01:03 | 3s | ACTING/RESET_MAP_VIEW | 1 clicks | 2 | Reset the embedding map back to its default view. |
| 01:06 | 5s | ACTING/TOGGLE_MAP_LAYER | 1 clicks | 2 | Switched the point layer of the embedding map on or off. |
| 01:11 | 0ms | ACTING/TOGGLE_MAP_LAYER | 1 clicks | 1 | Switched the contour layer of the embedding map on or off. |

**Run 2B — a fresh recording made with Runtime v3 — 4 rows**

| at | for | class / sub | acts | evts | what it says |
|---|---|---|---|---|---|
| 00:22 | 41s | EXPLORING/SEARCH_EMBEDDING | 5 clicks, 45 typing, 5 gestures | 26 | Searched the embedding, and the search panel's result list was rewritten. |
| 01:04 | 3s | ACTING/RESET_MAP_VIEW | 1 clicks | 2 | Reset the embedding map back to its default view. |
| 01:07 | 5s | ACTING/TOGGLE_MAP_LAYER | 1 clicks | 2 | Switched the point layer of the embedding map on or off. |
| 01:12 | 0ms | ACTING/TOGGLE_MAP_LAYER | 1 clicks | 1 | Switched the contour layer of the embedding map on or off. |

## controls

| | Run 2, as frozen | A: same trace, Runtime v3 | Run 2B: fresh trace, Runtime v3 |
|---|---|---|---|
| events | 35 | 35 (same file) | 40 |
| moments (stages) | 2 | 2 | 2 |
| episodes | **3** | **9** | **9** |
| span | 02:00 | 02:00 | 02:01 |
| gesture events | 0 (unrecordable) | 0 (unrecordable) | 4 — 1 wheel, 3 drag |
| gesture acts counted | 0 | 0 | 7 |

**A — the very same Run 2 trace, re-read with Runtime v3 — 9 rows**

| at | for | class / sub | acts | evts | what it says |
|---|---|---|---|---|---|
| 00:22 | 4s | ACTING/TIME_INSPECT_MODE | 1 clicks | 2 | Switched the embedding map's time-inspect mode on or off from the Time control. |
| 00:26 | 12s | ORIENTING/OPEN_LABEL_MENU | 3 clicks | 7 | Opened the Label menu on the embedding map's control bar. |
| 00:38 | 4s | ACTING/ADJUST_TOPIC_LABELS | 1 clicks, 1 typing | 2 | Changed how many automatic topic labels the embedding map draws, using the Number of Labels slider. |
| 00:41 | 1ms | ACTING/ADJUST_TOPIC_LABELS | 1 clicks, 1 typing | 3 | Switched automatic high-density-region labelling of the embedding map on or off. |
| 00:41 | 53s | UNCLEAR/NOTHING_RECORDED | — | 0 | Nothing at all was recorded for 53s. |
| 01:34 | 9s | ACTING/TOGGLE_MAP_LAYER | 1 clicks | 2 | Switched the topic grid layer of the embedding map on or off. |
| 01:44 | 13s | EXPLORING/ZOOM_MAP | 3 clicks | 7 | Zoomed the embedding map with its zoom buttons. |
| 01:56 | 4s | ACTING/TOGGLE_MAP_LAYER | 1 clicks | 2 | Switched the contour layer of the embedding map on or off. |
| 02:00 | 0ms | ACTING/RESET_MAP_VIEW | 1 clicks | 2 | Reset the embedding map back to its default view. |

**Run 2B — a fresh recording made with Runtime v3 — 9 rows**

| at | for | class / sub | acts | evts | what it says |
|---|---|---|---|---|---|
| 00:22 | 3s | ACTING/TIME_INSPECT_MODE | 1 clicks | 2 | Switched the embedding map's time-inspect mode on or off from the Time control. |
| 00:25 | 13s | ORIENTING/OPEN_LABEL_MENU | 3 clicks, 2 gestures | 9 | Opened the Label menu on the embedding map's control bar. |
| 00:38 | 4s | ACTING/ADJUST_TOPIC_LABELS | 1 clicks, 1 typing | 2 | Changed how many automatic topic labels the embedding map draws, using the Number of Labels slider. |
| 00:41 | 0ms | ACTING/ADJUST_TOPIC_LABELS | 1 clicks, 1 typing | 3 | Switched automatic high-density-region labelling of the embedding map on or off. |
| 00:41 | 53s | UNCLEAR/NOTHING_RECORDED | — | 0 | Nothing at all was recorded for 53s. |
| 01:34 | 6s | ACTING/TOGGLE_MAP_LAYER | 1 clicks | 2 | Switched the topic grid layer of the embedding map on or off. |
| 01:40 | 17s | EXPLORING/ZOOM_MAP | 3 clicks, 5 gestures | 10 | Zoomed the embedding map with its zoom buttons. |
| 01:57 | 4s | ACTING/TOGGLE_MAP_LAYER | 1 clicks | 2 | Switched the contour layer of the embedding map on or off. |
| 02:01 | 0ms | ACTING/RESET_MAP_VIEW | 1 clicks | 2 | Reset the embedding map back to its default view. |

