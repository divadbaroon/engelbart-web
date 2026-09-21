// When is an artifact a different artifact?
//
// A profile costs a model call, so it is made once and kept. This module
// answers what "once" means: what may change about a repository without
// its profile going stale, and what may not.
//
// The line is the same one the interface readings are under
// (lib/semantics/signature.ts), for the same reason: a name is part of
// what an interface IS, and content is what passes through it. A button
// relabelled from "Create" to "New task" breaks every anchor that found
// it by its words, so it counts. A card whose title is whatever somebody
// typed does not. A commit sha counts for nothing at all: it is read
// before the repair patch and the instrumentation are applied, so two
// runs of one sha can present different interfaces — it is recorded as
// context and never as identity.
//
// What goes in, then, is the shape of the interface a run actually met:
// which documents it served, and the identity of the things in them that
// have names. That is computable from the discovery run's own trace,
// with no browser and no model, which is what makes it cheap enough to
// check on every load.
//
// It is a heuristic and it is meant to be tuned. The parts are kept
// beside the hash rather than thrown away, so two signatures can be
// diffed into a sentence about what moved.
//
// Server side: uses node:crypto.
import { createHash } from "node:crypto";
import type { ElementTarget, TraceEvent } from "@/lib/trace/types";
import { targetsOf } from "@/lib/trace/types";
import { frameIndex } from "@/lib/trace/timeline";
import { surfaceKey } from "@/lib/activity/segment";

export const SIGNATURE_POLICY = 1;

// Whose visible text is a name rather than content. Kept deliberately in
// step with lib/semantics/signature.ts: the same elements are the ones
// whose words are what they are called.
const NAMING_TAGS = new Set(["button", "a", "summary", "label", "option", "th", "legend", "h1", "h2", "h3", "h4", "h5", "h6", "caption", "figcaption", "dt"]);
const NAMING_ROLES = new Set(["button", "link", "tab", "menuitem", "menuitemcheckbox", "menuitemradio", "option", "checkbox", "radio", "switch", "treeitem", "heading"]);

const fold = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

// One element as its identity: what a profile could anchor on, and
// nothing that churns. A selector's value is left out on purpose — it
// moves with `:nth-of-type` and generated class names while the element
// stays the thing it always was — but whether an element HAS a test id
// or the application's own id is kept, because losing one is a real
// change to what can be anchored.
function identity(t: ElementTarget): string | null {
  const named = NAMING_TAGS.has(t.tag ?? "") || NAMING_ROLES.has(t.role ?? "");
  const parts = [
    t.appId ? `app:${fold(t.appId)}` : "",
    t.testid ? `testid:${fold(t.testid)}` : "",
    t.id ? `id:${fold(t.id)}` : "",
    t.role ? `role:${fold(t.role)}` : "",
    t.tag ? `tag:${fold(t.tag)}` : "",
    t.type ? `type:${fold(t.type)}` : "",
    t.name ? `name:${fold(t.name)}` : "",
    t.label ? `label:${fold(t.label)}` : "",
    t.placeholder ? `placeholder:${fold(t.placeholder)}` : "",
    t.editable ? `editable:${fold(t.editable)}` : "",
    // A naming element's words are its name; anything else's are content.
    named && t.text ? `text:${fold(t.text).slice(0, 80)}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join("|") : null;
}

export type SignatureParts = {
  policy: number;
  // The documents the artifact served, as the segmenter keys them.
  surfaces: string[];
  // The named things in them, sorted and deduplicated.
  elements: string[];
  // Which model endpoints it reached, since an artifact that calls a
  // model is a different thing to read than one that does not.
  providers: string[];
};

export function signatureParts(events: TraceEvent[]): SignatureParts {
  const frames = frameIndex(events);
  const surfaces = new Set<string>();
  for (const frame of frames.values()) surfaces.add(surfaceKey(frame));

  const elements = new Set<string>();
  for (const event of events) {
    for (const target of targetsOf(event)) {
      const id = identity(target);
      if (id) elements.add(id);
    }
  }

  const providers = new Set<string>();
  for (const event of events) {
    if (event.kind !== "model.request") continue;
    const data = event.data as { host?: unknown; path?: unknown } | undefined;
    const host = typeof data?.host === "string" ? data.host : null;
    const path = typeof data?.path === "string" ? data.path : null;
    if (host) providers.add(`${host}${path ?? ""}`);
  }

  return {
    policy: SIGNATURE_POLICY,
    surfaces: [...surfaces].sort(),
    elements: [...elements].sort(),
    providers: [...providers].sort(),
  };
}

export function signatureOf(events: TraceEvent[]): { signature: string; parts: SignatureParts } {
  const parts = signatureParts(events);
  const body = JSON.stringify(parts);
  return { signature: createHash("sha256").update(body).digest("hex").slice(0, 32), parts };
}

// What moved between the interface a profile was written against and the
// one in front of us, in words. Shown when a profile is called stale, so
// the call can be argued with.
export function signatureDiff(before: SignatureParts, after: SignatureParts): string[] {
  const lines: string[] = [];
  const missing = (a: string[], b: string[]) => a.filter((x) => !b.includes(x));
  const say = (what: string, gone: string[], came: string[]) => {
    if (gone.length) lines.push(`${gone.length} ${what} no longer there: ${gone.slice(0, 5).join(", ")}${gone.length > 5 ? "…" : ""}`);
    if (came.length) lines.push(`${came.length} new ${what}: ${came.slice(0, 5).join(", ")}${came.length > 5 ? "…" : ""}`);
  };
  if (before.policy !== after.policy) lines.push(`the signature policy changed from ${before.policy} to ${after.policy}`);
  say("document(s)", missing(before.surfaces, after.surfaces), missing(after.surfaces, before.surfaces));
  say("named element(s)", missing(before.elements, after.elements), missing(after.elements, before.elements));
  say("model endpoint(s)", missing(before.providers, after.providers), missing(after.providers, before.providers));
  return lines;
}
