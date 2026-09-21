// Reading a profile before it runs.
//
// A handwritten taxonomy is checked by the compiler that compiles it: a
// rule that asks about a control nobody defined does not build. Data has
// no such protection, and a profile that was written by a model has no
// author to ask. So everything the type system would have caught is
// caught here instead, and said in terms of where in the profile it is.
//
// Two rules about how this behaves, both of which matter more than what
// it catches. It never throws: a profile is checked in front of a person
// who wants to know what is wrong with it, not in a crash. And it never
// stops at the first problem: a report listing one error at a time turns
// a five-minute fix into five rounds.
//
// The difference between an error and a warning is whether the profile
// can run. An anchor nobody understands is an error. An anchor that rests
// entirely on where an element sat is a warning — it will run, and it
// will stop being true the next time the layout moves, and somebody
// should know that before they trust what it says.
import { BROAD, SURFACE_ROLES } from "@/lib/activity/types";
import { globArity } from "@/lib/activity/profile/compile";
import {
  ACT_FIELDS, ANCHOR_FORMS, EPISODE_TEST_FORMS, FLAGS, OPS, PRED_FORMS, TEMPLATE_FIELDS, TEMPLATE_FORMS,
  WEAKEST_RUNG, positional, rung,
  type Anchor, type ArtifactProfile,
} from "@/lib/activity/profile/schema";

export type Severity = "error" | "warning";
export type ProfileIssue = {
  // Where in the profile, as a path somebody can follow: rules[3].when.any[0].
  path: string;
  code: string;
  message: string;
  severity: Severity;
};

export type ValidationResult =
  | { ok: true; profile: ArtifactProfile; issues: ProfileIssue[] }
  | { ok: false; issues: ProfileIssue[] };

const rec = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const CONFIDENCES = ["high", "medium", "low"];
const GROUNDINGS = ["source", "abstraction", "inference"];

class Check {
  readonly issues: ProfileIssue[] = [];
  // Ids a rule may refer to. Gathered first, so that a rule mentioning a
  // control defined further down the file is fine and a rule mentioning
  // one that does not exist is not.
  controls = new Set<string>();
  channels = new Set<string>();
  keySets = new Set<string>();

  err(path: string, code: string, message: string) { this.issues.push({ path, code, message, severity: "error" }); }
  warn(path: string, code: string, message: string) { this.issues.push({ path, code, message, severity: "warning" }); }

  // Exactly one of a set of forms, which is what makes these unions safe
  // to compile: two keys would mean the compiler silently picked one.
  form(path: string, value: unknown, forms: readonly string[], what: string): string | null {
    const o = rec(value);
    if (!o) { this.err(path, `${what}.shape`, `a ${what} must be an object`); return null; }
    const present = forms.filter((f) => f in o);
    if (!present.length) {
      this.err(path, `${what}.unknown`, `no ${what} form here; expected one of ${forms.join(", ")}`);
      return null;
    }
    // `role` carries an optional `name` beside it, and that is the one
    // place two keys are a single form rather than two.
    const extra = present.filter((f) => f !== present[0]);
    if (extra.length) this.err(path, `${what}.ambiguous`, `more than one ${what} form here: ${present.join(", ")}`);
    return present[0];
  }

  ids<T>(path: string, list: T[], of: (x: T) => unknown, what: string): Set<string> {
    const seen = new Set<string>();
    list.forEach((item, i) => {
      const id = of(item);
      if (!isStr(id) || !id.trim()) { this.err(`${path}[${i}].id`, `${what}.id`, `every ${what} needs an id`); return; }
      if (seen.has(id)) this.err(`${path}[${i}].id`, `${what}.duplicate`, `two ${what}s share the id "${id}"`);
      seen.add(id);
    });
    return seen;
  }

  stringTest(path: string, value: unknown) {
    const o = rec(value);
    if (!o) { this.err(path, "test.shape", "a string test must be an object"); return; }
    const forms = ["equals", "prefix", "suffix", "contains", "glob", "present"];
    const present = forms.filter((f) => f in o);
    if (present.length !== 1) {
      this.err(path, "test.form", present.length ? `more than one string test here: ${present.join(", ")}` : `no string test here; expected one of ${forms.join(", ")}`);
      return;
    }
    const [form] = present;
    if (form === "equals") {
      const v = o.equals;
      const list = Array.isArray(v) ? v : [v];
      if (!list.length) this.err(path, "test.empty", "equals needs something to equal");
      for (const x of list) if (!isStr(x)) this.err(path, "test.type", "equals takes a string or a list of strings");
      return;
    }
    if (form === "present") { if (o.present !== true) this.err(path, "test.type", "present is written as { present: true }"); return; }
    if (!isStr(o[form]) || !(o[form] as string).length) this.err(path, "test.type", `${form} takes a non-empty string`);
  }

  anchor(path: string, value: unknown) {
    const form = this.form(path, value, ANCHOR_FORMS, "anchor");
    if (!form) return;
    const o = rec(value)!;
    if (form === "all" || form === "any") {
      const parts = o[form];
      if (!Array.isArray(parts) || !parts.length) { this.err(`${path}.${form}`, "anchor.empty", `${form} needs at least one anchor`); return; }
      parts.forEach((p, i) => this.anchor(`${path}.${form}[${i}]`, p));
      return;
    }
    if (form === "not") { this.anchor(`${path}.not`, o.not); return; }
    if (form === "role") {
      this.stringTest(`${path}.role`, o.role);
      if ("name" in o) this.stringTest(`${path}.name`, o.name);
      return;
    }
    this.stringTest(`${path}.${form}`, o[form]);
  }

  // Anchors are allowed to rest on where something sat. They are not
  // allowed to do it quietly.
  anchorStrength(path: string, a: Anchor, what: string) {
    if (rung(a) >= WEAKEST_RUNG && positional(a)) {
      this.warn(path, "anchor.positional", `this ${what} is identified only by where it sat on the page, which stops being true when the layout moves`);
    }
  }

  pred(path: string, value: unknown): void {
    const form = this.form(path, value, PRED_FORMS, "predicate");
    if (!form) return;
    const o = rec(value)!;
    switch (form) {
      case "all": case "any": {
        const parts = o[form];
        if (!Array.isArray(parts) || !parts.length) { this.err(`${path}.${form}`, "predicate.empty", `${form} needs at least one predicate`); return; }
        parts.forEach((p, i) => this.pred(`${path}.${form}[${i}]`, p));
        return;
      }
      case "not": return this.pred(`${path}.not`, o.not);
      case "always": if (o.always !== true) this.err(path, "predicate.type", "always is written as { always: true }"); return;
      case "flag": if (!isStr(o.flag) || !FLAGS.includes(o.flag as never)) this.err(`${path}.flag`, "predicate.flag", `unknown evidence flag; expected one of ${FLAGS.join(", ")}`); return;
      case "surfaceRole": return this.roles(`${path}.surfaceRole`, o.surfaceRole);
      case "acts": {
        const spec = rec(o.acts);
        if (!spec) { this.err(`${path}.acts`, "predicate.shape", "acts takes { of, op, value }"); return; }
        const of = spec.of;
        if (!Array.isArray(of) || !of.length) this.err(`${path}.acts.of`, "predicate.acts", "acts.of needs at least one act to count");
        else for (const f of of) if (!isStr(f) || !ACT_FIELDS.includes(f as never)) this.err(`${path}.acts.of`, "predicate.acts", `unknown act "${String(f)}"; expected one of ${ACT_FIELDS.join(", ")}`);
        this.op(`${path}.acts`, spec.op);
        if (!isNum(spec.value)) this.err(`${path}.acts.value`, "predicate.type", "acts.value must be a number");
        return;
      }
      case "duration": case "quiet": case "openingQuiet": {
        const spec = rec(o[form]);
        if (!spec) { this.err(`${path}.${form}`, "predicate.shape", `${form} takes { op, ms }`); return; }
        this.op(`${path}.${form}`, spec.op);
        if (!isNum(spec.ms)) this.err(`${path}.${form}.ms`, "predicate.type", `${form}.ms must be a number of milliseconds`);
        return;
      }
      case "quietRatio": {
        const spec = rec(o.quietRatio);
        if (!spec) { this.err(`${path}.quietRatio`, "predicate.shape", "quietRatio takes { op, value }"); return; }
        this.op(`${path}.quietRatio`, spec.op);
        if (!isNum(spec.value) || spec.value < 0 || spec.value > 1) this.err(`${path}.quietRatio.value`, "predicate.range", "quietRatio.value is a share of the stretch, between 0 and 1");
        return;
      }
      case "controlUsed": case "enteredBy": return this.refs(`${path}.${form}`, o[form], this.controls, "control");
      case "keysIn": return this.ref(`${path}.keysIn`, o.keysIn, this.keySets, "key set");
      case "channelSaid": case "latestChannelSaid": return this.ref(`${path}.${form}`, o[form], this.channels, "channel");
      case "index": {
        const spec = rec(o.index);
        if (!spec) { this.err(`${path}.index`, "predicate.shape", "index takes { op, value }"); return; }
        this.op(`${path}.index`, spec.op);
        if (!isNum(spec.value)) this.err(`${path}.index.value`, "predicate.type", "index.value must be a number");
        return;
      }
      case "history": {
        const spec = rec(o.history);
        if (!spec) { this.err(`${path}.history`, "predicate.shape", "history takes { window, test }"); return; }
        if (spec.window !== "all" && !(isNum(spec.window) && spec.window >= 1 && Number.isInteger(spec.window))) {
          this.err(`${path}.history.window`, "predicate.window", 'history.window is "all" or a whole number of episodes to look back over');
        }
        this.episodeTest(`${path}.history.test`, spec.test);
        return;
      }
    }
  }

  episodeTest(path: string, value: unknown): void {
    const form = this.form(path, value, EPISODE_TEST_FORMS, "episode test");
    if (!form) return;
    const o = rec(value)!;
    if (form === "all" || form === "any") {
      const parts = o[form];
      if (!Array.isArray(parts) || !parts.length) { this.err(`${path}.${form}`, "episode test.empty", `${form} needs at least one test`); return; }
      parts.forEach((p, i) => this.episodeTest(`${path}.${form}[${i}]`, p));
      return;
    }
    if (form === "not") return this.episodeTest(`${path}.not`, o.not);
    if (form === "sub") {
      const subs = o.sub;
      if (!Array.isArray(subs) || !subs.length) this.err(`${path}.sub`, "episode test.empty", "sub needs at least one behaviour name");
      else for (const s of subs) if (!isStr(s)) this.err(`${path}.sub`, "episode test.type", "sub takes behaviour names");
      return;
    }
    if (form === "broad") {
      const broads = o.broad;
      if (!Array.isArray(broads) || !broads.length) { this.err(`${path}.broad`, "episode test.empty", "broad needs at least one class"); return; }
      for (const b of broads) if (!isStr(b) || !BROAD.includes(b as never)) this.err(`${path}.broad`, "broad.unknown", `"${String(b)}" is not one of the ${BROAD.length} broad classes`);
      return;
    }
    if (form === "surfaceRole") return this.roles(`${path}.surfaceRole`, o.surfaceRole);
    return this.ref(`${path}.channelSaid`, o.channelSaid, this.channels, "channel");
  }

  template(path: string, value: unknown) {
    const form = this.form(path, value, TEMPLATE_FORMS, "template");
    if (!form) return;
    const o = rec(value)!;
    switch (form) {
      case "lit": if (!isStr(o.lit)) this.err(`${path}.lit`, "template.type", "lit takes a string"); return;
      case "join": {
        const parts = o.join;
        if (!Array.isArray(parts) || !parts.length) { this.err(`${path}.join`, "template.empty", "join needs at least one piece"); return; }
        parts.forEach((p, i) => this.template(`${path}.join[${i}]`, p));
        return;
      }
      case "duration": if (o.duration !== true) this.err(path, "template.type", "duration is written as { duration: true }"); return;
      case "count": {
        const spec = rec(o.count);
        if (!spec) { this.err(`${path}.count`, "template.shape", "count takes { of, one, many }"); return; }
        const of = spec.of;
        if (!Array.isArray(of) || !of.length) this.err(`${path}.count.of`, "template.count", "count.of needs at least one act to count");
        else for (const f of of) if (!isStr(f) || !ACT_FIELDS.includes(f as never)) this.err(`${path}.count.of`, "template.count", `unknown act "${String(f)}"`);
        if (!isStr(spec.one)) this.err(`${path}.count.one`, "template.type", "count.one is the singular word");
        if ("many" in spec && !isStr(spec.many)) this.err(`${path}.count.many`, "template.type", "count.many is the plural word");
        return;
      }
      case "quote": {
        const spec = rec(o.quote);
        if (!spec) { this.err(`${path}.quote`, "template.shape", "quote takes { source, max }"); return; }
        this.textSource(`${path}.quote.source`, spec.source);
        if (!isNum(spec.max) || spec.max < 1) this.err(`${path}.quote.max`, "template.range", "quote.max is how many characters to keep, at least 1");
        return;
      }
      case "field": if (!isStr(o.field) || !TEMPLATE_FIELDS.includes(o.field as never)) this.err(`${path}.field`, "template.field", `unknown field; expected one of ${TEMPLATE_FIELDS.join(", ")}`); return;
      case "keys": {
        const spec = rec(o.keys);
        if (!spec) { this.err(`${path}.keys`, "template.shape", "keys takes { in, join }"); return; }
        this.ref(`${path}.keys.in`, spec.in, this.keySets, "key set");
        if ("join" in spec && !isStr(spec.join)) this.err(`${path}.keys.join`, "template.type", "keys.join is the string between them");
        return;
      }
      case "cond": {
        const branches = o.cond;
        if (!Array.isArray(branches) || !branches.length) this.err(`${path}.cond`, "template.empty", "cond needs at least one branch");
        else branches.forEach((b, i) => {
          const branch = rec(b);
          if (!branch) { this.err(`${path}.cond[${i}]`, "template.shape", "a branch is { when, then }"); return; }
          this.pred(`${path}.cond[${i}].when`, branch.when);
          this.template(`${path}.cond[${i}].then`, branch.then);
        });
        if (!("else" in o)) this.err(path, "template.else", "cond needs an else: a sentence has to come out either way");
        else this.template(`${path}.else`, o.else);
        return;
      }
    }
  }

  textSource(path: string, value: unknown) {
    const o = rec(value);
    if (!o) { this.err(path, "source.shape", "a text source must be an object"); return; }
    const forms = ["channel", "entered", "latestChannel", "firstOf"];
    const present = forms.filter((f) => f in o);
    if (present.length !== 1) {
      this.err(path, "source.form", present.length ? `more than one text source here: ${present.join(", ")}` : `no text source here; expected one of ${forms.join(", ")}`);
      return;
    }
    const [form] = present;
    if (form === "entered") { if (o.entered !== true) this.err(path, "source.type", "entered is written as { entered: true }"); return; }
    if (form === "firstOf") {
      const parts = o.firstOf;
      if (!Array.isArray(parts) || !parts.length) { this.err(`${path}.firstOf`, "source.empty", "firstOf needs at least one source"); return; }
      parts.forEach((p, i) => this.textSource(`${path}.firstOf[${i}]`, p));
      return;
    }
    this.ref(`${path}.${form}`, o[form], this.channels, "channel");
  }

  confidence(path: string, value: unknown) {
    if (value === undefined) return;
    if (isStr(value)) { if (!CONFIDENCES.includes(value)) this.err(path, "confidence.unknown", `unknown confidence "${value}"; expected ${CONFIDENCES.join(", ")}`); return; }
    const o = rec(value);
    if (!o || !Array.isArray(o.cond)) { this.err(path, "confidence.shape", "confidence is a word, or { cond, else }"); return; }
    o.cond.forEach((b, i) => {
      const branch = rec(b);
      if (!branch) { this.err(`${path}.cond[${i}]`, "confidence.shape", "a branch is { when, then }"); return; }
      this.pred(`${path}.cond[${i}].when`, branch.when);
      if (!isStr(branch.then) || !CONFIDENCES.includes(branch.then)) this.err(`${path}.cond[${i}].then`, "confidence.unknown", "a branch must name a confidence");
    });
    if (!isStr(o.else) || !CONFIDENCES.includes(o.else as string)) this.err(`${path}.else`, "confidence.unknown", "confidence needs an else");
  }

  op(path: string, value: unknown) {
    if (!isStr(value) || !OPS.includes(value as never)) this.err(`${path}.op`, "op.unknown", `unknown comparison; expected one of ${OPS.join(", ")}`);
  }

  roles(path: string, value: unknown) {
    if (!Array.isArray(value) || !value.length) { this.err(path, "role.empty", "needs at least one surface role"); return; }
    for (const r of value) if (!isStr(r) || !SURFACE_ROLES.includes(r as never)) this.err(path, "role.unknown", `"${String(r)}" is not a surface role; expected one of ${SURFACE_ROLES.join(", ")}`);
  }

  ref(path: string, value: unknown, known: Set<string>, what: string) {
    if (!isStr(value)) { this.err(path, `${what}.type`, `expected the id of a ${what}`); return; }
    if (!known.has(value)) this.err(path, `${what}.undefined`, `no ${what} called "${value}" is defined in this profile`);
  }

  refs(path: string, value: unknown, known: Set<string>, what: string) {
    if (!Array.isArray(value) || !value.length) { this.err(path, `${what}.empty`, `needs at least one ${what} id`); return; }
    value.forEach((v, i) => this.ref(`${path}[${i}]`, v, known, what));
  }

  provenance(path: string, value: unknown, what: string) {
    if (value === undefined) return;
    const o = rec(value);
    if (!o) { this.err(path, "generation.shape", "generation is { confidence, grounding, ev, note }"); return; }
    if (!isStr(o.confidence) || !CONFIDENCES.includes(o.confidence)) this.err(`${path}.confidence`, "generation.confidence", "generation.confidence says how sure the writer is about the artifact, not about any episode");
    if (!isStr(o.grounding) || !GROUNDINGS.includes(o.grounding)) this.err(`${path}.grounding`, "generation.grounding", `unknown grounding; expected one of ${GROUNDINGS.join(", ")}`);
    else if (o.grounding === "inference") this.warn(path, "generation.inference", `this ${what} is supported only by inference: nothing in the artifact or the trace was cited for it`);
    if ("ev" in o && !Array.isArray(o.ev)) this.err(`${path}.ev`, "generation.ev", "ev is a list of evidence references");
  }
}

export function validateProfile(input: unknown): ValidationResult {
  const c = new Check();
  const p = rec(input);
  if (!p) { c.err("", "profile.shape", "a profile must be an object"); return { ok: false, issues: c.issues }; }

  if (p.version !== 1) c.err("version", "profile.version", "this reader understands version 1");
  const artifact = rec(p.artifact);
  if (!artifact || !isStr(artifact.name) || !artifact.name.trim()) c.err("artifact.name", "profile.artifact", "a profile needs the name of what it describes");
  const provenance = rec(p.provenance);
  if (!provenance || !isStr(provenance.by) || !["handwritten", "generated"].includes(provenance.by)) {
    c.err("provenance.by", "profile.provenance", 'a profile has to say where it came from: "handwritten" or "generated"');
  }

  // A list left out entirely is forgiven and filled in, because a
  // generated profile with nothing to put in one tends to omit it, and
  // refusing a whole profile over an absent empty list would be a poor
  // trade. It is still said, and the profile that comes back out carries
  // the list, so nothing downstream has to wonder whether it is there.
  const missing: string[] = [];
  const list = (key: string): unknown[] => {
    const v = p[key];
    if (Array.isArray(v)) return v;
    if (v !== undefined) c.err(key, "profile.shape", `${key} must be a list`);
    else { missing.push(key); c.warn(key, "profile.absent", `${key} was left out and is read as empty`); }
    return [];
  };
  const surfaces = list("surfaces"), channels = list("channels"), controls = list("controls"), rules = list("rules");
  const keySets = p.keySets === undefined ? [] : list("keySets");

  // Ids first, so a rule may name anything the profile defines, wherever
  // it is defined.
  c.controls = c.ids("controls", controls, (x) => rec(x)?.id, "control");
  c.channels = c.ids("channels", channels, (x) => rec(x)?.id, "channel");
  c.keySets = c.ids("keySets", keySets, (x) => rec(x)?.id, "key set");
  c.ids("surfaces", surfaces, (x) => rec(x)?.id, "surface");
  c.ids("rules", rules, (x) => rec(x)?.id, "rule");

  surfaces.forEach((v, i) => {
    const path = `surfaces[${i}]`;
    const s = rec(v);
    if (!s) { c.err(path, "surface.shape", "a surface must be an object"); return; }
    c.stringTest(`${path}.match`, s.match);
    if (!isStr(s.label) || !s.label.trim()) c.err(`${path}.label`, "surface.label", "a surface needs something to call it");
    else {
      // A label that fills a hole the match does not open would print an
      // empty string into a sentence somebody reads.
      const match = rec(s.match);
      const holes = [...s.label.matchAll(/\{(\d+)\}/g)].map((m) => Number(m[1]));
      const arity = match && isStr(match.glob) ? globArity(match.glob) : 0;
      for (const hole of holes) {
        if (hole < 1 || hole > arity) {
          c.err(`${path}.label`, "surface.capture", arity === 0
            ? `the label uses {${hole}}, but this surface is matched exactly and captures nothing`
            : `the label uses {${hole}}, but the glob captures ${arity}`);
        }
      }
    }
    if (!isStr(s.role) || !SURFACE_ROLES.includes(s.role as never)) c.err(`${path}.role`, "role.unknown", `a surface's role must be one of ${SURFACE_ROLES.join(", ")}`);
    c.provenance(`${path}.generation`, s.generation, "surface");
  });

  channels.forEach((v, i) => {
    const path = `channels[${i}]`;
    const ch = rec(v);
    if (!ch) { c.err(path, "channel.shape", "a channel must be an object"); return; }
    if (!isStr(ch.label) || !ch.label.trim()) c.err(`${path}.label`, "channel.label", "a channel needs something to call it");
    if (!isStr(ch.from) || !["system", "person"].includes(ch.from)) c.err(`${path}.from`, "channel.from", 'a channel says whose words these are: "system" or "person"');
    if (ch.container === undefined && ch.text === undefined) {
      c.err(path, "channel.empty", "a channel needs something to recognise it by: a container, some text, or both");
    }
    if (ch.container !== undefined) {
      c.anchor(`${path}.container`, ch.container);
      c.anchorStrength(`${path}.container`, ch.container as Anchor, "channel");
    }
    if (ch.text !== undefined) c.stringTest(`${path}.text`, ch.text);
    // Optional, and a phrase rather than a sentence: it is dropped into
    // "The log <verb>" and nothing capitalises or punctuates it.
    if (ch.verb !== undefined && (!isStr(ch.verb) || !ch.verb.trim() || ch.verb.length > 40)) {
      c.err(`${path}.verb`, "channel.verb", "a channel's verb is a short past-tense phrase, like \"answered\" or \"was added to\"");
    }
    c.provenance(`${path}.generation`, ch.generation, "channel");
  });

  controls.forEach((v, i) => {
    const path = `controls[${i}]`;
    const ctl = rec(v);
    if (!ctl) { c.err(path, "control.shape", "a control must be an object"); return; }
    if (!isStr(ctl.label) || !ctl.label.trim()) c.err(`${path}.label`, "control.label", "a control needs something to call it");
    if ("moment" in ctl && typeof ctl.moment !== "boolean") c.err(`${path}.moment`, "control.moment", "moment says whether using this is a thing somebody did; it is true or false");
    if (ctl.anchor === undefined) c.err(`${path}.anchor`, "control.anchor", "a control needs an anchor");
    else {
      c.anchor(`${path}.anchor`, ctl.anchor);
      c.anchorStrength(`${path}.anchor`, ctl.anchor as Anchor, "control");
    }
    c.provenance(`${path}.generation`, ctl.generation, "control");
  });

  keySets.forEach((v, i) => {
    const path = `keySets[${i}]`;
    const set = rec(v);
    if (!set) { c.err(path, "key set.shape", "a key set must be an object"); return; }
    if (!isStr(set.label) || !set.label.trim()) c.err(`${path}.label`, "key set.label", "a key set needs something to call it");
    if (!Array.isArray(set.keys) || !set.keys.length) c.err(`${path}.keys`, "key set.empty", "a key set needs at least one key name");
    else for (const k of set.keys) if (!isStr(k)) c.err(`${path}.keys`, "key set.type", "key names are strings, exactly as the browser reports them");
    c.provenance(`${path}.generation`, set.generation, "key set");
  });

  const priorities = new Map<number, string>();
  rules.forEach((v, i) => {
    const path = `rules[${i}]`;
    const r = rec(v);
    if (!r) { c.err(path, "rule.shape", "a rule must be an object"); return; }
    if (!isStr(r.sub) || !r.sub.trim()) c.err(`${path}.sub`, "rule.sub", "a rule needs a name for the behaviour it reads");
    if (!isStr(r.broad) || !BROAD.includes(r.broad as never)) c.err(`${path}.broad`, "broad.unknown", `a rule's broad class must be one of the ${BROAD.length}: ${BROAD.join(", ")}`);
    if (!isNum(r.priority)) c.err(`${path}.priority`, "rule.priority", "a rule needs a priority, because which of two true readings is given cannot be left to the order they were written in");
    else {
      const already = priorities.get(r.priority);
      // Two rules at one priority is an ordering nobody chose. The
      // compiler would break the tie by id, which is stable and arbitrary
      // — fine as a tiebreak, wrong as a decision.
      if (already !== undefined) c.err(`${path}.priority`, "rule.priority.duplicate", `priority ${r.priority} is already taken by "${already}"`);
      else priorities.set(r.priority, isStr(r.id) ? r.id : path);
    }
    c.pred(`${path}.when`, r.when);
    c.template(`${path}.description`, r.description);
    c.template(`${path}.because`, r.because);
    c.confidence(`${path}.confidence`, r.confidence);
    c.provenance(`${path}.generation`, r.generation, "rule");
  });

  const fb = rec(p.fallback);
  if (!fb) c.err("fallback", "profile.fallback", "a profile needs a fallback: what is said when no rule reads a stretch");
  else {
    if (!isStr(fb.id) || !fb.id.trim()) c.err("fallback.id", "rule.id", "the fallback needs an id");
    if (!isStr(fb.sub) || !fb.sub.trim()) c.err("fallback.sub", "rule.sub", "the fallback needs a name");
    if (!isStr(fb.broad) || !BROAD.includes(fb.broad as never)) c.err("fallback.broad", "broad.unknown", `the fallback's broad class must be one of the ${BROAD.length}`);
    if ("when" in fb) c.err("fallback.when", "fallback.when", "the fallback has no condition: it is what is left when nothing else read the stretch");
    c.template("fallback.description", fb.description);
    c.template("fallback.because", fb.because);
    c.confidence("fallback.confidence", fb.confidence);
    c.provenance("fallback.generation", fb.generation, "fallback");
  }

  // Things that will run and then disappoint.
  if (!rules.length) c.warn("rules", "profile.norules", "this profile has no rules, so every stretch will fall through to the fallback");
  if (!channels.some((v) => rec(v)?.from === "person")) {
    c.warn("channels", "profile.noperson", "no channel carries the person's own words, so nothing they submitted can ever be quoted back: what was typed is never recorded, and the only copy is the one the interface echoed");
  }
  if (controls.length && !controls.some((v) => rec(v)?.moment === true)) {
    c.warn("controls", "profile.nomoment", "no control is marked as a moment, so anything somebody did in less than the minimum stretch will be folded into whatever came next and may end up naming it");
  }

  const errors = c.issues.filter((i) => i.severity === "error");
  if (errors.length) return { ok: false, issues: c.issues };
  // What comes back is what went in, except that a list nobody wrote is
  // now a list nobody wrote rather than an absence the compiler would
  // trip over.
  const profile = (missing.length
    ? { ...(input as ArtifactProfile), ...Object.fromEntries(missing.map((k) => [k, []])) }
    : input) as ArtifactProfile;
  return { ok: true, profile, issues: c.issues };
}

// The issues as lines somebody reads in a terminal.
export const renderIssues = (issues: ProfileIssue[]): string =>
  issues.length
    ? issues.map((i) => `${i.severity === "error" ? "✗" : "!"} ${i.path || "(profile)"} — ${i.message} [${i.code}]`).join("\n")
    : "nothing to report";
