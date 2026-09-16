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
                                          project_environment as PE, project_order as PO, project_run as PR)

    # A saved recipe from a previous successful run skips straight to starting.
    recipe = load_recipe()
    if recipe:
        run_id, cwd = replay(PR, repo, recipe)
        emit(phase="recipe", status="replaying", kind=recipe.get("kind"), saved=recipe.get("savedAt"))
        outcome = run(PR, PE, run_id, cwd)
        if outcome == "ready":
            supervise(PR, run_id)
        emit(phase="recipe", status="failed", reason=outcome)
        stop_leftovers(PR, run_id)

    run_id, cwd = pipeline(PA, PC, PO, repo)
    outcome = run(PR, PE, run_id, cwd)
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
    run_id = uuid.uuid4().hex
    PR.write(run_id, {"cwd": cwd, "repositoryRoot": root, "plan": recipe.get("plan") or {}, "orderPlan": order_plan})
    return run_id, cwd


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


def environment(PE, cwd, values):
    """Give the pipeline the saved values it can use, then report every
    variable the app reads and its state. The pipeline only accepts names
    its scan found; the rest are reported as ignored. What remains missing
    is skipped, since the sandbox cannot ask anyone."""
    skips = {}
    try:
        known = {v["name"] for v in PE.scan(cwd).get("variables", [])}
        usable = {k: v for k, v in values.items() if k in known}
        if usable:
            PE.save(cwd, usable)
        report = PE.scan(cwd)
        variables = []
        for v in report.get("variables", []):
            provided = v.get("source") == SAVED_SOURCE
            variables.append({"name": v["name"], "status": "provided" if provided else v.get("status"),
                              "requirement": v.get("requirement"), "group": v.get("group"),
                              "source": "saved" if provided else v.get("source"), "public": bool(v.get("public"))})
        missing = [v["name"] for v in variables if v["status"] == "missing"]
        if missing:
            skips[str(Path(cwd).resolve())] = missing
        emit(phase="environment", variables=variables, skipped=missing,
             provided=sorted(usable), ignored=sorted(set(values) - known))
    except Exception as exc:  # noqa: BLE001
        emit(phase="environment", warning=str(exc)[:300])
    return skips


def run(PR, PE, run_id, cwd):
    """Start the record and follow it until the app is ready ("ready") or it
    gives up (the reason). On ready the recipe is emitted for saving."""
    skips = environment(PE, cwd, load_env())

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
