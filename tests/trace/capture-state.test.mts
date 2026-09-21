// What a run says about its own ability to watch model calls.
//
// The distinction this holds open is the one that matters most: a run
// where nothing asked a model anything, and a run where something did
// but Engelbart could not see it, must never produce the same reading.
// Realms report for themselves — a Next application has several, and
// the wrapper reports too — so the run's answer is the least capable
// true statement about it rather than whichever report arrived last.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { captureState, describeNote } from "../../lib/trace/timeline";
import type { TraceEvent } from "../../lib/trace/types";

let seq = 0;
const said = (state: string, data: Record<string, unknown> = {}, minute = ++seq): TraceEvent => ({
  id: minute, runId: "r", seq: minute, at: `2026-09-20T10:${String(minute).padStart(2, "0")}:00.000Z`, receivedAt: "",
  source: "model-gateway", kind: "capability.modelCapture", interactionId: null, requestId: null, callId: null, correlation: null,
  data: { state, ...data },
});
const other = (kind: string): TraceEvent => ({ ...said("ignored"), kind });

describe("the run's model-capture state", () => {
  it("is active when something was actually carried", () => {
    const s = captureState([said("available", { pid: 1 }), said("available", { pid: 2 }), said("active", { pid: 2, used: ["http"] })]);
    assert.equal(s.state, "active");
    assert.deepEqual(s.used, ["http"]);
    assert.equal(s.reports, 3);
  });

  it("is partial when part of the application is out of reach, even while another part is watched", () => {
    // The edge route is the case: the Node routes really are captured,
    // and saying "active" would be true of them and misleading about
    // the application.
    const s = captureState([
      said("partial", { detail: "1 path(s) declare the edge runtime and are outside it: app/api/stream/route.ts" }),
      said("available", { pid: 1 }),
      said("active", { pid: 1, used: ["fetch"] }),
    ]);
    assert.equal(s.state, "partial");
    assert.match(s.detail ?? "", /edge runtime/);
    assert.deepEqual(s.used, ["fetch"], "and what was carried is still reported");
  });

  it("surfaces capture that stopped working after it had started", () => {
    const s = captureState([said("available"), said("active", { used: ["http"] }), said("unavailable", { detail: "the gateway stopped answering; 2 call(s) went out unobserved" })]);
    assert.equal(s.state, "unavailable");
    assert.match(s.detail ?? "", /unobserved/);
  });

  it("prefers the worst true statement over the most recent one", () => {
    const s = captureState([said("instrumentation_failed", { detail: "the preload is not in this sandbox" }), said("available", {}, 9)]);
    assert.equal(s.state, "instrumentation_failed");
  });

  it("breaks a tie between equals on the later report", () => {
    const s = captureState([said("unsupported_launcher", { detail: "bun" }, 3), said("unavailable", { detail: "the gateway stopped answering" }, 4)]);
    assert.equal(s.detail, "the gateway stopped answering");
  });

  it("says plainly when nothing reported at all", () => {
    // The silent case, which is the one that used to be indistinguishable
    // from a well-behaved run that made no model calls.
    const s = captureState([other("ui.click"), other("network.request")]);
    assert.equal(s.state, "unreported");
    assert.equal(s.reports, 0);
    assert.match(s.detail ?? "", /says nothing about whether there were any/);
  });

  it("does not let an unknown state outrank a real failure", () => {
    const s = captureState([said("something_new"), said("unsupported_runtime")]);
    assert.equal(s.state, "unsupported_runtime");
  });
});

describe("how a capability report reads in the trace", () => {
  const label = (e: TraceEvent) => describeNote(e).label;

  it("names each state in words rather than in its identifier", () => {
    assert.equal(label(said("active", { used: ["fetch"] })), "Model capture is watching this application");
    assert.equal(label(said("partial")), "Model capture reaches only part of this application");
    assert.equal(label(said("unsupported_launcher")), "Model capture cannot reach this launcher");
    assert.equal(label(said("instrumentation_failed")), "Model capture could not be installed");
    assert.equal(label(said("unavailable")), "Model capture is no longer watching");
  });

  it("keeps what was said and which hooks carried it", () => {
    const { detail } = describeNote(said("active", { detail: "armed before the application, over http, https, fetch, undici", used: ["http", "fetch"], pid: 412 }));
    assert.match(detail ?? "", /armed before the application/);
    assert.match(detail ?? "", /carried over http, fetch/);
    assert.match(detail ?? "", /pid 412/);
  });

  it("still says something about a state it has never heard of", () => {
    assert.equal(label(said("reticulating")), "Model capture: reticulating");
  });
});
