// Bart's conversations in the database, read and written as the signed-in
// member: a thread per workspace for now, messages in order, each user
// message keeping what was in the middle when it was asked. Server only.
import { createClient } from "@/lib/supabase/server";
import type { BartMessage, MessageContext, Ref } from "@/lib/bart/protocol";

type MessageRow = { id: string; role: "user" | "assistant"; content: string; context: MessageContext | null; refs: Ref[] | null; model: string | null; created_at: string; seq: number };
const COLUMNS = "id, role, content, context, refs, model, created_at, seq";
const toMessage = (r: MessageRow): BartMessage => ({ id: r.id, role: r.role, content: r.content, refs: r.refs ?? [], context: r.context, model: r.model, createdAt: r.created_at });

export async function latestThread(projectId: string): Promise<{ id: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("engelbart_bart_threads").select("id").eq("project_id", projectId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(describe(error.message));
  return data ? { id: data.id as string } : null;
}

export async function threadInProject(threadId: string, projectId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from("engelbart_bart_threads").select("id").eq("id", threadId).eq("project_id", projectId).maybeSingle();
  return !!data;
}

export async function createThread(projectId: string): Promise<{ id: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("engelbart_bart_threads").insert({ project_id: projectId }).select("id").single();
  if (error) throw new Error(describe(error.message));
  return { id: data.id as string };
}

export async function threadMessages(threadId: string, last = 200): Promise<BartMessage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("engelbart_bart_messages").select(COLUMNS).eq("thread_id", threadId).order("seq", { ascending: false }).limit(last);
  if (error) throw new Error(describe(error.message));
  return (data as MessageRow[]).reverse().map(toMessage);
}

export type NewMessage = { role: "user" | "assistant"; content: string; context: MessageContext | null; refs: Ref[]; model: string | null };

// The next seq is read then written; the unique key catches a race, and
// one retry resolves it.
export async function appendMessage(threadId: string, msg: NewMessage): Promise<BartMessage> {
  const supabase = await createClient();
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: last } = await supabase.from("engelbart_bart_messages").select("seq").eq("thread_id", threadId).order("seq", { ascending: false }).limit(1).maybeSingle();
    const seq = ((last?.seq as number | undefined) ?? 0) + 1;
    const { data, error } = await supabase.from("engelbart_bart_messages").insert({ thread_id: threadId, seq, role: msg.role, content: msg.content, context: msg.context, refs: msg.refs, model: msg.model }).select(COLUMNS).single();
    if (!error) {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (seq === 1 && msg.role === "user") patch.title = msg.content.slice(0, 80);
      await supabase.from("engelbart_bart_threads").update(patch).eq("id", threadId);
      return toMessage(data as MessageRow);
    }
    if (!/duplicate key|unique/i.test(error.message) || attempt === 1) throw new Error(describe(error.message));
  }
  throw new Error("The message could not be saved.");
}

const describe = (message: string) =>
  /relation .* does not exist|schema cache/i.test(message) ? "Bart's tables are not in the database yet: apply the bart_threads migration." : message;
