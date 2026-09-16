#!/usr/bin/env python3
"""Turn the evaluation spreadsheet into bench/manifest.json.

The sheet is a CSV pasted into one column, one line per cell, so it is
read as CSV text rather than as cells. Each entry keeps the repository,
the kind of evaluation the sheet expects, and the constraints its author
wrote, which the grader uses as the rubric.

    python3 scripts/bench/extract-manifest.py ~/Desktop/Eval.xlsx
"""
import csv
import html
import io
import json
import re
import sys
import zipfile
from pathlib import Path

KINDS = {"web_preview", "library_or_cli", "notebook_or_visualization", "simulation", "dataset_or_pipeline", "dataset"}


def sheet_lines(path):
    z = zipfile.ZipFile(path)
    xml = z.read("xl/sharedStrings.xml").decode()
    shared = [html.unescape("".join(re.findall(r"<t[^>]*>(.*?)</t>", si, re.S))) for si in re.findall(r"<si>(.*?)</si>", xml, re.S)]
    sheet = z.read("xl/worksheets/sheet1.xml").decode()
    for row in re.findall(r"<row[^>]*>(.*?)</row>", sheet, re.S):
        cells = re.findall(r'<c r="([A-Z]+)\d+"([^>]*)>(?:<v>(.*?)</v>|<is><t>(.*?)</t></is>)?', row, re.S)
        vals = [(shared[int(v)] if 't="s"' in attrs and v else (t or v or "")) for _, attrs, v, t in cells]
        yield ",".join(vals)


def parse(path):
    lines = list(sheet_lines(path))
    header = next(csv.reader(io.StringIO(lines[0])))
    # A row the sheet split over two lines (its evidence link on the second)
    # is joined back before parsing.
    joined = []
    for line in lines[1:]:
        if joined and not re.match(r"https://github\.com/[^/\s]+/[^/\s,]+,", line):
            joined[-1] += "," + line
        else:
            joined.append(line)
    entries = []
    for line in joined:
        try:
            fields = next(csv.reader(io.StringIO(line)))
        except StopIteration:
            continue
        m = re.match(r"https://github\.com/([^/\s]+)/([^/\s#?,]+)", fields[0])
        if not m:
            continue
        owner, name = m.group(1), m.group(2).removesuffix(".git")
        # The last two columns are the expected evaluation and the constraints;
        # the columns between shift when a field holds commas, so they are
        # read from the end.
        at = next((i for i in range(len(fields) - 1, -1, -1) if fields[i].strip() in KINDS), None)
        kind = fields[at].strip() if at is not None else "unknown"
        constraints = ", ".join(f.strip() for f in fields[at + 1:] if f.strip()) if at is not None else ""
        row = dict(zip(header, fields))
        entries.append({
            "url": f"https://github.com/{owner}/{name}",
            "owner": owner,
            "name": name,
            "kind": kind,
            "title": (row.get("Paper title") or "").strip(),
            "constraints": constraints,
        })
    return entries


def main():
    src = Path(sys.argv[1] if len(sys.argv) > 1 else "~/Desktop/Eval.xlsx").expanduser()
    out = Path(__file__).resolve().parents[2] / "bench" / "manifest.json"
    entries = parse(src)
    seen = set()
    unique = []
    for e in entries:
        key = (e["owner"].lower(), e["name"].lower())
        if key in seen:
            continue
        seen.add(key)
        unique.append(e)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(unique, indent=2) + "\n")
    kinds = {}
    for e in unique:
        kinds[e["kind"]] = kinds.get(e["kind"], 0) + 1
    print(f"{len(unique)} repositories → {out}")
    for k, n in sorted(kinds.items(), key=lambda kv: -kv[1]):
        print(f"  {n:3} {k}")


if __name__ == "__main__":
    main()
