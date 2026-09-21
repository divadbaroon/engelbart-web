"use client";

import { useMemo, useRef, useState } from "react";
import { Check, ChevronRight, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TraceView } from "@/hooks/use-trace-view";
import { DEFAULT_SEGMENTATION } from "@/lib/activity/segment";
import { activityExport, activityJson, exportEpisode, type ExportedEvent } from "@/lib/activity/export";
import { confidenceWord, type Taxonomy } from "@/lib/activity/taxonomy";
import { BROAD_MEANING, type Episode } from "@/lib/activity/types";
import { formatClock } from "@/lib/trace/timeline";
import { useActivityStory } from "@/hooks/use-activity-story";

// What a person did, in order, one line each.
//
// This is not the canvas with the edges taken off. The canvas answers
// "what happened", moment by moment, and is the place to go when a model
// call has to be taken apart. This answers "what were they doing", and a
// researcher should be able to learn the shape of a session by running
// their eye down it without opening anything. So the row carries a time,
// a class, a sentence and a length, and everything else — the ROPE
// sub-behaviour, the confidence, the evidence it was read from, the exact
// clock, the message, the model call, the way back into the trace —
// waits behind a click.
//
// Nothing here decides anything. The episodes come from lib/activity,
// which is pure and tested against a recorded session; this file draws
// them.

type Props = {
  trace: TraceView;
  // The reading of the session, classified once by whoever owns this
  // surface and shared with the canvas. This view draws it over the
  // clock; the canvas draws the same episodes beside what the software
  // did. Neither classifies anything itself.
  episodes: Episode[];
  // Into the canvas, at the moment this episode was read from — and at
  // the episode itself, so the canvas rings the behaviour that was
  // chosen rather than the first one its stage happens to back.
  onOpenMoment: (stageId: string, episodeId: string) => void;
};

export function ActivityTimeline({ trace, episodes, onOpenMoment }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  // Asked once, when this view is opened, from the episodes above and
  // never from the trace. It costs one small model call per distinct
  // timeline and nothing at all when the timeline has not changed.
  const session = useActivityStory(episodes, trace.reading.taxonomy);
  // What this artifact's own channels are called, from the profile the
  // session was read with. Above the early returns because it is a hook.
  const says = useMemo(() => saysOf(trace.reading.taxonomy), [trace.reading.taxonomy]);

  if (trace.loading && !episodes.length) return <p className="p-8 text-center text-[13px] text-muted-foreground">Reading the trace…</p>;
  if (!episodes.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 p-8 text-center">
        <p className="text-[13px] font-medium">Nothing to read yet</p>
        <p className="max-w-[420px] text-[13px] leading-5 text-muted-foreground">
          Use the application in the Live preview. What somebody does there is grouped into episodes here, each one a stretch of one activity.
        </p>
      </div>
    );
  }

  const start = Date.parse(episodes[0].startedAt);
  // Built when somebody asks for it, not on every render: it carries
  // every raw event of the session and there is no reason to hold a
  // second copy of the trace in memory until the button is pressed.
  const whole = () => activityJson(activityExport({
    episodes,
    profile: trace.reading.stamp,
    segmentation: DEFAULT_SEGMENTATION,
    runId: trace.run?.id ?? null,
  }));
  return (
    <div className="mx-auto w-full max-w-[760px] px-6 py-5">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <SectionTitle>Timeline</SectionTitle>
        <CopyJson text={whole} label="Copy JSON" title="The whole timeline: every episode, the evidence it was read from, and the raw events under it" />
      </div>
      {/* Whose words these rows are in. It is one quiet line and it is
          always there, because the alternative — saying nothing — is how
          a reading written for one artifact came to be printed over
          another's session with nothing to mark it. */}
      <p className="mb-2 text-[11px] leading-4 text-muted-foreground">{trace.reading.detail}</p>
      <ol aria-label="Activity timeline" className="flex flex-col">
        {episodes.map((e) => (
          <Row key={e.id} episode={e} start={start} says={says} open={open === e.id} onToggle={() => setOpen(open === e.id ? null : e.id)} onOpenMoment={onOpenMoment} />
        ))}
      </ol>
      {/* What the session was, in a sentence or three, under the rows it
          was read from. It sits here rather than above them because it is
          the conclusion and they are the evidence: a reader runs down the
          timeline and then finds it summarised, rather than being told
          the answer and asked to check it.

          Read from those episodes and from nothing else, and shown only
          when it survived checking — a session that cannot be summarised
          has no line here at all. */}
      {(session.summary || session.busy) && (
        <section className="mt-5 border-t pt-3">
          <SectionTitle>Interpretation</SectionTitle>
          <p
            aria-live="polite"
            className={cn("mt-1.5 max-w-[68ch] text-[13px] leading-6", session.summary ? "text-foreground/85" : "text-muted-foreground")}
          >
            {session.summary ?? "Reading the session…"}
          </p>
        </section>
      )}
    </div>
  );
}

// What each half of this view is, in the quietest type the app has. A
// label rather than a headline: the rows and the paragraph are the
// content, and a heading that competed with them would make this look
// like a report when it is a reading.
const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</h3>
);

// An episode that says nothing about a person is drawn as saying nothing
// about them: no rule, grey, and out of the way of the eye running down
// the column.
const dim = (e: Episode) => e.broadBehavior === "UNCLEAR";

function Row({ episode: e, start, says, open, onToggle, onOpenMoment }: { episode: Episode; start: number; says: Map<string, string>; open: boolean; onToggle: () => void; onOpenMoment: (stageId: string, episodeId: string) => void }) {
  return (
    <li className={cn("border-l-2 pl-3", dim(e) ? "border-transparent" : "border-foreground/15")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-baseline gap-3 rounded-sm py-1.5 text-left text-[13px] leading-5 hover:bg-muted/50"
      >
        <span className="w-[42px] shrink-0 font-mono text-[11px] text-muted-foreground">{offset(Date.parse(e.startedAt) - start)}</span>
        <span className={cn("w-[96px] shrink-0 text-[10px] font-semibold uppercase tracking-wide", dim(e) ? "text-muted-foreground/70" : "text-muted-foreground")}>{e.broadBehavior}</span>
        <span className={cn("min-w-0 flex-1 truncate", dim(e) && "text-muted-foreground")}>{e.description}</span>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{elapsed(e.durationMs)}</span>
      </button>
      {open && <Detail episode={e} says={says} onOpenMoment={onOpenMoment} />}
    </li>
  );
}

// What the interface said, in its own words, named the way the taxonomy
// names it. The person's own channel is left out: what they sent is
// already shown as what they sent, and printing it twice under two
// labels reads as two different things having happened.
//
// Built from the taxonomy this session was read with, never from a
// constant: the labels belong to the artifact, not to this component.
const saysOf = (taxonomy: Taxonomy) =>
  new Map(taxonomy.channels.filter((c) => c.from === "system").map((c) => [c.id, c.label]));

function Detail({ episode: e, says, onOpenMoment }: { episode: Episode; says: Map<string, string>; onOpenMoment: (stageId: string, episodeId: string) => void }) {
  const v = e.evidence;
  const exported = useMemo(() => exportEpisode(e), [e]);
  const heard = v.appeared.filter((a) => a.fresh && a.channel && says.has(a.channel));
  return (
    <div className="mb-2 ml-[42px] flex flex-col gap-2.5 rounded-md border bg-[#fbfbfb] px-3.5 py-3 text-[12px] leading-[1.6]">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-muted-foreground">
          <span className="font-medium text-foreground">{e.subBehavior}</span> · {confidenceWord(e.confidence)} · {BROAD_MEANING[e.broadBehavior]}
        </p>
        <CopyJson text={() => activityJson(exported)} label="Copy" title="This episode, its evidence and its raw events, as JSON" />
      </div>
      <p><span className="text-muted-foreground">Read as this because </span>{e.because}.</p>

      <Facts>
        <Fact label="From">{formatClock(e.startedAt)}</Fact>
        <Fact label="To">{formatClock(e.endedAt)}</Fact>
        <Fact label="For">{elapsed(e.durationMs)}</Fact>
        <Fact label="Where">{v.surface.label}</Fact>
        {v.acts.clicks > 0 && <Fact label="Clicks">{v.acts.clicks}</Fact>}
        {v.acts.keys > 0 && <Fact label="Keys">{v.acts.keys}</Fact>}
        {v.acts.typing > 0 && <Fact label="Edits">{v.acts.typing}</Fact>}
        {v.quietMs > 1000 && <Fact label="Still">{elapsed(v.quietMs)}</Fact>}
        {v.entered_by.length > 0 && <Fact label="Used">{v.entered_by.join(", ")}</Fact>}
      </Facts>

      {v.entered && <Quote who="Sent">{v.entered}</Quote>}
      {heard.map((a, i) => <Quote key={i} who={`${says.get(a.channel!)} said`}>{a.text}</Quote>)}

      {v.call && (
        <p className="text-muted-foreground">
          Model call <span className="font-mono text-[11px] text-foreground">{v.call.model ?? v.call.callId}</span>
          {v.call.latencyMs !== null && <> · answered in {elapsed(v.call.latencyMs)}</>}
        </p>
      )}
      {v.discontinuity && <p className="text-muted-foreground">Break in the session: {v.discontinuity}.</p>}
      {v.regions.length > 0 && <p className="text-muted-foreground">Parts of the interface touched: {v.regions.join(", ")}.</p>}

      <RawEvents events={exported.events} start={Date.parse(e.startedAt)} />

      {e.stages.length > 0 && (
        <p className="flex flex-wrap items-baseline gap-1.5 border-t pt-2.5">
          <span className="text-muted-foreground">Read from</span>
          {e.stages.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onOpenMoment(s.id, e.id)}
              title="Open this moment on the trace canvas"
              className="rounded border px-1.5 py-0.5 text-[11px] leading-4 text-muted-foreground hover:border-foreground/40 hover:text-foreground"
            >
              {formatClock(s.at)} {s.title}
            </button>
          ))}
        </p>
      )}
    </div>
  );
}

// ---- the events underneath
//
// What the classifier saw, unedited and in trace order. A row is a claim
// about a person, and this is the only place a reader can disagree with
// one: the 32 keypresses that "experimented with the reference game" was
// read from either are in the reference frame or they are not.
//
// Long stretches have hundreds of events, so the list is capped and says
// so; the copied JSON is never capped.
const SHOWN = 80;

function RawEvents({ events, start }: { events: ExportedEvent[]; start: number }) {
  const [open, setOpen] = useState(false);
  if (!events.length) return null;
  return (
    <div className="border-t pt-2.5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        {events.length} raw event{events.length === 1 ? "" : "s"}
      </button>
      {open && (
        <ul className="mt-2 max-h-[280px] overflow-y-auto rounded border bg-background font-mono text-[11px] leading-[1.7]">
          {events.slice(0, SHOWN).map((e) => (
            <li key={e.seq} className="flex gap-2.5 border-b px-2 py-0.5 last:border-b-0">
              <span className="w-[46px] shrink-0 text-muted-foreground">{offset(Date.parse(e.at) - start)}</span>
              <span className="w-[112px] shrink-0">{e.kind}</span>
              <span className="min-w-0 flex-1 truncate" title={what(e)}>{what(e)}</span>
            </li>
          ))}
          {events.length > SHOWN && (
            <li className="px-2 py-0.5 text-muted-foreground">+{events.length - SHOWN} more — all of them are in the copied JSON</li>
          )}
        </ul>
      )}
    </div>
  );
}

// One line for one event, without a vocabulary of event kinds to keep in
// step with the bridge: whatever the trace already named the element,
// then the event's own scalar fields minus the plumbing every event
// carries. A kind added tomorrow prints something sensible on its own.
const PLUMBING = new Set(["frameId", "browser_at", "clock_offset_ms", "target", "control", "form", "container", "headers", "sizes", "embedded", "trusted", "started_at", "requestId", "interactionId", "callId"]);

function what(e: ExportedEvent): string {
  const t = e.target;
  const who = t ? t.text?.trim() || t.label || t.placeholder || t.testid || t.id || (t.tag ? `<${t.tag}>` : "") : "";
  const where = t?.selector ? tail(t.selector) : "";
  // Scalars, and lists of words. The second is there because the text
  // that arrived on screen is the whole point of a `ui.change` and it
  // comes as the nodes it arrived in; this stays generic rather than
  // branching on the kind, so a kind added tomorrow still prints.
  const fields = Object.entries(e.data ?? {})
    .filter(([k]) => !PLUMBING.has(k))
    .flatMap(([k, v]) => {
      if (typeof v === "number" || typeof v === "boolean") return [`${k}=${v}`];
      if (typeof v === "string") return v ? [`${k}=${clip(v, 36)}`] : [];
      if (Array.isArray(v) && v.length && v.every((x) => typeof x === "string")) return [`${k}=“${clip(v.join(" "), 44)}”`];
      return [];
    })
    .slice(0, 4);
  return [who && clip(who, 40), fields.join(" "), where].filter(Boolean).join("  ·  ") || "—";
}

// A selector is long and its left-hand side is the same on every row, so
// the part that distinguishes one element from another is the end of it.
const tail = (sel: string) => (sel.length <= 44 ? sel : `…${sel.slice(-43)}`);
const clip = (s: string, n: number) => { const one = s.replace(/\s+/g, " ").trim(); return one.length > n ? `${one.slice(0, n - 1)}…` : one; };

// ---- copying
//
// The clipboard API needs a secure context and a user gesture, and is
// refused outright in some embeddings, so a failure has to be visible
// rather than silent: the button says so and offers the text to select
// by hand.
function CopyJson({ text, label, title }: { text: () => string; label: string; title: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copy = async () => {
    if (timer.current) clearTimeout(timer.current);
    let ok = false;
    try {
      await navigator.clipboard.writeText(text());
      ok = true;
    } catch {
      ok = false;
    }
    setState(ok ? "done" : "failed");
    timer.current = setTimeout(() => setState("idle"), 2000);
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      title={state === "failed" ? "The browser refused the clipboard here" : title}
      className={cn("flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] leading-4 hover:border-foreground/40 hover:text-foreground", state === "failed" ? "text-destructive" : "text-muted-foreground")}
    >
      {state === "done" ? <Check className="size-3" /> : <Copy className="size-3" />}
      {state === "done" ? "Copied" : state === "failed" ? "Could not copy" : label}
    </button>
  );
}

const Facts = ({ children }: { children: React.ReactNode }) => <dl className="flex flex-wrap gap-x-5 gap-y-1">{children}</dl>;
const Fact = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-baseline gap-1.5">
    <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
    <dd className="font-mono text-[11px]">{children}</dd>
  </div>
);

// Words the interface or the person actually used, shown as theirs.
const Quote = ({ who, children }: { who: string; children: string }) => (
  <p className="border-l-2 pl-2.5">
    <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{who}</span>
    <span className="line-clamp-4">{children}</span>
  </p>
);

const offset = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

function elapsed(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}
