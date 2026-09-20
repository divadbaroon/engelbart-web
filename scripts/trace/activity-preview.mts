// The Activity timeline for a stored run, printed, through the same
// functions the interface uses. A way to judge classifications against a
// real session without opening a browser.
//
//   node --env-file=.env.local --import tsx scripts/trace/activity-preview.mts [runId]
import { createClient } from "@supabase/supabase-js";
import { frameIndex, traceRows, traceStages } from "@/lib/trace/timeline";
import { toTraceEvent, toModelCall, MODEL_CALL_COLUMNS, type TraceEventRow, type ModelCallRow } from "@/lib/trace/types";
import { classify } from "@/lib/activity/classify";
import { ROPE_TAXONOMY, ropeSurface } from "@/lib/activity/rope";
import { DEFAULT_SEGMENTATION, type Segmentation } from "@/lib/activity/segment";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) { console.error("needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY"); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });
const RUN = process.argv[2] ?? "87a7ceb0-8429-41d2-a90d-a0f5e1af182c";
const LOUD = process.argv.includes("-v");

const { data: evRows, error: evErr } = await db.from("engelbart_trace_events")
  .select("id, run_id, seq, at, received_at, source, kind, interaction_id, request_id, call_id, correlation, data")
  .eq("run_id", RUN).order("seq", { ascending: true }).limit(5000);
if (evErr) throw evErr;
const { data: callRows, error: callErr } = await db.from("engelbart_model_calls").select(MODEL_CALL_COLUMNS).eq("run_id", RUN);
if (callErr) throw callErr;

const events = (evRows as unknown as TraceEventRow[]).map(toTraceEvent);
const calls = (callRows as unknown as ModelCallRow[]).map(toModelCall);
const frames = frameIndex(events);
const stages = traceStages(traceRows(events, calls, frames)).primary;

const tuned: Segmentation = { ...DEFAULT_SEGMENTATION };
for (const arg of process.argv.slice(3)) {
  const [k, v] = arg.split("=");
  if (k && k in tuned && v) (tuned as unknown as Record<string, number>)[k] = Number(v);
}

console.log(`run ${RUN}`);
console.log(`${events.length} events · ${calls.length} model calls · ${stages.length} stages`);
console.log(`segmentation ${JSON.stringify(tuned)}\n`);

const episodes = classify({
  stages, frames, events, taxonomy: ROPE_TAXONOMY, surfaceOf: ropeSurface, segmentation: tuned,
  calls: new Map(calls.map((c) => [c.callId, { model: c.model, latencyMs: c.latencyMs }])),
});

const t0 = Date.parse(stages[0]?.at ?? new Date().toISOString());
const clock = (iso: string) => {
  const s = Math.round((Date.parse(iso) - t0) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const dur = (n: number) => { const s = Math.round(n / 1000); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`; };

for (const e of episodes) {
  const span = e.durationMs < 1500 ? clock(e.startedAt) : `${clock(e.startedAt)}–${clock(e.endedAt)}`;
  console.log(`${span.padEnd(13)}${e.broadBehavior}`);
  console.log(`${"".padEnd(13)}${e.description}`);
  console.log(`${"".padEnd(13)}${dur(e.durationMs)}  ·  ${e.subBehavior} · ${e.confidence} · ${e.evidence.surface.label} · ${e.stageIds.length} stage(s)`);
  console.log(`${"".padEnd(13)}because ${e.because}`);
  if (LOUD) {
    const v = e.evidence;
    const line = (k: string, x: unknown) => console.log(`${"".padEnd(13)}  ${k}: ${typeof x === "string" ? x : JSON.stringify(x)}`);
    line("surface", `${v.surface.key} (${v.surface.role})`);
    line("acts", v.acts);
    if (v.entered_by.length) line("entered_by", v.entered_by);
    if (v.entered) line("entered", JSON.stringify(v.entered).slice(0, 160));
    if (v.call) line("call", v.call);
    if (v.discontinuity) line("discontinuity", v.discontinuity);
    line("quiet", `${v.openingQuietMs}ms before / ${v.quietMs}ms inside`);
    for (const a of v.appeared.slice(0, 6)) line(`appeared[${a.channel ?? "-"}]`, JSON.stringify(a.text).slice(0, 120));
    if (v.regions.length) line("regions", v.regions);
    line("stages", e.stages.map((s) => `${s.stage}:${s.title}`).join(" | ").slice(0, 200));
  }
  console.log("");
}
console.log(`${episodes.length} episodes over ${dur(Date.parse(episodes[episodes.length - 1]?.endedAt ?? stages[0].at) - t0)}`);
