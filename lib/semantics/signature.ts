// When is an interface a different interface?
//
// A semantic reading costs a model call, so it is made once and kept. The
// question this module answers is what "once" means: what may change in a
// page without the reading going stale, and what may not.
//
// The line drawn here is between a name and its content. A button's
// visible text IS its name — rename it and the interface has changed. A
// conversation's visible text is what is in the conversation — it changes
// every time anyone says anything, and the interface has not changed at
// all. So text counts towards the signature for controls and never for
// regions. The same reasoning excludes a selector's value, which churns
// with `:nth-of-type` and class names while the element stays the thing it
// always was; that an element HAS a selector rather than a test id is kept,
// because losing a test id is a real change.
//
// This is a heuristic and is meant to be tuned. It is a policy object, the
// parts are kept alongside the hash rather than thrown away, and two
// signatures can be diffed into a sentence about what moved — so when it
// is wrong it can be seen to be wrong, and the knob turned, without
// anything else in the semantic layer changing.
//
// Server side: uses node:crypto. Nothing imports it from the browser; the
// page sends its survey and the server decides hit or miss.
import { createHash } from "node:crypto";
import type { ElementTarget } from "@/lib/trace/types";
import type { Candidate, CandidateTree } from "@/lib/semantics/types";

// Whose visible text is a name rather than content. These are the
// elements whose accessible name IS what they say; everything else that
// holds text holds content.
const CONTROL_TAGS = new Set(["button", "a", "summary", "label", "option", "th", "legend"]);
const CONTROL_ROLES = new Set(["button", "link", "tab", "menuitem", "menuitemcheckbox", "menuitemradio", "option", "checkbox", "radio", "switch", "treeitem"]);
// A heading is not something a person acts on, but its words are a name
// all the same: it is what the area under it is called, and a page whose
// heading changed is usually a different screen. Found by watching a real
// page — renaming a heading left the signature where it was, and a
// reading of the old screen would have been offered for the new one.
const NAMING_TAGS = new Set([...CONTROL_TAGS, "h1", "h2", "h3", "h4", "h5", "h6", "caption", "figcaption", "dt"]);
const NAMING_ROLES = new Set([...CONTROL_ROLES, "heading"]);
const namesItself = (t: ElementTarget): boolean =>
  isControl(t) || (!!t.tag && NAMING_TAGS.has(t.tag)) || (!!t.role && NAMING_ROLES.has(t.role));

export type SignaturePolicy = {
  namingText: "controls" | "all" | "none";  // whose visible text counts
  selectorValue: boolean;                   // include the selector itself, not just that there is one
  structure: boolean;                       // include where each candidate sits
  repeats: "fold" | "count";                // whether how MANY alike parts there are is part of the interface
  textChars: number;
};

// The default, and the thing to turn.
//
// "controls" is the line described above — elements whose words ARE
// their name: a control, and a heading, which names the area under it;
// "all" makes the signature
// notice every word on the page, which a conversation or a model's output
// will invalidate constantly; "none" notices only shape, which will miss
// a renamed button.
//
// "fold" is the other half of that, and it was put here after watching
// real pages rather than reasoned out: a list of three alike things and a
// list of four alike things are the same interface, and an application
// that appends to a list — every chat, every log, every table of results
// — would otherwise be read again on every message. "count" keeps the
// number, for a page where three of something and four of something are
// genuinely different screens.
export const DEFAULT_POLICY: SignaturePolicy = { namingText: "controls", selectorValue: false, structure: true, repeats: "fold", textChars: 60 };

export const isControl = (t: ElementTarget): boolean =>
  (!!t.tag && CONTROL_TAGS.has(t.tag)) || (!!t.role && CONTROL_ROLES.has(t.role)) || !!t.type || !!t.editable;

// Which handle this element is known by, and its value when that value is
// the author's rather than the renderer's. A test id or a good id was
// written by a person and means something; a selector is computed from
// wherever the element happens to sit.
function identity(t: ElementTarget, policy: SignaturePolicy): string {
  if (t.testid) return `t:${t.testid}`;
  if (t.id) return `i:${t.id}`;
  if (t.selector) return policy.selectorValue ? `s:${t.selector}` : "s";
  return "-";
}

// The authored name of an element: what someone called it, as opposed to
// what happens to be inside it. `label` is aria-label or its <label>, and
// is authored whatever the element is; `text` is content, and only counts
// where the element's content is its name.
function naming(t: ElementTarget, policy: SignaturePolicy): string {
  const authored = t.label ?? t.title ?? t.placeholder ?? t.name ?? "";
  const content = policy.namingText === "all" || (policy.namingText === "controls" && namesItself(t)) ? (t.text ?? "") : "";
  // Both, where both count: an element may be named by its author and
  // say something of its own, and a policy asked to hear content should
  // not be silenced by the presence of an aria-label.
  const said = [authored, content].filter(Boolean).join(" \u00b7 ");
  return said ? said.replace(/\s+/g, " ").trim().slice(0, policy.textChars) : "";
}

// One line per candidate. `key` is what makes it the same candidate
// across two surveys, `part` is everything the signature covers — so a
// diff can tell a control that appeared from one that was renamed.
export type SignaturePart = { key: string; part: string };

export function signatureParts(tree: CandidateTree, policy: SignaturePolicy = DEFAULT_POLICY): SignaturePart[] {
  // Where a candidate sits is said as what its parent IS, never as which
  // number its parent was given. The ordinals are positions in one
  // survey: inserting a list item renumbers everything after it, and a
  // structure term built on them would call a page that gained a message
  // a different page in every part below the message.
  const own = new Map<number, string>();
  for (const c of tree.candidates) own.set(c.ord, [identity(c.target, policy), c.target.tag ?? "?", c.target.role ?? ""].join("|"));
  return tree.candidates.map((c: Candidate) => {
    const t = c.target;
    const where = policy.structure ? `in=${c.parent === null ? "-" : own.get(c.parent) ?? "-"}` : "";
    const key = [own.get(c.ord) ?? "", where].filter(Boolean).join("|");
    const part = [key, t.type ?? "", t.editable ?? "", t.disabled ? "disabled" : "", naming(t, policy)].filter(Boolean).join("|");
    return { key, part };
  });
}

// What the hash actually sees. Folding is here rather than in
// signatureParts so a diff explains the hash: two lists that differ only
// in length have the same folded parts, and the diff says nothing changed
// because, for this purpose, nothing did.
export const foldParts = (parts: SignaturePart[], policy: SignaturePolicy = DEFAULT_POLICY): SignaturePart[] => {
  if (policy.repeats === "count") return parts;
  const seen = new Set<string>();
  return parts.filter((p) => (seen.has(p.part) ? false : (seen.add(p.part), true)));
};

// The route is part of the signature because the same document served at
// two paths is two interfaces. Its query string is already reduced to
// "?…" by the bridge, so a token or a session id cannot reach this.
export function signatureOf(tree: CandidateTree, policy: SignaturePolicy = DEFAULT_POLICY): { signature: string; parts: SignaturePart[] } {
  const parts = foldParts(signatureParts(tree, policy), policy);
  const body = [`route=${tree.route ?? ""}`, `depth=${tree.frame.depth}`, ...parts.map((p) => p.part)].join("\n");
  return { signature: createHash("sha256").update(body).digest("hex").slice(0, 32), parts };
}

// ---- why a signature changed
//
// A hash that moved says nothing. This says what moved, so the policy
// above can be judged against a real page rather than argued about.
export type SignatureDiff = {
  added: string[];
  removed: string[];
  changed: { key: string; before: string; after: string }[];
  same: number;
};

export function diffSignature(before: SignaturePart[], after: SignaturePart[]): SignatureDiff {
  const b = new Map<string, string>(), a = new Map<string, string>();
  // A page may hold several candidates with the same key — three list
  // items with no id, say. They are numbered so they compare one to one
  // rather than collapsing into a single entry.
  const number = (parts: SignaturePart[], into: Map<string, string>) => {
    const seen = new Map<string, number>();
    for (const p of parts) {
      const n = (seen.get(p.key) ?? 0) + 1;
      seen.set(p.key, n);
      into.set(n === 1 ? p.key : `${p.key}#${n}`, p.part);
    }
  };
  number(before, b);
  number(after, a);
  const added: string[] = [], removed: string[] = [], changed: SignatureDiff["changed"] = [];
  let same = 0;
  for (const [key, part] of a) {
    if (!b.has(key)) { added.push(part); continue; }
    const was = b.get(key)!;
    if (was === part) same++; else changed.push({ key, before: was, after: part });
  }
  for (const [key, part] of b) if (!a.has(key)) removed.push(part);
  return { added, removed, changed, same };
}

// The diff as a sentence, for the diagnostics panel.
export function sayDiff(d: SignatureDiff): string {
  const bits: string[] = [];
  if (d.added.length) bits.push(`${d.added.length} new`);
  if (d.removed.length) bits.push(`${d.removed.length} gone`);
  if (d.changed.length) bits.push(`${d.changed.length} changed`);
  if (!bits.length) return `Nothing the signature covers moved; ${d.same} candidate${d.same === 1 ? "" : "s"} matched.`;
  return `${bits.join(", ")}, ${d.same} unchanged.`;
}
