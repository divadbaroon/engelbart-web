"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronRight, File as FileIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Repo } from "@/lib/repos";
import type { SandboxRun } from "@/lib/sandbox";
import type { FileContent, FileTree, TreeEntry } from "@/lib/code-files";
import { Button } from "@/components/ui/button";
import { fetchFile, fetchTree } from "@/app/workspace/[workspaceId]/repo-actions";
import { listSandboxFiles, readSandboxFile, writeSandboxFile } from "@/app/workspace/[workspaceId]/sandbox-files";

const CodeEditor = dynamic(() => import("@/components/code-editor").then((m) => m.CodeEditor), {
  ssr: false,
  loading: () => <p className="p-4 text-[13px] text-muted-foreground">Loading editor…</p>,
});

// The repository's files: a tree on the left, the selected file in an
// editor on the right. While the application is running the files come
// from its sandbox and can be edited in place; the running dev server
// picks up saves. Otherwise they come from GitHub, read-only.
//
// Trees, files and what was open are kept per source for the session, so
// switching tabs and back costs nothing.
type Source = { kind: "github"; key: string } | { kind: "sandbox"; key: string; runId: string };
const trees = new Map<string, FileTree>();
const files = new Map<string, FileContent>();
const views = new Map<string, { selected: string | null; expanded: Set<string> }>();

const LIVE = ["cloned", "launching", "running"];
const sourceFor = (repo: Repo, run: SandboxRun | undefined): Source =>
  run?.sandboxId && LIVE.includes(run.status) ? { kind: "sandbox", key: `sb:${run.id}`, runId: run.id } : { kind: "github", key: `gh:${repo.id}` };

type Node = { name: string; path: string; type: "blob" | "tree"; children: Node[] };

// Paths come flat, and from the sandbox without directory entries; nest
// them, creating directories as needed, folders before files, by name.
function buildTree(entries: TreeEntry[]): Node[] {
  const root: Node = { name: "", path: "", type: "tree", children: [] };
  const byPath = new Map<string, Node>([["", root]]);
  const dir = (path: string): Node => {
    const found = byPath.get(path);
    if (found) return found;
    const parentPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    const node: Node = { name: path.slice(parentPath ? parentPath.length + 1 : 0), path, type: "tree", children: [] };
    dir(parentPath).children.push(node);
    byPath.set(path, node);
    return node;
  };
  for (const e of entries) {
    if (e.type === "tree") { dir(e.path); continue; }
    const parentPath = e.path.includes("/") ? e.path.slice(0, e.path.lastIndexOf("/")) : "";
    dir(parentPath).children.push({ name: e.path.slice(parentPath ? parentPath.length + 1 : 0), path: e.path, type: "blob", children: [] });
  }
  const sort = (nodes: Node[]) => {
    nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) : a.type === "tree" ? -1 : 1));
    nodes.forEach((n) => sort(n.children));
  };
  sort(root.children);
  return root.children;
}

type SaveState = { kind: "clean" } | { kind: "dirty" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

export function CodeBrowser({ repo, run, onSaved }: { repo: Repo; run: SandboxRun | undefined; onSaved?: () => void }) {
  const source = sourceFor(repo, run);
  const [tree, setTree] = useState<FileTree | undefined>(trees.get(source.key));
  const view = views.get(source.key) ?? { selected: null, expanded: new Set<string>() };
  const [selected, setSelected] = useState<string | null>(view.selected);
  const [expanded, setExpanded] = useState<Set<string>>(view.expanded);
  const [file, setFile] = useState<FileContent | undefined>(undefined);
  const [draft, setDraft] = useState("");
  const [save, setSave] = useState<SaveState>({ kind: "clean" });

  // A new source (the app came up, or went away): show its tree.
  useEffect(() => {
    const cached = trees.get(source.key);
    setTree(cached);
    const restored = views.get(source.key);
    setSelected(restored?.selected ?? null);
    setExpanded(restored?.expanded ?? new Set());
    if (cached) return;
    let stale = false;
    const load = source.kind === "sandbox" ? listSandboxFiles(source.runId) : fetchTree(repo.owner, repo.name, repo.defaultBranch);
    load.then((t) => { trees.set(source.key, t); if (!stale) setTree(t); });
    return () => { stale = true; };
  }, [source.key, source.kind, source.kind === "sandbox" ? source.runId : "", repo.owner, repo.name, repo.defaultBranch]); // eslint-disable-line react-hooks/exhaustive-deps

  // The selected file: from the cache, or fetched from the current source.
  useEffect(() => {
    views.set(source.key, { selected, expanded });
    if (!selected) { setFile(undefined); return; }
    const key = `${source.key}:${selected}`;
    const show = (f: FileContent) => { setFile(f); setDraft("text" in f ? f.text : ""); setSave({ kind: "clean" }); };
    const cached = files.get(key);
    if (cached) { show(cached); return; }
    setFile(undefined);
    let stale = false;
    const load = source.kind === "sandbox" ? readSandboxFile(source.runId, selected) : fetchFile(repo.owner, repo.name, repo.defaultBranch, selected);
    load.then((f) => { files.set(key, f); if (!stale) show(f); });
    return () => { stale = true; };
  }, [source.key, source.kind, source.kind === "sandbox" ? source.runId : "", selected, expanded, repo.owner, repo.name, repo.defaultBranch]); // eslint-disable-line react-hooks/exhaustive-deps

  const editable = source.kind === "sandbox";

  const onChange = useCallback((value: string) => {
    setDraft(value);
    setSave((s) => (s.kind === "saving" ? s : { kind: "dirty" }));
  }, []);

  const onSave = useCallback(async () => {
    if (!editable || !selected || source.kind !== "sandbox") return;
    const value = draft;
    setSave({ kind: "saving" });
    const result = await writeSandboxFile(source.runId, selected, value);
    if (!result.ok) { setSave({ kind: "error", message: result.error }); return; }
    files.set(`${source.key}:${selected}`, { text: value });
    setSave({ kind: "saved" });
    onSaved?.();
  }, [editable, selected, source, draft, onSaved]);

  const toggle = (path: string) =>
    setExpanded((prev) => { const next = new Set(prev); if (next.has(path)) next.delete(path); else next.add(path); return next; });

  const renderNodes = (nodes: Node[], depth: number) =>
    nodes.map((n) => (
      <li key={n.path}>
        <button
          type="button"
          onClick={() => (n.type === "tree" ? toggle(n.path) : setSelected(n.path))}
          title={n.path}
          className={cn(
            "flex w-full items-center gap-1.5 rounded-sm py-[3px] pr-2 text-left text-[13px] leading-tight hover:bg-neutral-100",
            n.type === "blob" && selected === n.path ? "bg-neutral-100 text-foreground" : "text-neutral-700",
          )}
          style={{ paddingLeft: 8 + depth * 14 }}
        >
          {n.type === "tree" ? (
            <ChevronRight className={cn("size-3 shrink-0 text-muted-foreground/70 transition-transform", expanded.has(n.path) && "rotate-90")} />
          ) : (
            <FileIcon className="size-3 shrink-0 text-muted-foreground/60" />
          )}
          <span className="truncate">{n.name}</span>
        </button>
        {n.type === "tree" && expanded.has(n.path) && <ul>{renderNodes(n.children, depth + 1)}</ul>}
      </li>
    ));

  return (
    <section aria-label="Code" className="flex h-full min-h-0">
      <nav aria-label="Files" className="flex w-[260px] shrink-0 flex-col border-r">
        <div className="flex h-9 shrink-0 items-center border-b px-3 text-xs text-muted-foreground">
          {editable ? "Sandbox · edits go live" : "GitHub · read-only"}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-2 pr-1">
          {tree === undefined ? (
            <p className="px-3 py-1 text-[13px] text-muted-foreground">Loading files…</p>
          ) : "error" in tree ? (
            <p className="px-3 py-1 text-[13px] text-destructive">{tree.error}</p>
          ) : (
            <>
              <ul>{renderNodes(buildTree(tree.entries), 0)}</ul>
              {tree.truncated && <p className="px-3 pt-2 text-xs text-muted-foreground">GitHub returned only part of this tree.</p>}
            </>
          )}
        </div>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        {selected ? (
          <>
            <div className="flex h-9 shrink-0 items-center gap-3 border-b px-4 font-mono text-xs text-muted-foreground">
              <span className="truncate" title={selected}>{selected}</span>
              <span role="status" className={cn("ml-auto shrink-0 font-sans", save.kind === "error" && "text-destructive")}>
                {save.kind === "saving" ? "Saving…" : save.kind === "saved" ? "Saved" : save.kind === "error" ? save.message : save.kind === "dirty" ? "Unsaved changes" : ""}
              </span>
              {editable && file && "text" in file ? (
                <Button variant="outline" size="sm" onClick={onSave} disabled={save.kind !== "dirty" && save.kind !== "error"} className="h-6 shrink-0 px-2 font-sans font-normal">
                  Save
                </Button>
              ) : (
                <a href={`${repo.url}/blob/${repo.defaultBranch || "HEAD"}/${selected}`} target="_blank" rel="noreferrer" className="shrink-0 hover:text-foreground">
                  Open on GitHub
                </a>
              )}
            </div>
            {file === undefined ? (
              <p className="p-4 text-[13px] text-muted-foreground">Loading…</p>
            ) : "error" in file ? (
              <p className="p-4 text-[13px] text-destructive">{file.error}</p>
            ) : "binary" in file ? (
              <p className="p-4 text-[13px] text-muted-foreground">This is a binary file.</p>
            ) : "tooLarge" in file ? (
              <p className="p-4 text-[13px] text-muted-foreground">This file is larger than 10 MB.</p>
            ) : (
              <CodeEditor key={`${source.key}:${selected}`} path={selected} value={draft} editable={editable} onChange={onChange} onSave={onSave} />
            )}
          </>
        ) : (
          <p className="flex h-full items-center justify-center px-8 text-center text-[13px] text-muted-foreground">
            {editable ? "Select a file to read or edit it." : "Select a file to read it. Files can be edited once the application is running."}
          </p>
        )}
      </div>
    </section>
  );
}
