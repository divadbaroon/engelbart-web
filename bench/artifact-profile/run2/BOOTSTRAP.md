# Getting wizmap to run, and what that cost

Step 2 of the Run 2 procedure allows generic start-script repair and requires it
to be documented separately from semantic instrumentation. This is that
document. **No file inside `artifact/` was edited.** Both items below are
arguments to the command that starts the artifact's own dev server.

## 1. Port

`vite` defaults to port 3000 in this repository's configuration, which is
already taken on this machine. The server was started with `--port 4310
--strictPort`. A port number is not part of what the artifact is.

## 2. Loopback address

Started without an explicit host, this version of `vite` binds IPv6 only, and the
recording gateway connects over IPv4 loopback. The server was started with
`--host 127.0.0.1`.

Full command, run inside `artifact/`:

```
npx vite --port 4310 --strictPort --host 127.0.0.1
```

## What was *not* done

- No DOM attribute was added to any element — no `data-testid`, no
  `data-*-id`, no `aria-label`, no `id`.
- No event hook, listener, logger or annotation was inserted.
- No source file was patched, no build configuration changed, no dependency
  substituted.
- No activity label, stage name or behaviour name exists anywhere in the
  artifact or the harness.

The collector reached the page the same way it reaches any artifact: a proxy in
front of the dev server injected the generic bridge into the HTML response. The
artifact's own bytes were unchanged; only the response had a script tag added on
the way through.

## Data

wizmap ships 146 MB of embedding data under `public/data`, and the default
dataset (`acl-abstracts`) resolves to `/data` when the dev server is running. The
artifact therefore runs fully offline with no external service, no API key and
no account. That copy of the data was left in place for the recordings and
excluded from the evidence pack, which carries the code that loads it.
