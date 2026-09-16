import { Sandbox } from "e2b";
import { createClient } from "@/lib/supabase/server";

// Reaching into a run's sandbox from the server: the Code tab's file reads
// and writes, and the Terminal's shell. The run is looked up through
// row-level security, so only the project's members get a connection.

const LIVE = ["cloned", "launching", "running"];
const CACHE_MS = 30_000;

export type OpenedSandbox = { sandbox: Sandbox; workdir: string };

// A shell sends a request per burst of keystrokes; re-checking the run and
// reconnecting on each would add a round trip to every one. Recent
// authorised connections are kept briefly, per user and run.
const recent = new Map<string, { opened: OpenedSandbox; until: number }>();

export async function openSandbox(runId: string): Promise<OpenedSandbox | { error: string }> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { error: "You are not signed in." };

  const key = `${userId}:${runId}`;
  const cached = recent.get(key);
  if (cached && cached.until > Date.now()) return cached.opened;

  const { data, error } = await supabase
    .from("engelbart_sandbox_runs").select("sandbox_id, workdir, status").eq("id", runId).maybeSingle();
  if (error) return { error: error.message };
  if (!data?.sandbox_id || !data.workdir || !LIVE.includes(data.status)) return { error: "The sandbox is not running." };
  try {
    const opened = { sandbox: await Sandbox.connect(data.sandbox_id), workdir: data.workdir };
    recent.set(key, { opened, until: Date.now() + CACHE_MS });
    return opened;
  } catch (err) {
    return { error: `The sandbox could not be reached: ${err instanceof Error ? err.message : String(err)}` };
  }
}
