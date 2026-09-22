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

The steps can be run one at a time (`add`, `queue`, `wait`, `collect`,
`stop`) and narrowed with `--only web_preview,simulation` and `--limit N`.
`stop` kills the sandboxes of the pass's running apps so they do not keep
billing; `collect` first probes each preview and saves a screenshot under
`bench/results/<pass>/`.

Records are one JSON object per repository in `bench/results/<pass>.json`:
outcome, time per step, runner image, local Supabase result, missing
values, repair attempts and patch, preview HTTP status and title, and the
grade with its reason.
