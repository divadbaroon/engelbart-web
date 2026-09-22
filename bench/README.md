# Benchmark

Forty repositories from `Eval.xlsx`, each with the kind of evaluation its
author expects and their known constraints, run through the real pipeline
and graded against those constraints.

    python3 scripts/bench/extract-manifest.py ~/Desktop/Eval.xlsx   # → bench/manifest.json

Create a project named Benchmark in the workspace, make sure one worker is
running, then:

    npm run bench -- all --project Benchmark --pass p1                 # add, queue, wait, collect, stop
    npm run bench:grade -- --pass p1                                   # labels with reasons, via Claude
    npm run bench:report -- --pass p1 --workspace <projectId>          # bench/results/p1.html

A second pass replays the saved trails; compare the two:

    npm run bench -- all --project Benchmark --pass p2
    npm run bench:grade -- --pass p2
    npm run bench:report -- --pass p2 --compare p1

## Two arms

`--variant` says how a pass's runs may recover when the pipeline cannot
start the repository: `ladder` is the rungs a run has always climbed (a
repair agent, then a resolver, then a setup agent), `session` is one
continuing agent session. It is written on each queued run, so two arms
can be run over the same repositories rather than on two different days:

    npm run bench -- all --project Benchmark --pass ladder1  --variant ladder
    npm run bench -- all --project Benchmark --pass session1 --variant session
    npm run bench:grade  -- --pass session1
    npm run bench:report -- --pass session1 --compare ladder1

Without the flag the column is left unset, which is what every run made
before the choice existed says, and the worker's own default stands.

The two arms are matched by repository and **not by commit**. Nothing pins
a revision: the clone takes the default branch's HEAD at the moment it
runs. Each record carries the commit it landed on and the comparison marks
the repositories where the two passes read different code, which is the
only way to tell afterwards.

`--compare` compares the two properly rather than appending the other
pass's seconds: grade, the cause a failure was blamed on, what the agent
calls cost, whether model capture was working, and time as both a median
and a nearest-rank p90. Runs that replayed a saved trail and held it are
counted apart from runs that went through the pipeline, because a replay
makes no agent calls at all and would otherwise flatten the cost.

The steps can be run one at a time (`add`, `queue`, `wait`, `collect`,
`stop`) and narrowed with `--only web_preview,simulation` and `--limit N`.
`stop` kills the sandboxes of the pass's running apps so they do not keep
billing; `collect` first probes each preview and saves a screenshot under
`bench/results/<pass>/`.

Records are one JSON object per repository in `bench/results/<pass>.json`:
outcome, time per step, runner image, local Supabase result, missing
values, repair attempts and patch, preview HTTP status and title, and the
grade with its reason. Three of them describe the pass itself: `variant`,
read back off the run row rather than taken from the flag; `capture`, the
least capable thing any realm said about watching the run's model calls,
where `unreported` means nothing said either way; and `modelCalls`, how
many were caught.
