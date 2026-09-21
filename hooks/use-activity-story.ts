"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { storyKey, storyOf, type Story } from "@/lib/activity/story";
import type { Taxonomy } from "@/lib/activity/taxonomy";
import type { Episode } from "@/lib/activity/types";
import { summariseActivity } from "@/app/workspace/[workspaceId]/activity-actions";

// What this session has been summarised as, and the asking of it.
//
// Asked once when the Activity view is opened, and not again while it
// stays open. That is the whole policy, and it is the policy because the
// alternative is a model call every time a live run records anything:
// episodes change shape as events arrive, and a summary that chased them
// would cost a call a second and say the same thing each time.
//
// A timeline that grows while somebody is reading keeps the summary it
// was given. It goes stale in the only direction that is safe — it stops
// mentioning the newest thing, rather than starting to describe
// something that did not happen — and the rows underneath are live
// regardless. Closing the view and opening it again is how a reader asks
// for one that covers the rest, which is a thing they can see themselves
// doing.
//
// The cache outlives the component because the component does not
// outlive a tab switch. Keyed on the whole of what the story was made
// from rather than on the short hash of it, so two sessions can never
// share an entry however the hash happens to fall.
const told = new Map<string, string>();
const refused = new Set<string>();
const inflight = new Set<string>();

export type SessionStory = {
  // The paragraph, or nothing at all. There is no third state a reader
  // should see: a session that could not be summarised shows no summary.
  summary: string | null;
  busy: boolean;
  // Which reading this is, short enough to show a person. For the
  // timeline's own export and for telling two runs apart.
  key: string | null;
  story: Story;
};

export function useActivityStory(episodes: Episode[], taxonomy: Taxonomy): SessionStory {
  const story = useMemo(() => storyOf(episodes, taxonomy), [episodes, taxonomy]);
  const id = useMemo(() => storyKey(story), [story]);
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Once per opening of the view. Not once per change of the timeline.
  const asked = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    if (asked.current || !story.episodes.length) return;
    const canonical = id.canonical;

    const known = told.get(canonical);
    if (known !== undefined) { asked.current = true; setSummary(known); return; }
    // Something that failed once in this session failed for a reason
    // that will not have changed by the next render.
    if (refused.has(canonical) || inflight.has(canonical)) { asked.current = true; return; }

    asked.current = true;
    inflight.add(canonical);
    setBusy(true);
    void summariseActivity({ story }).then((r) => {
      inflight.delete(canonical);
      if (r.ok) told.set(canonical, r.summary); else refused.add(canonical);
      if (!alive.current) return;
      setBusy(false);
      if (r.ok) setSummary(r.summary);
    });
  }, [story, id.canonical]);

  return { summary, busy, key: id.key, story };
}
