// The reading for a run, on the server, without generating one.
//
// The browser is where a profile is asked for: it is the surface that
// knows a person is looking, and generation costs a model call. This is
// the other half — the route that answers a question about a run needs
// the same vocabulary the screen is using, and it gets it by looking the
// same profile up rather than by being told which one to use. A caller
// who could name the profile could also name the wrong one.
//
// Never generates, never claims, never writes. A run with no profile is
// read blind here exactly as it is on the screen.
//
// Server side: the signature is computed with node:crypto.
import type { createClient } from "@/lib/supabase/server";
import type { TraceEvent } from "@/lib/trace/types";
import { BLIND_READING, blindReading, builtInReading, readingOf, type Reading } from "@/lib/activity/reading";
import { capabilityOf } from "@/lib/activity/profile/capability";
import { signatureOf } from "@/lib/activity/profile/signature";
import { PROFILE_COLUMNS, claimExpired, describeState, staleness, toProfileRow } from "@/lib/activity/profile/store";

type Client = Awaited<ReturnType<typeof createClient>>;

export async function readingForRun(
  supabase: Client,
  repo: { id: string; owner: string; name: string } | null,
  events: TraceEvent[],
): Promise<Reading> {
  if (!repo) return BLIND_READING;
  // A repository this application ships a reading for is not looked up:
  // it is known.
  const known = builtInReading(repo);
  if (known) return known;
  if (!events.length) return BLIND_READING;

  const { signature } = signatureOf(events);
  const { data, error } = await supabase
    .from("engelbart_artifact_profiles").select(PROFILE_COLUMNS)
    .eq("repo_id", repo.id).eq("signature", signature).maybeSingle();
  // A table that is not there, or a row that cannot be read, is the same
  // answer as no row: this artifact has not been read. It is never a
  // reason to answer in somebody else's words.
  if (error || !data) return BLIND_READING;

  const row = toProfileRow(data as Record<string, unknown>);
  if (claimExpired(row)) return BLIND_READING;
  const version = staleness(row, capabilityOf(events));
  const state = describeState(version.stale && row.status === "ready" ? { ...row, status: "stale", error: version.reason } : row);
  if (!state.profile) return blindReading(state.status, state.detail);
  return readingOf(state.profile, row, state.detail) ?? BLIND_READING;
}
