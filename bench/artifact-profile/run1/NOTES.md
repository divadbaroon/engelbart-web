# Notes on the ROPE Training System profile

## What the software is

`system/` is a Next.js single-page application the repository calls the **ROPE Training System**
(`system/README.md`, first line). It is the companion system for a TOCHI paper on training people to
use an LLM by writing requirements (`README.md` at the repository root). One person at a time uses
it; they sign in with a **Subject ID**, which becomes the name of their MongoDB database
(`app/api/logClick/route.ts`, `app/api/conversation/route.ts`) — that is a study instrument, not a
product account.

The page is three panels plus a strip of three buttons on the right edge:

1. **the chat** (`ChatBox`) — a stage banner, a message list, and a text box whose placeholder is
   "Start discussing about *{game}* requirements by typing here."
2. **the requirement document** (`GameDocBox`) — the game's steps and, under each, the individual
   requirements. Steps and requirements start hidden (`show: false`, `lib/games.ts`) and are
   revealed as the model judges that the learner's answer has hit them.
3. **the canvas panel** (`CodeBox`) — two tabs, **My canvas** and **Solution**, each an iframe of
   `public/sandbox/index.html`, a Skulpt sandbox with a small tkinter shim that runs Python on a
   `<canvas>`.

The session has three stages (the banner says which): *Break down the main steps*, *Write
requirements for step*, *Check requirements for step*. In stage 1 the learner is asked to enumerate
the main steps of the game; in stage 2 onward they are asked, step by step, for "a list of core
requirements". On the other side of the chat is `gpt-4o-2024-08-06` prompted as "an experienced
Teaching Assistant ... in an office hour" holding the groundtruth steps and requirements, told not to
give the answer away and repeatedly told to "ask student to double-check the **Solution game
interaction**" (`lib/prompts.ts`, confirmed verbatim in `evidence/07-model-calls.md`).

The mechanism that makes this more than a chat is the pair of sandboxes. **Solution** runs the
groundtruth program (the reference the learner was given). **My canvas** runs a program built from
what the learner actually wrote: when the model marks their requirements `incorrect`, the `code`
prompt asks for the groundtruth code *edited to contain exactly the errors the student introduced*,
and that counterfactual is streamed into My canvas. So the learner can play the game their own words
describe, next to the game they were supposed to describe. The default game is Tetris, auto-loaded
from `lib/Tetris/`; Connect 4 and TicTacToe ship as files that an operator adds through a
password-gated upload.

The recording is one short, partly exploratory session: a sign-in, ~40 minutes of wall clock with
about four minutes of activity, 88 key presses (84 arrows) and 4 canvas clicks all inside the
**Solution** sandbox, two chat sends (both the word "help", once by Enter and once by the send
button), two model calls, and ten loads of the root document. It never left stage 1, so My
canvas, Generate Game, Next Step, the per-step Solution accordion, Reset, End and Change Game were
never exercised. Everything I wrote about those comes from the source, and is marked accordingly.

## What I wrote

4 surfaces, 5 channels, 15 controls, 5 key sets, 19 rules, 1 fallback.

The nine broad classes land like this: ACTING for the deeds (sign-in, send, Generate Game, Next
Step, Reset, End, Change Game, Replay, tab switch), WAITING for an open model call, EXPLORING for
playing the Solution, EVALUATING for playing My canvas, FORMULATING for composing in the chat box,
UNDERSTANDING for text arriving with nothing done, UNCLEAR for silence, reloads and sandbox errors.
I wrote no ORIENTING and no REVISING rule (see below).

## What I am confident about

- **The two sandboxes and their roles.** This is the strongest thing in the profile. The documents
  are keyed by their own `?id=` (`my-canvas`, `solution`, `solution-step-N`), the tabs are labelled
  "My canvas" and "Solution" in the source, and the trace shows the id=solution frame receiving
  every canvas click and arrow key. `reference` vs `own` therefore separates "played the game they
  were given" from "played the game their requirements produced" with no guesswork at the anchor
  level.
- **`#game-canvas` and `#error-display`** are rung-1 anchors straight out of `sandbox/index.html`.
- **The named buttons** (Reset, End, Change Game, Add Game, Delete Game, Replay, login) and the two
  action chips (Generate Game, Next Step) are exact-text anchors on strings that are literals in the
  source, and the action strings are fixed by the prompt's output contract, not by the model's
  imagination.
- **The tabs** carry a real `role="tab"` with an accessible name (Radix), so they are rung 2.
- **The Subject ID field** has a real `<label>` (rung 2).
- **Enter sends and Shift+Enter inserts a newline** (`handleKeyDown`), and an Enter send fires no
  form submit event — which is why CHAT_SUBMIT has a second branch, guarded by a model call having
  opened, rather than trusting the `submitted` flag alone. In this recording one of the two sends
  produced no submit event at all.

## What I am not confident about

- **The chat container anchors are generated CSS paths, and I could not do better.** The chat
  column, the message list and the individual message bubbles have no id, no test id, no role and
  no accessible name. The learner's bubble and the tutor's bubble differ only by a Tailwind utility
  class (`flex-row` vs `flex-row-reverse`), and the collector reports at most a handful of classes
  per element and did not report those. So `chat`, `learner-message` and `requirement-doc` all rest
  on `main > div:nth-of-type(N)` paths and are marked `confidence: "low"`. They break the day
  somebody reorders the panels.
- **The `learner-message` channel is the weakest claim in the file, and the most load-bearing.**
  Without a `from: "person"` channel nothing the learner sent can ever be quoted, and in this
  software what the learner sent *is* the object of study, so I wrote one. It works off a real
  mechanism: when a message is sent, the new bubble and the loading spinner change at the same
  moment, so the lowest element containing both is the chat body div — one level above the message
  list, where a streamed tutor reply lands. That held for both sends in this recording. It has one
  known false positive: at game over the composer is removed while the completion message is
  appended, which produces the same container. I closed that specific hole by putting the
  `tutorial-complete` channel first, so the "Congratulations!! You've successfully completed the …
  tutorial!" text is claimed by a system channel before the person channel can see it. Any other
  simultaneous composer-and-list change would still be misattributed. I only quote this channel from
  a rule that already requires a send, so a stray capture cannot invent a sentence on its own.
- **`data-button-id` is the obvious fix and the collector does not expose it.** This application
  already labels every control it cares about — `reset-game`, `end-game`, `change-game`, `add-game`,
  `delete-game`, `chat-submit`, `tab-my-canvas`, `tab-solution`, `replay-solution`,
  `action-{name}` — because `components/ClickLogger.ts` logs clicks by that attribute. Those are the
  software's own names for its own controls, exactly what rung 1 is for, and none of them appear in
  the survey or the trace, which show only `id`, `name`, `label`, `placeholder`, `role`, `type`,
  `tag`, a truncated class list and a CSS path. If the collector read `data-button-id` as a test id,
  most of the low-confidence anchors in this profile would become rung 1.
- **The shell surface key.** The root document has no `?id=`, no `?name=` and no frame name, and
  `parentFrameId` is null, so by the documented rule it should be keyed by its path, `/`. I did not
  see a key printed anywhere in the evidence, so I matched on prefix `/` rather than equality. The
  sandbox documents are keyed by their `?id=` value and cannot collide with it. Nothing important
  depends on it: no rule requires `surfaceRole: ["shell"]`.
- **`my-canvas` as `own`.** The code there is written by a model, not by the person. I still call it
  `own` because it is the program their requirements produced and the tab is literally "My canvas",
  but it is a judgement, and I said so in the surface's note.
- **MY_CANVAS_INTERACTION as EVALUATING.** The software frames running that canvas as checking:
  "We can check what we have so far by generating a game. Compare with the Solution game", and the
  stage-3 banner says "you can now Generate Game to check that it matches the Solution". The
  recording can show the playing but never the comparing, so the class is an interpretation of the
  surface, not of the person. Marked `medium`. If a reviewer prefers EXPLORING for both sandboxes,
  only this one rule changes.
- **The hard-drop key name.** I listed both `" "` and `"Space"` because I could not tell from the
  evidence whether the recorder reports `KeyboardEvent.key` or `.code` — arrows and Enter are spelled
  the same either way, and no space or digit was pressed in this session. For the same reason
  `tetris-piece-select` lists `"0"`–`"6"` and not `"Digit0"`–`"Digit6"`; if the recorder reports
  codes, that set will simply never fire.

## Rules I considered and did not write

- **Stage detection.** The banner strings ("Break down the main steps:", "Write requirements for
  step:", "Check requirements for step:") are literals in `page.tsx` and would have let me say
  "wrote the outline" versus "wrote the requirements for the open step" — much more useful rows. I
  dropped it. The banner only reaches the collector inside whole-page change events, and the
  Teaching Assistant writes free text into the same chat, so a sentence like "let's write
  requirements for step 2" would set the phase wrongly and every later row would inherit the error.
  WRITING_REQUIREMENTS therefore names neither stage.
- **Reading the offered action chips to infer correctness.** Per the prompt contract, `["Generate
  Game"]` alone is offered when the answer contains an error and `["Generate Game", "Next Step"]`
  when every requirement is hit — so the chips encode the verdict. Recovering that from arriving
  chat text is far too fragile, and getting it wrong would be a claim that somebody's answer was
  wrong. Not written.
- **A REVISING rule.** ROPE is built around iterating after feedback, and I wanted it. Nothing in a
  recording distinguishes rewriting a requirement from writing one for the first time; both are the
  same composing stretch in the same box. Left to FORMULATING.
- **"Watched the Solution".** A very common real stretch — switch to the Solution tab and watch the
  pieces fall without touching anything — and unreadable: an unchanging screen and an empty chair
  look identical. CANVAS_TAB_SWITCH (ACTING, last of the act rules) names the switch when nothing
  else was recorded, and says nothing about eyes.
- **Step accordion headings as a control.** Opening a step in the document or in the per-step
  Solution list is a real navigation act, but the trigger has no id, no test id and no stable name
  (its text is the step name, which differs per game), and the only distinguishing class
  (`font-semibold`) may not survive the collector's class truncation. Skipped; a stretch spent in a
  `solution-step-N` document is still caught by surface role.
- **Which game was switched to.** The chooser is a native `<select>` of game titles; the recording
  carries no value. CHANGE_GAME says the menu was opened and stops there.
- **An ORIENTING rule for the first stretch.** The opening of a session is already covered by
  SUBJECT_LOGIN and then by TA_FEEDBACK (the welcome message arriving with nothing done). Adding an
  index-0 rule would only have renamed those.
- **A rule on `{field: "discontinuity"}`.** PAGE_RELOAD reports the reload but does not print the
  discontinuity field, because I could not tell from the schema what that template renders and did
  not want a sentence with a hole in it.

## Things the format would not let me say

- **Where the learner is in the task.** Stage (1–3) and current step are the two variables that make
  this software legible — the application itself logs `stage` and `currentStep` with every click
  (`ClickLogger.ts`) — but a profile has no notion of session state, only per-stretch predicates and
  history tests. `history` with an `EpisodeTest` can look back at earlier subs, which is how a future
  version could carry stage forward from a NEXT_STEP episode; I judged that too indirect to trust.
- **That Enter sends and Shift+Enter does not.** `KeySetSpec` is a bare list of key names with no
  room for modifiers, and the recording has no modifier state anyway.
- **Provenance on a key set.** `KeySetSpec` has no `generation` field, so the fact that the Tetris
  key meanings come from `lib/Tetris/data.json` (requirements: arrows move, up rotates, space hard
  drops, number keys 0–6 load each of the seven pieces) is recorded only here. Those four sets are
  in the profile as documentation of what the keys mean in this software; only `tetris-piece-move`
  is referenced by a rule.
- **A negated text test.** `StringTest` has no `not`, which is why the false positive on the person
  channel had to be fixed by channel ordering rather than by excluding a phrase.
- **The shape of `FallbackSpec`.** It is named but never defined in SCHEMA.md. I wrote it as a rule
  without `when` or `priority` (`sub`, `broad`, `description`, `because`, `confidence`), which is my
  best reading; if the runtime wants a different shape, that one object needs changing.

## What I looked for in the evidence and could not find

- A test id anywhere in the application (there is none; `data-button-id` is the app's equivalent and
  the collector does not report it).
- Any record of scrolling, so nothing can be said about the requirement document being read.
- The literal document key the collector minted for the root page.
- Any exercise of stage 2 or 3, of My canvas, or of a game other than Tetris — so a third of the
  profile is source-grounded and trace-untested, and is marked that way rule by rule.
