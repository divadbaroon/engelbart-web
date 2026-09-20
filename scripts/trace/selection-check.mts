// Every moment of a person's in a stored run, said five ways.
//
// The Activity timeline, the card on the canvas, the drawer's bar, the
// inspector's header and the line Bart is grounded on each reach a
// selected moment by a different route. This walks a real run and prints
// what each of them would say, so that "one semantic interpretation
// everywhere" is something to look at rather than to take on trust.
//
// The browser's side is derived the way the browser derives it, and
// Bart's side the way the route derives it — from the events, given only
// the identities a selection carries. That they agree is the point.
//
//   node --env-file=.env.local --import tsx scripts/trace/selection-check.mts [runId]
import { createClient } from "@supabase/supabase-js";
import { frameIndex, traceRows, traceStages } from "@/lib/trace/timeline";
import { toTraceEvent, toModelCall, MODEL_CALL_COLUMNS, type TraceEventRow, type ModelCallRow } from "@/lib/trace/types";
import { readSession } from "@/lib/activity/read";
import { graphOf } from "@/lib/activity/graph";
import { ROPE_TAXONOMY } from "@/lib/activity/rope";
import { describeSelection, selectedEpisode } from "@/lib/trace/selection";
import { momentReport, traceModel } from "@/lib/bart/grounding";
import { situationBlock } from "@/lib/bart/prompt";
import { askPlaceholder } from "@/lib/bart/labels";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) { console.error("needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY"); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });
const RUN = process.argv[2] ?? "3c9e1514-f8b6-4c94-a9f7-969e710db7f0";

const { data: evRows, error: evErr } = await db.from("engelbart_trace_events")
  .select("id, run_id, seq, at, received_at, source, kind, interaction_id, request_id, call_id, correlation, data")
  .eq("run_id", RUN).order("seq", { ascending: true }).limit(5000);
if (evErr) throw evErr;
const { data: callRows, error: callErr } = await db.from("engelbart_model_calls").select(MODEL_CALL_COLUMNS).eq("run_id", RUN);
if (callErr) throw callErr;

const events = (evRows as unknown as TraceEventRow[]).map(toTraceEvent);
const calls = (callRows as unknown as ModelCallRow[]).map(toModelCall);

// 1–4: the browser's side, as the trace view derives it.
const frames = frameIndex(events);
const rows = traceRows(events, calls, frames);
const stages = traceStages(rows).primary;
const callMap = new Map(rows.filter((r) => r.kind === "call").map((r) => [r.id, r as never]));
const episodes = readSession({ stages, frames, events, calls: new Map(calls.map((c) => [c.callId, { model: c.model, latencyMs: c.latencyMs }])) });
const graph = graphOf(episodes, stages, ROPE_TAXONOMY);

// 5: the route's side, from the events alone.
const m = traceModel(events, calls, frames);

const REPO = { id: "r", fullName: "o/n", description: null, language: null } as never;
const line = (s: string, head: string) => s.split("\n").find((l) => l.startsWith(head)) ?? "(missing)";

console.log(`run ${RUN}`);
console.log(`${episodes.length} activities · ${graph.length} nodes · ${stages.length} moments\n`);

// The route must arrive at the same reading, or nothing below means
// anything: the selection carries identities, never words.
const same = JSON.stringify(m.episodes.map((e) => [e.id, e.description])) === JSON.stringify(episodes.map((e) => [e.id, e.description]));
console.log(`browser and route read this session ${same ? "identically" : "DIFFERENTLY — everything below is suspect"}\n`);

let disagreed = 0;
for (const node of graph) {
  const stage = stages.find((s) => s.id === node.stageId)!;
  const isPerson = node.kind === "participant";
  const selection = { kind: "stage" as const, stageId: node.stageId, ...(isPerson ? { episodeId: node.episodeId } : {}) };
  const sel = { stageId: node.stageId, callId: null, episodeId: isPerson ? node.episodeId : null };
  const episode = isPerson ? episodes.find((e) => e.id === node.episodeId)! : null;

  const said = {
    "1 timeline  ": episode ? episode.description : "(not a moment of the person's)",
    "2 canvas    ": node.kind === "participant" ? node.description : node.kind === "observed" ? node.label : "(model call)",
    "3 drawer    ": describeSelection(stages, callMap, selection, episodes)?.title ?? "(none)",
    "4 inspector ": selectedEpisode(stages, episodes, selection)?.description ?? stage.title,
    "5 bart      ": line(situationBlock({ repo: REPO, run: null, selection: sel, trace: m, source: "none", recording: null, annotation: null }), 'Selected moment (what "this" refers to)').replace('Selected moment (what "this" refers to): ', ""),
  };

  const head = isPerson ? `${episode!.broadBehavior}/${episode!.subBehavior}` : node.kind.toUpperCase();
  console.log(`── ${head}  ${node.id}`);
  if (isPerson) {
    const agree = [said["1 timeline  "], said["2 canvas    "], said["3 drawer    "], said["4 inspector "]];
    const bart = said["5 bart      "];
    const ok = new Set(agree).size === 1 && bart.startsWith(agree[0]);
    if (!ok) disagreed++;
    console.log(`   ${ok ? "✓ one wording" : "✗ THEY DISAGREE"}`);
  }
  for (const [where, text] of Object.entries(said)) console.log(`   ${where} ${text}`);
  console.log(`   provenance  moment ${stage.id}, which the collector calls “${stage.title}”`);
  if (isPerson) console.log(`   placeholder ${askPlaceholder(stage, episode)}`);
  const report = momentReport(m, node.stageId, false, isPerson ? node.episodeId : null)!;
  console.log(`   inspect_moment leads with: ${report.split("\n")[0]}`);
  console.log();
}

console.log(disagreed ? `${disagreed} moment(s) disagree.` : "Every moment of the person's says one thing in all five places.");
