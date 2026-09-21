#!/usr/bin/env python3
"""Audit a generator transcript for reads outside the evidence pack.

Prints only aggregates, distinct paths and command heads. Never content.

The scratchpad directory is itself named after the observed project, so
its own path contains "engelbart-web". Every legitimate path therefore
carries that string. The fix is to strip the scratchpad root before
looking for markers, and to judge paths by prefix rather than substring.
"""
import json, re, sys, collections

ROOT = "/private/tmp/claude-501/-Users-divadbaroon-Desktop-engelbart-web/9513afc7-e24b-43db-8b54-e5cd74b27ae9/scratchpad/experiment"
PACK, OUT = ROOT + "/pack", ROOT + "/out"
REPO = "/Users/divadbaroon/Desktop/engelbart-web"
MARKERS = ["rope.ts", "rope-profile", "tests/activity", "lib/activity", "lib/semantics", "ROPE_TAXONOMY", "ArtifactProfile schema.ts"]

def strings(o):
    if isinstance(o, str): yield o
    elif isinstance(o, dict):
        for v in o.values(): yield from strings(v)
    elif isinstance(o, list):
        for v in o: yield from strings(v)

def uses(o):
    if isinstance(o, dict):
        if o.get("type") == "tool_use": yield o
        for v in o.values(): yield from uses(v)
    elif isinstance(o, list):
        for v in o: yield from uses(v)

tools = collections.Counter()
inside, outside, suspect, cmds = collections.Counter(), collections.Counter(), [], []
n = 0
for line in open(sys.argv[1], encoding="utf8", errors="replace"):
    n += 1
    try: rec = json.loads(line)
    except Exception: continue
    for u in uses(rec):
        name = u.get("name", "?"); tools[name] += 1
        inp = u.get("input", {})
        if name == "Bash": cmds.append(str(inp.get("command", ""))[:150].replace("\n", " ⏎ "))
        for s in strings(inp):
            for m in re.finditer(r"(/[\w./@~+-]{6,})", s[:8000]):
                p = m.group(1)
                if p.startswith(PACK) or p.startswith(OUT): inside[p.replace(ROOT + "/", "")] += 1
                elif p.startswith(REPO): outside[("REPO", p)] += 1
                elif p.startswith("/Users") or p.startswith("/opt") or p.startswith("/etc") or p.startswith("/var"): outside[("HOST", p)] += 1
                elif p.startswith("/private/tmp") or p.startswith("/tmp"): outside[("TMP", p)] += 1
            # markers, with every legitimate path removed first
            clean = s.replace(ROOT, "").replace(REPO, "«REPO»")
            for mk in MARKERS:
                if mk in clean: suspect.append((name, mk, clean[:200].replace("\n", " ")))

print(f"transcript lines: {n}   tool calls: {sum(tools.values())}")
for t, c in tools.most_common(): print(f"  {c:>4}  {t}")
print(f"\ndistinct paths inside the pack / output: {len(inside)}")
for p, c in inside.most_common(40): print(f"  {c:>3}x  {p}")
print(f"\nPATHS OUTSIDE: {len(outside)}")
for (kind, p), c in outside.most_common(40): print(f"  {c:>3}x  [{kind}] {p}")
print(f"\nFORBIDDEN MARKERS (after stripping legitimate paths): {len(suspect)}")
for name, mk, s in suspect[:20]: print(f"  {name} [{mk}] {s}")
print("\nBASH COMMAND HEADS")
for c in cmds: print(f"  $ {c}")
print("\nVERDICT:", "VOID" if (outside or suspect) else "CLEAN — every tool call stayed inside the evidence pack")
