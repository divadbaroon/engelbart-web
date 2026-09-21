// Why a preview did not answer the picker.
//
// Silence has three causes and they need different things done about
// them, so it is worth one request to tell them apart rather than
// guessing out loud. The preview gateway's health endpoint counts the
// documents it served and how many it could inject the bridge into; both
// are already public to whoever holds the preview URL.
export type Diagnosis =
  | { kind: "old-bridge" }        // injected, but what was injected has no picker in it
  // Injected, current, and refusing us: the run was launched for another
  // workspace origin. The bridge drops every down-message whose origin is
  // not one it was given, so this looks exactly like a bridge with no
  // picker in it — and the advice for the two is opposite. Told apart by
  // asking the gateway which origins it handed the bridge.
  | { kind: "foreign-origin"; allowed: string[]; ours: string }
  | { kind: "blocked"; blocked: number; documents: number }
  // Nothing answered the probe either. A browser cannot tell a gateway
  // that is gone from one that will not let this origin read it, so both
  // are named rather than one of them asserted.
  | { kind: "unreachable" }
  | { kind: "unknown" };

const PROBE_MS = 4000;

export async function diagnose(previewUrl: string | null): Promise<Diagnosis> {
  let origin: string;
  try { origin = new URL(previewUrl ?? "").origin; } catch { return { kind: "unknown" }; }
  try {
    const res = await fetch(`${origin}/__engelbart/health`, { signal: AbortSignal.timeout(PROBE_MS) });
    if (!res.ok) return { kind: "unreachable" };
    const body = await res.json();
    const n = (k: string) => (typeof body?.[k] === "number" ? (body[k] as number) : 0);
    if (body?.gateway !== "preview") return { kind: "unreachable" };
    if (n("blocked") > 0 && n("injected") === 0) return { kind: "blocked", blocked: n("blocked"), documents: n("documents") };
    // Before old-bridge, because a bridge that refuses this origin has
    // injected itself and would otherwise be read as one too old to have
    // a picker. A gateway that does not report the list at all is one
    // from an image built before it did, and falls through.
    const allowed = Array.isArray(body?.workspaceOrigins) ? (body.workspaceOrigins as unknown[]).filter((o): o is string => typeof o === "string") : [];
    const ours = typeof window === "undefined" ? "" : window.location.origin;
    if (n("injected") > 0 && allowed.length && ours && !allowed.includes(ours)) return { kind: "foreign-origin", allowed, ours };
    if (n("injected") > 0) return { kind: "old-bridge" };
    if (n("blocked") > 0) return { kind: "blocked", blocked: n("blocked"), documents: n("documents") };
    return { kind: "unknown" };
  } catch {
    return { kind: "unreachable" };
  }
}

export function sayWhy(d: Diagnosis): string {
  switch (d.kind) {
    case "old-bridge":
      return "This preview did not answer. Its sandbox is running an older browser bridge with no annotate mode in it: rebuild the runner template and start the run again.";
    case "foreign-origin":
      return `This preview was launched for ${d.allowed.join(" and ")} and will not take instructions from ${d.ours}, so it cannot be annotated or recorded from here. Set ENGELBART_WORKSPACE_ORIGIN on the worker to a comma-separated list including ${d.ours}, restart it, and prepare the repository again.`;
    case "blocked":
      return `This preview did not answer. Its Content-Security-Policy refused the bridge in ${d.blocked} of ${d.documents} document${d.documents === 1 ? "" : "s"}, and the policy is left as it is, so this page cannot be annotated.`;
    case "unreachable":
      return "This preview did not answer, and its trace gateway would not answer this workspace either. An older sandbox does exactly this: rebuild the runner template and start the run again. A run that is no longer up looks the same.";
    default:
      return "This preview did not answer, so it cannot be annotated. Its trace gateway is up but has not injected the bridge into any document yet.";
  }
}
