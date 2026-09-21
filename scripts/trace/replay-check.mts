// Record a real page and watch it back, in a real browser, end to end.
//
//   npm run replay:verify
//
// What this exercises is everything between the two ends that a live run
// would exercise, minus Supabase and React: the real preview gateway
// serving the real bridge and the real vendored recorder into a real
// document; the real control channel, origin-pinned, driven from a page
// on a different origin the way the workspace drives it; the real rrweb
// recording a page with a canvas on it; and the real Replayer rebuilding
// that page from what came back, with the canvas painted the way the
// replay surface paints it.
//
// It exists because the live path needs an E2B sandbox, a worker and a
// signed-in browser, and none of those say anything about whether the
// recording is any good. This does.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPreviewGateway } from "../../sandbox/trace/preview-gateway.mjs";
// The real readers, not a copy of them in the page. A copy is how the
// blind spot below went unnoticed the first time: the harness read the
// stream the way it expected the stream to be written.
import { allFrames, framesAt, readStoredReplay, usedPointer } from "../../lib/trace/replay";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "../..");
const CHROME = process.env.ENGELBART_CHROME
  ?? "/Users/divadbaroon/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

// ---- the application under test
//
// Deliberately unremarkable: a heading, a text field, and two canvases
// that draw something different every frame. The canvases are the point
// — a drawing is what a DOM recording cannot reconstruct on its own —
// and there are two of them because the two are recorded by different
// machinery and only one of them used to work.
//
// `board` is in this document, which is the one rrweb's canvas manager
// was built with, so rrweb samples it. `inner` is one frame down, which
// rrweb's sampler does not descend into and nothing registers with it
// afterwards; the bridge covers that. An imported application renders
// into a frame of its own, so the second is the ordinary case and the
// first is the lucky one. The first version of this harness had only the
// first, which is why a live ROPE recording came back with a white
// rectangle where the game was.
const DRAW = `
  var n = 0;
  function paint(c, w, h, seed) {
    n += 1;
    c.fillStyle = "#" + ((((n + seed) * 40) % 200) + 55).toString(16) + "2244";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#fff";
    c.fillRect(((n * 7) % (w - 20)), 20, 20, 20);
    return n;
  }`;

const INNER = `<!doctype html><html><body style="margin:0">
<canvas id="inner" width="240" height="140"></canvas>
<script>${DRAW}
  var c = document.getElementById("inner").getContext("2d");
  setInterval(function () { paint(c, 240, 140, 3); }, 100);
</script>
</body></html>`;

const APP = `<!doctype html><html><head><title>Test artifact</title></head><body>
<h1 id="title">A page that was recorded</h1>
<label>Subject ID <input id="subject" type="text"></label>
<label>Key <input id="secret" type="password"></label>
<canvas id="board" width="200" height="120"></canvas>
<iframe id="game" src="/inner" width="260" height="160" style="border:0"></iframe>
<p id="score">score 0</p>
<script>${DRAW}
  // Somebody using the page. It types into itself because the workspace
  // cannot reach across the origin to do it — which is the arrangement
  // under test, not a limitation of it.
  setTimeout(function () {
    var input = document.getElementById("subject");
    input.focus();
    input.value = "S-4417-SUBJECT";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    var key = document.getElementById("secret");
    key.focus();
    key.value = "hunter2-DO-NOT-RECORD";
    key.dispatchEvent(new Event("input", { bubbles: true }));
  }, 900);
  var c = document.getElementById("board").getContext("2d");
  setInterval(function () {
    document.getElementById("score").textContent = "score " + paint(c, 200, 120, 0);
  }, 100);
</script>
</body></html>`;

function serve(handler: http.RequestListener): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      resolve({ port, close: () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }) });
    });
  });
}

// ---- the browser, over the DevTools protocol
async function chrome() {
  const { spawn } = await import("node:child_process");
  const proc = spawn(CHROME, ["--headless", "--remote-debugging-port=0", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--window-size=1200,800", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  const wsUrl = await new Promise<string>((resolve, reject) => {
    let out = "";
    const timer = setTimeout(() => reject(new Error("the browser did not say where to connect")), 20000);
    proc.stderr.on("data", (c) => {
      out += String(c);
      const m = out.match(/ws:\/\/[^\s]+/);
      if (m) { clearTimeout(timer); resolve(m[0]); }
    });
    proc.on("exit", (code) => { clearTimeout(timer); reject(new Error(`the browser exited (${code}): ${out.slice(-400)}`)); });
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0;
  const waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(String(e.data));
    const pending = waiting.get(msg.id);
    if (!pending) return;
    waiting.delete(msg.id);
    if (msg.error) pending.reject(new Error(msg.error.message));
    else pending.resolve(msg.result);
  });
  const send = (method: string, params: Record<string, unknown> = {}, sessionId?: string) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const n = ++id;
      waiting.set(n, { resolve: resolve as (v: unknown) => void, reject });
      ws.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" }) as { targetId: string };
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true }) as { sessionId: string };
  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);
  return {
    goto: async (url: string) => { await send("Page.navigate", { url }, sessionId); await sleep(700); },
    // Input the browser itself delivers. Events made up in the page are
    // not the same thing: the recorder listens for what a person does.
    mouseTo: async (x: number, y: number) => {
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none", clickCount: 0 }, sessionId);
    },
    touchAt: async (x: number, y: number) => {
      // What a trackpad emits while scrolling, beside the mouse's own events.
      await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 }, sessionId);
      await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] }, sessionId);
      await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 12, y: y + 18 }] }, sessionId);
      await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }, sessionId);
      await send("Emulation.setTouchEmulationEnabled", { enabled: false }, sessionId);
    },
    eval: async <T,>(expression: string): Promise<T> => {
      const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId) as { result: { value: T }; exceptionDetails?: { text: string; exception?: { description?: string } } };
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
    close: async () => { try { ws.close(); } catch { /* going anyway */ } proc.kill("SIGKILL"); },
  };
}

// ---- the checks
const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`); };

async function main() {
  const app = await serve((req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(req.url === "/inner" ? INNER : APP);
  });

  // The gateway, exactly as the sandbox runs it, with the real bridge and
  // the real vendored recorder.
  const bridge = read("sandbox/trace/bridge.js");
  const recorder = read("sandbox/trace/rrweb-record.js");
  const traceLines: { kind: string; [k: string]: unknown }[] = [];
  const gatewayHolder = createPreviewGateway({
    listenPort: 0, targetPort: app.port, bridge, recorder,
    // The workspace is on a different host, so the control channel is
    // actually under test rather than waved through as same-origin.
    bridgeConfig: { parentOrigin: "http://localhost:0", replayFlushMs: 300 },
    emit: (kind, fields) => traceLines.push({ kind, ...fields }),
    log: () => {},
  });
  const gatewayPort = await gatewayHolder.listen("127.0.0.1");

  // The workspace page: a different origin, an iframe, and the two halves
  // of the channel. localhost and 127.0.0.1 are different origins.
  const previewUrl = `http://127.0.0.1:${gatewayPort}/`;
  const replayUmd = read("node_modules/@rrweb/replay/dist/replay.umd.cjs");
  const replayCss = read("node_modules/@rrweb/replay/dist/style.css");
  const shell = await serve((req, res) => {
    if (req.url === "/replay.js") { res.writeHead(200, { "content-type": "application/javascript" }); return res.end(replayUmd); }
    if (req.url === "/replay.css") { res.writeHead(200, { "content-type": "text/css" }); return res.end(replayCss); }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html><html><head><link rel=stylesheet href="/replay.css"><script src="/replay.js"></script></head>
<body style="margin:0">
  <iframe id="preview" src="${previewUrl}" style="width:900px;height:500px;border:0"></iframe>
  <div id="stage"></div>
  <script>
    window.parts = [];
    window.origin_ = new URL("${previewUrl}").origin;
    addEventListener("message", function (e) {
      if (e.origin !== window.origin_) return;
      var m = e.data;
      if (!m || m.engelbart !== "annotate" || m.dir !== "up" || m.type !== "replay") return;
      window.parts.push(m);
    });
    window.tell = function (on) {
      document.getElementById("preview").contentWindow.postMessage(
        { engelbart: "annotate", v: 1, dir: "down", type: "record", on: on }, window.origin_);
    };
    window.stream = function () {
      return window.parts.filter(function (p) { return p.events; }).reduce(function (all, p) { return all.concat(p.events); }, []);
    };
    // What the workspace would write to the bucket, assembled the same way.
    window.taken = function () {
      var start = window.parts.filter(function (p) { return p.startedAt; })[0];
      return {
        v: 1, offset: 0, truncated: false, dropped: 0,
        startedAt: start ? start.startedAt : 0,
        events: window.stream(),
        canvas: window.parts.filter(function (p) { return p.canvas; }).reduce(function (all, p) { return all.concat(p.canvas); }, []),
      };
    };
  </script>
</body></html>`);
  });
  // The gateway must name this exact origin or the channel stays shut.
  await gatewayHolder.close();
  const gateway = createPreviewGateway({
    listenPort: gatewayPort, targetPort: app.port, bridge, recorder,
    bridgeConfig: { parentOrigin: `http://127.0.0.1:${shell.port}`, replayFlushMs: 300 },
    emit: (kind, fields) => traceLines.push({ kind, ...fields }),
    log: () => {},
  });
  await gateway.listen("127.0.0.1");

  const browser = await chrome();
  try {
    await browser.goto(`http://127.0.0.1:${shell.port}/`);
    await sleep(900);

    const injected = await browser.eval<boolean>(`!!document.getElementById("preview").contentWindow`);
    check("the preview is up", injected);

    // ---- record
    await browser.eval(`window.tell(true)`);
    await sleep(500);
    // Somebody using it: a mouse moving over the preview, and one scroll
    // gesture of the kind a trackpad turns into touch events.
    for (const [x, y] of [[120, 120], [220, 170], [320, 230], [420, 290], [500, 330]]) {
      await browser.mouseTo(x, y);
      await sleep(90);
    }
    await browser.touchAt(300, 240);
    // The page types into itself and animates its canvas; the recording
    // runs over the top of both.
    await sleep(2200);
    await browser.eval(`window.tell(false)`);
    await sleep(900);

    const count = await browser.eval<number>(`window.stream().length`);
    check("a stream came back up the channel", count > 2, `${count} events`);

    const phases = await browser.eval<string[]>(`window.parts.map(function (p) { return p.phase; })`);
    check("it began and ended", phases.includes("start") && phases.includes("end"), phases.join(", "));

    // ---- the clock pin went through the ordinary path
    const pin = traceLines.find((l) => l.kind === "frame.record");
    check("the trace carries a pin between the two clocks", !!pin && typeof pin.browser_at === "number",
      pin ? `browser_at ${pin.browser_at}, offset ${pin.clock_offset_ms}` : "no frame.record event");
    check("and nothing of the stream went down the open channel",
      !traceLines.some((l) => JSON.stringify(l).includes("hunter2-DO-NOT-RECORD")));

    // ---- what the recorder was allowed to see
    //
    // Typing is recorded: a message hidden in the box and published a
    // moment later was never protected, and what masking cost was the
    // shape of arriving at it. A credential is a different thing.
    const typed = await browser.eval<boolean>(`JSON.stringify(window.stream()).indexOf("S-4417-SUBJECT") >= 0`);
    check("what a person typed is in the stream, so a replay can show it", typed);
    const secret = await browser.eval<boolean>(`JSON.stringify(window.stream()).indexOf("hunter2-DO-NOT-RECORD") >= 0`);
    check("what they typed into a password field is not", !secret);
    const masked = await browser.eval<boolean>(`JSON.stringify(window.stream()).indexOf("\\u2022\\u2022\\u2022") >= 0`);
    check("it is there as a mask that does not give the length away", masked);

    // ---- canvas
    //
    // Read back through the real readers, the way the workspace reads a
    // stored replay: whatever route a picture took, it arrives here as a
    // frame with a time, a node id and an image.
    const stored = readStoredReplay(await browser.eval<unknown>(`window.taken()`));
    if (!stored) throw new Error("the stored replay could not be read back");
    const frames = allFrames(stored);
    const byNode = new Map<number, number>();
    for (const f of frames) byNode.set(f.nodeId, (byNode.get(f.nodeId) ?? 0) + 1);
    check("the canvases were captured as pictures", frames.length > 0, `${frames.length} frames`);
    // The one in this document and the one a frame down. Either alone is
    // the bug: rrweb covers only the first, the bridge only the second.
    check("both of them, not just the one the recorder can see", byNode.size === 2,
      `${byNode.size} canvas${byNode.size === 1 ? "" : "es"} photographed: ${[...byNode.entries()].map(([id, n]) => `#${id}×${n}`).join(", ")}`);

    // ---- watch it back
    const replayed = await browser.eval<{ heading: string; score: string; value: string; secret: string; canvases: number; duration: number }>(`(async function () {
      var events = window.stream();
      var r = new rrwebReplay.Replayer(events, {
        root: document.getElementById("stage"),
        mouseTail: false,
        UNSAFE_replayCanvas: false,
      });
      window.r = r;
      r.pause(Math.floor(r.getMetaData().totalTime * 0.8));
      await new Promise(function (res) { setTimeout(res, 700); });
      var d = r.iframe.contentDocument;
      return {
        heading: (d.getElementById("title") || {}).textContent || "",
        score: (d.getElementById("score") || {}).textContent || "",
        value: (d.getElementById("subject") || {}).value || "",
        secret: (d.getElementById("secret") || {}).value || "",
        canvases: d.querySelectorAll("canvas").length,
        duration: r.getMetaData().totalTime,
      };
    })()`);
    check("the page came back", replayed.heading === "A page that was recorded", JSON.stringify(replayed.heading));
    check("and so did what it was showing at the time", /^score \d+$/.test(replayed.score) && replayed.score !== "score 0", replayed.score);
    check("with what was typed readable in the replay", replayed.value === "S-4417-SUBJECT", JSON.stringify(replayed.value));
    check("and the credential still masked there", replayed.secret === "\u2022\u2022\u2022", JSON.stringify(replayed.secret));
    check("the canvas element is there to be painted", replayed.canvases === 1);

    // ---- nothing in the replayed page can run
    const sandboxed = await browser.eval<string>(`window.r.iframe.getAttribute("sandbox")`);
    check("and the replay cannot run scripts", sandboxed === "allow-same-origin", `sandbox="${sandboxed}"`);
    const noScript = await browser.eval<number>(`window.r.iframe.contentDocument.querySelectorAll("script").length`);
    check("every script in it was neutralised", noScript === 0, `${noScript} <script> left`);

    // ---- the canvases, painted from out here the way the surface paints it
    //
    // The surface asks `framesAt` what every canvas should be showing at
    // the playhead and draws those pictures onto the elements the mirror
    // gives back. That is done here with the same two functions, against
    // a real Replayer, so what is under test is the mechanism and not a
    // description of it.
    // What the surface does, done here: put each due picture in an image
    // beside its canvas, carrying the canvas's attributes. Then measure
    // what a person would actually see — the rendered box — and not only
    // what is in memory. Measuring the bitmap is what let a replay in
    // which no canvas could render pass this check fifteen times.
    await browser.eval(`window.show = async function (frames) {
      var out = [];
      for (var i = 0; i < frames.length; i++) {
        var f = frames[i];
        var node = window.r.getMirror().getNode(f.nodeId);
        if (!node || node.tagName !== "CANVAS") { out.push({ nodeId: f.nodeId, why: "the mirror gave back no canvas" }); continue; }
        var doc = node.ownerDocument;
        var img = doc.querySelector('img[data-engelbart-frame="' + f.nodeId + '"]');
        if (!img) {
          img = doc.createElement("img");
          for (var a = 0; a < node.attributes.length; a++) {
            try { img.setAttribute(node.attributes[a].name, node.attributes[a].value); } catch (e) {}
          }
          img.setAttribute("data-engelbart-frame", String(f.nodeId));
          node.removeAttribute("id");
          node.style.display = "none";
          node.insertAdjacentElement("afterend", img);
        }
        if (img.getAttribute("src") !== f.dataUrl) {
          try {
            await new Promise(function (res, rej) { img.onload = res; img.onerror = function () { rej(new Error("the picture would not decode")); }; img.src = f.dataUrl; });
          } catch (e) { out.push({ nodeId: f.nodeId, why: e.message }); continue; }
        }
        await new Promise(function (res) { requestAnimationFrame(function () { requestAnimationFrame(res); }); });
        var box = img.getBoundingClientRect();
        // Colours are counted by drawing the same picture in THIS document,
        // where a canvas works, so the count says what the picture holds.
        var probe = document.createElement("canvas");
        probe.width = img.naturalWidth; probe.height = img.naturalHeight;
        var ctx = probe.getContext("2d");
        ctx.drawImage(img, 0, 0);
        var data = ctx.getImageData(0, 0, probe.width, probe.height).data;
        var colours = {}, sig = 0;
        for (var q = 0; q < data.length; q += 4 * 97) {
          colours[data[q] + "," + data[q + 1] + "," + data[q + 2]] = 1;
          sig = (sig * 31 + data[q] + data[q + 1] * 7 + data[q + 2] * 13) % 2147483647;
        }
        out.push({
          nodeId: f.nodeId, at: f.ms, w: Math.round(box.width), h: Math.round(box.height), sig: sig,
          colours: Object.keys(colours).length,
          nested: doc !== window.r.iframe.contentDocument,
          why: "",
        });
      }
      return out;
    }`);

    type Shown = { nodeId: number; at: number; w: number; h: number; sig: number; colours: number; nested: boolean; why: string };
    const duration = replayed.duration;
    // A fresh player opened straight at a moment, which is what clicking a
    // recording does. Nothing has been played, so nothing has been painted
    // along the way: whatever is on the canvases is what was put there now.
    const openAt = async (ms: number): Promise<Shown[]> => {
      await browser.eval(`(async function () {
        if (window.r) { try { window.r.destroy(); } catch (e) {} }
        document.getElementById("stage").replaceChildren();
        window.r = new rrwebReplay.Replayer(window.stream(), {
          root: document.getElementById("stage"), mouseTail: false, UNSAFE_replayCanvas: false,
        });
        window.r.pause(${Math.round(ms)});
        await new Promise(function (res) { setTimeout(res, 500); });
      })()`);
      return browser.eval<Shown[]>(`window.show(${JSON.stringify(framesAt(frames, ms))})`);
    };
    const moveTo = async (ms: number): Promise<Shown[]> => {
      await browser.eval(`(async function () {
        window.r.pause(${Math.round(ms)});
        await new Promise(function (res) { setTimeout(res, 400); });
      })()`);
      return browser.eval<Shown[]>(`window.show(${JSON.stringify(framesAt(frames, ms))})`);
    };
    // Two ways to fail and both have happened: a picture with one colour
    // in it, and a picture nothing can see. On screen means a real box.
    const lit = (shown: Shown[]) => shown.length > 0 && shown.every((c) => c.colours > 1 && c.w > 0 && c.h > 0);
    const say = (shown: Shown[]) => shown.map((c) => c.why ? `#${c.nodeId} ${c.why}` : `#${c.nodeId}${c.nested ? " (nested)" : ""} ${c.w}×${c.h} on screen, ${c.colours} colours`).join("; ") || "nothing due";
    const both = (shown: Shown[]) => shown.some((c) => c.nested) && shown.some((c) => !c.nested);

    // 1. Opened at a moment after both canvases had been drawn on.
    const loaded = await openAt(duration * 0.8);
    check("opened at a moment, both canvases are painted at once", lit(loaded) && both(loaded), say(loaded));

    // 2. Forward.
    const forward = await moveTo(duration * 0.95);
    check("seeking forward paints the frame due there", lit(forward) && both(forward), say(forward));

    // 3. Back — and to something different, not whatever was last drawn.
    const back = await moveTo(duration * 0.2);
    check("seeking back paints the frame due there", lit(back) && both(back), say(back));
    const moved = back.length === forward.length && back.every((c, i) => c.sig !== forward[i].sig);
    check("and it is that frame rather than the one already on the canvas", moved,
      `back ${back.map((c) => c.sig).join("/")} vs forward ${forward.map((c) => c.sig).join("/")}`);

    // 4. Playing, where the due frame has to keep changing on its own.
    await browser.eval(`window.r.play(${Math.round(duration * 0.2)})`);
    const during: Shown[][] = [];
    for (let i = 0; i < 4; i++) {
      await sleep(350);
      const now = await browser.eval<number>(`window.r.getCurrentTime()`);
      during.push(await browser.eval<Shown[]>(`window.show(${JSON.stringify(framesAt(frames, now))})`));
    }
    await browser.eval(`window.r.pause()`);
    const advanced = new Set(during.flat().map((c) => `${c.nodeId}@${c.at}`));
    check("playing keeps painting, and keeps advancing", during.every(lit) && advanced.size > during.length,
      `${advanced.size} distinct frames over ${during.length} reads`);

    // ---- why the surface listens for a rebuild
    //
    // Not a property of the system so much as the reason one line of it
    // exists: rrweb answers a seek it cannot replay forwards to by
    // building the document again, and the image standing in for a canvas
    // goes with it. The playhead can land on the same millisecond, so
    // nothing but rrweb saying so would tell the surface to make another.
    //
    // The one in the top document: the nested canvas does not exist at
    // time zero at all, because the frame holding it has not been
    // attached yet — its own reason the surface cannot show a picture once
    // and be done.
    const top = [...byNode.keys()].find((id) => loaded.find((c) => c.nodeId === id)?.nested === false);
    const fresh = await openAt(duration * 0.8);
    check("...and it was on screen before the rebuild", lit(fresh), say(fresh));
    const wiped = await browser.eval<{ replaced: boolean; before: number; after: number; why: string }>(`(async function () {
      function shownFor(id) {
        var node = window.r.getMirror().getNode(id);
        if (!node) return null;
        var img = node.ownerDocument.querySelector('img[data-engelbart-frame="' + id + '"]');
        return img ? Math.round(img.getBoundingClientRect().width) : 0;
      }
      var was = window.r.getMirror().getNode(${top});
      if (!was) return { replaced: false, before: -1, after: -1, why: "the mirror had no canvas to begin with" };
      var before = shownFor(${top});
      // Backwards, which rrweb cannot reach by replaying forwards, so it
      // builds the document again instead.
      window.r.pause(0);
      await new Promise(function (res) { setTimeout(res, 500); });
      var now = window.r.getMirror().getNode(${top});
      var after = shownFor(${top});
      return { replaced: now !== was, before: before, after: after === null ? 0 : after, why: "" };
    })()`);
    check("a rebuild takes the picture away with the document, which is what the surface watches for",
      wiped.replaced && wiped.before > 0 && wiped.after === 0,
      wiped.why || `${wiped.replaced ? "a new element" : "the same element"}, ${wiped.before}px wide on screen before and ${wiped.after} after`);

    // ---- the cursor, when there was one
    //
    // The page above moves a mouse and also emits one touch event, the way
    // a trackpad does. rrweb reads the touch and blanks the pointer for the
    // whole recording, which throws away most of what a replay is for.
    const touched = (stored.events as { type: number; data?: { source?: number; type?: number } }[])
      .some((e) => e.type === 3 && (e.data?.source === 6 || (e.data?.source === 2 && e.data?.type === 7)));
    check("the recording looks like a touchscreen to the replayer", touched,
      touched ? "a touch event is in the stream, as on a trackpad" : "no touch event, so this proves nothing");
    check("and it is still a recording somebody moved a mouse in", usedPointer(stored.events));
    const cursor = await browser.eval<{ classes: string; image: string; ring: string; dot: string }>(`(function () {
      var m = window.r.wrapper.querySelector(".replayer-mouse");
      if (!m) return { classes: "(no cursor element)", image: "", ring: "", dot: "" };
      // What the surface does, for the same reason.
      m.classList.remove("touch-device");
      var cs = getComputedStyle(m);
      return {
        classes: m.className,
        image: cs.backgroundImage === "none" ? "none" : "a cursor",
        ring: cs.borderColor,
        dot: getComputedStyle(m, "::after").opacity,
      };
    })()`);
    check("so the cursor is visible rather than blanked", cursor.image === "a cursor" && cursor.dot !== "0",
      `${cursor.classes || "(no classes)"} — ${cursor.image}, click dot opacity ${cursor.dot}`);

    // ---- and the reason none of this draws on a canvas any more
    //
    // Stated as a check because it is the whole shape of the solution: in
    // this iframe a canvas cannot show anything, so a replay that drew on
    // one would pass every test about pictures and show a white rectangle.
    const cannot = await browser.eval<{ canvas: string; fallback: string; image: string }>(`(function () {
      var d = window.r.iframe.contentDocument;
      var host = d.createElement("div");
      host.style.cssText = "position:absolute;left:-9999px;top:0";
      host.innerHTML = '<canvas width="600" height="300"></canvas><canvas width="600" height="300">FALLBACK TEXT</canvas><img width="600" height="40">';
      d.body.appendChild(host);
      var r = function (el) { var b = el.getBoundingClientRect(); return Math.round(b.width) + "×" + Math.round(b.height); };
      var out = { canvas: r(host.children[0]), fallback: r(host.children[1]), image: r(host.children[2]) };
      host.remove();
      return out;
    })()`);
    check("a canvas in the replay cannot render, and an image can",
      cannot.canvas !== "600×300" && cannot.image === "600×40",
      `a 600×300 canvas lays out at ${cannot.canvas}, one with fallback text at ${cannot.fallback} (it is rendering the words), an image at ${cannot.image}`);
  } finally {
    await browser.close();
    await gateway.close();
    await shell.close();
    await app.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
