// A paper attached to a project. The PDF is an object in the
// engelbart-papers bucket; the row in engelbart_papers describes it. Kept
// free of React and of Supabase so the desktop app can share it.

export const PAPERS_BUCKET = "engelbart-papers";
export const MAX_PAPER_BYTES = 50 * 1024 * 1024;   // matches the bucket's limit

export type Paper = {
  id: string;
  title: string;
  authors: string;
  year: number | null;
  sourceUrl: string;
  storagePath: string;
  sizeBytes: number;
  createdAt: string;
};

export type PaperRow = {
  id: string;
  title: string;
  authors: string;
  year: number | null;
  source_url: string;
  storage_path: string;
  size_bytes: number;
  created_at: string;
};

export const PAPER_COLUMNS = "id, title, authors, year, source_url, storage_path, size_bytes, created_at";

export function toPaper(row: PaperRow): Paper {
  return {
    id: row.id, title: row.title, authors: row.authors, year: row.year, sourceUrl: row.source_url,
    storagePath: row.storage_path, sizeBytes: row.size_bytes, createdAt: row.created_at,
  };
}

// Where a project's paper is stored. The first folder is the project id,
// which the storage policies read to decide who may see the file.
export const paperStoragePath = (projectId: string, paperId: string) => `${projectId}/${paperId}.pdf`;

// The second line under a paper's title: authors and year when known,
// otherwise the file's size.
export function paperMeta(paper: Paper): string {
  const parts = [paper.authors, paper.year ? String(paper.year) : ""].filter(Boolean);
  return parts.length ? parts.join(" · ") : formatBytes(paper.sizeBytes);
}

export function formatBytes(n: number): string {
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

// A readable title from a file name: drop the extension, turn separators
// into spaces. "attention_is_all_you_need.pdf" → "attention is all you need".
export function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.pdf$/i, "").replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
  return base || "Untitled paper";
}

// Whether the text looks like something we can fetch a PDF from.
export function parsePaperUrl(input: string): URL | null {
  const text = input.trim();
  if (!text) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    // arXiv abstract pages have a PDF twin.
    if (url.hostname === "arxiv.org" && url.pathname.startsWith("/abs/")) url.pathname = url.pathname.replace("/abs/", "/pdf/");
    return url;
  } catch {
    return null;
  }
}

export const paperTabValue = (id: string) => `paper:${id}`;
export const isPaperTab = (tab: string) => tab.startsWith("paper:");
