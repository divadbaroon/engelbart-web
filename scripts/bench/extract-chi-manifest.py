#!/usr/bin/env python3
"""Turn the CHI systems papers sheet into bench/chi.manifest.json.

The sheet has a title block, then a header row (Year, Paper, Area,
System / artifact, GitHub repository, Paper / evidence) and one paper per
row. Every entry is a systems paper, so the expected evaluation is
"system": the artifact the paper describes should be running, as a web
preview when it is an interface or app, or set up for use when it is a
framework or library. The artifact and area columns are the constraints.

    python3 scripts/bench/extract-chi-manifest.py ~/Desktop/chi_systems_papers_2024_2026.xlsx
"""
import html
import json
import re
import sys
import zipfile
from pathlib import Path


def rows(path):
    z = zipfile.ZipFile(path)
    x = z.read("xl/worksheets/sheet1.xml").decode()
    for row in re.findall(r"<x:row[^>]*>(.*?)</x:row>", x, re.S):
        vals = {}
        for col, _, inner in re.findall(r'<x:c r="([A-Z]+)(\d+)"[^>]*?(?:/>|>(.*?)</x:c>)', row, re.S):
            v = re.search(r"<x:v>(.*?)</x:v>", inner or "", re.S)
            vals[col] = html.unescape(v.group(1)).strip() if v else ""
        yield vals


def main():
    src = Path(sys.argv[1] if len(sys.argv) > 1 else "~/Desktop/chi_systems_papers_2024_2026.xlsx").expanduser()
    out = Path(__file__).resolve().parents[2] / "bench" / "chi.manifest.json"
    entries, seen = [], set()
    for r in rows(src):
        m = re.match(r"https://github\.com/([^/\s]+)/([^/\s#?]+)", r.get("E", ""))
        if not m or not r.get("A", "").isdigit():
            continue
        owner, name = m.group(1), m.group(2).removesuffix(".git")
        key = (owner.lower(), name.lower())
        if key in seen:
            continue
        seen.add(key)
        entries.append({
            "url": f"https://github.com/{owner}/{name}", "owner": owner, "name": name,
            "kind": "system", "title": r.get("B", ""), "year": r.get("A", ""), "area": r.get("C", ""), "artifact": r.get("D", ""),
            "paper": r.get("F", ""),
            "constraints": f"CHI {r.get('A', '')} systems paper. The artifact is: {r.get('D', '')}. Area: {r.get('C', '')}.",
        })
    out.write_text(json.dumps(entries, indent=2) + "\n")
    print(f"{len(entries)} repositories → {out}")


if __name__ == "__main__":
    main()
