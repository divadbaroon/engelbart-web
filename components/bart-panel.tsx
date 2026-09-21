"use client";

import { Button } from "@/components/ui/button";
import type { Repo } from "@/lib/repos";
import type { SelectionText } from "@/lib/trace/selection";
import type { MessageContext, Ref } from "@/lib/bart/protocol";
import type { BartSession } from "@/hooks/use-bart-session";
import { BartConversation } from "@/components/bart/conversation";
import { BartComposer } from "@/components/bart/composer";

// Bart in the right panel, where it is the first of five fixed tabs,
// beside the Visualizer, Replay, Annotations and Activity
// (lib/workspace-slots): the conversation
// about the work, at full size. It is
// told which repository and run are open and which moment of the trace is
// selected, so "this" in a question means that moment; the selection is a
// referent, never a constraint. Answers cite the trace, the captured
// calls and the source as chips that open them in the middle. The thread
// lives in the workspace, so it survives a refresh, and the same thread
// is what the small window over the trace canvas writes into. The panel
// names itself through its tab, so only Clear sits above the messages.
export type BartPanelProps = {
  session: BartSession;
  context: MessageContext;              // what a question asked here is about
  repo: Repo | null;
  selectionText: SelectionText | null;
  recording: { id: string; name: string } | null;   // open in the Visualizer: Bart's trace questions read inside it
  onClearSelection: () => void;
  onOpenRef: (ref: Ref) => void;        // a reference in an answer, opened in the middle
  labelRef: (ref: Ref) => string;       // what a reference chip says
};

export function BartPanel({ session, context, repo, selectionText, recording, onClearSelection, onOpenRef, labelRef }: BartPanelProps) {
  const empty = session.messages.length === 0 && !session.pending;
  // One line when nothing is selected. It used to name what you could
  // ask about — the run, its model calls, the code — which is a list of
  // the things Bart happens to be able to reach, and reading it before
  // asking a question is work the question does not need. With a moment
  // selected the line still says so, because that is the one thing about
  // the box you cannot otherwise see.
  const placeholder = selectionText ? "Ask about this moment, or anything else..." : "Ask Bart about anything...";
  return (
    <section aria-label="Bart" className="flex h-full min-w-0 flex-col bg-[#f6f6f6] px-5 pt-2 pb-3">
      <div className="flex h-7 shrink-0 items-center justify-end">
        {/* And not while the thread is still being read: an empty
            header that grows a Clear a moment later is the same flash
            the conversation below stopped having. */}
        {session.loaded && !empty && (
          <Button variant="ghost" size="sm" onClick={() => void session.reset()} className="h-7 px-1.5 text-xs font-normal text-muted-foreground/70 hover:text-muted-foreground">Clear</Button>
        )}
      </div>

      <BartConversation session={session} repo={repo} labelRef={labelRef} onOpenRef={onOpenRef} />

      <BartComposer
        session={session}
        context={context}
        surface="tab"
        placeholder={placeholder}
        selectionText={selectionText}
        recording={recording}
        onClearSelection={onClearSelection}
      />
    </section>
  );
}
