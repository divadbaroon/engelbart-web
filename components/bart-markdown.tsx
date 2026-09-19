"use client";

import { memo } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { isRefHref, linkRefs, refFromHref, type Ref } from "@/lib/bart/protocol";

// An answer from Bart: its markdown, with each reference token rendered
// as a chip that opens the thing it names in the middle of the workspace.
export const BartMarkdown = memo(function BartMarkdown({ source, label, onRef }: { source: string; label: (ref: Ref) => string; onRef: (ref: Ref) => void }) {
  return (
    <div className="text-[14px] leading-[1.6] text-foreground [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => (isRefHref(url) ? url : defaultUrlTransform(url))}
        components={{
          h1: ({ children }) => <h2 className="mt-4 mb-2 text-[15px] font-semibold">{children}</h2>,
          h2: ({ children }) => <h2 className="mt-4 mb-2 text-[15px] font-semibold">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-3 mb-1.5 text-[14px] font-semibold">{children}</h3>,
          p: ({ children }) => <p className="mb-3 text-pretty">{children}</p>,
          a: ({ href, children }) => {
            if (isRefHref(href)) {
              const ref = refFromHref(href);
              return (
                <button
                  type="button"
                  onClick={() => ref && onRef(ref)}
                  title="Open in the workspace"
                  className="mx-0.5 inline-flex max-w-full items-baseline gap-1 rounded-md border bg-background px-1.5 py-px align-baseline text-[12px] leading-[1.5] text-foreground hover:border-foreground/40 hover:bg-muted/60"
                >
                  <span className="truncate">{children}</span>
                </button>
              );
            }
            return <a href={href} target="_blank" rel="noreferrer" className="text-[#0a7aff] underline decoration-[#0a7aff]/35 underline-offset-[3px] hover:decoration-[#0a7aff]">{children}</a>;
          },
          ul: ({ children }) => <ul className="mb-3 list-disc pl-5 [&>li]:my-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 list-decimal pl-5 [&>li]:my-0.5">{children}</ol>,
          blockquote: ({ children }) => <blockquote className="mb-3 border-l-[3px] py-0.5 pl-3 text-muted-foreground [&>p]:mb-0">{children}</blockquote>,
          pre: ({ children }) => <pre className="mb-3 overflow-x-auto rounded-lg border bg-[#f8f8f8] px-3 py-2.5 font-mono text-[12px] leading-[1.5] [&>code]:rounded-none [&>code]:bg-transparent [&>code]:p-0">{children}</pre>,
          code: ({ children }) => <code className="rounded bg-[#ececec] px-1 py-0.5 font-mono text-[12px]">{children}</code>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          table: ({ children }) => <div className="mb-3 overflow-x-auto rounded-lg border"><table className="w-full text-[13px] [&_td]:border-t [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold">{children}</table></div>,
        }}
      >
        {linkRefs(source, label)}
      </ReactMarkdown>
    </div>
  );
});
