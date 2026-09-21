WHAT THE SOFTWARE IS

Cocoa Canvas (kjfeng/cocoa-canvas) is a research prototype: a pannable, zoomable shared canvas
of "cards". Each card holds an "agent notebook" — a plan of numbered "steps", each assigned to
either the **Agent** or the **User**. The person writes a task in the **New Task** dialog; the
server asks a model for a plan (`/api/notebooks/plan`); the card then shows the steps. Steps can
be run one at a time or with **Run All**, which stops at the first user step; user steps are
answered either in a freeform box or in a small React form the model generates on the fly
(`/api/notebooks/input-form`, rendered with react-live). There is **Help me** (streamed advice
for a user step), **Synthesize / Final Results** (streamed synthesis of all step results),
**Fork** (copy selected steps into a new card, drawn as an arrow between cards), delete, add and
remove steps, and an assignment toggle. Everything is synced between peers with Yjs/WebRTC, and
each visitor first gives a display name on a "Join canvas" modal. All of this vocabulary —
card, notebook, step, agent/user, Run All, plan, synthesis, fork, guided form, freeform — is the
repository's own, from component names and button copy.

WHAT I WAS CONFIDENT ABOUT

- The single-document surface. Only `/` was ever served; the app is one route with overlays.
- The control inventory. Most controls carry either a `title` attribute (the icon buttons:
  "Create new card", "Run step"/"Re-run step"/"User step", "Remove step", "Delete card",
  "Back to canvas", "Edit response", "Copy code", "Fork card") or a short unique word. Those are
  rungs 3–4 and are exactly what a reader of this code would name them by. Two placeholders
  ("Your name", "What would you like to work on?", "Type your response...") give me rung-3
  anchors for the three fields that matter.
- The `card-<id>` element id. `CanvasCard` sets `id={`card-${card.id}`}` and the trace shows a
  region target `#card-jjlGjFYS9dlWV0oPf1IbQ`. That is a rung-1 anchor for "a card", so the
  card channel rests on `elementId: {prefix: "card-"}` rather than on `data-card-id` — I was
  told `appId`/`appIdAttr` are not available in these recordings even though one region in this
  trace happened to carry them, and I obeyed the instruction.
- Model calls. The gateway captured them, so WAITING is a fact, not a guess.

WHAT I WAS NOT CONFIDENT ABOUT, AND WHAT I DID ABOUT IT

- **No `from: "person"` channel.** I could not find a place on the page where the person's own
  words land cleanly. The task description is echoed only as part of a large blob in `#root`
  that also contains "New Task", the author's name and "Generating plan…"; a user step response
  is echoed into the step preview and the sidebar, neither of which has any anchor better than a
  generated CSS path. Quoting that blob would put the software's words in the person's mouth, so
  I wrote no person channel. Consequence: `entered` is never true and nothing the person sent can
  be quoted. I think that is the right trade here, but it is a real loss and a later author with
  a better anchor should add one.
- **Fork.** "Fork" opens a dialog from a card and also confirms the fork inside that dialog; the
  confirming button has no title and no id. I kept one control and a rule that says only that
  fork controls were used, at medium confidence, rather than claim a card was forked.
- **Wheel and drag.** The capability list says gestures are recorded (the trace has three
  `ui.wheel` events), but the predicate language has no way to ask about them — `acts` covers
  keys, clicks, typing, submits, navigations only. So canvas pan/zoom and card dragging, which
  are the signature interactions of this artifact, are invisible to my rules and will fall to
  the fallback (they will look like "observed but no acts"). I considered a rule on
  `observed AND acts==0` naming it PAN_ZOOM_CANVAS, and rejected it: wheeling inside an expanded
  card scrolls the notebook/result panel instead, and the two are indistinguishable. That is the
  single thing I most wanted and could not express.
- **Clicking around inside an expanded card.** In the recording, seq 38 and 66 are clicks on the
  notebook column div (whose text begins "Run All 1 . …"). That is selecting a step, or blank
  space, or a step description going into edit mode — no stable anchor and no way to tell which.
  Left to the fallback deliberately.
- **`GENERATION_IN_PROGRESS`** (priority 54) fires on "Generating…"/"Synthesizing…"/"Agent is
  working…" text with no input acts. Because cards are synced over WebRTC, in a multiplayer
  session such an indicator can be produced by a peer. I set it to medium and worded the
  description so it only asserts that the indicator appeared.
- **`TEXT_ENTRY`** (priority 80) is an admitted abstraction covering writing in fields I cannot
  anchor: the inline step-description `<input>`, the two result editors, and inputs inside the
  model-generated guided form (whose DOM is written by the model at run time and can be anything).
  It says only that typing happened, not where.

RULES I CONSIDERED AND DID NOT WRITE

- A `PAN_ZOOM_CANVAS` / `READ_RESULT` rule for gesture-only stretches (see above).
- A rule keyed on the checklist widget's checkboxes (`inputType: checkbox` → REVISING): generated
  guided forms also contain checkboxes, so the evidence does not distinguish ticking an agent's
  checklist from filling in a form.
- A `PLAN_ARRIVED` rule on the card channel alone: a card's text also changes when a peer edits
  it, when a step result streams in, and when the person's own submission is stored.
- A rule naming which generation was running from the model call: the gateway sees the same
  `/v1/responses` for plan, step, help, synthesis and form; the request path
  (`/api/notebooks/...`) is visible in the network log but not to the predicate language.

ORDERING NOTE FOR A LATER READER

Priorities 10–48 are acts (a control that *is* a deed); 50–54 are writing and waiting; 60–70 are
doors (opening a dialog, opening a card, switching view, Escape) and sit below the acts on purpose
so a merged stretch is named after what was done in it, not after the click that opened it. The
one exception worth knowing: `WRITE_USER_RESPONSE` (50) sits above `OPEN_USER_STEP_INPUT` (64), so
"opened the input and then wrote in it" is reported as writing.