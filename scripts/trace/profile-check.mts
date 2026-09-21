// A profile, read out loud: what is wrong with it, how much of it the
// session it claims to describe actually reached, and — where there is a
// handwritten taxonomy to compare it against — whether the two say the
// same thing about the same afternoon.
//
// It runs against the frozen session by default, so it needs nothing but
// the repository. Pass a run id and it reads that run instead, which is
// the form that will matter once a profile is generated rather than
// written.
//
//   npm run profile:check
//   npm run profile:check -- tests/fixtures/rope-profile.json
//   node --env-file=.env.local --import tsx scripts/trace/profile-check.mts <profile.json> --run=<runId>
//
// `--export=<file>` also writes the Activity export this reading
// produces — the same JSON the Copy button gives, carrying the stamp that
// says which profile named the session.
import { readFileSync } from "node:fs";
import { frameIndex, traceRows, traceStages } from "@/lib/trace/timeline";
import { toTraceEvent, toModelCall, MODEL_CALL_COLUMNS, type TraceEventRow, type ModelCallRow } from "@/lib/trace/types";
import { classify } from "@/lib/activity/classify";
import { ROPE_TAXONOMY, ropeSurface } from "@/lib/activity/rope";
import { validateProfile, renderIssues } from "@/lib/activity/profile/validate";
import { compileProfile } from "@/lib/activity/profile/compile";
import { fitReport, renderFit } from "@/lib/activity/profile/fit";
import { activityExport, activityJson } from "@/lib/activity/export";
import { DEFAULT_SEGMENTATION } from "@/lib/activity/segment";
import { storedStamp } from "@/lib/activity/profile/stamp";
import type { ProfileRow } from "@/lib/activity/profile/store";
import type { Episode } from "@/lib/activity/types";

const args = process.argv.slice(2);
const PROFILE = args.find((a) => !a.startsWith("--")) ?? "tests/fixtures/rope-profile.json";
const RUN = args.find((a) => a.startsWith("--run="))?.slice(6) ?? null;
// The handwritten taxonomy to compare against, where there is one. Any
// other profile is read on its own terms.
const COMPARE = !args.includes("--no-compare");
const EXPORT = args.find((a) => a.startsWith("--export="))?.slice(9) ?? null;

const session = async () => {
  if (!RUN) {
    const raw = JSON.parse(readFileSync("tests/fixtures/rope-session.json", "utf8")) as { events: TraceEventRow[]; calls: ModelCallRow[] };
    return { name: "the frozen session", events: raw.events.map(toTraceEvent), calls: raw.calls.map(toModelCall) };
  }
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) { console.error("a run id needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY"); process.exit(1); }
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data: evRows, error: evErr } = await db.from("engelbart_trace_events")
    .select("id, run_id, seq, at, received_at, source, kind, interaction_id, request_id, call_id, correlation, data")
    .eq("run_id", RUN).order("seq", { ascending: true }).limit(5000);
  if (evErr) throw evErr;
  const { data: callRows, error: callErr } = await db.from("engelbart_model_calls").select(MODEL_CALL_COLUMNS).eq("run_id", RUN);
  if (callErr) throw callErr;
  return { name: `run ${RUN}`, events: (evRows as unknown as TraceEventRow[]).map(toTraceEvent), calls: (callRows as unknown as ModelCallRow[]).map(toModelCall) };
};

const { name, events, calls } = await session();
const frames = frameIndex(events);
const stages = traceStages(traceRows(events, calls, frames)).primary;
const callInfo = new Map(calls.map((c) => [c.callId, { model: c.model, latencyMs: c.latencyMs }]));

console.log(`${PROFILE} against ${name}\n`);

console.log("──── read before it runs ────\n");
const checked = validateProfile(JSON.parse(readFileSync(PROFILE, "utf8")));
console.log(renderIssues(checked.issues));
if (!checked.ok) { console.log("\nrefused."); process.exit(1); }
const compiled = compileProfile(checked.profile);

const data = classify({ stages, frames, events, taxonomy: compiled.taxonomy, surfaceOf: compiled.surfaceOf, calls: callInfo });

console.log("\n──── what it reached ────\n");
console.log(renderFit(fitReport(checked.profile, compiled, { episodes: data, events })));

console.log("\n──── what it read the session as ────\n");
const clock = (e: Episode, t0: number) => `${String(Math.round((Date.parse(e.startedAt) - t0) / 1000)).padStart(5)}s`;
const t0 = Date.parse(data[0]?.startedAt ?? new Date(0).toISOString());
for (const e of data) console.log(`${clock(e, t0)}  ${e.broadBehavior.padEnd(13)} ${e.description}\n         ${" ".repeat(13)} ${e.confidence} · ${e.because}`);

if (EXPORT) {
  const { writeFileSync } = await import("node:fs");
  // The stamp a stored row would carry. Written here from the profile
  // itself so the export says which reading named the session even when
  // the profile is still a file on disk.
  const row = {
    id: "-", repoId: checked.profile.artifact.repoId ?? "-", runId: RUN, signature: "-",
    commitSha: checked.profile.artifact.commit ?? null, status: "ready" as const, profile: checked.profile,
    schemaVersion: checked.profile.version, capabilityVersion: 1, issues: checked.issues, fit: null,
    error: null, model: checked.profile.provenance.model ?? null, generatedBy: "script",
    evidence: null, evidenceHash: null,
    createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
    generatedAt: checked.profile.provenance.generatedAt ?? null,
  } satisfies ProfileRow;
  const made = activityExport({
    episodes: data,
    profile: storedStamp(compiled.taxonomy.name, checked.profile, row),
    segmentation: DEFAULT_SEGMENTATION,
    runId: RUN,
  });
  writeFileSync(EXPORT, activityJson(made));
  console.log(`\n──── the export ────\n`);
  console.log(`format ${made.format} · taxonomy "${made.taxonomy}" · ${made.episodeCount} episodes · ${made.eventCount} events`);
  console.log(`profile ${JSON.stringify(made.profile, null, 2)}`);
  console.log(`\n→ ${EXPORT}`);
}

if (COMPARE && checked.profile.artifact.name === ROPE_TAXONOMY.name) {
  console.log("\n──── against the handwritten taxonomy ────\n");
  const hand = classify({ stages, frames, events, taxonomy: ROPE_TAXONOMY, surfaceOf: ropeSurface, calls: callInfo });
  const say = (e: Episode) => [e.startedAt, e.endedAt, e.broadBehavior, e.subBehavior, e.description, e.because, e.confidence, e.evidence.surface.label];
  let differ = 0;
  for (let i = 0; i < Math.max(hand.length, data.length); i++) {
    const h = hand[i], d = data[i];
    if (!h || !d) { console.log(`${i}: only ${h ? "the handwritten one" : "the profile"} has a stretch here`); differ++; continue; }
    const [hs, ds] = [say(h), say(d)];
    if (hs.every((v, k) => v === ds[k])) continue;
    differ++;
    console.log(`${i}: ${h.subBehavior} / ${d.subBehavior}`);
    for (const [k, label] of [[2, "broad"], [3, "sub"], [4, "description"], [5, "because"], [6, "confidence"], [7, "surface"]] as const) {
      if (hs[k] !== ds[k]) console.log(`   ${label}\n     handwritten  ${hs[k]}\n     profile      ${ds[k]}`);
    }
    if (hs[0] !== ds[0] || hs[1] !== ds[1]) console.log(`   bounds\n     handwritten  ${hs[0]} → ${hs[1]}\n     profile      ${ds[0]} → ${ds[1]}`);
  }
  console.log(differ
    ? `\n${differ} of ${hand.length} stretches differ.`
    : `\nAll ${hand.length} stretches agree: the same cut, the same behaviours, the same sentences.`);
}
