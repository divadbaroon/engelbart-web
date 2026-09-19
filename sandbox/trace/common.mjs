// Shared pieces of the sandbox-side trace tooling: the JSON-line event
// format the worker reads from stdout, prefixed logs on stderr, ids,
// header allowlists, secret redaction, size clipping and an SSE parser.
//
// Every gateway in this folder talks to the worker the same way: one JSON
// object per stdout line, marked {"engelbart":"trace","v":1}, and human
// lines on stderr prefixed with the process name in brackets. The worker
// never has to guess which stream is which.
import crypto from "node:crypto";
import fs from "node:fs";
import zlib from "node:zlib";

export const TRACE_MARK = "trace";
export const TRACE_VERSION = 1;

export const newId = (prefix) => `${prefix}_${crypto.randomBytes(9).toString("base64url")}`;

// (kind, fields) => one stdout line. Timestamps are set here so every
// event carries the sandbox clock, which the collector pairs with its own.
export function makeEmitter(source, stream = process.stdout) {
  return (kind, fields = {}) => {
    stream.write(JSON.stringify({ engelbart: TRACE_MARK, v: TRACE_VERSION, source, kind, ts: new Date().toISOString(), ...fields }) + "\n");
  };
}

export function makeLogger(source, stream = process.stderr) {
  return (...parts) => { stream.write(`[${source}] ${parts.join(" ")}\n`); };
}

// Is this stdout line one of ours? Used by the collector and the tests.
export function parseTraceLine(line) {
  if (!line.startsWith("{")) return null;
  try {
    const obj = JSON.parse(line);
    return obj && obj.engelbart === TRACE_MARK && typeof obj.kind === "string" ? obj : null;
  } catch { return null; }
}

// Headers worth keeping on a model call. Everything else is dropped
// before an event is written: authorization, cookies, api keys and
// organization ids never leave the wire.
export const REQUEST_HEADER_ALLOWLIST = new Set([
  "content-type", "content-length", "accept", "accept-encoding", "user-agent",
  "x-stainless-lang", "x-stainless-package-version", "x-stainless-runtime", "x-stainless-runtime-version",
  "x-stainless-os", "x-stainless-arch", "x-stainless-retry-count", "x-stainless-timeout", "openai-beta",
  "anthropic-version", "anthropic-beta",
]);
export const RESPONSE_HEADER_ALLOWLIST = new Set([
  "content-type", "content-length", "content-encoding", "transfer-encoding", "date", "server", "cache-control",
  "x-request-id", "request-id", "openai-processing-ms", "openai-version", "openai-model",
  "x-ratelimit-limit-requests", "x-ratelimit-limit-tokens", "x-ratelimit-remaining-requests",
  "x-ratelimit-remaining-tokens", "x-ratelimit-reset-requests", "x-ratelimit-reset-tokens",
  "anthropic-ratelimit-requests-remaining", "anthropic-ratelimit-tokens-remaining", "cf-ray",
]);

export function pickHeaders(headers, allowlist) {
  const out = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    const key = name.toLowerCase();
    if (allowlist.has(key)) out[key] = Array.isArray(value) ? value.join(", ") : String(value);
  }
  return out;
}

// Hop-by-hop headers never cross a proxy.
const HOP_BY_HOP = new Set(["connection", "keep-alive", "proxy-connection", "proxy-authenticate", "proxy-authorization", "te", "trailer", "upgrade"]);
export function stripHopByHop(headers) {
  const out = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (!HOP_BY_HOP.has(name.toLowerCase())) out[name] = value;
  }
  return out;
}

// Replaces known secret values, and anything shaped like a bearer token
// or an API key, before text is stored. Values come from the environment
// the worker handed to the application; the redactor never sees more
// than it needs and only holds them in memory.
const KEY_PATTERNS = [
  [/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/g, "Bearer [redacted]"],
  [/\bsk-(?:[A-Za-z0-9_-]{2,}-)?[A-Za-z0-9_-]{16,}/g, "[redacted:api-key]"],
  [/\b(mongodb(?:\+srv)?:\/\/)[^\s"'@]+@/g, "$1[redacted]@"],
];

export class Redactor {
  constructor(values = {}) {
    // Longest first so a value that contains another is replaced whole.
    this.values = Object.entries(values)
      .filter(([, v]) => typeof v === "string" && v.length >= 6)
      .sort((a, b) => b[1].length - a[1].length);
  }
  static fromFile(file, log) {
    if (!file) return new Redactor();
    try {
      const values = JSON.parse(fs.readFileSync(file, "utf8"));
      try { fs.unlinkSync(file); } catch {}
      const r = new Redactor(values);
      log?.(`redacting ${r.values.length} value(s) from ${file}`);
      return r;
    } catch (err) {
      log?.(`no redaction values (${err.message})`);
      return new Redactor();
    }
  }
  text(s) {
    if (typeof s !== "string" || !s) return s;
    let out = s;
    for (const [name, value] of this.values) out = out.split(value).join(`[redacted:${name}]`);
    for (const [pattern, replacement] of KEY_PATTERNS) out = out.replace(pattern, replacement);
    return out;
  }
  json(value) {
    if (typeof value === "string") return this.text(value);
    if (Array.isArray(value)) return value.map((v) => this.json(v));
    if (value && typeof value === "object") {
      const out = {};
      for (const [k, v] of Object.entries(value)) out[k] = this.json(v);
      return out;
    }
    return value;
  }
}

// Clip text to a byte budget, saying so.
export function clip(text, maxBytes) {
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes <= maxBytes) return { text, bytes, truncated: false };
  return { text: Buffer.from(text, "utf8").subarray(0, maxBytes).toString("utf8"), bytes, truncated: true };
}

// Collects raw bytes up to a budget while counting everything.
export class ByteSink {
  constructor(maxBytes) { this.max = maxBytes; this.parts = []; this.kept = 0; this.total = 0; }
  push(chunk) {
    this.total += chunk.length;
    if (this.kept >= this.max) return;
    const room = this.max - this.kept;
    const part = chunk.length > room ? chunk.subarray(0, room) : chunk;
    this.parts.push(part);
    this.kept += part.length;
  }
  get truncated() { return this.total > this.kept; }
  text() { return Buffer.concat(this.parts).toString("utf8"); }
}

// A transform that undoes the content-encoding the upstream chose, so the
// bytes the client receives stay untouched while the tee reads plain text.
export function decompressor(encoding) {
  switch ((encoding ?? "").trim().toLowerCase()) {
    case "gzip": case "x-gzip": return zlib.createGunzip();
    case "deflate": return zlib.createInflate();
    case "br": return zlib.createBrotliDecompress();
    case "zstd": return typeof zlib.createZstdDecompress === "function" ? zlib.createZstdDecompress() : null;
    default: return null;
  }
}

// Server-sent events, as the OpenAI and Anthropic APIs stream them:
// "data: ..." lines, blank line between events, CRLF tolerated.
export class SseParser {
  constructor(onEvent) { this.onEvent = onEvent; this.buffer = ""; this.decoder = new TextDecoder(); }
  feed(chunk) {
    this.buffer += typeof chunk === "string" ? chunk : this.decoder.decode(chunk, { stream: true });
    this.buffer = this.buffer.replace(/\r\n/g, "\n");
    let i;
    while ((i = this.buffer.indexOf("\n\n")) >= 0) {
      const block = this.buffer.slice(0, i);
      this.buffer = this.buffer.slice(i + 2);
      this.dispatch(block);
    }
  }
  finish() {
    this.buffer += this.decoder.decode();
    if (this.buffer.trim()) this.dispatch(this.buffer.replace(/\r\n/g, "\n"));
    this.buffer = "";
  }
  dispatch(block) {
    const event = { event: null, id: null, data: [] };
    for (const line of block.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon < 0 ? line : line.slice(0, colon);
      let value = colon < 0 ? "" : line.slice(colon + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (field === "data") event.data.push(value);
      else if (field === "event") event.event = value;
      else if (field === "id") event.id = value;
    }
    if (event.data.length) this.onEvent({ event: event.event, id: event.id, data: event.data.join("\n") });
  }
}

export const timingSafeEqual = (a, b) => {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
