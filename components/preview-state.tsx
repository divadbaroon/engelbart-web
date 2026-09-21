"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// What a pane says when there is nothing in it to show.
//
// One component for every such moment rather than the same centred
// column written out at each branch: a cube, a line saying where you
// are, a sentence or two saying why the pane is empty, and the buttons
// that make it not empty. The branches supply the words; none of them
// owns the layout.
//
// The cube is a picture of the sandbox, and it is decorative in the
// strict sense: `alt=""`, so a screen reader reads the title and the
// description and nothing is lost. The state is in the words.
//
// `image` is a path rather than a variant name, so this component never
// learns what a state is. The family it is given lives in `CUBES`
// below; all six are cut from the same approved sheet
// (public/sandbox_icon_sheet.png) and none of them is invented.
export type PreviewAction = {
  label: string;
  onClick: () => void;
  primary?: boolean;     // the one thing to do here; the rest are quiet
  icon?: ReactNode;      // the glyph the approved sheet puts on it
};

type Props = {
  image?: string | null;
  title: string;
  description?: ReactNode;
  actions?: (PreviewAction | null | false | undefined)[];
  children?: ReactNode; // anything that hangs under the actions
  className?: string;
};

// The drawn height of the cube's 200px canvas. The cube itself is about
// 160px of that, so this puts a cube around 102px tall on the pane: the
// first thing you see, and still a long way short of the size at which a
// drawing starts selling something. Tuned against the approved sheet
// (public/sandbox_icon_sheet.png) rather than picked.
const CUBE = 128;

// The sandbox, with a face for what it is doing. One map so that the
// panes that draw them cannot drift to different files, and so that
// swapping the raster set for an SVG family later is one edit.
//
// Each is the cube the approved sheet draws over that state's own
// wording, in the sheet's own order: smiling for a sandbox with nothing
// wrong with it, winking with sparks while it comes up, surprised when
// it did not, eyes closed when it has been stopped, and frowning when
// there is nothing there to reach.
//
// `starting` is the sheet's own cut with the three sparks taken off its
// corner. The face is untouched — they sat clear of the cube, x 170-198
// on a 200px canvas with five blank columns between, so erasing them is
// a deletion and not a redrawing. On a pane whose whole job is to say
// "wait", three marks were doing what the word under them already does.
//
// Seven names, six drawings. `crashed` is the frowning cube under a
// second name, because two of the states are the same disappointment
// from different directions and the sheet has one face for it: a
// repository that would not prepare is a surprise, and a run that came
// up and then went away is a let-down. Named rather than reached for as
// `unavailable`, so the branch that draws it still says what it means.
export const CUBES = {
  idle: "/sandbox_icon.png",
  running: "/sandbox_icon_running.png",
  starting: "/sandbox_icon_starting.png",
  failed: "/sandbox_icon_failed.png",
  stopped: "/sandbox_icon_stopped.png",
  unavailable: "/sandbox_icon_unavailable.png",
  crashed: "/sandbox_icon_unavailable.png",
} as const;

// The one the two "nothing has gone wrong yet" panes draw.
export const SANDBOX_CUBE = CUBES.idle;

export function PreviewState({ image, title, description, actions, children, className }: Props) {
  const shown = (actions ?? []).filter((a): a is PreviewAction => !!a);
  return (
    // Two spacers rather than `justify-center` and a bottom padding.
    // The block sits one part down and three parts up, so it lands about
    // a quarter of the way into the pane however tall the pane is — a
    // fixed offset barely lifts it in a tall column and crowds it in a
    // short one. The spacers also give up their space before the content
    // does, so nothing is ever scrolled off the top.
    <section
      aria-label="Live preview"
      className={cn("flex h-full flex-col items-center overflow-y-auto px-6 py-6 text-center", className)}
    >
      <span aria-hidden className="min-h-0 flex-1 shrink" />
      {/* No spinner branch beside this one. There was one, for a state
          with no picture of its own; every state has its cube now, and a
          branch that cannot be reached is a claim the code makes and the
          screen never keeps. A run that is coming up says so in the
          starting cube and in the step named under the title. */}
      {image && (
        <Image
          src={image}
          alt=""
          width={200}
          height={200}
          priority={false}
          className="mb-2.5 w-auto shrink-0"
          style={{ height: CUBE }}
        />
      )}

      <h2 className="text-base leading-tight font-semibold tracking-tight text-foreground">{title}</h2>
      {description && (
        <p className="mt-1 max-w-[340px] text-[13px] leading-[1.5] text-pretty text-muted-foreground">{description}</p>
      )}

      {shown.length > 0 && (
        <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
          {shown.map((a) => (
            <Button
              key={a.label}
              variant={a.primary ? "default" : "outline"}
              size="sm"
              onClick={a.onClick}
              className={cn("gap-1.5 font-normal", !a.primary && "text-muted-foreground")}
            >
              {a.icon}
              {a.label}
            </Button>
          ))}
        </div>
      )}

      {children}
      <span aria-hidden className="min-h-0 flex-[3] shrink" />
    </section>
  );
}
