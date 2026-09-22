#!/usr/bin/env python3
"""Run hc's project pipeline on a cloned repository, headlessly, inside a sandbox.

Drives the same calls the hc browser page makes (discover, analyze or run
order, run, approvals) and reports progress as one JSON object per line on
stdout, which the web app turns into run events. Everything the pipeline
would ask a person is answered the sandbox way: approvals are granted and
missing environment values are skipped.
"""
import json
import os
import re
import shlex
import shutil
import signal
import subprocess
import sys
import time
import uuid
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, urlunsplit
from urllib.request import Request, urlopen

# Every answer the planner and the runner can settle on. A planner answer
# outside this list once kept the wrapper polling until the deadline.
TERMINAL_ORDER = ("done", "needs_input", "unsupported", "no_service", "error")
TERMINAL_RUN = ("failed", "needs_input", "unsupported", "no_service")


# --- Agents: which model each rung runs on, and the most one call may spend.
#
# The rungs, cheapest first: the brief (one call, no tools, once per commit),
# hc's own planner and repair agent, the resolver (one call with the whole
# repository in view, when the planner gives up), and the setup agent (a
# shell, when nothing else will start it). Every call reports its cost.

def setting(name, default):
    return os.environ.get(name) or default


BRIEF_MODEL = setting("HC_BRIEF_MODEL", "sonnet")
RESOLVER_MODEL = setting("HC_RESOLVER_MODEL", "opus")
REPAIR_MODEL = setting("HC_REPAIR_MODEL", "sonnet")
SETUP_MODEL = setting("HC_SETUP_MODEL", "sonnet")
SETUP_RETRY_MODEL = setting("HC_SETUP_RETRY_MODEL", "opus")
BRIEF_BUDGET = float(setting("HC_BRIEF_BUDGET_USD", "0.5"))
RESOLVER_BUDGET = float(setting("HC_RESOLVER_BUDGET_USD", "2"))
REPAIR_BUDGET = float(setting("HC_REPAIR_BUDGET_USD", "6"))
SETUP_BUDGET = float(setting("HC_SETUP_BUDGET_USD", "8"))
COSTS = []   # every agent call this run: rung, model, cost, turns, seconds

# How this run recovers when the pipeline cannot start the repository.
#
# "ladder" is the four rungs above, each a separate call that reads a
# summary of the one before it. "session" is one agent session that keeps
# everything it learned across the whole recovery — it diagnoses, edits,
# installs, starts things to see what happens, and answers with a launch
# description the pipeline then performs. Anything unrecognised is the
# ladder, so a sandbox built before this existed still runs.
#
# The budget is for the session as a whole rather than per call: a
# conversation that keeps its context makes several calls where the ladder
# made one each, and a per-call cap would simply be multiplied by the
# rounds. What is left of it is passed to each turn.
RECOVERY = "session" if setting("HC_RECOVERY", "ladder") == "session" else "ladder"
RECOVERY_MODEL = setting("HC_RECOVERY_MODEL", "opus")
RECOVERY_EFFORT = setting("HC_RECOVERY_EFFORT", "high")
RECOVERY_BUDGET = float(setting("HC_RECOVERY_BUDGET_USD", "12"))
RECOVERY_ROUNDS = int(setting("HC_RECOVERY_ROUNDS", "3"))
# When the runner stops watching, as seconds since the epoch, handed in by
# lib/runtime/e2b.ts. Nothing here invents one: unset means the caller has
# no deadline to keep (a test, a local drive) and every timeout below is
# its own fixed one, exactly as it was.
DEADLINE_AT = float(setting("HC_DEADLINE_AT", "0")) or None
SAVE_RESERVE_S = 120    # held back from every bound, so there is time to write down what was done
MIN_ROUND_S = 180       # a round shorter than this cannot read a repository, let alone fix one
# Fast mode is a Claude Code setting rather than a flag, so it is passed
# as one. Off unless asked for: it is the thing being compared, not a
# default, and it prices tokens differently.
RECOVERY_FAST = setting("HC_RECOVERY_FAST", "") in ("1", "true", "yes", "on")

# --- The behavior trace. When the worker runs a model gateway for the run,
# the repository's registered sandbox-only instrumentation is applied and
# the application is handed the gateway's URL under the names the
# registry lists. Nothing here runs when the run is not traced.
INSTRUMENTATION_DIR = os.environ.get("ENGELBART_INSTRUMENTATION_DIR") or "/opt/engelbart/instrumentation"
INSTRUMENT_COMMIT = "engelbart: sandbox-only instrumentation, never upstream"
TRACE_ENV = {}        # values Engelbart hands the application so its model calls pass through the gateway
TRACE_NAMES = set()   # their names, for the environment report

# The other way model calls can be watched, and the one that leaves the
# repository alone: a Node preload in the application's own process,
# delivered by hc as a launch capability rather than written into the
# artifact. The file is root-owned in the image, so nothing running as
# the application's user — including a repair agent — can change what it
# does. See sandbox/trace/preload.cjs.
PRELOAD = os.environ.get("ENGELBART_PRELOAD") or "/opt/engelbart/trace/preload.cjs"
# The name the preload looks for before it does anything at all. It
# holds this run's gateway URL, so it is at once the authorisation to
# arm and the place to send what is seen; a process without it is not
# this application and stays untouched.
CAPTURE_MARKER = "ENGELBART_MODEL_CAPTURE"


def agent(rung, prompt, model, budget, tools=None, max_turns=1, timeout=600, cwd=None, schema=None, system=None,
          session=None, resume=False, effort=None, fast=False):
    """One claude -p call. Returns (answer, info): the agent's final JSON
    object, from structured output when a schema was given, else from its
    last message; and what the call cost. A failed call answers {} and
    info["error"] says why.

    With `session` the call is part of a named conversation: the first one
    creates it, and `resume` continues it with everything it already knows
    — what it read, what it edited, what it watched fail. The id is ours
    and made up front, so nothing has to be parsed back out of the
    output to continue."""
    # A structured answer takes the CLI a turn of its own on top of the reply.
    if schema:
        max_turns = max(max_turns, 3)
    # The prompt goes in on stdin, not as an argument: an agent that stops a
    # server with `pkill -f <pattern>` would otherwise match its own command
    # line, which carried the whole prompt (a port, "start.sh", the app's name).
    command = ["claude", "-p", "--output-format", "json", "--model", model,
               "--max-budget-usd", f"{budget:g}", "--max-turns", str(max_turns)]
    command += ["--allowedTools", *tools] if tools else ["--tools", ""]
    if session:
        command += ["--resume", session] if resume else ["--session-id", session]
    if effort:
        command += ["--effort", effort]
    if fast:
        command += ["--settings", json.dumps({"fastMode": True})]
    if schema:
        command += ["--json-schema", json.dumps(schema)]
    if system:
        command += ["--system-prompt", system]
    timeout = bounded(timeout)
    if timeout <= 0:
        # Not started rather than started and killed: an agent that is
        # interrupted has still spent the money and left the repository
        # half-edited, and neither shows up as anything but a timeout.
        return {}, {"rung": rung, "model": model, "cost": None, "turns": None, "seconds": 0,
                    "error": "there was no time left in this run to start it"}
    env = {k: v for k, v in os.environ.items() if k not in ("HC_RECIPE_FILE", "HC_ENV_FILE", "HC_BRIEF_FILE", "ENGELBART_MODEL_GATEWAY_URL")}
    env["PIP_NO_CACHE_DIR"] = "1"
    if tools and "Bash" in tools:
        env.update(agent_values())
    info = {"rung": rung, "model": model, "cost": None, "turns": None, "seconds": None, "error": None}
    started = time.time()
    answer = {}
    try:
        proc = subprocess.run(command, cwd=cwd, env=env, input=prompt, capture_output=True, text=True, timeout=timeout)
        envelope = {}
        try:
            envelope = json.loads(proc.stdout)
        except ValueError:
            pass
        if not isinstance(envelope, dict):
            envelope = {}
        info["cost"] = envelope.get("total_cost_usd")
        info["turns"] = envelope.get("num_turns")
        if envelope.get("is_error"):
            info["error"] = str(envelope.get("result") or envelope.get("subtype") or "the agent call failed")[:300]
        structured = envelope.get("structured_output")
        answer = structured if isinstance(structured, dict) else parse_answer(proc.stdout)
        if proc.returncode != 0 and not answer and not info["error"]:
            info["error"] = (proc.stderr or proc.stdout).strip()[-300:] or f"exit {proc.returncode}"
    except subprocess.TimeoutExpired:
        info["error"] = "ran out of time"
    except Exception as exc:  # noqa: BLE001
        info["error"] = str(exc)[:300]
    info["seconds"] = round(time.time() - started, 1)
    COSTS.append({k: info[k] for k in ("rung", "model", "cost", "turns", "seconds")})
    emit(phase="cost", **COSTS[-1], total=round(sum(c["cost"] or 0 for c in COSTS), 4), error=info["error"])
    return answer or {}, info


# Names that steer the agent itself rather than the application: which
# account it authenticates as, which endpoint it talks to, how the
# pipeline is configured. Held back whether or not this sandbox happens
# to set them, because "unset" is not "free to take": an application's
# ANTHROPIC_BASE_URL landing in an unset slot would send the runner's own
# key to the application's endpoint, which is worse than the collision
# that made us look. Prefixes, so a variable added to the CLI next month
# is covered the day it appears.
AGENT_CONTROLS = ("ANTHROPIC_", "CLAUDE_", "AWS_BEARER_TOKEN", "AWS_REGION", "VERTEX_", "GOOGLE_APPLICATION_CREDENTIALS",
                  "HC_", "ENGELBART_", "NODE_OPTIONS")
APP_ENV_FILE = Path.home() / ".engelbart-app-env.sh"   # outside the repository, so it cannot reach a patch or a commit


def time_left(reserve=SAVE_RESERVE_S):
    """How long this run has, minus what is kept back to save its work.

    The reserve is the point. A round cut off by the deadline loses
    everything it did — no check, no diff, no recipe — where a round that
    stops two minutes early leaves a repository someone can use. None
    means no deadline was handed in and nothing should be bounded."""
    if not DEADLINE_AT:
        return None
    return DEADLINE_AT - time.time() - reserve


def bounded(seconds, reserve=SAVE_RESERVE_S):
    """A timeout that cannot outlive the run it belongs to."""
    left = time_left(reserve)
    return seconds if left is None else max(0, min(int(seconds), int(left)))


def agent_values():
    """The person's values, minus every name that belongs to the agent.

    The rule is the exact inverse of the one in start_service, and right
    in both places for the same reason: there the process IS the
    application, so the person's values win; here the process is the
    agent, and a repository that saved its own ANTHROPIC_API_KEY would
    otherwise spend someone else's money or fail to authenticate with no
    sign of why.

    What is left out is not lost: write_app_env leaves a wrapper that
    runs any command under the whole set, so a build or a test can face
    the application's configuration without the agent adopting it."""
    return {k: v for k, v in SAVED_ENV.items()
            if k not in os.environ and not k.startswith(AGENT_CONTROLS)}


def write_app_env(root):
    """The application's environment, as a command rather than as this
    process's own.

    The values go to a file only this user can read, outside the
    repository so that no patch, commit or archive can carry them, and
    the wrapper beside them is what an agent runs:

        bash .engelbart/with-app-env.sh npm run build

    A file on disk is a deliberate step past load_env's "removed once
    read", and the reason is that the alternative is worse: either the
    agent holds credentials that redirect its own tooling, or it tests
    the repository under a configuration the repository never runs
    under and reports the result as if it meant something.

    Always written, and always rewritten. A saved setup.sh from an
    earlier run may put the wrapper in front of its build, so taking the
    wrapper away when the last value is deleted would break the replay
    of work that has nothing to do with that value. The values file is
    emptied instead of removed, because it is what holds the secret and
    an empty file is the honest statement that there is nothing to
    apply."""
    wrapper = Path(root) / SETUP_DIR / "with-app-env.sh"
    APP_ENV_FILE.write_text("".join(f"export {k}={shlex.quote(v)}\n" for k, v in sorted(SAVED_ENV.items())))
    APP_ENV_FILE.chmod(0o600)
    wrapper.write_text("#!/bin/sh\n"
                       "# Run a command with the values the person supplied for this\n"
                       "# repository. Written by the runner.\n"
                       f'[ -f "{APP_ENV_FILE}" ] && . "{APP_ENV_FILE}"\n'
                       'exec "$@"\n')
    wrapper.chmod(0o755)
    return str(wrapper)


def cost_fields(info):
    return {"model": info.get("model"), "cost": info.get("cost"), "turns": info.get("turns")}


def emit(**event):
    sys.stdout.write(json.dumps(event, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def fail(message, step=None, **detail):
    emit(phase="error", step=step, message=str(message or "The pipeline stopped without a reason")[:2000], **detail)
    sys.exit(1)


def rescue(repo, reason, blocker=None, blocked=False):
    """However this run is allowed to recover. One seam for the two ways,
    so that every ending — nothing to serve, a blocker outside the
    sandbox, a launch that would not come up — reaches whichever one the
    run was queued with, and neither has an ending the other lacks."""
    if RECOVERY == "session":
        return recover(repo, reason, blocker, blocked=blocked)
    return setup_for_use(repo, reason, blocker=blocker, blocked=blocked)


def conclude(reason, step):
    """The repository has nothing to serve: a library, a dataset, a tool.
    That is an answer, not a failure. What follows is setting it up so the
    next thing a person does is run what its paper describes."""
    reason = str(reason or "The repository has no web application of its own to run")[:2000]
    emit(phase="conclusion", status="no_service", step=step, reason=reason)
    if rescue(REPO, reason):
        stay_alive()
    fail("Nothing to serve, and the repository could not be set up for use: " + (LAST_CHECK or "the check did not pass"), step="setup", outcome="no_service")


def blocked(reason, blocker, step):
    """The application exists but something outside the sandbox's reach
    keeps it from starting: a key, a service, a device. The floor is the
    same as for nothing to serve: installed, checked, with the blocker as
    the first line of what to do next."""
    reason = str(reason or "The application could not be started")[:2000]
    emit(phase="conclusion", status="blocked", step=step, reason=reason, blocker=blocker)
    if rescue(REPO, reason, blocker=blocker, blocked=True):
        stay_alive()
    fail("Blocked, and the repository could not be set up for use either: " + (LAST_CHECK or "the check did not pass"), step="setup", outcome="blocked", blocker=blocker)


def no_service(PR, run_id):
    try:
        return PR.view(run_id).get("status") == "no_service"
    except Exception:  # noqa: BLE001
        return False


# Which of hc's own model calls have already been put on the record. A
# turn is observed twice — once when it starts, once when it ends — and the
# stage is polled besides, so the same call arrives many times and only the
# finished one carries what it cost.
HC_SEEN = set()


def note_hc_costs(trace, rung):
    """Put hc's own planning on the run's cost record, beside the
    supervisor's.

    The pipeline's planner and its setup diagnoser are model calls this
    run pays for, and until the CLI was asked for its JSON envelope
    (sandbox/hc/agent_cost.patch) nothing knew what they came to. They are
    reported as their own rungs so that a total can still be split back
    into what the supervisor spent and what the pipeline did."""
    for call in (trace or {}).get("calls") or []:
        if call.get("cost") is None or not call.get("finishedAt"):
            continue
        key = (rung, call.get("startedAt"), call.get("finishedAt"))
        if key in HC_SEEN:
            continue
        HC_SEEN.add(key)
        item = {"rung": rung, "model": call.get("model"), "cost": call.get("cost"),
                "turns": call.get("turns"), "seconds": call.get("durationSeconds")}
        COSTS.append(item)
        emit(phase="cost", **item, total=round(sum(c["cost"] or 0 for c in COSTS), 4), error=None)


def agent_summary(trace):
    calls = (trace or {}).get("calls") or []
    if not calls:
        return None
    last = calls[-1]
    return {"name": (trace or {}).get("name"), "call": len(calls), "status": last.get("status"),
            "phase": last.get("phase"), "model": last.get("model"), "seconds": last.get("durationSeconds"),
            "outcome": last.get("outcome")}


class StageLog:
    """Emit only what each stage has printed since the last look."""

    def __init__(self):
        self.seen = {}

    def update(self, stages):
        for index, stage in enumerate(stages):
            key = (index, stage.get("attempt"))
            out_len, err_len, announced = self.seen.get(key, (0, 0, False))
            if not announced:
                emit(phase="stage", stage=stage.get("stage"), command=stage.get("command"), cwd=stage.get("cwd"),
                     status=stage.get("status"), attempt=stage.get("attempt"))
                # Whether this service could be watched is a fact about
                # the run, and a different fact from how many model calls
                # it turned out to make.
                capability = stage.get("modelCapture")
                if isinstance(capability, dict):
                    emit(phase="capability", capability="modelCapture", stage=stage.get("stage"),
                         state=capability.get("state"), detail=capability.get("detail"))
            for stream, length in (("stdout", out_len), ("stderr", err_len)):
                text = stage.get(stream) or ""
                if len(text) > length:
                    emit(phase="log", stage=stage.get("stage"), stream=stream, text=text[length:])
            self.seen[key] = (len(stage.get("stdout") or ""), len(stage.get("stderr") or ""), True)


def main():
    if len(sys.argv) != 2:
        fail("usage: hc_run.py <repository-directory>")
    repo = sys.argv[1]
    global REPO, PERSON_HINT
    REPO = repo
    PERSON_HINT = (os.environ.get("HC_PROJECT_HINT") or "").strip() or None
    os.environ.setdefault("HC_USE_API_KEY", "1")
    os.environ.setdefault("HC_CHAT_PROVIDER", "claude")
    os.environ.setdefault("HUMAN_COMPACT_HOME", str(Path.home() / ".human-compact"))
    if not os.environ.get("ANTHROPIC_API_KEY"):
        fail("ANTHROPIC_API_KEY is not set in the sandbox")
    # The install the runner started when the clone landed, if there was
    # one to start. Said once, here, so the Build tab shows it as a step
    # of this run rather than as something that happened off-screen.
    # Read here rather than where the plan is handed its values: three of
    # the ways a run can end usable reach the setup rung from pipeline(),
    # before run() exists, and until now every one of them started the
    # repository with none of what the person saved for it.
    SAVED_ENV.update(load_env())
    found = INSTALL.state(repo)
    if found.get("status") != "none":
        emit(phase="install", status=found.get("status"), command=" ".join(found.get("command") or []),
             lock=found.get("lock"), pid=found.get("pid"), log=found.get("log"), adopted=True)
    instrument(repo)

    from human_compact.trajectory import (project_analysis as PA, project_components as PC,
                                          project_environment as PE, project_order as PO, project_run as PR,
                                          project_supabase as PS)

    # A saved recipe from a previous successful run skips straight to starting.
    recipe = load_recipe()
    if recipe and recipe.get("kind") == "setup":
        # The saved way to set this repository up for use, without the agent.
        emit(phase="recipe", status="replaying", kind="setup", saved=recipe.get("savedAt"))
        if not recipe.get("startUrl") and recipe.get("complete") is not False:
            # Last time the ending was usable; say again why. Not for an
            # unfinished one: announcing "nothing to serve" for a saved
            # setup that simply ran out of time would be telling a person
            # the repository has no application, which is the opposite of
            # what the last run found.
            saved_blocker = recipe.get("blocker") if isinstance(recipe.get("blocker"), dict) else None
            emit(phase="conclusion", status="blocked" if saved_blocker else "no_service", step="trail",
                 reason=str(recipe.get("reason") or "Nothing to serve, as saved")[:2000], blocker=saved_blocker)
        if setup_for_use(repo, recipe.get("reason"), recipe=recipe):
            stay_alive()
        emit(phase="recipe", status="failed", reason=LAST_CHECK or "the saved setup did not pass its check")
        recipe = None
    if recipe:
        run_id, cwd = replay(PR, repo, recipe)
        emit(phase="recipe", status="replaying", kind=recipe.get("kind"), saved=recipe.get("savedAt"))
        outcome = run(PR, PE, PS, run_id, cwd, repo)
        if outcome == "ready":
            supervise(PR, run_id)
        emit(phase="recipe", status="failed", reason=outcome)
        stop_leftovers(PR, run_id)

    run_id, cwd = pipeline(PA, PC, PO, repo)
    join_install()
    outcome = run(PR, PE, PS, run_id, cwd, repo)
    if RECOVERY == "session":
        # One session owns everything below this line. Nothing about the
        # clone, the plan or the saved trail changed to get here; what
        # changes is that the repair agent that may not run what it wrote,
        # the resolver with no tools, and the setup agent starting cold are
        # one conversation that remembers all three.
        if outcome != "ready":
            if no_service(PR, run_id):
                conclude(PR.view(run_id).get("reason"), step="run")
            failure = failure_of(PR, run_id)
            LAST_ESCALATION.update(stage=failure.get("stage"), output=str(failure.get("output") or "")[-4000:],
                                   plan=plan_of(PR, run_id))
            stop_leftovers(PR, run_id)
            if rescue(repo, failure.get("reason") or outcome):
                stay_alive()
            fail("The recovery session could not get this repository running: " + str(LAST_CHECK or outcome),
                 step="setup", outcome="blocked")
        supervise(PR, run_id)
    # Last resort: let a tightly scoped agent edit this throwaway copy of the
    # repository, then run the pipeline again. Every edit is reported as a diff.
    attempt = 0
    last_failure = None
    global ACCEPT_APP_ERRORS
    while outcome != "ready" and attempt < MAX_REPAIRS:
        if no_service(PR, run_id):
            conclude(PR.view(run_id).get("reason"), step="run")
        attempt += 1
        failure = failure_of(PR, run_id)
        last_failure = failure
        stop_leftovers(PR, run_id)
        if not repair(repo, failure, attempt):
            # The server answered and the agent saw nothing to fix: the marks
            # in its output were not a crash after all. Bring it back as it is.
            if not failure.get("app"):
                break
            ACCEPT_APP_ERRORS = True
            emit(phase="run", status="accepted", reason="the repair agent found nothing to change; keeping the application as it came up")
        reset_local_supabase(PS, cwd)
        run_id, cwd = pipeline(PA, PC, PO, repo)
        join_install()
        outcome = run(PR, PE, PS, run_id, cwd, repo)
    while outcome != "ready":
        if no_service(PR, run_id):
            conclude(PR.view(run_id).get("reason"), step="run")
        state = PR.view(run_id)
        reason, stage = state.get("reason"), state.get("stage")
        # Stopping the leftovers of the last attempt resets the record, which
        # overwrites its reason; the failure read before that is the real one.
        if reason == "Stopped by Reset" and last_failure:
            reason, stage = last_failure.get("reason"), last_failure.get("stage")
        # A server that answers while the app inside it crashed leaves the
        # record "running" with no reason; the crash the visit found is it.
        if LAST_APP_ERROR:
            reason, stage = LAST_APP_ERROR.get("reason"), LAST_APP_ERROR.get("stage")
        output = (last_failure or {}).get("output") or failure_of(PR, run_id).get("output") or ""
        # Not the end: a stronger model corrects the plan once, or the
        # repository is set up for use with the blocker written down.
        stop_leftovers(PR, run_id)
        escalate(step="run", status=state.get("status"), reason=reason or outcome, stage=stage, output=output, plan=plan_of(PR, run_id))
        run_id, cwd = pipeline(PA, PC, PO, repo)
        join_install()
        outcome = run(PR, PE, PS, run_id, cwd, repo)
        last_failure = None
    supervise(PR, run_id)


def load_recipe():
    path = os.environ.get("HC_RECIPE_FILE")
    if not path:
        return None
    try:
        recipe = json.loads(Path(path).read_text())
        if isinstance(recipe, dict) and recipe.get("version") == 1 and (recipe.get("orderPlan") or recipe.get("plan") or recipe.get("kind") == "setup"):
            return recipe
        emit(phase="recipe", status="ignored", reason="unrecognized recipe")
    except Exception as exc:  # noqa: BLE001
        emit(phase="recipe", status="ignored", reason=str(exc)[:300])
    return None


def replay(PR, repo, recipe):
    """Write a run record straight from the recipe, as analysis would have."""
    root = str(Path(repo).resolve())
    cwd = str((Path(root) / recipe.get("cwd", ".")).resolve())
    order_plan = recipe.get("orderPlan")
    patch = recipe.get("patch")
    if patch and patch.get("diff"):
        apply_patch(root, patch)
    if recipe.get("hint"):
        # The correction that made it run last time, in case the plan has to
        # be made again.
        global RESOLVER_HINT
        RESOLVER_HINT = str(recipe["hint"])[:600]
        apply_hint()
    run_id = uuid.uuid4().hex
    PR.write(run_id, {"cwd": cwd, "repositoryRoot": root, "plan": recipe.get("plan") or {}, "orderPlan": order_plan})
    return run_id, cwd


def apply_patch(root, patch):
    """Re-apply the edits that made the repository run last time. If they
    no longer fit (the repository moved on), the replay fails and the full
    pipeline, repair included, runs again."""
    global PATCH
    if patch.get("truncated"):
        raise ValueError("the saved patch was too large to keep whole")
    proc = subprocess.run(["git", "apply", "--whitespace=nowarn", "-"], cwd=root, input=patch["diff"], capture_output=True, text=True)
    if proc.returncode != 0:
        emit(phase="patch", status="stale", reason=(proc.stderr or proc.stdout).strip()[:300])
        raise ValueError("the saved patch no longer applies")
    PATCH = {k: patch.get(k) for k in ("summary", "reason", "files", "diff", "truncated", "attempt")}
    emit(phase="patch", status="replayed", summary=patch.get("summary"), files=patch.get("files"))


def instrument(repo):
    """Engelbart's own change to the sandbox copy, when the run is traced
    and the registry has one for this repository: the smallest edit that
    lets the application's model calls be routed through the gateway,
    with its original behavior kept as the default. Applied before
    anything reads the repository and committed there, so the repair
    agent's diffs and the saved trail never carry it; reported in full,
    diff included, so nothing about it is hidden. Separate from PATCH on
    purpose: a repair fixes the application, this only observes it."""
    if os.environ.get("ENGELBART_TRACE") != "1":
        return
    name = (os.environ.get("ENGELBART_REPO") or "").strip().lower()
    # An operator can switch this off for a run: to see what the
    # repository does with nothing of ours in it, and to check that
    # what watches it no longer needs the edit.
    if (os.environ.get("ENGELBART_INSTRUMENTATION") or "").strip().lower() in ("off", "none", "0"):
        emit(phase="instrument", status="none", repo=name, reason="sandbox-only instrumentation is switched off for this run")
        return
    gateway = (os.environ.get("ENGELBART_MODEL_GATEWAY_URL") or "").rstrip("/")
    try:
        with open(Path(INSTRUMENTATION_DIR) / "index.json", encoding="utf-8") as f:
            entry = (json.load(f) or {}).get(name)
    except (OSError, ValueError) as exc:
        emit(phase="instrument", status="failed", repo=name, reason=f"the instrumentation registry could not be read: {str(exc)[:200]}")
        return
    if not entry:
        emit(phase="instrument", status="none", repo=name)
        return
    if not gateway:
        emit(phase="instrument", status="skipped", repo=name, reason="no model gateway URL was handed to the wrapper")
        return
    try:
        diff = (Path(INSTRUMENTATION_DIR) / entry["diff"]).read_text(encoding="utf-8")
    except (OSError, KeyError, TypeError) as exc:
        emit(phase="instrument", status="failed", repo=name, reason=f"the registered diff could not be read: {str(exc)[:200]}")
        return
    files = [line[6:] for line in diff.splitlines() if line.startswith("+++ b/")]
    values = {k: str(v).replace("{gateway}", gateway) for k, v in (entry.get("environment") or {}).items() if isinstance(k, str)}
    # A sandbox launched again already carries the commit; only the
    # gateway URL is new.
    subjects = subprocess.run(["git", "log", "--format=%s", "-n", "20"], cwd=repo, capture_output=True, text=True).stdout.splitlines()
    if INSTRUMENT_COMMIT in subjects:
        TRACE_ENV.update(values)
        TRACE_NAMES.update(values)
        os.environ.update(values)
        emit(phase="instrument", status="present", repo=name, files=files, environment=sorted(values))
        return
    proc = subprocess.run(["git", "apply", "--whitespace=nowarn", "-"], cwd=repo, input=diff, capture_output=True, text=True)
    if proc.returncode != 0:
        emit(phase="instrument", status="failed", repo=name, files=files, reason="the diff no longer applies to this commit: " + (proc.stderr or proc.stdout).strip()[:300])
        return
    subprocess.run(["git", "add", "--", *files], cwd=repo, capture_output=True)
    commit = subprocess.run(["git", "-c", "user.name=Engelbart", "-c", "user.email=engelbart@sandbox.invalid", "commit", "-q", "-m", INSTRUMENT_COMMIT],
                            cwd=repo, capture_output=True, text=True)
    if commit.returncode != 0:
        # Not committed means a repair diff would carry it; undo rather than blur the two.
        subprocess.run(["git", "checkout", "--", *files], cwd=repo, capture_output=True)
        emit(phase="instrument", status="failed", repo=name, files=files, reason="the edit could not be committed in the sandbox copy: " + (commit.stderr or commit.stdout).strip()[:300])
        return
    TRACE_ENV.update(values)
    TRACE_NAMES.update(values)
    os.environ.update(values)   # the setup rung's scripts inherit the wrapper's environment
    emit(phase="instrument", status="applied", repo=name, files=files, diff=diff, why=entry.get("why"),
         environment=sorted(values), upstreams=entry.get("upstreams"), commit=INSTRUMENT_COMMIT)


# A path the Node preload cannot reach. Next runs middleware, and any
# route that declares `runtime = "edge"`, in a runtime that is not Node:
# no NODE_OPTIONS, no node:http, its own fetch. A model call made there
# is invisible to capture. Nothing here tries to reach it. The point is
# only that the run says so, because "capture is partial" and "no model
# calls happened" must never be the same silence.
EDGE_EXPORT = re.compile(r"""export\s+const\s+runtime\s*=\s*["']edge["']""")
EDGE_CONFIG = re.compile(r"""export\s+const\s+config\b""")
EDGE_FIELD = re.compile(r"""runtime\s*:\s*["']edge["']""")
EDGE_SUFFIX = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts")
EDGE_SKIP = {"node_modules", ".next", ".git", "dist", "build", "out", "coverage", ".turbo", ".vercel", "venv", ".venv", "__pycache__"}
EDGE_MAX_FILES = 4000
EDGE_MAX_BYTES = 512 * 1024


def edge_paths(root):
    """Files in the repository that declare a runtime the preload cannot enter.

    Returns (paths relative to the repository, whether the scan stopped
    early). Never raises: not being able to look is itself reported."""
    found = []
    scanned = 0
    base_path = Path(root)
    try:
        for base, dirs, names in os.walk(root):
            dirs[:] = [d for d in dirs if d not in EDGE_SKIP]
            here = Path(base)
            # Next's middleware always runs on the edge runtime. It is
            # only middleware where an application is: beside a Next
            # config, or beside the app's own routes.
            beside_an_app = any(n.startswith("next.config.") for n in names) or "app" in dirs or "pages" in dirs
            for name in sorted(names):
                if not name.endswith(EDGE_SUFFIX):
                    continue
                path = here / name
                rel = str(path.relative_to(base_path))
                if name.startswith("middleware.") and beside_an_app:
                    found.append(rel)
                    continue
                scanned += 1
                if scanned > EDGE_MAX_FILES:
                    return sorted(set(found)), True
                try:
                    if path.stat().st_size > EDGE_MAX_BYTES:
                        continue
                    text = path.read_text(encoding="utf-8", errors="replace")
                except OSError:
                    continue
                if EDGE_EXPORT.search(text) or (EDGE_CONFIG.search(text) and EDGE_FIELD.search(text)):
                    found.append(rel)
    except Exception:  # noqa: BLE001
        return sorted(set(found)), True
    return sorted(set(found)), False


def report_capability(gateway, state, detail):
    """Say what the run's capture capability is on the trace itself, over
    the same endpoint the preload reports on. Best effort: a report that
    does not arrive is still in the run's event log."""
    if not gateway:
        return
    try:
        body = json.dumps({"state": state, "detail": detail[:400], "runtime": "wrapper"}).encode()
        request = Request(gateway + "/gateway/status", data=body, headers={"content-type": "application/json"})
        urlopen(request, timeout=3).close()
    except Exception:  # noqa: BLE001
        pass


def request_capture(root=None):
    """Ask hc to launch the application with Engelbart's Node preload.

    hc is told which capability is wanted, never how to do it: it
    resolves the file itself from its own environment, checks it is
    outside the repository, and applies it after the plan's own
    settings. The repository is not read, not edited and not consulted,
    which is the whole point — an artifact should be byte-for-byte what
    it was, and what watches it should come from the environment it runs
    in.

    Returns the capability request, or None with a reason said out loud.
    Never raises: a run that cannot be watched is still a run."""
    gateway = (os.environ.get("ENGELBART_MODEL_GATEWAY_URL") or "").rstrip("/")
    if os.environ.get("ENGELBART_TRACE") != "1" or not gateway:
        return None
    if not os.path.isfile(PRELOAD):
        detail = f"{PRELOAD} is not in this sandbox; model calls are traced only if the application reads its base URL from the environment"
        emit(phase="capability", capability="modelCapture", state="instrumentation_failed", detail=detail)
        # On the trace as well as in the log. A run whose trace holds no
        # model calls and no word about capture cannot be read.
        report_capability(gateway, "instrumentation_failed", detail)
        return None
    os.environ["HC_NODE_PRELOAD"] = PRELOAD
    os.environ["HC_LAUNCH_MARKERS"] = json.dumps({CAPTURE_MARKER: gateway})
    if root:
        paths, stopped = edge_paths(root)
        if paths:
            named = ", ".join(paths[:5]) + (f" (+{len(paths) - 5} more)" if len(paths) > 5 else "")
            detail = f"model capture reaches this application's Node paths; {len(paths)} path(s) declare the edge runtime and are outside it: {named}"
            emit(phase="capability", capability="modelCapture", state="partial", detail=detail, paths=paths[:20], scanStopped=stopped)
            report_capability(gateway, "partial", detail)
        elif stopped:
            detail = "the repository could not be read for edge-runtime paths, so whether any model call bypasses capture is unknown"
            emit(phase="capability", capability="modelCapture", state="partial", detail=detail, scanStopped=True)
            report_capability(gateway, "partial", detail)
    return {"modelCapture": True}


def stop_leftovers(PR, run_id):
    try:
        PR.reset(run_id)
    except Exception:  # noqa: BLE001
        pass


def pipeline(PA, PC, PO, repo):
    """Discover, order or analyze; return the run record id and its directory."""
    ensure_brief(repo)
    emit(phase="discover", status="running")
    discovery = PC.discover(repo)
    components = discovery["components"]
    emit(phase="discover", status="done", root=discovery["root"],
         components=[{"id": c["id"], "types": c["types"]} for c in components], warnings=discovery.get("warnings", []))
    if not components:
        # No manifest, no start script: a dataset or a paper's files. An answer, not a failure.
        conclude("No runnable component was found: nothing in the repository declares an application to start", step="discover")

    if len(components) > 1:
        order_id = PO.start(discovery["root"])["id"]
        last = None
        while True:
            view = PO.view(order_id)
            note_hc_costs(view.get("agentTrace"), "hc.order")
            key = (view.get("status"), view.get("progress"))
            if key != last:
                emit(phase="order", status=view.get("status"), progress=view.get("progress"),
                     agent=agent_summary(view.get("agentTrace")))
                last = key
            if view.get("status") in TERMINAL_ORDER:
                break
            time.sleep(1)
        if view.get("status") == "no_service":
            conclude(view.get("reason"), step="order")
        if view.get("status") != "done":
            reason = view.get("reason") or view.get("error") or "Run-order assessment did not produce a plan"
            commands = view.get("rejectedCommands") or []
            if commands:
                reason = f"{reason} · proposed: {' · '.join(commands)}"
            emit(phase="order", status="gave_up", reason=str(reason)[:2000], commands=commands)
            # Not the end: see escalate. A corrected hint runs the order again.
            escalate(step="order", status=view.get("status"), reason=reason, plan=view.get("plan"), commands=commands)
            return pipeline(PA, PC, PO, repo)
        emit(phase="plan", source="run_order", summary=view.get("summary"), plan=view.get("plan"),
             rationale=view.get("orderingRationale"), selected=view.get("selectedComponents"))
        return order_id, discovery["root"]
    else:
        component = components[0]
        if component.get("requiresContainer"):
            fail("This project needs a container runtime, which the sandbox runner does not provide", step="discover")
        result = PA.analyze(component["path"], discovery["root"])
        if not result.get("ok"):
            fail(result.get("error"), step="analyze")
        plan = result.get("plan") or {}
        emit(phase="plan", source=result.get("source", "railpack"),
             providers=(result.get("info") or {}).get("detectedProviders"),
             start=(plan.get("deploy") or {}).get("startCommand"))
        return result["analysisId"], component["path"]


SAVED_SOURCE = "Engelbart local storage"   # what the pipeline calls values handed to it


def load_env():
    """Values the person saved for this repository, handed over as a file
    that is removed once read so it does not linger on disk."""
    path = os.environ.get("HC_ENV_FILE")
    if not path or not os.path.exists(path):
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            values = json.load(f)
        os.unlink(path)
    except (OSError, ValueError) as exc:
        emit(phase="environment", warning=f"saved values could not be read: {str(exc)[:200]}")
        return {}
    return {k: v for k, v in values.items() if isinstance(k, str) and isinstance(v, str) and v}


def hand_over(PE, dirs, values):
    """Give the pipeline the saved values it can use. It only accepts names
    its scan found; the rest come back as ignored."""
    try:
        usable = {}
        for d in dirs:
            known = {v["name"] for v in PE.scan(d).get("variables", [])}
            found = {k: v for k, v in values.items() if k in known}
            if found:
                PE.save(d, found)
            usable.update(found)
        return usable, sorted(set(values) - set(usable))
    except Exception as exc:  # noqa: BLE001
        emit(phase="environment", warning=f"saved values could not be handed over: {str(exc)[:200]}")
        return {}, []


LOCAL_SUPABASE_TIMEOUT_S = 15 * 60


def local_supabase(PS, PE, cwd, root):
    """A repository with a Supabase config and no Supabase values gets a
    local stack in the sandbox: the pipeline starts it with Docker, applies
    the migrations and seed, and points the app at it. Returns the names it
    filled in and, when it could not be done, why."""
    try:
        facts = PS.detect(cwd, repository_root=root)
        if not facts.get("available"):
            return set(), None
        rows = {v["name"]: v for v in PE.scan(cwd).get("variables", [])}
        url_names = [n for n, kind in PS.mapping(set(rows)).items() if kind == "API_URL"]
        if not url_names:
            return set(), None
        if all(rows[n].get("status") == "found" for n in url_names):
            emit(phase="supabase", status="skipped", reason="the app already has Supabase values")
            return set(), None
        if not shutil.which("docker"):
            emit(phase="supabase", status="skipped", reason="this sandbox has no Docker; the values stay missing")
            return set(), "This sandbox has no Docker, so a local Supabase could not be started."
        emit(phase="supabase", status="starting", source=facts.get("source"))
        PS.start(cwd, root)
        last = None
        deadline = time.time() + LOCAL_SUPABASE_TIMEOUT_S
        while time.time() < deadline:
            state = PS.inspect(cwd, root)
            key = (state.get("status"), state.get("reason"))
            if key != last:
                emit(phase="supabase", status=state.get("status"), reason=state.get("reason"), warnings=state.get("warnings"))
                last = key
            if state.get("status") == "ready":
                return set(state.get("variableNames") or []), None
            if state.get("status") in ("needs_input", "stopped"):
                return set(), supabase_failure(PS, cwd, state.get("reason"))
            time.sleep(2)
        emit(phase="supabase", status="timeout", reason="local Supabase did not become ready in time")
        return set(), supabase_failure(PS, cwd, "Local Supabase did not become ready in time.")
    except Exception as exc:  # noqa: BLE001
        emit(phase="supabase", status="failed", reason=str(exc)[:300])
        return set(), supabase_failure(PS, cwd, str(exc)[:300])


def supabase_failure(PS, cwd, reason):
    """Leave the failed local stack unselected, so the launch goes on
    without it rather than refusing, and say what went wrong. The
    pipeline's private log usually has the one line that matters."""
    try:
        _, target = PS.location(cwd)
        state = PS.read_state(target)
        state["selected"] = False
        PS.write_state(target, state)
    except Exception:  # noqa: BLE001
        pass
    detail = ""
    match = re.search(r"diagnostic log: (\S+?\.log)", reason or "")
    if match:
        try:
            with open(match.group(1), encoding="utf-8", errors="replace") as f:
                lines = [line.strip() for line in f if line.startswith("ERROR")]
            if lines:
                detail = lines[0][:300]
        except OSError:
            pass
    summary = re.sub(r"\s*Private diagnostic log:.*$", "", reason or "Local Supabase could not be set up.").strip()
    text = f"{summary} {detail}".strip() if detail else summary
    emit(phase="supabase", status="unavailable", reason=text)
    return text


def plan_directories(PR, run_id, cwd, root):
    """Every directory a step runs from or reads its configuration in. The
    pipeline checks values per directory, so each one needs its own skips."""
    dirs = [cwd]
    try:
        view = PR.view(run_id)
        dirs += [p for p in view.get("environmentPaths") or [] if isinstance(p, str)]
        for stage in view.get("stages") or []:
            dirs += [stage.get(k) for k in ("cwd", "environmentCwd") if isinstance(stage.get(k), str)]
    except Exception:  # noqa: BLE001
        pass
    seen = []
    for d in dirs:
        path = Path(d) if Path(d).is_absolute() else Path(root) / d
        try:
            resolved = path.resolve(strict=True)
        except OSError:
            continue
        if resolved.is_dir() and resolved.is_relative_to(Path(root).resolve()) and str(resolved) not in seen:
            seen.append(str(resolved))
    return seen


def environment(PE, dirs, provided, ignored, local, local_error=None):
    """Report every variable the app reads and its state, across the plan's
    directories. What is still missing is skipped, since the sandbox cannot
    ask anyone."""
    skips = {}
    try:
        variables = {}
        for d in dirs:
            report = PE.scan(d)
            missing = []
            for v in report.get("variables", []):
                name = v["name"]
                saved = v.get("source") == SAVED_SOURCE
                status = "local" if name in local else "provided" if saved else v.get("status")
                if status == "missing":
                    missing.append(name)
                if name not in variables or status == "missing":
                    variables[name] = {"name": name, "status": status, "requirement": v.get("requirement"), "group": v.get("group"),
                                       "source": "local Supabase" if name in local else "Engelbart trace" if name in TRACE_NAMES else "saved" if saved else v.get("source"),
                                       "public": bool(v.get("public"))}
            if missing:
                skips[d] = missing
        rows = list(variables.values())
        emit(phase="environment", variables=rows, skipped=sorted({n for names in skips.values() for n in names}), provided=sorted(provided),
             ignored=ignored, local=sorted(local), localError=local_error, directories=len(dirs),
             instrumented=sorted(TRACE_NAMES & set(provided)))
    except Exception as exc:  # noqa: BLE001
        emit(phase="environment", warning=str(exc)[:300])
    return skips


def run(PR, PE, PS, run_id, cwd, root):
    """Start the record and follow it until the app is ready ("ready") or it
    gives up (the reason). On ready the recipe is emitted for saving."""
    global LAST_LOCAL_ERROR, LAST_MISSING, LAST_APP_ERROR
    dirs = plan_directories(PR, run_id, cwd, root)
    provided, ignored = hand_over(PE, dirs, {**SAVED_ENV, **TRACE_ENV})
    LAST_PROVIDED[:] = sorted(provided)
    local, local_error = local_supabase(PS, PE, cwd, root)
    skips = environment(PE, dirs, provided, ignored, local, local_error)
    LAST_LOCAL_ERROR = local_error
    LAST_MISSING = sorted(name for names in skips.values() for name in names)

    PR.start(run_id, environment_skips=skips, instrumentation=request_capture(root))
    logs = LOGS[run_id] = StageLog()
    last = None
    approved = set()
    while True:
        state = PR.view(run_id)
        logs.update(state.get("stages", []))
        attempts = state.get("attempts", [])
        for hc_attempt in attempts:
            note_hc_costs(hc_attempt.get("agentTrace"), "hc.setup")
        key = (state.get("status"), state.get("stage"), state.get("reason"), len(attempts))
        if key != last:
            emit(phase="run", status=state.get("status"), stage=state.get("stage"), reason=state.get("reason"),
                 attempt=len(attempts), agent=agent_summary((attempts[-1] if attempts else {}).get("agentTrace")))
            last = key
        if state.get("status") == "awaiting_approval":
            approval = state.get("approval") or {}
            if approval.get("id") and approval["id"] not in approved:
                approved.add(approval["id"])
                emit(phase="approval", summary=approval.get("summary"), changes=approval.get("changes"))
                PR.decide_approval(run_id, approval["id"], True)
        if state.get("status") == "running" and state.get("healthy") and state.get("url"):
            # Open the page as a person would before its plan is kept as the
            # trail: an app that runs its code only once a browser connects
            # fails now, in the server's output or on the page itself.
            if not ACCEPT_APP_ERRORS:
                time.sleep(2)
                report = visit(state["url"])
                emit_visit(report)
                time.sleep(2)
                state = PR.view(run_id)
                logs.update(state.get("stages", []))
                error = app_error(state) or page_error(report, state)
                if error:
                    LAST_APP_ERROR = error
                    emit(phase="run", status="unhealthy", stage=error["stage"], reason=error["reason"])
                    return error["reason"]
                if not (state.get("status") == "running" and state.get("healthy") and state.get("url")):
                    continue
            recipe = capture(PR, run_id)
            if recipe:
                if PATCH:
                    recipe["patch"] = PATCH
                emit(phase="recipe", status="captured", recipe=recipe)
            parts = urlsplit(state["url"])
            emit(phase="ready", url=state["url"], host=parts.hostname, port=parts.port, pid=state.get("pid"),
                 services=services_of(state))
            return "ready"
        if state.get("status") in TERMINAL_RUN:
            return state.get("reason") or state.get("status")
        time.sleep(0.5)


def services_of(state):
    """Every service the run brought up and where it listens, the entry
    service first. A multi-service plan (a frontend and its API, say) has
    several; anything else is just the entry. The URLs are the pipeline's
    health URLs, so only their host and port matter."""
    found = []
    for service in state.get("previewServices") or []:
        parts = urlsplit(service.get("url") or "")
        if not parts.port or any(f["port"] == parts.port for f in found):
            continue
        found.append({"id": service.get("id") or "app", "host": parts.hostname, "port": parts.port,
                      "isEntry": bool(service.get("isEntry")), "embeddable": service.get("embeddable") is not False})
    if not any(f["isEntry"] for f in found):
        parts = urlsplit(state["url"])
        found = [f for f in found if f["port"] != parts.port]
        found.insert(0, {"id": "app", "host": parts.hostname, "port": parts.port, "isEntry": True, "embeddable": True})
    found.sort(key=lambda f: not f["isEntry"])
    return found


# A server that answers HTTP while the application inside it crashed:
# Streamlit, Flask's debugger and dev servers keep serving an error page,
# so the health check alone would call it live. These marks in a service's
# output right after it came up say otherwise.
APP_ERROR_MARKERS = ("Traceback (most recent call last)", "ModuleNotFoundError", "UnhandledPromiseRejection", "Error: Cannot find module")
# What a person would read on a page that is up but broken.
PAGE_ERROR_MARKERS = ("Traceback (most recent call last)", "ModuleNotFoundError", "This app has encountered an error",
                      "Internal Server Error", "Application error: a client-side exception", "Unhandled Runtime Error",
                      "engelbart proxy: application not reachable")
VISIT = "/opt/engelbart/visit.mjs"
VISIT_WAIT_MS = 6000
LAST_APP_ERROR = None
ACCEPT_APP_ERRORS = False


def app_error(state):
    ids = {s["id"] for s in services_of(state)}
    for st in state.get("stages") or []:
        if st.get("stage") not in ids:
            continue
        text = ((st.get("stdout") or "")[-8000:] + "\n" + (st.get("stderr") or "")[-8000:])
        if any(m in text for m in APP_ERROR_MARKERS):
            return {"app": True, "reason": f"{st.get('stage')} answered on its port, but its output shows the application crashed inside",
                    "stage": st.get("stage"), "command": st.get("command"), "output": text.strip()[-4000:]}
    return None


VISIT_TIMEOUT_S = 60
# Whether the last browser check actually read the page. None until one
# has been made, which is not the same as False: "nobody looked" and
# "somebody looked and could not read it" are different facts about a run.
LAST_VERIFIED = None


def visit(url):
    """Load the page in the sandbox's headless browser, as a person would.

    Bounded like everything else that blocks: this is the last check
    before a run is called ready, and a browser still loading when the
    deadline arrives turns a finished run into a killed one."""
    span = bounded(VISIT_TIMEOUT_S, reserve=10)
    if span <= 0:
        return {"error": "there was no time left in this run to open the page"}
    try:
        wait_ms = min(VISIT_WAIT_MS, max(1000, (span - 5) * 1000))
        proc = subprocess.run(["node", VISIT, url, str(wait_ms)], capture_output=True, text=True, timeout=span)
        lines = [l for l in proc.stdout.splitlines() if l.startswith("{")]
        report = json.loads(lines[-1]) if lines else {"error": (proc.stderr or "no report")[-300:]}
    except Exception as exc:  # noqa: BLE001
        report = {"error": str(exc)[:300]}
    return report


def emit_visit(report, **extra):
    """The browser check, in one shape, from whichever path made it.

    The native path, the setup rung and the recovery session all open the
    page and all used to say so slightly differently, which meant a run's
    record could only be read if you already knew which path made it.
    Whether anyone actually managed to read the page is the same question
    in all three, and this is the one place that answers it — from the
    report rather than from whoever made it, so the record and the
    decisions taken from it cannot disagree."""
    global LAST_VERIFIED
    LAST_VERIFIED = not report.get("error")
    emit(phase="visit", status=report.get("status"), title=report.get("title"), text=(report.get("text") or "")[:300],
         consoleErrors=len(report.get("consoleErrors") or []), failedRequests=len(report.get("failedRequests") or []),
         error=report.get("error"), verified=bool(LAST_VERIFIED),
         unverified=None if LAST_VERIFIED else str(report.get("error") or "the page was not opened")[:300], **extra)


def page_error(report, state):
    text = report.get("text") or ""
    hit = next((m for m in PAGE_ERROR_MARKERS if m in text), None)
    if not hit:
        return None
    entry = next((s for s in services_of(state) if s["isEntry"]), None)
    stage = next((st for st in state.get("stages") or [] if entry and st.get("stage") == entry["id"]), {})
    output = ((stage.get("stdout") or "")[-3000:] + "\n" + (stage.get("stderr") or "")[-4000:]).strip()
    return {"app": True, "reason": f"the page answers, but shows an error to the person opening it ({hit})",
            "stage": stage.get("stage"), "command": stage.get("command"),
            "output": (f"Page text:\n{text[:2500]}\n\nServer output:\n{output}").strip()}


MAX_REPAIRS = 2
REPAIR_TIMEOUT_S = 12 * 60
MAX_DIFF_BYTES = 200 * 1024
PATCH = None            # the cumulative edits made to this copy, for the recipe
LAST_LOCAL_ERROR = None
LAST_MISSING = []

# What the repair agent may do: read and edit files, and run read-only
# commands to look around. It cannot start servers, install tools, reach
# the network or run arbitrary shell; the pipeline does the running.
REPAIR_TOOLS = [
    "Read", "Grep", "Glob", "LS", "Edit", "MultiEdit", "Write",
    "Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)", "Bash(git show:*)", "Bash(git ls-files:*)",
    "Bash(ls:*)", "Bash(cat:*)", "Bash(head:*)", "Bash(tail:*)", "Bash(grep:*)", "Bash(find:*)", "Bash(wc:*)", "Bash(file:*)",
]


def failure_of(PR, run_id):
    """What the pipeline has to say about the failed run, with the tail of
    the stage that was running."""
    global LAST_APP_ERROR
    if LAST_APP_ERROR:
        error, LAST_APP_ERROR = LAST_APP_ERROR, None
        return error
    try:
        state = PR.view(run_id)
    except Exception:  # noqa: BLE001
        return {"reason": "the pipeline stopped without a reason", "stage": None, "output": ""}
    stages = state.get("stages") or []
    current = next((st for st in reversed(stages) if st.get("stage") == state.get("stage")), stages[-1] if stages else {})
    output = ((current.get("stdout") or "")[-1500:] + "\n" + (current.get("stderr") or "")[-2500:]).strip()
    return {"reason": state.get("reason") or state.get("status") or "unknown", "stage": current.get("stage"),
            "command": current.get("command"), "output": output}


def repair_prompt(repo, failure, attempt):
    lines = [
        f"You are fixing a repository so that its application starts in a disposable Linux sandbox. The repository is at {repo}.",
        "Nothing you do here reaches GitHub: this copy is thrown away, and every change you make is shown to the person as a diff.",
        "",
        "The launch pipeline already tried to start it and failed:",
        failure["reason"],
        *([f"The person's hint about what to run: {os.environ['HC_PROJECT_HINT']}"] if os.environ.get("HC_PROJECT_HINT") else []),
    ]
    if failure.get("stage"):
        lines += ["", f"Stage that failed: {failure['stage']}" + (f" ({failure['command']})" if failure.get("command") else "")]
    if failure.get("app"):
        lines += ["", "The server came up and answered HTTP, but the application inside it crashed, most often on an import. "
                  "Fix the cause in the repository: a package of this repository that is not installed can be made importable "
                  "(an editable install line such as `-e ../..` in a requirements file the setup installs, or a sys.path entry), "
                  "a missing file the README says to create can be created from its template. If the output is not a crash, change nothing."]
    if failure.get("output"):
        lines += ["", "Its last output:", failure["output"]]
    if LAST_LOCAL_ERROR:
        lines += ["", "A local Supabase was started for it with Docker from supabase/config.toml, and that failed:", LAST_LOCAL_ERROR,
                  "How the pipeline does that: it copies supabase/migrations, supabase/seeds, supabase/seed.sql and supabase/roles.sql into a private "
                  "workspace and runs `supabase start` on an empty database, so migrations apply in filename order and seed files listed in "
                  "config.toml's [db.seed] sql_paths (inside supabase/) run after them. Only files under supabase/ are seen."]
    if LAST_MISSING:
        lines += ["", "Values for these environment variables are not available and cannot be obtained: " + ", ".join(LAST_MISSING) + ".",
                  "The application has to start without them: treat them as optional, and only where starting itself needs a value, give a harmless placeholder."]
    if attempt > 1:
        lines += ["", f"This is repair attempt {attempt}; earlier edits are still in place and did not suffice."]
    lines += [
        "",
        "Rules:",
        "- Make the smallest change that lets the application start and serve its first page. Do not change what it computes or how its features behave beyond what starting needs.",
        "- Prefer setup over logic: migrations, seeds, configuration, scripts, package manifests.",
        "- Do not delete tests, add secrets, touch .git, or write outside the repository. You can only read files and run read-only commands besides editing; the pipeline starts the application.",
        "- If the problem cannot be fixed by editing the repository, change nothing and say so.",
        "",
        'When done, reply with only JSON on one line: {"changed": true or false, "summary": "one or two sentences", "files": ["path", ...], "reason": "why this is needed and what it changes"}',
    ]
    return "\n".join(lines)


def repair(repo, failure, attempt):
    """Run the repair agent on the repository copy and report its edits.
    Returns the patch, or None when nothing changed."""
    global PATCH
    emit(phase="patch", status="starting", attempt=attempt, reason=str(failure.get("reason"))[:300], model=REPAIR_MODEL)
    answer, info = agent("repair", repair_prompt(repo, failure, attempt), REPAIR_MODEL, REPAIR_BUDGET,
                         tools=REPAIR_TOOLS, max_turns=80, timeout=REPAIR_TIMEOUT_S, cwd=repo)
    if info["error"] and not answer:
        emit(phase="patch", status="failed", attempt=attempt, reason="the repair agent " + info["error"], **cost_fields(info))
    diff, files, truncated = capture_diff(repo)
    if not diff.strip():
        emit(phase="patch", status="none", attempt=attempt, summary=answer.get("summary"), reason=answer.get("reason"), **cost_fields(info))
        return None
    PATCH = {"summary": answer.get("summary") or "The repair agent edited the repository.", "reason": answer.get("reason") or "",
             "files": files, "diff": diff, "truncated": truncated, "attempt": attempt}
    emit(phase="patch", status="applied", **PATCH, **cost_fields(info))
    return PATCH


def parse_answer(stdout):
    """The agent's final JSON, out of the CLI's own JSON envelope."""
    try:
        envelope = json.loads(stdout)
        text = envelope.get("result", "") if isinstance(envelope, dict) else ""
    except ValueError:
        text = stdout
    match = re.search(r"\{.*\}", text or "", re.S)
    if not match:
        return {}
    try:
        answer = json.loads(match.group(0))
        return answer if isinstance(answer, dict) else {}
    except ValueError:
        return {}


def capture_diff(repo):
    """Every edit in the working tree against the clone, new files included."""
    subprocess.run(["git", "add", "-A", "-N", "--", ".", NOT_THE_REPOSITORY], cwd=repo, capture_output=True)
    files = subprocess.run(["git", "diff", "--name-only", "--", ".", NOT_THE_REPOSITORY], cwd=repo, capture_output=True, text=True).stdout.split()
    diff = subprocess.run(["git", "diff", "--no-color", "--binary", "--", ".", NOT_THE_REPOSITORY], cwd=repo, capture_output=True, text=True, errors="replace").stdout
    truncated = len(diff.encode("utf-8")) > MAX_DIFF_BYTES
    if truncated:
        diff = diff.encode("utf-8")[:MAX_DIFF_BYTES].decode("utf-8", errors="ignore")
    return diff, files, truncated


def reset_local_supabase(PS, cwd):
    """A failed local stack leaves half-applied containers and volumes
    behind; a fresh start after a repair must not inherit them."""
    if not shutil.which("docker"):
        return
    try:
        _, target = PS.location(cwd)
        label = f"label=com.supabase.cli.project=engelbart-{target.name}"
        containers = subprocess.run(["docker", "ps", "-aq", "--filter", label], capture_output=True, text=True).stdout.split()
        if containers:
            subprocess.run(["docker", "rm", "-f", *containers], capture_output=True)
        volumes = subprocess.run(["docker", "volume", "ls", "-q", "--filter", label], capture_output=True, text=True).stdout.split()
        if volumes:
            subprocess.run(["docker", "volume", "rm", "-f", *volumes], capture_output=True)
        # Forget the failed schema too, or the pipeline refuses to start a
        # changed one over what it thinks is an existing database. The
        # ports stay, so the app's saved values still point at the stack.
        state = PS.read_state(target)
        PS.write_state(target, {"ports": state.get("ports", {})})
    except Exception as exc:  # noqa: BLE001
        emit(phase="supabase", status="reset-failed", reason=str(exc)[:200])


PLAN_KEYS = ("summary", "evidence", "preparation", "services", "entryService", "pythonRuntimes")
LOGS = {}   # per run record: which stage output has been emitted already


def capture(PR, run_id):
    """The plan that worked, portable to a fresh clone: the last attempt's
    validated plan when agents were involved, else the Railpack plan."""
    try:
        record = PR.read(run_id)
        root = str(Path(record.get("repositoryRoot", record["cwd"])).resolve())
        cwd = os.path.relpath(record["cwd"], root)
        attempts = (record.get("run") or {}).get("attempts") or []
        last = attempts[-1] if attempts else None
        extra = {"hint": RESOLVER_HINT} if RESOLVER_HINT else {}
        if last and last.get("services") and last.get("status") == "running":
            plan = relativize({"status": "plan", **{k: last[k] for k in PLAN_KEYS if k in last}}, root)
            return {"version": 1, "kind": "native", "cwd": cwd, "orderPlan": plan, "savedAt": time.time(), **extra}
        if record.get("orderPlan"):
            return {"version": 1, "kind": "native", "cwd": cwd, "orderPlan": relativize({**record["orderPlan"], "status": "plan"}, root), "savedAt": time.time(), **extra}
        if record.get("plan"):
            return {"version": 1, "kind": "railpack", "cwd": cwd, "plan": record["plan"], "savedAt": time.time(), **extra}
    except Exception as exc:  # noqa: BLE001
        emit(phase="recipe", status="ignored", reason="capture failed: " + str(exc)[:300])
    return None


def relativize(plan, root):
    """Step directories relative to the repository, so the plan survives a
    clone somewhere else."""
    out = json.loads(json.dumps(plan))
    for key in ("preparation", "services"):
        for step in out.get(key, []):
            for field in ("cwd", "environmentCwd"):
                if isinstance(step.get(field), str) and os.path.isabs(step[field]):
                    step[field] = os.path.relpath(step[field], root)
    return out


# --- The brief: what the repository is, before anyone plans anything.
#
# A librarian pass. The wrapper gathers what a careful reader would open
# first (the tree, every manifest, the README and docs, the environment
# sample, the examples) and one call turns that into a structured brief.
# The brief rides into hc's planner and repair agent as the hint, into the
# resolver and the setup agent as context, and is saved with the run so
# the next run of the same commit pays nothing for it.

PERSON_HINT = None      # the person's own line about what to run
BRIEF = None            # the brief, as the librarian call returned it
BUNDLE = None           # the compiled evidence the brief was made from
RESOLVER_HINT = None    # the resolver's correction, when it made one
ESCALATIONS = 0
BRIEF_TIMEOUT_S = 6 * 60
RESOLVER_TIMEOUT_S = 6 * 60
BUNDLE_LIMIT = 90_000
FILE_LIMIT = 3_000
SKIP_DIRS = {".git", "node_modules", ".venv", "venv", "env", "__pycache__", ".engelbart", "dist", "build", ".next", ".nuxt", ".cache",
             ".mypy_cache", ".pytest_cache", ".ruff_cache", "site-packages", ".idea", ".vscode", "target", "vendor", ".tox", ".eggs", "coverage"}
MANIFEST_NAMES = {"package.json", "pyproject.toml", "setup.py", "setup.cfg", "environment.yml", "environment.yaml", "Pipfile", "project.json", "nx.json",
                  "Makefile", "Dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml", "Procfile", "railpack.json",
                  "Cargo.toml", "go.mod", "Gemfile", "pom.xml", "build.gradle", "CMakeLists.txt", "WORKSPACE", "BUILD", "BUILD.bazel", "pnpm-workspace.yaml",
                  "lerna.json", "turbo.json", "vite.config.ts", "vite.config.js", "next.config.js", "next.config.mjs", "next.config.ts", "manifest.json", "wxt.config.ts"}
EXAMPLE_DIRS = ("examples", "example", "samples", "sample", "demo", "demos", "scripts", "notebooks", "tutorials", "configs", "config", "experiments")
ENV_SAMPLES = (".env.example", ".env.sample", ".env.template", ".env.local.example", "env.example", ".env.dist")
DOC_SUFFIXES = (".md", ".rst", ".txt")
PEEK_SUFFIXES = (".py", ".sh", ".md", ".js", ".ts", ".mjs", ".yaml", ".yml", ".json", ".toml", ".cfg", ".ini")


def read_text(path, limit):
    try:
        with open(path, "rb") as handle:
            data = handle.read(limit + 1)
    except OSError:
        return ""
    text = data[:limit].decode("utf-8", errors="replace")
    return text + ("\n… (truncated)" if len(data) > limit else "")


def compile_bundle(root):
    """Everything a reader would open first, as one text, sections headed by
    their paths. Bounded, deterministic, no model."""
    root = Path(root)
    parts = []
    if PERSON_HINT:
        parts.append("### The person's hint\n" + PERSON_HINT)

    # The tree to depth three, folders with their file counts.
    lines = []
    def walk(folder, depth, prefix):
        try:
            entries = sorted(folder.iterdir(), key=lambda e: (not e.is_dir(), e.name.lower()))
        except OSError:
            return
        for entry in entries:
            if entry.name in SKIP_DIRS or entry.name.startswith(".git"):
                continue
            if len(lines) >= 400:
                return
            if entry.is_dir():
                try:
                    inside = sum(1 for _ in entry.rglob("*") if _.is_file())
                except OSError:
                    inside = 0
                lines.append(f"{prefix}{entry.name}/ ({inside} files)")
                if depth < 3:
                    walk(entry, depth + 1, prefix + "  ")
            else:
                try:
                    size = entry.stat().st_size
                except OSError:
                    size = 0
                lines.append(f"{prefix}{entry.name} ({size} B)")
    walk(root, 1, "")
    parts.append("### Tree (depth 3)\n" + "\n".join(lines))

    # Manifests, wherever they are within three levels; root ones first.
    manifests = []
    for path in sorted(root.rglob("*")):
        rel = path.relative_to(root)
        if len(rel.parts) > 3 or any(part in SKIP_DIRS for part in rel.parts) or not path.is_file():
            continue
        name = path.name
        if name in MANIFEST_NAMES or (name.startswith("requirements") and name.endswith(".txt")):
            manifests.append((len(rel.parts), str(rel)))
    for _, rel in sorted(manifests)[:24]:
        parts.append(f"### {rel}\n" + read_text(root / rel, FILE_LIMIT))

    # READMEs and docs.
    readmes = [p for p in sorted(root.glob("README*")) if p.is_file()]
    for path in readmes[:2]:
        parts.append(f"### {path.name}\n" + read_text(path, 14_000))
    subdocs = []
    for path in sorted(root.rglob("README*")):
        rel = path.relative_to(root)
        if path.is_file() and 1 < len(rel.parts) <= 3 and not any(part in SKIP_DIRS for part in rel.parts):
            subdocs.append(rel)
    for rel in subdocs[:6]:
        parts.append(f"### {rel}\n" + read_text(root / rel, 3_000))
    docs = root / "docs"
    if docs.is_dir():
        for path in sorted(docs.glob("*"))[:4]:
            if path.is_file() and path.suffix in DOC_SUFFIXES:
                parts.append(f"### docs/{path.name}\n" + read_text(path, 1_500))
    for name in ("DEV.md", "DEVELOPMENT.md", "INSTALL.md", "SETUP.md", "CONTRIBUTING.md", "DEPLOY.md", "USAGE.md"):
        if (root / name).is_file():
            parts.append(f"### {name}\n" + read_text(root / name, 3_000))

    # Environment samples, whole: they name every key the app reads.
    for path in sorted(root.rglob("*")):
        rel = path.relative_to(root)
        if path.is_file() and path.name in ENV_SAMPLES and len(rel.parts) <= 3 and not any(part in SKIP_DIRS for part in rel.parts):
            parts.append(f"### {rel}\n" + read_text(path, 2_500))

    # Examples and scripts: what they are, and the head of a few.
    for name in EXAMPLE_DIRS:
        folder = root / name
        if not folder.is_dir():
            continue
        files = [p for p in sorted(folder.rglob("*")) if p.is_file() and not any(part in SKIP_DIRS for part in p.relative_to(root).parts)]
        listing = "\n".join(str(p.relative_to(root)) for p in files[:40]) + ("\n…" if len(files) > 40 else "")
        peek = [p for p in files if p.suffix in PEEK_SUFFIXES][:3]
        heads = "\n\n".join(f"--- {p.relative_to(root)} (first lines)\n" + read_text(p, 1_500) for p in peek)
        parts.append(f"### {name}/ ({len(files)} files)\n{listing}\n\n{heads}".rstrip())

    text = "\n\n".join(parts)
    if len(text) > BUNDLE_LIMIT:
        text = text[:BUNDLE_LIMIT] + "\n\n… (the bundle was cut here)"
    return text


BRIEF_SCHEMA = {
    "type": "object",
    "properties": {
        "purpose": {"type": "string", "description": "What the repository is, in one or two sentences: the system, its paper, its field."},
        "primaryApp": {"type": "object", "properties": {
            "path": {"type": "string", "description": "The directory of the application a person would run to see the system; '.' for the root."},
            "why": {"type": "string"},
            "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
        }, "required": ["path", "why", "confidence"]},
        "parts": {"type": "array", "items": {"type": "object", "properties": {
            "path": {"type": "string"},
            "kind": {"type": "string", "enum": ["web", "api", "cli", "library", "notebook", "dataset", "script", "bot", "extension", "other"]},
            "install": {"type": "string", "description": "The install command(s) the documentation gives, or the best reading of the manifest."},
            "start": {"type": "string", "description": "The command that starts or runs it; empty when it is not something one starts."},
            "port": {"type": "integer"},
            "requires": {"type": "array", "items": {"type": "string"}, "description": "Names of what this part needs from the requires list."},
        }, "required": ["path", "kind", "install", "start", "requires"]}},
        "requires": {"type": "array", "items": {"type": "object", "properties": {
            "name": {"type": "string", "description": "The variable, service, dataset or device, by its exact name where one exists."},
            "kind": {"type": "string", "enum": ["secret", "service", "data", "hardware", "tool"]},
            "neededFor": {"type": "string", "description": "What stops working without it: starting, or only a feature."},
            "optional": {"type": "boolean"},
        }, "required": ["name", "kind", "neededFor", "optional"]}},
        "examples": {"type": "array", "items": {"type": "string"}, "description": "Ready-made inputs, scenarios or configs a run can use, by path."},
        "traps": {"type": "array", "items": {"type": "string"}, "description": "What will go wrong for someone following the README literally, with the evidence."},
        "nothingToServe": {"type": "object", "properties": {"value": {"type": "boolean"}, "reason": {"type": "string"}}, "required": ["value", "reason"]},
        "hintForPlanner": {"type": "string", "description": "At most 600 characters for the launch planner: which directory to run, the install and start commands, the port, and what to avoid. Concrete, no hedging."},
    },
    "required": ["purpose", "primaryApp", "parts", "requires", "examples", "traps", "nothingToServe", "hintForPlanner"],
}

BRIEF_SYSTEM = ("You are a librarian for research software. You read what is in front of you and describe the repository exactly, "
                "with paths as evidence, for an automated pipeline that will try to install and start it in a Linux sandbox without a person. "
                "Say what the evidence shows; when it does not settle a question, say so in the confidence field and the traps, never by guessing.")


def brief_prompt(bundle):
    return "\n".join([
        "Describe this repository for the pipeline that will run it. The pipeline can create Python venvs and pip install, run npm, pnpm or bun installs and scripts, "
        "and start commands; it cannot use conda, Docker, sudo, or obtain secrets. Where the documentation says conda, translate to what pip can do from the same file.",
        "Answer in the JSON schema you were given. Rules: purpose from the README and paper; primaryApp is what a person runs to see the system the paper is about "
        "(a web interface, a study interface, an app), and a library, dataset, CLI, bot or extension is nothingToServe with the reason; parts cover every runnable "
        "directory with the exact install and start commands the repository documents or its manifests imply; requires names every key, service, dataset or device "
        "with whether starting itself needs it; examples list ready inputs (scenario files, sample configs, demo data) with paths; traps are the things that will "
        "go wrong for someone following the README literally, each with its evidence; hintForPlanner is at most 600 characters and tells the planner exactly what to run.",
        "",
        "The repository:",
        "",
        bundle,
    ])


def brief_hint():
    if not BRIEF:
        return ""
    return str(BRIEF.get("hintForPlanner") or "")[:600]


def install_hint():
    """What the planner should know about the install that is already
    going. Not a guarantee — hc plans its own steps — but the planner has
    no other way to learn that these dependencies are in hand, and a plan
    that installs them again discards everything the head start did and
    pays for it twice."""
    if not REPO:
        return ""
    now = INSTALL.state(REPO)
    command = " ".join(now.get("command") or [])
    when = {"running": "is ALREADY INSTALLING this repository's dependencies and will have finished before any step of your plan runs",
            "done": "has ALREADY INSTALLED this repository's dependencies"}.get(now.get("status"))
    if not when:
        return ""
    return (f"`{command}` {when}. Do not plan that install again; plan what comes after it. If you plan one anyway, use the "
            "package manager's non-destructive install rather than its clean one (`npm install`, not `npm ci`), so it finds "
            "the work already done instead of deleting it and starting over.")


def apply_hint():
    """What hc's planner and repair agent see as the hint: the person's own
    line, then the brief's, then the resolver's correction, which wins."""
    lines = []
    if PERSON_HINT:
        lines.append(PERSON_HINT)
    if BRIEF:
        confidence = ((BRIEF.get("primaryApp") or {}).get("confidence") or "").strip()
        lines.append("Repository brief" + (f" (confidence {confidence})" if confidence else "") + ": " + brief_hint())
    if RESOLVER_HINT:
        lines.append("Correction after a failed attempt, which takes precedence: " + RESOLVER_HINT)
    already = install_hint()
    if already:
        lines.append(already)
    os.environ["HC_PROJECT_HINT"] = "\n".join(lines)[:2000]


def render_brief(brief):
    """BRIEF.md, for the person and for the setup agent."""
    out = ["# Repository brief", "", str(brief.get("purpose") or ""), ""]
    primary = brief.get("primaryApp") or {}
    out += [f"**Primary application:** `{primary.get('path', '.')}` ({primary.get('confidence', '?')} confidence). {primary.get('why', '')}", ""]
    parts = brief.get("parts") or []
    if parts:
        out += ["## Parts", ""]
        for part in parts:
            port = f", port {part['port']}" if part.get("port") else ""
            req = f" Needs: {', '.join(part['requires'])}." if part.get("requires") else ""
            out += [f"- `{part.get('path')}` ({part.get('kind')}{port}): install `{part.get('install') or '-'}`; start `{part.get('start') or '-'}`.{req}"]
        out.append("")
    requires = brief.get("requires") or []
    if requires:
        out += ["## Requirements", ""]
        for item in requires:
            out += [f"- {item.get('name')} ({item.get('kind')}{', optional' if item.get('optional') else ''}): {item.get('neededFor')}"]
        out.append("")
    if brief.get("examples"):
        out += ["## Ready inputs", ""] + [f"- {e}" for e in brief["examples"]] + [""]
    if brief.get("traps"):
        out += ["## Traps", ""] + [f"- {t}" for t in brief["traps"]] + [""]
    nothing = brief.get("nothingToServe") or {}
    if nothing.get("value"):
        out += ["## Nothing to serve", "", str(nothing.get("reason") or ""), ""]
    out += ["## For the planner", "", brief_hint(), ""]
    return "\n".join(out)


def write_brief_files(root):
    if not BRIEF:
        return
    folder = Path(root) / SETUP_DIR
    try:
        folder.mkdir(exist_ok=True)
        (folder / "BRIEF.md").write_text(render_brief(BRIEF), encoding="utf-8")
        (folder / "brief.json").write_text(json.dumps(BRIEF, indent=1), encoding="utf-8")
    except OSError:
        pass


def ensure_brief(repo):
    """Make or load the brief once, before the first plan."""
    global BRIEF, BUNDLE
    if BUNDLE is not None:
        return
    root = str(Path(repo).resolve())
    BUNDLE = compile_bundle(root)
    saved = os.environ.get("HC_BRIEF_FILE")
    if saved and Path(saved).is_file():
        try:
            loaded = json.loads(Path(saved).read_text())
            if isinstance(loaded, dict) and loaded.get("purpose"):
                BRIEF = loaded
                write_brief_files(root)
                apply_hint()
                emit(phase="brief", status="cached", brief=BRIEF)
                return
        except (OSError, ValueError):
            pass
    emit(phase="brief", status="starting", model=BRIEF_MODEL, bundleChars=len(BUNDLE))
    # A structured answer costs a turn per try at the schema, and a long
    # brief can take several; the budget is the real cap.
    answer, info = agent("brief", brief_prompt(BUNDLE), BRIEF_MODEL, BRIEF_BUDGET, timeout=BRIEF_TIMEOUT_S, cwd=root,
                         schema=BRIEF_SCHEMA, system=BRIEF_SYSTEM, max_turns=10)
    if not answer.get("purpose"):
        # Without a brief every rung below works half blind; one more try
        # with the stronger model is cheaper than that.
        emit(phase="brief", status="retrying", reason=info["error"] or "no brief came back", model=RESOLVER_MODEL, **cost_fields(info))
        answer, info = agent("brief", brief_prompt(BUNDLE), RESOLVER_MODEL, BRIEF_BUDGET * 2, timeout=BRIEF_TIMEOUT_S, cwd=root,
                             schema=BRIEF_SCHEMA, system=BRIEF_SYSTEM, max_turns=10)
    if not answer.get("purpose"):
        emit(phase="brief", status="failed", reason=info["error"] or "no brief came back", **cost_fields(info))
        return
    BRIEF = answer
    write_brief_files(root)
    apply_hint()
    emit(phase="brief", status="done", brief=BRIEF, **cost_fields(info))


# --- The resolver: a second opinion with the whole repository in view.

RESOLVER_SCHEMA = {
    "type": "object",
    "properties": {
        "status": {"type": "string", "enum": ["plan", "blocked", "read"]},
        "hint": {"type": "string", "description": "With status plan: at most 600 characters telling the pipeline exactly what to run: the directory, the install and start commands, the port, what to avoid, and what the earlier attempt got wrong."},
        "blocker": {"type": "object", "properties": {
            "kind": {"type": "string", "enum": ["secret", "service", "hardware", "data", "upstream", "unknown"]},
            "what": {"type": "string", "description": "Exactly what is missing or broken, by name, and how the person would supply it."},
        }, "required": ["kind", "what"]},
        "evidence": {"type": "array", "items": {"type": "string"}, "description": "Paths and lines that support the answer."},
        "files": {"type": "array", "items": {"type": "string"}, "description": "With status read: up to six repository paths to read before answering."},
    },
    "required": ["status", "evidence"],
}

RESOLVER_SYSTEM = ("You are the second opinion on why an automated pipeline could not start a repository's application in a Linux sandbox. "
                   "You see the whole repository, the librarian's brief, the plan the pipeline had, and why it gave up. "
                   "Decide from evidence, cite paths, and never propose what the pipeline cannot do.")


def resolver_prompt(step, status, reason, stage, output, plan, commands, files=None):
    lines = [
        "The pipeline gave up. Decide which of three answers is right:",
        "- plan: the pipeline misread the repository or missed something it could have done (the wrong directory, a missing install line, an input file that exists under examples/, "
        "a setup step the README describes). Write a hint of at most 600 characters telling it exactly what to run. The pipeline can: create a Python venv (any version via uv) and pip install "
        "packages or requirements files, run npm, pnpm or bun install and package scripts, run start commands, set environment values that are not secrets. It cannot: conda, Docker, sudo, "
        "obtain secrets, download large datasets.",
        "- blocked: nothing the pipeline can do starts it. Name the blocker: secret (an API key or credential), service (a database or external server), hardware (a GPU or device), "
        "data (a dataset that must be downloaded), upstream (the code is broken as published), and exactly what is needed.",
        "- read: you need up to six specific files first; name them and you will be called once more with their contents.",
        "",
        f"Where it gave up: step {step}, status {status}" + (f", stage {stage}" if stage else ""),
        "Reason given: " + str(reason)[:2000],
    ]
    if commands:
        lines += ["Commands the pipeline proposed and refused: " + " · ".join(str(c) for c in commands)[:1500]]
    if plan:
        lines += ["", "The plan it had:", json.dumps(plan)[:4000]]
    if output:
        lines += ["", "The last output of the failing stage:", str(output)[-3500:]]
    if BRIEF:
        lines += ["", "The librarian's brief:", json.dumps(BRIEF)[:6000]]
    if files:
        lines += ["", "The files you asked for:"]
        for name, text in files:
            lines += [f"### {name}", text]
    lines += ["", "The repository:", "", BUNDLE or compile_bundle(REPO)]
    return "\n".join(lines)


def resolve(step, status, reason, stage=None, output="", plan=None, commands=None):
    """One call, with one follow-up for files. Returns the verdict."""
    root = str(Path(REPO).resolve())
    emit(phase="resolve", status="starting", step=step, model=RESOLVER_MODEL, reason=str(reason)[:600])
    files = None
    for call in (1, 2):
        answer, info = agent("resolve", resolver_prompt(step, status, reason, stage, output, plan, commands, files), RESOLVER_MODEL,
                             RESOLVER_BUDGET, timeout=RESOLVER_TIMEOUT_S, cwd=root, schema=RESOLVER_SCHEMA, system=RESOLVER_SYSTEM)
        verdict = answer.get("status")
        if verdict == "read" and call == 1 and isinstance(answer.get("files"), list):
            files = []
            for name in [str(n) for n in answer["files"]][:6]:
                path = (Path(root) / name)
                try:
                    path.resolve().relative_to(Path(root).resolve())
                except ValueError:
                    files.append((name, "(outside the repository)"))
                    continue
                files.append((name, read_text(path, 6_000) if path.is_file() else "(no such file)"))
            emit(phase="resolve", status="reading", files=[n for n, _ in files], **cost_fields(info))
            continue
        if verdict == "plan" and answer.get("hint"):
            hint = str(answer["hint"])[:600]
            emit(phase="resolve", status="plan", hint=hint, evidence=answer.get("evidence"), **cost_fields(info))
            return {"status": "plan", "hint": hint, "evidence": answer.get("evidence")}
        if verdict == "blocked":
            blocker = answer.get("blocker") or {"kind": "unknown", "what": str(reason)[:500]}
            emit(phase="resolve", status="blocked", blocker=blocker, evidence=answer.get("evidence"), **cost_fields(info))
            return {"status": "blocked", "blocker": blocker, "evidence": answer.get("evidence")}
        emit(phase="resolve", status="failed", reason=info["error"] or f"no usable verdict ({verdict})", **cost_fields(info))
        break
    return {"status": "failed"}


SECRET_WORDS = re.compile(r"api[_ -]?key|token|secret|credential|password|\bkey\b|account|login", re.I)


def secret_only(status, reason):
    """The environment scan already found the only thing missing: a value
    nobody here can supply. No second opinion needed."""
    return status == "needs_input" and bool(LAST_MISSING) and bool(SECRET_WORDS.search(str(reason or "")))


def plan_of(PR, run_id):
    try:
        record = PR.read(run_id)
        return record.get("orderPlan") or record.get("plan")
    except Exception:  # noqa: BLE001
        return None


def escalate(step, status, reason, stage=None, output="", plan=None, commands=None):
    """The planner or the runner gave up. The ladder: once, a stronger model
    corrects the plan (return, and the caller runs again); otherwise the
    repository is set up for use with the blocker written down (never
    returns)."""
    global ESCALATIONS, RESOLVER_HINT
    LAST_ESCALATION.update(stage=stage, output=str(output or "")[-4000:], plan=plan)
    if secret_only(status, reason):
        blocked(reason, {"kind": "secret", "what": str(reason)[:500], "names": list(LAST_MISSING)}, step)
    if RECOVERY == "session":
        # The planner gave up before the run ever started, so main()'s
        # session branch is not reached from here. Hand it over anyway,
        # rather than through the tool-less resolver this arm exists to
        # replace: correcting a plan by reading the repository is the
        # session's own work, and asking a model with no tools to guess
        # first spends money to make the arms less different.
        blocked(reason, {"kind": "unknown", "what": str(reason)[:500]}, step)
    if ESCALATIONS == 0:
        ESCALATIONS += 1
        verdict = resolve(step, status, reason, stage, output, plan, commands)
        if verdict.get("status") == "plan":
            RESOLVER_HINT = verdict["hint"]
            apply_hint()
            return
        blocker = verdict.get("blocker") or {"kind": "unknown", "what": str(reason)[:500]}
        blocked(reason, blocker, step)
    blocked(reason, {"kind": "unknown", "what": "The corrected plan did not start it either: " + str(reason)[:400]}, step)


# --- Setting a repository up for use when the pipeline could not start it.
#
# An agent installs the repository the way its documentation says, writes a
# check that proves it works, and writes what the person runs next. The
# check is run by the pipeline itself before the run is called usable, and
# the scripts are the trail for next time.
#
# When the brief says there is an application, "usable" is not an ending
# unless something outside the sandbox's reach (a secret, a service, a
# device, a dataset) keeps it from starting. Otherwise the rung has to start
# the application itself and get a page, with everything the earlier rungs
# found handed to it: the repair agent's edits (already in this copy), the
# resolver's correction, and the failing stage's output.

REPO = None
LAST_CHECK = None
# The values the person supplied for this repository. hc applies them to
# the steps of its own plan; anything the runner starts itself — the
# setup rung's start.sh and check.sh, the recovery session's launch —
# inherits this process's environment and would otherwise start without
# them, which is the difference between a run that is up and a run that
# works. Never emitted, never in a prompt: only the names travel.
SAVED_ENV = {}
SETUP_DIR = ".engelbart"
# The harness's own folder is not part of the repository's edits. It is
# recreated from the recipe's own fields on a replay — the scripts, the
# ignore file, the install's bookkeeping — and a patch that also carries
# them fails to apply against the folder the replay has just written
# ("already exists in working directory"), which loses the replay and
# with it the entire point of saving a recipe.
NOT_THE_REPOSITORY = ":(exclude).engelbart/"
SETUP_TIMEOUT_S = 30 * 60
CHECK_TIMEOUT_S = 5 * 60
SETUP_ATTEMPTS = 2
SETUP_TOOLS = ["Read", "Grep", "Glob", "LS", "Edit", "MultiEdit", "Write", "Bash"]
SETUP_IGNORE = "venv/\nnode_modules/\ndata/\n*.log\n"
SETUP_START_TIMEOUT_S = 10 * 60   # how long the started application gets to answer at its URL
START_POLL_S = 3
HARD_BLOCKERS = ("secret", "service", "hardware", "data")   # what no agent in this sandbox can supply
LAST_ESCALATION = {}    # what the failed attempt left for the setup rung: the stage output and the plan
APP = None              # the application the setup rung started: its process, URL and log


def app_expected(blocked=False):
    """Whether there is an application a person would open. The brief
    says; without one, a pipeline that was blocked starting something was
    starting an application."""
    if not BRIEF:
        return blocked
    nothing = (BRIEF.get("nothingToServe") or {}).get("value")
    return not nothing and (blocked or bool((BRIEF.get("primaryApp") or {}).get("path")))


def must_start(blocker, blocked=False):
    """Usable is an ending for an application only when the blocker is
    something this sandbox cannot supply; otherwise the rung starts it."""
    return app_expected(blocked) and (blocker or {}).get("kind") not in HARD_BLOCKERS


def tried():
    """What the earlier rungs found, so nothing is lost on the way down."""
    lines = []
    if PATCH and PATCH.get("files"):
        lines.append(f"A repair agent already edited this copy ({PATCH.get('summary')}): " + ", ".join(str(f) for f in PATCH["files"][:20])
                     + f". Its diff is at {SETUP_DIR}/REPAIR.diff; build on it rather than undoing it.")
    if RESOLVER_HINT:
        lines.append("A reviewer's correction of the plan, which did not start it either: " + RESOLVER_HINT)
    if LAST_ESCALATION.get("plan"):
        lines.append("The plan the pipeline ran: " + json.dumps(LAST_ESCALATION["plan"])[:1500])
    if LAST_ESCALATION.get("output"):
        lines.append("The last output of the failing stage" + (f" ({LAST_ESCALATION.get('stage')})" if LAST_ESCALATION.get("stage") else "") + ":\n"
                     + str(LAST_ESCALATION["output"])[-2500:])
    return lines


def setup_prompt(repo, reason, attempt, last_output, blocker=None, start=False):
    if start:
        app = (BRIEF or {}).get("primaryApp") or {}
        situation = [f"The repository is at {repo}. Its brief says it has an application a person would open ({app.get('path')}: {str(app.get('why') or '')[:300]}), but the automated pipeline could not start it: {reason}"]
        if blocker:
            situation.append(f"A review read the failure as {blocker.get('kind', 'unknown')}: {blocker.get('what', '')}. That is a reading, not a verdict; if you can start the application, do.")
        situation += tried()
        situation.append("Your job is to get that application running here, answering on a port, and to leave a script that starts it the same way. "
                         "You have a shell: start it yourself to see what happens, read the server's output and the page, and fix what stops it. What is broken as published you fix in this copy "
                         "(pin a dependency, patch a line, write a configuration file). A value the code needs that is not a secret (a port, a host, a flag, a placeholder project id for something that runs locally) you set. "
                         "Only a secret, an external service, a device or a dataset that this sandbox truly cannot have is a blocker; then you answer with the blocker instead of a start, and NEXT.md opens with what the person must provide.")
    elif blocker:
        what = f"{blocker.get('kind', 'unknown')}: {blocker.get('what', reason)}"
        situation = [f"The repository is at {repo}. It has an application, but the pipeline could not start it here, and a review confirmed the blocker is outside this sandbox's reach ({what}).",
                     *tried(),
                     "Install and build everything the blocker does not prevent, so that once the person supplies what is missing, starting is one command. "
                     "The first line of NEXT.md states the blocker and exactly what the person must provide (which variable, which service, which download); then the command that starts the application once it is provided."]
    else:
        situation = [f"The repository is at {repo}. The pipeline already concluded it has no web application of its own to serve: {reason}"]
    processes = ("You may start servers to try them, and must stop every process you started before you answer: the pipeline starts the application from your start script." if start
                 else "Do not start servers or background processes.")
    files = [
        f"1. {SETUP_DIR}/setup.sh: idempotent; runs from a fresh clone as `bash {SETUP_DIR}/setup.sh` from the repository root. It creates the environment inside {SETUP_DIR}/: a Python venv at {SETUP_DIR}/venv (`uv venv --python X.Y {SETUP_DIR}/venv` when the project needs a Python other than 3.11, else `python3 -m venv {SETUP_DIR}/venv`), then installs the project the way its documentation says (editable install, the extras it needs, requirements files; npm install and a build for JavaScript), and downloads only what is small and required. Datasets the README says to download by the gigabyte are not downloaded; say how in NEXT.md instead.",
        f"2. {SETUP_DIR}/check.sh: finishes in under two minutes and exits 0 only when the setup works: import the package, run the tool with --help, run the smallest documented example or the fastest unit test, or list the files a dataset repository provides. Runs as `bash {SETUP_DIR}/check.sh` from the repository root.",
        f"3. {SETUP_DIR}/NEXT.md: for the researcher. First a line on what this repository is. Then the exact commands to run next to reproduce what the README or paper describes (the analyses, experiments, figures), each with a line on what it does and roughly how long it takes, and what still needs data, credentials or a GPU. Commands use {SETUP_DIR}/venv/bin/python or the tool's path in that venv.",
    ]
    if start:
        files.append(f"4. {SETUP_DIR}/start.sh: starts the application from the repository root as `bash {SETUP_DIR}/start.sh`, with the environment setup.sh made, on a fixed port on 127.0.0.1 or 0.0.0.0. It stays in the foreground: `exec` the entry server as its last line, and when there are several processes (a frontend and its API), start the others in the background first, then `exec` the entry. No daemonizing, no `nohup`, nothing that returns before the server does.")
        answer = ('Answer, last, with one JSON object: {"summary": "one line on what was set up", "check": "what check.sh proves", "next": "one paragraph: the first thing the researcher runs and why", '
                  '"start": {"url": "http://127.0.0.1:PORT/the-path-a-person-opens", "readyWithin": seconds the server needs before it answers}}. '
                  'Only when a blocker outside the sandbox truly prevents starting, answer instead with {"summary": ..., "check": ..., "next": ..., "blocker": {"kind": "secret" | "service" | "hardware" | "data", "what": "exactly what is missing and how the person supplies it"}} and no start.')
        practice = (f"Run setup.sh, then check.sh, then start.sh yourself; fetch the URL with curl and read the page and the server's output until the application answers without an error; then stop it. Fix until this holds. "
                    "Stop what you started by the process id you recorded (`$!`, or `kill` on the pid a port belongs to), never with `pkill -f` on a pattern. "
                    f"Put large downloads under {SETUP_DIR}/data/, which git ignores. Edit the repository's own files where the install or start cannot work otherwise, and say what you changed in NEXT.md.")
    else:
        answer = 'Answer, last, with one JSON object: {"summary": "one line on what was set up", "check": "what check.sh proves", "next": "one paragraph: the first thing the researcher runs and why"}'
        practice = (f"Run setup.sh and then check.sh yourself and fix them until check.sh exits 0. Put large downloads under {SETUP_DIR}/data/, which git ignores. If a dependency is broken as published, pin or replace it in setup.sh and say so in NEXT.md. "
                    "Do not edit the repository's own files unless the install cannot work otherwise, and then say what you changed in NEXT.md.")
    lines = [
        "You are setting up a repository so that a researcher can use it: the next thing they do should be running what its README or paper describes (an analysis, an experiment, a benchmark, a notebook, a simulation, or the application itself), not installing anything.",
        *situation,
        *([f"The person's hint: {PERSON_HINT}"] if PERSON_HINT else []),
        *([f"What is known about the repository (read {SETUP_DIR}/BRIEF.md for the whole brief): {brief_hint()}"] if BRIEF else []),
        "",
        f"This is a disposable Linux sandbox: Debian, Python 3.11 at /usr/local/bin/python3, uv for other Python versions, Node 22 with npm, pnpm and bun. You may install packages and download small, documented assets. {processes} Do not use sudo, and write only inside the repository.",
        "",
        f"Write {'four' if start else 'three'} files in {SETUP_DIR}/ inside the repository:",
        *files,
        "",
        practice,
        "",
        answer,
    ]
    if attempt > 1 and last_output:
        lines += ["", f"This is attempt {attempt}. The previous attempt did not pass; its output ended with:", last_output[-2500:]]
    return "\n".join(lines)


def setup_agent(repo, reason, attempt, last_output, blocker=None, start=False):
    """Run the setup agent in the repository; returns its final answer."""
    model = SETUP_MODEL if attempt == 1 else SETUP_RETRY_MODEL
    emit(phase="setup", status="starting", attempt=attempt, model=model, goal="start" if start else "use")
    answer, info = agent("setup", setup_prompt(repo, reason, attempt, last_output, blocker, start), model, SETUP_BUDGET,
                         tools=SETUP_TOOLS, max_turns=150, timeout=SETUP_TIMEOUT_S, cwd=repo)
    if info["error"] and not answer:
        emit(phase="setup", status="failed", attempt=attempt, reason="the setup agent " + info["error"], **cost_fields(info))
        return {}
    emit(phase="setup", status="done", attempt=attempt, summary=answer.get("summary"), check=answer.get("check"), **cost_fields(info))
    return answer


def local_url(url):
    """The URL as the sandbox reaches it: every name for this machine is 127.0.0.1."""
    url = str(url or "").strip()
    if "://" not in url:
        url = "http://" + url
    try:
        parts = urlsplit(url)
        if not parts.port:
            return None
    except ValueError:
        return None
    host = parts.hostname or "127.0.0.1"
    if host in ("0.0.0.0", "localhost", "::", "[::]"):
        host = "127.0.0.1"
    return urlunsplit((parts.scheme or "http", f"{host}:{parts.port}", parts.path or "/", parts.query, ""))


def answers(url):
    """Whether something answers HTTP at the URL; any response counts."""
    try:
        urlopen(url, timeout=5).close()
        return True
    except HTTPError:
        return True
    except (URLError, OSError, ValueError):
        return False


def log_tail(path, limit=4000):
    try:
        return Path(path).read_text(encoding="utf-8", errors="replace")[-limit:].strip()
    except OSError:
        return ""


def stop_app(proc):
    """Stop the start script and everything it started."""
    if proc.poll() is not None:
        return
    try:
        os.killpg(proc.pid, signal.SIGTERM)
        proc.wait(timeout=8)
    except (ProcessLookupError, PermissionError):
        return
    except subprocess.TimeoutExpired:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass


def free_port(port):
    """A server the agent left running on the port would answer in place
    of the one start.sh starts, and the recipe would lie next time."""
    if not answers(f"http://127.0.0.1:{port}/"):
        return
    emit(phase="start", status="leftover", port=port)
    try:
        subprocess.run(["fuser", "-k", f"{port}/tcp"], capture_output=True, timeout=10)
    except (OSError, subprocess.TimeoutExpired):
        pass
    time.sleep(2)


def start_app(root, url, attempt=None):
    """Run the setup rung's start script, wait for the application to
    answer at its URL, and open the page as a person would. True when it
    is live; the process is kept in APP for the watch."""
    global APP, LAST_CHECK
    url = local_url(url)
    if not url:
        LAST_CHECK = "the start URL names no port"
        emit(phase="start", status="failed", attempt=attempt, reason=LAST_CHECK)
        return False
    port = urlsplit(url).port
    free_port(port)
    log = Path(root) / SETUP_DIR / "start.log"
    emit(phase="start", status="starting", attempt=attempt, url=url)
    if os.environ.get("HC_NODE_PRELOAD"):
        # This rung runs a shell script an agent wrote, so what ends up
        # being the application is not known here. Guessing would mean
        # setting NODE_OPTIONS on something that is not Node, and a
        # refused option reads as the artifact crashing. Said plainly
        # instead: the application runs, and is not watched.
        detail = "the setup rung starts the application from a shell script, which is not instrumented"
        emit(phase="capability", capability="modelCapture", stage="start.sh", state="unsupported_launcher", detail=detail)
        report_capability((os.environ.get("ENGELBART_MODEL_GATEWAY_URL") or "").rstrip("/"), "unsupported_launcher", detail)
    with open(log, "w", encoding="utf-8") as handle:
        proc = subprocess.Popen(["bash", str(Path(root) / SETUP_DIR / "start.sh")], cwd=root, env=dict(os.environ, PIP_NO_CACHE_DIR="1", **SAVED_ENV),
                                stdout=handle, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, start_new_session=True)
    deadline = time.time() + SETUP_START_TIMEOUT_S
    while time.time() < deadline:
        if proc.poll() is not None:
            tail = log_tail(log)
            LAST_CHECK = f"the start script exited with {proc.returncode} before the application answered: " + tail[-300:]
            emit(phase="start", status="failed", attempt=attempt, reason=LAST_CHECK[:600], output=tail)
            return False
        if answers(url):
            break
        time.sleep(START_POLL_S)
    else:
        stop_app(proc)
        tail = log_tail(log)
        LAST_CHECK = f"the application did not answer at {url} within {SETUP_START_TIMEOUT_S // 60} minutes: " + tail[-300:]
        emit(phase="start", status="failed", attempt=attempt, reason=LAST_CHECK[:600], output=tail)
        return False
    time.sleep(2)
    report = visit(url)
    emit_visit(report, attempt=attempt)
    time.sleep(2)
    tail = log_tail(log)
    text = report.get("text") or ""
    hit = next((m for m in PAGE_ERROR_MARKERS if m in text), None) or next((m for m in APP_ERROR_MARKERS if m in tail), None)
    if proc.poll() is not None:
        LAST_CHECK = f"the application answered once at {url}, then exited with {proc.returncode}: " + tail[-300:]
        emit(phase="start", status="failed", attempt=attempt, reason=LAST_CHECK[:600], output=tail)
        return False
    if hit:
        stop_app(proc)
        LAST_CHECK = f"the application answers at {url}, but shows an error ({hit})"
        emit(phase="start", status="failed", attempt=attempt, reason=LAST_CHECK, output=f"Page text:\n{text[:2500]}\n\nServer output:\n{tail}")
        return False
    APP = {"proc": proc, "url": url, "log": log}
    emit(phase="start", status="answering", attempt=attempt, url=url)
    return True


def go_live(url):
    """Announce the application the setup rung started, as the run loop
    would: the same ready event, one entry service."""
    parts = urlsplit(url)
    service = {"id": "app", "host": parts.hostname, "port": parts.port, "isEntry": True, "embeddable": True}
    emit(phase="ready", url=url, host=parts.hostname, port=parts.port, pid=APP["proc"].pid, services=[service])


def as_text(raw):
    """What a killed process printed, as text.

    subprocess hands TimeoutExpired its raw bytes even when the call
    asked for text, so the only place this matters is the one place that
    is already going badly: a script that printed something and then ran
    out of time. Concatenating that with a string raises, and the
    TypeError replaces the timeout as the thing that went wrong."""
    if isinstance(raw, (bytes, bytearray)):
        return bytes(raw).decode("utf-8", errors="replace")
    return raw or ""


def run_script(script, cwd, timeout):
    timeout = bounded(timeout)
    if timeout <= 0:
        return False, f"there was no time left in this run to run {Path(script).name}"
    env = dict(os.environ, PIP_NO_CACHE_DIR="1", **SAVED_ENV)
    try:
        proc = subprocess.run(["bash", str(script)], cwd=cwd, env=env, capture_output=True, text=True, errors="replace", timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        return False, (as_text(exc.stdout) + "\n" + as_text(exc.stderr) + f"\n(stopped after {timeout} s)").strip()
    return proc.returncode == 0, ((proc.stdout or "") + "\n" + (proc.stderr or "")).strip()


def read_setup_file(root, name):
    try:
        return (Path(root) / SETUP_DIR / name).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def setup_for_use(repo, reason, recipe=None, blocker=None, blocked=False):
    """Install the repository for use and prove it with its check; when the
    brief says there is an application and nothing outside the sandbox
    blocks it, start it and get a page. From a saved recipe when there is
    one, else with the agent. True when usable or live."""
    global LAST_CHECK
    root = str(Path(repo).resolve())
    folder = Path(root) / SETUP_DIR
    folder.mkdir(exist_ok=True)
    (folder / ".gitignore").write_text(SETUP_IGNORE)
    write_brief_files(root)
    write_app_env(root)
    if PATCH and PATCH.get("diff"):
        (folder / "REPAIR.diff").write_text(PATCH["diff"], encoding="utf-8")
    if recipe:
        patch = recipe.get("patch") or {}
        if patch.get("diff"):
            try:
                apply_patch(root, patch)
            except ValueError:
                return False
        for name, key in (("setup.sh", "setup"), ("check.sh", "check"), ("NEXT.md", "next"), ("start.sh", "start")):
            if recipe.get(key):
                (folder / name).write_text(recipe[key])
        emit(phase="setup", status="replaying")
        ok, output = run_script(folder / "setup.sh", root, SETUP_TIMEOUT_S)
        emit(phase="setup", status="done" if ok else "failed", output=output[-1500:])
        if not ok:
            LAST_CHECK = "the saved setup script failed: " + output[-300:]
            return False
        ok, output = run_script(folder / "check.sh", root, CHECK_TIMEOUT_S)
        emit(phase="check", status="ok" if ok else "failed", output=output[-1500:])
        if not ok:
            LAST_CHECK = output[-500:]
            return False
        saved = [x for x in (recipe.get("services") or []) if isinstance(x, dict)]
        if saved:
            # A recovery recipe names launchers rather than a script, so
            # replaying it goes through the same instrumented start the
            # session's own launch did. This is the reason the shape is
            # worth having: a saved shell script could never be watched.
            if not start_services(root, saved):
                return False
            go_live_services()
            return True
        if recipe.get("startUrl"):
            if not start_app(root, recipe["startUrl"]):
                return False
            go_live(APP["url"])
            return True
        if recipe.get("complete") is False:
            # Setup that was saved because a session ran out of rounds,
            # budget or time, not because the repository was finished
            # with. Its setup.sh and check.sh have just run, so the
            # dependencies are installed and the tree is as the session
            # left it — which is a head start for this run, not a result
            # to report. Saying no here is what sends the run on to try
            # the application again instead of showing a person an
            # unstarted application as ready.
            LAST_CHECK = "the saved setup was unfinished: the application was never started"
            emit(phase="recipe", status="incomplete", reason=LAST_CHECK,
                 summary=recipe.get("summary"), check=recipe.get("checkSummary"))
            return False
        emit(phase="usable", summary=recipe.get("summary"), next=(recipe.get("next") or "")[:4000], check=recipe.get("checkSummary"), output=output[-1500:], blocker=recipe.get("blocker"))
        return True

    start = must_start(blocker, blocked=blocked)
    fallback = None   # the last attempt that was installed and checked, when the application would not start
    last_url = ""     # the start URL an earlier attempt named, for one whose agent left no answer
    last_output = ""
    for attempt in range(1, SETUP_ATTEMPTS + 1):
        answer = setup_agent(repo, reason, attempt, last_output, blocker, start)
        if not (folder / "check.sh").exists():
            last_output = LAST_CHECK = "the setup agent left no check script"
            emit(phase="check", status="failed", attempt=attempt, reason=LAST_CHECK)
            continue
        ok, output = run_script(folder / "check.sh", root, CHECK_TIMEOUT_S)
        emit(phase="check", status="ok" if ok else "failed", attempt=attempt, output=output[-1500:])
        if not ok:
            last_output = LAST_CHECK = output[-500:]
            continue
        diff, files, truncated = capture_diff(repo)
        patch = {"summary": answer.get("summary") or "The setup agent prepared the repository for use.", "reason": "",
                 "files": files, "diff": diff, "truncated": truncated, "attempt": attempt}
        if diff.strip():
            emit(phase="patch", status="applied", **patch)
        next_text = read_setup_file(root, "NEXT.md")
        recipe = {"version": 1, "kind": "setup", "reason": reason, "summary": answer.get("summary"), "checkSummary": answer.get("check"),
                  "setup": read_setup_file(root, "setup.sh"), "check": read_setup_file(root, "check.sh"), "next": next_text,
                  "patch": patch if diff.strip() and not truncated else None, "savedAt": time.time()}
        if start:
            said = answer.get("blocker") if isinstance(answer.get("blocker"), dict) else None
            url = str((answer.get("start") or {}).get("url") or "") if isinstance(answer.get("start"), dict) else ""
            if not url and not answer and last_url and (folder / "start.sh").exists():
                # The agent died mid-way (a stop that caught itself, a timeout);
                # what it left may still start the way the last attempt said.
                emit(phase="start", status="retrying", attempt=attempt, url=last_url, reason="the setup agent gave no answer; trying the start script it left with the last known URL")
                url = last_url
            last_url = url or last_url
            if url and (folder / "start.sh").exists():
                if start_app(root, url, attempt):
                    recipe.update(start=read_setup_file(root, "start.sh"), startUrl=APP["url"])
                    emit(phase="recipe", status="captured", recipe=recipe)
                    go_live(APP["url"])
                    return True
                last_output = LAST_CHECK
                fallback = (recipe, answer, next_text, output)
                continue
            if said and said.get("kind") in HARD_BLOCKERS:
                # The agent found what the review missed: a blocker nothing
                # here can supply. Usable, with it written down, is the ending.
                blocker = {"kind": said["kind"], "what": str(said.get("what") or "")[:500]}
            else:
                last_output = LAST_CHECK = "the setup agent left no start script and URL, and named no blocker outside the sandbox"
                emit(phase="start", status="failed", attempt=attempt, reason=LAST_CHECK)
                fallback = (recipe, answer, next_text, output)
                continue
        if blocker:
            recipe["blocker"] = blocker
        emit(phase="recipe", status="captured", recipe=recipe)
        emit(phase="usable", summary=answer.get("summary"), next=next_text[:4000], check=answer.get("check"), output=output[-1500:], blocker=blocker)
        return True
    if fallback:
        # Installed and checked, but the application would not start: the
        # floor, with the last failure as the blocker.
        recipe, answer, next_text, output = fallback
        blocker = {"kind": "unknown", "what": ("The application did not start: " + str(LAST_CHECK or ""))[:500]}
        recipe["blocker"] = blocker
        emit(phase="recipe", status="captured", recipe=recipe)
        emit(phase="usable", summary=answer.get("summary"), next=next_text[:4000], check=answer.get("check"), output=output[-1500:], blocker=blocker)
        return True
    return False


# --- Recovery as one session.
#
# The other way out of a failed launch. Where the ladder above is four
# calls that each read a summary of the last — a repair agent that may not
# run what it wrote, a resolver with no tools at all and six hundred
# characters to say what it saw, then a setup agent starting from a cold
# page — this is one session that keeps everything it learned: what it
# read, what it edited, what it watched fail, and why its last idea did
# not work. It is chosen per run, so the two can be measured against each
# other on the same repositories rather than on two different days.
#
# What does NOT change is the seam this product is built on. The session
# may start whatever it likes to see what happens, and must stop it; the
# launch that counts is performed here. That is not distrust. The preload
# that watches an application's model calls can only be put into a process
# at the moment it is created, so whoever creates the process decides
# whether the run is watched at all. The setup rung above starts a shell
# script an agent wrote and therefore cannot watch anything — it says so
# and goes on unwatched. This rung is the fix for that: the session hands
# back a launcher and its arguments rather than a script, so what is
# started is a named program, and a named program can be instrumented.

RECOVERY_TOOLS = ["Read", "Grep", "Glob", "LS", "Edit", "MultiEdit", "Write", "Bash"]
RECOVERY_TIMEOUT_S = 25 * 60        # one turn of the session
RECOVERY_START_TIMEOUT_S = 10 * 60  # how long the services it named get to answer
SIDECARS = []            # the services the launch description named besides the entry
LAST_PROVIDED = []       # the NAMES of the values handed to the run; never their values
RAILPACK = None          # what railpack made of the repository, read once

# The launch description: what the session hands back instead of a start
# script. Every field is here so that the pipeline can start the thing
# itself — a launcher and its argv rather than a command line, because a
# command line has to be parsed by a shell and a shell is not a program
# that can be watched.
LAUNCH_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string", "description": "One line on what was wrong and what you did about it."},
        "verified": {"type": "string", "description": "What you actually checked, and what you saw."},
        "changed": {"type": "array", "items": {"type": "string"}, "description": "Repository files you edited, if any."},
        "check": {"type": "string", "description": "What .engelbart/check.sh proves."},
        "next": {"type": "string", "description": "One paragraph for the researcher: the first thing they run and why."},
        "services": {
            "type": "array",
            "description": "Every process the runner must start, in the order they must start. Exactly one is the entry.",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Short name, e.g. web or api."},
                    "launcher": {"type": "string", "description": "The program to execute: npm, node, next, vite, python3, or a path such as .engelbart/venv/bin/python. Not a shell."},
                    "args": {"type": "array", "items": {"type": "string"}, "description": "Its arguments, already split; no shell quoting, no && and no pipes."},
                    "cwd": {"type": "string", "description": "Directory to run it in, relative to the repository root. '.' for the root."},
                    "env": {"type": "object", "additionalProperties": {"type": "string"}, "description": "Extra environment this process needs and that is not already set, such as PORT or a host. Do not put supplied values here, and do not name them: everything supplied for this run is already in the environment of whatever the runner starts."},
                    "port": {"type": "integer", "description": "The loopback port it listens on."},
                    "path": {"type": "string", "description": "The path a person opens, e.g. / or /app."},
                    "isEntry": {"type": "boolean", "description": "True for the one service a person opens. Exactly one."},
                    "readyWithin": {"type": "integer", "description": "Seconds it needs before it answers."},
                },
                "required": ["name", "launcher", "args", "cwd", "port", "isEntry"],
            },
        },
        "nothingToServe": {
            "type": "boolean",
            "description": "True only when this repository has no application of its own to open: a library, a command line tool, a dataset, a notebook. Then services is empty, and what you installed and proved with check.sh is the whole answer. False for anything a person opens in a browser, even if you could not get it up.",
        },
        "blocker": {
            "type": "object",
            "description": "Only when something outside this sandbox genuinely prevents starting. Then there are no services.",
            "properties": {
                "kind": {"type": "string", "enum": list(HARD_BLOCKERS)},
                "what": {"type": "string", "description": "Exactly what is missing and how the person supplies it."},
            },
            "required": ["kind", "what"],
        },
    },
    "required": ["summary", "nothingToServe"],
}


def railpack_plan(root):
    """What railpack makes of the repository. Read once, best effort: it
    is a hint for the session, not a decision, and it costs a second."""
    global RAILPACK
    if RAILPACK is not None:
        return RAILPACK
    RAILPACK = ""
    try:
        proc = subprocess.run(["railpack", "plan", str(root)], capture_output=True, text=True, errors="replace", timeout=90)
        if proc.returncode == 0 and proc.stdout.strip():
            RAILPACK = proc.stdout.strip()[:4000]
    except Exception:  # noqa: BLE001
        RAILPACK = ""
    return RAILPACK


def open_ports(count=6, first=4100):
    """Ports nothing is listening on, for the session to choose from. A
    suggestion: it is free to name any port, and free_port() clears
    whatever is on the one it names before the service starts."""
    free = []
    for port in range(first, first + 400):
        if len(free) >= count:
            break
        try:
            import socket
            with socket.socket() as probe:
                probe.settimeout(0.2)
                if probe.connect_ex(("127.0.0.1", port)) != 0:
                    free.append(port)
        except Exception:  # noqa: BLE001
            break
    return free


def service_cwd(root, raw):
    """A service's directory, kept inside the repository. A launch
    description that points outside it is a launch description we do not
    perform."""
    root = Path(root).resolve()
    where = (root / str(raw or ".").lstrip("/")).resolve()
    if where != root and not where.is_relative_to(root):
        raise ValueError(f"the service directory {raw} is outside the repository")
    if not where.is_dir():
        raise ValueError(f"the service directory {raw} does not exist")
    return str(where)


def start_service(root, service, capabilities, gateway):
    """Start one named service, instrumented where that is possible.

    The whole point of the structured launch description is these four
    lines: because the session named a launcher and its arguments instead
    of writing a shell script, hc can be asked whether a Node preload
    reaches it, and the answer is yes for npm, next, vite and the rest of
    its list. The state is said out loud either way — an unwatched run has
    to be a stated fact rather than an empty trace."""
    name = str(service.get("name") or "app")
    launcher = str(service.get("launcher") or "").strip()
    args = [str(a) for a in (service.get("args") or [])]
    if not launcher or "/" in launcher and not Path(root, launcher).exists() and not Path(launcher).exists():
        raise ValueError(f"service {name} names no launcher this sandbox has")
    where = service_cwd(root, service.get("cwd"))
    port = int(service.get("port") or 0)
    if port <= 0:
        raise ValueError(f"service {name} names no port")
    env = dict(os.environ, PIP_NO_CACHE_DIR="1")
    env.update({str(k): str(v) for k, v in (service.get("env") or {}).items() if isinstance(k, str)})
    # Last, so they cannot be overwritten. A launch description that names
    # a supplied variable rather than setting it — "OPENAI_API_KEY":
    # "OPENAI_API_KEY", which is what asking for a reference invites —
    # would otherwise replace the value with its own name and the
    # application would start and not work.
    env.update(SAVED_ENV)
    argv = [launcher, *args]

    extra, state, detail = {}, "unavailable", "not requested for this run"
    if capabilities:
        try:
            from human_compact.trajectory import project_instrumentation as INST
            extra, state, detail = INST.resolve(capabilities, str(root), argv=argv, env=env)
        except Exception as exc:  # noqa: BLE001
            extra, state, detail = {}, "instrumentation_failed", f"the capability could not be resolved: {exc}"[:400]
    env.update(extra)
    emit(phase="capability", capability="modelCapture", stage="start." + name, state=state, detail=str(detail)[:400])
    report_capability(gateway, state, str(detail))

    free_port(port)
    log = Path(root) / SETUP_DIR / f"{name}.log"
    log.parent.mkdir(exist_ok=True)
    emit(phase="start", status="starting", service=name, port=port, launcher=launcher, args=args[:12], capture=state)
    handle = open(log, "w", encoding="utf-8")
    proc = subprocess.Popen(argv, cwd=where, env=env, stdout=handle, stderr=subprocess.STDOUT,
                            stdin=subprocess.DEVNULL, start_new_session=True)
    return {"name": name, "proc": proc, "log": log, "port": port,
            "path": str(service.get("path") or "/"), "url": f"http://127.0.0.1:{port}{str(service.get('path') or '/')}",
            "isEntry": bool(service.get("isEntry")), "capture": state}


def start_services(root, services):
    """Start everything the launch description named and wait for the
    entry to answer. The others are started first and not probed: an API
    may well answer 404 at its root and still be exactly right."""
    global APP, LAST_CHECK
    named = [s for s in services if isinstance(s, dict)]
    entry = next((s for s in named if s.get("isEntry")), named[0] if named else None)
    if not entry:
        LAST_CHECK = "the session named no service to start"
        emit(phase="start", status="failed", reason=LAST_CHECK)
        return False
    req = {"modelCapture": True} if os.environ.get("HC_NODE_PRELOAD") else request_capture(str(root))
    capabilities = set()
    if req:
        try:
            from human_compact.trajectory import project_instrumentation as INST
            capabilities = INST.wanted(req)
        except Exception:  # noqa: BLE001
            capabilities = set()

    started = []
    try:
        for service in [s for s in named if s is not entry] + [entry]:
            started.append(start_service(root, service, capabilities, (os.environ.get("ENGELBART_MODEL_GATEWAY_URL") or "").rstrip("/")))
    except (ValueError, OSError) as exc:
        LAST_CHECK = f"the launch description could not be performed: {exc}"
        emit(phase="start", status="failed", reason=LAST_CHECK)
        for s in started:
            stop_app(s["proc"])
        return False

    APP = next(s for s in started if s["isEntry"] or s is started[-1])
    SIDECARS[:] = [s for s in started if s is not APP]
    wait = max(int(entry.get("readyWithin") or 0), 0) or RECOVERY_START_TIMEOUT_S
    # A reserve of nothing: this is the last thing a successful run does,
    # and the recipe is written from what is already in hand.
    deadline = time.time() + bounded(min(wait if wait > 60 else RECOVERY_START_TIMEOUT_S, RECOVERY_START_TIMEOUT_S), reserve=15)
    while time.time() < deadline:
        dead = next((s for s in started if s["proc"].poll() is not None), None)
        if dead:
            tail = log_tail(dead["log"])
            LAST_CHECK = f"{dead['name']} exited with {dead['proc'].returncode} before the application answered: " + tail[-300:]
            emit(phase="start", status="failed", service=dead["name"], reason=LAST_CHECK[:600], output=tail)
            for s in started:
                stop_app(s["proc"])
            APP, SIDECARS[:] = None, []
            return False
        if answers(APP["url"]):
            break
        time.sleep(START_POLL_S)
    else:
        tail = log_tail(APP["log"])
        LAST_CHECK = f"the application did not answer at {APP['url']} within {RECOVERY_START_TIMEOUT_S // 60} minutes: " + tail[-300:]
        emit(phase="start", status="failed", reason=LAST_CHECK[:600], output=tail)
        for s in started:
            stop_app(s["proc"])
        APP, SIDECARS[:] = None, []
        return False

    # Answering is not working. The page is opened as a person would open
    # it, because an application that crashed on an import still serves a
    # 200 with the crash written on it.
    report = visit(APP["url"])
    # Answering on a port is not the same as working, and a page nobody
    # managed to read is not the same as a page that was read and was
    # fine. The run still goes live — it is up, and a person can use it —
    # but nothing here may call it verified, and the recipe it saves says
    # so rather than promising the next run that this was checked.
    emit_visit(report)
    time.sleep(2)
    tail = log_tail(APP["log"])
    text = report.get("text") or ""
    hit = next((m for m in PAGE_ERROR_MARKERS if m in text), None) or next((m for m in APP_ERROR_MARKERS if m in tail), None)
    dead = next((s for s in started if s["proc"].poll() is not None), None)
    if dead or hit:
        LAST_CHECK = (f"{dead['name']} answered once and then exited with {dead['proc'].returncode}: " + log_tail(dead["log"])[-300:]) if dead \
            else f"the application answers at {APP['url']}, but shows an error ({hit})"
        emit(phase="start", status="failed", reason=str(LAST_CHECK)[:600],
             output=f"Page text:\n{text[:2500]}\n\nServer output:\n{tail}")
        for s in started:
            stop_app(s["proc"])
        APP, SIDECARS[:] = None, []
        return False
    emit(phase="start", status="answering", url=APP["url"], services=[s["name"] for s in started],
         capture=[{"service": s["name"], "state": s["capture"]} for s in started])
    return True


def go_live_services():
    """Announce every service the launch description brought up, in the
    shape the run loop's ready event has: the entry first, each with the
    loopback port the proxy will put a public one in front of."""
    live = [APP, *SIDECARS]
    services = [{"id": s["name"], "host": "127.0.0.1", "port": s["port"], "url": s["url"],
                 "isEntry": bool(s is APP), "embeddable": True} for s in live]
    emit(phase="ready", url=APP["url"], host="127.0.0.1", port=APP["port"], pid=APP["proc"].pid, services=services)


# --- What the session is told.
#
# The task is fixed; the state under it is this run's. Nothing in the
# state is a value: the environment is named, never quoted, because the
# session has a shell and a shell's history is not somewhere a secret
# should be.

RECOVERY_TASK = """Get this repository working as its authors intended inside the existing
sandbox, so the user can try it.

The context below describes the repository, previous setup attempts,
current processes, dependency installation, and available environment
variables. Continue from that state and preserve successful work.

Read the documentation and configuration needed to understand startup.
Execute commands, inspect failures, edit files, configure services,
and test your changes until the application works.

Work efficiently: take the shortest reliable path, reuse completed
installs and checks, and investigate what is needed for the next
decision. Prefer focused verification over broad, unrelated testing.

A dependency install may already be running. Inspect the repository
while it runs. Before changing dependency files, switching runtimes,
or starting another install in the same directory, use the provided
install controls to wait for it or cancel it.

Use supplied environment variables without exposing their values.
Preserve the application's intended functionality. Do not replace
required behavior with mocks or dummy credentials to make startup
appear successful. If a required credential, service, dataset, or
device is unavailable, identify the specific blocker.

You may start application processes to test your work. Verify actual
usability: for a web app, open the page, inspect errors, and exercise
a representative interaction; for a CLI or library, run a documented
example or relevant check.

The runner owns the final application launch so it can apply
instrumentation, supervise processes, and expose the preview.
Return a repeatable launch description using the supplied schema:
working directories, executables and arguments, required services,
ports, environment-variable references, and any preparation needed.
Stop temporary application processes you started before handing
control back to the runner.

If the runner reports a launch or verification failure, continue
diagnosing and fixing it in this same session.

Resolve ordinary setup failures yourself. Provide brief, factual
progress updates. Finish with what you verified, what you changed,
the launch description, and any remaining limitations or blockers."""


def recovery_context(repo, reason, blocker=None):
    """The sandbox as it actually is, under the task."""
    lines = ["", "--- The sandbox ---", "",
             f"The repository is at {repo}. This is a disposable Linux sandbox: Debian, Python 3.11 at "
             "/usr/local/bin/python3, uv for other Python versions, Node 22 with npm, pnpm and bun. "
             "You may install packages and download small, documented assets. Do not use sudo, and write only "
             f"inside the repository. Nothing here reaches GitHub: this copy is thrown away and every change you make is shown to the person as a diff.",
             "", f"The automated pipeline already tried to start it and could not: {reason}"]
    if blocker:
        lines.append(f"A review read that failure as {blocker.get('kind', 'unknown')}: {blocker.get('what', '')}. "
                     "That is a reading, not a verdict; if you can start the application, do.")
    if PERSON_HINT:
        lines.append(f"The person's hint about what to run: {PERSON_HINT}")
    if BRIEF:
        lines.append(f"What is known about the repository (the whole brief is at {SETUP_DIR}/BRIEF.md): {brief_hint()}")
    tried_lines = tried()
    if tried_lines:
        lines += ["", "--- What has been tried ---", "", *tried_lines]

    state = install_state()
    if state:
        lines += ["", "--- Dependency installation ---", "", state]

    plan = railpack_plan(repo)
    if plan:
        lines += ["", "--- What railpack makes of it ---", "",
                  "A build plan inferred from the repository's files. It is a starting point, not an instruction; "
                  "the pipeline already tried something like it.", "", plan]

    env_lines = []
    if LAST_PROVIDED:
        given = agent_values()
        held = sorted(k for k in SAVED_ENV if k not in given)
        mine = [k for k in LAST_PROVIDED if k not in held]
        if mine:
            env_lines.append("Values supplied for this run. They are in your own environment and in the environment of "
                             "anything the runner starts, so a build or a test you run here faces what the application "
                             "will. Use them by name; never print one, and never write one into a file: " + ", ".join(mine))
        if held:
            # Saying so rather than letting it be discovered: a session
            # that tests with this shell's value and reports the
            # application working would be reporting on a configuration
            # the application never runs under.
            env_lines.append("Also supplied, but under names this sandbox uses for its own tools: " + ", ".join(held)
                             + ". Your own shell deliberately holds the runner's value for these, not the repository's.")
        env_lines.append(f"To run anything under the repository's whole environment — a build, a test, a one-off check — "
                         f"put `bash {SETUP_DIR}/with-app-env.sh` in front of it: "
                         f"`bash {SETUP_DIR}/with-app-env.sh npm run build`. The services the runner finally starts get all "
                         "of it without the wrapper.")
    if LAST_MISSING:
        env_lines.append("Named by the repository but not available here, and not obtainable: " + ", ".join(LAST_MISSING) + ". "
                         "If one of these is genuinely required to start, that is a blocker — say so rather than inventing a value for it.")
    if env_lines:
        lines += ["", "--- Environment ---", "", *env_lines]

    ports = open_ports()
    if ports:
        lines += ["", "--- Ports ---", "",
                  "Nothing is listening on " + ", ".join(str(p) for p in ports) + ". The runner clears whatever holds a "
                  "port before starting the service that names it, so pick one and say it in the launch description."]

    lines += ["", "--- The launch description ---", "",
              "Answer with the supplied schema. `services` is what the runner starts, in order, exactly one with "
              "isEntry true. Each names a `launcher` (a program: npm, node, next, vite, python3, or a path such as "
              f"{SETUP_DIR}/venv/bin/python) and `args` already split — not a shell line, and not a script: the runner "
              "executes the program directly so that it can be instrumented, and a bash wrapper cannot be. If starting "
              "needs preparation that must happen first (a build, a migration, a seed), do it now rather than describing "
              "it, and leave it repeatable in " + SETUP_DIR + "/setup.sh.",
              "",
              f"Also leave {SETUP_DIR}/setup.sh (idempotent, runs from a fresh clone), {SETUP_DIR}/check.sh (exits 0 only "
              f"when the setup works, under two minutes) and {SETUP_DIR}/NEXT.md (for the researcher: what this repository "
              "is, and the exact commands to run next). The runner runs check.sh before it starts anything."]
    return "\n".join(lines)


def recovery_retry(outcome, round_number):
    """What the session is told when the launch it described did not
    work. The session still has everything it learned; this is the one
    thing it could not see, because the runner did the starting."""
    return "\n".join([
        f"The runner performed your launch description and it did not come up (attempt {round_number}).",
        "",
        str(outcome or "the application did not answer")[:3000],
        "",
        f"The service logs are at {SETUP_DIR}/<name>.log. Diagnose and fix this, then answer with a corrected launch "
        "description in the same schema. Everything you installed and edited is still in place — build on it. "
        "You may start processes again to test, and must stop them before you answer.",
    ])


def recover(repo, reason, blocker=None, blocked=False):
    """One session, from the failed launch to a running application.

    Returns True when the application is up (and announced) or the
    repository is usable with a blocker written down. The session is
    resumed rather than restarted between rounds, so the third attempt
    still knows what the first one read."""
    global LAST_CHECK
    root = str(Path(repo).resolve())
    folder = Path(root) / SETUP_DIR
    folder.mkdir(exist_ok=True)
    (folder / ".gitignore").write_text(SETUP_IGNORE)
    write_brief_files(root)
    write_app_env(root)
    if PATCH and PATCH.get("diff"):
        (folder / "REPAIR.diff").write_text(PATCH["diff"], encoding="utf-8")

    session = str(uuid.uuid4())
    spent = 0.0
    prompt = RECOVERY_TASK + "\n" + recovery_context(repo, reason, blocker)
    answer, last_output, checked, stopped = {}, "", None, "rounds"
    # Held outside the loop, because the ending below is written from
    # whatever the last round left — including a round that was cut off
    # before it could answer, and a loop that never got to run one.
    diff, files, truncated, patch = "", [], False, None
    for round_number in range(1, RECOVERY_ROUNDS + 1):
        left = RECOVERY_BUDGET - spent
        if left <= 0.25:
            stopped = "budget"
            emit(phase="recovery", status="exhausted", round=round_number, spent=round(spent, 4))
            break
        # How long a round may actually take, which is the smaller of its
        # own ceiling and what is left of the run. Stopping here rather
        # than starting a round the deadline will cut in half is the whole
        # reason the wrapper is told when the deadline is: a round that is
        # killed leaves no check, no diff and no recipe, and a repository
        # someone could have used comes back as a failure.
        span = bounded(RECOVERY_TIMEOUT_S)
        if span < MIN_ROUND_S:
            stopped = "time"
            emit(phase="recovery", status="out_of_time", round=round_number,
                 seconds=max(0, int(time_left() or 0)), reserve=SAVE_RESERVE_S)
            break
        emit(phase="recovery", status="starting", round=round_number, model=RECOVERY_MODEL,
             effort=RECOVERY_EFFORT, fast=RECOVERY_FAST, budget=round(left, 4), seconds=span, session=session[:8])
        answer, info = agent("recovery", prompt, RECOVERY_MODEL, left, tools=RECOVERY_TOOLS, max_turns=250,
                             timeout=span, cwd=root, schema=LAUNCH_SCHEMA,
                             session=session, resume=round_number > 1, effort=RECOVERY_EFFORT, fast=RECOVERY_FAST)
        spent += info.get("cost") or 0
        # Before anything is decided about the answer, because a session
        # that ran out of time or died mid-turn still edited the files it
        # edited, and those edits are the expensive part. Reading the
        # working tree costs a second, which is what the reserve is for.
        diff, files, truncated = capture_diff(repo)
        patch = {"summary": answer.get("summary") or "The recovery session prepared the repository.", "reason": "",
                 "files": files, "diff": diff, "truncated": truncated, "attempt": round_number}
        if info["error"] and not answer:
            if diff.strip():
                emit(phase="patch", status="applied", **{**patch, "interrupted": True,
                     "summary": "What the recovery session had changed when it was cut off."})
            emit(phase="recovery", status="failed", round=round_number, reason="the session " + info["error"],
                 changed=len(files), **cost_fields(info))
            break
        emit(phase="recovery", status="answered", round=round_number, summary=answer.get("summary"),
             verified=answer.get("verified"), services=len(answer.get("services") or []), **cost_fields(info))
        if diff.strip():
            emit(phase="patch", status="applied", **patch)

        checked = None
        if (folder / "check.sh").exists():
            ok, output = run_script(folder / "check.sh", root, CHECK_TIMEOUT_S)
            emit(phase="check", status="ok" if ok else "failed", round=round_number, output=output[-1500:])
            checked = ok
            if not ok:
                last_output = "The check script you left did not pass:\n" + output[-2500:]
                prompt = recovery_retry(last_output, round_number)
                continue

        services = [s for s in (answer.get("services") or []) if isinstance(s, dict)]
        said = answer.get("blocker") if isinstance(answer.get("blocker"), dict) else None
        if not services:
            if not checked:
                # Every ending below says the repository is usable, and
                # nothing was started to show that it is. The check is the
                # only evidence there would be, so its absence is a round
                # that did not finish rather than a run that is done. The
                # setup rung has always worked this way.
                last_output = ("You returned no services, so the only evidence this repository is usable is the check you "
                               f"left, and there is no {SETUP_DIR}/check.sh. Write one that exits 0 only when the setup "
                               "genuinely works, run it yourself until it passes, and answer again.")
                prompt = recovery_retry(last_output, round_number)
                continue
            if answer.get("nothingToServe") is True and not app_expected(blocked):
                # A library, a tool, a dataset. There was never an
                # application to start, so installed with a check that
                # passes is the whole ending and not a consolation: the
                # session read the repository and says so, the brief
                # agrees, and check.sh proved it. Without this the only
                # ending such a repository could reach was running out of
                # rounds and being reported as an application that did
                # not start.
                recipe = recovery_recipe(root, answer, None, patch, diff, truncated, reason)
                emit(phase="recipe", status="captured", recipe=recipe)
                emit(phase="usable", summary=answer.get("summary"), next=read_setup_file(root, "NEXT.md")[:4000],
                     check=answer.get("check"))
                return True
            if said and said.get("kind") in HARD_BLOCKERS:
                # Nothing in this sandbox can supply what it says is
                # missing, so installed-and-checked with the blocker
                # written down is the ending, exactly as it is for the
                # setup rung. Whether the brief expected an application
                # changes nothing here: the session looked at the
                # repository, and the brief only read it.
                recipe = recovery_recipe(root, answer, None, patch, diff, truncated, reason)
                recipe["blocker"] = {"kind": said["kind"], "what": str(said.get("what") or "")[:500]}
                emit(phase="recipe", status="captured", recipe=recipe)
                emit(phase="usable", summary=answer.get("summary"), next=read_setup_file(root, "NEXT.md")[:4000],
                     check=answer.get("check"), blocker=recipe["blocker"])
                return True
            last_output = ("You returned no services, no blocker outside this sandbox's reach, and not a repository with "
                           "nothing to serve. One of the three has to be true. Either describe how to start the application, "
                           "or name what is genuinely missing as one of: " + ", ".join(HARD_BLOCKERS) + ", or say plainly "
                           "that this repository has no application of its own and leave a check that proves what it does have.")
            prompt = recovery_retry(last_output, round_number)
            continue

        if start_services(root, services):
            recipe = recovery_recipe(root, answer, services, patch, diff, truncated, reason,
                                     complete=bool(LAST_VERIFIED))
            emit(phase="recipe", status="captured", recipe=recipe)
            go_live_services()
            return True
        prompt = recovery_retry(LAST_CHECK, round_number)

    # Out of rounds, budget or time. Installed with a check that passed is
    # still worth having; a check that failed, or none at all, is not —
    # calling that usable puts a run in front of a person as ready when
    # nothing about it was ever proved.
    if answer and checked:
        why = {"time": "The run reached its deadline before the application started",
               "budget": "The recovery session spent its budget before the application started"}.get(
                   stopped, "The application did not start")
        blocker = {"kind": "unknown", "what": (why + ": " + str(LAST_CHECK or ""))[:500]}
        # With the patch, not without it. Everything this session changed
        # is in there, and a recipe that carries the scripts but not the
        # edits replays into a fresh clone and rebuilds nothing: the
        # setup runs against the code as it was cloned, which is the code
        # that did not work.
        recipe = recovery_recipe(root, answer, None, patch, diff, truncated, reason, complete=False)
        recipe["blocker"] = blocker
        emit(phase="recipe", status="captured", recipe=recipe)
        emit(phase="usable", summary=answer.get("summary"), next=read_setup_file(root, "NEXT.md")[:4000],
             check=answer.get("check"), blocker=blocker)
        return True
    return False


def recovery_recipe(root, answer, services, patch, diff, truncated, reason, complete=True):
    """What is saved so the next run of this commit skips all of this.

    The same shape the setup rung saves, plus the launch description,
    because that is the thing worth having: a replay can start the
    services directly and be watched, where replaying a shell script
    never could."""
    recipe = {"version": 1, "kind": "setup", "reason": reason, "summary": answer.get("summary"),
              "checkSummary": answer.get("check"), "setup": read_setup_file(root, "setup.sh"),
              "check": read_setup_file(root, "check.sh"), "next": read_setup_file(root, "NEXT.md"),
              "patch": patch if patch and diff.strip() and not truncated else None,
              "recovery": {"verified": answer.get("verified"), "changed": answer.get("changed") or []},
              # Whether this is a finished answer: the pipeline performed
              # the launch and the application answered, or there was
              # never an application to start, or nothing in this sandbox
              # could supply what is missing. False is setup work saved
              # because the session ran out of rounds, budget or time —
              # worth replaying as a head start, never as a result. The
              # session's own "verified" above is its account of what it
              # tried; this is the runner's.
              "complete": complete,
              "savedAt": time.time()}
    if services:
        recipe["services"] = services
        entry = next((s for s in services if s.get("isEntry")), services[0])
        recipe["startUrl"] = f"http://127.0.0.1:{entry.get('port')}{str(entry.get('path') or '/')}"
    return recipe


# --- The dependency install that started before any of this.
#
# The runner starts it the moment the clone lands (sandbox/prestart.py,
# run from lib/runtime/e2b.ts before the gateways are even up), so by the
# time this process exists there is either an install already running or a
# recorded reason there is not. Nothing here starts one on its own: two
# programs that can both start an install is the thing the lock exists to
# prevent, and the cheapest way to hold a lock correctly is to have one
# writer.
#
# What this file does is join it. The overlap is with reading — the brief,
# the discovery, the planner — and it ends before anything else installs,
# which is why there is no protocol for two installers sharing a
# directory. There are never two.

import prestart as INSTALL

INSTALL_JOINED = False


def install_state():
    """What to tell the recovery session about the head start, including
    the controls it should use rather than a second install of its own."""
    now = INSTALL.state(REPO) if REPO else {"status": "none"}
    status = now.get("status")
    if status == "none":
        return ""
    where = f"{SETUP_DIR}/"
    command = " ".join(now.get("command") or [])
    controls = (f"Ask after it: `bash {where}install-status.sh` (one JSON line). "
                f"Wait for it: `bash {where}install-wait.sh` (blocks, exits with its status). "
                f"Stop it: `bash {where}install-cancel.sh` (stops it and releases the lock).")
    if status == "running":
        return "\n".join([
            f"`{command}` was started from {now.get('lock')} the moment this repository was cloned, and is STILL RUNNING "
            f"as pid {now.get('pid')} ({now.get('seconds')}s so far). Its output is at {now.get('log')}.",
            controls,
            f"While it runs, do not start another install in that directory and do not edit the dependency manifest or "
            f"lockfile. A second install cannot start while it holds {where}install.lock, so it would fail rather than "
            f"race you. If you need to change either, run install-cancel.sh first; if you need its result before you "
            f"decide anything, run install-wait.sh. Read the repository in the meantime.",
        ])
    said = {"done": "finished successfully", "failed": f"FAILED with exit {now.get('exitCode')}",
            "cancelled": "was cancelled", "lost": "stopped without recording a status",
            "timeout": "is still going"}.get(status, status)
    after = {"done": "Its dependencies are installed; do not install them again unless you change what they are.",
             "failed": "Read the log before deciding anything — that failure is likely the thing to fix.",
             "cancelled": "Nothing holds the lock; install what you need yourself.",
             "lost": "Nothing holds the lock. Treat the install as not done."}.get(status, "")
    return "\n".join([
        f"`{command}` was started from {now.get('lock')} when this repository was cloned and {said} after "
        f"{now.get('seconds')}s. Its output is at {now.get('log')}.",
        after, controls,
    ])


def join_install(where="the pipeline"):
    """Wait for the head start before anything else installs.

    Called before every path that runs the plan. The overlap this exists
    to allow is with analysis; the moment something is going to write to
    node_modules or a virtualenv, one installer has to be the only one."""
    global INSTALL_JOINED
    if INSTALL_JOINED or not REPO:
        return
    now = INSTALL.state(REPO)
    if now.get("status") == "none":
        INSTALL_JOINED = True
        return
    INSTALL_JOINED = True
    if now.get("status") == "running":
        emit(phase="install", status="waiting", pid=now.get("pid"),
             reason=f"{where} is about to install; waiting for the head start that began with the clone")
    began = time.time()
    done = INSTALL.wait(REPO)
    waited = round(time.time() - began, 1)
    if done.get("status") == "timeout":
        # Waiting has a limit; installing beside it does not have a safe
        # one. The pipeline is about to write to the same node_modules or
        # the same virtualenv, so the head start stops here rather than
        # becoming a second writer with the lock still in its hand.
        done = INSTALL.cancel(REPO) or done
        emit(phase="install", status="cancelled", reason=f"it was still running after {INSTALL.WAIT_TIMEOUT_S // 60} minutes and {where} needs the directory",
             command=" ".join(done.get("command") or []), seconds=done.get("seconds"), waited=waited)
        return
    emit(phase="install", status=done.get("status"), command=" ".join(done.get("command") or []),
         lock=done.get("lock"), exitCode=done.get("exitCode"), seconds=done.get("seconds"), waited=waited,
         output=log_tail(done.get("log"), 1200) if done.get("log") else "")


def stay_alive():
    """Stay as the sandbox's process while the person uses it, and watch
    the application when the setup rung started one."""
    while True:
        time.sleep(2 if APP else 30)
        if APP and APP["proc"].poll() is not None:
            emit(phase="exited", status="exited", reason=f"the application stopped (exit {APP['proc'].returncode}): " + log_tail(APP["log"], 600))
            sys.exit(1)
        # A service beside the entry going down is not the end of the run —
        # the page may still answer — but it is never nothing, and a trace
        # with an API missing from the middle of it should say why.
        for side in [s for s in SIDECARS if s["proc"].poll() is not None and not s.get("reported")]:
            side["reported"] = True
            emit(phase="exited", status="service", service=side["name"],
                 reason=f"{side['name']} stopped (exit {side['proc'].returncode}): " + log_tail(side["log"], 400))


def supervise(PR, run_id):
    """Stay alive as the supervisor while the application runs."""
    logs = LOGS.get(run_id) or StageLog()
    while True:
        time.sleep(2)
        state = PR.view(run_id)
        logs.update(state.get("stages", []))
        if state.get("status") != "running":
            emit(phase="exited", status=state.get("status"), reason=state.get("reason"))
            sys.exit(1)


if __name__ == "__main__":
    main()
