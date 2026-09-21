// A run as the steps a person can follow, from the GitHub link to a live
// application, derived from its event log. Nothing here is recorded
// separately: every step is a slice of the log the worker and the
// pipeline already write. Free of React and of Supabase so the desktop
// app can share it.
import { STATUS_LABEL, plainError, type RunStatus, type SandboxEvent, type SandboxRun } from "@/lib/sandbox";

export type StepId = "sandbox" | "trail" | "plan" | "services" | "environment" | "start" | "health" | "live";
export type StepState = "waiting" | "active" | "done" | "warned" | "skipped" | "failed";

export type RunStep = {
  id: StepId;
  title: string;
  state: StepState;
  summary: string;              // one line, the latest word on the step
  // Why the run stopped, on the step it stopped in. Kept apart from the
  // summary because the two are different kinds of claim — the summary is
  // what this step did, the error is what became of the run — and because
  // a step opened for its evidence has room to show the error whole,
  // where the collapsed row has room for a clause of it. Whole meaning
  // the sentence, not the SDK's tail on the end of it (`plainError`);
  // the untouched text is in the run's `error` event, in Logs.
  error: string | null;
  startedAt: string | null;     // first seen
  elapsed: number;              // ms spent in it so far, over every visit (the repair loop revisits steps)
  since: string | null;         // set while the run is in this step now
  events: SandboxEvent[];       // the slice of the log that belongs to it
};

export const STEP_ORDER: StepId[] = ["sandbox", "trail", "plan", "services", "environment", "start", "health", "live"];

const TITLES: Record<StepId, string> = {
  sandbox: "Sandbox",
  trail: "Railpack",
  plan: "Run Plan",
  services: "Services",
  environment: "Environment",
  start: "Install and start",
  health: "Health and repair",
  live: "Live",
};

// The run is not going anywhere any more: nothing it reached is still
// true of it. Used both to close the clock on the step it stopped in and
// to keep the Live step from reporting "Up" about a sandbox that is gone.
const isOver = (run: SandboxRun | undefined) =>
  run?.status === "failed" || run?.status === "killed" || run?.status === "paused" || run?.status === "no_service";

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

// What the plan *is*, and who worked it out, as the plan event names it.
// "railpack" is the analyzer a single-component repository goes through;
// "run_order" is the planner that orders several components against each
// other. Both produce the same thing — the list of commands this
// repository is run by — so the clause names it and then names the
// planner, rather than naming the planner alone and leaving the reader
// to work out what it handed over.
export function planner(source: unknown): string {
  if (source === "railpack") return "Command list from Railpack";
  if (source === "run_order") return "Command list from the run order";
  return typeof source === "string" && source ? `Command list from ${source}` : "";
}

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
    case "patch": case "visit": return "health";
    case "ready": return "live";
    // The pipeline concluded there is nothing to serve: at planning time
    // that is the plan's answer, later it is the health check's.
    case "conclusion": return d.step === "run" ? "health" : "plan";
    // The brief is read before the plan; the resolver is a second opinion
    // on a failure; a cost line stays with whatever step it was in.
    case "brief": return "plan";
    case "resolve": return "health";
    case "cost": return null;
    // Setting a repository up for use: the install, its check, and the result.
    case "setup": return "start";
    case "check": return "health";
    // The setup rung starting the application: the launch, then whether it answered.
    case "start": return d.status === "starting" || d.status === "leftover" ? "start" : "health";
    case "usable": return "live";
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

export function runSteps(run: SandboxRun | undefined, events: SandboxEvent[], repoName?: string): RunStep[] {
  const steps = {} as Record<StepId, Draft>;
  for (const id of STEP_ORDER) steps[id] = { id, title: TITLES[id], state: "waiting", summary: "", error: null, startedAt: null, elapsed: 0, since: null, events: [], flag: null };

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
  const over = isOver(run);
  const live = run?.status === "running" || run?.status === "usable";
  if (openSince) {
    if (over) steps[current].elapsed += Math.max(0, ms(events[events.length - 1].at) - ms(openSince));
    else steps[current].since = openSince;   // still there: setting up, or up and running
  }

  summarize(steps, run, repoName);

  // The furthest step with anything in it is where the run is. Earlier
  // steps are behind it; later ones have not happened.
  const reached = Math.max(0, ...STEP_ORDER.map((id, i) => (steps[id].events.length ? i : -1)));
  STEP_ORDER.forEach((id, i) => {
    const s = steps[id];
    if (i < reached) s.state = s.events.length ? (s.flag ?? "done") : "skipped";
    else if (i === reached) s.state = run?.status === "failed" ? "failed" : over || live ? (s.flag ?? "done") : run ? "active" : "waiting";
    else s.state = run?.status === "no_service" ? "skipped" : "waiting";
    if (s.state === "failed" && run?.error) s.error = plainError(run.error);
  });
  if (run?.status === "no_service") for (const id of STEP_ORDER) if (steps[id].state === "skipped") steps[id].summary ||= "Nothing to serve";
  if (steps.services.state === "skipped") steps.services.summary ||= "Not needed";
  if (steps.environment.state === "skipped") steps.environment.summary ||= "Not scanned";
  if (run?.status !== "no_service") {
    if (steps.health.state === "skipped") { steps.health.state = "done"; steps.health.summary ||= "Answered on the first check"; }
    if (steps.plan.state === "skipped") { steps.plan.state = "done"; steps.plan.summary ||= "Taken from the saved command list"; }
  }
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
function summarize(steps: Record<StepId, Draft>, run: SandboxRun | undefined, repoName?: string) {
  const last = (id: StepId, pick: (e: SandboxEvent) => boolean) => [...steps[id].events].reverse().find(pick);
  const data = (e: SandboxEvent | undefined) => e?.data ?? {};

  // Sandbox: whether there is a machine, and what was put on it.
  //
  // It used to name the template — "Standard runner" — which is a fact
  // about our infrastructure and not about this run. Which of two
  // identical-looking runners answered is not a thing anybody opening
  // Build wants to know; whether there is a sandbox at all, and whether
  // the repository is on it, is the whole of what this step decides.
  //
  // The one case where the template *is* about the run is Docker: it is
  // chosen because the repository brings up its own services, so it says
  // something about the repository. That stays, as a clause.
  //
  // Present tense only while it is true. A run that failed, was stopped
  // or found nothing to serve has had its sandbox killed
  // (lib/runtime/e2b.ts), and a step claiming a machine that is gone is
  // the kind of thing somebody debugs against for ten minutes.
  {
    const creating = last("sandbox", (e) => "template" in (e.data ?? {}));
    const template = String(data(creating).template ?? run?.template ?? "");
    const docker = template.endsWith("-docker") ? " with Docker" : "";
    const made = !!creating || !!run?.sandboxId;
    const box = !made ? "" : isOver(run) ? `Sandbox stopped${docker}` : `Sandbox running${docker}`;
    // The repository by the name it is known by in the project; failing
    // that, the directory the clone went into, which is `repo.name`.
    const name = repoName || (run?.workdir ? run.workdir.split("/").filter(Boolean).pop() ?? "" : "");
    const cloned = last("sandbox", (e) => e.text === "cloned");
    const what = cloned ? `cloned${name ? ` ${name}` : ""}` : steps.sandbox.events.length ? `cloning${name ? ` ${name}` : ""}…` : "";
    steps.sandbox.summary = [box, what].filter(Boolean).join(" · ");
  }

  // The saved command list: was there a known way to run this, and did
  // it hold.
  //
  // The thing this step replays is called a trail in the pipeline and in
  // the database, and "trail" says nothing to somebody reading a build.
  // What it holds is the list of commands that worked last time, so that
  // is what it is called on the screen. The wire format is untouched —
  // the events still carry `phase: "trail"` — because renaming a word on
  // a screen should not make old runs unreadable.
  {
    const trail = last("trail", (e) => e.data?.phase === "trail");
    const replay = last("trail", (e) => e.data?.phase === "recipe");
    const d = data(trail);
    const files = Array.isArray(d.files) ? d.files.length : typeof d.files === "number" ? d.files : 0;
    const from = [day(d.capturedAt), short(d.commit) && `at ${short(d.commit)}`, files ? count(files, "patched file") : ""].filter(Boolean).join(", ");
    let text =
      d.status === "own" ? `Replaying this project's command list${from ? ` from ${from}` : ""}`
      : d.status === "shared" ? `Replaying another project's command list${from ? ` from ${from}` : ""}`
      : d.status === "none" ? "No command list yet; analyzing from scratch"
      // Not "Starting over without the saved command list": the worker
      // takes this branch on the run's `fresh` flag alone and never looks
      // for a saved list (worker/index.ts), so a first-ever Start over
      // was claiming to pass over something that never existed. What is
      // true either way is that this run is working the commands out
      // itself, and that somebody asked it to.
      : d.status === "fresh" ? "Working the commands out from scratch, as asked"
      : last("trail", (e) => e.data?.recipe === true) ? "Replaying the saved command list"
      : steps.trail.events.length ? "" : "";
    const rd = data(replay);
    if (rd.status === "failed" || rd.status === "ignored") {
      text = `${text ? `${text} · ` : ""}the command list did not work${rd.reason ? ` (${String(rd.reason).slice(0, 80)})` : ""}; analyzing from scratch`;
      steps.trail.flag = "warned";
    }
    if (!text && steps.plan.events.length) text = "No command list; analyzed from scratch";
    steps.trail.summary = text;
  }

  // Run Plan: what the pipeline decided to run, and who worked it out.
  //
  // This is where Railpack is: for a single-component repository the
  // analyzer produces a Railpack plan, and a repository with several
  // components goes to the run-order planner instead. The pipeline
  // already records which one answered, on the plan event itself; the
  // step just says it, so the name is read off the run rather than
  // guessed from the step it came out of.
  {
    const plan = last("plan", (e) => e.data?.phase === "plan");
    const discovered = last("plan", (e) => e.data?.phase === "discover" && e.data?.status === "done");
    const comps = Array.isArray(data(discovered).components) ? (data(discovered).components as unknown[]).length : 0;
    const summary = typeof data(plan).summary === "string" ? String(data(plan).summary) : plan ? plan.text.replace(/^plan: /, "") : "";
    const failed = last("plan", (e) => e.data?.phase === "error");
    const concluded = last("plan", (e) => e.data?.phase === "conclusion");
    const cd = data(concluded);
    const conclusion = concluded ? (cd.status === "blocked" ? `Blocked: ${String(cd.reason ?? "").slice(0, 200)}` : `Nothing to serve: ${String(cd.reason ?? "").slice(0, 200)}`) : "";
    const brief = last("plan", (e) => e.data?.phase === "brief");
    const bd = data(brief);
    const b = (bd.brief ?? {}) as { purpose?: string; primaryApp?: { path?: string; confidence?: string } };
    // While the repository is being read, and if that fails. Not the
    // brief itself: `purpose` is specified as one or two whole sentences
    // and there is no shorter field to stand in for it, so putting it on
    // a collapsed row meant cutting a paragraph at 120 characters —
    // "Brief: Cocoa Canvas is a collaborative canvas web application
    // where users and AI…" — which is the row spending all its width on
    // the half of a sentence nobody can finish. The whole brief is in
    // this step's own events, and on the run.
    const briefLine = bd.status === "starting" ? "Reading the repository…"
      : bd.status === "failed" ? "No brief" : "";
    const gaveUp = last("plan", (e) => e.data?.phase === "order" && e.data?.status === "gave_up");
    const gaveUpLine = gaveUp ? `The planner gave up: ${String(data(gaveUp).reason ?? "").slice(0, 160)}` : "";
    // What is actually going to be run, which is the one thing a person
    // opens this step for. The two planners put it in different places:
    // Railpack writes the start command onto the plan event, the
    // run-order planner writes a list of services and names the one the
    // person is meant to open.
    const ordered = data(plan).plan as { services?: { id?: string; cwd?: string; argv?: string[] }[]; entryService?: string } | undefined;
    const entry = ordered?.services?.find((s) => s.id === ordered.entryService) ?? ordered?.services?.[0];
    const start = String(data(plan).start ?? (Array.isArray(entry?.argv) ? entry.argv.join(" ") : "") ?? "").trim();
    const where = [entry?.cwd, b.primaryApp?.path].find((path) => typeof path === "string" && path && path !== ".") ?? "";
    const runs = start ? `Runs ${start}${where ? ` in ${where}` : ""}` : "";
    // Command first, then who worked it out, then how big the repository
    // turned out to be. It read the other way round — the count, then a
    // truncated brief, then the planner, then the plan — so the answer
    // was last and the row was sorted by how little each part said.
    steps.plan.summary = [
      conclusion || gaveUpLine || runs || summary || briefLine || (failed ? "" : steps.plan.events.length ? "Analyzing…" : ""),
      planner(data(plan).source),
      comps ? count(comps, "component") : "",
    ].filter(Boolean).join(" · ");
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
    const setup = last("start", (e) => e.data?.phase === "setup");
    const sd = data(setup);
    if (setup) {
      steps.start.summary = sd.status === "starting" ? `The setup agent is installing the repository for use (attempt ${sd.attempt ?? 1})…`
        : sd.status === "replaying" ? "Replaying the saved setup script…"
        : sd.status === "done" ? `Set up: ${String(sd.summary ?? "installed").slice(0, 160)}`
        : `Setup failed: ${String(sd.reason ?? sd.output ?? "").slice(-160)}`;
      if (sd.status === "failed") steps.start.flag = "warned";
    } else steps.start.summary = unique.length ? `${unique.join(" · ")}${starts.length > 1 ? ` (${starts.length} passes)` : ""}` : steps.start.events.length ? "Starting…" : "";
  }

  // Health and repair: the check, and what the agent did about a failure.
  {
    const patch = last("health", (e) => e.data?.phase === "patch" && e.data?.status !== "starting");
    const starting = last("health", (e) => e.data?.phase === "patch" && e.data?.status === "starting");
    const need = last("health", (e) => e.data?.phase === "run" && e.data?.status === "needs_input");
    const unhealthy = last("health", (e) => e.data?.phase === "run" && e.data?.status === "unhealthy");
    const concluded = last("health", (e) => e.data?.phase === "conclusion");
    const check = last("health", (e) => e.data?.phase === "check");
    const visited = last("health", (e) => e.data?.phase === "visit");
    const err = last("health", (e) => e.kind === "error");
    const d = data(patch);
    const files = Array.isArray(d.files) ? d.files.length : 0;
    const attempt = d.attempt ?? data(starting).attempt;
    const resolved = last("health", (e) => e.data?.phase === "resolve" && (e.data?.status === "plan" || e.data?.status === "blocked" || e.data?.status === "failed"));
    const resolving = last("health", (e) => e.data?.phase === "resolve" && (e.data?.status === "starting" || e.data?.status === "reading"));
    const rd = data(resolved);
    const blocker = (rd.blocker ?? data(concluded).blocker) as { kind?: string; what?: string } | undefined;
    const started = last("health", (e) => e.data?.phase === "start");
    if (started && data(started).status === "failed") { steps.health.summary = `The application did not start: ${String(data(started).reason ?? "").slice(0, 160)}`; steps.health.flag = "warned"; }
    else if (started && data(started).status === "answering") steps.health.summary = `The application answers at ${String(data(started).url ?? "")}`;
    else if (check) { steps.health.summary = data(check).status === "ok" ? "The check passed" : `The check failed: ${String(data(check).reason ?? data(check).output ?? "").slice(-160)}`; if (data(check).status !== "ok") steps.health.flag = "warned"; }
    else if (concluded && data(concluded).status === "blocked") { steps.health.summary = `Blocked${blocker?.kind ? ` (${blocker.kind})` : ""}: ${String(blocker?.what ?? data(concluded).reason ?? "").slice(0, 200)}`; steps.health.flag = "warned"; }
    else if (concluded) steps.health.summary = `Nothing to serve: ${String(data(concluded).reason ?? "").slice(0, 200)}`;
    else if (rd.status === "plan") { steps.health.summary = `The resolver corrected the plan: ${String(rd.hint ?? "").slice(0, 160)}`; steps.health.flag = "warned"; }
    else if (rd.status === "blocked") { steps.health.summary = `Blocked${blocker?.kind ? ` (${blocker.kind})` : ""}: ${String(blocker?.what ?? "").slice(0, 200)}`; steps.health.flag = "warned"; }
    else if (rd.status === "failed") { steps.health.summary = `The resolver could not decide${rd.reason ? `: ${String(rd.reason).slice(0, 120)}` : ""}`; steps.health.flag = "warned"; }
    else if (resolving) steps.health.summary = data(resolving).status === "reading" ? "The resolver is reading files…" : "The resolver is looking at why it stopped…";
    else if (d.status === "applied") { steps.health.summary = `Repair attempt ${attempt ?? 1} edited ${count(files, "file")}`; steps.health.flag = "warned"; }
    else if (d.status === "replayed") { steps.health.summary = `Saved edits applied again (${count(files, "file")})`; steps.health.flag = "warned"; }
    else if (d.status === "none") steps.health.summary = "The repair agent found nothing to change";
    else if (d.status === "failed") steps.health.summary = `Repair attempt ${attempt ?? 1} failed${d.reason ? `: ${String(d.reason).slice(0, 120)}` : ""}`;
    else if (d.status === "stale") steps.health.summary = "The saved edits no longer fit the repository";
    else if (starting) steps.health.summary = `Repair attempt ${attempt ?? 1}: the agent is looking for a fix…`;
    else if (need) steps.health.summary = `Not answering: ${String(data(need).reason ?? "").slice(0, 160)}`;
    else if (unhealthy) steps.health.summary = `Opened the page: ${String(data(unhealthy).reason ?? "").slice(0, 160)}`;
    else if (err) steps.health.summary = err.text.slice(0, 160);
    else if (visited) steps.health.summary = `Opened the page in a browser${data(visited).title ? ` (${String(data(visited).title).slice(0, 60)})` : ""}`;
    else if (steps.health.events.length) steps.health.summary = "Checking…";
  }

  // Live: where it is, and whether the command list was kept.
  //
  // Everything here except the first clause is history — the command
  // list was saved, the services came up — and stays true whatever became of the
  // run. The first clause is the exception: it is a claim about now, so
  // it is only made while the run is still there. A run that reached
  // `ready` and then lost its sandbox used to keep saying "Up" beside the
  // error explaining that it was gone.
  {
    const ready = last("live", (e) => e.data?.phase === "ready");
    const services = Array.isArray(data(ready).services) ? (data(ready).services as unknown[]).length : 0;
    const captured = last("live", (e) => e.data?.phase === "recipe" && e.data?.status === "captured");
    const shared = last("live", (e) => e.data?.phase === "trail" && e.data?.status === "shared");
    const exited = last("live", (e) => e.data?.phase === "exited" || e.data?.phase === "error");
    const usable = last("live", (e) => e.data?.phase === "usable");
    const ub = (data(usable).blocker ?? run?.usage?.blocker) as { kind?: string; what?: string } | null | undefined;
    const parts = [
      isOver(run) ? "" :
      run?.status === "usable" || usable ? (ub ? `Set up; blocked by ${ub.kind ?? "something"}: ${String(ub.what ?? "").slice(0, 120)}` : `Set up and ready to use${data(usable).summary ? `: ${String(data(usable).summary).slice(0, 120)}` : ""}`) :
      run?.status === "running" && run.previewUrl ? `Live at ${run.previewUrl}` : ready ? "Up" : "",
      services > 1 ? count(services, "service") : "",
      shared ? "command list saved and shared" : captured ? "command list saved" : "",
    ].filter(Boolean);
    if (exited) { parts.push(`stopped: ${String(data(exited).reason ?? exited.text).slice(0, 120)}`); steps.live.flag = "warned"; }
    if (run?.status === "killed") { parts.push("stopped"); }
    steps.live.summary = parts.join(" · ");
  }
}

// Where the run is, in one clause, with one sentence under it.
//
// The header used to be a concatenation: the furthest step's title, then
// that step's summary, then — because a failed step has the run's error
// appended to it — the error. A run that came up and later lost its
// sandbox therefore read "Live · Up · command list saved · The
// sandbox is no longer running", which is four facts from three different
// moments presented as one state.
//
// The headline is taken from `run.status` and nothing else. The statuses
// are mutually exclusive, so the contradiction is not possible to write:
// only `running` and `usable` say the application is there, and only the
// statuses that mean it is not carry the error. What the run reached on
// the way is in the steps underneath, where it is dated.
export type RunState = {
  headline: string;   // what the run is, now
  detail: string;     // the one thing worth saying under it
  tone: "none" | "working" | "live" | "ended" | "failed";
};

const TONE: Record<RunStatus, RunState["tone"]> = {
  queued: "working", creating: "working", cloning: "working", cloned: "working", launching: "working",
  running: "live", usable: "live",
  paused: "ended", no_service: "ended", killed: "ended", failed: "failed",
};

export function runState(run: SandboxRun | undefined, steps: RunStep[]): RunState {
  if (!run) return { headline: "Not prepared", detail: "", tone: "none" };
  const at = steps.reduce((found, s, i) => (s.state !== "waiting" ? i : found), -1);
  const current = at >= 0 ? steps[at] : null;
  const tone = TONE[run.status];
  const error = plainError(run.error);

  // Stopped, one way or another. Where it got to is said as the place it
  // stopped, never as a state it is still in, and the reason comes from
  // the run rather than from the step, which may have been fine when the
  // run passed through it.
  if (tone === "failed" || tone === "ended") {
    const where = run.status === "failed" && current ? ` in ${current.title}` : "";
    return { headline: `${STATUS_LABEL[run.status]}${where}`, detail: error, tone };
  }
  if (tone === "live") {
    const blocker = run.usage?.blocker;
    const detail = blocker ? `Blocked by ${blocker.kind === "secret" ? "a missing key" : blocker.kind === "service" ? "a missing service" : blocker.kind}: ${blocker.what}`
      : run.status === "running" ? run.previewUrl ?? ""
      : run.usage?.summary ?? "";
    return { headline: STATUS_LABEL[run.status], detail, tone };
  }
  // On its way: the status says what is being done, the step says how far
  // along that is.
  return { headline: STATUS_LABEL[run.status], detail: current ? `Step ${at + 1} of ${steps.length} · ${current.title}` : "", tone };
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
