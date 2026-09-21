// Turns the gateway's stdout JSONL into the same rows the real collector
// writes to the database. Identical envelope split, identical ordering.
import { readFileSync, writeFileSync } from "node:fs";
const ENVELOPE = new Set(["engelbart", "v", "source", "kind", "ts", "interactionId", "requestId", "callId", "correlation"]);
const str = (v) => (typeof v === "string" ? v : null);
const correlationOf = (v) => (v === "explicit" || v === "temporal" ? v : null);

export function collect(jsonlPath, runId) {
  const events = [];
  let seq = 0;
  for (const line of readFileSync(jsonlPath, "utf8").split("\n")) {
    if (!line.startsWith("{")) continue;
    let ev; try { ev = JSON.parse(line); } catch { continue; }
    if (!ev || ev.engelbart !== "trace" || typeof ev.kind !== "string" || typeof ev.source !== "string") continue;
    if (ev.kind === "gateway.listening") continue;
    events.push({
      id: seq, run_id: runId, seq: seq++, at: ev.ts, received_at: ev.ts, source: ev.source, kind: ev.kind,
      interaction_id: str(ev.interactionId), request_id: str(ev.requestId), call_id: str(ev.callId),
      correlation: correlationOf(ev.correlation),
      data: Object.fromEntries(Object.entries(ev).filter(([k]) => !ENVELOPE.has(k))),
    });
  }
  return { runId, events, calls: [] };
}

if (process.argv[1].endsWith("collect.mjs")) {
  const [, , jsonl, out, runId] = process.argv;
  const s = collect(jsonl, runId);
  writeFileSync(out, JSON.stringify(s));
  const k = {};
  for (const e of s.events) k[e.kind] = (k[e.kind] ?? 0) + 1;
  console.log(`${runId}: ${s.events.length} events  ${JSON.stringify(k)}`);
}
