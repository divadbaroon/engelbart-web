// What the parts of this application's interfaces are for, written out
// for Bart. This is the one source of the four that is not evidence: a
// trace event, an annotation and a model call are all recordings of
// something that happened, and this is a reading of a page made by a
// model.
//
// It is therefore written to be easy to disbelieve. Every name comes
// with the raw descriptors it was derived from, so a claim can be
// checked against what the page actually held; a reading the model was
// unsure of says so on the line; and the reading's age, its model and
// the signature it is cached under are on the header, because an
// interface that has changed since is a real possibility and not an edge
// case. Pure: no DOM, no React, no network.
import { describeTarget, formatClock } from "@/lib/trace/timeline";
import { framePath } from "@/lib/semantics/lookup";
import type { StoredSemantics } from "@/lib/semantics/model";
import type { SemanticNode } from "@/lib/semantics/types";
import { slice } from "@/lib/bart/grounding";

const HOW = "These are one model's names for the parts of a page, not a recording of anything that happened. Each name is followed by the elements it was read from, exactly as the page described them; where the two disagree, the elements are the evidence.";

export function semanticsList(readings: StoredSemantics[], error: string | null = null): string {
  if (error) return error;
  if (!readings.length) {
    return "No interface of this application has been read yet. A document is read when the Live preview is open and the bridge is in it; until then the trace names elements by what the page said about them, which it does anyway.";
  }
  const lines = readings.map((r) => {
    const m = r.map;
    const where = framePath(r.frame);
    const what = m?.documentLabel ? `${m.documentLabel}${m.documentConfidence === "low" ? " (a guess)" : m.documentConfidence === "medium" ? " (a fair reading)" : ""}` : "unnamed";
    const counts = m ? `${m.regions.length} region${m.regions.length === 1 ? "" : "s"}, ${m.controls.length} control${m.controls.length === 1 ? "" : "s"}` : "unreadable";
    return `${where}${r.route ? `  at ${r.route}` : ""}  —  ${what}  (${counts}; signature ${r.signature.slice(0, 8)})`;
  });
  return slice(`${readings.length} interface${readings.length === 1 ? "" : "s"} of this application have been read. ${HOW}\nAsk for one by its document path with inspect_ui_semantics.\n\n${lines.join("\n")}`).text;
}

// One document's reading. `which` is a frame path as the list prints it
// ("top", "#solution"), a route, or part of the document's own label —
// whichever the reader had in front of them.
export function semanticsReport(readings: StoredSemantics[], which: string, offset = 0): string | null {
  const want = which.trim().toLowerCase();
  const found = readings.find((r) => framePath(r.frame).toLowerCase() === want)
    ?? readings.find((r) => (r.route ?? "").toLowerCase() === want)
    ?? readings.find((r) => (r.map?.documentLabel ?? "").toLowerCase().includes(want) && !!want)
    ?? (readings.length === 1 || !want ? readings[0] : null);
  if (!found) return null;
  const m = found.map;
  const lines: string[] = [];
  lines.push(`${m?.documentLabel ?? "An unnamed document"} — the document at ${framePath(found.frame)}${found.route ? `, route ${found.route}` : ""}.`);
  lines.push(`Read ${formatClock(found.createdAt)}${found.model ? ` by ${found.model}` : ""}, cached under signature ${found.signature.slice(0, 8)}${found.commitSha ? `; the run it was read in was on commit ${found.commitSha.slice(0, 7)}` : ""}.`);
  if (m?.documentConfidence && m.documentConfidence !== "high") lines.push(`The reader was ${m.documentConfidence === "medium" ? "fairly sure" : "unsure"} of what this document is.`);
  if (m?.truncated) lines.push("The document offered more parts than were shown to the reader, so this reading is of part of it.");
  lines.push("", HOW);
  if (!m) {
    lines.push("", "The reading itself could not be read back. Only the survey it was made from survives.");
  } else {
    if (m.regions.length) lines.push("", "Areas of the interface:", ...m.regions.flatMap((n) => nodeLines(n, null)));
    if (m.controls.length) {
      const names = new Map(m.regions.map((r) => [r.semanticId, r.label]));
      lines.push("", "Things a person acts on or reads:", ...m.controls.flatMap((n) => nodeLines(n, n.regionId ? names.get(n.regionId) ?? null : null)));
    }
    if (!m.regions.length && !m.controls.length) lines.push("", "The reader named nothing in this document.");
  }
  return slice(lines.join("\n"), offset).text;
}

function nodeLines(n: SemanticNode, region: string | null): string[] {
  const sure = n.confidence === "high" ? "" : n.confidence === "medium" ? "  [a fair reading]" : "  [a guess]";
  const head = `- ${n.label}  (${n.kind})${region ? `, in ${region}` : ""}${sure}`;
  const out = [n.description ? `${head}\n    ${n.description}` : head];
  for (const t of n.targets.slice(0, 6)) out.push(`    read from: ${describeTarget(t)}${t.selector ? ` · ${t.selector}` : ""}`);
  if (n.targets.length > 6) out.push(`    and ${n.targets.length - 6} more element${n.targets.length - 6 === 1 ? "" : "s"}`);
  return out;
}
