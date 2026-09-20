// The timeline, reduced to what a sentence about the session could be
// written from.
//
// This is the narrator's only input. It is built from classified episodes
// and from nothing else: no events, no selectors, no frames, no model
// calls, no durations finer than the text says. The reason is the same
// reason the taxonomy is data — a reading that can reach back into the
// raw trace is a second classifier, and there is already one of those,
// tested against a recorded session. Anything the narrator is allowed to
// say has to be visible here, which makes what it says checkable by
// reading this instead of the run.
//
// What survives the reduction is the sequence and the words: what the
// person wrote, and what the interface showed them. Those are what carry
// a session's subject — that it was about a Tetris board, that a message
// asked for help — and none of it is knowledge this module has. It is
// text that was on screen, quoted.
//
// Pure, and deliberately runnable in the browser: the page decides
// whether the timeline has changed enough to be worth asking about, and
// that decision must not cost a round trip.
import type { Broad, Episode } from "@/lib/activity/types";

// What one episode contributes. A row of the timeline with its mechanics
// removed and its content kept.
export type StoryEpisode = {
  n: number;
  broad: Broad;
  sub: string;
  durationMs: number;
  // The surface it happened on, as the taxonomy names it.
  where: string;
  // The episode's own sentence, which is the deterministic reading and
  // already the most careful thing anybody has said about this stretch.
  description: string;
  // What the person wrote, where the trace holds it. Participant-authored
  // and the only thing here that is.
  wrote: string | null;
  // What the interface showed them, by the channel the taxonomy named.
  // Never the person's own echo: that is `wrote`.
  said: { channel: string; text: string }[];
};

export type Story = {
  taxonomy: string;
  // The session as a clock, from the first episode to the last, which is
  // not the sum of the episodes: the gaps between them are the session
  // too.
  spanMs: number;
  episodeCount: number;
  // How much of that clock is time the trace could not characterise.
  // Handed over as a number so that a reading does not have to work it
  // out, and so the rule about ignoring silence can be a rule.
  unclearShare: number;
  episodes: StoryEpisode[];
  truncated: boolean;
};

// Caps. A story is meant to be a few hundred tokens; a session with four
// hundred episodes is still a session, and cutting it in the middle is
// better than sending all of it or refusing.
const MAX_EPISODES = 60;
const MAX_SAID = 2;
const LIMIT = { description: 200, wrote: 400, said: 400, channel: 40, where: 60, sub: 60, taxonomy: 60 } as const;

export const clip = (s: string, max: number): string => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one;
};

const ms = (iso: string) => Date.parse(iso);

export function storyOf(episodes: Episode[], taxonomy: string): Story {
  const kept = episodes.length > MAX_EPISODES ? [...episodes.slice(0, MAX_EPISODES - 10), ...episodes.slice(-10)] : episodes;
  const first = episodes[0], last = episodes[episodes.length - 1];
  const spanMs = first && last ? Math.max(0, ms(last.endedAt) - ms(first.startedAt)) : 0;
  const unclear = episodes.filter((e) => e.broadBehavior === "UNCLEAR").reduce((n, e) => n + e.durationMs, 0);
  return {
    taxonomy: clip(taxonomy, LIMIT.taxonomy),
    spanMs,
    episodeCount: episodes.length,
    unclearShare: spanMs > 0 ? Math.min(1, unclear / spanMs) : 0,
    truncated: kept.length !== episodes.length,
    episodes: kept.map((e, i) => ({
      n: episodes.indexOf(e) + 1 || i + 1,
      broad: e.broadBehavior,
      sub: clip(e.subBehavior, LIMIT.sub),
      durationMs: e.durationMs,
      where: clip(e.evidence.surface.label, LIMIT.where),
      description: clip(e.description, LIMIT.description),
      wrote: e.evidence.entered ? clip(e.evidence.entered, LIMIT.wrote) : null,
      // Only words that were new, and never the person's own message
      // coming back: an interface that repaints a conversation replays
      // all of it, and the echo of what they sent is already `wrote`.
      said: e.evidence.appeared
        .filter((a) => a.fresh && a.channel && a.channel !== PARTICIPANT)
        .slice(0, MAX_SAID)
        .map((a) => ({ channel: clip(a.channel as string, LIMIT.channel), text: clip(a.text, LIMIT.said) })),
    })),
  };
}

// The one channel id this module knows, because it is the one thing it
// has to tell apart: a person's own words from the application's. Every
// taxonomy that carries a `from: "person"` channel calls it this.
const PARTICIPANT = "participant";

// Rebuilding a story that arrived from somewhere else.
//
// The page computes the reduction and sends it, the way a document sends
// its own survey to the semantic layer, and for the same reason: the
// classification lives in the browser that has the trace. So the server
// treats what arrives as a shape to be rebuilt rather than a value to be
// trusted — every string re-clipped, every unknown field dropped, the
// numbers clamped. What a page can do is describe itself badly; what it
// cannot do is make the narrator read something longer than this.
export function readStory(input: unknown): Story | null {
  if (!input || typeof input !== "object") return null;
  const x = input as Record<string, unknown>;
  const list = Array.isArray(x.episodes) ? x.episodes : null;
  if (!list || !list.length) return null;
  const episodes: StoryEpisode[] = [];
  for (const row of list.slice(0, MAX_EPISODES)) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const text = (k: string, max: number): string | null => (typeof r[k] === "string" && r[k] ? clip(r[k] as string, max) : null);
    const description = text("description", LIMIT.description);
    const sub = text("sub", LIMIT.sub);
    if (!description || !sub) continue;
    const said = Array.isArray(r.said) ? r.said : [];
    episodes.push({
      n: num(r.n, 0, 100_000),
      broad: typeof r.broad === "string" ? (r.broad as Broad) : "UNCLEAR",
      sub,
      durationMs: num(r.durationMs, 0, 86_400_000),
      where: text("where", LIMIT.where) ?? "the interface",
      description,
      wrote: text("wrote", LIMIT.wrote),
      said: said.slice(0, MAX_SAID).flatMap((s) => {
        if (!s || typeof s !== "object") return [];
        const a = s as Record<string, unknown>;
        if (typeof a.channel !== "string" || typeof a.text !== "string" || !a.text) return [];
        return [{ channel: clip(a.channel, LIMIT.channel), text: clip(a.text, LIMIT.said) }];
      }),
    });
  }
  if (!episodes.length) return null;
  return {
    taxonomy: typeof x.taxonomy === "string" ? clip(x.taxonomy, LIMIT.taxonomy) : "unknown",
    spanMs: num(x.spanMs, 0, 86_400_000),
    episodeCount: num(x.episodeCount, 0, 100_000) || episodes.length,
    unclearShare: Math.min(1, Math.max(0, typeof x.unclearShare === "number" && Number.isFinite(x.unclearShare) ? x.unclearShare : 0)),
    truncated: x.truncated === true,
    episodes,
  };
}

const num = (v: unknown, lo: number, hi: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : lo;

// How long something went on, in a sentence rather than a column. The
// same spelling the taxonomy uses, kept here so that a story can be read
// without importing one.
export function spell(msTotal: number): string {
  const s = Math.round(msTotal / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest ? `${m}m ${rest}s` : `${m}m`;
}

// The story as the narrator reads it. Numbered, so a reading can be
// argued with line by line, and with the content quoted rather than
// paraphrased — what was written and what was shown are the only things
// here that a summary may take a fact from.
export function renderStory(story: Story): string {
  const head = [
    `A session of ${spell(story.spanMs)}, read as ${story.episodeCount} episodes of activity.`,
    `${Math.round(story.unclearShare * 100)}% of that time is unaccounted for: the interface recorded nothing, and nothing can be said about it.`,
    story.truncated ? "This list is cut: the session holds more episodes than are shown." : "",
  ].filter(Boolean).join("\n");
  const lines = story.episodes.map((e) => {
    const out = [`${e.n}. ${e.broad} / ${e.sub} · ${spell(e.durationMs)} · ${e.where}`, `   ${e.description}`];
    if (e.wrote) out.push(`   they wrote: ${JSON.stringify(e.wrote)}`);
    for (const s of e.said) out.push(`   the ${s.channel} showed them: ${JSON.stringify(s.text)}`);
    return out.join("\n");
  });
  return `${head}\n\nEpisodes:\n${lines.join("\n")}`;
}

// ---- when is a timeline the same timeline
//
// The same question lib/semantics/signature.ts asks about an interface,
// asked about a session, and answered the same way: a policy, kept
// beside the thing it decides, with the parts it was computed from held
// so that a miss can be explained rather than asserted.
//
// What counts is the shape and the words: which behaviours, in what
// order, with what written and what shown. What does not count is an
// episode's id, which carries stage ids that are minted per run; its
// confidence; or its duration to the millisecond. A wait that took four
// seconds and a wait that took five are the same session. A wait that
// took four seconds and a silence that took two minutes are not, which
// is why duration counts in buckets rather than not at all.
// Named by what they mean rather than by their edges: an instant is a
// send, and everything above it is a stretch somebody spent.
export const bucket = (durationMs: number): string =>
  durationMs < 1_000 ? "instant"
    : durationMs < 10_000 ? "brief"
    : durationMs < 30_000 ? "short"
    : durationMs < 120_000 ? "medium"
    : durationMs < 600_000 ? "long"
    : "very-long";

// A hash a browser can compute. Not a cryptographic one and not asked to
// be: it names an entry in a cache that lives for as long as a tab does,
// and the value it keys is held under the full string it was made from,
// so a collision cannot return the wrong summary.
function fnv(s: string, seed: number): string {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export type StoryKey = {
  // Short, for showing a person which reading they are looking at.
  key: string;
  // The whole of what it was computed from. This is what a cache is
  // actually keyed on, so that two different sessions can never share an
  // entry however the hash falls.
  canonical: string;
  parts: string[];
};

export function storyKey(story: Story): StoryKey {
  const parts = story.episodes.map((e) =>
    [e.sub, bucket(e.durationMs), e.where, e.wrote ?? "", ...e.said.map((s) => `${s.channel}:${s.text}`)].join("|"),
  );
  const canonical = [story.taxonomy, `n=${story.episodeCount}`, bucket(story.spanMs), ...parts].join("\n");
  return { key: `${fnv(canonical, 0x811c9dc5)}${fnv(canonical, 0x9e3779b9)}`, canonical, parts };
}
