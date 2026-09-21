// The evidence a profile is written from.
//
// The bench proved that a model given enough of the right evidence can
// describe an artifact it has never seen, well enough to read other
// recordings of it. This is that pack, built from what a run already
// leaves behind rather than from a harness somebody drives by hand:
//
//   the repository          what the people who wrote it called things
//   the discovery session   every row of one recording, in order
//   the documents it served which surfaces a rule may name
//   the elements it offered what an anchor may rest on, and at which rung
//   the bursts of change    where text appeared, so a channel can be found
//   what the instrument saw which of the above is available at all
//
// Two rules govern what goes in. Everything here is evidence, never a
// reading: no episode, no behaviour, no sentence anything has already
// written about this run, because a profile generated from a previous
// reading would agree with it for no reason. And everything is bounded,
// because the pack is one prompt and an artifact can be any size.
//
// Pure: no database, no model, no network. What it needs, it is handed.
import type { TraceEvent, ElementTarget } from "@/lib/trace/types";
import { targetsOf } from "@/lib/trace/types";
import { frameIndex, type FrameInfo } from "@/lib/trace/timeline";
import { surfaceKey } from "@/lib/activity/segment";
import { capabilityOf, CAPABILITY_NOTES, type Capability } from "./capability";
import { rung } from "./schema";
import { INSTRUMENT_DOC } from "./prompt/instrument-doc";
import type { Anchor } from "./schema";

export const EVIDENCE_BUILDER_VERSION = 1;

const MAX_FILES = 400;
const MAX_SOURCE_BYTES = 120_000;
const MAX_FILE_BYTES = 24_000;
const MAX_EVENTS = 600;
const MAX_ELEMENTS = 300;
const MAX_BURSTS = 120;
const MAX_TEXT = 300;

export type RepoFile = { path: string; bytes: number; text?: string };

export type EvidenceInput = {
  artifact: { owner: string; name: string; url: string; commit: string | null; description?: string | null };
  files: RepoFile[];
  events: TraceEvent[];
};

export type EvidenceManifest = {
  builder: number;
  capability: Capability;
  counts: { files: number; filesIncluded: number; events: number; eventsIncluded: number; surfaces: number; elements: number; bursts: number };
  bytes: number;
  truncated: string[];
};

export type EvidencePack = { text: string; manifest: EvidenceManifest };

// Which of a repository's files are worth fetching the text of, and in
// which order. Every file costs a request, so the list is cut; the cut is
// here rather than at the caller so that a profile written by the server
// action and one written from a script are written from the same reading
// of the same repository.
const WANTED = [
  /^readme/i, /^package\.json$/, /^pyproject\.toml$/, /^requirements\.txt$/,
  /\.(tsx?|jsx?|mjs|cjs|py|svelte|vue|html)$/i,
];
const UNWANTED = /(^|\/)(node_modules|\.git|\.next|dist|build|out|coverage|test|tests|__tests__|\.storybook)(\/|$)|\.(test|spec)\.|\.min\./i;

export function worthReading(paths: string[]): string[] {
  const wanted = paths.filter((p) => !UNWANTED.test(p) && WANTED.some((w) => w.test(p)));
  // Shallow first: a repository says what it is at its root.
  return wanted.sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
}

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}…` : s);
const fold = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

// Which files are worth a generator's attention. The people who wrote
// the artifact named things in its source; they did not name anything in
// a lockfile.
const SKIP_DIR = /(^|\/)(node_modules|\.git|\.next|dist|build|out|coverage|\.turbo|\.vercel|venv|\.venv|__pycache__|public-data|gh-page)(\/|$)/;
const SKIP_FILE = /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.min\.(js|css)$|\.(png|jpe?g|gif|svg|ico|woff2?|ttf|eot|mp4|webm|pdf|zip|csv|parquet)$)/i;
// Read first, in this order: what the artifact says it is, then what it
// serves, then what it is made of.
const PRIORITY = [
  /^readme/i, /^package\.json$/, /^pyproject\.toml$/, /(^|\/)app\//, /(^|\/)pages\//, /(^|\/)src\//,
  /(^|\/)components?\//, /(^|\/)server\//, /(^|\/)client\//, /(^|\/)api\//,
];

const rank = (path: string) => {
  const i = PRIORITY.findIndex((p) => p.test(path));
  return i < 0 ? PRIORITY.length : i;
};

function fileTree(files: RepoFile[]): { text: string; truncated: boolean } {
  const kept = files.filter((f) => !SKIP_DIR.test(f.path)).map((f) => f.path).sort();
  const shown = kept.slice(0, MAX_FILES);
  return { text: shown.join("\n"), truncated: kept.length > shown.length };
}

// A file goes inside a fence longer than any fence it contains. A README
// is Markdown and holds its own ``` blocks; fenced with three backticks
// it closes at the first of them, and the rest of the file spills into
// the pack as prose — where its own `#` headings read as sections of the
// pack itself. That is a document telling the generator where it is, and
// it is the sort of thing that would be hard to see in 160,000
// characters.
function wrap(body: string): string {
  const longest = (body.match(/`+/g) ?? []).reduce((n, run) => Math.max(n, run.length), 0);
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}\n${body}\n${fence}`;
}

function sources(files: RepoFile[]): { text: string; included: number; truncated: boolean } {
  const usable = files
    .filter((f) => !SKIP_DIR.test(f.path) && !SKIP_FILE.test(f.path) && typeof f.text === "string")
    .sort((a, b) => rank(a.path) - rank(b.path) || a.path.localeCompare(b.path));
  const parts: string[] = [];
  let budget = MAX_SOURCE_BYTES;
  let included = 0;
  for (const f of usable) {
    if (budget <= 0) break;
    const body = clip(f.text as string, Math.min(MAX_FILE_BYTES, budget));
    parts.push(`### ${f.path}\n\n${wrap(body)}`);
    budget -= body.length;
    included += 1;
  }
  return { text: parts.join("\n\n"), included, truncated: included < usable.length };
}

// Every document the run served, keyed the way the segmenter keys them —
// which is the string a profile's surface must match, and the single
// most common thing a generated profile gets wrong.
function surfaces(frames: Map<string, FrameInfo>): { text: string; count: number } {
  const seen = new Map<string, { count: number; url: string | null; title: string | null; embedded: boolean }>();
  for (const frame of frames.values()) {
    const key = surfaceKey(frame);
    const at = seen.get(key) ?? { count: 0, url: frame.url ?? null, title: frame.title ?? null, embedded: Boolean(frame.embedded) };
    at.count += 1;
    seen.set(key, at);
  }
  const lines = [...seen.entries()].sort().map(([key, v]) =>
    `- \`${key}\`${v.embedded ? " (an embedded document)" : ""} — ${v.count} document(s) served${v.title ? `, titled ${JSON.stringify(clip(v.title, 60))}` : ""}${v.url ? `, at ${clip(v.url, 100)}` : ""}`);
  return { text: lines.join("\n"), count: seen.size };
}

const anchorFor = (t: ElementTarget): { anchor: Anchor; how: string } | null => {
  if (t.appId) return { anchor: { appId: { equals: t.appId } }, how: `appId ${JSON.stringify(t.appId)}` };
  if (t.testid) return { anchor: { testid: { equals: t.testid } }, how: `testid ${JSON.stringify(t.testid)}` };
  if (t.id) return { anchor: { elementId: { equals: t.id } }, how: `elementId ${JSON.stringify(t.id)}` };
  if (t.role) return { anchor: { role: { equals: t.role } }, how: `role ${JSON.stringify(t.role)}` };
  if (t.label) return { anchor: { label: { equals: t.label } }, how: `label ${JSON.stringify(t.label)}` };
  if (t.placeholder) return { anchor: { placeholder: { equals: t.placeholder } }, how: `placeholder ${JSON.stringify(t.placeholder)}` };
  if (t.text) return { anchor: { text: { equals: fold(t.text) } }, how: `text ${JSON.stringify(clip(fold(t.text), 60))}` };
  if (t.tag) return { anchor: { tag: { equals: t.tag } }, how: `tag ${JSON.stringify(t.tag)}` };
  return null;
};

// Every element the recording touched, with the strongest anchor that
// would find it and the rung that anchor sits on. This is the census the
// bench built from a live DOM survey; here it comes from the trace, so
// it is exactly the set a rule can be written against.
function elements(events: TraceEvent[]): { text: string; count: number; truncated: boolean } {
  const seen = new Map<string, { t: ElementTarget; count: number; kinds: Set<string> }>();
  for (const event of events) {
    if (!event.kind.startsWith("ui.")) continue;
    for (const target of targetsOf(event)) {
      const key = JSON.stringify([target.appId, target.testid, target.id, target.role, target.label, target.placeholder, fold(target.text).slice(0, 60), target.tag, target.type, target.editable]);
      const at = seen.get(key) ?? { t: target, count: 0, kinds: new Set<string>() };
      at.count += 1;
      at.kinds.add(event.kind);
      seen.set(key, at);
    }
  }
  const rows = [...seen.values()].sort((a, b) => b.count - a.count).slice(0, MAX_ELEMENTS);
  const lines = rows.map(({ t, count, kinds }) => {
    const found = anchorFor(t);
    const bits = [
      t.tag ? `<${t.tag}>` : "(no tag)",
      t.type ? `type=${t.type}` : "", t.role ? `role=${t.role}` : "",
      t.id ? `id=${t.id}` : "", t.testid ? `testid=${t.testid}` : "", t.appId ? `appId=${t.appId}` : "",
      t.label ? `label=${JSON.stringify(clip(fold(t.label), 50))}` : "",
      t.placeholder ? `placeholder=${JSON.stringify(clip(fold(t.placeholder), 50))}` : "",
      t.editable ? `editable=${t.editable}` : "",
      t.text ? `text=${JSON.stringify(clip(fold(t.text), 70))}` : "",
      t.selector ? `selector=${JSON.stringify(clip(t.selector, 80))}` : "",
    ].filter(Boolean);
    const anchor = found ? `strongest anchor: ${found.how} (rung ${rung(found.anchor)})` : "nothing to anchor on but a selector (rung 6)";
    return `- ${bits.join(" ")}\n  seen ${count}× in ${[...kinds].sort().join(", ")}; ${anchor}`;
  });
  return { text: lines.join("\n"), count: seen.size, truncated: seen.size > rows.length };
}

// Where text appeared, burst by burst. What a channel is matched
// against, and the only way to find out what the artifact says back.
function bursts(events: TraceEvent[]): { text: string; count: number; truncated: boolean } {
  const changes = events.filter((e) => e.kind === "ui.change");
  const shown = changes.slice(0, MAX_BURSTS);
  const lines = shown.map((e) => {
    const d = (e.data ?? {}) as Record<string, unknown>;
    const added = Array.isArray(d.added) ? (d.added as unknown[]).filter((x): x is string => typeof x === "string") : [];
    const removed = Array.isArray(d.removed) ? (d.removed as unknown[]).filter((x): x is string => typeof x === "string") : [];
    const container = d.container as ElementTarget | undefined;
    const regions = Array.isArray(d.regions) ? (d.regions as Record<string, unknown>[]) : [];
    const where = regions.length
      ? regions.map((r) => {
          const t = r.target as ElementTarget | undefined;
          const within = Array.isArray(r.within) ? (r.within as ElementTarget[]) : [];
          const text = Array.isArray(r.added) ? (r.added as unknown[]).filter((x): x is string => typeof x === "string") : [];
          return `    · in ${describe(t)}${within.length ? ` (inside ${within.map(describe).join(" ‹ ")})` : ""}\n      ${text.map((x) => `+ ${JSON.stringify(clip(fold(x), MAX_TEXT))}`).join("\n      ") || "(no text)"}`;
        }).join("\n")
      : `    · container ${describe(container)}`;
    const summary = [
      added.length ? `${added.length} added` : "", removed.length ? `${removed.length} removed` : "",
      typeof d.mutations === "number" ? `${d.mutations} mutations` : "",
      typeof d.sinceInteractionMs === "number" ? `${d.sinceInteractionMs} ms after the act` : "",
    ].filter(Boolean).join(", ");
    const fallbackText = regions.length ? "" : `\n      ${added.map((x) => `+ ${JSON.stringify(clip(fold(x), MAX_TEXT))}`).join("\n      ") || "(no text)"}`;
    return `- seq ${e.seq} · ${summary}\n${where}${fallbackText}`;
  });
  return { text: lines.join("\n"), count: changes.length, truncated: changes.length > shown.length };
}

const describe = (t: ElementTarget | undefined) => {
  if (!t) return "(nothing described)";
  const bits = [t.tag ? `<${t.tag}>` : "", t.id ? `#${t.id}` : "", t.appId ? `appId=${t.appId}` : "", t.testid ? `testid=${t.testid}` : "", t.role ? `role=${t.role}` : ""].filter(Boolean);
  return bits.length ? bits.join(" ") : clip(t.selector ?? "(unnamed)", 60);
};

// The recording itself, every row in order. The generator is shown the
// events, never anybody's reading of them.
function session(events: TraceEvent[]): { text: string; included: number; truncated: boolean } {
  const shown = events.slice(0, MAX_EVENTS);
  const lines = shown.map((e) => {
    const ids = [e.interactionId ? `interaction=${e.interactionId}` : "", e.requestId ? `request=${e.requestId}` : "", e.callId ? `call=${e.callId}` : "", e.correlation ? `correlation=${e.correlation}` : ""].filter(Boolean).join(" ");
    return `${String(e.seq).padStart(4)} ${e.at} ${e.source} ${e.kind}${ids ? ` [${ids}]` : ""}\n     ${clip(JSON.stringify(e.data ?? {}), 1400)}`;
  });
  return { text: lines.join("\n"), included: shown.length, truncated: events.length > shown.length };
}

export function buildEvidence(input: EvidenceInput): EvidencePack {
  const truncated: string[] = [];
  const frames = frameIndex(input.events);
  const capability = capabilityOf(input.events);

  const tree = fileTree(input.files);
  if (tree.truncated) truncated.push("the file tree");
  const source = sources(input.files);
  if (source.truncated) truncated.push("the source files");
  const surf = surfaces(frames);
  const els = elements(input.events);
  if (els.truncated) truncated.push("the element census");
  const burst = bursts(input.events);
  if (burst.truncated) truncated.push("the bursts of change");
  const sess = session(input.events);
  if (sess.truncated) truncated.push("the recording");

  const capabilityLines = [
    ...capability.features.map((f) => `- **${f}** — available. ${CAPABILITY_NOTES[f] ?? ""}`),
    ...capability.missing.map((f) => `- **${f}** — NOT available in this recording. ${CAPABILITY_NOTES[f] ?? ""} Do not write a rule or an anchor that depends on it.`),
  ].join("\n");

  const text = `# The artifact

- repository: ${input.artifact.owner}/${input.artifact.name}
- url: ${input.artifact.url}
- commit: ${input.artifact.commit ?? "(not recorded)"}
${input.artifact.description ? `- the repository describes itself as: ${JSON.stringify(input.artifact.description)}\n` : ""}
# How the recording works

${INSTRUMENT_DOC}

# What this particular recording could see

The instrument gains and loses abilities between versions, and an
artifact offers only what it has. This is what the recording below
actually carries, and therefore what a rule may rest on.

${capabilityLines}

# The repository's files

${tree.text}${tree.truncated ? "\n\n(the tree was cut: the repository holds more files than are listed)" : ""}

# The repository's source

${source.text}${source.truncated ? "\n\n(the source was cut to fit: more files exist than are shown, in the order given above)" : ""}

# The documents this run served

These are the surface keys, exactly as the reader keys them. A surface
spec's \`match\` is tested against these strings and nothing else.

${surf.text || "(no document was recorded)"}

# The elements the recording touched

${els.text || "(no element was recorded)"}${els.truncated ? "\n\n(the census was cut: more distinct elements were touched than are listed)" : ""}

# Where text appeared

${burst.text || "(no change was recorded)"}${burst.truncated ? "\n\n(the bursts were cut: more happened than is listed)" : ""}

# The recording, row by row

${sess.text}${sess.truncated ? "\n\n(the recording was cut: it holds more rows than are listed)" : ""}
`;

  return {
    text,
    manifest: {
      builder: EVIDENCE_BUILDER_VERSION,
      capability,
      counts: {
        files: input.files.length, filesIncluded: source.included,
        events: input.events.length, eventsIncluded: sess.included,
        surfaces: surf.count, elements: els.count, bursts: burst.count,
      },
      bytes: text.length,
      truncated,
    },
  };
}
