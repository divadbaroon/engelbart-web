// What one model call had and produced, arranged for reading: a card per
// kind of content the captured request carried, a summary of the model
// and its settings, a preview of the answer. Everything here is a
// presentation of the literal request and response the gateway saw. The
// cards do not say where a piece of content came from (a file, a database,
// the application's state) because the trace does not know; they say only
// what the request contained. The message array as sent (the inspector's
// Messages pane) stays the source of truth. Free of React.
import type { ModelCall, ModelRequest, ModelToolCall } from "@/lib/trace/types";

export type Part = { type?: string; text?: string; image_url?: { url?: string }; [k: string]: unknown };
export type Message = { role?: string; content?: string | Part[] | null; name?: string; tool_call_id?: string; tool_calls?: unknown[]; chars?: number; parts?: number | null };

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();
const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + "…" : s);
export const count = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, word: string, words = `${word}s`) => `${n} ${n === 1 ? word : words}`;

// The text of a message, whatever shape its content took. Images are
// named, not carried.
export function messageText(m: Message): string {
  if (typeof m.content === "string") return m.content;
  if (Array.isArray(m.content)) return m.content.map((p) => (typeof p.text === "string" ? p.text : p.type === "image_url" ? "[image]" : "")).filter(Boolean).join("\n");
  return "";
}
export const messageChars = (m: Message): number => (typeof m.chars === "number" ? m.chars : messageText(m).length);

// The message array, split: the system messages, the turns before the
// latest input, and the latest input itself (whatever its role).
export type Conversation = { system: Message[]; turns: Message[]; input: Message | null };
export function conversation(req: ModelRequest | null | undefined): Conversation {
  const messages = (req?.messages ?? []) as Message[];
  const isSystem = (m: Message) => m.role === "system" || m.role === "developer";
  const system = messages.filter(isSystem);
  const rest = messages.filter((m) => !isSystem(m));
  const input = rest.length ? rest[rest.length - 1] : null;
  return { system, turns: rest.slice(0, -1), input };
}

// ---- the system prompt, in the sections its author marked
// Only boundaries the text itself carries count: a horizontal rule (***,
// ---, ___), a markdown heading. A prompt with none is one section. The
// text of each section is kept as written.
export type PromptSection = { title: string; text: string };
const RULE = /^\s*(?:[*\-_]\s*){3,}$/;
const HEADING = /^\s*#{1,6}\s+(\S.*)$/;
const STARRED = /^\s*\*([^*\n]{1,40})\*\s*:?/gm;

export function promptSections(text: string): PromptSection[] {
  const blocks: { heading: string | null; lines: string[] }[] = [{ heading: null, lines: [] }];
  for (const line of text.split(/\r?\n/)) {
    if (RULE.test(line)) { blocks.push({ heading: null, lines: [] }); continue; }
    const h = HEADING.exec(line);
    if (h) { blocks.push({ heading: h[1].trim(), lines: [] }); continue; }
    blocks[blocks.length - 1].lines.push(line);
  }
  const sections = blocks.map((b) => ({ heading: b.heading, text: trimBlankLines(b.lines) })).filter((b) => b.text.trim());
  return sections.map((s) => ({ title: s.heading ?? sectionTitle(s.text), text: s.text }));
}

function trimBlankLines(lines: string[]): string {
  let a = 0, b = lines.length;
  while (a < b && !lines[a].trim()) a++;
  while (b > a && !lines[b - 1].trim()) b--;
  return lines.slice(a, b).join("\n");
}

// A section's own label: the starred labels it opens with ("*Course*:"),
// a first line that is a label ("Output in json format:"), else its
// first words.
function sectionTitle(text: string): string {
  const labels: string[] = [];
  for (const m of text.matchAll(STARRED)) { const l = collapse(m[1]); if (l && !labels.includes(l)) labels.push(l); if (labels.length === 3) break; }
  if (labels.length) return labels.join(" · ");
  const first = collapse(text.split(/\r?\n/).find((l) => l.trim()) ?? "");
  if (/:$/.test(first) && first.length <= 48) return first.slice(0, -1);
  return clip(first, 48);
}

// ---- the cards
export type CardId = "system" | "history" | "input" | "tools" | "contract";
export type ContextCard = { id: CardId; title: string; summary: string; meta: string | null; kept: boolean };

type ResponseFormat = { type?: string; json_schema?: { name?: string; strict?: boolean; schema?: { required?: unknown; properties?: Record<string, unknown> } }; schema_name?: string; strict?: boolean } | null;
type Tool = { type?: string; name?: string; function?: { name?: string } };

export function contextCards(call: ModelCall): ContextCard[] {
  const req = call.request;
  if (!req) return [];
  const kept = call.capture === "full";
  const { turns, input } = conversation(req);
  const cards: ContextCard[] = [];

  if (req.system !== null && req.system !== undefined) {
    const text = typeof req.system === "string" ? req.system : null;
    const chars = typeof req.system === "string" ? req.system.length : req.system.chars;
    const sections = text !== null ? promptSections(text) : [];
    cards.push({
      id: "system", title: "System instructions",
      summary: text !== null ? clip(collapse(text), 110) : `${count(chars)} characters, not kept`,
      meta: `${count(chars)} chars${sections.length > 1 ? ` · ${sections.length} sections` : ""}`, kept,
    });
  }
  if (turns.length) {
    const last = turns[turns.length - 1];
    const chars = turns.reduce((n, t) => n + messageChars(t), 0);
    cards.push({
      id: "history", title: "Prior conversation",
      summary: kept ? `${last.role ?? "?"}: ${clip(collapse(messageText(last)) || "(no text)", 100)}` : turns.map((t) => t.role ?? "?").join(", "),
      meta: `${plural(turns.length, "previous turn")} · ${count(chars)} chars`, kept,
    });
  }
  if (input) {
    const role = input.role ?? "?";
    const text = collapse(messageText(input));
    cards.push({
      id: "input", title: role === "user" ? "User message" : role === "tool" ? "Tool result" : `${role} message`,
      summary: kept ? (text ? `“${clip(text, 110)}”` : "(no text)") : `${count(messageChars(input))} characters, not kept`,
      meta: `${count(messageChars(input))} chars${input.name ? ` · ${input.name}` : ""}`, kept,
    });
  }
  const tools = (req.tools ?? []) as Tool[];
  if (tools.length) {
    const names = tools.map((t) => t.function?.name ?? t.name ?? t.type ?? "?");
    cards.push({
      id: "tools", title: "Tools offered", summary: clip(names.join(", "), 110),
      meta: `${plural(tools.length, "tool")}${typeof req.tool_choice === "string" ? ` · choice ${req.tool_choice}` : ""}`, kept,
    });
  }
  const rf = req.response_format as ResponseFormat;
  if (rf && typeof rf === "object") {
    const name = rf.json_schema?.name ?? rf.schema_name ?? null;
    const strict = rf.json_schema?.strict ?? rf.strict ?? false;
    const schema = rf.json_schema?.schema;
    const required = Array.isArray(schema?.required) ? schema.required.filter((k): k is string => typeof k === "string") : schema?.properties ? Object.keys(schema.properties) : [];
    const kind = rf.type === "json_schema" ? `${strict ? "strict " : ""}JSON schema` : rf.type === "json_object" ? "JSON object" : rf.type ?? "format";
    cards.push({
      id: "contract", title: "Output contract",
      summary: [name, required.length ? `{ ${clip(required.join(", "), 80)} }` : null].filter(Boolean).join(" · ") || kind,
      meta: kind, kept: true,
    });
  }
  return cards;
}

// ---- the model
export type ModelSummary = {
  model: string; answeredAs: string | null; provider: string; api: string | null; host: string;
  settings: { key: string; value: string }[]; streamed: boolean | null;
  state: "in flight" | "done" | "error" | "aborted"; status: number | null; latencyMs: number | null; ttftMs: number | null;
  messages: number; promptChars: number | null; error: string | null;
};
const PROVIDER_NAMES: Record<string, string> = { openai: "OpenAI", anthropic: "Anthropic", google: "Google", mistral: "Mistral", cohere: "Cohere", groq: "Groq" };

export function modelSummary(call: ModelCall): ModelSummary {
  const req = call.request;
  const settings = Object.entries(req?.settings ?? {}).map(([key, v]) => ({ key, value: typeof v === "object" ? JSON.stringify(v) : String(v) }));
  return {
    model: call.model ?? "model",
    answeredAs: call.response?.model && call.response.model !== call.model ? call.response.model : null,
    provider: call.provider ? PROVIDER_NAMES[call.provider] ?? call.provider : "unclaimed",
    api: call.api ? call.api.replace(/^[^.]+\./, "") : null,
    host: call.upstream.host,
    settings, streamed: call.streamed,
    state: call.aborted ? "aborted" : call.phase === "error" ? "error" : call.phase === "response" ? "done" : "in flight",
    status: call.status, latencyMs: call.latencyMs, ttftMs: call.ttftMs,
    messages: req?.message_count ?? 0, promptChars: req?.prompt_chars ?? null,
    error: call.error?.message ?? null,
  };
}

// ---- the output
export type OutputPreview =
  | { kind: "pending" }
  | { kind: "error"; message: string }
  | { kind: "empty"; reason: string }
  | { kind: "counts"; chars: number; refusal: boolean; toolCalls: string[] }
  | { kind: "json"; entries: { key: string; value: string }[]; more: number; toolCalls: ModelToolCall[] }
  | { kind: "text"; text: string; truncated: boolean; toolCalls: ModelToolCall[] };

export function outputPreview(call: ModelCall): OutputPreview {
  if (call.phase === "request") return { kind: "pending" };
  if (call.phase === "error") return { kind: "error", message: call.error?.message ?? "the call failed" };
  const out = call.response?.output;
  if (!out) return { kind: "empty", reason: call.response?.parse_errors?.length ? call.response.parse_errors.map((e) => e.message).join("; ") : "nothing was read from the response" };
  if (!("text" in out)) return { kind: "counts", chars: out.chars, refusal: out.refusal, toolCalls: out.tool_calls };
  const parsed = parseObject(out.text);
  if (parsed) {
    const keys = Object.keys(parsed);
    return { kind: "json", entries: keys.slice(0, 6).map((key) => ({ key, value: previewValue(parsed[key]) })), more: Math.max(0, keys.length - 6), toolCalls: out.tool_calls };
  }
  const text = collapse(out.text);
  return { kind: "text", text: clip(text, 220), truncated: out.text_truncated || text.length > 220, toolCalls: out.tool_calls };
}

function parseObject(text: string): Record<string, unknown> | null {
  try { const v = JSON.parse(text); return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null; } catch { return null; }
}

// One line per top-level key: strings quoted and clipped, arrays by
// length (and the keys their objects share), objects by their keys.
export function previewValue(v: unknown): string {
  if (typeof v === "string") return `“${clip(collapse(v), 72)}”`;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) {
    const first = v[0];
    const shape = first && typeof first === "object" && !Array.isArray(first) ? ` of { ${clip(Object.keys(first as object).join(", "), 48)} }` : "";
    return `[${plural(v.length, "item")}${shape}]`;
  }
  if (typeof v === "object") return `{ ${clip(Object.keys(v as object).join(", "), 60)} }`;
  return String(v);
}
