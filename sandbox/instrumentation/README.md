# Sandbox-only instrumentation

A research artifact sometimes cannot be observed without a change to its
code: ROPE, for one, writes its model provider's base URL into a server
action, so no environment value can route its calls through Engelbart's
model gateway. What lives here is the smallest edit that makes such a
route configurable, with the artifact's own behavior kept as the default.

Rules, all of them checked by the wrapper that applies these:

- One diff per repository, keyed by `owner/name` in `index.json`, applied
  only when the run is traced.
- Applied to the sandbox copy before anything reads it, and committed there
  as "engelbart: sandbox-only instrumentation, never upstream", so the
  repair agent's diffs and the saved trail never carry it.
- Reported in full in the run's event log and trace, with the reason.
- No behavior change beyond routing: the patched code must do exactly what
  it did before when the environment value is absent.
- Never committed upstream, never suggested to the person as a fix.

`environment` names what the wrapper hands the application once the patch
is in; `{gateway}` becomes the run's model gateway URL, token included.
`upstreams` lists the hosts the artifact already talked to, which the
gateway then allows.
