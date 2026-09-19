// Why a preview did not answer the picker. Silence has three causes and
// they need different things done about them, so the gateway is asked
// rather than one of them asserted.
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { diagnose, sayWhy } from "../../lib/annotations/probe";

const real = globalThis.fetch;
afterEach(() => { globalThis.fetch = real; });
const serving = (body: unknown, ok = true) => {
  globalThis.fetch = (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;
};

describe("why a preview did not answer", () => {
  it("calls it an old bridge when the gateway injected one and nothing answered", async () => {
    serving({ ok: true, gateway: "preview", documents: 4, injected: 4, blocked: 0 });
    assert.deepEqual(await diagnose("https://43110-x.e2b.app"), { kind: "old-bridge" });
    assert.match(sayWhy({ kind: "old-bridge" }), /rebuild the runner template and start the run again/);
  });
  it("calls it a policy when the documents refused the injection", async () => {
    serving({ ok: true, gateway: "preview", documents: 2, injected: 0, blocked: 2 });
    assert.deepEqual(await diagnose("https://43110-x.e2b.app"), { kind: "blocked", blocked: 2, documents: 2 });
    assert.match(sayWhy({ kind: "blocked", blocked: 2, documents: 2 }), /Content-Security-Policy refused the bridge in 2 of 2 documents, and the policy is left as it is/);
  });
  it("names both when the gateway itself says nothing, because a browser cannot tell them apart", async () => {
    globalThis.fetch = (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    assert.deepEqual(await diagnose("https://43110-x.e2b.app"), { kind: "unreachable" });
    serving({}, false);
    assert.deepEqual(await diagnose("https://43110-x.e2b.app"), { kind: "unreachable" });
    const said = sayWhy({ kind: "unreachable" });
    assert.match(said, /An older sandbox does exactly this/);
    assert.match(said, /A run that is no longer up looks the same/);
  });
  it("answers something else's health with nothing", async () => {
    serving({ ok: true, gateway: "something-else" });
    assert.deepEqual(await diagnose("https://43110-x.e2b.app"), { kind: "unreachable" });
    assert.deepEqual(await diagnose("not a url"), { kind: "unknown" });
    assert.deepEqual(await diagnose(null), { kind: "unknown" });
  });
  it("never blames a policy the gateway did not report", async () => {
    serving({ ok: true, gateway: "preview", documents: 0, injected: 0, blocked: 0 });
    assert.equal((await diagnose("https://43110-x.e2b.app")).kind, "unknown");
    assert.doesNotMatch(sayWhy({ kind: "unknown" }), /Content-Security-Policy/);
    assert.doesNotMatch(sayWhy({ kind: "old-bridge" }), /Content-Security-Policy/);
  });
});
