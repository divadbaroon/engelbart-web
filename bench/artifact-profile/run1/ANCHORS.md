# Anchor quality and survival

## Rung distribution — generated vs the hand-written manual profile

| | rung 1 | rung 2 | rung 3 | rung 4 | rung 5 | rung 6 | positional |
|---|---|---|---|---|---|---|---|
| generated (19 anchors) | 2 | 1 | 2 | 11 | 0 | 3 | 3/19 |
| manual (hand-written) (14 anchors) | 1 | 0 | 0 | 9 | 1 | 3 | 4/14 |

## Which generated anchors find anything, session by session

| anchor | rung | 87a7ceb0 (disc) | 0711358e | d41b33b2 | 3c9e1514 | survives held-out |
|---|---|---|---|---|---|---|
| control `chat-input` | 3 | 2 | 2 | 3 | 3 | yes |
| control `chat-submit` | 3 | 2 | — | — | — | no |
| control `action-generate-game` | 4 | — | — | — | — | no |
| control `action-next-step` | 4 | — | — | — | — | no |
| control `tab-my-canvas` | 4 | — | 1 | 2 | — | yes |
| control `tab-solution` | 4 | — | — | 2 | — | yes |
| control `replay-solution` | 4 | — | 3 | 3 | — | yes |
| control `game-canvas` | 1 | 4 | 6 | 7 | 1 | yes |
| control `reset` | 4 | — | — | 10 | — | yes |
| control `end` | 4 | — | — | 5 | — | yes |
| control `change-game` | 4 | — | — | — | — | no |
| control `add-game` | 4 | — | — | — | — | no |
| control `delete-game` | 4 | — | — | — | — | no |
| control `subject-id` | 2 | 1 | 1 | 1 | 2 | yes |
| control `login` | 4 | 1 | 1 | 1 | 2 | yes |
| channel `sandbox-error` | 1 | — | — | — | — | no |
| channel `learner-message` | 6 pos | 2 | 1 | 3 | 2 | yes |
| channel `chat` | 6 pos | 2 | 1 | 4 | 2 | yes |
| channel `requirement-doc` | 6 pos | — | — | — | — | no |

11/19 generated anchors match something in at least one held-out session (7/19 matched in the discovery session).

## Surfaces and rules, session by session

| | 87a7ceb0 | 0711358e | d41b33b2 | 3c9e1514 |
|---|---|---|---|---|
| surface `my-canvas` | — | — | — | — |
| surface `solution` | 3 | 5 | 8 | 1 |
| surface `solution-step` | — | — | — | — |
| surface `shell` | 11 | 6 | 16 | 8 |
| rule `login` | 1 | 1 | 1 | 1 |
| rule `chat-submit` | 4 | 1 | 3 | 2 |
| rule `generate-game` | — | — | — | — |
| rule `next-step` | — | — | — | — |
| rule `reset` | — | — | 3 | — |
| rule `end` | — | — | — | — |
| rule `awaiting` | 2 | 1 | 3 | 2 |
| rule `solution-interaction` | 2 | 4 | 3 | 1 |
| rule `my-canvas-interaction` | — | — | — | — |
| rule `writing-requirements` | 2 | 1 | 3 | 2 |
| rule `requirement-doc-filled` | — | — | — | — |
| rule `tutorial-complete` | — | — | — | — |
| rule `tutor-feedback` | — | — | — | — |
| rule `sandbox-error` | — | — | — | — |
| rule `change-game` | — | — | — | — |
| rule `replay-solution` | — | 2 | 1 | — |
| rule `tab-switch` | — | — | — | — |
| rule `page-reload` | — | — | — | — |
| rule `no-activity` | 3 | 1 | 5 | — |
| **fallback** | — | — | 2 | 1 |

8/19 rules fire at least once across the four sessions.
