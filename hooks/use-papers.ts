"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MAX_PAPER_BYTES, PAPERS_BUCKET, paperStoragePath, titleFromFilename, type Paper } from "@/lib/papers";
import { addPaperFromUrl, analyzePaper, paperViewUrl, recordPaper, removePaper, renamePaper } from "@/app/workspace/[workspaceId]/paper-actions";

// A file on its way in: shown in the list while it uploads.
export type PendingPaper = { id: string; title: string; status: "uploading" | "fetching" | "error"; error?: string };

// Repositories a paper links to, waiting for the reader to say which to add.
export type RepoSuggestion = { paperId: string; paperTitle: string; repos: string[] };

// The project's papers, with uploads that go straight from the browser to
// Storage. The row is recorded once the file is there, so the list only
// ever shows papers whose PDF exists.
export function usePapers(projectId: string, initial: Paper[]) {
  const [papers, setPapers] = useState(initial);
  const [pending, setPending] = useState<PendingPaper[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = useState<RepoSuggestion[]>([]);
  const [analyzing, setAnalyzing] = useState<Set<string>>(new Set());   // papers being read right now

  // Once a paper is in, read it: its text is kept, and any repositories it
  // links to are offered. Runs in the background; nothing waits on it.
  const analyze = (paper: Paper) => {
    setAnalyzing((all) => new Set(all).add(paper.id));
    void analyzePaper(paper.id)
      .then((result) => {
        if (result.ok && result.repos.length) setSuggestions((all) => [...all, { paperId: paper.id, paperTitle: paper.title, repos: result.repos }]);
      })
      .finally(() => setAnalyzing((all) => { const next = new Set(all); next.delete(paper.id); return next; }));
  };

  const setPending1 = (id: string, patch: Partial<PendingPaper>) =>
    setPending((all) => all.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const dropPending = (id: string) => setPending((all) => all.filter((p) => p.id !== id));

  const upload = useCallback(async (files: File[]) => {
    const supabase = createClient();
    await Promise.all(files.map(async (file) => {
      const id = crypto.randomUUID();
      const title = titleFromFilename(file.name);
      setPending((all) => [...all, { id, title, status: "uploading" }]);
      if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) { setPending1(id, { status: "error", error: "Only PDF files can be added." }); return; }
      if (file.size > MAX_PAPER_BYTES) { setPending1(id, { status: "error", error: "This file is larger than 50 MB." }); return; }
      const { error } = await supabase.storage.from(PAPERS_BUCKET).upload(paperStoragePath(projectId, id), file, { contentType: "application/pdf" });
      if (error) { setPending1(id, { status: "error", error: error.message }); return; }
      const result = await recordPaper(projectId, id, file.name, file.size);
      if (!result.ok) { setPending1(id, { status: "error", error: result.error }); return; }
      dropPending(id);
      setPapers((all) => [...all, result.paper]);
      analyze(result.paper);
    }));
  }, [projectId]);

  const addFromUrl = useCallback(async (input: string): Promise<boolean> => {
    const id = crypto.randomUUID();
    setPending((all) => [...all, { id, title: input.trim(), status: "fetching" }]);
    const result = await addPaperFromUrl(projectId, input);
    if (!result.ok) { setPending1(id, { status: "error", error: result.error }); return false; }
    dropPending(id);
    setPapers((all) => [...all, result.paper]);
    analyze(result.paper);
    return true;
  }, [projectId]);

  const rename = useCallback(async (id: string, title: string) => {
    const previous = papers.find((p) => p.id === id)?.title;
    setPapers((all) => all.map((p) => (p.id === id ? { ...p, title: title.trim() || p.title } : p)));
    const result = await renamePaper(id, title);
    if (!result.ok && previous !== undefined) setPapers((all) => all.map((p) => (p.id === id ? { ...p, title: previous } : p)));
    return result;
  }, [papers]);

  const remove = useCallback(async (id: string) => {
    const result = await removePaper(id);
    if (result.ok) {
      setPapers((all) => all.filter((p) => p.id !== id));
      setUrls((all) => Object.fromEntries(Object.entries(all).filter(([k]) => k !== id)));
    }
    return result;
  }, []);

  // A signed link for the viewer, fetched the first time a paper is opened.
  const view = useCallback(async (id: string) => {
    if (urls[id]) return;
    const result = await paperViewUrl(id);
    if (result.ok) setUrls((all) => ({ ...all, [id]: result.url }));
  }, [urls]);

  const dismissSuggestion = useCallback((paperId: string) => setSuggestions((all) => all.filter((s) => s.paperId !== paperId)), []);

  return { papers, pending, urls, suggestions, analyzing, upload, addFromUrl, rename, remove, view, dismiss: dropPending, dismissSuggestion };
}
