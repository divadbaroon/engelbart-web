"use client";

import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Repo } from "@/lib/repos";
import type { SandboxRun } from "@/lib/sandbox";
import { describeEnv, ENV_NAME, type EnvReport, type EnvVariable } from "@/lib/environment";
import { getEnvironment, removeEnvValue, setEnvValue, type SavedEnv } from "@/app/workspace/[workspaceId]/env-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  repo: Repo;
  run: SandboxRun | undefined;
  report: EnvReport | null;   // the scan from the current run's log, else the last saved one
  onPrepare: () => void;
};

type Row = { name: string; variable: EnvVariable | null; saved: SavedEnv | null };

// The order people need them in: what is blocking first, then what has a
// value, then the rest.
const rank = (r: Row) =>
  r.variable?.status === "missing" && !r.saved ? 0
  : r.variable?.group === "unresolved" && !r.saved ? 1
  : r.saved ? 2
  : r.variable?.status === "found" ? 3
  : r.variable?.group === "other" ? 5
  : 4;

// The values a repository reads from its environment. What the pipeline's
// scan found is listed, blank fields for anything missing; values are
// stored with the project and handed to the next run, never shown again.
export function EnvPanel({ repo, run, report, onPrepare }: Props) {
  const [saved, setSaved] = useState<SavedEnv[] | null>(null);
  const [stored, setStored] = useState<EnvReport | null>(null);   // the repository's copy, when the run has none
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});   // name → value being typed
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<{ name: string; value: string } | null>(null);
  const [changed, setChanged] = useState(false);   // saved since the run started

  const load = useCallback(async () => {
    const result = await getEnvironment(repo.id);
    if (!result.ok) { setError(result.error); return; }
    setSaved(result.saved);
    setStored(result.report);
    setError(null);
  }, [repo.id]);
  const status = run?.status;
  useEffect(() => { void load(); }, [load, status]);

  const current = report ?? stored;
  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const v of current?.variables ?? []) { seen.add(v.name); rows.push({ name: v.name, variable: v, saved: saved?.find((s) => s.name === v.name) ?? null }); }
  for (const s of saved ?? []) if (!seen.has(s.name)) rows.push({ name: s.name, variable: null, saved: s });
  rows.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));

  const withBusy = (name: string, on: boolean) => setBusy((all) => { const next = new Set(all); if (on) next.add(name); else next.delete(name); return next; });

  async function save(name: string, value: string) {
    withBusy(name, true);
    const result = await setEnvValue(repo.id, name, value);
    withBusy(name, false);
    if (!result.ok) { setError(result.error); return false; }
    setError(null);
    setDrafts((d) => { const next = { ...d }; delete next[name]; return next; });
    setChanged(true);
    await load();
    return true;
  }

  async function remove(name: string) {
    withBusy(name, true);
    const result = await removeEnvValue(repo.id, name);
    withBusy(name, false);
    if (!result.ok) { setError(result.error); return; }
    setChanged(true);
    await load();
  }

  async function commitAdd() {
    if (!adding) return;
    const name = adding.name.trim();
    if (!ENV_NAME.test(name)) { setError("A name is letters, digits and underscores, and cannot start with a digit."); return; }
    if (await save(name, adding.value)) setAdding(null);
  }

  const onValueKey = (e: KeyboardEvent<HTMLInputElement>, name: string) => {
    if (e.key === "Enter") { e.preventDefault(); const v = drafts[name] ?? ""; if (v) void save(name, v); }
    if (e.key === "Escape") { e.preventDefault(); setDrafts((d) => { const next = { ...d }; delete next[name]; return next; }); }
  };

  return (
    <section aria-label="Environment" className="flex h-full flex-col gap-5 overflow-y-auto px-[22px] py-[18px]">
      <p className="max-w-[560px] text-[13px] leading-5 text-muted-foreground">
        Values {repo.name} reads from its environment. They are kept with this project, visible to its members,
        and handed to the repository the next time it starts.
      </p>

      {changed && (
        <div className="flex max-w-[560px] items-center gap-3 rounded-md border bg-[#f6f6f6] px-3.5 py-2.5 text-[13px] text-muted-foreground">
          <span className="flex-1">Saved. Prepare the repository again to start it with the new values.</span>
          <Button variant="outline" size="sm" onClick={() => { setChanged(false); onPrepare(); }} className="h-7 px-3 font-normal">Prepare again</Button>
        </div>
      )}

      {error && <p role="alert" className="max-w-[560px] text-[13px] text-destructive">{error}</p>}

      {saved === null && !current ? (
        <p className="text-[13px] text-muted-foreground">Loading…</p>
      ) : rows.length === 0 && !adding ? (
        <p className="max-w-[560px] text-[13px] leading-5 text-muted-foreground">
          {current ? "This repository reads nothing from its environment." : "Nothing is known yet. Missing values show up here once the repository has been prepared, or add one now."}
        </p>
      ) : (
        <ul className="flex max-w-[720px] flex-col divide-y rounded-lg border">
          {rows.map((row) => {
            const draft = drafts[row.name];
            const editing = !row.saved || draft !== undefined;
            const isBusy = busy.has(row.name);
            return (
              <li key={row.name} className="flex items-center gap-4 px-3.5 py-2.5">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-mono text-[13px] text-foreground">{row.name}</span>
                  <span className={cn("text-xs", row.variable?.status === "missing" && !row.saved ? "text-destructive" : "text-muted-foreground")}>
                    {row.variable ? describeEnv(row.variable, !!row.saved) : "Saved · not read by the last run"}
                    {row.variable?.public && " · sent to the browser"}
                  </span>
                </div>
                {editing ? (
                  <div className="flex w-[300px] shrink-0 items-center gap-1.5">
                    <Input
                      type="password"
                      autoComplete="off"
                      value={draft ?? ""}
                      disabled={isBusy}
                      placeholder={row.saved ? "New value" : "Value"}
                      aria-label={`Value for ${row.name}`}
                      onChange={(e) => setDrafts((d) => ({ ...d, [row.name]: e.target.value }))}
                      onKeyDown={(e) => onValueKey(e, row.name)}
                      className="h-7 font-mono text-xs"
                    />
                    <Button size="sm" disabled={isBusy || !draft} onClick={() => void save(row.name, draft ?? "")} className="h-7 px-2.5 font-normal">
                      {isBusy ? <Loader2 className="size-3 animate-spin" /> : "Save"}
                    </Button>
                    {row.saved && (
                      <Button variant="ghost" size="icon" aria-label="Cancel" onClick={() => setDrafts((d) => { const next = { ...d }; delete next[row.name]; return next; })} className="size-7 text-muted-foreground">
                        <X className="size-3" />
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span aria-label="Value set" className="mr-2 font-mono text-xs tracking-widest text-muted-foreground">••••••••</span>
                    <Button variant="ghost" size="sm" disabled={isBusy} onClick={() => setDrafts((d) => ({ ...d, [row.name]: "" }))} className="h-7 px-2 font-normal text-muted-foreground">Replace</Button>
                    <Button variant="ghost" size="sm" disabled={isBusy} onClick={() => void remove(row.name)} className="h-7 px-2 font-normal text-muted-foreground">Remove</Button>
                  </div>
                )}
              </li>
            );
          })}
          {adding && (
            <li className="flex items-center gap-4 px-3.5 py-2.5">
              <Input
                autoFocus
                value={adding.name}
                placeholder="NAME"
                aria-label="Variable name"
                onChange={(e) => setAdding({ ...adding, name: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") })}
                onKeyDown={(e) => { if (e.key === "Escape") setAdding(null); }}
                className="h-7 flex-1 font-mono text-xs"
              />
              <div className="flex w-[300px] shrink-0 items-center gap-1.5">
                <Input
                  type="password"
                  autoComplete="off"
                  value={adding.value}
                  placeholder="Value"
                  aria-label="Variable value"
                  onChange={(e) => setAdding({ ...adding, value: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void commitAdd(); } if (e.key === "Escape") setAdding(null); }}
                  className="h-7 font-mono text-xs"
                />
                <Button size="sm" disabled={!adding.name || !adding.value} onClick={() => void commitAdd()} className="h-7 px-2.5 font-normal">Save</Button>
                <Button variant="ghost" size="icon" aria-label="Cancel" onClick={() => setAdding(null)} className="size-7 text-muted-foreground">
                  <X className="size-3" />
                </Button>
              </div>
            </li>
          )}
        </ul>
      )}

      {!adding && (
        <Button variant="ghost" size="sm" onClick={() => setAdding({ name: "", value: "" })} className="w-fit px-3 font-normal text-muted-foreground">
          + Add a variable
        </Button>
      )}
    </section>
  );
}
