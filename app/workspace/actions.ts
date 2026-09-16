"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type CreateProjectResult = { ok: true; id: string } | { ok: false; error: string };

// Creates a project for the signed-in account. The table's id has no
// default because the CLI mints ids on the machine that owns the
// directory, so the web does the same; a project made here has no
// directory, and its path stays empty.
export async function createProject(name: string, description: string): Promise<CreateProjectResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Give the project a name." };
  if (trimmed.length > 120) return { ok: false, error: "Keep the name under 120 characters." };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { ok: false, error: "You are not signed in." };

  const id = crypto.randomUUID();
  const { error } = await supabase
    .from("hc_projects")
    .insert({ id, user_id: userId, name: trimmed, description: description.trim() });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/workspace");
  return { ok: true, id };
}
