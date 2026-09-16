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
import shutil
import subprocess
import sys
import time
import uuid
from pathlib import Path
from urllib.parse import urlsplit

TERMINAL_ORDER = ("done", "needs_input", "error")
TERMINAL_RUN = ("failed", "needs_input", "unsupported")


def emit(**event):
    sys.stdout.write(json.dumps(event, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def fail(message, step=None, **detail):
    emit(phase="error", step=step, message=str(message or "The pipeline stopped without a reason")[:2000], **detail)
    sys.exit(1)


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
            for stream, length in (("stdout", out_len), ("stderr", err_len)):
                text = stage.get(stream) or ""
                if len(text) > length:
                    emit(phase="log", stage=stage.get("stage"), stream=stream, text=text[length:])
            self.seen[key] = (len(stage.get("stdout") or ""), len(stage.get("stderr") or ""), True)


def main():
    if len(sys.argv) != 2:
        fail("usage: hc_run.py <repository-directory>")
    repo = sys.argv[1]
    os.environ.setdefault("HC_USE_API_KEY", "1")
    os.environ.setdefault("HC_CHAT_PROVIDER", "claude")
    os.environ.setdefault("HUMAN_COMPACT_HOME", str(Path.home() / ".human-compact"))
    if not os.environ.get("ANTHROPIC_API_KEY"):
        fail("ANTHROPIC_API_KEY is not set in the sandbox")

    from human_compact.trajectory import (project_analysis as PA, project_components as PC,
                                          project_environment as PE, project_order as PO, project_run as PR,
                                          project_supabase as PS)

    # A saved recipe from a previous successful run skips straight to starting.
    recipe = load_recipe()
    if recipe:
        run_id, cwd = replay(PR, repo, recipe)
        emit(phase="recipe", status="replaying", kind=recipe.get("kind"), saved=recipe.get("savedAt"))
        outcome = run(PR, PE, PS, run_id, cwd, repo)
        if outcome == "ready":
            supervise(PR, run_id)
        emit(phase="recipe", status="failed", reason=outcome)
        stop_leftovers(PR, run_id)

    run_id, cwd = pipeline(PA, PC, PO, repo)
    outcome = run(PR, PE, PS, run_id, cwd, repo)
    # Last resort: let a tightly scoped agent edit this throwaway copy of the
    # repository, then run the pipeline again. Every edit is reported as a diff.
    attempt = 0
    while outcome != "ready" and attempt < MAX_REPAIRS:
        attempt += 1
        failure = failure_of(PR, run_id)
        stop_leftovers(PR, run_id)
        if not repair(repo, failure, attempt):
            break
        reset_local_supabase(PS, cwd)
        run_id, cwd = pipeline(PA, PC, PO, repo)
        outcome = run(PR, PE, PS, run_id, cwd, repo)
    if outcome != "ready":
        state = PR.view(run_id)
        fail(state.get("reason"), step="run", status=state.get("status"), stage=state.get("stage"))
    supervise(PR, run_id)


def load_recipe():
    path = os.environ.get("HC_RECIPE_FILE")
    if not path:
        return None
    try:
        recipe = json.loads(Path(path).read_text())
        if isinstance(recipe, dict) and recipe.get("version") == 1 and (recipe.get("orderPlan") or recipe.get("plan")):
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


def stop_leftovers(PR, run_id):
    try:
        PR.reset(run_id)
    except Exception:  # noqa: BLE001
        pass


def pipeline(PA, PC, PO, repo):
    """Discover, order or analyze; return the run record id and its directory."""
    emit(phase="discover", status="running")
    discovery = PC.discover(repo)
    components = discovery["components"]
    emit(phase="discover", status="done", root=discovery["root"],
         components=[{"id": c["id"], "types": c["types"]} for c in components], warnings=discovery.get("warnings", []))
    if not components:
        fail("No runnable component was found in the repository", step="discover")

    if len(components) > 1:
        order_id = PO.start(discovery["root"])["id"]
        last = None
        while True:
            view = PO.view(order_id)
            key = (view.get("status"), view.get("progress"))
            if key != last:
                emit(phase="order", status=view.get("status"), progress=view.get("progress"),
                     agent=agent_summary(view.get("agentTrace")))
                last = key
            if view.get("status") in TERMINAL_ORDER:
                break
            time.sleep(1)
        if view.get("status") != "done":
            fail(view.get("reason") or view.get("error") or "Run-order assessment did not produce a plan",
                 step="order", status=view.get("status"))
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


def hand_over(PE, cwd, values):
    """Give the pipeline the saved values it can use. It only accepts names
    its scan found; the rest come back as ignored."""
    try:
        known = {v["name"] for v in PE.scan(cwd).get("variables", [])}
        usable = {k: v for k, v in values.items() if k in known}
        if usable:
            PE.save(cwd, usable)
        return usable, sorted(set(values) - known)
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


def environment(PE, cwd, provided, ignored, local, local_error=None):
    """Report every variable the app reads and its state. What is still
    missing is skipped, since the sandbox cannot ask anyone."""
    skips = {}
    try:
        report = PE.scan(cwd)
        variables = []
        for v in report.get("variables", []):
            name = v["name"]
            saved = v.get("source") == SAVED_SOURCE
            status = "local" if name in local else "provided" if saved else v.get("status")
            variables.append({"name": name, "status": status, "requirement": v.get("requirement"), "group": v.get("group"),
                              "source": "local Supabase" if name in local else "saved" if saved else v.get("source"),
                              "public": bool(v.get("public"))})
        missing = [v["name"] for v in variables if v["status"] == "missing"]
        if missing:
            skips[str(Path(cwd).resolve())] = missing
        emit(phase="environment", variables=variables, skipped=missing, provided=sorted(provided),
             ignored=ignored, local=sorted(local), localError=local_error)
    except Exception as exc:  # noqa: BLE001
        emit(phase="environment", warning=str(exc)[:300])
    return skips


def run(PR, PE, PS, run_id, cwd, root):
    """Start the record and follow it until the app is ready ("ready") or it
    gives up (the reason). On ready the recipe is emitted for saving."""
    global LAST_LOCAL_ERROR, LAST_MISSING
    provided, ignored = hand_over(PE, cwd, load_env())
    local, local_error = local_supabase(PS, PE, cwd, root)
    skips = environment(PE, cwd, provided, ignored, local, local_error)
    LAST_LOCAL_ERROR = local_error
    LAST_MISSING = sorted(name for names in skips.values() for name in names)

    PR.start(run_id, environment_skips=skips)
    logs = LOGS[run_id] = StageLog()
    last = None
    approved = set()
    while True:
        state = PR.view(run_id)
        logs.update(state.get("stages", []))
        attempts = state.get("attempts", [])
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
    ]
    if failure.get("stage"):
        lines += ["", f"Stage that failed: {failure['stage']}" + (f" ({failure['command']})" if failure.get("command") else "")]
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
    emit(phase="patch", status="starting", attempt=attempt, reason=str(failure.get("reason"))[:300])
    env = {k: v for k, v in os.environ.items() if k not in ("HC_RECIPE_FILE", "HC_ENV_FILE")}
    answer = {}
    try:
        proc = subprocess.run(
            ["claude", "-p", repair_prompt(repo, failure, attempt), "--output-format", "json",
             "--allowedTools", *REPAIR_TOOLS, "--max-turns", "80"],
            cwd=repo, env=env, capture_output=True, text=True, timeout=REPAIR_TIMEOUT_S)
        answer = parse_answer(proc.stdout)
        if proc.returncode != 0 and not answer:
            emit(phase="patch", status="failed", attempt=attempt, reason=(proc.stderr or proc.stdout).strip()[-300:])
    except subprocess.TimeoutExpired:
        emit(phase="patch", status="failed", attempt=attempt, reason="the repair agent ran out of time")
    except Exception as exc:  # noqa: BLE001
        emit(phase="patch", status="failed", attempt=attempt, reason=str(exc)[:300])
    diff, files, truncated = capture_diff(repo)
    if not diff.strip():
        emit(phase="patch", status="none", attempt=attempt, summary=answer.get("summary"), reason=answer.get("reason"))
        return None
    PATCH = {"summary": answer.get("summary") or "The repair agent edited the repository.", "reason": answer.get("reason") or "",
             "files": files, "diff": diff, "truncated": truncated, "attempt": attempt}
    emit(phase="patch", status="applied", **PATCH)
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
    subprocess.run(["git", "add", "-A", "-N", "."], cwd=repo, capture_output=True)
    files = subprocess.run(["git", "diff", "--name-only"], cwd=repo, capture_output=True, text=True).stdout.split()
    diff = subprocess.run(["git", "diff", "--no-color", "--binary"], cwd=repo, capture_output=True, text=True, errors="replace").stdout
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
        if last and last.get("services") and last.get("status") == "running":
            plan = relativize({"status": "plan", **{k: last[k] for k in PLAN_KEYS if k in last}}, root)
            return {"version": 1, "kind": "native", "cwd": cwd, "orderPlan": plan, "savedAt": time.time()}
        if record.get("orderPlan"):
            return {"version": 1, "kind": "native", "cwd": cwd, "orderPlan": relativize({**record["orderPlan"], "status": "plan"}, root), "savedAt": time.time()}
        if record.get("plan"):
            return {"version": 1, "kind": "railpack", "cwd": cwd, "plan": record["plan"], "savedAt": time.time()}
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
