# Sandbox-only instrumentation

A research artifact sometimes cannot be observed without a change to its
code: it writes its model provider's base URL into its source, so no
environment value can route its calls through Engelbart's model gateway.
What lives here is the smallest edit that makes such a route
configurable, with the artifact's own behavior kept as the default.

**The registry is empty, and that is the point.** ROPE was the one entry
here, for exactly the reason above. Since 2026-09-20 model capture
reaches an unmodified Node application through a preload hc delivers as
a launch capability (`sandbox/trace/preload.cjs`, `sandbox/trace/CAPTURE.md`),
so ROPE's model calls are read with its source untouched — proven by
`npm run capture:check` against a pristine clone and by a traced run
through the normal machinery. This mechanism stays for the artifact that
the preload cannot reach: one that is not Node, or that will not take a
preload. Adding an entry means an artifact is being edited to be
watched, which is a decision worth making deliberately, so anything
registered here should also say why capture could not do it.

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
