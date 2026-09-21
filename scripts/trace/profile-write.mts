// Write down what an artifact is, from a run of it, and freeze that
// before anything is judged by it.
//
// The same modules the application uses — the same evidence pack, the
// same prompt, the same validation, the same compile and the same fit —
// driven from a terminal so that a profile can be generated, read and
// kept as files before a timeline is looked at. That order is the whole
// point: a profile written after somebody has seen the timeline it will
// produce is a profile fitted to an answer.
//
//   node --env-file=.env.local --import tsx scripts/trace/profile-write.mts --run=<runId> --out=<dir>
//
// Flags:
//   --evidence-only   build the pack and stop, so it can be read first
//   --from=<file>     use a profile already written, instead of asking
//                     for one: how a frozen profile is read and then
//                     stored, rather than stored and then read
//   --persist         write the row into engelbart_artifact_profiles
//
// Nothing here knows what any artifact is, and nothing may be added that
// does. What it writes is: evidence.md, profile.json, NOTES.md,
// manifest.json and FIT.md.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { listRepoPaths, readRepoFiles } from "@/lib/github";
import { frameIndex, traceRows, traceStages } from "@/lib/trace/timeline";
import { toTraceEvent, toModelCall, MODEL_CALL_COLUMNS, type TraceEventRow, type ModelCallRow } from "@/lib/trace/types";
import { classify } from "@/lib/activity/classify";
import { buildEvidence, worthReading } from "@/lib/activity/profile/evidence";
import { generateProfile, PROFILE_MODEL, type Generated } from "@/lib/activity/profile/generate";
import { validateProfile } from "@/lib/activity/profile/validate";
import type { ArtifactProfile } from "@/lib/activity/profile/schema";
import { capabilityOf } from "@/lib/activity/profile/capability";
import { signatureOf } from "@/lib/activity/profile/signature";
import { compileProfile } from "@/lib/activity/profile/compile";
import { fitReport, renderFit } from "@/lib/activity/profile/fit";
import { renderIssues } from "@/lib/activity/profile/validate";
import { fitVerdict } from "@/lib/activity/profile/store";

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const RUN = flag("run");
const OUT = flag("out") ?? `scratchpad/profiles/${RUN ?? "run"}`;
const EVIDENCE_ONLY = args.includes("--evidence-only");
const FROM = flag("from");
const PERSIST = args.includes("--persist");
if (!RUN) { console.error("usage: profile-write.mts --run=<runId> [--out=dir] [--evidence-only] [--persist]"); process.exit(1); }

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) { console.error("needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY"); process.exit(1); }
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(url, key, { auth: { persistSession: false } });

const { data: run, error: runErr } = await db.from("engelbart_sandbox_runs").select("id, repo_id, project_id, user_id, commit_sha").eq("id", RUN).maybeSingle();
if (runErr) throw runErr;
if (!run) { console.error(`no such run: ${RUN}`); process.exit(1); }

const { data: repo, error: repoErr } = await db.from("engelbart_repos").select("id, owner, name, url, default_branch, description").eq("id", run.repo_id).maybeSingle();
if (repoErr) throw repoErr;
if (!repo) { console.error(`the run's repository is missing: ${run.repo_id}`); process.exit(1); }

const { data: evRows, error: evErr } = await db.from("engelbart_trace_events")
  .select("id, run_id, seq, at, received_at, source, kind, interaction_id, request_id, call_id, correlation, data")
  .eq("run_id", RUN).order("seq", { ascending: true }).limit(10_000);
if (evErr) throw evErr;
const { data: callRows, error: callErr } = await db.from("engelbart_model_calls").select(MODEL_CALL_COLUMNS).eq("run_id", RUN);
if (callErr) throw callErr;

const events = (evRows as unknown as TraceEventRow[]).map(toTraceEvent);
const calls = (callRows as unknown as ModelCallRow[]).map(toModelCall);
if (!events.length) { console.error("that run recorded nothing to read the artifact from"); process.exit(1); }

const { signature, parts } = signatureOf(events);
const capability = capabilityOf(events);
console.log(`${repo.owner}/${repo.name} · run ${RUN}`);
console.log(`${events.length} events, ${calls.length} model call(s)`);
console.log(`signature ${signature} (${parts.surfaces.length} document(s), ${parts.elements.length} named element(s), ${parts.providers.length} model endpoint(s))`);
console.log(`instrument ${capability.version}: ${capability.features.join(", ") || "nothing"}${capability.missing.length ? ` · missing ${capability.missing.join(", ")}` : ""}\n`);

// ---- the evidence
const ref = (run.commit_sha as string | null) || (repo.default_branch as string | null) || "HEAD";
const paths = (await listRepoPaths(repo.owner as string, repo.name as string, ref)) ?? [];
const files = paths.length ? await readRepoFiles(repo.owner as string, repo.name as string, ref, worthReading(paths), { maxFiles: 60 }) : [];
const pack = buildEvidence({
  artifact: {
    owner: repo.owner as string, name: repo.name as string, url: repo.url as string,
    commit: (run.commit_sha as string | null) ?? null, description: (repo.description as string | null) ?? null,
  },
  files: paths.map((p) => files.find((f) => f.path === p) ?? { path: p, bytes: 0 }),
  events,
});

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "evidence.md"), pack.text);
writeFileSync(join(OUT, "manifest.json"), JSON.stringify({ runId: RUN, repoId: repo.id, signature, parts, ...pack.manifest }, null, 2));
console.log(`evidence: ${pack.text.length} characters, ${pack.manifest.counts.filesIncluded}/${pack.manifest.counts.files} files, ${pack.manifest.counts.eventsIncluded}/${pack.manifest.counts.events} events`);
if (pack.manifest.truncated.length) console.log(`truncated: ${pack.manifest.truncated.join(", ")}`);
console.log(`→ ${join(OUT, "evidence.md")}`);
if (EVIDENCE_ONLY) process.exit(0);

// ---- the reading
//
// Either asked for, or one that was already written and frozen. The
// second path runs everything after the model call unchanged, so a
// profile that was read by a person before it was stored is stored the
// same way one generated a moment ago is.
let written: Generated;
if (FROM) {
  console.log(`\nreading ${FROM}…`);
  const checked = validateProfile(JSON.parse(readFileSync(FROM, "utf8")) as ArtifactProfile);
  written = checked.ok
    ? { ok: true, profile: checked.profile, notes: "", model: checked.profile.provenance.model ?? PROFILE_MODEL, issues: checked.issues }
    : { ok: false, error: `That profile does not validate:\n${renderIssues(checked.issues)}`, issues: checked.issues, model: PROFILE_MODEL };
} else {
  console.log("\nasking…");
  written = await generateProfile(pack, { name: repo.name as string, repoId: repo.id as string, commit: (run.commit_sha as string | null) ?? null });
}
if (written.notes) writeFileSync(join(OUT, "NOTES.md"), written.notes);
if (!written.ok) {
  writeFileSync(join(OUT, "FAILED.txt"), written.error);
  console.error(`\nrefused by ${written.model}:\n${written.error}`);
  process.exit(1);
}
if (!FROM) writeFileSync(join(OUT, "profile.json"), JSON.stringify(written.profile, null, 2));
console.log(`\nwritten by ${written.model}: "${written.profile.artifact.name}"`);
console.log(`${written.profile.surfaces.length} surface(s), ${written.profile.channels.length} channel(s), ${written.profile.controls.length} control(s), ${written.profile.rules.length} rule(s)`);
console.log(renderIssues(written.issues));
if (!FROM) console.log(`→ ${join(OUT, "profile.json")}\n→ ${join(OUT, "NOTES.md")}`);

// ---- what it reaches, on the run it was written from
const frames = frameIndex(events);
const stages = traceStages(traceRows(events, calls, frames)).primary;
const compiled = compileProfile(written.profile);
const episodes = classify({ stages, frames, events, taxonomy: compiled.taxonomy, surfaceOf: compiled.surfaceOf, calls: new Map(calls.map((c) => [c.callId, { model: c.model, latencyMs: c.latencyMs }])) });
const fit = fitReport(written.profile, compiled, { episodes, events });
const verdict = fitVerdict(fit);
writeFileSync(join(OUT, "FIT.md"), renderFit(fit));
console.log(`→ ${join(OUT, "FIT.md")}`);
console.log(`\n${verdict.stale ? `stale: ${verdict.reason}` : "fits"}`);

if (!PERSIST) {
  console.log("\nNot stored. Add --persist to write the row, or read the profile first and store it after.");
  process.exit(0);
}
const { error: putErr } = await db.from("engelbart_artifact_profiles").upsert({
  project_id: run.project_id, repo_id: repo.id, run_id: RUN, user_id: run.user_id,
  signature, commit_sha: run.commit_sha ?? null,
  status: verdict.stale ? "stale" : "ready", error: verdict.reason,
  profile: written.profile, schema_version: 1, capability_version: capability.version,
  issues: written.issues, fit, model: written.model, generated_by: FROM ? "script (frozen)" : "script",
  evidence: { ...pack.manifest, notes: written.notes.slice(0, 20_000) },
  evidence_hash: createHash("sha256").update(pack.text).digest("hex").slice(0, 64),
  generated_at: new Date().toISOString(), updated_at: new Date().toISOString(),
}, { onConflict: "repo_id,signature" });
if (putErr) { console.error(`\nnot stored: ${putErr.message}`); process.exit(1); }
console.log(`\nstored against ${repo.owner}/${repo.name} at signature ${signature}.`);
