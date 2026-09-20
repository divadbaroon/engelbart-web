// A profile, turned into the thing the classifier already consults.
//
// The classifier takes a Taxonomy: closures that match elements and
// closures that read evidence. This file builds those closures from data.
// Nothing else in the Activity layer changes, and nothing else needs to
// know a profile exists — which is the point of compiling rather than
// interpreting. A generated profile runs through exactly the code a
// handwritten taxonomy runs through, so the two can be compared without
// wondering whether the comparison is fair.
//
// Everything here is total. A profile that reached this file has been
// through validate.ts; where a value could still be missing at runtime —
// a channel that said nothing, a text source with nothing in it — the
// answer is the empty string or false, never an exception. A reading that
// throws would take a page down over a sentence.
import { anchor as handwritten, count, gist, plain, said, spell, type Context, type Reading, type Rule, type Taxonomy } from "@/lib/activity/taxonomy";
import type { Appearance } from "@/lib/activity/segment";
import type { ElementTarget } from "@/lib/trace/types";
import type { Confidence, Episode, SurfaceRole } from "@/lib/activity/types";
import {
  anchorForm,
  type Anchor, type ArtifactProfile, type ConfidenceSpec, type EpisodeTest,
  type Op, type Pred, type StringTest, type Template, type TextSource,
} from "@/lib/activity/profile/schema";

// ---- strings
//
// A glob becomes a pattern here, inside the machinery, and never comes in
// as one. That is the whole of the difference: this file knows the
// pattern is anchored at both ends, that `*` is the only special
// character, and that everything else was escaped.
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const globs = new Map<string, RegExp>();
const globPattern = (glob: string): RegExp => {
  let re = globs.get(glob);
  if (!re) {
    re = new RegExp(`^${glob.split("*").map(escape).join("(.*)")}$`);
    globs.set(glob, re);
  }
  return re;
};

// What a glob stood for, or null where it did not match.
export function globCaptures(glob: string, value: string): string[] | null {
  const m = globPattern(glob).exec(value);
  return m ? m.slice(1) : null;
}

// How many holes a glob has, so a label that fills them can be checked
// before anything runs.
export const globArity = (glob: string): number => glob.split("*").length - 1;

type StringMatch = (value: string | undefined) => boolean;

// `fold` is how the field is read: exactly, for something the interface
// chose to call an element, and as somebody would read it, for wording.
function compileStringTest(test: StringTest, fold: (s: string) => string): StringMatch {
  if ("equals" in test) {
    const wanted = (Array.isArray(test.equals) ? test.equals : [test.equals]).map(fold);
    return (v) => v !== undefined && wanted.includes(fold(v));
  }
  if ("prefix" in test) { const p = fold(test.prefix); return (v) => v !== undefined && fold(v).startsWith(p); }
  if ("suffix" in test) { const p = fold(test.suffix); return (v) => v !== undefined && fold(v).endsWith(p); }
  if ("contains" in test) { const p = fold(test.contains); return (v) => v !== undefined && fold(v).includes(p); }
  if ("glob" in test) { const g = test.glob; return (v) => v !== undefined && globCaptures(g, fold(v)) !== null; }
  return (v) => v !== undefined && v.trim() !== "";
}

const exactly = (s: string): string => s;

// ---- anchors
//
// Which field each form reads, and how that field is compared. The
// wording fields are folded because a person reading the screen does not
// see the difference between two spaces and one; the rest are not,
// because a test id that differs in case is a different test id.
const FIELD: Record<string, { of: (t: ElementTarget) => string | undefined; fold: (s: string) => string }> = {
  testid: { of: (t) => t.testid, fold: exactly }, appId: { of: (t) => t.appId, fold: exactly },
  appIdAttr: { of: (t) => t.appIdAttr, fold: exactly },
  elementId: { of: (t) => t.id, fold: exactly },
  role: { of: (t) => t.role, fold: exactly },
  label: { of: (t) => t.label, fold: plain },
  fieldName: { of: (t) => t.name, fold: exactly },
  inputType: { of: (t) => t.type, fold: exactly },
  placeholder: { of: (t) => t.placeholder, fold: plain },
  editable: { of: (t) => t.editable, fold: exactly },
  title: { of: (t) => t.title, fold: plain },
  href: { of: (t) => t.href, fold: exactly },
  // What the control reads as, which is its words or, where it has none
  // a person can see, the label it carries. The same reading the
  // handwritten helper gives, so the two agree about every button.
  text: { of: (t) => t.text ?? t.label, fold: plain },
  tag: { of: (t) => t.tag, fold: exactly },
  selector: { of: (t) => t.selector, fold: exactly },
};

// The accessible name: what would be announced. The label wins where
// there is one, because that is what it is for.
const accessibleName = (t: ElementTarget): string | undefined => t.label ?? t.text;

export function compileAnchor(a: Anchor): (t: ElementTarget) => boolean {
  const form = anchorForm(a);
  if (form === "all") { const parts = (a as { all: Anchor[] }).all.map(compileAnchor); return (t) => parts.every((f) => f(t)); }
  if (form === "any") { const parts = (a as { any: Anchor[] }).any.map(compileAnchor); return (t) => parts.some((f) => f(t)); }
  if (form === "not") { const one = compileAnchor((a as { not: Anchor }).not); return (t) => !one(t); }
  if (form === "role") {
    const spec = a as { role: StringTest; name?: StringTest };
    const role = compileStringTest(spec.role, exactly);
    const named = spec.name ? compileStringTest(spec.name, plain) : null;
    return (t) => role(t.role) && (!named || named(accessibleName(t)));
  }
  if (form === "classes") {
    const test = compileStringTest((a as { classes: StringTest }).classes, exactly);
    return (t) => !!t.classes && t.classes.some((c) => test(c));
  }
  if (form && FIELD[form]) {
    const field = FIELD[form];
    const test = compileStringTest((a as Record<string, StringTest>)[form], field.fold);
    return (t) => test(field.of(t));
  }
  // Unreachable for a validated profile, and false rather than thrown for
  // one that was not: an anchor nobody understands matches nothing.
  return () => false;
}

// ---- reading evidence
const compare = (op: Op, left: number, right: number): boolean => {
  switch (op) {
    case "eq": return left === right;
    case "ne": return left !== right;
    case "lt": return left < right;
    case "lte": return left <= right;
    case "gt": return left > right;
    case "gte": return left >= right;
  }
};

// The most recent thing a channel said, anywhere earlier in the session.
const latestSaid = (c: Context, channel: string): string | null => {
  for (let i = c.before.length - 1; i >= 0; i--) {
    const text = said(c.before[i].evidence, channel);
    if (text) return text;
  }
  return null;
};

function compileEpisodeTest(test: EpisodeTest): (e: Episode) => boolean {
  if ("all" in test) { const parts = test.all.map(compileEpisodeTest); return (e) => parts.every((f) => f(e)); }
  if ("any" in test) { const parts = test.any.map(compileEpisodeTest); return (e) => parts.some((f) => f(e)); }
  if ("not" in test) { const one = compileEpisodeTest(test.not); return (e) => !one(e); }
  if ("sub" in test) { const subs = test.sub; return (e) => subs.includes(e.subBehavior); }
  if ("broad" in test) { const broads = test.broad; return (e) => broads.includes(e.broadBehavior); }
  if ("surfaceRole" in test) { const roles = test.surfaceRole; return (e) => roles.includes(e.evidence.surface.role); }
  const channel = test.channelSaid;
  return (e) => !!said(e.evidence, channel);
}

export function compilePred(pred: Pred, keySets: Map<string, Set<string>>): (c: Context) => boolean {
  if ("all" in pred) { const parts = pred.all.map((p) => compilePred(p, keySets)); return (c) => parts.every((f) => f(c)); }
  if ("any" in pred) { const parts = pred.any.map((p) => compilePred(p, keySets)); return (c) => parts.some((f) => f(c)); }
  if ("not" in pred) { const one = compilePred(pred.not, keySets); return (c) => !one(c); }
  if ("always" in pred) return () => true;
  if ("flag" in pred) {
    const flag = pred.flag;
    return (c) => !!c.evidence[flag];
  }
  if ("surfaceRole" in pred) { const roles = pred.surfaceRole; return (c) => roles.includes(c.evidence.surface.role); }
  if ("acts" in pred) {
    const { of, op, value } = pred.acts;
    return (c) => compare(op, of.reduce((n, f) => n + c.evidence.acts[f], 0), value);
  }
  if ("duration" in pred) { const { op, ms } = pred.duration; return (c) => compare(op, c.durationMs, ms); }
  if ("quiet" in pred) { const { op, ms } = pred.quiet; return (c) => compare(op, c.evidence.quietMs, ms); }
  if ("openingQuiet" in pred) { const { op, ms } = pred.openingQuiet; return (c) => compare(op, c.evidence.openingQuietMs, ms); }
  if ("quietRatio" in pred) { const { op, value } = pred.quietRatio; return (c) => compare(op, c.evidence.quietMs, c.durationMs * value); }
  if ("controlUsed" in pred) { const ids = pred.controlUsed; return (c) => ids.some((id) => c.evidence.controls.includes(id)); }
  if ("enteredBy" in pred) { const ids = pred.enteredBy; return (c) => ids.some((id) => c.evidence.entered_by.includes(id)); }
  if ("keysIn" in pred) {
    const set = keySets.get(pred.keysIn) ?? new Set<string>();
    return (c) => c.evidence.keyNames.some((k) => set.has(k));
  }
  if ("channelSaid" in pred) { const id = pred.channelSaid; return (c) => !!said(c.evidence, id); }
  if ("latestChannelSaid" in pred) { const id = pred.latestChannelSaid; return (c) => !!latestSaid(c, id); }
  if ("index" in pred) { const { op, value } = pred.index; return (c) => compare(op, c.index, value); }
  if ("history" in pred) {
    const { window, test } = pred.history;
    const one = compileEpisodeTest(test);
    return (c) => (window === "all" ? c.before : c.before.slice(-window)).some(one);
  }
  return () => false;
}

// ---- saying it
function compileTextSource(source: TextSource): (c: Context) => string | null {
  if ("channel" in source) { const id = source.channel; return (c) => said(c.evidence, id); }
  if ("entered" in source) return (c) => c.evidence.entered;
  if ("latestChannel" in source) { const id = source.latestChannel; return (c) => latestSaid(c, id); }
  const parts = source.firstOf.map(compileTextSource);
  return (c) => {
    for (const part of parts) { const text = part(c); if (text) return text; }
    return null;
  };
}

export function compileTemplate(tpl: Template, keySets: Map<string, Set<string>>): (c: Context) => string {
  if ("lit" in tpl) { const text = tpl.lit; return () => text; }
  if ("join" in tpl) { const parts = tpl.join.map((t) => compileTemplate(t, keySets)); return (c) => parts.map((f) => f(c)).join(""); }
  if ("duration" in tpl) return (c) => spell(c.durationMs);
  if ("count" in tpl) {
    const { of, one, many } = tpl.count;
    return (c) => count(of.reduce((n, f) => n + c.evidence.acts[f], 0), one, many);
  }
  if ("quote" in tpl) {
    const source = compileTextSource(tpl.quote.source);
    const max = tpl.quote.max;
    return (c) => { const text = source(c); return text ? `“${gist(text, max)}”` : ""; };
  }
  if ("field" in tpl) {
    const which = tpl.field;
    return (c) => (which === "surfaceLabel" ? c.evidence.surface.label : c.evidence.discontinuity ?? "");
  }
  if ("keys" in tpl) {
    const set = keySets.get(tpl.keys.in) ?? new Set<string>();
    const glue = tpl.keys.join ?? ", ";
    return (c) => c.evidence.keyNames.filter((k) => set.has(k)).join(glue);
  }
  const branches = tpl.cond.map((b) => ({ when: compilePred(b.when, keySets), then: compileTemplate(b.then, keySets) }));
  const otherwise = compileTemplate(tpl.else, keySets);
  return (c) => {
    for (const branch of branches) if (branch.when(c)) return branch.then(c);
    return otherwise(c);
  };
}

function compileConfidence(spec: ConfidenceSpec | undefined, keySets: Map<string, Set<string>>): (c: Context) => Confidence {
  // The same default the handwritten taxonomies carry, said out loud: a
  // rule that does not choose is claiming the act itself is in the trace.
  if (spec === undefined) return () => "high";
  if (typeof spec === "string") return () => spec;
  const branches = spec.cond.map((b) => ({ when: compilePred(b.when, keySets), then: b.then }));
  return (c) => {
    for (const branch of branches) if (branch.when(c)) return branch.then;
    return spec.else;
  };
}

// ---- the whole thing
export type CompiledProfile = {
  taxonomy: Taxonomy;
  surfaceOf: (key: string) => { label: string; role: SurfaceRole };
  // Which surface spec named a key, for the fit report. Null is the
  // unnamed case, where the key stands for itself.
  surfaceMatch: (key: string) => string | null;
  // The rule ids, in the order the compiled taxonomy holds them, so a
  // report can say which rule read an episode rather than only which
  // behaviour came out.
  ruleIds: string[];
  fallbackId: string;
};

const fill = (label: string, key: string, captures: string[]): string =>
  label.replace(/\{(key|\d+)\}/g, (_, token: string) => (token === "key" ? key : captures[Number(token) - 1] ?? ""));

export function compileProfile(profile: ArtifactProfile): CompiledProfile {
  const keySets = new Map((profile.keySets ?? []).map((s) => [s.id, new Set(s.keys)]));

  const surfaces = profile.surfaces.map((s) => ({
    spec: s,
    match: (key: string): string[] | null => {
      if ("glob" in s.match) return globCaptures(s.match.glob, key);
      return compileStringTest(s.match, exactly)(key) ? [] : null;
    },
  }));
  const found = (key: string) => { for (const s of surfaces) { const caps = s.match(key); if (caps) return { s, caps }; } return null; };
  const surfaceOf = (key: string): { label: string; role: SurfaceRole } => {
    const hit = found(key);
    // A key nothing names stands for itself, and its role is "other", so
    // every rule that asks about a named document fails closed rather
    // than quietly matching the wrong one.
    return hit ? { label: fill(hit.s.spec.label, key, hit.caps), role: hit.s.spec.role } : { label: key, role: "other" };
  };

  // The record the Taxonomy type carries. Only the specs that name one
  // key exactly can live in it; the rest are shapes, and are why
  // `surfaceOf` is what the classifier is given.
  const table: Taxonomy["surfaces"] = {};
  for (const s of profile.surfaces) {
    if (!("equals" in s.match)) continue;
    for (const key of Array.isArray(s.match.equals) ? s.match.equals : [s.match.equals]) table[key] = { label: fill(s.label, key, []), role: s.role };
  }

  const channels: Taxonomy["channels"] = profile.channels.map((c) => {
    const container = c.container ? compileAnchor(c.container) : null;
    const text = c.text ? compileStringTest(c.text, plain) : null;
    return {
      id: c.id, label: c.label, from: c.from,
      is: (a: Appearance) => (!container || (!!a.container && container(a.container))) && (!text || text(a.text)),
    };
  });

  const controls: Taxonomy["controls"] = profile.controls.map((c) => ({
    id: c.id, label: c.label, moment: c.moment,
    is: compileAnchor(c.anchor),
  }));

  const asRule = (r: ArtifactProfile["rules"][number] | ArtifactProfile["fallback"], when: (c: Context) => boolean): Rule => {
    const description = compileTemplate(r.description, keySets);
    const because = compileTemplate(r.because, keySets);
    const confidence = compileConfidence(r.confidence, keySets);
    return { sub: r.sub, broad: r.broad, when, read: (c: Context): Reading => ({ description: description(c), because: because(c), confidence: confidence(c) }) };
  };

  // Lower priority first, and ties broken by id rather than by the order
  // somebody wrote them in, so that reordering the file cannot change a
  // reading.
  const ordered = [...profile.rules].sort((a, b) => a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    taxonomy: {
      name: profile.artifact.name,
      surfaces: table,
      channels,
      controls,
      rules: ordered.map((r) => asRule(r, compilePred(r.when, keySets))),
      fallback: asRule(profile.fallback, () => true),
    },
    surfaceOf,
    surfaceMatch: (key) => found(key)?.s.spec.id ?? null,
    ruleIds: ordered.map((r) => r.id),
    fallbackId: profile.fallback.id,
  };
}

// Kept so the handwritten helpers and the compiled ones cannot drift
// apart unnoticed: if `anchor` grows a form, this is where a profile
// would have to grow one too.
export const HANDWRITTEN_ANCHOR_FORMS = Object.keys(handwritten);
