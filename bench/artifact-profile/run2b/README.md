# Run 2B — the same three wizmap sessions, recorded again with Runtime v3

Run 2 showed that artifact understanding and profile generation generalized to
wizmap, and that the blocker was below the profile: the segmenter could not cut
at a deed, and a continuous spatial interface left almost no trace at all.
Runtime v3 addressed those two things generically. Run 2B measures the result.

**Nothing about Run 2 was regenerated, retuned or touched.** The profile read
here is `../run2/profile.json`, byte-for-byte, mode `444`. Run 1 and Run 2 are
unchanged since the moment they were frozen.

## Design

The three session drivers are the **same file** as Run 2's, byte-for-byte
(`sha256 649fdfa2…`), so the same actions were performed in the same order with
the same pauses. The only variable is the runtime. That makes two comparisons
possible, and they are kept apart throughout:

- **A — segmentation.** Run 2's own trace files, re-read with Runtime v3. The
  evidence is identical; only the cutting changed.
- **B — gesture evidence.** Run 2B's fresh trace files, which contain
  `ui.wheel` and `ui.drag` events that Run 2 could not record at all.

Read `SIDE-BY-SIDE.md` for the rows and `GESTURES.md` for the raw gesture
evidence and what the frozen profile said over it.

## What is here

| | |
|---|---|
| `sessions/*.jsonl` | what the gateway wrote, one JSON batch per line |
| `sessions/*.json` | the same, through the collector, as a run |
| `harness/` | the recorder, the drivers, the collector, the readers |
| `SIDE-BY-SIDE.md` | Run 2 frozen · A · Run 2B, with every Activity row |
| `GESTURES.md` | every episode carrying gesture evidence, and its reading |

| session | run id | events | wheel | drag | sha256 |
|---|---|---|---|---|---|
| discovery | `wizmap-discovery` | 36 | 1 | 2 | `88b9df94cc2fe3bb…` |
| search | `wizmap-search` | 39 | 1 | 1 | `0004eb43fcda8d0e…` |
| controls | `wizmap-controls` | 40 | 1 | 3 | `1dcf71c0cee92855…` |

## Limitations, unchanged from Run 2

These are driver sessions, not human recordings. The pauses are real waits, so
the silences are real silences, but a script is not a person. The artifact is
pristine wizmap behind the generic preview gateway; nothing was added to it.
