// Cutting a session into stretches of one activity, before anything is
// named. This module knows nothing about any particular artifact: it
// knows that documents have identities, that people stop for a while,
// and that a request to a model brackets a wait.
//
// It does not segment raw events from scratch. `traceStages` already
// groups rows into stages, and that grouping is the work this would
// otherwise be redoing. But a stage is not always one activity: a
// "submit" stage runs from the moment somebody put the cursor in the
// message box to the moment the answer came back, and that is three
// behaviours in a row — composing, sending, waiting — under one title.
// So a stage is first cut into **parts** at its submissions, and an
// episode is one or more parts.
//
// Where the cuts fall:
//   · a part changed role — composing, sending and waiting are not the
//     same activity, and two submissions are never the same episode
//   · the model call changed — one episode, at most one call
//   · the surface changed — a different document of the interface
//   · a model call opened, or the one we were waiting on closed
//   * something was submitted
//   · the person stopped for `gapMs`
//   · the page was reloaded under them
// and then transitions shorter than `minEpisodeMs` are absorbed into
// whatever followed, because a one-second tab click is why the next
// episode means what it means, not an episode of its own.
import type { FrameInfo, Stage, TraceRow } from "@/lib/trace/timeline";
import type { SemanticIndex } from "@/lib/semantics/lookup";
import { regionLabel, lookupTarget } from "@/lib/semantics/lookup";
import { elementTarget, targetOf, type ElementTarget, type TraceEvent } from "@/lib/trace/types";

// The four numbers that decide where episodes begin and end. Named and
// passed in rather than written into the code, because the right pause
// is a property of the artifact and the study, not of this algorithm —
// a Tetris board is poked at in bursts of seconds, a reading task is
// not. Tested against a real ROPE session in tests/activity.
export type Segmentation = {
  gapMs: number;          // a silence at least this long ends an episode
  minEpisodeMs: number;   // shorter than this, and it is a transition rather than an episode
  quietMs: number;        // a silence at least this long is worth reporting as its own thing
  reloadGapMs: number;    // a reload after at least this much silence is a break in the session
  echoMs: number;         // how long after a submission the interface echoing it still belongs to the sending
  momentBurstMs: number;  // the same deed done again this soon is the same doing of it
  momentMinMs: number;    // a deed shorter than this that changed nothing on screen is a doorway, not an episode
};

export const DEFAULT_SEGMENTATION: Segmentation = {
  gapMs: 20_000,
  minEpisodeMs: 2_500,
  quietMs: 8_000,
  reloadGapMs: 5_000,
  // Tight on purpose. An interface repeating back what you just sent
  // does it in the same tick; a model that answers fast starts streaming
  // its reply a second and a half later, and a window wide enough to
  // catch that puts the tutor's answer inside the sending.
  echoMs: 400,
  // Somebody dragging a slider commits its value every few hundred
  // milliseconds and somebody clicking the same button twice means it
  // once. Wide enough to hold a gesture together, narrow enough that two
  // decisions a second and a half apart stay two decisions.
  momentBurstMs: 1_500,
  // A deed that caused nothing observable and was superseded inside a
  // second is how they got to the next thing, not a thing they did.
  momentMinMs: 1_000,
};

const ms = (iso: string) => Date.parse(iso);
const str = (v: unknown) => (typeof v === "string" ? v : null);

// ---- surfaces
//
// Which document of the interface a stage happened in. The best evidence
// is the document's own query parameters: the bridge keeps a frame's
// "?id=solution" precisely because an embedded document usually says
// what it is that way (sandbox/trace/bridge.js:95-97). Failing that, the
// position it was attached at, which is stable while the page is. Failing
// that, the route.
//
// None of this is artifact-specific. What "solution" *means* is the
// taxonomy's business; this only says two frames are not the same frame.
//
// `"top"` means one thing and one thing only: a stretch that happened on
// no document at all, which is what a model call is. It used to mean
// that *and* "the outermost document", and the two are not the same —
// an application recorded on its own keyed "top" while the very same
// application recorded inside the workspace's preview frame keyed "/",
// so its identity depended on who was watching. Every profile written
// against a single-document artifact matched nothing, silently, and
// every one of its episodes read with the role "other".
//
// A document is now its path, wherever it sits. The path comes from
// `frame.served` and `frame.loaded`, which happen once per document, so
// a client-side route change or an edit to the query string does not
// make a second surface out of one document — which is the failure in
// the other direction and the worse one.
const pathOf = (frame: FrameInfo): string | null => {
  const raw = frame.path ?? frame.url;
  if (!raw) return null;
  const cut = raw.split("#")[0].split("?")[0];
  if (!cut) return null;
  const path = cut.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, "") || "/";
  return path.length > 1 ? path.replace(/\/+$/, "") || "/" : path;
};

export function surfaceKey(frame: FrameInfo | undefined): string {
  if (!frame) return "top";
  if (!frame.embedded && (frame.depth ?? 0) === 0) return pathOf(frame) ?? "top";
  const id = frame.query?.id ?? frame.query?.name ?? null;
  if (id) return id;
  if (frame.name) return frame.name;
  const nth = frame.selectorInParent?.match(/(?:iframe|frame):nth-of-type\((\d+)\)/);
  if (nth) return `frame-${nth[1]}`;
  return pathOf(frame) ?? `frame-${frame.frameId}`;
}


// The surface a stage belongs to: the one most of its events were in, or
// null when it happened nowhere on screen. A model call is the usual
// case — it is the gateway's, not any document's — and the truthful
// answer is that the person was still wherever they already were.
function surfaceOf(part: Part, frames: Map<string, FrameInfo>): { key: string; frameIds: string[] } | null {
  const counts = new Map<string, { n: number; ids: string[] }>();
  for (const e of part.events) {
    const id = str((e.data ?? {}).frameId);
    if (!id) continue;
    const key = surfaceKey(frames.get(id));
    const got = counts.get(key) ?? { n: 0, ids: [] };
    got.n += 1;
    if (!got.ids.includes(id)) got.ids.push(id);
    counts.set(key, got);
  }
  let best: [string, { n: number; ids: string[] }] | null = null;
  for (const entry of counts) if (!best || entry[1].n > best[1].n) best = entry;
  return best ? { key: best[0], frameIds: best[1].ids } : null;
}


// What the application put on screen, in its own words. `ui.change`
// carries the text that arrived; the container is how we tell one
// channel from another, and naming the channel is the taxonomy's job.
// ---- parts: a stage cut where the behaviour changes
//
// A "submit" stage is the problem this exists for. `traceStages` opens
// one when somebody engages the message box and closes it when the
// request it caused comes back, so a single stage can hold eleven
// seconds of composing, the keystroke that sent it, and the wait for the
// answer. Classified whole it becomes one long ACTING episode that began
// before anything was decided and ended after the tutor had already
// replied — and, worse, a second submission that starts while the first
// answer is still arriving lands in the same episode as the first, under
// the first one's model call.
//
// So a stage is cut at its submissions into parts, each with its own
// slice of the events and its own bounds:
//
//   compose — the message box was engaged and nothing has been sent yet
//   submit  — the send itself, and the interface echoing it back
//   wait    — after a send: the request going out, the answer arriving
//   plain   — everything else, unchanged
//
// Every part keeps the stage it came from, so a reading can still be
// taken back to a moment on the canvas.
export type PartRole = "compose" | "submit" | "wait" | "plain";

export type Part = {
  stage: Stage;
  role: PartRole;
  events: TraceEvent[];
  at: string;
  endAt: string;
  // The model call this part belongs to, when it belongs to one. A
  // compose part never does: the call it will cause has not happened.
  callId: string | null;
  // The deed this part opened with, by the name the taxonomy gave it, or
  // null where it opened with something else.
  moment: string | null;
  // Whether this part begins a stretch of its own. True for every part a
  // deed cut out of a stage — the deed itself, and whatever a person did
  // next, which is what ends it. See `deeds` and `windows`.
  opens: boolean;
};

// Which acts a deed can be. An effect is not one: a repaint is what a
// deed caused, and letting it open a stretch would put the consequence
// in front of its cause. Nothing here is about any particular artifact —
// it is the list of event kinds that are a person doing something.
const ACT = new Set(["ui.click", "ui.submit", "ui.input", "ui.key", "ui.wheel", "ui.drag"]);

// Which acts are deeds rather than doors, and what the artifact calls
// them. The segmenter cannot know — that is the taxonomy's business — so
// it asks, and gets back a name it can compare rather than a yes it
// cannot. The name is what lets the same deed done three times in two
// seconds be one doing of it and three different deeds be three.
//
// Nothing named means nothing is a deed, which is what this did before
// any taxonomy was passed in.
export type Deliberate = (events: TraceEvent[]) => string | null;
const NOTHING_IS: Deliberate = () => null;

// What counts as sending something. `ui.submit` says so outright. A
// Return in a text-entry surface only counts inside a stage that
// `traceStages` already read as a submission, which is what keeps a
// newline in a long message from being read as sending it — the bridge
// does not record modifier keys, so Shift+Return is not distinguishable
// here and the stage's own verdict is the better evidence.
const sends = (e: TraceEvent, inSubmitStage: boolean): boolean => {
  if (e.kind === "ui.submit") return true;
  if (!inSubmitStage || e.kind !== "ui.key") return false;
  const d = e.data ?? {};
  return d.key === "Enter" && !!d.editable;
};

const bounds = (events: TraceEvent[], fallback: Stage): { at: string; endAt: string } => {
  if (!events.length) return { at: fallback.at, endAt: fallback.at };
  let lo = ms(events[0].at), hi = lo, at = events[0].at, endAt = events[0].at;
  for (const e of events) {
    const t = ms(e.at);
    if (t < lo) { lo = t; at = e.at; }
    if (t > hi) { hi = t; endAt = e.at; }
  }
  return { at, endAt };
};

// ---- deeds, inside a stretch that sends nothing
//
// A stage that holds no submission is one part, and for turn-taking
// software that is right: between one send and the next there is one
// thing going on. For everything else it is the whole session. A person
// moving around a map, running a simulation, editing and re-running,
// stepping through a timeline never submits anything, so `traceStages`
// hands over one stage and the reading is one row for four minutes.
//
// So a stretch is also cut at its deeds. The taxonomy says which acts
// are deeds; this says what a deed does to the shape of the reading:
//
//   · a deed opens a stretch
//   · what the deed caused stays with it — an effect never opens a
//     stretch, so a repaint, a request and an answer all land behind the
//     act that produced them rather than in front of the next one
//   · the next thing a person does ends it. A deed's stretch is the deed
//     and its consequences, not the deed and everything afterwards until
//     somebody happens to press another named button — which would let
//     one toggle name the two minutes of moving around that followed it
//   · the same deed again, within `momentBurstMs`, is the same doing of
//     it: a slider committed eight times while being dragged, a button
//     pressed twice, one stretch
//   · a different deed is a different stretch, however close
//   · acts that are not deeds accumulate, so a run of wheeling and
//     dragging is one stretch of moving around and not one row a flick
//
// The clock, not the sequence: the bridge flushes a batch of mutations
// with the act that caused them, so an effect can carry a lower sequence
// number than its cause.
type Run = { events: TraceEvent[]; moment: string | null; lastAt: number; deed: boolean };

function deeds(ordered: TraceEvent[], cfg: Segmentation, isMoment: Deliberate): { events: TraceEvent[]; moment: string | null }[] {
  const runs: Run[] = [];
  for (const e of ordered) {
    const act = ACT.has(e.kind);
    const key = act ? isMoment([e]) : null;
    const open = runs[runs.length - 1];
    const at = ms(e.at);
    // The same deed, still being done.
    if (key !== null && open && open.moment === key && at - open.lastAt <= cfg.momentBurstMs) {
      open.events.push(e); open.lastAt = at;
      continue;
    }
    // A deed, or the first thing done after one.
    if (key !== null || (act && open?.deed)) {
      runs.push({ events: [e], moment: key, lastAt: at, deed: key !== null });
      continue;
    }
    if (!open) { runs.push({ events: [e], moment: null, lastAt: at, deed: false }); continue; }
    open.events.push(e);
  }
  // A run with nothing a person did in it is not a stretch of
  // behaviour; it is the run-up to the next one. A repaint still
  // settling, a page finishing its reload, a request coming back — when
  // that is all there is in front of a deed, it belongs to the deed,
  // not to a row of its own that would be over in the same second and
  // would take the silence before it with it. Prior exploration is
  // still its own run: exploring means acting, and those acts keep it.
  for (let i = runs.length - 1; i > 0; i--) {
    const before = runs[i - 1];
    if (before.moment !== null || before.events.some((e) => ACT.has(e.kind))) continue;
    runs[i].events = before.events.concat(runs[i].events);
    runs.splice(i - 1, 1);
  }
  return runs.map(({ events, moment }) => ({ events, moment }));
}

export function parts(stages: Stage[], cfg: Segmentation = DEFAULT_SEGMENTATION, isMoment: Deliberate = NOTHING_IS): Part[] {
  const out: Part[] = [];
  for (const stage of stages) {
    const add = (role: PartRole, events: TraceEvent[], span?: { at: string; endAt: string }, call?: string | null, moment: string | null = null, opens = false) => {
      if (!events.length) return;
      const b = span ?? bounds(events, stage);
      // A part's call is the one its own events name, or — where there is
      // no ambiguity about which send opened it — the stage's. Composing
      // never has one: the call it will cause has not been made.
      const own = events.find((e) => e.callId)?.callId ?? null;
      const callId = role === "compose" || role === "plain" ? null : own ?? (call !== undefined ? call : stage.callId ?? null);
      out.push({ stage, role, events, at: b.at, endAt: b.endAt, callId, moment, opens });
    };
    // A stretch with no send in it, cut at its deeds. The first keeps the
    // stage's opening and the last its close, so the parts still cover
    // exactly what the stage covered and no second is claimed twice.
    const plain = (ordered: TraceEvent[]) => {
      const runs = deeds(ordered, cfg, isMoment);
      if (runs.length <= 1) { add("plain", ordered, { at: stage.at, endAt: stage.endAt }); return; }
      runs.forEach((run, i) => {
        const b = bounds(run.events, stage);
        add("plain", run.events, {
          at: i === 0 ? stage.at : b.at,
          endAt: i === runs.length - 1 ? stage.endAt : bounds(runs[i + 1].events, stage).at,
        }, null, run.moment, i > 0);
      });
    };
    if (stage.stage === "call") { add("wait", stage.events, { at: stage.at, endAt: stage.endAt }); continue; }

    const isSubmit = stage.stage === "submit";
    const ordered = [...stage.events].sort((a, b) => ms(a.at) - ms(b.at) || a.seq - b.seq);
    // Every send in the stage, not the first. A Return that sent nothing
    // — an empty box, or one pressed while the last answer was still
    // arriving — is recorded exactly like one that did, and `traceStages`
    // folds it into the next submission because it has the same target.
    // Honouring only the first put the ACTING boundary on the keystroke
    // that did nothing and swallowed the real send, its call and its echo
    // into the wait, which is the merge this is all here to prevent.
    const at = ordered.filter((e) => sends(e, isSubmit)).map((e) => ms(e.at));
    if (!at.length) { plain(ordered); continue; }

    // The split is on the clock and not on the sequence numbers, because
    // the two disagree at exactly the moment that matters: the bridge
    // batches DOM mutations and flushes the batch with the keystroke that
    // caused them, so the interface echoing a message back can carry a
    // lower sequence number than the Return that sent it. Cut by order of
    // arrival and the echo lands in the composing that preceded it, which
    // is how the sending came to have no message in it.
    //
    // A send takes everything within `echoMs` either side of it: the
    // keystroke, the request it caused, and the interface repeating the
    // message back. That echo is the only record of what was actually
    // sent — `ui.input` carries a length and never a value — so it
    // belongs to the sending rather than to the wait after it.
    const near = (t: number) => at.some((x) => Math.abs(t - x) <= cfg.echoMs);
    const owner = (t: number) => { let i = -1; for (let k = 0; k < at.length; k++) if (at[k] <= t + cfg.echoMs) i = k; return i; };
    // With one send there is no doubt which one opened the call the row
    // was correlated to. With more than one there is, so only a callId
    // an event carries itself is used.
    const only = at.length === 1 ? stage.callId ?? null : null;

    for (let i = 0; i < at.length; i++) {
      // Composing runs to where its send begins rather than to its own
      // last event: sitting in front of a half-written message is the
      // behaviour, not the click that opened the box. The first stretch
      // starts where the stage does; a later one starts where the
      // previous send finished being echoed.
      const from = i === 0 ? -Infinity : at[i - 1] + cfg.echoMs;
      const around = ordered.filter((e) => { const t = ms(e.at); return near(t) && owner(t) === i; });
      // The sending begins at the first thing it took, which can be a few
      // milliseconds before the keystroke itself: the bridge stamps the
      // request a keystroke caused with the clock of the batch it was
      // flushed in. Composing has to end there rather than at the
      // keystroke, or the two parts claim the same moment.
      const begins = around.length ? Math.min(at[i], ms(bounds(around, stage).at)) : at[i];
      const before = ordered.filter((e) => { const t = ms(e.at); return t > from && t < at[i] - cfg.echoMs; });
      if (before.length) add("compose", before, { at: i === 0 ? stage.at : bounds(before, stage).at, endAt: new Date(begins).toISOString() });
      add("submit", around, undefined, only);
    }
    const last = at[at.length - 1];
    const after = ordered.filter((e) => ms(e.at) > last + cfg.echoMs);
    if (after.length) add("wait", after, { at: bounds(after, stage).at, endAt: stage.endAt });
  }
  return out.sort((a, b) => ms(a.at) - ms(b.at) || a.events[0].seq - b.events[0].seq);
}

// Text that arrived on screen, and the element it arrived in.
//
// The container is the whole descriptor rather than a selector and a
// string, because a channel has to be recognisable by the same things any
// other element is recognisable by — a test id, a role, an accessible
// name — and not only by where it sat in the tree. What the bridge
// happens to know about a given container varies; an interface that names
// its conversation can be matched on the name, and one that does not
// falls back to the path. Throwing the descriptor away made that choice
// for every artifact in advance, and made it the worst one.
export type Appearance = {
  at: number;
  container: ElementTarget | null;
  text: string;
  // The nameable places above the container, innermost first, where the
  // bridge reported them. A repaint's own region is often a div the
  // application never named — a wrapper, a row, something whose only
  // surviving class is a compiler's hash — while the thing that says
  // what part of the interface it is sits one or two levels up. The
  // bridge already walks that far and records the chain; this is it
  // reaching the matching, so a channel written against the panel still
  // finds text that arrived in an anonymous box inside it.
  //
  // Empty, or absent altogether on an appearance that was not read from
  // a recorded chain, and either way it matches exactly as it did.
  within?: ElementTarget[];
};

// `ui.change` reports the text that arrived as the nodes it arrived in,
// so a sentence comes back as its words and its punctuation separately:
// "You ' ve made great progress !". Joining them with spaces is right for
// words and wrong for everything else, and the text goes in front of a
// reader. This closes the seams and changes nothing else.
const tidy = (s: string): string =>
  s.replace(/\s+/g, " ")
    .replace(/(\w)\s+([’'])\s+(\w)/g, "$1$2$3")
    .replace(/\s+([.,!?;:%)\]}…])/g, "$1")
    .replace(/([(\[{])\s+/g, "$1")
    .trim();
// Every event a set of parts holds, each once, in the order they
// arrived. `traceStages` deliberately puts the mutation that a model's
// answer caused into both the submission it answers and the "response
// appeared" moment, so a window can hold the same row twice and counting
// it twice would say the tutor spoke twice.
export function eventsOf(parts: Part[]): TraceEvent[] {
  const seen = new Set<number>();
  const out: TraceEvent[] = [];
  for (const part of parts) for (const e of part.events) if (!seen.has(e.id)) { seen.add(e.id); out.push(e); }
  return out.sort((a, b) => ms(a.at) - ms(b.at) || a.seq - b.seq);
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((t): t is string => typeof t === "string") : []);

// Text that appeared, and where. A burst of DOM changes is one event,
// and its `container` is the lowest element holding all of them: when
// one repaint touches two unrelated panels that is whatever contains
// both, and joining their texts under it would say that one part of the
// interface said all of it.
//
// So where the bridge reported the regions a burst changed, each is its
// own appearance with its own text. Bursts recorded before it did — and
// any that resolve to nothing nameable — still read exactly as they did,
// as one appearance under the container.
export function appearances(events: TraceEvent[]): Appearance[] {
  const out: Appearance[] = [];
  for (const e of events) {
    if (e.kind !== "ui.change") continue;
    const d = e.data ?? {};
    const at = ms(e.at);
    const before = out.length;
    for (const r of Array.isArray(d.regions) ? d.regions : []) {
      const region = r as { target?: unknown; added?: unknown; within?: unknown } | null;
      const text = tidy(strings(region?.added).join(" "));
      if (!text) continue;
      const within = (Array.isArray(region?.within) ? region.within : []).map(elementTarget).filter((t): t is ElementTarget => !!t);
      out.push({ at, container: elementTarget(region?.target), text, within });
    }
    if (out.length > before) continue;
    const text = tidy(strings(d.added).join(" "));
    if (!text) continue;
    out.push({ at, container: targetOf(e), text, within: [] });
  }
  return out;
}

// Every named part of the interface a stage touched, as the reading
// named it. This is enrichment: it makes a detail view readable. It is
// never what a classification turns on, because the names are written by
// a model and drift between runs of the same interface — the same ROPE
// page has come back as region_prompt, region_conversation_prompt and
// region_conversation on three different runs.
export function regionsOf(parts: Part[], events: TraceEvent[], semantics: SemanticIndex): string[] {
  const out: string[] = [];
  for (const stage of new Set(parts.map((p) => p.stage))) {
    for (const row of stage.rows) {
      const named = (row as TraceRow & { semantic?: { region?: string | null; element?: { label?: string } | null } | null }).semantic;
      const region = named?.region ?? null;
      if (region && !out.includes(region)) out.push(region);
    }
  }
  {
    for (const e of events) {
      const target = targetOf(e);
      if (!target) continue;
      const match = lookupTarget(semantics, target);
      const label = match ? regionLabel(semantics, match) ?? match.label : null;
      if (label && !out.includes(label)) out.push(label);
    }
  }
  return out.slice(0, 6);
}

// ---- the cut

export type Window = {
  // A stretch with parts in it, or a stretch with nothing in it. A
  // silence is not the absence of an episode; it is an episode about
  // which the honest thing to say is that nothing was observed.
  kind: "activity" | "quiet";
  parts: Part[];
  startedAt: string;
  endedAt: string;
  surface: { key: string; frameIds: string[] };
  // A gap that opened before this window's first stage.
  openingQuietMs: number;
  // Whether the page was replaced under the person just before it.
  reloaded: boolean;
  // Windows too short to be episodes of their own, folded in front of
  // this one in the order they happened.
  transitions: Part[];
};

// The document behind a surface was replaced: same identity, new frame.
//
// `frame.loaded` is not usable for this. Everything the bridge sees is
// inside the workspace's preview frame, so every FrameInfo is
// `embedded: true` — including the artifact's own top document — and a
// rule keyed on that flag never fires. What does hold is that a frameId
// names one document for as long as it lives, so the same surface key
// arriving under a frameId we have not seen for it means the page went
// away and came back.
// Whatever incidental thing a person did while a call was open, they did
// while waiting: a click on the canvas, a few arrow keys. It joins the
// wait rather than becoming an episode laid over the same seconds, and
// it does not move them to another surface for the purpose of cutting.
//
// Both ends have to be inside the wait, give or take the echo window.
// Testing only where it started let a stretch that began a tick before
// the answer be absorbed whole, and since a window ends where its last
// part ends, the WAITING episode then ran past the answer and claimed a
// call had been open for longer than the trace says it was.
//
// Sending is never incidental, and the segmenter cuts at it. Engaging
// the message box is not incidental either, but it is only visible as
// such when `traceStages` folded it into the submission it led to; a
// person who opens the box and does something else, or opens it and
// never sends, leaves a stage this cannot tell from any other. Such a
// stretch is absorbed like any other plain one when it fits entirely
// inside the call, and stands on its own when it does not.
const inFlightNow = (part: Part, until: number, cfg: Segmentation) =>
  part.role === "plain" && ms(part.at) < until && ms(part.endAt) <= until + cfg.echoMs;

const replaced = (key: string, ids: string[], history: Map<string, Set<string>>): boolean => {
  const known = history.get(key);
  const isNew = !!known && ids.length > 0 && ids.every((id) => !known.has(id));
  const set = known ?? new Set<string>();
  for (const id of ids) set.add(id);
  history.set(key, set);
  return isNew;
};


export function windows(stages: Stage[], frames: Map<string, FrameInfo>, cfg: Segmentation = DEFAULT_SEGMENTATION, isMoment: Deliberate = NOTHING_IS): Window[] {
  const out: Window[] = [];
  let run: Part[] = [];
  let surface: { key: string; frameIds: string[] } | null = null;
  let quiet = 0;
  let reloaded = false;
  const history = new Map<string, Set<string>>();
  // While a model call is open, whatever incidental thing happens
  // happened during the wait. Splitting it out would put two episodes
  // over one stretch of clock and lose the fact that they overlap.
  let callUntil = 0;

  const flush = () => {
    if (!run.length || !surface) { run = []; return; }
    out.push({
      kind: "activity",
      parts: run,
      startedAt: run[0].at,
      // The last part is not always the one that ends last: a call runs
      // past the keys pressed while it was open.
      endedAt: run.reduce((latest, p) => (ms(p.endAt) > ms(latest) ? p.endAt : latest), run[0].endAt),
      surface,
      openingQuietMs: quiet,
      reloaded,
      transitions: [],
    });
    run = [];
    quiet = 0;
    reloaded = false;
  };

  for (const part of parts(stages, cfg, isMoment)) {
    const found = surfaceOf(part, frames);
    const here: { key: string; frameIds: string[] } = found ?? surface ?? { key: "top", frameIds: [] };
    const again = !!found && replaced(found.key, found.frameIds, history);
    const prev = run[run.length - 1];
    if (prev) {
      const gap = ms(part.at) - ms(prev.endAt);
      const changedSurface = here.key !== surface?.key;
      // A page that comes back straight after something was clicked is
      // that click working. A page that comes back out of a silence is
      // the session having been interrupted, which is the thing worth
      // keeping in a behavioural history.
      const broke = again && gap >= cfg.reloadGapMs;
      const inFlight = inFlightNow(part, callUntil, cfg);
      // Composing, sending and waiting are three behaviours, and the
      // trace says which is which. Two waits are one wait — the tail of
      // a submit stage and the model call it opened are the same stretch
      // of waiting — but only while it is the same call.
      //
      // The comparison is against what the run *is*, not against the part
      // that happens to be last in it: something incidental that joined a
      // wait must not make the rest of that wait look like a new
      // behaviour and split it in two.
      const changedRole = part.role !== roleOf(run);
      // One episode, at most one model call. A second submission that
      // begins while the first answer is still arriving is its own
      // episode, under its own call, whatever else lines up.
      const changedCall = clash(part, run);
      // A deed opens a stretch, and so does the next thing done after
      // one. Without this the run would swallow both: two plain parts
      // with the same role, the same call and the same document look
      // identical to everything above, which is exactly how a session of
      // ten distinct acts became one row.
      if (!inFlight && (part.opens || changedRole || changedCall || changedSurface || broke || gap >= cfg.gapMs)) {
        const carriedQuiet = gap >= cfg.gapMs ? gap : 0;
        const carriedReload = broke;
        flush();
        quiet = carriedQuiet;
        // The break belongs to the stretch where they came back, not to
        // the silence they were away for.
        reloaded = carriedReload;
      }
    }
    if (!inFlightNow(part, callUntil, cfg)) surface = here;
    if (part.role === "wait") callUntil = Math.max(callUntil, ms(part.endAt));
    run.push(part);
  }
  flush();

  return clamp(silences(absorb(out, cfg, isMoment), cfg));
}

// What a run of parts is, as against what its last part happens to be.
// Incidental activity joins a wait without becoming what the wait is.
const roleOf = (run: Part[]): PartRole => run.find((p) => p.role !== "plain")?.role ?? run[0].role;

// Whether a part belongs to a different model call than the run it would
// join. A run with no call yet takes whatever comes; a run that has one
// keeps it.
function clash(part: Part, run: Part[]): boolean {
  if (!part.callId) return false;
  const held = run.find((p) => p.callId)?.callId ?? null;
  return held !== null && held !== part.callId;
}

// Time in a stretch in which nothing at all was recorded.
//
// Events are instants, not intervals, so "covered" means within a second
// of something happening. The previous version subtracted the parts'
// declared spans from the window, and those spans cover the window by
// construction, so it came out as zero for every episode that contained
// a single act — including an eleven-second wait in front of the message
// box in which nothing was recorded for eleven of them.
const NEAR_MS = 1_000;
export function quietWithin(events: TraceEvent[], startedAt: string, endedAt: string): number {
  const from = ms(startedAt), to = ms(endedAt);
  if (to <= from) return 0;
  const at = events.map((e) => ms(e.at)).filter((t) => t >= from - NEAR_MS && t <= to + NEAR_MS).sort((a, b) => a - b);
  if (!at.length) return to - from;
  let quiet = Math.max(0, Math.min(at[0], to) - from - NEAR_MS);
  for (let i = 1; i < at.length; i++) quiet += Math.max(0, at[i] - at[i - 1] - NEAR_MS);
  quiet += Math.max(0, to - Math.max(at[at.length - 1], from) - NEAR_MS);
  return Math.min(quiet, to - from);
}

// The holes, said out loud, once the cuts are settled. Two knobs, two
// jobs: `gapMs` decides where an episode ends, `quietMs` decides which
// of the holes between episodes is long enough that a reader should see
// it rather than find a jump in the clock between two rows. A hole can
// open where the cut was something else — they left the reference panel
// and came back sixteen seconds later — and that silence is just as
// real as one that ended an episode by itself.
function silences(list: Window[], cfg: Segmentation): Window[] {
  const out: Window[] = [];
  list.forEach((w, i) => {
    const prev = list[i - 1];
    const hole = prev ? ms(w.startedAt) - ms(prev.endedAt) : 0;
    if (prev && hole >= cfg.quietMs) {
      out.push({ kind: "quiet", parts: [], startedAt: prev.endedAt, endedAt: w.startedAt, surface: prev.surface, openingQuietMs: hole, reloaded: false, transitions: [] });
    }
    out.push(w);
  });
  return out;
}

// No two episodes may claim the same second. A stage that opened a model
// call runs until the answer comes back, so the submit that started it
// ends after the wait begins; read as a timeline that is one episode
// overlapping the next. An episode ends where the next one starts.
function clamp(list: Window[]): Window[] {
  for (let i = 0; i < list.length - 1; i++) {
    const next = ms(list[i + 1].startedAt);
    if (ms(list[i].endedAt) > next) list[i].endedAt = list[i + 1].startedAt;
  }
  return list;
}

// A window shorter than `minEpisodeMs` that did something — a tab click,
// a step opened — is why the next window means what it means. Fold it in
// front, keeping its stages so nothing is lost and the time it took is
// still counted.
const join = (held: Window[]): Window => ({ ...held[0], kind: "activity", parts: held.flatMap((h) => h.parts), endedAt: held[held.length - 1].endedAt, transitions: [] });

function absorb(list: Window[], cfg: Segmentation, isMoment: Deliberate): Window[] {
  const out: Window[] = [];
  let held: Window[] = [];
  for (const w of list) {
    const span = ms(w.endedAt) - ms(w.startedAt);
    // Sending, and the composing before it, are always their own rows
    // however short. They are the boundaries the rest of the reading
    // hangs off, and folding a two-second dwell into the send it led to
    // is the same conflation as folding an eleven-second one — only
    // small enough not to be noticed.
    //
    // And an act the artifact calls a deed rather than a door keeps its
    // own stretch too. Signing in takes a moment and is over; what
    // follows it is a different thing somebody did, and folding the two
    // together lets the shorter one name the longer.
    // A deed keeps its own stretch — unless it was over inside
    // `momentMinMs` and nothing on screen answered it, in which case it
    // is how they got to the next thing. Opening a menu to click what is
    // inside it should not cost two rows, and the difference between a
    // doorway and a deed is visible in the trace: a deed causes
    // something.
    const events = eventsOf(w.parts);
    const deed = isMoment(events) !== null;
    const answered = events.some((e) => e.kind === "ui.change");
    const doorway = deed && !answered && span < cfg.momentMinMs;
    const brief = w.kind === "activity" && !w.reloaded && span < cfg.minEpisodeMs
      && w.parts.every((p) => p.role === "plain")
      && (!deed || doorway)
      && w.openingQuietMs < cfg.gapMs;
    if (brief) { held.push(w); continue; }
    if (held.length && w.kind === "quiet") { out.push(join(held)); held = []; }
    if (held.length) {
      w.transitions = held.flatMap((h) => h.parts);
      w.startedAt = held[0].startedAt;
      w.openingQuietMs = held[0].openingQuietMs || w.openingQuietMs;
      w.reloaded = w.reloaded || held.some((h) => h.reloaded);
      held = [];
    }
    out.push(w);
  }
  // Transitions with nothing after them are still time somebody spent.
  if (held.length) out.push(join(held));
  return out;
}

export { ms as parseAt };
