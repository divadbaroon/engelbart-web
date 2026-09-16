"use server";

import { extractText, getDocumentProxy } from "unpdf";
import { createClient } from "@/lib/supabase/server";
import {
  githubReposIn, MAX_PAPER_BYTES, PAPER_COLUMNS, PAPERS_BUCKET, paperStoragePath, parsePaperUrl, titleFromFilename, toPaper,
  type Paper, type PaperRow,
} from "@/lib/papers";

export type PaperResult = { ok: true; paper: Paper } | { ok: false; error: string };
type Outcome = { ok: true } | { ok: false; error: string };

// A PDF the browser has already put in the bucket at the paper's path.
// Recording it is a separate step because the upload goes straight from
// the browser to Storage, which keeps large files off the web server.
export async function recordPaper(projectId: string, paperId: string, filename: string, sizeBytes: number): Promise<PaperResult> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { ok: false, error: "You are not signed in." };

  const storagePath = paperStoragePath(projectId, paperId);
  const { data, error } = await supabase
    .from("engelbart_papers")
    .insert({ id: paperId, user_id: userId, project_id: projectId, title: titleFromFilename(filename), storage_path: storagePath, size_bytes: sizeBytes })
    .select(PAPER_COLUMNS)
    .single();
  if (error) {
    // Don't leave a file nobody can see.
    await supabase.storage.from(PAPERS_BUCKET).remove([storagePath]);
    return { ok: false, error: error.message };
  }
  return { ok: true, paper: toPaper(data as PaperRow) };
}

// A PDF fetched from a link on the server, then stored like an upload.
export async function addPaperFromUrl(projectId: string, input: string): Promise<PaperResult> {
  const url = parsePaperUrl(input);
  if (!url) return { ok: false, error: "Enter a link to a PDF, or drop a file here." };

  let bytes: ArrayBuffer;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "engelbart-web", Accept: "application/pdf" }, redirect: "follow" });
    if (!res.ok) return { ok: false, error: `The link answered ${res.status}.` };
    const type = res.headers.get("content-type") ?? "";
    bytes = await res.arrayBuffer();
    const isPdf = type.includes("application/pdf") || new Uint8Array(bytes.slice(0, 5)).every((b, i) => b === "%PDF-".charCodeAt(i));
    if (!isPdf) return { ok: false, error: "That link does not serve a PDF." };
    if (bytes.byteLength > MAX_PAPER_BYTES) return { ok: false, error: "That PDF is larger than 50 MB." };
  } catch {
    return { ok: false, error: "The link could not be fetched." };
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { ok: false, error: "You are not signed in." };

  const paperId = crypto.randomUUID();
  const storagePath = paperStoragePath(projectId, paperId);
  const upload = await supabase.storage.from(PAPERS_BUCKET).upload(storagePath, bytes, { contentType: "application/pdf" });
  if (upload.error) return { ok: false, error: upload.error.message };

  const filename = decodeURIComponent(url.pathname.split("/").pop() || "") || url.hostname;
  const { data, error } = await supabase
    .from("engelbart_papers")
    .insert({
      id: paperId, user_id: userId, project_id: projectId, title: titleFromFilename(filename),
      source_url: url.toString(), storage_path: storagePath, size_bytes: bytes.byteLength,
    })
    .select(PAPER_COLUMNS)
    .single();
  if (error) {
    await supabase.storage.from(PAPERS_BUCKET).remove([storagePath]);
    return { ok: false, error: error.message };
  }
  return { ok: true, paper: toPaper(data as PaperRow) };
}

export async function renamePaper(paperId: string, title: string): Promise<Outcome> {
  const trimmed = title.trim();
  if (!trimmed) return { ok: false, error: "A paper needs a title." };
  const supabase = await createClient();
  const { error } = await supabase.from("engelbart_papers").update({ title: trimmed }).eq("id", paperId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// The row first, then the file; a file without a row is invisible anyway.
export async function removePaper(paperId: string): Promise<Outcome> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("engelbart_papers").delete().eq("id", paperId).select("storage_path").maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (data) await supabase.storage.from(PAPERS_BUCKET).remove([(data as { storage_path: string }).storage_path]);
  return { ok: true };
}

// A link to the PDF that works for the next hour. Storage checks the
// caller may read the object, so this is as private as the row.
export async function paperViewUrl(paperId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("engelbart_papers").select("storage_path").eq("id", paperId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "That paper is no longer in the project." };
  const signed = await supabase.storage.from(PAPERS_BUCKET).createSignedUrl((data as { storage_path: string }).storage_path, 3600);
  if (signed.error || !signed.data) return { ok: false, error: signed.error?.message ?? "The file could not be opened." };
  return { ok: true, url: signed.data.signedUrl };
}

export type PaperAnalysis = { ok: true; repos: string[] } | { ok: false; error: string };

// Read the PDF once it is stored: keep its text for Bart, and find the
// GitHub repositories it links to. Links often live only in the PDF's
// link annotations, not in the visible text, so both are scanned.
export async function analyzePaper(paperId: string): Promise<PaperAnalysis> {
  const supabase = await createClient();
  const { data: row, error } = await supabase.from("engelbart_papers").select("storage_path").eq("id", paperId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: "That paper is no longer in the project." };

  const file = await supabase.storage.from(PAPERS_BUCKET).download((row as { storage_path: string }).storage_path);
  if (file.error || !file.data) return { ok: false, error: file.error?.message ?? "The PDF could not be read back." };

  try {
    const pdf = await getDocumentProxy(new Uint8Array(await file.data.arrayBuffer()));
    const { text } = await extractText(pdf, { mergePages: true });
    const linked: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      for (const a of await page.getAnnotations()) if (typeof a.url === "string") linked.push(a.url);
    }
    await supabase.from("engelbart_papers").update({ content: text, text_status: "done" }).eq("id", paperId);
    return { ok: true, repos: githubReposIn([text, ...linked]) };
  } catch (err) {
    await supabase.from("engelbart_papers").update({ text_status: "failed" }).eq("id", paperId);
    return { ok: false, error: `The PDF could not be read: ${err instanceof Error ? err.message : String(err)}` };
  }
}
