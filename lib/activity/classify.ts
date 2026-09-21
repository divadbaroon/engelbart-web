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
import { targetsOf, type TraceEvent } from "@/lib/trace/types";
import { appearances, eventsOf, quietWithin, regionsOf, windows, DEFAULT_SEGMENTATION, type Part, type Segmentation, type Window } from "@/lib/activity/segment";
import type { Context, Taxonomy } from "@/lib/activity/taxonomy";
import type { Acts, Episode, Evidence, Surface } from "@/lib/activity/types";

const ms = (iso: string) => Date.parse(iso);

const countActs = (events: TraceEvent[]): Acts => {
  const acts: Acts = { keys: 0, clicks: 0, typing: 0, submits: 0, navigations: 0, gestures: 0 };
  {
    for (const e of events) {
      const d = e.data ?? {};
      if (e.kind === "ui.key") acts.keys += typeof d.count === "number" ? d.count : 1;
      else if (e.kind === "ui.click") acts.clicks += 1;
      // Edits fold the way keys do, so they count the way keys do: a
      // folded event carries how many there were. A trace recorded
      // before edits were captured has no count and is one.
      else if (e.kind === "ui.input") acts.typing += typeof d.edits === "number" ? d.edits : 1;
      else if (e.kind === "ui.submit") acts.submits += 1;
      else if (e.kind === "ui.route") acts.navigations += 1;
      // Wheeling and dragging fold like keys and edits do, and count the
      // same way: one event carrying how many there were. An interface
      // driven by gesture rather than by button is otherwise silent.
      else if (e.kind === "ui.wheel") acts.gestures += typeof d.count === "number" ? d.count : 1;
      else if (e.kind === "ui.drag") acts.gestures += 1;
    }
  }
  return acts;
};

// Which named controls were used on the way into an episode, and inside
// it. A transition is why an episode means what it means.
const USES = new Set(["ui.click", "ui.submit", "ui.wheel", "ui.drag"]);

function controlsUsed(events: TraceEvent[], taxonomy: Taxonomy): string[] {
  const out: string[] = [];
  for (const e of events) {
    if (!USES.has(e.kind)) continue;
    // Both the control and the thing actually under the pointer. A
    // toolbar button is an icon and a label inside a <button>: the
    // button is what was used, and the label is the only part of it that
    // says which button it is. Asking the control alone threw the name
    // away, and asking the descendant alone would call a click on an
    // icon's path a click on a path.
    for (const target of targetsOf(e)) {
      for (const control of taxonomy.controls) {
        if (control.is(target) && !out.includes(control.id)) out.push(control.id);
      }
    }
  }
  return out;
}

// Which deed a stretch was, by the name the taxonomy gave it, or null
// where it was not one. Every kind of act can be a deed: a slider
// committed, a key pressed, a gesture, not only a click — which control
// counts is the taxonomy's business and this only asks.
const DEED = new Set(["ui.click", "ui.submit", "ui.input", "ui.key", "ui.wheel", "ui.drag"]);

function deedKey(events: TraceEvent[], taxonomy: Taxonomy): string | null {
  const ids: string[] = [];
  for (const e of events) {
    if (!DEED.has(e.kind)) continue;
    for (const target of targetsOf(e)) {
      for (const control of taxonomy.controls) {
        if (control.moment && control.is(target) && !ids.includes(control.id)) ids.push(control.id);
      }
    }
  }
  return ids.length ? ids.sort().join("+") : null;
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
  const isMoment = (events: TraceEvent[]) => deedKey(events, taxonomy);
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
      // A stage can now be cut into several stretches with the same
      // role — a deed opens one, and what preceded it keeps the other —
      // so the stage and the role together no longer name an episode.
      // The ordinal does, and it is what the canvas already keys nodes
      // by.
      id: `episode:${all[0] ? `${all[0].stage.id}:${all[0].role}:` : ""}${index}`,
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
