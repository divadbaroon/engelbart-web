import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// README renderer. Renders the repository's real markdown; styles match Engelbart's restrained surfaces.
// Memoized: the workspace re-renders on every line of run output, and the README does not change with it.
export const Markdown = memo(function Markdown({ source }: { source: string }) {
  return (
    <article className="mx-auto max-w-[760px] px-10 pt-9 pb-12 text-[15px] leading-[1.65] text-neutral-800">
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
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-[#0a7aff] underline decoration-[#0a7aff]/35 underline-offset-[3px] hover:decoration-[#0a7aff]"
            >
              {children}
            </a>
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
