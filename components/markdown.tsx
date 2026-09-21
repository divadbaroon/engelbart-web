import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Where a README's relative paths point.
//
// The README arrives as raw markdown from GitHub (`fetchReadme`), so its
// links are written relative to the repository and nothing on the way
// here rewrites them. `![](study_material/image.png)` therefore became
// `<img src="study_material/image.png">` on *this* origin, which is a
// 404 and a broken-image box — which is why ROPE's illustration never
// appeared. GitHub does this same rewrite when it renders a README; the
// only reason to do it here is that we are rendering one too.
//
// Left alone: anything already absolute, a data: URI, and an anchor. A
// github.com blob URL is turned into its raw form, because a blob URL in
// an <img> serves an HTML page, not the picture.
const RAW = "https://raw.githubusercontent.com";

function resolve(url: string | undefined, at: Where, kind: "img" | "a"): string | undefined {
  if (!url || !at.owner || !at.name) return url;
  const branch = at.branch || "HEAD";
  const blob = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/);
  if (kind === "img" && blob) return `${RAW}/${blob[1]}/${blob[2]}/${blob[3]}`;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//") || url.startsWith("#")) return url;
  const path = url.replace(/^\.\//, "").replace(/^\//, "");
  return kind === "img"
    ? `${RAW}/${at.owner}/${at.name}/${branch}/${path}`
    : `https://github.com/${at.owner}/${at.name}/blob/${branch}/${path}`;
}

// Which repository the markdown was written in, when it was written in
// one. Three strings rather than the `Repo` itself, because this
// component is memoized against a workspace that re-renders on every
// line of run output and an object literal would defeat that; and all
// three are optional because the other thing rendered through here —
// the setup agent's NEXT.md — has no repository behind it and no
// relative paths to resolve.
type Where = { owner?: string; name?: string; branch?: string };

// README renderer. Renders the repository's real markdown; styles match Engelbart's restrained surfaces.
// Memoized: the workspace re-renders on every line of run output, and the README does not change with it.
export const Markdown = memo(function Markdown({ source, owner, name, branch }: { source: string } & Where) {
  const at: Where = { owner, name, branch };
  return (
    // pt-6 rather than pt-9: the pane is a document under a tab bar that
    // already sets it apart, and the extra 12px read as the page not
    // having started yet.
    <article className="mx-auto max-w-[760px] px-10 pt-6 pb-12 text-[15px] leading-[1.65] text-neutral-800">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-5 border-b pb-3 text-[28px] leading-tight font-semibold tracking-tight text-pretty text-foreground">{children}</h1>
          ),
          h2: ({ children }) => <h2 className="mt-8 mb-3 text-xl leading-snug font-semibold text-foreground">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-6 mb-2 text-base font-semibold text-foreground">{children}</h3>,
          p: ({ children }) => <p className="mb-3.5 text-pretty">{children}</p>,
          a: ({ href, children }) => (
            <a
              href={resolve(href, at, "a")}
              target="_blank"
              rel="noreferrer"
              className="text-[#0a7aff] underline decoration-[#0a7aff]/35 underline-offset-[3px] hover:decoration-[#0a7aff]"
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) => (
            // A plain <img>: the source is a GitHub URL settled at render
            // time, not something next/image can be given a loader for.
            // Held to the column's width, because a README banner is
            // often twice it.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resolve(typeof src === "string" ? src : undefined, at, "img")}
              alt={alt ?? ""}
              loading="lazy"
              className="mb-4 h-auto max-w-full rounded"
            />
          ),
          ul: ({ children }) => <ul className="mb-3.5 list-disc pl-6 [&>li]:my-1">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3.5 list-decimal pl-6 [&>li]:my-1">{children}</ol>,
          blockquote: ({ children }) => (
            <blockquote className="mb-4 border-l-[3px] py-0.5 pl-3.5 text-muted-foreground [&>p]:mb-0">{children}</blockquote>
          ),
          pre: ({ children }) => (
            <pre className="mb-4 overflow-x-auto rounded-lg border bg-[#f8f8f8] px-4 py-3.5 font-mono text-[13px] leading-[1.55] text-foreground [&>code]:rounded-none [&>code]:bg-transparent [&>code]:p-0">
              {children}
            </pre>
          ),
          code: ({ children }) => (
            <code className="rounded bg-[#f2f2f2] px-1.5 py-0.5 font-mono text-[13px] text-foreground">{children}</code>
          ),
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          hr: () => <hr className="my-6" />,
          table: ({ children }) => (
            <div className="mb-4 overflow-x-auto rounded-lg border">
              <table className="w-full text-sm [&_td]:border-t [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold">{children}</table>
            </div>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </article>
  );
});
