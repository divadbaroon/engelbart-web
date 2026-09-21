// A profile's life: what makes it this artifact's, what makes it out of
// date, and what each state means to somebody reading a timeline.
//
// These three modules are the reason a profile is written once rather
// than on every page load, so the questions they answer have to be
// answered the same way twice. The signature says when an artifact is a
// different artifact; the capability says when the instrument changed
// underneath a profile; the store says what the row means.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { signatureDiff, signatureOf, signatureParts } from "../../../lib/activity/profile/signature.ts";
import { CAPABILITY_VERSION, capabilityOf, capabilityVerdict } from "../../../lib/activity/profile/capability.ts";
import { CLAIM_STALE_MS, claimExpired, describeState, fitVerdict, staleness, type ProfileRow } from "../../../lib/activity/profile/store.ts";
import type { Fit } from "../../../lib/activity/profile/fit.ts";
import { toTraceEvent, type TraceEventRow } from "../../../lib/trace/types.ts";
import { events } from "../session.mts";

const NOW = Date.parse("2026-09-20T12:00:00.000Z");

const row = (over: Partial<ProfileRow> = {}): ProfileRow => ({
  id: "row", repoId: "repo", runId: "run", signature: "sig", commitSha: null,
  status: "ready", profile: null, schemaVersion: 1, capabilityVersion: CAPABILITY_VERSION,
  issues: null, fit: null, error: null, model: null, generatedBy: null,
  evidence: null, evidenceHash: null,
  createdAt: "2026-09-20T11:00:00.000Z", updatedAt: "2026-09-20T11:59:00.000Z", generatedAt: null,
  ...over,
});

// One click on one button, as the collector records it. Built by hand
// rather than taken from the recording because the point of these cases
// is to change exactly one field.
const click = (over: Record<string, unknown> = {}, seq = 1): TraceEventRow => ({
  id: seq, seq, run_id: "run", at: "2026-09-20T12:00:00.000Z", received_at: "2026-09-20T12:00:00.000Z",
  kind: "ui.click", source: "browser", interaction_id: null, request_id: null, call_id: null,
  data: { frameId: "main", target: { tag: "button", role: "button", text: "Generate", testid: "make", selector: "main > button" }, ...over },
} as unknown as TraceEventRow);

describe("when an artifact is a different artifact", () => {
  it("is the same artifact when nothing about the interface moved", () => {
    const a = signatureOf([click()].map(toTraceEvent));
    const b = signatureOf([click({}, 2)].map(toTraceEvent));
    assert.equal(a.signature, b.signature);
  });

  it("is a different artifact when a button is renamed", () => {
    const before = signatureOf([click()].map(toTraceEvent));
    const after = signatureOf([click({ target: { tag: "button", role: "button", text: "Create", testid: "make", selector: "main > button" } })].map(toTraceEvent));
    assert.notEqual(before.signature, after.signature);
    const said = signatureDiff(before.parts, after.parts).join(" ");
    assert.match(said, /named element/);
  });

  it("is the same artifact when only what somebody typed into it changed", () => {
    const one = signatureOf([click({ target: { tag: "div", role: null, text: "plan a cocoa canvas", selector: "main > div" } })].map(toTraceEvent));
    const two = signatureOf([click({ target: { tag: "div", role: null, text: "something else entirely", selector: "main > div" } })].map(toTraceEvent));
    assert.equal(one.signature, two.signature);
  });

  it("holds no commit and nothing that only this run could have", () => {
    const parts = signatureParts(events);
    const body = JSON.stringify(parts);
    assert.doesNotMatch(body, /commit|sha|runId|run_id/i);
    assert.deepEqual(Object.keys(parts).sort(), ["elements", "policy", "providers", "surfaces"]);
  });

  it("is stable across the order the events arrive in", () => {
    const forwards = signatureOf(events);
    const backwards = signatureOf([...events].reverse());
    assert.equal(forwards.signature, backwards.signature);
  });
});

describe("what the instrument could see", () => {
  it("reports what a real recording carries and what it does not", () => {
    const capability = capabilityOf(events);
    assert.equal(capability.version, CAPABILITY_VERSION);
    // Every feature is decided one way or the other, and none twice.
    assert.equal(new Set([...capability.features, ...capability.missing]).size, capability.features.length + capability.missing.length);
    assert.ok(capability.features.includes("modelCalls"), "the recording has model calls");
  });

  it("says nothing at all about a run with no events", () => {
    assert.deepEqual(capabilityOf([]).features, []);
  });

  it("calls a profile written against another instrument what it is", () => {
    assert.equal(capabilityVerdict(1, 1), "ok");
    assert.equal(capabilityVerdict(1, 2), "behind");
    assert.equal(capabilityVerdict(3, 2), "ahead");
  });
});

describe("what a stored row means", () => {
  it("lets go of a claim nobody finished", () => {
    assert.equal(claimExpired(row({ status: "pending" }), NOW), false);
    assert.equal(claimExpired(row({ status: "pending", updatedAt: new Date(NOW - CLAIM_STALE_MS - 1).toISOString() }), NOW), true);
    // Only a claim expires. A finished profile is not abandoned by age.
    assert.equal(claimExpired(row({ status: "ready", updatedAt: "2020-01-01T00:00:00.000Z" }), NOW), false);
  });

  it("calls a profile stale when the instrument moved under it", () => {
    const capability = capabilityOf(events);
    assert.equal(staleness(row(), capability).stale, false);
    assert.equal(staleness(row({ capabilityVersion: CAPABILITY_VERSION - 1 }), capability).stale, true);
    assert.equal(staleness(row({ capabilityVersion: CAPABILITY_VERSION + 1 }), capability).stale, true);
    assert.equal(staleness(row({ schemaVersion: 2 }), capability).stale, true);
    // A row with no profile in it cannot be stale; it is pending or it
    // failed, and both are their own answer.
    assert.equal(staleness(row({ status: "pending", schemaVersion: 2 }), capability).stale, false);
    assert.equal(staleness(row({ status: "failed", schemaVersion: 2 }), capability).stale, false);
  });

  it("calls a profile stale only when nothing it names is on the page", () => {
    const fit = (dead: number, named: number): Fit => ({
      surfaces: Array.from({ length: named }, (_, i) => ({ id: `s${i}`, label: `s${i}`, matched: 0 })),
      controls: [], channels: [],
      dead: Array.from({ length: dead }, (_, i) => `s${i}`),
      rules: [], silent: [], unnamedText: [], unnamedSurfaces: [],
    } as unknown as Fit);
    assert.equal(fitVerdict(null).stale, false);
    assert.equal(fitVerdict(fit(0, 4)).stale, false);
    assert.equal(fitVerdict(fit(1, 4)).stale, false);
    // Most of a profile going unexercised is a profile describing the
    // software rather than the session, which is what it is for.
    assert.equal(fitVerdict(fit(3, 4)).stale, false);
    assert.equal(fitVerdict(fit(4, 4)).stale, true);
    assert.match(fitVerdict(fit(4, 4)).reason ?? "", /nothing this profile names/);
  });

  it("says, in one sentence a person could read, which reading is in use", () => {
    assert.equal(describeState(null).status, "none");
    assert.match(describeState(null).detail, /has not been read yet/);
    assert.match(describeState(row({ status: "pending" })).detail, /being read/);
    assert.match(describeState(row({ status: "failed", error: "no key\nsecond line" })).detail, /could not be read: no key/);
    // A failure never hands back a profile to read with.
    assert.equal(describeState(row({ status: "failed" })).profile, null);
    assert.equal(describeState(row({ status: "pending" })).profile, null);
  });
});
