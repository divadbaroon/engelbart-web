// Recording what the preview looked like, from inside the page.
//
// The recorder itself is @rrweb/record, vendored and unchanged, and none
// of it is under test here — it is stubbed, because what has to hold is
// everything around it: that nothing records until the workspace asks,
// that only the workspace can ask, that what comes out goes up the
// origin-pinned channel and never down the open one, that the two clocks
// get a pin between them, and that one page does not become two recorders.
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole, requestInterceptor } from "jsdom";

const here = path.dirname(fileURLToPath(import.meta.url));
const BRIDGE = fs.readFileSync(path.join(here, "../../sandbox/trace/bridge.js"), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Arrays built inside the jsdom window carry that window's prototypes,
// and deepEqual wants plain ones.
const plain = (v) => JSON.parse(JSON.stringify(v));
const WORKSPACE = "https://engelbart.test";

const open = [];
afterEach(() => { while (open.length) open.pop().window.close(); });

// The preview as the workspace sees it: a real document on the sandbox's
// origin inside a frame, a window above it standing in for the workspace,
// and a stub where the recorder would be. The stub is the whole of rrweb
// as far as this file is concerned: it hands back a stop function and
// keeps the options it was given, so what the bridge asked for can be
// read off it.
async function preview({ parentOrigin = WORKSPACE, recorder = true, inner = null, config = {} } = {}) {
  const page = `<!doctype html><html><body><p>hello</p>${inner ? `<iframe src="http://app.test/inner"></iframe>` : ""}</body></html>`;
  const innerPage = `<!doctype html><html><body>${inner ?? ""}</body></html>`;
  const serve = requestInterceptor((request) =>
    request.url === "http://app.test/page" ? new Response(page, { headers: { "Content-Type": "text/html" } })
    : request.url === "http://app.test/inner" ? new Response(innerPage, { headers: { "Content-Type": "text/html" } })
    : new Response("", { status: 404 }));
  const dom = new JSDOM(`<!doctype html><html><body><iframe src="http://app.test/page"></iframe></body></html>`, {
    runScripts: "dangerously", url: `${WORKSPACE}/`, resources: { interceptors: [serve] }, virtualConsole: new VirtualConsole(),
  });
  open.push(dom);
  const shell = dom.window;
  await new Promise((r) => (shell.document.readyState === "complete" ? r() : shell.addEventListener("load", r)));
  const frame = shell.document.querySelector("iframe");
  await new Promise((r) => (frame.contentDocument?.location.href.endsWith("/page") ? r() : frame.addEventListener("load", r, { once: true })));
  const win = frame.contentWindow, doc = frame.contentDocument;

  const calls = [];
  win.fetch = (input, init = {}) => { calls.push({ url: typeof input === "string" ? input : input.href ?? input.url, body: init.body }); return Promise.resolve({ ok: true, status: 204 }); };

  // The recorder, as the gateway serves it beside the bridge. Its mirror
  // is the only part the bridge reads: every element the recorder has
  // serialised has a number, and that number is how a picture of a canvas
  // says which canvas it is a picture of.
  const started = [];
  const ids = new Map();
  let emit = null, stopped = 0, nextId = 100;
  if (recorder) {
    win.rrwebRecord = {
      record(options) {
        started.push(options);
        emit = options.emit;
        return () => { stopped += 1; };
      },
    };
    win.rrwebRecord.record.mirror = {
      getId: (node) => (ids.has(node) ? ids.get(node) : -1),
    };
  }
  // Give an element the number the recorder would have given it.
  const serialize = (el) => { ids.set(el, ++nextId); return nextId; };

  const script = doc.createElement("script");
  script.dataset.frame = "f_preview01";
  script.dataset.config = JSON.stringify({ flushMs: 5, parentOrigin, replayFlushMs: 20, ...config });
  script.textContent = BRIDGE;
  doc.head.appendChild(script);
  const api = win.__engelbart;

  const up = [];
  shell.addEventListener("message", (e) => { if (e.data && e.data.engelbart === "annotate") up.push(e.data); });
  const down = (msg, { origin = WORKSPACE, source = shell } = {}) =>
    win.dispatchEvent(new win.MessageEvent("message", { data: { engelbart: "annotate", v: 1, dir: "down", ...msg }, origin, source }));
  const events = async () => { await sleep(0); await api.flush(); await sleep(0); return calls.filter((c) => c.url === "/__engelbart/events").flatMap((c) => JSON.parse(c.body).events); };
  const replays = () => up.filter((m) => m.type === "replay");

  const pictures = () => replays().flatMap((m) => [...(m.canvas ?? [])].map((f) => plain(f)));

  return { shell, win, doc, api, frame, down, up, replays, pictures, events, calls, serialize,
    options: () => started[0], started, stopCount: () => stopped, emit: (e) => emit && emit(e) };
}

describe("nothing records on its own", () => {
  it("does not start until the workspace asks", async () => {
    const p = await preview();
    await sleep(30);
    assert.equal(p.started.length, 0, "a page that was never asked is not recording");
    assert.deepEqual(p.replays(), []);
  });

  it("only the workspace may ask", async () => {
    const p = await preview();
    p.down({ type: "record", on: true }, { origin: "https://evil.test" });
    await sleep(10);
    assert.equal(p.started.length, 0, "another origin cannot start a recorder");
    p.down({ type: "record", on: true }, { source: p.win });
    await sleep(10);
    assert.equal(p.started.length, 0, "nor can the page itself");
    p.down({ type: "record", on: true });
    await sleep(10);
    assert.equal(p.started.length, 1);
  });

  it("stays shut when the gateway named no workspace", async () => {
    const p = await preview({ parentOrigin: "" });
    p.down({ type: "record", on: true });
    await sleep(10);
    assert.equal(p.started.length, 0, "with no parentOrigin the bridge only observes, as always");
  });

  it("says so when there is no recorder on the image", async () => {
    const p = await preview({ recorder: false });
    p.down({ type: "record", on: true });
    await sleep(10);
    const said = p.replays();
    assert.equal(said.length, 1);
    assert.equal(said[0].phase, "unavailable");
    // A sentence rather than silence: a recording that captured nothing
    // should not look like one that is still going.
    assert.match(said[0].reason, /no recorder/);
  });
});

describe("what the recorder is allowed to see", () => {
  it("records what a person typed, because sending it publishes it anyway", async () => {
    // Hiding a message while it sits in the box and showing it a moment
    // later, in full, protects almost nothing and loses the hesitating and
    // rewriting that a recording of somebody working is largely for.
    const p = await preview();
    p.down({ type: "record", on: true });
    await sleep(10);
    const o = p.options();
    assert.equal(o.maskAllInputs, false);
    assert.equal(o.maskTextSelector, null, "and a rich editor is a typing surface like any other");
  });

  it("...but never a credential, and never its length", async () => {
    // With maskAllInputs false rrweb masks password fields and nothing
    // else, and this replaces its default run of asterisks, which is as
    // long as the value.
    const p = await preview();
    p.down({ type: "record", on: true });
    await sleep(10);
    const o = p.options();
    assert.equal(typeof o.maskInputFn, "function");
    assert.equal(o.maskInputFn("hunter2"), o.maskInputFn("a much longer secret"));
  });

  it("can be told to hide typing after all, without a new image", async () => {
    const p = await preview({ config: { maskTyping: true } });
    p.down({ type: "record", on: true });
    await sleep(10);
    const o = p.options();
    assert.equal(o.maskAllInputs, true);
    assert.equal(o.maskTextSelector, "[contenteditable]");
  });

  it("takes pictures of anything that draws itself, and does not copy the web down", async () => {
    const p = await preview();
    p.down({ type: "record", on: true });
    await sleep(10);
    const o = p.options();
    assert.equal(o.recordCanvas, true);
    assert.equal(o.sampling.canvas, 12);
    // Archival capture is not part of this: images and fonts are fetched
    // again at replay time rather than copied in.
    assert.equal(o.inlineImages, false);
    assert.equal(o.collectFonts, false);
    // Seeking replays everything since the last whole picture, so there
    // have to be whole pictures.
    assert.equal(o.checkoutEveryNms, 30000);
  });
});

describe("what comes out, and where it goes", () => {
  it("goes up the workspace's channel and never down the open one", async () => {
    const p = await preview();
    p.down({ type: "record", on: true });
    await sleep(10);
    p.emit({ type: 4, timestamp: 1700, data: { href: "http://app.test/page" } });
    p.emit({ type: 2, timestamp: 1710, data: { node: { id: 1 } } });
    await sleep(40);
    const parts = p.replays().filter((m) => m.phase === "part");
    assert.equal(parts.length, 1, "batched rather than one message per event");
    assert.deepEqual(plain(parts[0].events).map((e) => e.timestamp), [1700, 1710]);
    assert.equal(parts[0].seq, 0);
    // The events endpoint is unauthenticated and everything it takes is
    // broadcast to every viewer of the run. A picture of somebody's
    // screen does not go there.
    const posted = p.calls.filter((c) => c.url === "/__engelbart/events").map((c) => c.body).join("");
    assert.equal(posted.includes("1710"), false, "nothing of the stream went to the events endpoint");
  });

  it("numbers its parts so they can be put back in order", async () => {
    const p = await preview();
    p.down({ type: "record", on: true });
    await sleep(10);
    p.emit({ type: 3, timestamp: 1800, data: {} });
    await sleep(40);
    p.emit({ type: 3, timestamp: 1900, data: {} });
    await sleep(40);
    assert.deepEqual([...p.replays().filter((m) => m.phase === "part").map((m) => m.seq)], [0, 1]);
  });

  it("pins the two clocks together with one ordinary event", async () => {
    const p = await preview();
    const before = Date.now();
    p.down({ type: "record", on: true });
    await sleep(10);
    const all = await p.events();
    const pin = all.find((e) => e.kind === "frame.record");
    assert.ok(pin, "the trace says when the recording started");
    assert.equal(pin.data.action, "start");
    assert.ok(pin.at >= before, "stamped with this browser's clock, which is rrweb's clock");
    // The gateway rewrites `at` onto the sandbox's clock and keeps this
    // one beside it, which is what makes the two findable in each other.
    const said = p.replays().find((m) => m.phase === "start");
    assert.ok(Math.abs(said.startedAt - pin.at) < 50, "and the same instant went up the channel");
  });

  it("ends when it is told to, with whatever it was holding", async () => {
    const p = await preview();
    p.down({ type: "record", on: true });
    await sleep(10);
    p.emit({ type: 3, timestamp: 2000, data: {} });
    p.down({ type: "record", on: false });
    await sleep(10);
    assert.equal(p.stopCount(), 1, "the recorder was actually stopped");
    const end = p.replays().find((m) => m.phase === "end");
    assert.ok(end, "and said so");
    assert.deepEqual(plain(end.events).map((e) => e.timestamp), [2000], "holding the part it had not sent yet");
    const all = await p.events();
    assert.ok(all.some((e) => e.kind === "frame.record" && e.data.action === "stop"));
  });

  it("cuts itself off rather than growing without end, and says it did", async () => {
    const p = await preview({ config: { replayMaxBytes: 300 } });
    p.down({ type: "record", on: true });
    await sleep(10);
    for (let i = 0; i < 40; i++) p.emit({ type: 3, timestamp: 3000 + i, data: { filler: "x".repeat(50) } });
    await sleep(40);
    const said = p.replays().filter((m) => m.phase === "part" || m.phase === "end");
    assert.ok(said.length > 0);
    assert.ok(said.some((m) => m.truncated), "a recording that would not fit says so rather than failing quietly");
    assert.equal(p.stopCount(), 1, "and stops, rather than filling the tab");
  });
});

// A canvas is a drawing with nothing in the DOM to replay, so it is
// photographed instead. The recorder photographs the document it was
// built with; it cannot see into a frame, and nothing can be registered
// with it afterwards. So the bridge covers the frames — which is where an
// imported application usually draws — and leaves the top document to the
// recorder rather than photographing it twice.
describe("the canvases the recorder cannot see", () => {
  // jsdom has no encoder, and the encoder is not what is under test: what
  // is under test is which canvases are found, what they are called, and
  // when a picture is worth sending.
  const drawable = (el, url) => {
    el.width = 40; el.height = 30;
    el.toDataURL = () => url();
    return el;
  };

  it("photographs one in a frame, under the name the recorder gave it", async () => {
    const p = await preview({ inner: `<canvas id="game"></canvas>`, config: { canvasFps: 200 } });
    const inner = p.doc.querySelector("iframe").contentDocument.getElementById("game");
    let n = 0;
    drawable(inner, () => `data:image/webp;base64,AAAA${n++}`);
    const id = p.serialize(inner);
    p.down({ type: "record", on: true });
    await sleep(60);
    const shot = p.pictures();
    assert.ok(shot.length > 0, "a drawing a frame down was photographed");
    assert.equal(shot[0].nodeId, id, "and named by the recorder's own id, not by anything we invented");
    assert.match(shot[0].dataUrl, /^data:image\/webp;base64,/);
    assert.ok(shot[0].at >= p.replays().find((m) => m.phase === "start").startedAt);
  });

  it("leaves the top document to the recorder", async () => {
    // Photographing it here as well would be the same screen twice, at
    // twice the size, and worse: the recorder's version is the one that
    // survives a canvas whose drawing buffer is not preserved.
    const p = await preview({ config: { canvasFps: 200 } });
    const top = p.doc.createElement("canvas");
    p.doc.body.appendChild(top);
    drawable(top, () => "data:image/webp;base64,TOP");
    p.serialize(top);
    p.down({ type: "record", on: true });
    await sleep(60);
    assert.deepEqual(p.pictures(), []);
  });

  it("waits for a canvas to have a size and a name", async () => {
    const p = await preview({ inner: `<canvas id="game"></canvas>`, config: { canvasFps: 200 } });
    const inner = p.doc.querySelector("iframe").contentDocument.getElementById("game");
    inner.toDataURL = () => "data:image/webp;base64,AAAA";
    p.down({ type: "record", on: true });
    await sleep(60);
    assert.deepEqual(p.pictures(), [], "nothing has been drawn on a canvas with no area");
    inner.width = 40; inner.height = 30;
    await sleep(60);
    assert.deepEqual(p.pictures(), [], "and an element the recorder has not serialised has nothing to be called");
    p.serialize(inner);
    await sleep(60);
    assert.equal(p.pictures().length, 1);
  });

  it("sends a still canvas once rather than the same picture forever", async () => {
    const p = await preview({ inner: `<canvas id="game"></canvas>`, config: { canvasFps: 200 } });
    const inner = p.doc.querySelector("iframe").contentDocument.getElementById("game");
    let url = "data:image/webp;base64,AAAA";
    drawable(inner, () => url);
    p.serialize(inner);
    p.down({ type: "record", on: true });
    await sleep(80);
    assert.equal(p.pictures().length, 1, "a drawing that has not changed has not been redrawn");
    url = "data:image/webp;base64,BBBB";
    await sleep(60);
    assert.equal(p.pictures().length, 2);
  });

  it("leaves alone what the recorder was told to leave alone", async () => {
    const p = await preview({ inner: `<div class="rr-block"><canvas id="game"></canvas></div>`, config: { canvasFps: 200 } });
    const inner = p.doc.querySelector("iframe").contentDocument.getElementById("game");
    drawable(inner, () => "data:image/webp;base64,AAAA");
    p.serialize(inner);
    p.down({ type: "record", on: true });
    await sleep(60);
    assert.deepEqual(p.pictures(), []);
  });

  it("stops photographing when the recording stops", async () => {
    const p = await preview({ inner: `<canvas id="game"></canvas>`, config: { canvasFps: 200 } });
    const inner = p.doc.querySelector("iframe").contentDocument.getElementById("game");
    let n = 0;
    drawable(inner, () => `data:image/webp;base64,AAAA${n++}`);
    p.serialize(inner);
    p.down({ type: "record", on: true });
    await sleep(60);
    p.down({ type: "record", on: false });
    // The last part goes up as a message, which arrives on a later turn.
    await sleep(20);
    const taken = p.pictures().length;
    assert.ok(taken > 0, "it was photographing while the recording was open");
    await sleep(80);
    assert.equal(p.pictures().length, taken);
  });
});

describe("one page, one recorder", () => {
  it("does not tell its frames to record as well", async () => {
    // The recorder walks same-origin frames from the top document itself.
    // A child that started its own would be a second copy of the same
    // screen, on the same channel, at twice the size.
    const p = await preview({ inner: "<p>inner</p>" });
    const child = p.doc.querySelector("iframe");
    const passed = [];
    child.contentWindow.postMessage = (msg) => passed.push(msg);
    p.down({ type: "record", on: true });
    await sleep(10);
    assert.equal(passed.filter((m) => m && m.type === "record").length, 0);
    // ...where the survey, which each document must answer for itself, is
    // passed down as it always was.
    p.down({ type: "survey" });
    await sleep(10);
    assert.equal(passed.filter((m) => m && m.type === "survey").length, 1);
  });

  it("starting twice is starting once", async () => {
    const p = await preview();
    p.down({ type: "record", on: true });
    p.down({ type: "record", on: true });
    await sleep(10);
    assert.equal(p.started.length, 1, "the workspace may ask again without doubling the stream");
  });
});
