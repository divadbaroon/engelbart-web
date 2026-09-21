"use client";

import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Repo } from "@/lib/repos";
import type { SandboxRun } from "@/lib/sandbox";
import { describeEnv, ENV_NAME, pendingEnv, type EnvReport, type EnvVariable } from "@/lib/environment";
import { getEnvironment, removeEnvValue, setEnvValue, type SavedEnv } from "@/app/workspace/[workspaceId]/env-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  repo: Repo;
  run: SandboxRun | undefined;
  report: EnvReport | null;   // the scan from the current run's log, else the last saved one
  onPrepare: () => void;
  // Launch again in the sandbox this run is already in. Absent when there
  // is no sandbox to launch in, which is when preparing again is the only
  // thing there is.
  onRelaunch: (() => void) | null;
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
export function EnvPanel({ repo, run, report, onPrepare, onRelaunch }: Props) {
  const [saved, setSaved] = useState<SavedEnv[] | null>(null);
  const [stored, setStored] = useState<EnvReport | null>(null);   // the repository's copy, when the run has none
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});   // name → value being typed
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<{ name: string; value: string } | null>(null);
  const [warning, setWarning] = useState<string | null>(null);   // what was odd about the value just saved

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

  // What this run was handed, and when it was handed it.
  //
  // A run reads the saved values once, at launch: the worker's loadEnv
  // writes them into the sandbox and the wrapper deletes the file once
  // read. Nothing re-reads the table while a run is alive, so anything
  // done here afterwards reaches the next run and not this one.
  //
  // The comparison is against the scan the run itself reported, not
  // against `startedAt`. `startedAt` is when the run was queued, which
  // can be a minute of cloning before the values were read, and a
  // requeue reuses the row without moving it — so a value saved during
  // the clone, or any value at all after a relaunch, would have been
  // reported stale for the life of the run. `scannedAt` is stamped when
  // the values were actually read, and `runId` keeps an earlier run's
  // report from standing in for this one's.
  const read = run && current && current.runId === run.id ? current : null;

  // Saved or removed since then, and so not what this run is running
  // with. Derived rather than remembered: this used to be a `changed`
  // flag in this component, which went the moment the tab did — so
  // leaving Environment and coming back showed a plain "Saved" for a
  // value the running preview had never seen, which is how a key sat
  // corrected in the database for seven minutes while the preview kept
  // failing on the old one. What is on the server cannot forget, and it
  // is also right when the change was made in another tab or by
  // somebody else.
  // Until the saved values have arrived this panel knows nothing, and an
  // empty `saved` is not the same as none saved. Read as one, every value
  // the run is holding looks like a value somebody has just deleted, and
  // the notice below announced the removal of a key nobody had touched —
  // by name, at the top of the tab, for as long as the fetch took. So the
  // comparison does not happen until there is something to compare
  // against, and `loading` is about that list rather than about the scan,
  // which arrives with the run and says nothing about what is stored.
  const loading = saved === null && !error;
  const { stale, removed, unread } = loading ? { stale: [] as string[], removed: [] as string[], unread: [] as string[] } : pendingEnv(saved ?? [], read);
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
    setWarning(result.warning ?? null);
    setDrafts((d) => { const next = { ...d }; delete next[name]; return next; });
    await load();
    return true;
  }

  async function remove(name: string) {
    withBusy(name, true);
    const result = await removeEnvValue(repo.id, name);
    withBusy(name, false);
    if (!result.ok) { setError(result.error); return; }
    setWarning(null);
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

  // Nothing to show is not the same as nothing to read, and this used to
  // claim the second when it only knew the first: a repository whose scan
  // had not run yet was told it "reads nothing from its environment",
  // which is a finding rather than an absence, and it was told so under a
  // paragraph about where its values are kept and above a button for
  // adding one. So when there is no list there is no chrome about a list
  // either — one sentence, and whatever went wrong if something did.
  const nothing = rows.length === 0 && !adding;
  const bare = loading || nothing;

  return (
    <section aria-label="Environment" className="flex h-full flex-col gap-5 overflow-y-auto px-[22px] py-[18px]">
      {/* A paragraph used to stand here explaining what the tab was —
          the values the repository reads, kept with the project, handed
          over next time it starts. It is a tab called Environment with a
          list of names and values under it, and it said the same thing
          every time anybody opened it. What is worth saying is said
          where it is not already obvious: the stale-value notice below,
          and the empty state. */}
      {/* What this run is running with that is no longer what is saved,
          and the two ways out of it — which are not the same way.

          Launching again reuses the sandbox: the clone and everything
          installed into it stay, the application is started over, and it
          reads what is saved now. That is the whole answer for a value
          that was added or changed. It is not the answer for one that was
          removed: hc keeps its saved values in a store in the sandbox and
          only ever merges into it, so a name taken away here is still in
          there and the next launch in that sandbox will still be handed
          it. Only a new sandbox is without it. So the sentence about
          removal says which button clears it rather than leaving both
          looking equivalent. */}
      {!loading && (!!stale.length || !!removed.length) && (
        <div className="flex max-w-[620px] items-center gap-3 rounded-md border bg-[#f6f6f6] px-3.5 py-2.5 text-[13px] text-muted-foreground">
          <span className="flex-1">
            {!!stale.length && (
              <><span className="font-medium text-foreground">{stale.join(", ")}</span>
                {stale.length === 1 ? " was saved" : " were saved"} after this run read its environment, so it is still using the {stale.length === 1 ? "value" : "values"} it was given. </>
            )}
            {!!removed.length && (
              <><span className="font-medium text-foreground">{removed.join(", ")}</span>
                {removed.length === 1 ? " was removed, but this run still has it" : " were removed, but this run still has them"}. </>
            )}
            {onRelaunch
              ? <>Launch again to start the application with what is saved now, in the sandbox it is already in — nothing is cloned or installed a second time.{removed.length ? " Clearing a removed value takes a new sandbox: prepare again for that." : ""}</>
              : <>Prepare the repository again to start it with what is saved now.</>}
          </span>
          {onRelaunch && <Button size="sm" onClick={onRelaunch} className="h-7 shrink-0 px-3 font-normal">Launch again</Button>}
          <Button variant="outline" size="sm" onClick={onPrepare} className="h-7 shrink-0 px-3 font-normal">Prepare again</Button>
        </div>
      )}

      {/* Saved, and read by nothing. The pipeline's scan reports the names
          it could not find in the code and the wrapper drops them before
          the application starts, so these are not waiting for a launch —
          they are waiting for the code to read them, or for the name to be
          the one the code actually reads. Said here because it was said
          nowhere: the value saved, the row appeared, and every notice on
          this tab offered to prepare again, which would have changed
          nothing. */}
      {!loading && !!unread.length && (
        <p className="max-w-[620px] text-[13px] leading-5 text-muted-foreground">
          <span className="font-medium text-foreground">{unread.join(", ")}</span>
          {unread.length === 1 ? " is saved, but nothing in " : " are saved, but nothing in "}
          {repo.name} reads {unread.length === 1 ? "it" : "them"}, so {unread.length === 1 ? "it was" : "they were"} not handed to the
          application. Launching again will not change that. Check the spelling against the names listed below, which are the ones the
          scan found.
        </p>
      )}

      {warning && (
        <p className="flex max-w-[560px] items-start gap-2 text-[13px] leading-5 text-muted-foreground">
          <span className="flex-1">Saved. {warning}</span>
          <button type="button" onClick={() => setWarning(null)} aria-label="Dismiss" className="shrink-0 pt-0.5 text-muted-foreground/70 hover:text-foreground"><X className="size-3.5" /></button>
        </p>
      )}

      {error && <p role="alert" className="max-w-[560px] text-[13px] text-destructive">{error}</p>}

      {current?.localError && (
        <p className="max-w-[560px] text-[13px] leading-5 text-muted-foreground">
          A local Supabase was tried in the sandbox so these values would not be needed, but it could not be set up:{" "}
          <span className="text-foreground">{current.localError}</span>
        </p>
      )}

      {loading ? (
        // `flex-1` rather than `h-full`: the local-Supabase notice above
        // is gated on its own error and not on this, so the two can
        // share the column, and a full-height sibling would push the
        // pane into a scrollbar over a single line. This way it takes
        // whatever height is left and centres in it.
        <p className="flex flex-1 items-center justify-center gap-2 text-[13px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Loading…
        </p>
      ) : nothing ? (
        <p className="max-w-[560px] text-[13px] leading-5 text-muted-foreground">
          The environment variables haven&apos;t been read yet.
        </p>
      ) : (
        <ul className="flex max-w-[720px] flex-col divide-y rounded-lg border">
          {rows.map((row) => {
            const draft = drafts[row.name];
            const local = row.variable?.status === "local";   // the sandbox supplies it
            const editing = !local && (!row.saved || draft !== undefined);
            const isBusy = busy.has(row.name);
            return (
              <li key={row.name} className="flex items-center gap-4 px-3.5 py-2.5">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-mono text-[13px] text-foreground">{row.name}</span>
                  <span className={cn("text-xs", row.variable?.status === "missing" && !row.saved ? "text-destructive" : "text-muted-foreground")}>
                    {/* A saved name with no variable beside it is one the
                        scan did not report. There are two reasons for
                        that and they are not the same: the scan found the
                        code and this name is not in it, which is what
                        `ignored` says, or there has been no scan of this
                        repository at all. The first is a name that will
                        never take; the second is a name nobody has looked
                        for yet. They read identically until they are
                        told apart. */}
                    {row.variable ? describeEnv(row.variable, !!row.saved)
                      : current?.ignored.includes(row.name) ? `Saved · ${repo.name} does not read it`
                      : "Saved · not read by the last run"}
                    {row.variable?.public && " · sent to the browser"}
                  </span>
                </div>
                {local ? (
                  <span className="shrink-0 text-xs text-muted-foreground">local</span>
                ) : editing ? (
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

      {!adding && !bare && (
        <Button variant="ghost" size="sm" onClick={() => setAdding({ name: "", value: "" })} className="w-fit px-3 font-normal text-muted-foreground">
          + Add a variable
        </Button>
      )}
    </section>
  );
}
