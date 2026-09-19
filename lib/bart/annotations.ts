// A researcher's note, written out for Bart. Two things are kept apart
// here on purpose: what a person wrote, which is an observation or a
// question and not evidence of anything; and what the DOM held, which is
// a tag, a role and visible text and says nothing about what an
// application draws inside a canvas or means by a label.
//
// The run, the recording and the commit are where the note came from.
// Moments recorded near it are offered as timing and nothing more: the
// trace records a tie when there is one, and there is none here. Pure.
import type { Annotation } from "@/lib/annotations/model";
import { frameLine } from "@/lib/annotations/target";
import { describeTarget, formatClock } from "@/lib/trace/timeline";
import { shortClock } from "@/lib/trace/moments";
import { slice, type TraceModel } from "@/lib/bart/grounding";

const NEAR_MS = 30_000;
const NEAR_MAX = 4;

export function annotationReport(note: Annotation, trace: TraceModel | null, offset = 0): string {
  const lines: string[] = [];
  lines.push(`Annotation ${note.id}, written ${formatClock(note.createdAt)}${note.updatedAt !== note.createdAt ? ` and edited ${formatClock(note.updatedAt)}` : ""}.`);
  lines.push(`On: ${describeTarget(note.anchor.element)}${note.anchor.element.selector ? ` · ${note.anchor.element.selector}` : ""}${note.route ? ` · at ${note.route}` : ""}`);
  const frame = frameLine(note.anchor);
  if (frame) lines.push(frame);
  if (note.anchor.ancestors.length) lines.push(`Inside: ${note.anchor.ancestors.map((a) => describeTarget(a)).join(" ← ")}`);
  if (note.anchor.element.tag === "canvas") {
    lines.push(`This element is a canvas${note.anchor.element.size ? ` (${note.anchor.element.size})` : ""}. The trace records it as a DOM element and nothing about what is drawn in it; what it shows is a question for the repository's source.`);
  }
  lines.push("", "What the researcher wrote (their own words, an observation or a question, not a recording of the system):", slice(note.body, offset, 4000).text);
  const where: string[] = [];
  if (note.runId) where.push(`run ${note.runId}`);
  if (note.commitSha) where.push(`commit ${note.commitSha}`);
  if (note.recordingId) where.push(`recording ${note.recordingId}`);
  if (where.length) lines.push("", `Written while looking at: ${where.join(", ")}.`);
  if (note.stageId || note.callId) lines.push(`The moment selected at the time: ${note.stageId ?? `call ${note.callId}`} — what the person had open, not a cause of what the note describes.`);
  const near = nearby(note, trace);
  if (near.length) {
    lines.push("", "Moments recorded around the same time. This is timing only: the trace records no tie between a note and a moment, so do not present these as the reason for what the note describes.", ...near);
  }
  lines.push("", `Cite it as [[annotation:${note.id}]].`);
  return lines.join("\n");
}

function nearby(note: Annotation, trace: TraceModel | null): string[] {
  if (!trace) return [];
  const at = Date.parse(note.createdAt);
  if (Number.isNaN(at)) return [];
  return trace.stages
    .filter((s) => Math.abs(Date.parse(s.at) - at) <= NEAR_MS)
    .slice(0, NEAR_MAX)
    .map((s) => `- ${s.title} at ${shortClock(s.at)} (${s.id})`);
}
