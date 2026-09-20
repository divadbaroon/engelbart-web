// What a stored run gets summarised as, through the same functions the
// Activity view uses: classify, reduce, key, ask, check.
//
// It prints every step rather than the answer, because the answer is the
// least interesting part. What is worth looking at is the story the model
// was given — everything it could possibly have known — and whether what
// came back survived checking.
//
//   node --env-file=.env.local --import tsx scripts/trace/activity-summary.mts [runId] [--model=…]
import { createClient } from "@supabase/supabase-js";
import { frameIndex, traceRows, traceStages } from "@/lib/trace/timeline";
import { toTraceEvent, toModelCall, MODEL_CALL_COLUMNS, type TraceEventRow, type ModelCallRow } from "@/lib/trace/types";
import { classify } from "@/lib/activity/classify";
import { ROPE_TAXONOMY, ropeSurface } from "@/lib/activity/rope";
import { renderStory, storyKey, storyOf } from "@/lib/activity/story";
import { narrateSession, NARRATOR_MODEL } from "@/lib/activity/narrate";
import { checkSummary } from "@/lib/activity/claims";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) { console.error("needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY"); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });
const RUN = process.argv[2] ?? "87a7ceb0-8429-41d2-a90d-a0f5e1af182c";
// The knob, so two models can be put to the same story.
const MODEL = process.argv.find((a) => a.startsWith("--model="))?.slice(8) ?? NARRATOR_MODEL;

const { data: evRows, error: evErr } = await db.from("engelbart_trace_events")
  .select("id, run_id, seq, at, received_at, source, kind, interaction_id, request_id, call_id, correlation, data")
  .eq("run_id", RUN).order("seq", { ascending: true }).limit(5000);
if (evErr) throw evErr;
const { data: callRows, error: callErr } = await db.from("engelbart_model_calls").select(MODEL_CALL_COLUMNS).eq("run_id", RUN);
if (callErr) throw callErr;

const events = (evRows as unknown as TraceEventRow[]).map(toTraceEvent);
const calls = (callRows as unknown as ModelCallRow[]).map(toModelCall);
const frames = frameIndex(events);
const episodes = classify({
  stages: traceStages(traceRows(events, calls, frames)).primary, frames, events,
  taxonomy: ROPE_TAXONOMY, surfaceOf: ropeSurface,
  calls: new Map(calls.map((c) => [c.callId, { model: c.model, latencyMs: c.latencyMs }])),
});

const story = storyOf(episodes, ROPE_TAXONOMY.name);
const id = storyKey(story);

console.log(`run ${RUN}`);
console.log(`${episodes.length} episodes · model ${MODEL} · key ${id.key}\n`);
console.log("──── what the narrator is given ────\n");
console.log(renderStory(story));
console.log(`\n──── asking ────\n`);

const answer = await narrateSession(story, MODEL);
if (answer.ok) {
  console.log(answer.summary);
  console.log(`\npassed validation · ${answer.model}`);
} else {
  console.log(`(nothing shown) ${answer.error}`);
  // A rejection is the interesting case, so say what would have been
  // shown if the check had not been there.
  console.log("\nRe-run with the check off to see what was refused.");
}

// The same answer put back through the check, so a reader can see the
// check doing something rather than take its word for it.
if (answer.ok) {
  const again = checkSummary(answer.summary, story);
  console.log(`re-checked: ${again.ok ? "passes" : `refused — ${again.reason}`}`);
}
