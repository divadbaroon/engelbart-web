// What the instrument records, and what it can never record, for any artifact.
//
// Kept verbatim from the artifact-profile bench, which is frozen: this
// is the same text the two blind runs were given. Embedded as a module
// rather than read from disk so it survives bundling.
export const INSTRUMENT_DOC = `# What the recording is, and what it cannot contain

A generic collector sits between the browser and the application. It is the same
collector for every artifact and knows nothing about this one. It was injected by a
proxy; the application's own bytes were not modified.

## What it records

- \`ui.click\` — a click, with a description of the element and of the nearest control
  containing it.
- \`ui.key\` — a key press. Named keys (Enter, Escape, Tab, arrows, function keys) are
  recorded by name. Printable characters typed into a text field are recorded only as a
  class and a count. Repeats of the same key fold into one event with a count.
- \`ui.input\` — a text field changed. Two kinds: \`editing: true\` events are emitted while
  somebody types, folded per field, carrying \`edits\` (how many changes) and
  \`valueLength\`; a \`commit: true\` event is emitted when a field's value is committed.
  **The characters are never recorded.** A password field reports neither its contents
  nor its length.
- \`ui.submit\` — a form submitted.
- \`ui.change\` — a burst of DOM changes, closed after a quiet period. Carries counts, a
  sample of text that appeared and text that was removed, the lowest element containing
  all of the changes (\`container\`), and \`regions[]\`: for each changed subtree the nearest
  ancestor that says what it is, with the text that appeared inside it and up to two
  further candidate ancestors (\`within\`).
- \`ui.route\` — the document's path changed.
- \`frame.served\`, \`frame.loaded\`, \`frame.attached\` — documents appearing.
- \`network.request\` / \`network.response\` — requests the application made, with paths,
  status, latency and sizes. Query **values** are stripped; only the keys survive.

## What it does not record, for any artifact

- **No pointer movement, no drag, no wheel, no scroll, no hover.** A mouse moved across
  the screen, a canvas dragged, a page scrolled and a wheel turned all leave no trace.
- **No window focus or visibility.** Time in front of an unchanging screen and time away
  from the desk are indistinguishable.
- **Nothing inside a \`<canvas>\`.** Its contents, what it is drawing and what is visible in
  it are never known. A click on a canvas is recorded as a click on a canvas.
- **No typed characters, ever.** Only that a field changed, how many times and to what
  length.
- **No element the application never puts in the DOM.** State held only in JavaScript
  variables or GPU memory is invisible.

A description written against something in that second list can never be true of a
recording, because the recording cannot contain it.

## How this artifact was launched

Upstream repository at its own commit, unmodified. \`npm install\`, then the repository's
own \`vite\` dev server bound to the loopback interface on a fixed port. No file in the
artifact was edited, no attribute was added, and no instrumentation of any kind was
inserted into it.
`;
