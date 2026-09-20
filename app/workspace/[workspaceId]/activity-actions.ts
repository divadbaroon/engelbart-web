"use server";

import { createClient } from "@/lib/supabase/server";
import { narrateSession } from "@/lib/activity/narrate";
import { readStory } from "@/lib/activity/story";

// Asking what a session was, in a sentence.
//
// The classification lives in the browser, which is where the trace is,
// so the page sends the reduction it made rather than a run id to go and
// read. That is the same arrangement the semantic layer has with a
// document surveying itself, and it gets the same treatment: what
// arrives is rebuilt by readStory before anything is done with it, so a
// page can describe its session badly but cannot make the narrator read
// something longer, deeper or stranger than a story.
//
// Nothing is stored. A summary is derived from episodes that are
// themselves derived, and it is cheap enough to make again; keeping it
// would mean a table, a signature policy in the database and a row whose
// staleness nobody can see. That may be worth it later. It is not worth
// it for the first one.

export type SummaryOutcome =
  | { ok: true; summary: string; model: string }
  | { ok: false; error: string };

export async function summariseActivity(input: { story: unknown }): Promise<SummaryOutcome> {
  const story = readStory(input.story);
  if (!story) return { ok: false, error: "That session offered nothing that could be summarised." };

  // Signed in, because this spends a model call. There is no row to scope
  // and nothing to own: the story came from the caller's own trace and
  // goes straight back to them.
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) return { ok: false, error: "You are not signed in." };

  const read = await narrateSession(story);
  if (!read.ok) return { ok: false, error: read.error };
  return { ok: true, summary: read.summary, model: read.model };
}
