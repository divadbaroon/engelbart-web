"use server";

import { createThread, latestThread, threadMessages } from "@/lib/bart/store";
import type { BartMessage } from "@/lib/bart/protocol";

// The workspace's conversation with Bart, as the signed-in member: the
// latest thread and its messages on load, and a fresh thread on Clear.
export type BartThread = { threadId: string; messages: BartMessage[] };

export async function loadBartThread(projectId: string): Promise<{ ok: true; thread: BartThread | null } | { ok: false; error: string }> {
  try {
    const t = await latestThread(projectId);
    if (!t) return { ok: true, thread: null };
    return { ok: true, thread: { threadId: t.id, messages: await threadMessages(t.id) } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function startBartThread(projectId: string): Promise<{ ok: true; threadId: string } | { ok: false; error: string }> {
  try {
    return { ok: true, threadId: (await createThread(projectId)).id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
