// A whole session the way it was recorded from a real run: a login on the
// page, arrow keys there and in a game frame (the page's logger posting
// after each key), a message typed and sent with Enter, the framework's
// server action (posted to "" and so not tagged by an older bridge), the
// model call during it, the answer appearing, a stray GET later. Shared by
// the timeline and moments tests.
import type { TraceEvent } from "../../../lib/trace/types";

export const browser = (seq: number, kind: string, t: string, frameId: string, interactionId: string | null, data: Record<string, unknown>, correlation: "explicit" | "temporal" | null = null): TraceEvent => ({
  id: seq, runId: "r", seq, at: t, receivedAt: "", source: "browser", kind, interactionId, requestId: null, callId: null, correlation, data: { frameId, ...data },
});
export const gateway = (seq: number, kind: string, t: string, ids: { interactionId?: string | null; requestId?: string | null; callId?: string | null; correlation?: "explicit" | "temporal" | null }, data: Record<string, unknown>, source: TraceEvent["source"] = "preview-gateway"): TraceEvent => ({
  id: seq, runId: "r", seq, at: t, receivedAt: "", source, kind, interactionId: ids.interactionId ?? null, requestId: ids.requestId ?? null, callId: ids.callId ?? null, correlation: ids.correlation ?? null, data,
});

export const PAGE = "f_page000001", GAME = "f_game000001";
export const t = (s: number, ms = 0) => new Date(Date.UTC(2026, 8, 19, 10, 0, s, ms)).toISOString();
const field = { tag: "textarea", selector: "form > textarea", placeholder: "Start discussing about Tetris requirements by typing here.", editable: "text" };
export const events: TraceEvent[] = [
  gateway(0, "gateway.listening", t(0), {}, { gateway: "preview", port: 43110 }),
  gateway(1, "frame.served", t(1), { requestId: "r_page" }, { frameId: PAGE, path: "/", dest: "iframe" }),
  browser(2, "frame.loaded", t(1, 500), PAGE, null, { url: "/", title: "Create Next App", embedded: true, surfaces: { counts: { iframe: 2, textarea: 1 } } }),
  gateway(3, "frame.served", t(2), { requestId: "r_game" }, { frameId: GAME, path: "/sandbox/index.html", dest: "iframe", query: { id: "solution" } }),
  browser(4, "frame.loaded", t(2, 200), GAME, null, { url: "/sandbox/index.html?…", query: { id: "solution" }, title: "Python Game Sandbox", embedded: true }),
  browser(5, "frame.attached", t(2, 300), GAME, null, { parentFrameId: PAGE, selectorInParent: "main > div:nth-of-type(4) > div > iframe:nth-of-type(2)", name: null, depth: null, instrumented: "self" }),
  browser(6, "ui.click", t(5), PAGE, "i_page000001_1", { target: { tag: "input", type: "text", placeholder: "Subject ID", selector: "form > input", editable: "text" } }),
  browser(7, "ui.input", t(5, 500), PAGE, "i_page000001_2", { kind: "text", valueLength: 4, target: { tag: "input", type: "text", placeholder: "Subject ID", selector: "form > input" } }),
  browser(8, "ui.click", t(6), PAGE, "i_page000001_3", { target: { tag: "button", selector: "div > button", text: "Continue" } }),
  browser(9, "ui.change", t(6, 100), PAGE, "i_page000001_3", { part: 1, mutations: 2, durationMs: 10, sinceInteractionMs: 24, added: ["Reset End Change Game Break down the main steps"], removed: ["Welcome! Enter information to continue."], container: { tag: "main", selector: "main" } }, "temporal"),
  browser(42, "ui.change", t(6, 900), PAGE, "i_page000001_3", { part: 2, mutations: 4, durationMs: 3, sinceInteractionMs: 900, added: ["Tetris"], removed: ["Tetris"], container: { tag: "main", selector: "main" } }, "temporal"),
  browser(10, "ui.key", t(8), PAGE, "i_page000001_4", { key: "ArrowLeft", class: "control", count: 4, editable: null, target: { tag: "body", selector: "body" } }),
  browser(11, "ui.key", t(9), PAGE, "i_page000001_5", { key: "ArrowUp", class: "control", count: 2, editable: null, target: { tag: "body", selector: "body" } }),
  browser(12, "ui.focus", t(10), GAME, "i_game000001_1", { embedded: true, target: { tag: "body", selector: "body" } }),
  browser(13, "ui.click", t(10, 100), GAME, "i_game000001_2", { target: { tag: "body", selector: "body" } }),
  browser(14, "ui.click", t(10, 500), GAME, "i_game000001_3", { target: { tag: "canvas", id: "game-canvas", selector: "#game-canvas" } }),
  gateway(15, "network.request", t(10, 600), { requestId: "r_log1", interactionId: "i_page000001_5", correlation: "explicit" }, { method: "POST", path: "/api/logClick", category: "api" }),
  browser(16, "ui.key", t(11), GAME, "i_game000001_4", { key: "ArrowUp", class: "control", count: 1, editable: null, target: { tag: "body", selector: "body" } }),
  browser(17, "ui.key", t(11, 100), GAME, "i_game000001_5", { key: "ArrowDown", class: "control", count: 1, editable: null, target: { tag: "body", selector: "body" } }),
  gateway(18, "network.request", t(11, 200), { requestId: "r_log2", interactionId: "i_page000001_5", correlation: "explicit" }, { method: "POST", path: "/api/logClick", category: "api" }),
  browser(19, "ui.key", t(11, 300), GAME, "i_game000001_6", { key: "ArrowUp", class: "control", count: 2, editable: null, target: { tag: "body", selector: "body" } }),
  gateway(20, "network.request", t(11, 400), { requestId: "r_log3", interactionId: "i_page000001_5", correlation: "explicit" }, { method: "POST", path: "/api/logClick", category: "api" }),
  browser(21, "ui.key", t(12), GAME, "i_game000001_7", { key: "ArrowRight", class: "control", count: 4, editable: null, target: { tag: "body", selector: "body" } }),
  gateway(22, "network.response", t(12, 500), { requestId: "r_log1", interactionId: "i_page000001_5", correlation: "explicit" }, { status: 500, latency_ms: 1900 }),
  gateway(23, "network.response", t(12, 510), { requestId: "r_log2", interactionId: "i_page000001_5", correlation: "explicit" }, { status: 500, latency_ms: 1300 }),
  gateway(24, "network.response", t(12, 520), { requestId: "r_log3", interactionId: "i_page000001_5", correlation: "explicit" }, { status: 500, latency_ms: 1100 }),
  browser(25, "ui.focus", t(14), PAGE, "i_page000001_6", { embedded: true, target: { tag: "body", selector: "body" } }),
  browser(26, "ui.click", t(14, 100), PAGE, "i_page000001_7", { target: field }),
  browser(27, "ui.change", t(14, 200), PAGE, "i_page000001_7", { part: 1, mutations: 3, durationMs: 5, sinceInteractionMs: 100, added: [], removed: [], rerendered: 1, container: { tag: "form", selector: "form" } }, "temporal"),
  browser(28, "ui.key", t(20), PAGE, "i_page000001_8", { key: "Enter", class: "control", count: 1, editable: "text", target: field }),
  gateway(29, "network.request", t(20, 6), { requestId: "r_conv1", interactionId: "i_page000001_8", correlation: "explicit" }, { method: "POST", path: "/api/conversation", category: "api" }),
  gateway(30, "network.request", t(20, 13), { requestId: "r_act" }, { method: "POST", path: "/", category: "action", next_action: true }),
  browser(31, "ui.change", t(20, 20), PAGE, "i_page000001_8", { part: 1, mutations: 3, durationMs: 2, sinceInteractionMs: 15, added: ["create an 8 x 6 board"], removed: [], container: { tag: "ul", selector: "#chat" } }, "temporal"),
  gateway(32, "network.response", t(20, 400), { requestId: "r_conv1", interactionId: "i_page000001_8", correlation: "explicit" }, { status: 500, latency_ms: 394 }),
  gateway(33, "model.request", t(20, 460), { callId: "mc_1", requestId: "r_act", correlation: "temporal" }, { model: "gpt-4o", host: "api.openai-proxy.com", path: "/v1/chat/completions", stream: true, messageCount: 3 }, "model-gateway"),
  browser(34, "ui.change", t(23, 200), PAGE, "i_page000001_8", { part: 1, mutations: 95, durationMs: 1200, sinceInteractionMs: 3231, added: ["Great start! You've correctly identified \"Creating and Drawing the Board\" as the first step."], removed: [], container: { tag: "ul", selector: "#chat" } }, "temporal"),
  gateway(35, "model.response", t(24, 500), { callId: "mc_1", requestId: "r_act", correlation: "temporal" }, { status: 200, latencyMs: 4097, outputChars: 1209, usageAvailable: false, streamed: true }, "model-gateway"),
  gateway(36, "network.response", t(24, 510), { requestId: "r_act" }, { status: 200, latency_ms: 4544 }),
  gateway(37, "network.request", t(24, 600), { requestId: "r_conv2", interactionId: "i_page000001_8", correlation: "explicit" }, { method: "POST", path: "/api/conversation", category: "api" }),
  gateway(38, "network.response", t(24, 610), { requestId: "r_conv2", interactionId: "i_page000001_8", correlation: "explicit" }, { status: 500, latency_ms: 10 }),
  browser(39, "ui.change", t(24, 620), PAGE, "i_page000001_8", { part: 1, mutations: 2, durationMs: 1, sinceInteractionMs: 4623, added: ["Creating and Drawing the Board"], removed: [], container: { tag: "ul", selector: "#chat" } }, "temporal"),
  gateway(40, "network.request", t(37), { requestId: "r_late" }, { method: "GET", path: "/", category: "api" }),
  gateway(41, "network.response", t(37, 200), { requestId: "r_late" }, { status: 200, latency_ms: 200 }),
];
