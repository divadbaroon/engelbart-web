# The ArtifactProfile format

A profile says what an interactive piece of software *means*, as data. A generic runtime
compiles it and uses it to read a recorded session into a list of episodes — stretches of
time, each named with what somebody was doing.

The profile is JSON. It contains no code, no functions and no regular expressions.

```ts
type ArtifactProfile = {
  version: 1;
  artifact: { name: string };
  provenance: { by: "generated"; model?: string; note?: string };
  surfaces: SurfaceSpec[];   // ordered; first match wins
  channels: ChannelSpec[];   // ordered; first match wins
  controls: ControlSpec[];   // all matches collect
  keySets?: KeySetSpec[];
  rules: RuleSpec[];         // explicit priority; lower goes first
  fallback: FallbackSpec;    // what is said when no rule reads a stretch
};
```

`FallbackSpec` is a `RuleSpec` without `when` and without `priority` — it is what is
left when nothing else read the stretch, so it has no condition and no place in the
order. It still needs an `id`:

```ts
type FallbackSpec = {
  id: string;
  sub: string;
  broad: Broad;
  description: Template;
  because: Template;
  confidence: Confidence;
  generation?: Provenance;
};
```

## Testing a string

```ts
type StringTest =
  | { equals: string | string[] }
  | { prefix: string } | { suffix: string } | { contains: string }
  | { glob: string }        // `*` matches any run of characters AND captures it
  | { present: true };      // the field exists and is not empty
```

Identity-ish fields (`testid`, `appId`, `appIdAttr`, `elementId`, `role`, `fieldName`,
`inputType`, `editable`, `href`, `tag`, `classes`, `selector`) compare exactly. Wording fields (`text`, `label`,
`placeholder`, `title`, and a role's `name`) collapse whitespace and ignore case.

## Pointing at an element

```ts
type Anchor =
  | { testid: StringTest }                          // rung 1
  | { appId: StringTest }                           // rung 1 — see below
  | { elementId: StringTest }                       // rung 1
  | { appIdAttr: StringTest }                       // rung 2 — see below
  | { role: StringTest; name?: StringTest }         // rung 2 — name is the accessible name
  | { label: StringTest }                           // rung 2
  | { fieldName: StringTest }                       // rung 3 — the [name] attribute
  | { inputType: StringTest }                       // rung 3
  | { placeholder: StringTest }                     // rung 3
  | { editable: StringTest }                        // rung 3 — "text" | "password" | "editor"
  | { title: StringTest }                           // rung 4
  | { href: StringTest }                            // rung 4
  | { text: StringTest }                            // rung 4 — visible words, falling back to the label
  | { tag: StringTest }                             // rung 5
  | { classes: StringTest }                         // rung 5 — matches if any class passes
  | { selector: StringTest }                        // rung 6 — a generated CSS path. LAST RESORT.
  | { all: Anchor[] } | { any: Anchor[] } | { not: Anchor };
```

`testid` is whichever of `data-testid`, `data-test-id`, `data-test`, `data-cy`,
`data-qa`, `data-qa-id`, `data-e2e` or `data-test-selector` the element carries.

`appId` and `appIdAttr` are the application's own name for an element, taken from a
`data-…-id` attribute whose value reads like an identifier. `appId` is the **value** and
`appIdAttr` is the **attribute it came from**. They are different facts: on
`data-cell-id="b7"`, `appId` is `"b7"` and `appIdAttr` is `"data-cell-id"`. Where an
interface is made of many of something, the value names one of them and the attribute
names the kind, which is the same on all of them — so a rule about *a cell* is written
against `appIdAttr` and a rule about *that cell* against `appId`.

**Prefer the lowest rung number you can.** A test id or an id is what the interface chose to
call something and survives a redesign. A role with an accessible name is what the element
tells assistive technology it is. Visible words survive only until somebody edits the copy.
A generated CSS path like `main > div:nth-of-type(2) > div` says only where the element sat on
the day the recording was made, and stops being true the moment the layout moves. Use it when
nothing else identifies the element, and expect to be told you did.

## Documents

The collector keys each browser document: its `?id=` or `?name=` query value where it has one,
else its frame name, else its position among its parent's iframes, else its path. `"top"` means
a stretch that happened on no document at all.

```ts
type SurfaceSpec = {
  id: string;
  match: StringTest;          // against the document key
  label: string;              // "{key}" is the whole key; "{1}", "{2}" are what globs captured
  role: "shell" | "own" | "reference" | "other";
  generation?: ElementProvenance;
};
```

`role` is the one piece of vocabulary the runtime shares across all software:

- `shell` — the application's own main document.
- `own` — a document holding something the person themselves produced or is producing.
- `reference` — a document holding something given to them to look at, that they did not make.
- `other` — anything else. A document no spec matches gets `other` and its raw key as a label.

## Text arriving on screen

Typed characters are never recorded anywhere. A field reports that it changed and how long its
value is, never the value. So the only record of what a person submitted is the text the
application echoed back onto the screen — which means telling the person's words from the
software's words is a matter of *where on the page they were written*.

```ts
type ChannelSpec = {
  id: string;
  label: string;              // "the log", "their notes" — a noun phrase, lowercase
  from: "system" | "person";  // whose words these are
  container?: Anchor;         // matched against the element the text arrived in
  text?: StringTest;          // matched against the text itself
  generation?: ElementProvenance;
};
```

At least one of `container` / `text` is required. A channel marked `from: "person"` is what
lets the runtime recover a submitted message at all; without one, nothing a person sent can
ever be quoted.

## Controls

```ts
type ControlSpec = {
  id: string;
  label: string;              // "the Send button" — how you would refer to it in a sentence
  moment?: boolean;
  anchor: Anchor;
  generation?: ElementProvenance;
};
```

`moment` is the difference between a door and a deed. Most controls are how somebody got
somewhere: clicking a tab is not a thing they did, it is the way into the stretch that follows,
and it belongs to that stretch. Some controls *are* the thing they did — starting a run,
resetting, submitting, signing in — and deserve their own stretch however briefly it took.

This matters mechanically: the segmenter folds any stretch shorter than 2.5 seconds into
whatever came next, **unless** a `moment` control was used in it. Mark a control `moment: true`
when using it is an act worth a row of its own. Mark it false (omit it) when it is navigation.
Getting this wrong in either direction is visible: too many moments and the timeline fills with
one-second rows; too few and a real act disappears into its neighbour, or worse, names it.

## Named key sets

```ts
type KeySetSpec = { id: string; label: string; keys: string[] };   // browser key names, exact
```

Browser key names are a fixed vocabulary and mean nothing on their own. What `ArrowLeft` *does*
in a particular piece of software is something only that software can tell you.

## Rules

```ts
type RuleSpec = {
  id: string;
  sub: string;          // THIS SOFTWARE'S OWN NAME for the behaviour, SCREAMING_SNAKE_CASE
  broad: Broad;         // one of the nine below
  priority: number;     // lower goes first; must be unique
  when: Pred;
  description: Template;
  because: Template;
  confidence?: Confidence | { cond: {when: Pred, then: Confidence}[]; else: Confidence };
  note?: string;
  generation?: ElementProvenance;
};
```

The first rule whose `when` is true reads the stretch. Nothing else runs. **Priority is the
whole of the ordering** — a rule about how a stretch was entered must sit below a rule about
what was done in it, or a stretch of real activity gets named after the button that opened it.

### The nine broad classes

These are fixed. They are the part meant to hold for any interactive software.

- `ORIENTING` — Figuring out what the interface or task is, where things are, or what to do.
- `UNDERSTANDING` — Taking in information: instructions, feedback, explanations, examples or reference material.
- `EXPLORING` — Interacting with something in order to discover how it behaves.
- `FORMULATING` — Constructing an answer, idea, description or other piece of work.
- `EVALUATING` — Checking or comparing work against feedback, evidence, behaviour or a reference.
- `REVISING` — Changing existing work based on something learned or observed.
- `ACTING` — Carrying out an already-decided action: submitting, generating, advancing, switching view.
- `WAITING` — Waiting for a model call, a system operation or another party to finish.
- `UNCLEAR` — There is not enough evidence to characterise the activity reliably.

### What a rule may ask

```ts
type Pred =
  | { all: Pred[] } | { any: Pred[] } | { not: Pred } | { always: true }
  | { flag: "observed"|"composing"|"submitted"|"awaiting"|"discontinuity"|"call"|"entered" }
  | { surfaceRole: ("shell"|"own"|"reference"|"other")[] }
  | { acts: { of: ActField[]; op: Op; value: number } }      // sums the named counts
  | { duration: { op: Op; ms: number } }
  | { quiet: { op: Op; ms: number } }                        // ms in which nothing was recorded
  | { openingQuiet: { op: Op; ms: number } }                 // silence before the first act
  | { quietRatio: { op: Op; value: number } }                // silence as a share of the stretch, 0..1
  | { controlUsed: string[] }                                // this control was used anywhere in it
  | { enteredBy: string[] }                                  // this control was how the stretch was entered
  | { keysIn: string }                                       // a key of this set was pressed
  | { channelSaid: string }                                  // this channel said something NEW here
  | { latestChannelSaid: string }                            // ...anywhere earlier in the session
  | { index: { op: Op; value: number } }                     // position in the session; 0 is the first
  | { history: { window: 1 | number | "all"; test: EpisodeTest } };

type Op = "eq" | "ne" | "lt" | "lte" | "gt" | "gte";
type ActField = "keys" | "clicks" | "typing" | "submits" | "navigations";

type EpisodeTest =
  | { all: EpisodeTest[] } | { any: EpisodeTest[] } | { not: EpisodeTest }
  | { sub: string[] } | { broad: Broad[] }
  | { surfaceRole: (...)[] } | { channelSaid: string };
```

The evidence flags, precisely:

- `observed` — anything at all was recorded in this stretch. False means silence, and silence
  cannot be read: time in front of an unchanging screen and time away from the desk look alike.
- `composing` — this stretch was time in front of a text-entry surface with nothing sent yet.
- `submitted` — the send itself happened here. True of the sending, never of the writing
  before it or the waiting after.
- `awaiting` — a stretch spent with a model call open.
- `call` — a model call is attached to this stretch.
- `entered` — a submitted message was recovered (needs a `from: "person"` channel).
- `discontinuity` — the document was replaced and the session picked up again.

`acts.typing` counts committed field changes, not keystrokes: a text area may report **no**
typing at all across a minute of writing. Do not use it as the test for whether somebody was
writing; use `composing`.

### What a rule says

```ts
type Template =
  | { lit: string }
  | { join: Template[] }
  | { duration: true }                                        // "6s", "2m 2s"
  | { count: { of: ActField[]; one: string; many?: string } } // "1 click", "4 clicks"
  | { quote: { source: TextSource; max: number } }            // the first sentence, clipped, in quotes
  | { field: "surfaceLabel" | "discontinuity" }
  | { keys: { in: string; join?: string } }                   // the keys of that set that were pressed
  | { cond: { when: Pred; then: Template }[]; else: Template };

type TextSource = { channel: string } | { entered: true } | { latestChannel: string }
                | { firstOf: TextSource[] };
```

There is deliberately no way to put a bare number in a sentence. Use `count`, which takes the
singular and the plural, so a sentence never reads "1 clicks".

`description` is what a researcher sees: one sentence, past tense, saying what was done.
`because` is the evidence for it, as a lowercase clause with no full stop: "a submit was
recorded in the trace", "the panel was open for 40s with no controls used".

**Never write why somebody did something.** "Dragged the slider back and forth" is a
description. "Dragged the slider back and forth to work out what it controlled" is a claim
about a mind, and nothing in a recording supports it. Everything above this layer reads these
sentences as fact.

### Confidence

`high` — the act itself is in the recording. `medium` — the act is not, but the evidence admits
few other readings. `low` — a reading we would rather not assert; prefer UNCLEAR instead.

## Provenance

Every surface, channel, control, key set and rule may carry:

```ts
type ElementProvenance = {
  confidence: "high" | "medium" | "low";   // how sure you are about THE SOFTWARE
  grounding: "source" | "abstraction" | "inference";
  ev?: EvidenceRef[];
  note?: string;
};

type EvidenceRef =
  | { kind: "repo"; path: string; line?: number; note?: string }
  | { kind: "survey"; ord?: number; note?: string }
  | { kind: "trace"; seq?: number; eventKind?: string; note?: string }
  | { kind: "brief"; field: string; note?: string }
  | { kind: "paper"; note?: string };
```

- `source` — the term or the fact is in the evidence. Cite where.
- `abstraction` — the exact word is not in the evidence, but it names something several pieces
  of evidence have in common, and you can say which. **This is allowed and expected.** Software
  that never uses the word "conversation" may still have one.
- `inference` — you believe it, and you cannot point at what would show it. Allowed, reported
  loudly, and the first thing a reviewer will question.

This confidence is about the software. It is not the confidence a rule puts on a reading of one
stretch of one session. Do not conflate them.

## What is checked before it runs

Undefined control / channel / key-set ids; duplicate ids; duplicate priorities; a broad class
outside the nine; a surface role outside the four; a label with a `{1}` its match cannot fill;
unknown or ambiguous anchor, predicate or template forms; a `cond` with no `else`. Warnings for
anchors that rest only on a generated CSS path, and for anything marked `inference`.
