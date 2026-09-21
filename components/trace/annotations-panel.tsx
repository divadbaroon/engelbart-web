"use client";

import type { Annotations } from "@/hooks/use-annotations";
import type { SemanticIndex } from "@/lib/semantics/lookup";
import { AnnotationsList } from "@/components/trace/annotations-list";

// The notes written on the running interface, as a tool of its own.
//
// They were reachable from one button in the Live preview's toolbar,
// which opened a popover over the page the notes are about. That is the
// wrong shape twice: a list you have to hold a menu open to read is a
// list you read one line of, and it put the notes inside the surface
// they annotate, so reading them and looking at anything else were
// mutually exclusive. Beside the other companion tools they can be read
// while the preview runs, and each one still takes you back to the
// element it is on.
//
// Unlike its three neighbours this is not a reading of a run. The
// Visualizer, Replay and Activity all describe one session and go blank
// without a traced one; a note belongs to the repository, survives the
// sandbox it was written in, and is worth reading when nothing is
// running at all. So there is no run guard here and no banner: the run
// this tab does not depend on is not worth a line saying so.
//
// It is not scoped to an open recording either, where the other three
// are. A note is not an event in a session — it was written about an
// element, and the element is still there in the next run. Cutting the
// list to a recording's minutes would hide notes that are still true.
type Props = {
  annotations: Annotations;
  semantics: SemanticIndex;          // what the annotated element is, in the artifact's own words
  onOpen: (id: string) => void;      // to the Live preview, at the element it is on
  onAskBart: (id: string) => void;
};

export function AnnotationsPanel({ annotations, semantics, onOpen, onAskBart }: Props) {
  return (
    <section aria-label="Annotations" className="flex h-full min-h-0 flex-col">
      {/* The list draws its own three states — loading, failed, empty —
          and each of them centres itself, so the scroller is given a
          definite height to centre against rather than growing to fit. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <AnnotationsList
          annotations={annotations.list}
          viewerId={annotations.viewerId}
          loaded={annotations.loaded}
          error={annotations.error}
          semantics={semantics}
          onOpen={onOpen}
          onAskBart={onAskBart}
          onRemove={(id) => void annotations.remove(id)}
          onDismissError={annotations.dismissError}
        />
      </div>
    </section>
  );
}
