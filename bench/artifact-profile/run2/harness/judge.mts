// Blind adjudication, Run 2. There is no hand-written answer key for this
// artifact, so this is the primary evaluation: a judge sees the raw
// recording of one stretch and one claim about it, and says whether the
// claim is supportable at all. It never sees the profile, the artifact's
// name, or anything the taxonomy wrote beyond the claim itself.
import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { targetOf } from "@/lib/trace/types";
import type { Episode } from "@/lib/activity/types";
import { DIR, SESSIONS, load, read, compiled, clock } from "./lib.mts";

const MODEL = "claude-opus-5";
const client = new Anthropic();

// Rendered from the stretch's own events, never from the Evidence record:
// that carries channel names, control names and a surface label, all
// written by the profile being judged.
function rawEvidence(e: Episode, t0: number): string {
  const lines: string[] = [];
  lines.push(`This stretch began ${clock(e, t0)}s into the session and lasted ${Math.round(e.durationMs / 1000)}s.`);
  lines.push(`The browser document it happened on is keyed "${e.evidence.surface.key}".`);
  lines.push("");
  if (!e.events.length) { lines.push("NOTHING WAS RECORDED in this stretch. No clicks, no keys, no text appearing, nothing."); return lines.join("\n"); }
  lines.push(`${e.events.length} things were recorded:`);
  lines.push("");
  const t = (o: unknown) => {
    const x = o as Record<string, unknown> | null;
    if (!x) return "";
    const bits: string[] = [];
    for (const k of ["tag", "id", "testid", "appId", "appIdAttr", "role", "name", "type", "text", "label", "placeholder", "editable", "href", "size"]) if (x[k] !== undefined) bits.push(`${k}=${JSON.stringify(x[k])}`);
    if (Array.isArray(x.classes) && x.classes.length) bits.push(`classes=${JSON.stringify(x.classes)}`);
    if (!bits.length && x.selector) bits.push(`selector=${JSON.stringify(x.selector)}`);
    return bits.join(" ");
  };
  for (const ev of e.events) {
    const d = (ev.data ?? {}) as Record<string, unknown>;
    const at = `+${Math.round((Date.parse(ev.at) - Date.parse(e.startedAt)) / 1000)}s`;
    switch (ev.kind) {
      case "ui.click": {
        const c = d.control as Record<string, unknown> | undefined;
        lines.push(`  ${at} clicked: ${t(targetOf(ev))}${c ? `\n         inside the control: ${t(c)}` : ""}`);
        break;
      }
      case "ui.key": lines.push(`  ${at} pressed ${JSON.stringify(d.key)}${(d.count as number) > 1 ? ` ×${d.count}` : ""}${d.editable ? " (in a text field)" : ""} on: ${t(targetOf(ev))}`); break;
      case "ui.input": lines.push(`  ${at} a field changed: ${t(targetOf(ev))} — ${d.editing ? `being edited, ${d.edits ?? 1} change${d.edits === 1 ? "" : "s"} folded` : "value committed"}${d.valueLength !== undefined ? `, valueLength=${d.valueLength}` : ""} (the typed characters are never recorded)`); break;
      case "ui.submit": lines.push(`  ${at} submitted a form: ${t(targetOf(ev))}`); break;
      case "ui.change": {
        const added = Array.isArray(d.added) ? d.added.filter((x): x is string => typeof x === "string") : [];
        const removed = Array.isArray(d.removed) ? d.removed.filter((x): x is string => typeof x === "string") : [];
        lines.push(`  ${at} the page changed — ${d.mutations} mutations over ${d.durationMs}ms, inside ${t(targetOf(ev))}`);
        for (const r of (Array.isArray(d.regions) ? d.regions : []) as Record<string, unknown>[]) {
          const add = Array.isArray(r.added) ? (r.added as string[]).join(" ") : "";
          lines.push(`         in ${t(r.target)}: ${JSON.stringify(add.replace(/\s+/g, " ").slice(0, 240))}`);
        }
        if (!(Array.isArray(d.regions) && d.regions.length) && added.length) lines.push(`         text that appeared: ${JSON.stringify(added.join(" ").replace(/\s+/g, " ").slice(0, 300))}`);
        if (removed.length) lines.push(`         text that went away: ${JSON.stringify(removed.join(" ").replace(/\s+/g, " ").slice(0, 200))}`);
        break;
      }
      case "ui.route": lines.push(`  ${at} navigated ${JSON.stringify(d.from)} → ${JSON.stringify(d.to)}`); break;
      case "frame.loaded": lines.push(`  ${at} a document loaded: url=${JSON.stringify(d.url)} query=${JSON.stringify(d.query ?? null)}`); break;
      case "network.request": lines.push(`  ${at} the page requested ${JSON.stringify(d.path)}`); break;
      case "network.response": lines.push(`  ${at} a response came back: status=${d.status} ${d.bytes ? `${d.bytes} bytes` : ""}`); break;
      default: lines.push(`  ${at} ${ev.kind}`);
    }
  }
  if (e.evidence.quietMs > 1000) lines.push("", `${Math.round(e.evidence.quietMs / 1000)}s of this stretch had nothing recorded at all.`);
  return lines.join("\n");
}

const SYSTEM = `You are auditing a research tool that watches people use software and writes one sentence about each stretch of what they did.

You will be given the raw recording of ONE stretch, and ONE claim the tool made about it. Judge only whether that claim is supportable by that evidence.

What you must know about the recording:
- Typed characters are NEVER captured. A text field reports only that it changed, how many times, and to what length.
- There is NO mouse movement, NO drag, NO wheel, NO scroll and NO hover, ever. If somebody dragged something across the screen or scrolled a list, the recording contains nothing at all for it.
- There is no window focus and no visibility. Time in front of an unchanging screen and time away from the desk are indistinguishable.
- The contents of a <canvas> are never known. A click on a canvas is a click on a canvas and nothing more; what was drawn there, and what was visible in it, cannot be recovered.
- State an application keeps in memory, or paints only into a canvas, leaves no trace at all.
- Element descriptions are what the collector recorded. An element may be missing its text even though it has a label on screen.
- The broad class must be one of: ORIENTING (working out what the interface or task is), UNDERSTANDING (taking in information: instructions, feedback, examples, reference material), EXPLORING (interacting with something to discover how it behaves), FORMULATING (constructing an answer or piece of work), EVALUATING (checking or comparing work against something), REVISING (changing existing work), ACTING (carrying out a decided action: submitting, generating, advancing, switching view), WAITING (waiting for a model call or system operation), UNCLEAR (not enough evidence).

Be strict about three things. A claim that asserts something the recording cannot show — what somebody understood, intended, believed, wanted, or was trying to do — is not supported, however plausible. A claim that names a specific act ("submitted", "panned the map", "zoomed in") when the recording does not contain that act is not supported. And a claim about what was on screen, or which things were visible, when the only evidence is a canvas, is not supported.

Be fair about two things. Naming what the parts of the software ARE is legitimate if the evidence shows it: saying that text appeared in a results list, or that a control opened a panel, is a reading of the interface, not a claim about a mind. And a coarse, hedged, or explicitly uncertain description that is true is better than a specific one that is not — do not mark a claim down for being cautious.

Answer with the tool. Be concise.`;

const TOOL: Anthropic.Messages.Tool = {
  name: "judge",
  description: "Judge one claim against one stretch of recording.",
  input_schema: {
    type: "object",
    properties: {
      supported: { type: "string", enum: ["yes", "partly", "no"], description: "Is the behavioural claim supported by the observable evidence?" },
      infersUnobservable: { type: "boolean", description: "Does it assert intent, understanding, belief or purpose that the recording cannot show?" },
      claimsHiddenState: { type: "boolean", description: "Does it claim something about canvas contents, visibility, or in-memory state that the recording cannot contain?" },
      broadDefensible: { type: "string", enum: ["yes", "no"], description: "Is the broad class defensible for this evidence?" },
      betterBroad: { type: "string", description: "If not defensible, which of the nine it should be. Otherwise the empty string." },
      descriptionAccurate: { type: "string", enum: ["yes", "partly", "no"], description: "Is the sentence an accurate account of what was recorded?" },
      deservedConfidence: { type: "string", enum: ["high", "medium", "low", "none"], description: "What confidence this claim deserves. 'none' means it should not be asserted." },
      missedActivity: { type: "string", description: "Observable activity in this stretch that the claim ignores and should not have. The empty string if none." },
      why: { type: "string", description: "One or two sentences. Point at the evidence." },
    },
    required: ["supported", "infersUnobservable", "claimsHiddenState", "broadDefensible", "betterBroad", "descriptionAccurate", "deservedConfidence", "missedActivity", "why"],
  },
};

type Case = { key: string; session: string; role: string; index: number; broad: string; sub: string; description: string; because: string; confidence: string; determined: string; evidence: string };

const { compiled: gen } = compiled(process.argv[2] ?? `${DIR}/experiment/run2/profile.json`);
const cases: Case[] = [];
for (const { id, role } of SESSIONS) {
  const s = load(id);
  const eps = read(s, gen);
  const t0 = Date.parse(s.events[0].at);
  eps.forEach((e, i) => cases.push({
    key: `${id}:${i}`, session: id, role, index: i,
    broad: e.broadBehavior, sub: e.subBehavior, description: e.description, because: e.because,
    confidence: e.confidence, determined: e.determined, evidence: rawEvidence(e, t0),
  }));
}
// Shuffled deterministically, so neighbouring stretches of one session are
// never judged in sequence.
const seeded = [...cases].map((c, i) => ({ c, k: (i * 7919 + c.key.length * 104729) % 100003 })).sort((a, b) => a.k - b.k).map((x) => x.c);

const CACHE = `${DIR}/judgements.json`;
const done: Record<string, unknown> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
let n = 0;
const queue = seeded.filter((c) => !done[c.key]);
console.log(`${cases.length} claims, ${queue.length} to judge`);

const work = async (c: Case) => {
  const res = await client.messages.create({
    model: MODEL, max_tokens: 1400, system: SYSTEM, tools: [TOOL], tool_choice: { type: "tool", name: "judge" },
    messages: [{ role: "user", content: `# The recording of this stretch\n\n${c.evidence}\n\n# The claim the tool made\n\nBroad class: ${c.broad}\nName: ${c.sub}\nSentence: "${c.description}"\nStated reason: ${c.because}\nStated confidence: ${c.confidence}\n\nJudge it.` }],
  });
  const use = res.content.find((b) => b.type === "tool_use");
  done[c.key] = { ...c, evidence: undefined, verdict: use && use.type === "tool_use" ? use.input : null };
  if (++n % 5 === 0) { writeFileSync(CACHE, JSON.stringify(done, null, 2)); console.log(`  ${n}/${queue.length}`); }
};

const LANES = 6;
await Promise.all(Array.from({ length: LANES }, async (_, lane) => {
  for (let i = lane; i < queue.length; i += LANES) {
    try { await work(queue[i]); } catch (err) { console.error(`${queue[i].key}: ${(err as Error).message}`); }
  }
}));
writeFileSync(CACHE, JSON.stringify(done, null, 2));
console.log(`done: ${Object.keys(done).length} judgements at ${CACHE}`);
