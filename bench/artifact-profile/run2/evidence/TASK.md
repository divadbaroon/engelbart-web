# Describe this software as an ArtifactProfile

You are given a piece of research software and a recording of one person using it. Nobody has
told you what it is. Your job is to work that out from the software and the recording, and to
write down what you learn in the format described in `SCHEMA.md`.

What this is for: a research tool observes people using software from papers, and turns each
recording into a readable timeline — stretches of time, each named with what the person was
doing. It can only do that if something tells it what the software's parts mean. That is the
profile you are writing. It will be run against **other recordings of this same software that
you will never see**, so write it to describe the software, not to fit this one afternoon.

## What you have

Everything is under this directory. Read as much of it as you need.

- `artifact/` — the software's own repository, at the commit that was run. Its README, its
  source, its configuration. **This is your best evidence.** The people who wrote it named
  things; use their names. (The datasets it loads at runtime are large and are not copied
  here; the code that loads them is.)
- `evidence/00-how-the-recording-works.md` — what the instrument records and what it can
  never record, for any software. Read this early: it tells you which of your ideas can be
  tested against a recording at all.
- `evidence/01-repo-tree.md` — every file in the repository.
- `evidence/02-raw-dom.md` — the document itself, every element and every attribute, in tree
  order, at four moments of the interface's life. No instrument in the way.
- `evidence/03-dom-survey.md` — the same page as the instrument describes it: the fields a
  rule can actually be written against. It stops after 120 elements, so it is a sample of
  descriptions, not a census of the page.
- `evidence/04-attributes.md` — every attribute the interface uses, counted, with the values.
- `evidence/05-discovery-session.md` — the recording itself, every row, every field, in order.
- `evidence/06-regions.md` — for each burst of change in that recording, where on the page it
  happened and what text appeared there.
- `SCHEMA.md` — the format, in full. Read it before you write anything.

## Rules

**Use only what is in this directory.** Do not read anything outside it, do not search the
wider filesystem, and do not fetch anything. If you find yourself wanting a file that is not
here, note what you wanted and why, and carry on without it.

**Work out the software's own vocabulary and use it.** The `sub` name of a rule should be what
somebody who works on this software would call that behaviour. Do not translate into generic
web words, and do not invent a product name.

**High precision beats coverage.** A stretch left to the fallback costs a row of "not
characterised". A stretch confidently named wrong is a false claim in a research tool, and it
is much worse. Where the evidence would support two readings, either write the rule so it only
fires when the evidence distinguishes them, or do not write it.

**Say nothing a recording cannot show.** No intent, no understanding, no belief, no whether
something worked. What was done, named.

**Abstractions are allowed, and must be cited.** If you name something the software never
names, mark it `grounding: "abstraction"` and say in `note` which pieces of evidence have it in
common. If you believe something you cannot point at, mark it `grounding: "inference"` and say
so. Do not dress an inference as a source.

**Prefer stable anchors.** Work down the rungs in `SCHEMA.md`. Where you must use a generated
CSS path, mark that element's `generation.confidence` accordingly and say in `note` what you
looked for first and did not find.

**One recording is a sample, not the software.** Something used once in this recording is not
therefore rare; something absent from it is not therefore absent from the software. The
repository tells you what exists; the recording tells you what a session looks like.

## What to produce

Two files, written to the output directory you were given:

1. `profile.json` — one ArtifactProfile, valid against `SCHEMA.md`. Nothing else in the file.
2. `NOTES.md` — what you worked out and how, in your own words. What the software is. What you
   were confident about and what you were not. Anything you wanted to express and the format
   would not let you. Anything you looked for in the evidence and could not find. Any rule you
   considered and decided not to write, and why.

Write `NOTES.md` as if to somebody who will read your profile later and need to know how much
to trust each part of it.
