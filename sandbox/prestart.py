#!/usr/bin/env python3
"""The dependency install that starts the moment the clone lands.

A repository whose root holds exactly one lockfile has already said how
its dependencies are installed. There is no reason for that to wait for
an agent to finish reading the README, or for a model gateway to come
up, so it does not: the runner starts this as soon as the clone is on
disk, and everything after it — the brief, the discovery, the planner —
overlaps an install that is already running.

One lockfile, and only one. Two is a question about which of them the
repository means, and a question belongs to the pipeline that can read
the repository, not to a head start that can only pattern-match. None is
nothing to do. In both cases this exits having started nothing, and the
pipeline installs the way it always has.

It is deliberately a separate program from the wrapper. The wrapper runs
after the gateways are up, which is thirty seconds to a minute later, and
the whole point is not to wait that long. The wrapper adopts what it
finds here rather than starting its own.

Everything it knows is on disk under <repo>/.engelbart/, so three
different readers — this process, the wrapper, and an agent with a shell
— all see one state and none of them holds it in memory:

    install.json   what was started, when, and its pid
    install.log    everything it printed
    install.exit   its exit status, written the moment it finishes
    install.lock   the pid, while it is running

    install-status.sh, install-wait.sh, install-cancel.sh

The lock is what makes a second install impossible rather than merely
discouraged. Nothing starts one while it is held, including a second copy
of this program, and the controls are the sanctioned way to end it.

    python3 prestart.py <repo>            start it
    python3 prestart.py --status <repo>   one JSON line
    python3 prestart.py --wait <repo>     block, exit with its status
    python3 prestart.py --cancel <repo>   stop it, release the lock
"""
import json
import os
import shlex
import signal
import subprocess
import sys
import time
from pathlib import Path

SETUP_DIR = ".engelbart"
WAIT_TIMEOUT_S = 25 * 60
POLL_S = 1

# What each lockfile means, as its own ecosystem's reproducible install.
# Frozen where the ecosystem has a word for it: the lockfile is the
# repository's own answer, and a head start that quietly resolved a
# different dependency graph would be worse than no head start at all.
#
# Ordered, but the order never decides anything — a root with two of
# these starts nothing. It is here so the reason given names them in a
# stable order.
LOCKS = (
    ("package-lock.json", ["npm", "ci", "--no-audit", "--no-fund"]),
    ("pnpm-lock.yaml", ["pnpm", "install", "--frozen-lockfile"]),
    ("yarn.lock", ["yarn", "install", "--frozen-lockfile"]),
    ("bun.lockb", ["bun", "install"]),
    ("bun.lock", ["bun", "install"]),
    ("uv.lock", ["uv", "sync"]),
)


def folder(root):
    where = Path(root) / SETUP_DIR
    where.mkdir(parents=True, exist_ok=True)
    return where


def paths(root):
    where = folder(root)
    return {name: where / f"install{suffix}" for name, suffix in
            (("record", ".json"), ("log", ".log"), ("exit", ".exit"), ("lock", ".lock"))}


def alive(pid):
    """Whether that process is still there. Signal 0 asks the question
    without answering it."""
    if not pid:
        return False
    try:
        os.kill(int(pid), 0)
    except (OSError, ValueError, TypeError):
        return False
    return True


def detect(root):
    """The one install this repository unambiguously wants, or why not."""
    root = Path(root)
    found = [(name, cmd) for name, cmd in LOCKS if (root / name).is_file()]
    if not found:
        return None, "no lockfile in the repository root"
    if len(found) > 1:
        return None, "the repository root has more than one lockfile: " + ", ".join(n for n, _ in found)
    return found[0], None


def held(root):
    """The pid of a running install, if one holds the lock. A lock whose
    process is gone is stale and is cleared here rather than being an
    obstacle forever — a sandbox that lost a process should not also lose
    the ability to install."""
    lock = paths(root)["lock"]
    try:
        pid = int(lock.read_text().strip())
    except (OSError, ValueError):
        return None
    if alive(pid):
        return pid
    lock.unlink(missing_ok=True)
    return None


def begin(root):
    """Start it, detached, and return what was started.

    The command is run under `sh -c` so that its exit status can be
    written the moment it finishes: this process is about to exit, and an
    orphan's status is not something anyone can wait for afterwards. That
    file is the difference between "still running" and "finished, and
    here is how"."""
    root = str(Path(root).resolve())
    p = paths(root)
    running = held(root)
    if running:
        return {"started": False, "reason": f"an install is already running as pid {running}", "pid": running}

    found, why = detect(root)
    if not found:
        return {"started": False, "reason": why}
    lock, cmd = found

    for name in ("exit", "record"):
        p[name].unlink(missing_ok=True)
    line = (shlex.join(cmd) + " >" + shlex.quote(str(p["log"])) + " 2>&1; "
            "printf %s $? >" + shlex.quote(str(p["exit"])) + "; "
            "rm -f " + shlex.quote(str(p["lock"])))
    try:
        proc = subprocess.Popen(
            ["sh", "-c", line], cwd=root,
            env=dict(os.environ, PIP_NO_CACHE_DIR="1", CI="1", npm_config_fund="false", npm_config_audit="false"),
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL,
            start_new_session=True)
    except (OSError, ValueError) as exc:
        return {"started": False, "reason": f"{cmd[0]} could not be started: {exc}"[:300]}

    p["lock"].write_text(str(proc.pid))
    record = {"command": cmd, "lock": lock, "pid": proc.pid, "startedAt": time.time(),
              "log": str(p["log"]), "root": root}
    p["record"].write_text(json.dumps(record))
    write_controls(root)
    return {"started": True, **record}


def read(root):
    try:
        record = json.loads(paths(root)["record"].read_text())
    except (OSError, ValueError):
        return None
    return record if isinstance(record, dict) else None


def state(root):
    """What the install is doing, for anyone who asks: this program, the
    wrapper, or an agent running install-status.sh."""
    record = read(root)
    if not record:
        return {"status": "none"}
    p = paths(root)
    out = {**record, "status": "running", "exitCode": None, "finishedAt": None}
    try:
        out["exitCode"] = int(p["exit"].read_text().strip())
        # When it ended, not when it was asked about. The shell writes
        # this file as its last act, so its timestamp is the install's
        # own finish; without it an install that took two seconds reports
        # a hundred to whoever reads the record an hour later, and a
        # measurement taken from that is a measurement of nothing.
        out["finishedAt"] = p["exit"].stat().st_mtime
    except (OSError, ValueError):
        out["exitCode"] = None
    started = record.get("startedAt") or time.time()
    out["seconds"] = round((out["finishedAt"] or time.time()) - started, 1)
    if out["exitCode"] is not None:
        out["status"] = "cancelled" if out["exitCode"] in (130, 143) else ("done" if out["exitCode"] == 0 else "failed")
    elif not alive(record.get("pid")):
        # No status file and no process: it was killed in a way that never
        # reached the shell's last line. Said as its own thing, because
        # "we do not know" and "it failed" are different facts.
        out["status"] = "lost"
    return out


def wait(root, timeout=WAIT_TIMEOUT_S):
    """Block until it is over, whatever over turns out to mean."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        now = state(root)
        if now["status"] in ("none", "done", "failed", "cancelled", "lost"):
            return now
        time.sleep(POLL_S)
    return {**state(root), "status": "timeout"}


def cancel(root):
    """Stop it and release the lock, so that whoever wanted it stopped can
    start their own. The whole process group goes: a package manager is a
    tree of processes and killing its root leaves the rest installing."""
    record = read(root)
    if not record:
        return {"status": "none"}
    pid = record.get("pid")
    if alive(pid):
        try:
            os.killpg(os.getpgid(int(pid)), signal.SIGTERM)
            for _ in range(20):
                if not alive(pid):
                    break
                time.sleep(0.25)
            if alive(pid):
                os.killpg(os.getpgid(int(pid)), signal.SIGKILL)
        except (OSError, ValueError, ProcessLookupError):
            pass
    p = paths(root)
    if not p["exit"].exists():
        p["exit"].write_text("130")
    p["lock"].unlink(missing_ok=True)
    return state(root)


CONTROL = """#!/bin/sh
# Written by the runner. The sanctioned way to {what} the dependency
# install it started when this repository was cloned.
exec python3 {me} {flag} {root}
"""


def write_controls(root):
    """The three controls, as files an agent can simply run. Prose in a
    prompt is not a control; this is."""
    me = shlex.quote(str(Path(__file__).resolve()))
    where = folder(root)
    quoted = shlex.quote(str(Path(root).resolve()))
    for name, flag, what in (("status", "--status", "ask after"), ("wait", "--wait", "wait for"), ("cancel", "--cancel", "stop")):
        path = where / f"install-{name}.sh"
        path.write_text(CONTROL.format(what=what, me=me, flag=flag, root=quoted))
        path.chmod(0o755)


def main(argv):
    flags = {a for a in argv if a.startswith("--")}
    rest = [a for a in argv if not a.startswith("--")]
    if not rest:
        print(json.dumps({"status": "none", "reason": "usage: prestart.py [--status|--wait|--cancel] <repository>"}))
        return 2
    root = rest[0]
    if not Path(root).is_dir():
        print(json.dumps({"status": "none", "reason": f"{root} is not a directory"}))
        return 2
    if "--status" in flags:
        print(json.dumps(state(root)))
        return 0
    if "--wait" in flags:
        out = wait(root)
        print(json.dumps(out))
        return 0 if out.get("status") in ("done", "none") else 1
    if "--cancel" in flags:
        print(json.dumps(cancel(root)))
        return 0
    print(json.dumps(begin(root)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
