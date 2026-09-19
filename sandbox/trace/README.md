# The behavior trace

What a person does in a running research artifact, what the artifact asks
over the network and of a model in return, and what visibly changes, as one
timeline per run. Three processes in the sandbox write it; the worker's
collector reads it and stores it under the run's identity.

```
browser ──bridge.js──► preview-gateway.mjs ──stdout──► worker collector ──► engelbart_trace_events
  │                          │  (network.*)                                 engelbart_model_calls
  └── application ──► model-gateway.mjs ──stdout──┘  (model.*)
```

## The line format

Every process writes one JSON object per stdout line, marked
`{"engelbart":"trace","v":1,"source":…,"kind":…,"ts":…}`, and human lines on
stderr prefixed `[model-gateway]`, `[preview-gateway]`, `[browser-bridge]`
(the bridge logs to the page's console). The collector (`lib/trace/collector.ts`)
recognises the marked lines and passes everything else through as ordinary
stdout. Identity comes from the worker: nothing in the sandbox or the
browser can claim another run's trace.

Ids that appear on lines and land in their own columns:

| id | minted by | example | meaning |
|----|-----------|---------|---------|
| `frameId` | preview gateway per served HTML document (the bridge mints one for frames it attaches to itself) | `f_3fa9c1e2b0` | which document an event happened in |
| `interactionId` | bridge, one per meaningful interaction | `i_3fa9c1e2b0_12` | the interaction a request or change belongs to |
| `requestId` | preview gateway per application request | `r_…` | one request through the gateway |
| `callId` | model gateway per model call | `mc_…` | one model call |

`correlation` says how an event was tied to an interaction: `explicit` when
the request carried the id in an `x-engelbart-interaction` header, `temporal`
when only timing associates them (a `ui.change` after an interaction; a
model call made while exactly one application request was being handled).
A temporal link is an association, not a claim of cause; with several
requests open the collector links nothing and lists the candidates.

## model-gateway.mjs

A loopback HTTP proxy the application's model client is pointed at
(`OPENAI_BASE_URL=http://127.0.0.1:43200/t/<token>/https/<host>/v1`). It
forwards each request byte for byte to the artifact's original upstream,
streams the answer back untouched, and describes the exchange from a tee:
`model.request` (model, settings, system prompt, messages, tools, response
format), `model.response` (streamed output merged, usage when the provider
sent it, timings) or `model.error`. Capture `full` keeps content, `metadata`
keeps shapes and counts. Known secret values and anything shaped like a
key are redacted before a line is written.

## preview-gateway.mjs

Takes `proxy.mjs`'s place for a traced run: the same public port per
service, the same Host/Origin/Referer rewriting, the same WebSocket
pass-through. On top of that:

- every `text/html` document it serves (top page or iframe alike) gets
  `<script src="/__engelbart/bridge.js" data-frame="f_…">` right after
  `<head>` (after `<html>` or the doctype when there is no head), streamed,
  with `accept-encoding: identity` asked of the application so the document
  arrives uncompressed; a compressed document is decompressed first;
- a document whose Content-Security-Policy would refuse a same-origin
  script is served as it is and reported as `bridge.blocked` (a nonce in the
  policy is reused instead); the policy is never weakened;
- `/__engelbart/events` takes the bridge's batches (checked for shape and
  size, rate limited, browser clock converted with the batch's offset) and
  `/__engelbart/bridge.js` serves the bridge; `/__engelbart/health` answers;
- requests that are not assets (scripts, styles, images, fonts, the dev
  server's own traffic) become `network.request` and `network.response` or
  `network.error` lines: method, path (query values omitted), category
  (`document`, `api`, `action`, `prefetch`), status, timings, sizes, a header
  allowlist. Bodies are never read. The interaction header is forwarded to
  the application unchanged.

## bridge.js

A plain browser script. It records, as DOM facts, never as meaning:

| kind | when | what it carries |
|------|------|-----------------|
| `ui.click` | a click | target and the interactive control around it |
| `ui.submit` | a form submit | form, submitter, field names and types (never values) |
| `ui.input` | a control's committed change | selected option text, on/off, a slider's value; for text only its length |
| `ui.key` | a keydown that passes the keyboard policy | key name or class, count (repeats and quick identical presses fold), target |
| `ui.focus` | focus arriving in an embedded document | what has focus |
| `ui.route` | pushState/replaceState/popstate/hashchange | from, to, how |
| `ui.change` | the DOM went quiet (700 ms) after mutating following an interaction | mutation counts, small samples of visible text that appeared and disappeared, the smallest container, timing since the interaction. Text removed and put back in the same burst (a rerender) is counted as `rerendered`, not quoted. Mutations inside a text-entry surface are never recorded: a framework mirroring the draft into a textarea's text node would otherwise leak it |
| `frame.loaded` | the document is parsed | url (query values omitted), title, whether embedded, an inventory of surfaces (canvas, video, form, iframe, …) |
| `frame.attached` | an embedded document and its parent found each other | parent frame, selector in the parent, name, depth, whether it observes itself or its parent observes it |
| `frame.discovered` | an iframe the bridge cannot reach | selector, reason (`cross-origin`, `sandboxed`, `no-window`), source url |
| `frame.removed` | an iframe left the DOM | the child's frame id |

Every element is described the same way: tag, id, name, type, role, visible
text (capped), aria label, title, placeholder, test id, stable classes, a CSS
selector, bounding rect, href or form action (same-origin path only, query
omitted), and the frame's route. Never coordinates alone, never a value.

Not recorded, on purpose: mouse movement and hover, scrolling, printable
keystrokes on any text-entry surface, field values, DOM snapshots, canvas
draw calls or pixels, application state. What a canvas game did is visible
only through the keys and clicks that reached it and any DOM that changed.

### Keyboard policy

- Text-entry surfaces (inputs, textareas, contenteditable, `role=textbox`
  and friends, known editor containers): only Enter, Escape, Tab, arrows,
  Home/End/Page keys and F-keys, by name, plus Ctrl/Meta commands by name
  (`Ctrl+s`). Nothing printable, not even with Shift. A password field
  allows only Enter, Escape and Tab.
- Everywhere else (canvas, body, buttons, sliders, custom controls): control
  and navigation keys by name (`ArrowLeft`, `Space`, `Shift+Tab`), commands
  by name, and printable keys only as `[printable]` with a class (`letter`,
  `digit`, `symbol`) and a count. The character never leaves the page.
- Modifier keys alone and composition events are ignored; auto-repeat and
  identical presses within 800 ms fold into one event with a count.

### Frames

Each gateway-served document runs its own bridge and posts its own batches.
An embedded document says hello to its parent over `postMessage` (same
origin only); the parent answers with the child's selector, name and depth,
and the child reports `frame.attached`. A same-origin frame with no bridge
of its own (srcdoc, blob, about:blank) is observed from the parent under a
bridge-minted id. A frame that cannot be reached is reported once as
`frame.discovered` with the reason; what happens inside it is not recorded.

"The latest interaction" of a document includes what happens in the frames
it embeds: a bridged child posts `activity` (its interaction id and time)
to its parent, and the parent uses it for request tagging and change
attribution like one of its own. A page that logs a key press it was told
about by its game frame therefore tags that request with the press, not
with whatever the page itself was last clicked on.

### Footprint on the page

One capturing listener per event type on the document, a wrapped `fetch`
and `XMLHttpRequest` that add `x-engelbart-interaction` to same-origin
requests started within 10 s of an interaction (never to another origin, a
`no-cors` request, or the bridge's own transport; an empty URL is the
document itself, which is how Next.js posts a server action), patched
`history.pushState`/`replaceState` that also emit a route event, one
MutationObserver, and a non-enumerable `window.__engelbart` with the frame
id and the helpers the tests use. The application's own traffic and
behaviour are otherwise unchanged. Tuning rides on the script tag as
`data-config` (JSON of known keys).

One more, and only while the workspace asks for it: see **Annotate mode**.

### Annotate mode

A researcher can point at an element of the running interface and write a
note about it. The picker lives in the bridge; the note does not.

The bridge only observes until it is told otherwise. The workspace turns
the picker on by posting into the preview's frame, and the bridge accepts
that message only from the window that embeds the document and only when
that window's origin is `config.parentOrigin`, which the gateway sets per
run from `ENGELBART_BRIDGE_CONFIG`. With no `parentOrigin` the channel
never opens. Whoever turned it on is who results go back to, so an
embedded document is told by its parent and answers its parent: a pick
made three frames down arrives at the workspace with each frame's offset
added to the rect and each frame's selector added to the path. A frame
that cannot be reached — another origin, or sandboxed without
`allow-same-origin` — is reported as unavailable rather than skipped; the
`<iframe>` element itself is still annotatable from the page around it.

While it is on:

- an overlay draws an outline around whatever the pointer is over, inside
  a **closed** shadow root on an element carrying `data-engelbart`, with
  every style set as a property rather than through a `<style>` element or
  a style attribute, so a strict `style-src` cannot silently blank it;
- the next click is taken by a non-passive capturing listener on the
  window, which runs before the bridge's own document listeners, so the
  application does not get the click and neither does the trace;
- the element is described by the same `describe()` every trace event
  uses, plus up to three ancestors and the frame it is in. There is one
  description of a DOM element in Engelbart (`ElementTarget`) and this is
  it;
- `ui.click`, `ui.change` and `ui.keydown` ignore anything inside
  `[data-engelbart]`. `composedPath()` reaches into a shadow root, so
  being in one is no cover; the marked host is.

Nothing here posts to the events endpoint. That endpoint is open to
anyone holding the preview URL; a researcher's words go from the
workspace's own form to a server action over the signed-in session, and
nowhere else. What crosses the picker's channel is a description of an
element — never a note, a user, a project or a run.

Saved notes are found again with `resolveAnchor`: a test id, then a stable
id, then the stored selector (whose `host >>> rest` hops are resolved one
root at a time, because that is not a `querySelector` string), and only
then a search by tag, role, text and ancestors. Screen position is never
identity. The answer is `resolved`, `approximate` — one clear best match,
but something about it has changed — or `unresolved`, which draws no
marker: a marker on a guess would be a lie about where the note belongs.

## Environment

| variable | process | meaning |
|----------|---------|---------|
| `ENGELBART_TRACE_TOKEN` | model gateway | required; part of the gateway's URL |
| `ENGELBART_TRACE_CAPTURE` | both gateways | `full` (default) or `metadata` |
| `ENGELBART_MODEL_GATEWAY_PORT`, `_BIND` | model gateway | default 43200 on 127.0.0.1 |
| `ENGELBART_MODEL_UPSTREAMS` | model gateway | extra allowed upstream hosts |
| `ENGELBART_REDACT_FILE` | both gateways | JSON of values to redact; deleted once read |
| `ENGELBART_PREVIEW_BIND` | preview gateway | default 0.0.0.0 (the public port) |
| `ENGELBART_BRIDGE_FILE`, `ENGELBART_BRIDGE_CONFIG` | preview gateway | the bridge to serve; tuning for it |
| `ENGELBART_WORKSPACE_ORIGIN` | the app | the origin allowed to turn annotate mode on in a preview; defaults to `https://$VERCEL_URL` or `http://localhost:3000`, and is passed to the preview gateway as `ENGELBART_BRIDGE_CONFIG`'s `parentOrigin` |

## The Trace tab

`lib/trace/timeline.ts` turns the rows into what the tab shows. Rows: one
per interaction with the requests tied to it, the model calls joined
through those requests and the visible changes attributed to it; runs of
keys in one frame folded into a group (every press counted, folded
repeats included); one per model call; one per request nothing claimed;
one per note. Stages, built on the rows: a stretch of clicks and keys in
one document is "Explored <frame>"; a submit-like act (a form submit,
Enter on a text field, a submit button) that sent something is
"Submitted …", with the click into the field and the move into the frame
just before it; a model call is its own stage; changes with text that
appeared after the call, attributed to the same act, are "Response
appeared". Each stage names the model call it is about, if any: its own,
the first tied to the submit, the last before the response. Gateway
startup, documents and frames, requests no interaction claimed and
rerenders (text removed and put back, no text changed) sit under
diagnostics.

The canvas takes the tab, with only the drawer bar and the collapsed
diagnostics under it; the zoom and fit controls sit in the bottom-left
corner and Bart's small window in the bottom-right, floating over the
canvas rather than taking height from it. Choosing a card opens its
details beside the canvas, in a panel down the right of the trace, and
the canvas keeps its full height.

The tab is one canvas (`components/trace/trace-canvas.tsx`, drawn with
React Flow as a read-only renderer: nothing can be dragged, wired or
edited; positions come from `lib/trace/layout.ts`). Every stage is a
card on one line, left to right in time order, all one width, joined by
a line that says only "then"; a pause longer than half a second is
written on it. What a person did is a light card with a pointer
("Human"), a model call is the one dark card ("Model"), what appeared on
screen is a dashed card with an eye ("Observed"). Compact, a card says
its short title and one thing more (`lib/trace/moments.ts`): how long
the exploring took, the text the page echoed after a submit, a call's
latency and whether it streamed, or that it is still streaming. The
selected card is ringed and says one line more (the keys as glyphs with
counts, a call's status and sizes, the first text that appeared);
nothing else on the line moves, and there is no hover tooltip beyond the
browser's own on a cut-short title. Everything else about a moment is
read in the drawer under the canvas. The latest model call is selected
until a card is chosen.

The selected moment's details are `event-details.tsx` for a human or
observed moment and `model-call-inspector.tsx` for a call, wrapped by
`DrawerBody` (`components/trace/trace-drawer.tsx`). Where they stand
follows where the trace is (`behavior-trace.tsx` takes the `slot`): in
the middle they are a panel down the right of the trace, opened by
clicking a card, and the canvas keeps its full height; on the side,
where there is no width to give away, they are the drawer under the
canvas, and a card click there only selects. Closed, the drawer is one
bar for the selected moment: its icon, title and clock, one line, the
call it is tied to with the correlation tag, "Ask Bart" (which opens the
window in the corner of the canvas with the cursor in it) and "Details",
which opens them wherever they belong. A card's context or output node
opens them at the matching pane either way, and the call's panes scroll
sideways rather than wrap, because the panel beside the canvas can be
dragged narrow. The trace
is read once, by `hooks/use-trace-view.ts` in the shell, for the canvas,
the preview's strip and Bart alike; the selection lives in
`hooks/use-trace-selection.ts` (`lib/trace/selection.ts`: a stage id, or
a call id with a pane) and resets when the run changes.

- Inspect reads at three levels. For a human or observed moment
  (`components/trace/event-details.tsx`): the title, the time and the
  duration; the text the page echoed after a submit, marked as observed
  after the submit and never as typed text; the acts by name (clicks by
  their target, keys by name and count); the frame it happened in; the
  model call it is tied to, with the call's state and the correlation
  tag. Everything that rests on ("Show evidence"): the full label, the
  tie in the trace's own words, the frame's path, the rows and the raw
  events. For a model call, the Overview says the model, the latency
  and whether it streamed, the message count, the request and response
  sizes, the submit it was joined to with the correlation, and the
  status; provider and path, first byte and first token, usage, chunks,
  capture mode, ids and the headers wait under "Technical details". The
  Context, Messages, Tools, Output and Raw panes are unchanged.
- The Live preview keeps a strip along its bottom
  (`components/trace/live-strip.tsx`): the last moment's clock, title
  and one line, the count of moments, and "Open trace". It unfolds into
  the list of moments (`live-trace.tsx`: the same stages as the canvas,
  growing while the run is used; an in-flight call says "streaming…" or
  "in flight…" and the same item says its latency once it ends; nothing
  raw is listed). Clicking an item opens the Trace tab with the drawer
  on that moment; "‹ Live preview" on the canvas goes back. The preview
  stays mounted under the trace, so the run is never disturbed.
- "Ask Bart" on a moment brings Bart's input into focus with that moment
  as what "this" means: a "Looking at" line above the input, removable.
  It hands the moment over; it asks nothing and analyzes nothing by
  itself.
- Any tab but the Live preview and the Terminal can be sent to the side
  (`lib/workspace-slots.ts`, pure and tested; the button at the end of
  the tab bar in `components/repo-tabs.tsx`): it then becomes the second
  tab of the right panel, beside Bart (`components/center-panel.tsx`),
  and the middle falls back to the Live preview, so the trace can be
  watched growing while the application is used. The panel shows one of
  its two tabs at a time and comes forward on the arriving one; only
  that tab is mounted, because a hidden panel measures zero and the
  canvas reads its own size to keep the camera. A tab is in one place at
  a time; the one on the side is marked in the middle bar, and choosing
  it there brings it back; the panel header moves it back or closes it.
  The preview stays in the middle because moving its iframe would reload
  the application, and the terminal because moving it would drop the
  shell; the button says so. On the side the trace has no "‹ Live
  preview" button, the preview shows no "Open trace", and a moment's
  details open under the canvas rather than beside it; picking a moment
  in the strip selects it there. The whole panel puts away to a
  rail. Which tab is on the side is remembered per repository with the
  middle tab.

- A selected model call also shows its branches: cards for what the
  captured request carried (`lib/trace/context.ts`), stacked above and
  to its left and feeding it, and the output it produced hanging below
  it. The cards are a presentation of the message array as sent: system
  instructions, prior conversation, the latest input, tools offered, the
  output contract. Only what the request contained gets a card; nothing
  is inferred about where any of it came from. The system prompt is shown
  in sections only where the prompt itself draws a rule or a heading,
  titled from its own labels, for reading; the text is unchanged. One
  call's branches at a time, so a long run stays flat.
- A branch edge means "this was in the request" or "the model produced
  this", nothing else. The line between cards has no arrowheads: its
  order is time. What appeared on screen is never a node of a call's
  graph.
- A tie the trace recorded is drawn for the selected card only, as an
  arc over the line: a submit to the model call joined to it through its
  requests, a response to the call the same act was still waiting on.
  Solid with an arrowhead, "linked", when an id carried the join; dotted
  without one, "by timing", when only timing did. A submit no call was
  joined to, and a response the trace did not attribute, get no arc;
  nothing is tied to the nearest call for being near. The card at the
  other end is marked as related.
- The text on a submit card is what the page showed right after the
  submit, before its first model call, not what was typed: typed
  characters are never recorded. The inspector says so under the quote
  ("Observed in the page after the submit · typed text is never
  recorded").
- Pan by dragging or scrolling, zoom by pinching; the corner controls
  zoom, fit the whole trace, or return to the selected moment. The camera
  moves on its own only when the selected moment and its graph are out of
  view, or when the canvas itself changes size: it slides just far enough,
  or, if they cannot fit at the current zoom, pulls back just enough. A
  pull-back remembers the zoom it left and returns there once a panel
  closes and there is room again; your own pan or zoom lets that go.
- A node opens the call in the drawer at the matching pane.
  The Context pane holds the same decomposition; the Messages and Raw
  panes hold the literal payload, which stays the source of truth.
- What the run recorded and in what mode, the gateways and the bridge,
  the instrumentation applied in the sandbox with its diff, and the rows
  no stage claims all sit under the collapsed Diagnostics bar.

How things are tied together, and what the tab says about it:

- A request carrying `x-engelbart-interaction` is tied to that interaction
  (`explicit`, tagged "linked").
- An API call or server action started within 3 s of an interaction and
  carrying no id is tied to the latest interaction before it, marked
  `temporal` (tagged "temporal"; the tag's tooltip and the stage's detail
  carry the delay and the evidence).
- A model call is tied to the one application request in flight when it
  began (the collector's join, always by timing), and through it to the
  request's interaction.
- A `ui.change` is tied to the latest interaction the bridge knew of
  (by timing).

Nothing in these labels comes from knowledge of a particular application:
frames are named by their name attribute, a single identifier-like query
value, a unique title, their path and query, or their place in the parent
(the rest stays in the details); acts by their tag, text, label or
placeholder.

## Recordings

A recording is a slice of a run's trace between two clock readings, saved
on purpose. It is one row (`engelbart_recordings`: run, project, name,
status, `started_at`, `stopped_at`; migration
`20260920120000_recordings.sql`) and nothing else: no trace event and no
model call is copied, and none carries a recording id. The trace is
captured whether or not anything is being recorded; a recording only
marks where a stretch of it begins and ends.

"● Record" sits in the Live preview's header
(`components/trace/record-control.tsx`). Pressing it writes the row and
starts the clock on the button; "Stop" writes the other boundary and
leaves one line above the preview saying what was saved, with a way to
open it. Neither touches the sandbox, the run or the page in the frame.
One recording is open at a time per run: a partial unique index enforces
it in the database, the hook returns the open one rather than starting a
second, and a reload finds it again instead of duplicating it
(`hooks/use-recordings.ts`, `app/workspace/[workspaceId]/recording-actions.ts`).
Stop is also on the recording's row in the list and in the Trace tab's
header, because the Live preview's button goes away when the run ends and
a recording must never be left with no way to close it. The write
policies bind a recording to its run's own project, so the one-at-a-time
slot on a run cannot be taken from another project.

Inside the Trace tab, a header chooses between "Full trace" and
"Recordings"; the list names each recording, what it holds and when it
was made, and renames or deletes it. Deleting removes the boundaries
only. Opening one shows the same canvas, the same drawer, the same
inspector and the same selection, with only the data scope changed:
`lib/trace/recording.ts` cuts the run's events and calls to the window
and `useScopedTraceView` re-derives rows, stages and calls from them with
the existing functions, passing the whole run's frame index so documents
named before the slice keep their names. A model call belongs to a
recording by when it started, and comes whole even if it was still
answering at Stop, because every event carrying its id follows it; an
event that happened after Stop does not. A call that began before Record
is not in it at all. The counts in the list are derived the same way, not
stored. A moment chosen from outside the open recording (the preview's
strip, a reference in one of Bart's answers) drops back to the full
trace rather than being ringed where it cannot be seen; chosen while the
list is showing, it opens the full trace, since the list has no canvas.
Diagnostics keep describing the run whatever the canvas is cut to, and
name the open recording on a line of their own: the gateways and the
instrumentation are facts about the run, and a recording that starts
after they came up has not stopped them happening.

Bart is told the recording's id, never its contents. While one is open,
its trace tools read the same slice by default and the situation block
lists the recording's moments instead of the run's, so "what did I do in
this recording" and "why did this happen" resolve inside it; a tool can
ask for `scope: "run"` to see the whole run, and the repository, the
README and the source are never scoped. The panel shows which recording
is in scope above its input.

## Bart

Bart is a tab of the right panel, which it shares with whichever tab
was sent over from the middle, and a small window in the corner of the
trace canvas (`components/trace/trace-bart.tsx`). Both are views of one
conversation: `hooks/use-bart-session.ts` holds it for the workspace, so
a question asked beside the evidence is in the panel when you get there
and a half-typed one survives the walk between them. Bart is not in the
middle tab bar, and nothing under the trace canvas is reserved for a
chat. The two surfaces share their parts
(`components/bart/conversation.tsx`, `components/bart/composer.tsx`);
`components/bart-panel.tsx` is the panel, and the window over the canvas
is the same pieces drawn compactly, floating, so opening, closing and
resizing it move neither the canvas nor its camera. That window scrolls
its conversation, sends from its own composer, and is dragged bigger or
smaller from its top-left corner (arrow keys too, once the grip has
focus); it is pinned to the bottom-right, never grows past the canvas,
and the size it was left at is remembered in the browser. It offers
what the selection is ("Ask Bart about this model call…", from
`askPlaceholder` in `lib/bart/labels.ts`), and "Ask Bart about this" in
the drawer bar or the inspector opens it with the cursor in it. Its
panel button hands the same thread to the right panel. What
travels with a question is identity only: the run, the repository, the
selected stage or call, and the open recording. It answers from
three sources through tools, never from a dump of them: the trace, the
captured model calls and the repository. `app/api/bart/route.ts` takes
a question with what is in the middle named by id (project, repository,
run, selected moment), writes a short situation (`lib/bart/prompt.ts`:
the repository, the run and its capture mode, the selected moment, and
one line per moment of the run with its id and the tie the trace
recorded) and lets the model fetch with `lib/bart/tools.ts`:
`run_overview`, `inspect_moment`, `inspect_model_call` (a part at a
time: summary, the system prompt in the sections it marks, messages,
tools, output, settings, raw bodies; long parts are cut with an offset
to continue), `compare_model_calls` (the differences computed, not
narrated), `search_trace`, `read_readme`, `repo_tree`, `read_repo_file`
and `search_repo`. The trace tools are `lib/bart/grounding.ts`, the
same derivations the tab shows written as text that names things by id
and says how a tie was made ("by an id the request carried" or "by
timing; an association, not proof"); the echo after a submit is marked
as what the page showed, never as typed text. The repository tools
(`lib/bart/repo.ts`) read the live sandbox first (`git ls-files`, the
file, `git grep -F -i`) and GitHub when the run is down (for search, a
bounded read of the likeliest source files, and the answer says so);
environment files and keys are never read, and the repository's saved
environment values are struck from anything returned. The answer
streams as server-sent events along with the tools it runs; tool output
is data to the model, never instructions, and the prompt says so.

An answer cites with tokens (`lib/bart/protocol.ts`):
`[[moment:<stage id>]]`, `[[call:<call id>:<pane>]]`,
`[[file:<path>#L<from>-L<to>]]`, `[[readme]]`. The panel renders them as
chips (`components/bart-markdown.tsx`) labelled from the trace
(`lib/bart/labels.ts`); a chip opens the moment or the call in the
Trace tab with the drawer on it, the file in the Code tab, or the
README. The provenance categories (trace, captured request, source,
inferred) live in the tool text and the references; Bart is asked to
write naturally, to say "the trace shows" or "I would infer" where it
matters, and never to present a temporal tie as a cause.

Conversations persist per workspace in `engelbart_bart_threads` and
`engelbart_bart_messages` (migration `20260920100000_bart_threads.sql`;
row-level security through the project, like the repositories; each
user message keeps the run, repository and selection it was asked with,
so a thread can later span runs). `lib/bart/store.ts` reads and writes
them, `bart-actions.ts` loads the latest thread on arrival and starts a
new one on Clear, `hooks/use-bart.ts` streams a turn. The models Bart
can use are one list, `lib/bart/models.ts`, shown in the panel's picker
and checked by the route; the server reads `ANTHROPIC_API_KEY`. The
line under the input says what is sent to Anthropic.

## Tests

`npm test` runs everything under `tests/trace/`: the gateways against
fixture upstreams, the bridge in jsdom, annotate mode in a framed jsdom
document served on its own origin (the origin is the whole question, and
jsdom gives a blank frame an opaque one), the collector against a fake
database, the timeline model. Annotations themselves are under
`tests/annotations/` and `tests/bart/annotations.test.mts`. The events endpoint is as public as the
preview itself; it can only add events to the run whose gateway received
them, never read anything.
