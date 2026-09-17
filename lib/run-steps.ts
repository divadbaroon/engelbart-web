// A run as the steps a person can follow, from the GitHub link to a live
// application, derived from its event log. Nothing here is recorded
// separately: every step is a slice of the log the worker and the
// pipeline already write. Free of React and of Supabase so the desktop
// app can share it.
import type { SandboxEvent, SandboxRun } from "@/lib/sandbox";

export type StepId = "sandbox" | "trail" | "plan" | "services" | "environment" | "start" | "health" | "live";
export type StepState = "waiting" | "active" | "done" | "warned" | "skipped" | "failed";

export type RunStep = {
  id: StepId;
  title: string;
  state: StepState;
  summary: string;              // one line, the latest word on the step
  startedAt: string | null;     // first seen
  elapsed: number;              // ms spent in it so far, over every visit (the repair loop revisits steps)
  since: string | null;         // set while the run is in this step now
  events: SandboxEvent[];       // the slice of the log that belongs to it
};

export const STEP_ORDER: StepId[] = ["sandbox", "trail", "plan", "services", "environment", "start", "health", "live"];

const TITLES: Record<StepId, string> = {
  sandbox: "Sandbox",
  trail: "Trail",
  plan: "Plan",
  services: "Services",
  environment: "Environment",
  start: "Install and start",
  health: "Health and repair",
  live: "Live",
};

// Pipeline run statuses that mean the app is not answering and something
// is being decided about it, rather than plain setup progress.
const HEALTH_RUN_STATUS = new Set(["needs_input", "setup_planning", "failed", "stopped", "error", "unhealthy"]);

const short = (sha: unknown) => (typeof sha === "string" && sha ? sha.slice(0, 7) : "");
const day = (iso: unknown) => (typeof iso === "string" ? formatDay(iso) : "");

// "Sep 16". Fixed locale and zone so the server and the browser agree.
export function formatDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Which step an event belongs to, or null to leave it with the current one.
function stepOf(e: SandboxEvent, seenReady: boolean): StepId | null {
  const d = e.data ?? {};
  const phase = typeof d.phase === "string" ? d.phase : null;
  switch (phase) {
    case "trail": return d.status === "saved" || d.status === "shared" && d.saved === true ? "live" : "trail";
    case "recipe": return d.status === "captured" ? "live" : "trail";
    case "discover": case "order": case "plan": return "plan";
    case "supabase": return "services";
    case "environment": return "environment";
    case "approval": return "start";
    case "run": return HEALTH_RUN_STATUS.has(String(d.status)) ? "health" : "start";
    case "patch": return "health";
    case "ready": return "live";
    // A pipeline error names the step it came from; before the app is up
    // that is where it belongs, not the health check.
    case "error": {
      const step = typeof d.step === "string" ? d.step : "";
      if (step === "discover" || step === "order" || step === "plan") return "plan";
      if (step === "environment") return "environment";
      if (step === "supabase") return "services";
      return seenReady ? "live" : "health";
    }
    case "exited": return seenReady ? "live" : "health";
  }
  // Stage commands and their output carry the stage, not a phase.
  // Once the app is up, its output belongs to the time it is live.
  if (typeof d.stage === "string" && (e.kind === "command" || e.kind === "stdout" || e.kind === "stderr")) return seenReady ? "live" : "start";
  const t = e.text;
  if (e.kind === "status") {
    if (t.startsWith("picked up by runner") || t === "creating" || t === "cloning" || t === "cloned" || t.startsWith("exit ") || "template" in d || t.startsWith("docker ") || t.startsWith("sandbox killed") || t.startsWith("could not list")) return "sandbox";
    if (t === "launching" || d.recipe === true || t.startsWith("could not hand over the saved recipe")) return "trail";
    if (t.startsWith("could not hand over the saved environment") || (t.startsWith("using ") && t.includes("saved environment value"))) return "environment";
    if (t.startsWith("service ") || t.startsWith("preview ")) return "live";
  }
  if (e.kind === "command") {
    if (t.startsWith("git clone") || t.startsWith("ls -A") || t === "dockerd") return "sandbox";
    if (t.startsWith("python3 ")) return "trail";
    if (t.includes("proxy.mjs")) return "live";
  }
  return null;
}

type Draft = RunStep & { flag: StepState | null };

export function runSteps(run: SandboxRun | undefined, events: SandboxEvent[]): RunStep[] {
  const steps = {} as Record<StepId, Draft>;
  for (const id of STEP_ORDER) steps[id] = { id, title: TITLES[id], state: "waiting", summary: "", startedAt: null, elapsed: 0, since: null, events: [], flag: null };

  // Time is charged to whichever step the run is in, visit by visit.
  let current: StepId = "sandbox";
  let seenReady = false;
  let openSince: string | null = null;
  const ms = (iso: string) => new Date(iso).getTime();
  for (const e of events) {
    const to = stepOf(e, seenReady);
    if (to && to !== current) {
      if (openSince) steps[current].elapsed += Math.max(0, ms(e.at) - ms(openSince));
      current = to;
      openSince = e.at;
    }
    openSince ??= e.at;
    if (e.data?.phase === "ready") seenReady = true;
    const s = steps[current];
    s.events.push(e);
    s.startedAt ??= e.at;
  }
  const over = run?.status === "failed" || run?.status === "killed" || run?.status === "paused";
  const live = run?.status === "running";
  if (openSince) {
    if (over) steps[current].elapsed += Math.max(0, ms(events[events.length - 1].at) - ms(openSince));
    else steps[current].since = openSince;   // still there: setting up, or up and running
  }

  summarize(steps, run);

  // The furthest step with anything in it is where the run is. Earlier
  // steps are behind it; later ones have not happened.
  const reached = Math.max(0, ...STEP_ORDER.map((id, i) => (steps[id].events.length ? i : -1)));
  STEP_ORDER.forEach((id, i) => {
    const s = steps[id];
    if (i < reached) s.state = s.events.length ? (s.flag ?? "done") : "skipped";
    else if (i === reached) s.state = run?.status === "failed" ? "failed" : over || live ? (s.flag ?? "done") : run ? "active" : "waiting";
    else s.state = "waiting";
    if (s.state === "failed" && run?.error) s.summary = `${s.summary ? `${s.summary} · ` : ""}${run.error.slice(0, 160)}`;
  });
  if (steps.services.state === "skipped") steps.services.summary ||= "Not needed";
  if (steps.environment.state === "skipped") steps.environment.summary ||= "Not scanned";
  if (steps.health.state === "skipped") { steps.health.state = "done"; steps.health.summary ||= "Answered on the first check"; }
  if (steps.plan.state === "skipped") { steps.plan.state = "done"; steps.plan.summary ||= "Taken from the trail"; }
  if (steps.trail.state === "skipped") steps.trail.summary ||= "Not recorded";
  if (run?.status === "paused") steps.sandbox.summary = `${steps.sandbox.summary} · paused`;
  if (!run) steps.sandbox.summary ||= "Not prepared yet";

  return STEP_ORDER.map((id) => {
    const { flag: _flag, ...step } = steps[id];   // eslint-disable-line @typescript-eslint/no-unused-vars
    return step;
  });
}

// One line per step from its events, plus a flag when the step's own
// outcome colours it (a warning, a skip) without deciding the run's.
function summarize(steps: Record<StepId, Draft>, run: SandboxRun | undefined) {
  const last = (id: StepId, pick: (e: SandboxEvent) => boolean) => [...steps[id].events].reverse().find(pick);
  const data = (e: SandboxEvent | undefined) => e?.data ?? {};

  // Sandbox: which runner, and what was cloned.
  {
    const creating = last("sandbox", (e) => "template" in (e.data ?? {}));
    const template = String(data(creating).template ?? run?.template ?? "");
    const runner = template ? (template.endsWith("-docker") ? "Runner with Docker" : "Standard runner") : "";
    const cloned = last("sandbox", (e) => e.text === "cloned");
    const commit = short(data(cloned).commit ?? run?.commit);
    const parts = [runner, cloned ? `cloned${commit ? ` ${commit}` : ""}` : steps.sandbox.events.length ? "cloning…" : ""].filter(Boolean);
    steps.sandbox.summary = parts.join(" · ");
  }

  // Trail: was there a known way to run this, and did it hold.
  {
    const trail = last("trail", (e) => e.data?.phase === "trail");
    const replay = last("trail", (e) => e.data?.phase === "recipe");
    const d = data(trail);
    const files = Array.isArray(d.files) ? d.files.length : typeof d.files === "number" ? d.files : 0;
    const from = [day(d.capturedAt), short(d.commit) && `at ${short(d.commit)}`, files ? count(files, "patched file") : ""].filter(Boolean).join(", ");
    let text =
      d.status === "own" ? `Replaying this project's trail${from ? ` from ${from}` : ""}`
      : d.status === "shared" ? `Replaying another project's trail${from ? ` from ${from}` : ""}`
      : d.status === "none" ? "No trail yet; analyzing from scratch"
      : last("trail", (e) => e.data?.recipe === true) ? "Replaying the saved trail"
      : steps.trail.events.length ? "" : "";
    const rd = data(replay);
    if (rd.status === "failed" || rd.status === "ignored") {
      text = `${text ? `${text} · ` : ""}the trail did not work${rd.reason ? ` (${String(rd.reason).slice(0, 80)})` : ""}; analyzing from scratch`;
      steps.trail.flag = "warned";
    }
    if (!text && steps.plan.events.length) text = "No trail; analyzed from scratch";
    steps.trail.summary = text;
  }

  // Plan: what the pipeline decided to run.
  {
    const plan = last("plan", (e) => e.data?.phase === "plan");
    const discovered = last("plan", (e) => e.data?.phase === "discover" && e.data?.status === "done");
    const comps = Array.isArray(data(discovered).components) ? (data(discovered).components as unknown[]).length : 0;
    const summary = typeof data(plan).summary === "string" ? String(data(plan).summary) : plan ? plan.text.replace(/^plan: /, "") : "";
    const failed = last("plan", (e) => e.data?.phase === "error");
    steps.plan.summary = [comps ? count(comps, "component") : "", summary || (failed ? "" : steps.plan.events.length ? "Analyzing…" : "")].filter(Boolean).join(" · ");
  }

  // Services: the local Supabase, when the repository has one.
  {
    const ev = last("services", (e) => e.data?.phase === "supabase");
    const d = data(ev);
    const reason = typeof d.reason === "string" ? d.reason : "";
    if (d.status === "ready") steps.services.summary = "Local Supabase ready";
    else if (d.status === "skipped") { steps.services.summary = reason ? `Local Supabase skipped: ${reason}` : "Not needed"; steps.services.flag = "skipped"; }
    else if (d.status === "unavailable" || d.status === "failed" || d.status === "timeout" || d.status === "needs_input" || d.status === "stopped") { steps.services.summary = `Local Supabase could not start${reason ? `: ${reason}` : ""}`; steps.services.flag = "warned"; }
    else if (ev) steps.services.summary = reason ? `Local Supabase: ${reason}` : "Starting a local Supabase…";
  }

  // Environment: what the app reads, and where each value came from.
  {
    const ev = last("environment", (e) => e.data?.phase === "environment" && Array.isArray(e.data?.variables));
    if (ev) {
      const vars = data(ev).variables as { status?: string }[];
      const found = vars.filter((v) => v.status === "found").length;
      const local = vars.filter((v) => v.status === "local").length;
      const saved = vars.filter((v) => v.status === "provided").length;
      const missing = Array.isArray(data(ev).skipped) ? (data(ev).skipped as unknown[]).length : 0;
      const parts = [found ? `${found} in the repository` : "", local ? `${local} from the local Supabase` : "", saved ? `${saved} saved` : "", missing ? `${missing} missing` : ""].filter(Boolean);
      steps.environment.summary = parts.length ? parts.join(" · ") : "Nothing read from the environment";
      if (missing) steps.environment.flag = "warned";
    } else if (steps.environment.events.length) steps.environment.summary = "Scanning…";
  }

  // Install and start: the commands, in order, from the latest attempt.
  {
    const stages = steps.start.events.filter((e) => e.kind === "command" && typeof e.data?.stage === "string");
    // A repair attempt starts the stages over from the first one: show the
    // last pass only, and say how many there were.
    const first = stages[0]?.data?.stage;
    const starts = stages.map((e, i) => (e.data?.stage === first ? i : -1)).filter((i) => i >= 0);
    const commands = starts.length ? stages.slice(starts[starts.length - 1]).map((e) => e.text.trim()) : [];
    const unique = commands.filter((c, i) => commands.indexOf(c) === i);
    steps.start.summary = unique.length ? `${unique.join(" · ")}${starts.length > 1 ? ` (${starts.length} passes)` : ""}` : steps.start.events.length ? "Starting…" : "";
  }

  // Health and repair: the check, and what the agent did about a failure.
  {
    const patch = last("health", (e) => e.data?.phase === "patch" && e.data?.status !== "starting");
    const starting = last("health", (e) => e.data?.phase === "patch" && e.data?.status === "starting");
    const need = last("health", (e) => e.data?.phase === "run" && e.data?.status === "needs_input");
    const err = last("health", (e) => e.kind === "error");
    const d = data(patch);
    const files = Array.isArray(d.files) ? d.files.length : 0;
    const attempt = d.attempt ?? data(starting).attempt;
    if (d.status === "applied") { steps.health.summary = `Repair attempt ${attempt ?? 1} edited ${count(files, "file")}`; steps.health.flag = "warned"; }
    else if (d.status === "replayed") { steps.health.summary = `Saved edits applied again (${count(files, "file")})`; steps.health.flag = "warned"; }
    else if (d.status === "none") steps.health.summary = "The repair agent found nothing to change";
    else if (d.status === "failed") steps.health.summary = `Repair attempt ${attempt ?? 1} failed${d.reason ? `: ${String(d.reason).slice(0, 120)}` : ""}`;
    else if (d.status === "stale") steps.health.summary = "The saved edits no longer fit the repository";
    else if (starting) steps.health.summary = `Repair attempt ${attempt ?? 1}: the agent is looking for a fix…`;
    else if (need) steps.health.summary = `Not answering: ${String(data(need).reason ?? "").slice(0, 160)}`;
    else if (err) steps.health.summary = err.text.slice(0, 160);
    else if (steps.health.events.length) steps.health.summary = "Checking…";
  }

  // Live: where it is, and whether the trail was kept.
  {
    const ready = last("live", (e) => e.data?.phase === "ready");
    const services = Array.isArray(data(ready).services) ? (data(ready).services as unknown[]).length : 0;
    const captured = last("live", (e) => e.data?.phase === "recipe" && e.data?.status === "captured");
    const shared = last("live", (e) => e.data?.phase === "trail" && e.data?.status === "shared");
    const exited = last("live", (e) => e.data?.phase === "exited" || e.data?.phase === "error");
    const parts = [
      run?.status === "running" && run.previewUrl ? `Live at ${run.previewUrl}` : ready ? "Up" : "",
      services > 1 ? count(services, "service") : "",
      shared ? "trail saved and shared" : captured ? "trail saved" : "",
    ].filter(Boolean);
    if (exited) { parts.push(`stopped: ${String(data(exited).reason ?? exited.text).slice(0, 120)}`); steps.live.flag = "warned"; }
    if (run?.status === "killed") { parts.push("stopped"); }
    steps.live.summary = parts.join(" · ");
  }
}

// `now` is null before the page has mounted, when only closed time is
// known and the server and the browser must render the same thing.
export function stepDuration(step: RunStep, now: number | null): number | null {
  if (!step.startedAt) return null;
  return step.elapsed + (step.since && now !== null ? Math.max(0, now - new Date(step.since).getTime()) : 0);
}

// Everything the run has spent so far.
export function runDuration(steps: RunStep[], now: number | null): number | null {
  const first = steps.find((s) => s.startedAt);
  if (!first) return null;
  return steps.reduce((sum, s) => sum + (stepDuration(s, now) ?? 0), 0);
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}
