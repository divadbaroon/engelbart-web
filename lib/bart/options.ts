// The knobs on a question, and the file a question can carry.
//
// Pure: no DOM, no React, no network. The composer's settings popover
// writes these, the route clamps them and turns them into the arguments
// of the model call, and a test holds both to the same arithmetic. The
// point of doing it here rather than in the route is that the two
// constraints below are not obvious, and getting one wrong is a 400 from
// the API rather than a worse answer.

export type Effort = "off" | "low" | "medium" | "high";

// How long Bart may think before it starts answering, as a budget of
// tokens it may spend on the thinking itself. "off" is the ordinary
// call: no thinking block, and the temperature is yours.
export type BartOptions = {
  effort: Effort;
  temperature: number;   // 0 = same answer every time, 1 = as written by the model
  maxTokens: number;     // the longest answer it may write
};

export const THINKING_BUDGET: Record<Exclude<Effort, "off">, number> = {
  low: 2_048,
  medium: 8_192,
  high: 16_384,
};

export const EFFORT_NOTE: Record<Effort, string> = {
  off: "Answers straight away.",
  low: "Thinks briefly first.",
  medium: "Thinks it through first.",
  high: "Thinks at length first — slower, and better on a question that needs several steps.",
};

export const TEMPERATURE = { min: 0, max: 1, step: 0.1 };
export const ANSWER_LENGTH = { min: 1_024, max: 16_384, step: 1_024 };

export const DEFAULT_OPTIONS: BartOptions = { effort: "off", temperature: 1, maxTokens: 4_096 };

const isEffort = (v: unknown): v is Effort => v === "off" || v === "low" || v === "medium" || v === "high";
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// What arrived over the wire, made safe. Anything missing or out of
// range falls back to the default rather than failing the question.
export function readOptions(v: unknown): BartOptions {
  if (!v || typeof v !== "object") return DEFAULT_OPTIONS;
  const { effort, temperature, maxTokens } = v as Record<string, unknown>;
  return {
    effort: isEffort(effort) ? effort : DEFAULT_OPTIONS.effort,
    temperature: typeof temperature === "number" && Number.isFinite(temperature)
      ? clamp(temperature, TEMPERATURE.min, TEMPERATURE.max)
      : DEFAULT_OPTIONS.temperature,
    maxTokens: typeof maxTokens === "number" && Number.isFinite(maxTokens)
      ? clamp(Math.round(maxTokens), ANSWER_LENGTH.min, ANSWER_LENGTH.max)
      : DEFAULT_OPTIONS.maxTokens,
  };
}

// The arguments of the model call, with the API's two rules about
// thinking applied here rather than discovered in a 400:
//
//   1. `temperature` may not be set alongside a thinking block. Thinking
//      runs at the model's own sampling; sending a temperature with it
//      is refused, so an effort above "off" drops the temperature
//      instead of quietly ignoring it.
//   2. `max_tokens` covers the thinking *and* the answer, so it has to
//      be larger than the budget or there is no room left to reply. The
//      answer keeps the length that was asked for on top of the budget.
export type CallOptions = { max_tokens: number; temperature?: number; thinking?: { type: "enabled"; budget_tokens: number } };

export function callOptions(options: BartOptions): CallOptions {
  if (options.effort === "off") return { max_tokens: options.maxTokens, temperature: options.temperature };
  const budget = THINKING_BUDGET[options.effort];
  return { max_tokens: budget + options.maxTokens, thinking: { type: "enabled", budget_tokens: budget } };
}

// ---- a file brought in from the computer

export type Attachment = { name: string; text: string };

// What a question may carry. Generous enough for a log, a config or a
// paper's notes; short of the point where one file crowds out the run
// the question is about.
export const ATTACH = { files: 5, perFile: 60_000, total: 150_000 };

export const isTextFile = (name: string, type: string) =>
  type.startsWith("text/") ||
  /^(application\/)?(json|xml|yaml|x-yaml|javascript|typescript|sql|csv)$/.test(type.replace("application/", "")) ||
  /\.(txt|md|markdown|json|ya?ml|toml|ini|cfg|conf|csv|tsv|log|html?|css|scss|jsx?|tsx?|mjs|cjs|py|rb|go|rs|java|kt|c|h|cc|cpp|hpp|cs|swift|sh|bash|zsh|sql|env|gitignore|dockerfile)$/i.test(name);

// What the model is actually given, and what the thread stores and shows.
//
// One string rather than a second field, because the answer has to be
// able to refer back to the file on the next question as well as this
// one, and because a transcript that hides what was sent is a transcript
// you cannot check. The file is fenced and named, so Bart can tell the
// person's words from the file's.
export function withAttachments(message: string, attachments: Attachment[]): string {
  if (!attachments.length) return message;
  const files = attachments
    .map((a) => `<attached-file name="${a.name.replace(/"/g, "'")}">\n${a.text}\n</attached-file>`)
    .join("\n\n");
  return `${files}\n\n${message}`;
}

// The same rules the picker applies, so the route cannot be handed more
// than the composer would have sent.
export function readAttachments(v: unknown): Attachment[] {
  if (!Array.isArray(v)) return [];
  const out: Attachment[] = [];
  let total = 0;
  for (const item of v.slice(0, ATTACH.files)) {
    if (!item || typeof item !== "object") continue;
    const { name, text } = item as Record<string, unknown>;
    if (typeof name !== "string" || typeof text !== "string" || !text) continue;
    const kept = text.slice(0, Math.min(ATTACH.perFile, ATTACH.total - total));
    if (!kept) break;
    total += kept.length;
    out.push({ name: name.slice(0, 200), text: kept });
  }
  return out;
}
