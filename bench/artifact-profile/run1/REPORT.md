# The generated profile

## Validation

```
! channels[2].container — this channel is identified only by where it sat on the page, which stops being true when the layout moves [anchor.positional]
! channels[3].container — this channel is identified only by where it sat on the page, which stops being true when the layout moves [anchor.positional]
! channels[4].container — this channel is identified only by where it sat on the page, which stops being true when the layout moves [anchor.positional]
✗ fallback.id — the fallback needs an id [rule.id]
```

## Anchor quality

```
generated  rung 1: 2  ·  rung 2: 1  ·  rung 3: 2  ·  rung 4: 11  ·  rung 5: 0  ·  rung 6: 3   positional: 3/19
```


---

# 87a7ceb0 — DISCOVERY (in-sample)

525 events · handwritten reads 13 stretches · profile reads 14

## Fit of the profile against this session

```
ROPE Training System · 14 episodes

surfaces
     —  my-canvas        never matched
     3  solution         solution
     —  solution-step    never matched
    11  shell            /

controls                      acts  episodes  anchor
  chat-input                  2         2  rung 3
  chat-submit                 2         2  rung 3
  action-generate-game        —         —  rung 4
  action-next-step            —         —  rung 4
  tab-my-canvas               —         —  rung 4
  tab-solution                —         —  rung 4
  replay-solution             —         —  rung 4
  game-canvas                 4         1  rung 1
  reset                       —         —  rung 4
  end                         —         —  rung 4
  change-game                 —         —  rung 4
  add-game                    —         —  rung 4
  delete-game                 —         —  rung 4
  subject-id                  1         1  rung 2
  login                       1         1  rung 4

channels                      text  anchor
  tutorial-complete           —  rung 4
  sandbox-error               —  rung 1
  learner-message             2  rung 6 · positional
  chat                        2  rung 6 · positional
  requirement-doc             —  rung 6 · positional
  (no channel)                2

rules                            read
    10 login                           1  ACTING
    20 chat-submit                     4  ACTING
    30 generate-game                   —  ACTING
    40 next-step                       —  ACTING
    50 reset                           —  ACTING
    60 end                             —  ACTING
    70 awaiting                        2  WAITING
    80 solution-interaction            2  EXPLORING
    90 my-canvas-interaction           —  EVALUATING
   100 writing-requirements            2  FORMULATING
   108 requirement-doc-filled          —  UNDERSTANDING
   110 tutorial-complete               —  UNDERSTANDING
   120 tutor-feedback                  —  UNDERSTANDING
   125 sandbox-error                   —  UNCLEAR
   130 change-game                     —  ACTING
   135 replay-solution                 —  ACTING
   140 tab-switch                      —  ACTING
   142 page-reload                     —  UNCLEAR
   145 no-activity                     3  UNCLEAR
     — undefined (fallback)            —

dead — nothing in this session matched them
  surface my-canvas — My canvas
  surface solution-step — the Solution game for the open step
  control action-generate-game — the Generate Game action
  control action-next-step — the Next Step action
  control tab-my-canvas — the My canvas tab
  control tab-solution — the Solution tab
  control replay-solution — the Replay button
  control reset — the Reset button
  control end — the End button
  control change-game — the Change Game button
  control add-game — the Add Game button
  control delete-game — the Delete Game button
  channel tutorial-complete — the completion message
  channel sandbox-error — the sandbox error
  channel requirement-doc — the requirement document

silent — never read a stretch
  generate-game (GENERATE_GAME)
  next-step (NEXT_STEP)
  reset (RESET)
  end (END)
  my-canvas-interaction (MY_CANVAS_INTERACTION)
  requirement-doc-filled (REQUIREMENT_DOC_UPDATED)
  tutorial-complete (TUTORIAL_COMPLETE)
  tutor-feedback (TA_FEEDBACK)
  sandbox-error (SANDBOX_ERROR)
  change-game (CHANGE_GAME)
  replay-solution (REPLAY_SOLUTION)
  tab-switch (CANVAS_TAB_SWITCH)
  page-reload (PAGE_RELOAD)

not read off the artifact
  channel learner-message — abstraction: The learner's and the tutor's words sit in the same list, distinguished in the DOM only by a utility class (flex-row vs flex-row-reverse) that the collector does not report, so this channel rests on a generated CSS path and on the one-level-up container that a send produces. I looked for a test id, an id, a role and an aria label on the message bubbles and found none. Trust it only where a send is independently recorded.
```

## Tier A — same windows, different reading

| # | at | handwritten | generated |
|---|---|---|---|
| 0 | 0s | **FORMULATING** FORMULATE_RESPONSE<br>Worked on a message to the tutor. | **FORMULATING** WRITING_REQUIREMENTS<br>Wrote in the chat box for 2s without sending.<br>*medium · the stretch was spent at the chat text area with nothing sent* |
| 1 | 2s | **ACTING** SUBMIT_RESPONSE<br>Sent the tutor a message: “help”. | **ACTING** CHAT_SUBMIT<br>Sent “help” to the chat.<br>*high · a submit was recorded on the chat form* |
| 2 | 3s | **WAITING** WAIT_FOR_TUTOR_RESPONSE<br>Waited for the tutor, which answered: “You've made great progress!”. | **WAITING** AWAITING_FEEDBACK<br>Waited 6s with a model call open.<br>*high · a model call was open across this stretch and no send was recorded in it* |
| 3 | 8s | **UNCLEAR** NO_RECORDED_ACTIVITY<br>Nothing was recorded for 23s. | **UNCLEAR** NO_ACTIVITY<br>Nothing was recorded for 23s.<br>*high · no act and no change on screen were recorded in this stretch* |
| 4 | 31s | **EXPLORING** EXPERIMENT_WITH_REFERENCE<br>Played the reference game. | **EXPLORING** SOLUTION_GAME_INTERACTION<br>Pressed keys on the Solution game (32 key presses).<br>*high · the arrow keys were pressed inside the Solution sandbox* |
| 5 | 62s | **UNCLEAR** NO_RECORDED_ACTIVITY<br>Nothing was recorded for 2m 2s. | **UNCLEAR** NO_ACTIVITY<br>Nothing was recorded for 2m 2s.<br>*high · no act and no change on screen were recorded in this stretch* |
| 6 | 184s | **ORIENTING** RESUME_SESSION<br>Signed back in after the page was replaced. | **ACTING** ⚠ SUBJECT_LOGIN<br>Signed in with a Subject ID.<br>*high · the Subject ID field was used and the login button was clicked* |
| 7 | 186s | **UNCLEAR** NO_RECORDED_ACTIVITY<br>Nothing was recorded for 16s. | **UNCLEAR** NO_ACTIVITY<br>Nothing was recorded for 16s.<br>*high · no act and no change on screen were recorded in this stretch* |
| 8 | 202s | **EXPLORING** EXPERIMENT_WITH_REFERENCE<br>Played the reference game. | **EXPLORING** SOLUTION_GAME_INTERACTION<br>Clicked and pressed keys on the Solution game (1 click, 6 key presses).<br>*high · the arrow keys were pressed inside the Solution sandbox* |
| 9 | 206s | **ACTING** SUBMIT_RESPONSE<br>Submitted the response. | **ACTING** CHAT_SUBMIT<br>Sent a message to the chat.<br>*high · a submit was recorded on the chat form* |
| 10 | 208s | **FORMULATING** FORMULATE_AFTER_REFERENCE<br>Worked on the next message, having just been in the reference game. | **FORMULATING** WRITING_REQUIREMENTS<br>Wrote in the chat box for 1s without sending.<br>*medium · the stretch was spent at the chat text area with nothing sent* |
| 11 | 209s | **ACTING** SUBMIT_RESPONSE<br>Sent the tutor a message: “help”. | **ACTING** CHAT_SUBMIT<br>Sent “help” to the chat.<br>*high · a submit was recorded on the chat form* |
| 12 | 209s | **WAITING** WAIT_FOR_TUTOR_RESPONSE<br>Waited for the tutor, which answered: “Great, let's start with what you've done so…”. | **WAITING** AWAITING_FEEDBACK<br>Waited 3s with a model call open.<br>*high · a model call was open across this stretch and no send was recorded in it* |

### Metrics (Tier A)

| | handwritten | generated |
|---|---|---|
| stretches | 13 | 13 |
| non-fallback coverage | 100% | 100% |
| UNCLEAR rate | 23% | 23% |
| broad-class agreement | — | **92%** (12/13) |
| confidently wrong | — | **8%** (1/13) |
| surface role agreement | — | 100% (13/13) |
| texts given a channel | 5/6 | 4/6 |
| ...both, same person/system side | — | 4/4 of texts both named |
| acts matched to a control | 7/13 | 10/13 |
| ...both matched something | — | 7/13 |

### Confidently wrong (Tier A)

- **184s** handwritten says `ORIENTING/RESUME_SESSION`; profile says `ACTING/SUBJECT_LOGIN` at high confidence — "Signed in with a Subject ID." (the Subject ID field was used and the login button was clicked)

## Tier B — each cuts the session itself

handwritten: **13** stretches · profile: **14** stretches

| handwritten | profile |
|---|---|
| 0s **FORMULATING** FORMULATE_RESPONSE<br>Worked on a message to the tutor. | 0s **FORMULATING** WRITING_REQUIREMENTS<br>Wrote in the chat box for 2s without sending. |
| 2s **ACTING** SUBMIT_RESPONSE<br>Sent the tutor a message: “help”. | 2s **ACTING** CHAT_SUBMIT<br>Sent “help” to the chat. |
| 3s **WAITING** WAIT_FOR_TUTOR_RESPONSE<br>Waited for the tutor, which answered: “You've made great progress!”. | 3s **WAITING** AWAITING_FEEDBACK<br>Waited 6s with a model call open. |
| 8s **UNCLEAR** NO_RECORDED_ACTIVITY<br>Nothing was recorded for 23s. | 8s **UNCLEAR** NO_ACTIVITY<br>Nothing was recorded for 23s. |
| 31s **EXPLORING** EXPERIMENT_WITH_REFERENCE<br>Played the reference game. | 31s **EXPLORING** SOLUTION_GAME_INTERACTION<br>Pressed keys on the Solution game (32 key presses). |
| 62s **UNCLEAR** NO_RECORDED_ACTIVITY<br>Nothing was recorded for 2m 2s. | 62s **UNCLEAR** NO_ACTIVITY<br>Nothing was recorded for 2m 2s. |
| 184s **ORIENTING** RESUME_SESSION<br>Signed back in after the page was replaced. | 184s **ACTING** SUBJECT_LOGIN<br>Signed in with a Subject ID. |
| 186s **UNCLEAR** NO_RECORDED_ACTIVITY<br>Nothing was recorded for 16s. | 186s **UNCLEAR** NO_ACTIVITY<br>Nothing was recorded for 16s. |
| 202s **EXPLORING** EXPERIMENT_WITH_REFERENCE<br>Played the reference game. | 202s **EXPLORING** SOLUTION_GAME_INTERACTION<br>Clicked and pressed keys on the Solution game (1 click, 6 key presses). |
| 206s **ACTING** SUBMIT_RESPONSE<br>Submitted the response. | 206s **ACTING** CHAT_SUBMIT<br>Sent a message to the chat. |
| 208s **FORMULATING** FORMULATE_AFTER_REFERENCE<br>Worked on the next message, having just been in the reference game. | 206s **ACTING** CHAT_SUBMIT<br>Sent a message to the chat. |
| 209s **ACTING** SUBMIT_RESPONSE<br>Sent the tutor a message: “help”. | 208s **FORMULATING** WRITING_REQUIREMENTS<br>Wrote in the chat box for 1s without sending. |
| 209s **WAITING** WAIT_FOR_TUTOR_RESPONSE<br>Waited for the tutor, which answered: “Great, let's start with what you've done so…”. | 209s **ACTING** CHAT_SUBMIT<br>Sent “help” to the chat. |
| — | 209s **WAITING** AWAITING_FEEDBACK<br>Waited 3s with a model call open. |

### Metrics (Tier B)

| | value |
|---|---|
| episode count, handwritten → profile | 13 → 14 |
| handwritten stretches with a majority-overlap counterpart | 100% (13/13) |
| ...of those, same broad class | 92% (12/13) |
| profile non-fallback coverage | 100% |
| profile UNCLEAR rate | 21% |


---

# 0711358e — HELD-OUT 1

327 events · handwritten reads 11 stretches · profile reads 11


## Tier A — same windows, different reading

| # | at | handwritten | generated |
|---|---|---|---|
| 0 | 0s | **ORIENTING** SIGN_IN<br>Signed in to start the session. | **ACTING** ⚠ SUBJECT_LOGIN<br>Signed in with a Subject ID.<br>*high · the Subject ID field was used and the login button was clicked* |
| 1 | 8s | **EXPLORING** EXPERIMENT_WITH_REFERENCE<br>Played the reference game. | **EXPLORING** SOLUTION_GAME_INTERACTION<br>Clicked and pressed keys on the Solution game (1 click, 6 key presses).<br>*high · the arrow keys were pressed inside the Solution sandbox* |
| 2 | 13s | **EXPLORING** EXPERIMENT_WITH_REFERENCE<br>Played the reference game, after restarting it. | **EXPLORING** SOLUTION_GAME_INTERACTION<br>Clicked and pressed keys on the Solution game (4 clicks, 36 key presses).<br>*high · the arrow keys were pressed inside the Solution sandbox* |
| 3 | 34s | **UNCLEAR** NO_RECORDED_ACTIVITY<br>Nothing was recorded for 25m 16s. | **UNCLEAR** NO_ACTIVITY<br>Nothing was recorded for 25m 16s.<br>*high · no act and no change on screen were recorded in this stretch* |
| 4 | 1549s | **EXPLORING** EXPERIMENT_WITH_REFERENCE<br>Played the reference game. | **EXPLORING** SOLUTION_GAME_INTERACTION<br>Clicked and pressed keys on the Solution game (1 click, 8 key presses).<br>*high · the arrow keys were pressed inside the Solution sandbox* |
| 5 | 1556s | **EXPLORING** REPLAY_REFERENCE<br>Replayed the reference game from the start. | **ACTING** ⚠ REPLAY_SOLUTION<br>Restarted the Solution game with Replay.<br>*high · the Replay button was used* |
| 6 | 1560s | **EXPLORING** EXPERIMENT_WITH_REFERENCE<br>Played the reference game. | **EXPLORING** SOLUTION_GAME_INTERACTION<br>Clicked and pressed keys on the Solution game (1 click, 10 key presses).<br>*high · the arrow keys were pressed inside the Solution sandbox* |
| 7 | 1566s | **FORMULATING** FORMULATE_RESPONSE<br>Worked on a message to the tutor. | **FORMULATING** WRITING_REQUIREMENTS<br>Wrote in the chat box for 6s without sending.<br>*medium · the stretch was spent at the chat text area with nothing sent* |
| 8 | 1571s | **ACTING** SUBMIT_RESPONSE<br>Sent the tutor a message: “can you create a 8 x 6 baord”. | **ACTING** CHAT_SUBMIT<br>Sent “can you create a 8 x 6 baord” to the chat.<br>*high · a submit was recorded on the chat form* |
| 9 | 1572s | **WAITING** WAIT_FOR_TUTOR_RESPONSE<br>Waited for the tutor, which answered: “Great!”. | **WAITING** AWAITING_FEEDBACK<br>Waited 4s with a model call open.<br>*high · a model call was open across this stretch and no send was recorded in it* |
| 10 | 1579s | **EXPLORING** REPLAY_REFERENCE<br>Replayed the reference game from the start. | **ACTING** ⚠ REPLAY_SOLUTION<br>Restarted the Solution game with Replay.<br>*high · the Replay button was used* |

### Metrics (Tier A)

| | handwritten | generated |
|---|---|---|
| stretches | 11 | 11 |
| non-fallback coverage | 100% | 100% |
| UNCLEAR rate | 9% | 9% |
| broad-class agreement | — | **73%** (8/11) |
| confidently wrong | — | **27%** (3/11) |
| surface role agreement | — | 100% (11/11) |
| texts given a channel | 3/5 | 2/5 |
| ...both, same person/system side | — | 2/2 of texts both named |
| acts matched to a control | 13/22 | 14/22 |
| ...both matched something | — | 13/22 |

### Confidently wrong (Tier A)

- **0s** handwritten says `ORIENTING/SIGN_IN`; profile says `ACTING/SUBJECT_LOGIN` at high confidence — "Signed in with a Subject ID." (the Subject ID field was used and the login button was clicked)
- **1556s** handwritten says `EXPLORING/REPLAY_REFERENCE`; profile says `ACTING/REPLAY_SOLUTION` at high confidence — "Restarted the Solution game with Replay." (the Replay button was used)
- **1579s** handwritten says `EXPLORING/REPLAY_REFERENCE`; profile says `ACTING/REPLAY_SOLUTION` at high confidence — "Restarted the Solution game with Replay." (the Replay button was used)

## Tier B — each cuts the session itself

handwritten: **11** stretches · profile: **11** stretches

| handwritten | profile |
|---|---|
| 0s **ORIENTING** SIGN_IN<br>Signed in to start the session. | 0s **ACTING** SUBJECT_LOGIN<br>Signed in with a Subject ID. |
| 8s **EXPLORING** EXPERIMENT_WITH_REFERENCE<br>Played the reference game. | 8s **EXPLORING** SOLUTION_GAME_INTERACTION<br>Clicked and pressed keys on the Solution game (1 click, 6 key presses). |
| 13s **EXPLORING** EXPERIMENT_WITH_REFERENCE<br>Played the reference game, after restarting it. | 13s **EXPLORING** SOLUTION_GAME_INTERACTION<br>Clicked and pressed keys on the Solution game (4 clicks, 36 key presses). |
| 34s **UNCLEAR** NO_RECORDED_ACTIVITY<br>Nothing was recorded for 25m 16s. | 34s **UNCLEAR** NO_ACTIVITY<br>Nothing was recorded for 25m 16s. |
| 1549s **EXPLORING** EXPERIMENT_WITH_REFERENCE<br>Played the reference game. | 1549s **EXPLORING** SOLUTION_GAME_INTERACTION<br>Clicked and pressed keys on the Solution game (1 click, 8 key presses). |
| 1556s **EXPLORING** REPLAY_REFERENCE<br>Replayed the reference game from the start. | 1556s **ACTING** REPLAY_SOLUTION<br>Restarted the Solution game with Replay. |
| 1560s **EXPLORING** EXPERIMENT_WITH_REFERENCE<br>Played the reference game. | 1560s **EXPLORING** SOLUTION_GAME_INTERACTION<br>Clicked and pressed keys on the Solution game (1 click, 10 key presses). |
| 1566s **FORMULATING** FORMULATE_RESPONSE<br>Worked on a message to the tutor. | 1566s **FORMULATING** WRITING_REQUIREMENTS<br>Wrote in the chat box for 6s without sending. |
| 1571s **ACTING** SUBMIT_RESPONSE<br>Sent the tutor a message: “can you create a 8 x 6 baord”. | 1571s **ACTING** CHAT_SUBMIT<br>Sent “can you create a 8 x 6 baord” to the chat. |
| 1572s **WAITING** WAIT_FOR_TUTOR_RESPONSE<br>Waited for the tutor, which answered: “Great!”. | 1572s **WAITING** AWAITING_FEEDBACK<br>Waited 4s with a model call open. |
| 1579s **EXPLORING** REPLAY_REFERENCE<br>Replayed the reference game from the start. | 1579s **ACTING** REPLAY_SOLUTION<br>Restarted the Solution game with Replay. |

### Metrics (Tier B)

| | value |
|---|---|
| episode count, handwritten → profile | 11 → 11 |
| handwritten stretches with a majority-overlap counterpart | 100% (11/11) |
| ...of those, same broad class | 73% (8/11) |
| profile non-fallback coverage | 100% |
| profile UNCLEAR rate | 9% |


---

# d41b33b2 — HELD-OUT 2

339 events · handwritten reads 24 stretches · profile reads 24


## Tier A — same windows, different reading

| # | at | handwritten | generated |
|---|---|---|---|
| 0 | 0s | **ORIENTING** SIGN_IN<br>Signed in to start the session. | **ACTING** ⚠ SUBJECT_LOGIN<br>Signed in with a Subject ID.<br>*high · the Subject ID field was used and the login button was clicked* |
| 1 | 14s | **FORMULATING** FORMULATE_RESPONSE<br>Worked on a message to the tutor. | **FORMULATING** WRITING_REQUIREMENTS<br>Wrote in the chat box for 7s without sending.<br>*medium · the stretch was spent at the chat text area with nothing sent* |
| 2 | 21s | **ACTING** SUBMIT_RESPONSE<br>Sent the tutor a message: “create 8 x 6 board”. | **ACTING** CHAT_SUBMIT<br>Sent “create 8 x 6 board” to the chat.<br>*high · a submit was recorded on the chat form* |
| 3 | 21s | **WAITING** WAIT_FOR_TUTOR_RESPONSE<br>Waited for the tutor, which answered: “Great, you correctly identified the step to…”. | **WAITING** AWAITING_FEEDBACK<br>Waited 3s with a model call open.<br>*high · a model call was open across this stretch and no send was recorded in it* |
| 4 | 25s | **UNCLEAR** NO_RECORDED_ACTIVITY<br>Nothing was recorded for 1m 31s. | **UNCLEAR** NO_ACTIVITY<br>Nothing was recorded for 1m 31s.<br>*high · no act and no change on screen were recorded in this stretch* |
| 5 | 116s | **ACTING** SESSION_CONTROL<br>Reset the session. | **ACTING** RESET<br>Clicked Reset, starting the tutorial over.<br>*high · the Reset button was clicked* |
| 6 | 121s | **FORMULATING** FORMULATE_AFTER_FEEDBACK<br>Worked on the next message, after the tutor's answer. | **FORMULATING** WRITING_REQUIREMENTS<br>Wrote in the chat box for 4s without sending.<br>*medium · the stretch was spent at the chat text area with nothing sent* |
| 7 | 125s | **ACTING** SUBMIT_RESPONSE<br>Sent the tutor a message: “bitch”. | **ACTING** CHAT_SUBMIT<br>Sent “bitch” to the chat.<br>*high · a submit was recorded on the chat form* |
| 8 | 125s | **WAITING** WAIT_FOR_TUTOR_RESPONSE<br>Waited for the tutor, which answered: “It's important to keep our communication re…”. | **WAITING** AWAITING_FEEDBACK<br>Waited 3s with a model call open.<br>*high · a model call was open across this stretch and no send was recorded in it* |
| 9 | 129s | **UNCLEAR** NO_RECORDED_ACTIVITY<br>Nothing was recorded for 1m. | **UNCLEAR** NO_ACTIVITY<br>Nothing was recorded for 1m.<br>*high · no act and no change on screen were recorded in this stretch* |
| 10 | 189s | **EXPLORING** REPLAY_REFERENCE<br>Replayed the reference game from the start. | **ACTING** ⚠ REPLAY_SOLUTION<br>Restarted the Solution game with Replay.<br>*high · the Replay button was used* |
| 11 | 209s | **FORMULATING** FORMULATE_AFTER_FEEDBACK<br>Worked on the next message, after the tutor's answer. | **FORMULATING** WRITING_REQUIREMENTS<br>Wrote in the chat box for 3s without sending.<br>*medium · the stretch was spent at the chat text area with nothing sent* |
| 12 | 212s | **ACTING** SUBMIT_RESPONSE<br>Sent the tutor a message: “hoe”. | **ACTING** CHAT_SUBMIT<br>Sent “hoe” to the chat.<br>*high · a submit was recorded on the chat form* |
| 13 | 212s | **WAITING** WAIT_FOR_TUTOR_RESPONSE<br>Waited for the tutor, which answered: “Let's keep the conversation focused and res…”. | **WAITING** AWAITING_FEEDBACK<br>Waited 3s with a model call open.<br>*high · a model call was open across this stretch and no send was recorded in it* |
| 14 | 216s | **ORIENTING** RESUME_SESSION<br>The page was replaced and the session picked up again. | **EXPLORING** ⚠ SOLUTION_GAME_INTERACTION<br>Clicked on the Solution game (5 clicks).<br>*high · clicks or key presses were recorded inside the Solution sandbox document* |
| 15 | 228s | **ACTING** SESSION_CONTROL<br>Reset the session. | **ACTING** RESET<br>Clicked Reset, starting the tutorial over.<br>*high · the Reset button was clicked* |
| 16 | 233s | **ORIENTING** RESUME_SESSION<br>The page was replaced and the session picked up again. | **EXPLORING** ⚠ SOLUTION_GAME_INTERACTION<br>Clicked and pressed keys on the Solution game (2 clicks, 10 key presses).<br>*high · the arrow keys were pressed inside the Solution sandbox* |
| 17 | 605s | **UNCLEAR** NO_RECORDED_ACTIVITY<br>Nothing was recorded for 10s. | **UNCLEAR** NO_ACTIVITY<br>Nothing was recorded for 10s.<br>*high · no act and no change on screen were recorded in this stretch* |
| 18 | 614s | **ORIENTING** RESUME_SESSION<br>The page was replaced and the session picked up again. | **ACTING** ⚠ RESET<br>Clicked Reset, starting the tutorial over.<br>*high · the Reset button was clicked* |
| 19 | 625s | **EXPLORING** EXPERIMENT_WITH_REFERENCE<br>Played the reference game. | **EXPLORING** SOLUTION_GAME_INTERACTION<br>Clicked and pressed keys on the Solution game (1 click, 6 key presses).<br>*high · the arrow keys were pressed inside the Solution sandbox* |
| 20 | 746s | **UNCLEAR** NO_RECORDED_ACTIVITY<br>Nothing was recorded for 3m 15s. | **UNCLEAR** NO_ACTIVITY<br>Nothing was recorded for 3m 15s.<br>*high · no act and no change on screen were recorded in this stretch* |
| 21 | 941s | **UNDERSTANDING** INSPECT_REFERENCE_SOLUTION<br>Appeared to study the reference game. | **UNCLEAR** ⚠ UNCHARACTERISED<br>Spent 0s on the Solution game doing nothing this profile names.<br>*low · no rule in this profile matched the stretch* |
| 22 | 941s | **UNCLEAR** NO_RECORDED_ACTIVITY<br>Nothing was recorded for 30m 4s. | **UNCLEAR** NO_ACTIVITY<br>Nothing was recorded for 30m 4s.<br>*high · no act and no change on screen were recorded in this stretch* |
| 23 | 2745s | **UNDERSTANDING** INSPECT_REFERENCE_SOLUTION<br>Appeared to study the reference game. | **UNCLEAR** ⚠ UNCHARACTERISED<br>Spent 0s on the Solution game doing nothing this profile names.<br>*low · no rule in this profile matched the stretch* |

### Metrics (Tier A)

| | handwritten | generated |
|---|---|---|
| stretches | 24 | 24 |
| non-fallback coverage | 100% | 92% |
| UNCLEAR rate | 21% | 29% |
| broad-class agreement | — | **71%** (17/24) |
| confidently wrong | — | **21%** (5/24) |
| surface role agreement | — | 100% (24/24) |
| texts given a channel | 17/20 | 12/20 |
| ...both, same person/system side | — | 12/12 of texts both named |
| acts matched to a control | 33/44 | 34/44 |
| ...both matched something | — | 33/44 |

### Confidently wrong (Tier A)

- **0s** handwritten says `ORIENTING/SIGN_IN`; profile says `ACTING/SUBJECT_LOGIN` at high confidence — "Signed in with a Subject ID." (the Subject ID field was used and the login button was clicked)
- **189s** handwritten says `EXPLORING/REPLAY_REFERENCE`; profile says `ACTING/REPLAY_SOLUTION` at high confidence — "Restarted the Solution game with Replay." (the Replay button was used)
- **216s** handwritten says `ORIENTING/RESUME_SESSION`; profile says `EXPLORING/SOLUTION_GAME_INTERACTION` at high confidence — "Clicked on the Solution game (5 clicks)." (clicks or key presses were recorded inside the Solution sandbox document)
- **233s** handwritten says `ORIENTING/RESUME_SESSION`; profile says `EXPLORING/SOLUTION_GAME_INTERACTION` at high confidence — "Clicked and pressed keys on the Solution game (2 clicks, 10 key presses)." (the arrow keys were pressed inside the Solution sandbox)
- **614s** handwritten says `ORIENTING/RESUME_SESSION`; profile says `ACTING/RESET` at high confidence — "Clicked Reset, starting the tutorial over." (the Reset button was clicked)

## Tier B — each cuts the session itself

handwritten: **24** stretches · profile: **24** stretches

| handwritten | profile |
|---|---|
| 0s **ORIENTING** SIGN_IN<br>Signed in to start the session. | 0s **ACTING** SUBJECT_LOGIN<br>Signed in with a Subject ID. |
| 14s **FORMULATING** FORMULATE_RESPONSE<br>Worked on a message to the tutor. | 14s **FORMULATING** WRITING_REQUIREMENTS<br>Wrote in the chat box for 7s without sending. |
| 21s **ACTING** SUBMIT_RESPONSE<br>Sent the tutor a message: “create 8 x 6 board”. | 21s **ACTING** CHAT_SUBMIT<br>Sent “create 8 x 6 board” to the chat. |
| 21s **WAITING** WAIT_FOR_TUTOR_RESPONSE<br>Waited for the tutor, which answered: “Great, you correctly identified the step to…”. | 21s **WAITING** AWAITING_FEEDBACK<br>Waited 3s with a model call open. |
| 25s **UNCLEAR** NO_RECORDED_ACTIVITY<br>Nothing was recorded for 1m 31s. | 25s **UNCLEAR** NO_ACTIVITY<br>Nothing was recorded for 1m 31s. |
| 116s **ACTING** SESSION_CONTROL<br>Reset the session. | 116s **ACTING** RESET<br>Clicked Reset, starting the tutorial over. |
| 121s **FORMULATING** FORMULATE_AFTER_FEEDBACK<br>Worked on the next message, after the tutor's answer. | 121s **FORMULATING** WRITING_REQUIREMENTS<br>Wrote in the chat box for 4s without sending. |
| 125s **ACTING** SUBMIT_RESPONSE<br>Sent the tutor a message: “bitch”. | 125s **ACTING** CHAT_SUBMIT<br>Sent “bitch” to the chat. |
| 125s **WAITING** WAIT_FOR_TUTOR_RESPONSE<br>Waited for the tutor, which answered: “It's important to keep our communication re…”. | 125s **WAITING** AWAITING_FEEDBACK<br>Waited 3s with a model call open. |
| 129s **UNCLEAR** NO_RECORDED_ACTIVITY<br>Nothing was recorded for 1m. | 129s **UNCLEAR** NO_ACTIVITY<br>Nothing was recorded for 1m. |
| 189s **EXPLORING** REPLAY_REFERENCE<br>Replayed the reference game from the start. | 189s **ACTING** REPLAY_SOLUTION<br>Restarted the Solution game with Replay. |
| 209s **FORMULATING** FORMULATE_AFTER_FEEDBACK<br>Worked on the next message, after the tutor's answer. | 209s **FORMULATING** WRITING_REQUIREMENTS<br>Wrote in the chat box for 3s without sending. |
| 212s **ACTING** SUBMIT_RESPONSE<br>Sent the tutor a message: “hoe”. | 212s **ACTING** CHAT_SUBMIT<br>Sent “hoe” to the chat. |
| 212s **WAITING** WAIT_FOR_TUTOR_RESPONSE<br>Waited for the tutor, which answered: “Let's keep the conversation focused and res…”. | 212s **WAITING** AWAITING_FEEDBACK<br>Waited 3s with a model call open. |
| 216s **ORIENTING** RESUME_SESSION<br>The page was replaced and the session picked up again. | 216s **EXPLORING** SOLUTION_GAME_INTERACTION<br>Clicked on the Solution game (5 clicks). |
| 228s **ACTING** SESSION_CONTROL<br>Reset the session. | 228s **ACTING** RESET<br>Clicked Reset, starting the tutorial over. |
| 233s **ORIENTING** RESUME_SESSION<br>The page was replaced and the session picked up again. | 233s **EXPLORING** SOLUTION_GAME_INTERACTION<br>Clicked and pressed keys on the Solution game (2 clicks, 10 key presses). |
| 605s **UNCLEAR** NO_RECORDED_ACTIVITY<br>Nothing was recorded for 10s. | 605s **UNCLEAR** NO_ACTIVITY<br>Nothing was recorded for 10s. |
| 614s **ORIENTING** RESUME_SESSION<br>The page was replaced and the session picked up again. | 614s **ACTING** RESET<br>Clicked Reset, starting the tutorial over. |
| 625s **EXPLORING** EXPERIMENT_WITH_REFERENCE<br>Played the reference game. | 625s **EXPLORING** SOLUTION_GAME_INTERACTION<br>Clicked and pressed keys on the Solution game (1 click, 6 key presses). |
| 746s **UNCLEAR** NO_RECORDED_ACTIVITY<br>Nothing was recorded for 3m 15s. | 746s **UNCLEAR** NO_ACTIVITY<br>Nothing was recorded for 3m 15s. |
| 941s **UNDERSTANDING** INSPECT_REFERENCE_SOLUTION<br>Appeared to study the reference game. | 941s **UNCLEAR** UNCHARACTERISED<br>Spent 0s on the Solution game doing nothing this profile names. |
| 941s **UNCLEAR** NO_RECORDED_ACTIVITY<br>Nothing was recorded for 30m 4s. | 941s **UNCLEAR** NO_ACTIVITY<br>Nothing was recorded for 30m 4s. |
| 2745s **UNDERSTANDING** INSPECT_REFERENCE_SOLUTION<br>Appeared to study the reference game. | 2745s **UNCLEAR** UNCHARACTERISED<br>Spent 0s on the Solution game doing nothing this profile names. |

### Metrics (Tier B)

| | value |
|---|---|
| episode count, handwritten → profile | 24 → 24 |
| handwritten stretches with a majority-overlap counterpart | 96% (23/24) |
| ...of those, same broad class | 74% (17/23) |
| profile non-fallback coverage | 92% |
| profile UNCLEAR rate | 29% |


---

# 3c9e1514 — HELD-OUT 3

182 events · handwritten reads 9 stretches · profile reads 9


## Tier A — same windows, different reading

| # | at | handwritten | generated |
|---|---|---|---|
| 0 | 0s | **ORIENTING** SIGN_IN<br>Signed in to start the session. | **ACTING** ⚠ SUBJECT_LOGIN<br>Signed in with a Subject ID.<br>*high · the Subject ID field was used and the login button was clicked* |
| 1 | 10s | **EXPLORING** EXPERIMENT_WITH_REFERENCE<br>Played the reference game. | **EXPLORING** SOLUTION_GAME_INTERACTION<br>Clicked and pressed keys on the Solution game (1 click, 18 key presses).<br>*high · the arrow keys were pressed inside the Solution sandbox* |
| 2 | 23s | **FORMULATING** FORMULATE_RESPONSE<br>Worked on a message to the tutor. | **FORMULATING** WRITING_REQUIREMENTS<br>Wrote in the chat box for 11s without sending.<br>*medium · the stretch was spent at the chat text area with nothing sent* |
| 3 | 34s | **ACTING** SUBMIT_RESPONSE<br>Sent the tutor a message: “can you help me”. | **ACTING** CHAT_SUBMIT<br>Sent “can you help me” to the chat.<br>*high · a submit was recorded on the chat form* |
| 4 | 35s | **WAITING** WAIT_FOR_TUTOR_RESPONSE<br>Waited for the tutor, which answered: “Sure!”. | **WAITING** AWAITING_FEEDBACK<br>Waited 5s with a model call open.<br>*high · a model call was open across this stretch and no send was recorded in it* |
| 5 | 40s | **FORMULATING** FORMULATE_AFTER_FEEDBACK<br>Worked on the next message, after the tutor's answer. | **FORMULATING** WRITING_REQUIREMENTS<br>Wrote in the chat box for 8s without sending.<br>*medium · the stretch was spent at the chat text area with nothing sent* |
| 6 | 48s | **ACTING** SUBMIT_RESPONSE<br>Sent the tutor a message: “create a 8 x 6 board”. | **ACTING** CHAT_SUBMIT<br>Sent “create a 8 x 6 board” to the chat.<br>*high · a submit was recorded on the chat form* |
| 7 | 48s | **WAITING** WAIT_FOR_TUTOR_RESPONSE<br>Waited for the tutor, which answered: “Great start!”. | **WAITING** AWAITING_FEEDBACK<br>Waited 4s with a model call open.<br>*high · a model call was open across this stretch and no send was recorded in it* |
| 8 | 55s | **UNCLEAR** IDLE_OR_UNCLEAR<br>Activity that the trace does not characterise. | **UNCLEAR** UNCHARACTERISED<br>Spent 0s on the ROPE training page doing nothing this profile names.<br>*low · no rule in this profile matched the stretch* |

### Metrics (Tier A)

| | handwritten | generated |
|---|---|---|
| stretches | 9 | 9 |
| non-fallback coverage | 89% | 89% |
| UNCLEAR rate | 11% | 11% |
| broad-class agreement | — | **89%** (8/9) |
| confidently wrong | — | **11%** (1/9) |
| surface role agreement | — | 100% (9/9) |
| texts given a channel | 5/6 | 4/6 |
| ...both, same person/system side | — | 4/4 of texts both named |
| acts matched to a control | 6/9 | 8/9 |
| ...both matched something | — | 6/9 |

### Confidently wrong (Tier A)

- **0s** handwritten says `ORIENTING/SIGN_IN`; profile says `ACTING/SUBJECT_LOGIN` at high confidence — "Signed in with a Subject ID." (the Subject ID field was used and the login button was clicked)

## Tier B — each cuts the session itself

handwritten: **9** stretches · profile: **9** stretches

| handwritten | profile |
|---|---|
| 0s **ORIENTING** SIGN_IN<br>Signed in to start the session. | 0s **ACTING** SUBJECT_LOGIN<br>Signed in with a Subject ID. |
| 10s **EXPLORING** EXPERIMENT_WITH_REFERENCE<br>Played the reference game. | 10s **EXPLORING** SOLUTION_GAME_INTERACTION<br>Clicked and pressed keys on the Solution game (1 click, 18 key presses). |
| 23s **FORMULATING** FORMULATE_RESPONSE<br>Worked on a message to the tutor. | 23s **FORMULATING** WRITING_REQUIREMENTS<br>Wrote in the chat box for 11s without sending. |
| 34s **ACTING** SUBMIT_RESPONSE<br>Sent the tutor a message: “can you help me”. | 34s **ACTING** CHAT_SUBMIT<br>Sent “can you help me” to the chat. |
| 35s **WAITING** WAIT_FOR_TUTOR_RESPONSE<br>Waited for the tutor, which answered: “Sure!”. | 35s **WAITING** AWAITING_FEEDBACK<br>Waited 5s with a model call open. |
| 40s **FORMULATING** FORMULATE_AFTER_FEEDBACK<br>Worked on the next message, after the tutor's answer. | 40s **FORMULATING** WRITING_REQUIREMENTS<br>Wrote in the chat box for 8s without sending. |
| 48s **ACTING** SUBMIT_RESPONSE<br>Sent the tutor a message: “create a 8 x 6 board”. | 48s **ACTING** CHAT_SUBMIT<br>Sent “create a 8 x 6 board” to the chat. |
| 48s **WAITING** WAIT_FOR_TUTOR_RESPONSE<br>Waited for the tutor, which answered: “Great start!”. | 48s **WAITING** AWAITING_FEEDBACK<br>Waited 4s with a model call open. |
| 55s **UNCLEAR** IDLE_OR_UNCLEAR<br>Activity that the trace does not characterise. | 55s **UNCLEAR** UNCHARACTERISED<br>Spent 0s on the ROPE training page doing nothing this profile names. |

### Metrics (Tier B)

| | value |
|---|---|
| episode count, handwritten → profile | 9 → 9 |
| handwritten stretches with a majority-overlap counterpart | 100% (9/9) |
| ...of those, same broad class | 89% (8/9) |
| profile non-fallback coverage | 89% |
| profile UNCLEAR rate | 11% |


---

# Across the four sessions

| session | role | stretches | Tier A broad agreement | confidently wrong | Tier B count | Tier B aligned & agreeing |
|---|---|---|---|---|---|---|
| 87a7ceb0 | DISCOVERY (in-sample) | 13 | 12/13 (92%) | 1 | 14 | 12/13 |
| 0711358e | HELD-OUT 1 | 11 | 8/11 (73%) | 3 | 11 | 8/11 |
| d41b33b2 | HELD-OUT 2 | 24 | 17/24 (71%) | 5 | 24 | 17/23 |
| 3c9e1514 | HELD-OUT 3 | 9 | 8/9 (89%) | 1 | 9 | 8/9 |

**Held-out only: 33/44 broad-class agreement (75%), 9 confidently wrong.**
