// Blind adjudication. A judge sees the raw evidence for one stretch and
// ONE claim about it, never both claims, never which system wrote it,
// never the handwritten label. Agreement with the handwritten taxonomy is
// not the target — the handwritten taxonomy can be wrong — so this asks
// whether a sentence is supportable at all.
import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { targetOf } from "@/lib/trace/types";
import type { Episode } from "@/lib/activity/types";
import { DIR, SESSIONS, load, handwritten, tierAGen, compiled, clock } from "./lib.mts";

const MODEL = "claude-opus-5";
const client = new Anthropic();

// Raw evidence, rendered from the stretch's own events. Deliberately not
// from the Evidence record: that already carries channel names, control
// names and a document label, all of which come from the taxonomy being
// judged and would hand the judge the answer.
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
    for (const k of ["tag", "id", "testid", "role", "name", "type", "text", "label", "placeholder", "editable", "href", "size"]) if (x[k] !== undefined) bits.push(`${k}=${JSON.stringify(x[k])}`);
    if (!bits.length && x.selector) bits.push(`selector=${JSON.stringify(x.selector)}`);
    return bits.join(" ");
  };
  for (const ev of e.events) {
    const d = (ev.data ?? {}) as Record<string, unknown>;
    const at = `+${Math.round((Date.parse(ev.at) - Date.parse(e.startedAt)) / 1000)}s`;
    switch (ev.kind) {
      case "ui.click": lines.push(`  ${at} clicked: ${t(targetOf(ev))}`); break;
      case "ui.key": lines.push(`  ${at} pressed ${JSON.stringify(d.key)}${(d.count as number) > 1 ? ` ×${d.count}` : ""}${d.editable ? " (in a text field)" : ""} on: ${t(targetOf(ev))}`); break;
      case "ui.input": lines.push(`  ${at} a field changed: ${t(targetOf(ev))} — kind=${JSON.stringify(d.kind)}${d.valueLength !== undefined ? ` valueLength=${d.valueLength}` : ""} (the typed characters are never recorded)`); break;
      case "ui.submit": lines.push(`  ${at} submitted a form: ${t(targetOf(ev))}`); break;
      case "ui.change": {
        const added = Array.isArray(d.added) ? d.added.filter((x): x is string => typeof x === "string") : [];
        lines.push(`  ${at} text appeared on screen inside ${t(targetOf(ev))}`);
        if (added.length) lines.push(`         the text: ${JSON.stringify(added.join(" ").replace(/\s+/g, " ").slice(0, 300))}`);
        break;
      }
      case "ui.focus": lines.push(`  ${at} the person moved into the document ${JSON.stringify(d.frameId)}`); break;
      case "ui.route": lines.push(`  ${at} navigated ${JSON.stringify(d.from)} → ${JSON.stringify(d.to)}`); break;
      case "frame.loaded": lines.push(`  ${at} a document loaded: url=${JSON.stringify(d.url)} query=${JSON.stringify(d.query ?? null)}`); break;
      case "frame.attached": lines.push(`  ${at} a document was attached: name=${JSON.stringify(d.name)} selectorInParent=${JSON.stringify(d.selectorInParent)}`); break;
      default: lines.push(`  ${at} ${ev.kind}`);
    }
  }
  if (e.evidence.call) lines.push("", `A call to a language model was open during this stretch (${e.evidence.call.latencyMs ?? "?"}ms).`);
  if (e.evidence.quietMs > 1000) lines.push("", `${Math.round(e.evidence.quietMs / 1000)}s of this stretch had nothing recorded at all.`);
  return lines.join("\n");
}

const SYSTEM = `You are auditing a research tool that watches people use software and writes one sentence about each stretch of what they did.

You will be given the raw recording of ONE stretch, and ONE claim the tool made about it. Judge only whether that claim is supportable by that evidence.

What you must know about the recording:
- Typed characters are NEVER captured. A text field reports only that it changed. So text a person submitted can only ever appear as text the application echoed back onto the screen.
- There is no scroll, no mouse movement, no window focus, no visibility. Time in front of an unchanging screen and time away from the desk are indistinguishable.
- Element descriptions are what the collector recorded; a canvas's contents are never known.
- The broad class must be one of: ORIENTING (working out what the interface or task is), UNDERSTANDING (taking in information: instructions, feedback, examples, reference material), EXPLORING (interacting with something to discover how it behaves), FORMULATING (constructing an answer or piece of work), EVALUATING (checking or comparing work against something), REVISING (changing existing work), ACTING (carrying out a decided action: submitting, generating, advancing, switching view), WAITING (waiting for a model call or system operation), UNCLEAR (not enough evidence).

Be strict about two things. A claim that asserts something the recording cannot show — what somebody understood, intended, believed, wanted, or was trying to do — is not supported, however plausible. And a claim that names a specific act ("submitted", "restarted it", "played") when the recording does not contain that act is not supported.

Be fair about one thing: naming what the parts of the software ARE is legitimate if the evidence shows it. Saying text appeared in a conversation, or that a panel holds a worked example, is a reading of the interface, not a claim about a mind.

Answer with the tool. Be concise.`;

const TOOL: Anthropic.Messages.Tool = {
  name: "judge",
  description: "Judge one claim against one stretch of recording.",
  input_schema: {
    type: "object",
    properties: {
      supported: { type: "string", enum: ["yes", "partly", "no"], description: "Is the behavioural claim supported by the observable evidence?" },
      infersUnobservable: { type: "boolean", description: "Does it assert intent, understanding, belief or purpose that the recording cannot show?" },
      broadDefensible: { type: "string", enum: ["yes", "no"], description: "Is the broad class defensible for this evidence?" },
      betterBroad: { type: "string", description: "If not defensible, which of the nine it should be. Otherwise the empty string." },
      descriptionAccurate: { type: "string", enum: ["yes", "partly", "no"], description: "Is the sentence an accurate account of what was recorded?" },
      deservedConfidence: { type: "string", enum: ["high", "medium", "low", "none"], description: "What confidence this claim deserves. 'none' means it should not be asserted." },
      why: { type: "string", description: "One or two sentences. Point at the evidence." },
    },
    required: ["supported", "infersUnobservable", "broadDefensible", "betterBroad", "descriptionAccurate", "deservedConfidence", "why"],
  },
};

type Case = { key: string; session: string; role: string; index: number; system: "A" | "B"; broad: string; sub: string; description: string; because: string; confidence: string; evidence: string };

const { compiled: gen } = compiled(process.argv[2] ?? `${DIR}/out/profile.json`);
const cases: Case[] = [];
for (const { id, role } of SESSIONS) {
  const s = load(id);
  const hand = handwritten(s);
  const genA = tierAGen(s, gen);
  const t0 = Date.parse(hand[0]?.startedAt ?? "1970-01-01");
  const n = Math.min(hand.length, genA.length);
  for (let i = 0; i < n; i++) {
    const ev = rawEvidence(hand[i], t0);
    for (const [system, e] of [["A", hand[i]], ["B", genA[i]]] as const) {
      cases.push({ key: `${id}:${i}:${system}`, session: id, role, index: i, system,
        broad: e.broadBehavior, sub: e.subBehavior, description: e.description, because: e.because, confidence: e.confidence, evidence: ev });
    }
  }
}
// Shuffled deterministically, so a judge never sees the two claims about
// one stretch in sequence.
const seeded = [...cases].map((c, i) => ({ c, k: (i * 7919 + c.key.length * 104729) % 100003 })).sort((a, b) => a.k - b.k).map((x) => x.c);

const CACHE = `${DIR}/judgements.json`;
const done: Record<string, unknown> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
let n = 0;
const queue = seeded.filter((c) => !done[c.key]);
console.log(`${cases.length} claims, ${queue.length} to judge`);

const work = async (c: Case) => {
  const res = await client.messages.create({
    model: MODEL, max_tokens: 1200, system: SYSTEM, tools: [TOOL], tool_choice: { type: "tool", name: "judge" },
    messages: [{ role: "user", content: `# The recording of this stretch\n\n${c.evidence}\n\n# The claim the tool made\n\nBroad class: ${c.broad}\nName: ${c.sub}\nSentence: "${c.description}"\nStated reason: ${c.because}\nStated confidence: ${c.confidence}\n\nJudge it.` }],
  });
  const use = res.content.find((b) => b.type === "tool_use");
  done[c.key] = { ...c, evidence: undefined, verdict: use && use.type === "tool_use" ? use.input : null };
  if (++n % 10 === 0) { writeFileSync(CACHE, JSON.stringify(done, null, 2)); console.log(`  ${n}/${queue.length}`); }
};

const LANES = 6;
await Promise.all(Array.from({ length: LANES }, async (_, lane) => {
  for (let i = lane; i < queue.length; i += LANES) {
    try { await work(queue[i]); } catch (err) { console.error(`${queue[i].key}: ${(err as Error).message}`); }
  }
}));
writeFileSync(CACHE, JSON.stringify(done, null, 2));
console.log(`done: ${Object.keys(done).length} judgements at ${CACHE}`);
