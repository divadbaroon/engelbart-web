// A repository's environment: the variables its code reads, as found by the
// pipeline's scan, and which of them have values. Free of React and of
// Supabase so the desktop app can share it. Values never appear here; only
// names and statuses travel between the sandbox, the database and the page.

export type EnvStatus = "missing" | "found" | "provided" | "local" | "optional" | "uncertain" | "not_applicable";

export type EnvVariable = {
  name: string;
  status: EnvStatus;
  requirement: "required" | "optional" | "unknown";
  // required: the app reads it with no default; optional: has a default;
  // other: referenced by a deployment task, not this launch; unresolved: needs a look.
  group: "required" | "optional" | "other" | "unresolved";
  source: string | null;   // where a value came from: a dotenv file, or "saved" for ours
  public: boolean;         // exposed to the browser by the framework (NEXT_PUBLIC_, VITE_)
};

export type EnvReport = {
  variables: EnvVariable[];
  missing: string[];    // required names that had no value when the app started
  ignored: string[];    // saved names the scan did not find in the code
  local: string[];      // names filled by a local Supabase in the sandbox
  localError: string | null;   // why a local Supabase could not be set up, when one was tried
  scannedAt: string;
  runId: string;
};

export const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const MAX_ENV_NAME = 200;
export const MAX_ENV_VALUE = 16384;

// A value that was probably pasted from the wrong thing.
//
// Nothing here refuses anything. A variable may legitimately hold almost
// any string, and a panel that argued with the person about what their
// own key looks like would be worse than one that stays quiet. This says
// the one sentence that would have saved the time, and the value is saved
// either way.
//
// The case it was written for: a git commit subject pasted into
// OPENAI_API_KEY. It saved without a word, the run launched with it, and
// the only sign was a 401 from OpenAI two minutes later quoting the
// commit message back — by which point the tab that could have said
// something had been closed twice.
//
// Only checks that are nearly always right belong here. A warning that
// cries wolf is read once and then never again, which would cost more
// than the silence did.
export function suspectValue(name: string, value: string): string | null {
  // Quotes survive a copy out of a .env file or a shell. A value that
  // wanted them would not have both, at both ends, and nothing between.
  if (value.length > 1 && /^(["'])[\s\S]*\1$/.test(value)) {
    return "This was saved with its quotation marks. If they are not part of the value, take them off.";
  }
  // A whole assignment pasted rather than the right-hand side of one.
  const head = value.slice(0, name.length);
  if (head.toLowerCase() === name.toLowerCase() && /^\s*=/.test(value.slice(name.length))) {
    return `This starts with "${name}=", so a whole line may have been pasted rather than the value.`;
  }
  // The one that matters. Keys, tokens and passwords are issued as one
  // opaque run of characters; prose is what arrives when something else
  // was on the clipboard.
  if (SECRET_NAME.test(name) && /\s/.test(value) && !KEY_MATERIAL.test(value)) {
    return "A key or token does not usually contain spaces. Check that what was pasted is the value and nothing else.";
  }
  return null;
}

// Secrets that are a document rather than a token, and carry spaces by
// construction rather than by accident.
//
// PEM and PGP armor is always `-----BEGIN <multi-word label>-----`, so
// every private key, every certificate and every service-account JSON
// with a key inside it contains a space. An SSH public key is
// `<type> <base64> <comment>`. Structured data is spaced wherever it was
// printed. Without this the space rule is not merely imprecise about
// these, it is wrong about every single one of them — and a warning that
// is always wrong about the most common multi-line secret there is would
// be read once and then never again, which is the cost the rule above
// exists to avoid paying.
const KEY_MATERIAL = /-----BEGIN [A-Z0-9 ]+-----|^(ssh-[a-z0-9]+|ecdsa-sha2-[a-z0-9-]+) |^[[{][\s\S]*[\]}]$/;

// Names whose values are issued rather than written. Matched on the last
// word so ANTHROPIC_API_KEY and DATABASE_PASSWORD are in and PUBLIC_KEY_PATH
// is out.
//
// CREDENTIALS is deliberately absent. GOOGLE_APPLICATION_CREDENTIALS holds
// either a path or a whole service-account document, and both contain
// spaces, so the space rule would be wrong every time it fired on one.
const SECRET_NAME = /(^|_)(KEY|TOKEN|SECRET|PASSWORD|PASSWD|DSN)$/i;

// What the wrapper emits, before the worker stamps it with the run.
export type EnvReportEvent = Record<string, unknown>;

export function toEnvReport(ev: EnvReportEvent, runId: string, at: string): EnvReport | null {
  if (!Array.isArray(ev.variables)) return null;
  const variables = (ev.variables as Partial<EnvVariable>[])
    .filter((v) => typeof v.name === "string" && ENV_NAME.test(v.name))
    .map((v) => ({
      name: v.name as string,
      status: (v.status ?? "uncertain") as EnvStatus,
      requirement: (v.requirement ?? "unknown") as EnvVariable["requirement"],
      group: (v.group ?? "unresolved") as EnvVariable["group"],
      source: typeof v.source === "string" ? v.source : null,
      public: !!v.public,
    }));
  const names = (list: unknown) => (Array.isArray(list) ? list.filter((n): n is string => typeof n === "string") : []);
  return {
    variables, missing: names(ev.skipped), ignored: names(ev.ignored), local: names(ev.local),
    localError: typeof ev.localError === "string" && ev.localError ? ev.localError : null, scannedAt: at, runId,
  };
}

// What a run is running with that is no longer what is saved.
//
// A run reads the saved values once, at launch: the worker writes them
// into the sandbox and the wrapper deletes the file once read. Nothing
// re-reads them while a run is alive, so anything saved or removed
// afterwards reaches the next run and not this one.
//
// Two lists, because the two cases cannot be found the same way. A
// changed value still has a row, so its timestamp can be compared. A
// removed one has no row left at all, so what the run was handed is read
// from the run's own scan instead — which is also the only record that
// survives closing the tab.
//
// `report` is that scan, and it must be this run's: an earlier run's
// report standing in for it would describe an environment nobody is
// running. The caller checks the run id, because only the caller knows
// which run is in front of the person.
// A third list, and the one that is not about time at all. The pipeline's
// scan reports the saved names it could not find anywhere in the code,
// and the wrapper drops them before the application is ever started —
// hc takes only names its own scan knows. Such a value is not stale and
// never will be: launching again will not apply it, and neither will
// preparing from scratch. It was in the report from the beginning and
// nothing read it out, so the panel said "Saved", the notice above said
// to prepare again, and the name sat there looking like it had taken.
export type PendingEnv = { stale: string[]; removed: string[]; unread: string[] };

export function pendingEnv(saved: { name: string; updatedAt: string }[], report: EnvReport | null): PendingEnv {
  if (!report) return { stale: [], removed: [], unread: [] };
  // When the values were read, not when the run was queued. A run can
  // spend a minute cloning first, and a requeue reuses the row without
  // moving its start, so anything keyed to the start would report a
  // value saved in between as missed for the life of the run.
  const read = Date.parse(report.scannedAt);
  const unread = new Set(report.ignored);
  return {
    // A name nothing reads is left out: it is not waiting for a launch.
    stale: saved.filter((s) => !unread.has(s.name) && Date.parse(s.updatedAt) > read).map((s) => s.name),
    removed: report.variables.filter((v) => v.source === SAVED_SOURCE && !saved.some((s) => s.name === v.name)).map((v) => v.name),
    unread: saved.filter((s) => unread.has(s.name)).map((s) => s.name),
  };
}

// What the wrapper writes as the source of a value that came from here,
// as opposed to one the repository's own dotenv supplied (sandbox/hc_run.py).
const SAVED_SOURCE = "saved";

// A short line for a variable's state.
export function describeEnv(v: EnvVariable, saved: boolean): string {
  if (saved) return v.status === "missing" ? "Saved · used on the next run" : "Saved";
  switch (v.status) {
    case "missing": return "Required · no value";
    case "provided": return "Saved";
    case "local": return "Provided by local Supabase in the sandbox";
    case "found": return v.source ? `Found in ${v.source}` : "Found";
    case "optional": return "Optional";
    case "not_applicable": return "Not used by this launch";
    default: return v.requirement === "required" ? "Required · unresolved" : "Needs a look";
  }
}
