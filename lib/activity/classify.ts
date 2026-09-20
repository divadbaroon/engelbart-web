// From windows to episodes: build each window's evidence using the
// taxonomy's names, then let the taxonomy's rules read it, in order,
// first one that answers. Nothing in this file knows what a tutor is.
//
// Every episode carries the stage ids it was read from, so a reading can
// always be taken back to the rows and the raw events underneath it. The
// trace is never rewritten: this is a layer over it.
import type { FrameInfo, Stage } from "@/lib/trace/timeline";
import type { SemanticIndex } from "@/lib/semantics/lookup";
import { EMPTY_INDEX } from "@/lib/semantics/lookup";
import { targetOf, type TraceEvent } from "@/lib/trace/types";
import { appearances, eventsOf, quietWithin, regionsOf, windows, DEFAULT_SEGMENTATION, type Part, type Segmentation, type Window } from "@/lib/activity/segment";
import type { Context, Taxonomy } from "@/lib/activity/taxonomy";
import type { Acts, Episode, Evidence, Surface } from "@/lib/activity/types";

const ms = (iso: string) => Date.parse(iso);

const countActs = (events: TraceEvent[]): Acts => {
  const acts: Acts = { keys: 0, clicks: 0, typing: 0, submits: 0, navigations: 0 };
  {
    for (const e of events) {
      const d = e.data ?? {};
      if (e.kind === "ui.key") acts.keys += typeof d.count === "number" ? d.count : 1;
      else if (e.kind === "ui.click") acts.clicks += 1;
      else if (e.kind === "ui.input") acts.typing += 1;
      else if (e.kind === "ui.submit") acts.submits += 1;
      else if (e.kind === "ui.route") acts.navigations += 1;
    }
  }
  return acts;
};

// Which named controls were used on the way into an episode, and inside
// it. A transition is why an episode means what it means.
function controlsUsed(events: TraceEvent[], taxonomy: Taxonomy): string[] {
  const out: string[] = [];
  {
    for (const e of events) {
      if (e.kind !== "ui.click" && e.kind !== "ui.submit") continue;
      const target = targetOf(e);
      if (!target) continue;
      for (const control of taxonomy.controls) {
        if (control.is(target) && !out.includes(control.id)) out.push(control.id);
      }
    }
  }
  return out;
}

// The moment a window's last submission went in, so what appeared after
// it can be told from what was already on screen.
function submittedAt(parts: Part[]): number | null {
  let at: number | null = null;
  for (const part of parts) {
    if (part.role !== "submit") continue;
    for (const e of part.events) {
      if (e.kind === "ui.submit" || (e.kind === "ui.key" && (e.data ?? {}).key === "Enter")) at = ms(e.at);
    }
  }
  return at;
}

// What the person put in. `ui.input` deliberately never carries a typed
// value — only its length — so the one place a submitted message exists
// is the text the application echoed back into the conversation when it
// was sent. That is observed rather than captured, and it is the same
// text a reader would see on screen.
//
// It has to come through a channel the taxonomy calls the person's, and
// it has to have arrived no earlier than the submission it belongs to.
// Freshness is deliberately not required: somebody may send the same
// message twice, and the second one is not a repaint.
function enteredText(appeared: Appeared[], since: number | null, taxonomy: Taxonomy): string | null {
  const mine = new Set(taxonomy.channels.filter((c) => c.from === "person").map((c) => c.id));
  for (const a of appeared) {
    if (!a.channel || !mine.has(a.channel)) continue;
    if (since !== null && a.at < since - 1000) continue;
    return a.text;
  }
  return null;
}

type Appeared = { at: number; channel: string | null; text: string; fresh: boolean };

function evidenceOf(w: Window, taxonomy: Taxonomy, semantics: SemanticIndex, callOf: (id: string) => { model: string | null; latencyMs: number | null } | null, surfaceOf: (key: string) => { label: string; role: Surface["role"] }, before: Set<string>): Evidence {
  const all = [...w.transitions, ...w.parts];
  const rows = eventsOf(all);
  const meaning = surfaceOf(w.surface.key);
  const surface: Surface = { key: w.surface.key, label: meaning.label, role: meaning.role, frameIds: w.surface.frameIds };

  const appeared: Appeared[] = appearances(rows).map((a) => {
    const channel = taxonomy.channels.find((c) => c.is(a));
    const fresh = !before.has(a.text);
    before.add(a.text);
    return { at: a.at, channel: channel?.id ?? null, text: a.text, fresh };
  });

  const held = all.find((p) => p.callId)?.callId ?? null;
  const call = held ? { callId: held, ...(callOf(held) ?? { model: null, latencyMs: null }) } : null;

  const acts = countActs(rows);

  return {
    surface,
    regions: regionsOf(all, rows, semantics),
    acts,
    // The keys that were pressed, by name. Browser key names are a fixed
    // vocabulary and say nothing about any particular artifact; what
    // ArrowLeft *means* is the taxonomy's business.
    keyNames: [...new Set(rows.filter((e) => e.kind === "ui.key").map((e) => (e.data ?? {}).key).filter((k): k is string => typeof k === "string"))],
    appeared,
    entered: enteredText(appeared, submittedAt(all), taxonomy),
    // Whether anything at all was recorded here. A silence has no parts
    // of its own, and a rule that wants to say what somebody was doing
    // has to have seen them do something.
    observed: w.parts.length > 0,
    // The stretch a person spent in front of the message box with
    // nothing sent yet. It is what tells composing from sending.
    composing: all.some((p) => p.role === "compose"),
    // The send itself happened here. The cut is made at it, so this is
    // true of the sending and never of the composing before it or the
    // waiting after.
    submitted: all.some((p) => p.role === "submit"),
    // A model call was open for this stretch and the person was not the
    // one who had just sent it.
    awaiting: all.some((p) => p.role === "wait"),
    call,
    // How it was entered, and only that: the controls used in the
    // transitions absorbed onto its front. Built from `rows` this was
    // every control clicked anywhere inside the episode, so a button
    // pressed in the middle of doing something counted as the way in —
    // and a rule keyed on "they came here by X" fired for it.
    entered_by: controlsUsed(eventsOf(w.transitions), taxonomy),
    controls: controlsUsed(rows, taxonomy),
    openingQuietMs: w.openingQuietMs,
    // Time inside the window in which nothing at all was recorded,
    // measured from the events themselves.
    quietMs: quietWithin(rows, w.startedAt, w.endedAt),
    discontinuity: w.reloaded ? "the page was reloaded and the session picked up again" : null,
  };
}

export type ClassifyInput = {
  stages: Stage[];
  frames: Map<string, FrameInfo>;
  events: TraceEvent[];
  calls?: Map<string, { model: string | null; latencyMs: number | null }>;
  semantics?: SemanticIndex;
  taxonomy: Taxonomy;
  surfaceOf?: (key: string) => { label: string; role: Surface["role"] };
  segmentation?: Segmentation;
};

export function classify(input: ClassifyInput): Episode[] {
  const { stages, frames, taxonomy } = input;
  const semantics = input.semantics ?? EMPTY_INDEX;
  const calls = input.calls ?? new Map();
  const surfaceOf = input.surfaceOf ?? ((key: string) => taxonomy.surfaces[key] ?? { label: key, role: "other" as const });
  const cfg = input.segmentation ?? DEFAULT_SEGMENTATION;

  // Which brief acts are deeds rather than doors is the artifact's to
  // say; the segmenter only asks. A taxonomy that marks none keeps the
  // old behaviour, where every short stretch is a way into the next one.
  const moments = new Set(taxonomy.controls.filter((c) => c.moment).map((c) => c.id));
  const isMoment = (events: TraceEvent[]) => controlsUsed(events, taxonomy).some((id) => moments.has(id));
  const cut = windows(stages, frames, cfg, isMoment);
  const out: Episode[] = [];
  // Every text the interface has already shown, so a repaint of the
  // conversation is not read as somebody saying it again.
  const before = new Set<string>();

  cut.forEach((w, index) => {
    const evidence = evidenceOf(w, taxonomy, semantics, (id) => calls.get(id) ?? null, surfaceOf, before);
    const startedAt = w.startedAt;
    const endedAt = w.endedAt;
    // From the corrected timestamps the stages already carry, never from
    // a count of events or a guess.
    const durationMs = Math.max(0, ms(endedAt) - ms(startedAt));
    const context: Context = { evidence, durationMs, index, previous: out[out.length - 1] ?? null, before: out };
    const rule = taxonomy.rules.find((r) => r.when(context)) ?? taxonomy.fallback;
    const reading = rule.read(context);
    const all = [...w.transitions, ...w.parts];
    // The moments it was read from, each once, in order. A stage can be
    // cut into several parts, and two of those parts can land in
    // different episodes, so the same moment can be behind more than one
    // row — which is the truth about a submit stage.
    const stages: Stage[] = [];
    for (const part of all) if (!stages.includes(part.stage)) stages.push(part.stage);
    out.push({
      id: `episode:${all[0] ? `${all[0].stage.id}:${all[0].role}` : index}`,
      broadBehavior: rule.broad,
      subBehavior: rule.sub,
      description: reading.description,
      startedAt,
      endedAt,
      durationMs,
      confidence: reading.confidence,
      determined: "rule",
      because: reading.because,
      evidence,
      stageIds: stages.map((s) => s.id),
      stages,
      // This episode's own slice of the trace, which is not the same as
      // its stages' events: a submit stage's keystroke belongs to the
      // sending and its answer to the waiting.
      events: eventsOf(all),
    });
  });

  return out;
}
