// The collector against a fake database. What must hold: every line's ids
// land in the row's columns, a model call started while exactly one
// application request was open is joined to it as a temporal association
// (and to nothing when several are open), and browser events are stored
// as they came, minus the envelope.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createCollector } from "../../lib/trace/collector";

type Row = Record<string, unknown>;
// Enough of the Supabase client for the collector: inserts, one update
// with select, and the seq lookup.
function fakeSupabase() {
  const tables: Record<string, Row[]> = { engelbart_trace_events: [], engelbart_model_calls: [] };
  const client = {
    from(table: string) {
      const rows = tables[table];
      return {
        select() { return { eq() { return { order() { return { limit() { return { maybeSingle: async () => ({ data: null }) }; } }; } }; } }; },
        insert: async (row: Row) => { rows.push({ ...row }); return { error: null }; },
        update(patch: Row) {
          const filters: [string, unknown][] = [];
          const q = {
            eq(col: string, v: unknown) { filters.push([col, v]); return q; },
            select() { return { maybeSingle: async () => { const row = rows.find((r) => filters.every(([c, v]) => r[c] === v)); if (row) Object.assign(row, patch); return { data: row ? { id: row.id ?? "row", sizes: row.sizes } : null, error: null }; } }; },
            then(resolve: (v: unknown) => void) { const row = rows.find((r) => filters.every(([c, v]) => r[c] === v)); if (row) Object.assign(row, patch); resolve({ error: null }); },
          };
          return q;
        },
      };
    },
  };
  return { client, tables };
}
const line = (source: string, kind: string, fields: Row) => JSON.stringify({ engelbart: "trace", v: 1, source, kind, ts: "2026-09-19T10:00:00.000Z", ...fields });

describe("collector", () => {
  it("keeps ids as columns, joins a lone in-flight request to the model call, and stores browser events as data", async () => {
    const { client, tables } = fakeSupabase();
    const c = createCollector(client as never, "run-1");
    assert.ok(c.line(line("preview-gateway", "gateway.listening", { gateway: "preview", port: 43110 })));
    assert.ok(c.line(line("browser", "ui.click", { frameId: "f_parent01", interactionId: "i_parent01_1", target: { tag: "button", text: "Send" } })));
    assert.ok(c.line(line("preview-gateway", "network.request", { requestId: "r_1", interactionId: "i_parent01_1", correlation: "explicit", method: "POST", path: "/", category: "action" })));
    assert.ok(c.line(line("model-gateway", "model.request", { callId: "mc_1", capture: "full", provider: "openai", api: "openai.chat.completions", method: "POST", upstream: { scheme: "https", host: "h", path: "/v1/chat/completions", has_query: false }, request: { model: "gpt-4o", stream: true, message_count: 2 } })));
    assert.ok(c.line(line("model-gateway", "model.response", { callId: "mc_1", status: 200, latency_ms: 900, response: { model: "gpt-4o", usage_available: false, output: { text: "hi" } } })));
    assert.ok(c.line(line("preview-gateway", "network.response", { requestId: "r_1", interactionId: "i_parent01_1", correlation: "explicit", status: 200, latency_ms: 1200 })));
    assert.ok(c.line(line("browser", "ui.change", { frameId: "f_parent01", interactionId: "i_parent01_1", correlation: "temporal", added: ["Tip"], mutations: 3 })));
    assert.equal(c.line("plain stdout"), false);
    await c.flush();
    const events = tables.engelbart_trace_events;
    assert.deepEqual(events.map((e) => [e.seq, e.source, e.kind, e.interaction_id, e.request_id, e.call_id, e.correlation]), [
      [0, "preview-gateway", "gateway.listening", null, null, null, null],
      [1, "browser", "ui.click", "i_parent01_1", null, null, null],
      [2, "preview-gateway", "network.request", "i_parent01_1", "r_1", null, "explicit"],
      [3, "model-gateway", "model.request", "i_parent01_1", "r_1", "mc_1", "temporal"],
      [4, "model-gateway", "model.response", "i_parent01_1", "r_1", "mc_1", "temporal"],
      [5, "preview-gateway", "network.response", "i_parent01_1", "r_1", null, "explicit"],
      [6, "browser", "ui.change", "i_parent01_1", null, null, "temporal"],
    ]);
    assert.deepEqual(events[1].data, { frameId: "f_parent01", target: { tag: "button", text: "Send" } }, "the envelope and the ids are not repeated in data");
    assert.deepEqual(events[2].data, { method: "POST", path: "/", category: "action" });
    const call = tables.engelbart_model_calls[0];
    assert.deepEqual([call.interaction_id, call.request_id, call.correlation, call.phase, call.status], ["i_parent01_1", "r_1", "temporal", "response", 200]);
    assert.deepEqual(c.stats(), { events: 7, calls: 1, rejected: 0, failed: 0, browser: 2, network: 1 });
    assert.equal(await c.listening("preview", 10).then((v) => v?.port), 43110);
  });
  it("links nothing when several requests are open, and names the candidates", async () => {
    const { client, tables } = fakeSupabase();
    const c = createCollector(client as never, "run-2");
    c.line(line("preview-gateway", "network.request", { requestId: "r_a", method: "POST", path: "/api/a", category: "api" }));
    c.line(line("preview-gateway", "network.request", { requestId: "r_b", interactionId: "i_parent01_2", correlation: "explicit", method: "POST", path: "/api/b", category: "api" }));
    c.line(line("preview-gateway", "network.request", { requestId: "r_p", method: "GET", path: "/other", category: "prefetch" }));
    c.line(line("model-gateway", "model.request", { callId: "mc_2", request: { model: "gpt-4o" } }));
    c.line(line("preview-gateway", "network.response", { requestId: "r_a", status: 200 }));
    c.line(line("preview-gateway", "network.response", { requestId: "r_b", status: 200 }));
    c.line(line("model-gateway", "model.request", { callId: "mc_3", request: { model: "gpt-4o" } }));
    await c.flush();
    const [first, second] = tables.engelbart_model_calls;
    assert.deepEqual([first.request_id, first.interaction_id, first.correlation], [null, null, null]);
    const event = tables.engelbart_trace_events.find((e) => e.kind === "model.request" && e.call_id === "mc_2");
    assert.deepEqual((event?.data as Row).candidates, ["r_a", "r_b"], "prefetches are never candidates");
    assert.deepEqual([second.request_id, second.correlation], [null, null], "no request open: no association");
  });
});

// A model call can now name the request it was made for, because the
// preload inside the application knew. What the collector must not do is
// take that name on trust: it is a link only where the preview gateway
// reported the same request itself, and the interaction comes from that
// report rather than from the claim. Everything else falls back to
// timing, which is what it always was.
describe("a model call that names the request it belongs to", () => {
  const upstream = { scheme: "https", host: "api.example.com", path: "/v1/chat/completions", has_query: false };
  const call = (fields: Row) => line("model-gateway", "model.request", { callId: "mc_x", capture: "full", provider: "openai", method: "POST", upstream, request: { model: "gpt-4o" }, ...fields });

  it("is linked, not associated, when the preview gateway saw that request too", async () => {
    const { client, tables } = fakeSupabase();
    const c = createCollector(client as never, "run-x");
    c.line(line("preview-gateway", "network.request", { requestId: "r_7", interactionId: "i_page01_3", correlation: "explicit", method: "POST", path: "/", category: "action" }));
    // The request has already finished: this is the server-action shape,
    // where the work outlives the response and timing would find nothing.
    c.line(line("preview-gateway", "network.response", { requestId: "r_7", status: 200 }));
    c.line(call({ interactionId: "i_page01_3", requestId: "r_7", correlation: "explicit" }));
    await c.flush();
    const row = tables.engelbart_model_calls[0];
    assert.deepEqual([row.interaction_id, row.request_id, row.correlation], ["i_page01_3", "r_7", "explicit"]);
  });

  it("takes the interaction from what the gateway reported, not from the claim", async () => {
    const { client, tables } = fakeSupabase();
    const c = createCollector(client as never, "run-x");
    c.line(line("preview-gateway", "network.request", { requestId: "r_7", interactionId: "i_real0001_1", correlation: "explicit", method: "POST", path: "/", category: "action" }));
    c.line(call({ interactionId: "i_made0up1_9", requestId: "r_7", correlation: "explicit" }));
    await c.flush();
    const row = tables.engelbart_model_calls[0];
    assert.equal(row.interaction_id, "i_real0001_1", "the strongest a claim can be is a pointer at something already recorded");
  });

  it("falls back to timing when it names a request nothing reported", async () => {
    const { client, tables } = fakeSupabase();
    const c = createCollector(client as never, "run-x");
    c.line(line("preview-gateway", "network.request", { requestId: "r_open", interactionId: "i_page01_4", correlation: "explicit", method: "GET", path: "/", category: "document" }));
    c.line(call({ interactionId: "i_page01_9", requestId: "r_never_reported", correlation: "explicit" }));
    await c.flush();
    const row = tables.engelbart_model_calls[0];
    assert.deepEqual([row.interaction_id, row.request_id, row.correlation], ["i_page01_4", "r_open", "temporal"]);
  });

  it("leaves a call that names nothing exactly where it was", async () => {
    const { client, tables } = fakeSupabase();
    const c = createCollector(client as never, "run-x");
    c.line(call({}));
    await c.flush();
    const row = tables.engelbart_model_calls[0];
    assert.deepEqual([row.interaction_id, row.request_id, row.correlation], [null, null, null]);
  });
});
