// A repository's environment: the variables its code reads, as found by the
// pipeline's scan, and which of them have values. Free of React and of
// Supabase so the desktop app can share it. Values never appear here; only
// names and statuses travel between the sandbox, the database and the page.

export type EnvStatus = "missing" | "found" | "provided" | "optional" | "uncertain" | "not_applicable";

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
  scannedAt: string;
  runId: string;
};

export const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const MAX_ENV_NAME = 200;
export const MAX_ENV_VALUE = 16384;

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
  return { variables, missing: names(ev.skipped), ignored: names(ev.ignored), scannedAt: at, runId };
}

// A short line for a variable's state.
export function describeEnv(v: EnvVariable, saved: boolean): string {
  if (saved) return v.status === "missing" ? "Saved · used on the next run" : "Saved";
  switch (v.status) {
    case "missing": return "Required · no value";
    case "provided": return "Saved";
    case "found": return v.source ? `Found in ${v.source}` : "Found";
    case "optional": return "Optional";
    case "not_applicable": return "Not used by this launch";
    default: return v.requirement === "required" ? "Required · unresolved" : "Needs a look";
  }
}
