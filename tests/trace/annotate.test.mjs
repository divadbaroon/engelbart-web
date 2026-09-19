// Annotate mode in a jsdom document. What must hold: the control channel
// opens only for the origin the gateway named, the picker names the
// element a person would call the thing rather than the wrapper it sits
// in, the application never sees the click that placed the note, and
// nothing the picker does reaches the trace.
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole, requestInterceptor } from "jsdom";

const here = path.dirname(fileURLToPath(import.meta.url));
const BRIDGE = fs.readFileSync(path.join(here, "../../sandbox/trace/bridge.js"), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Arrays made inside the jsdom window have that window's prototypes.
const WORKSPACE = "https://engelbart.test";

const open = [];
afterEach(() => { while (open.length) open.pop().window.close(); });

// The preview document as the workspace sees it: a real document on the
// sandbox's origin, inside a frame, with a window above it standing in
// for the workspace shell. It is served through a loader rather than
// written into an about:blank frame because the origin is the whole
// question here, and jsdom gives a blank frame an opaque one. jsdom gives
// a posted message no source and no origin, so the shell's messages are
// dispatched with both set: those two fields are all the channel reads.
async function preview(body, { parentOrigin = WORKSPACE, head = "" } = {}) {
  const page = `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
  const serve = requestInterceptor((request) =>
    request.url === "http://app.test/page" ? new Response(page, { headers: { "Content-Type": "text/html" } }) : new Response("", { status: 404 }));
  const dom = new JSDOM(`<!doctype html><html><body><iframe src="http://app.test/page"></iframe></body></html>`, {
    runScripts: "dangerously", url: `${WORKSPACE}/`, resources: { interceptors: [serve] }, virtualConsole: new VirtualConsole(),
  });
  open.push(dom);
  const shell = dom.window;
  await new Promise((r) => (shell.document.readyState === "complete" ? r() : shell.addEventListener("load", r)));
  const frame = shell.document.querySelector("iframe");
  await new Promise((r) => (frame.contentDocument && frame.contentDocument.body && frame.contentDocument.location.href.endsWith("/page") ? r() : frame.addEventListener("load", r, { once: true })));
  const win = frame.contentWindow;
  const doc = frame.contentDocument;
  assert.equal(doc.location.origin, "http://app.test", "the preview is a real document on the sandbox's origin");

  const calls = [];
  win.fetch = (input, init = {}) => { calls.push({ url: typeof input === "string" ? input : input.href ?? input.url, body: init.body }); return Promise.resolve({ ok: true, status: 204 }); };
  const script = doc.createElement("script");
  script.dataset.frame = "f_preview01";
  script.dataset.config = JSON.stringify({ flushMs: 5, parentOrigin });
  script.textContent = BRIDGE;
  doc.head.appendChild(script);
  const api = win.__engelbart;

  // What the page sends up. The shell's window receives it; jsdom does
  // not police targetOrigin, so the assertions are about the content.
  const up = [];
  shell.addEventListener("message", (e) => { if (e.data && e.data.engelbart === "annotate") up.push(e.data); });

  const down = (msg, { origin = WORKSPACE, source = shell } = {}) =>
    win.dispatchEvent(new win.MessageEvent("message", { data: { engelbart: "annotate", v: 1, dir: "down", ...msg }, origin, source }));

  const events = async () => { await sleep(0); await api.flush(); await sleep(0); return calls.filter((c) => c.url === "/__engelbart/events").flatMap((c) => JSON.parse(c.body).events); };
  const point = (type, target, init = {}) => target.dispatchEvent(new win.MouseEvent(type, { bubbles: true, cancelable: true, composed: true, button: 0, detail: 1, ...init }));
  return { dom, shell, win, doc, api, up, down, events, point, frame };
}

describe("the annotate control channel", () => {
  it("opens only for the origin the gateway named", async () => {
    const { api, down, up } = await preview("<button id=go>Go</button>");
    down({ type: "mode", on: true }, { origin: "https://evil.test" });
    await sleep(0);
    assert.equal(api.annotate().active, false, "another origin cannot turn the picker on");
    assert.equal(up.length, 0);

    down({ type: "mode", on: true });
    await sleep(0);
    assert.equal(api.annotate().active, true);
    assert.equal(up[0].type, "ready");
    assert.equal(up[0].frame.frameId, "f_preview01");
    assert.equal(up[0].route, "/page");
  });
  it("stays shut when no origin was configured", async () => {
    const { api, down } = await preview("<button>Go</button>", { parentOrigin: "" });
    down({ type: "mode", on: true });
    await sleep(0);
    assert.equal(api.annotate().active, false, "with no parentOrigin the bridge only observes");
  });
  it("takes only the window that embeds this one", async () => {
    const { api, down, win } = await preview("<button>Go</button>");
    down({ type: "mode", on: true }, { source: win });
    await sleep(0);
    assert.equal(api.annotate().active, false);
  });
  it("leaves on Escape, and says so", async () => {
    const { api, down, up, win, doc } = await preview("<button>Go</button>");
    down({ type: "mode", on: true });
    await sleep(0);
    doc.body.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true, composed: true }));
    await sleep(0);
    assert.equal(api.annotate().active, false);
    assert.equal(up[up.length - 1].type, "exited");
  });
});

describe("what the picker names", () => {
  it("names the control, not what is drawn inside it", async () => {
    const { api, doc } = await preview('<button id="go"><span class="icon">▶</span><span>Play</span></button>');
    const span = doc.querySelector(".icon");
    assert.equal(api.annotatableAt(span).id, "go");
  });
  it("names a canvas as itself: a DOM element, and nothing about what it draws", async () => {
    const { api, doc } = await preview('<div class="board"><canvas id="solution" width="300" height="600"></canvas></div>');
    const canvas = doc.querySelector("canvas");
    const picked = api.annotatableAt(canvas);
    assert.equal(picked, canvas);
    const d = api.describe(picked);
    assert.equal(d.tag, "canvas");
    assert.equal(d.size, "300x600");
    assert.equal(d.text, undefined, "nothing inside a canvas is text a person could have seen");
  });
  it("walks past a wrapper that says nothing, and stops at the first thing that does", async () => {
    const { api, doc } = await preview('<section class="tutor"><div class="flex items-center"><div><em id="why">Because…</em></div></div></section>');
    // <em> has no role, no label, no stable class of its own — but it has
    // a stable id, so it is the thing being pointed at.
    assert.equal(api.annotatableAt(doc.querySelector("em")).id, "why");
    // A bare wrapper with only utility classes is not an answer; the
    // section that names the region is.
    const wrapper = doc.querySelector(".flex");
    assert.equal(api.annotatableAt(wrapper).localName, "section");
    assert.deepEqual([...api.describe(api.annotatableAt(wrapper)).classes], ["tutor"], "and it is named by the class that is its own, not by the layout around it");
  });
  it("gives back the element itself when nothing above it says anything", async () => {
    const { api, doc } = await preview("<div><div><i></i></div></div>");
    const i = doc.querySelector("i");
    assert.equal(api.annotatableAt(i), i, "an ancestor chosen for being nearby would be a guess");
  });
});

describe("placing a note", () => {
  it("reports the element, its ancestors and its frame, and keeps the click from the application", async () => {
    const { doc, down, up, point } = await preview('<main><section class="tutor" aria-label="Tutor"><p data-testid="advice">Inspect the Solution.</p></section></main>');
    down({ type: "mode", on: true });
    await sleep(0);
    const p = doc.querySelector("p");
    let reachedApp = false;
    doc.addEventListener("click", () => { reachedApp = true; });
    const notPrevented = point("click", p);
    await sleep(0);

    assert.equal(reachedApp, false, "the application does not get the click that placed the note");
    assert.equal(notPrevented, false, "and its default was prevented");
    const picked = up.find((m) => m.type === "picked");
    assert.equal(picked.anchor.element.tag, "p");
    assert.equal(picked.anchor.element.testid, "advice");
    assert.equal(picked.anchor.element.text, "Inspect the Solution.");
    assert.deepEqual([...picked.anchor.ancestors].map((a) => a.tag), ["section", "main"]);
    assert.equal(picked.anchor.ancestors[0].label, "Tutor");
    assert.equal(picked.anchor.ancestors[0].rect, undefined, "where an ancestor was on screen says nothing about which one it is");
    assert.equal(picked.anchor.frame.frameId, "f_preview01");
    assert.equal(picked.anchor.frame.depth, 0);
    assert.deepEqual([...picked.anchor.frame.path], [], "the top preview document is not inside anything");
    assert.equal(picked.label, "Inspect the Solution.");
  });
  it("records none of it in the trace", async () => {
    const { doc, down, events, point } = await preview("<button id=go>Go</button>");
    down({ type: "mode", on: true });
    await sleep(0);
    point("click", doc.querySelector("#go"));
    const recorded = await events();
    assert.equal(recorded.filter((e) => e.kind === "ui.click").length, 0, "placing a note is not something the person did in the application");
  });
  it("draws an outline the trace ignores", async () => {
    const { api, doc, down, events, win } = await preview("<button id=go>Go</button>");
    down({ type: "mode", on: true });
    await sleep(0);
    doc.querySelector("#go").dispatchEvent(new win.MouseEvent("pointermove", { bubbles: true, cancelable: true, composed: true }));
    await sleep(20);
    assert.equal(api.annotate().hovering, "#go");
    const host = doc.querySelector("[data-engelbart]");
    assert.ok(host, "the overlay is in the page");
    assert.equal(host.style.pointerEvents, "none", "and never takes a pointer");

    // Leaving annotate mode takes it away again, and even a click on it
    // while it is there is not a thing the person did.
    doc.body.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, composed: true }));
    const recorded = await events();
    assert.equal(recorded.filter((e) => e.kind === "ui.click").length, 0);
  });
  it("puts the outline away when the picker is turned off", async () => {
    const { api, doc, down } = await preview("<button id=go>Go</button>");
    down({ type: "mode", on: true });
    await sleep(0);
    down({ type: "mode", on: false });
    await sleep(0);
    assert.equal(api.annotate().active, false);
    assert.equal(doc.querySelector("[data-engelbart]"), null);
  });
});

describe("finding an annotated element again", () => {
  const anchor = (element, ancestors = []) => ({ element, ancestors });

  it("takes a test id, a stable id or the selector, in that order", async () => {
    const { api } = await preview('<main><p id="advice" data-testid="advice" class="tutor">Inspect the Solution.</p></main>');
    const first = api.resolveAnnotation(anchor({ tag: "p", testid: "advice", text: "Inspect the Solution." }));
    assert.equal(first.confidence, "resolved");
    assert.equal(first.matchedOn, "testid");
    assert.equal(first.changed, null);
    assert.equal(first.selector, "#advice");
    assert.equal(api.resolveAnnotation(anchor({ tag: "p", id: "advice", text: "Inspect the Solution." })).matchedOn, "id");
    assert.equal(api.resolveAnnotation(anchor({ tag: "p", selector: "main > p.tutor", text: "Inspect the Solution." })).matchedOn, "selector");
  });
  it("calls it approximate when the handle still points at it but what it says has changed", async () => {
    const { api } = await preview('<main><p data-testid="advice">Try the other rotation.</p></main>');
    const got = api.resolveAnnotation(anchor({ tag: "p", testid: "advice", text: "Inspect the Solution." }));
    assert.equal(got.confidence, "approximate");
    assert.equal(got.changed, "text");
  });
  it("refuses a handle that survived on something else", async () => {
    const { api } = await preview('<main><button id="advice">Go</button></main>');
    assert.equal(api.resolveAnnotation(anchor({ tag: "p", id: "advice", text: "Inspect the Solution." })).confidence, "unresolved", "the id is there, but not on a <p>");
  });
  it("crosses a shadow boundary the way the selector was written", async () => {
    const { api, doc } = await preview('<div id="host"></div>');
    const root = doc.querySelector("#host").attachShadow({ mode: "open" });
    root.innerHTML = '<section class="panel"><p>Inside</p></section>';
    const got = api.resolveAnnotation(anchor({ tag: "p", selector: "#host >>> section.panel > p", text: "Inside" }));
    assert.equal(got.confidence, "resolved", '"host >>> rest" is not a querySelector string; each hop is resolved in the root before it');
  });
  it("finds it by what it is and what it says when the selector no longer matches", async () => {
    const { api } = await preview('<main><section class="tutor"><div><p>Inspect the Solution.</p></div></section></main>');
    const got = api.resolveAnnotation(anchor({ tag: "p", selector: "main > p", text: "Inspect the Solution." }, [{ tag: "section", classes: ["tutor"] }, { tag: "main" }]));
    assert.equal(got.confidence, "approximate");
    assert.equal(got.matchedOn, "candidate");
    assert.equal(got.selector, "main > section.tutor > div > p");
  });
  it("leaves it unresolved rather than attaching it to something nearby", async () => {
    const { api } = await preview('<main><p>Something else entirely.</p><p>And another.</p></main>');
    assert.equal(api.resolveAnnotation(anchor({ tag: "p", selector: "main > p", text: "Inspect the Solution." })).confidence, "unresolved");

    const two = await preview('<ul><li><span class="score">0</span></li><li><span class="score">0</span></li></ul>');
    const tie = two.api.resolveAnnotation(anchor({ tag: "span", selector: "ul > li:nth-of-type(3) > span", text: "0", classes: ["score"] }));
    assert.equal(tie.confidence, "unresolved", "two elements that look the same are not an answer");
  });
  it("says nothing about an element it was given nothing to find", async () => {
    const { api } = await preview("<main></main>");
    assert.equal(api.resolveAnnotation(anchor({})).confidence, "unresolved");
    assert.equal(api.resolveAnnotation(null).confidence, "unresolved");
  });
});

describe("markers", () => {
  it("draws one per note it found, and none for a note it did not", async () => {
    const { api, doc, down, up } = await preview('<main><p data-testid="advice">Inspect the Solution.</p><p>Other.</p></main>');
    down({ type: "show", items: [
      { id: "a1", anchor: { element: { tag: "p", testid: "advice", text: "Inspect the Solution." } } },
      { id: "a2", anchor: { element: { tag: "h1", text: "Gone" } } },
    ] });
    await sleep(0);
    assert.equal(api.annotate().markers, 1, "nothing is drawn where the element was not found");
    const resolved = up.find((m) => m.type === "resolved");
    assert.deepEqual([...resolved.items].map((i) => [i.id, i.confidence]), [["a1", "resolved"]], "and only what was found is reported");
    // The overlay's shadow root is closed, so the page — and this test —
    // can see the host and nothing inside it. That is the point of it.
    const host = doc.querySelector("[data-engelbart]");
    assert.ok(host, "the overlay is in the page");
    assert.equal(host.shadowRoot, null, "and what it draws is not the page's to read or change");
  });
  it("keeps its own clicks while the picker has the pointer, and is never a target itself", async () => {
    const { api, doc, down, up, win, point } = await preview('<main><p data-testid="advice">Inspect the Solution.</p></main>');
    down({ type: "show", items: [{ id: "a1", anchor: { element: { tag: "p", testid: "advice", text: "Inspect the Solution." } } }] });
    down({ type: "mode", on: true });
    await sleep(0);
    // A marker lives inside the closed root, so what is reachable from
    // out here is the host it sits in: a click that arrives through it is
    // Engelbart's own and the picker lets it past untouched.
    const host = doc.querySelector("[data-engelbart]");
    const notPrevented = point("click", host);
    await sleep(0);
    assert.equal(notPrevented, true, "the picker does not swallow a click on its own overlay");
    assert.equal(up.filter((m) => m.type === "picked").length, 0, "and nothing about the overlay is annotated");
    assert.equal(api.annotate().active, true, "the picker is still armed");
    doc.body.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true, composed: true }));
  });
  it("takes them away when the workspace sends none", async () => {
    const { api, doc, down } = await preview('<main><p data-testid="advice">Inspect.</p></main>');
    down({ type: "show", items: [{ id: "a1", anchor: { element: { tag: "p", testid: "advice", text: "Inspect." } } }] });
    await sleep(0);
    down({ type: "show", items: [] });
    await sleep(0);
    assert.equal(api.annotate().markers, 0);
    assert.equal(doc.querySelector("[data-engelbart]"), null, "and with neither markers nor picker the overlay leaves the page");
  });
});
