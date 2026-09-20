// The browser bridge in a jsdom document. What must hold: interactions
// come out as generic DOM facts with a frame id and an interaction id,
// text-entry keystrokes never appear, same-origin requests carry the
// interaction header while others are untouched, visible changes after an
// interaction fold into one summary, and embedded frames are either
// attached or honestly reported as unavailable.
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";

const here = path.dirname(fileURLToPath(import.meta.url));
const BRIDGE = fs.readFileSync(path.join(here, "../../sandbox/trace/bridge.js"), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Objects made inside the jsdom window have that window's prototypes;
// deepEqual wants plain ones.
const plain = (v) => JSON.parse(JSON.stringify(v));

// A document with the bridge injected the way the gateway does it, and a
// fetch stub standing in for both the events endpoint and the application.
// Windows are closed after each test so their timers cannot keep the
// process alive.
const open = [];
afterEach(() => { while (open.length) open.pop().window.close(); });
async function load(body, { frameId = "f_parent01", url = "http://app.test/page?x=1", head = "" } = {}) {
  const dom = new JSDOM(`<!doctype html><html><head>${head}</head><body>${body}</body></html>`, { runScripts: "dangerously", url, virtualConsole: new VirtualConsole() });
  open.push(dom);
  const win = dom.window;
  await new Promise((r) => (win.document.readyState === "complete" ? r() : win.addEventListener("load", r)));
  const calls = [];
  win.fetch = (input, init = {}) => {
    const req = { url: typeof input === "string" ? input : input.href ?? input.url, method: init.method ?? "GET", headers: {}, body: init.body };
    const h = init.headers instanceof win.Headers ? init.headers : new win.Headers(init.headers ?? {});
    h.forEach((v, k) => { req.headers[k] = v; });
    calls.push(req);
    return Promise.resolve({ ok: true, status: 204 });
  };
  const script = win.document.createElement("script");
  script.dataset.frame = frameId;
  script.dataset.config = JSON.stringify({ flushMs: 5, keyFoldMs: 40, quietMs: 30, burstMaxMs: 400, attachGraceMs: 20, helloRetryMs: [0, 20], bogus: 1, textChars: "80" });
  script.textContent = BRIDGE;
  win.document.head.appendChild(script);
  const api = win.__engelbart;
  const batches = () => calls.filter((c) => c.url === "/__engelbart/events").map((c) => JSON.parse(c.body));
  // A mutation observer reports in a microtask, so give it one before posting.
  const events = async () => { await sleep(0); await api.flush(); await sleep(0); return batches().flatMap((b) => b.events); };
  const appCalls = () => calls.filter((c) => c.url !== "/__engelbart/events");
  return { dom, win, doc: win.document, api, calls, batches, events, appCalls };
}
const key = (win, target, init) => target.dispatchEvent(new win.KeyboardEvent("keydown", { bubbles: true, cancelable: true, composed: true, ...init }));
const click = (win, target) => target.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, composed: true, button: 0, detail: 1 }));
const ofKind = (events, kind) => events.filter((e) => e.kind === kind);

describe("install", () => {
  it("takes the gateway's frame id, announces the frame and stays out of the page's way", async () => {
    const { api, events, win } = await load("<canvas id=game width=500 height=600></canvas><form><textarea></textarea></form>");
    assert.equal(api.frameId, "f_parent01");
    assert.equal(Object.keys(win).includes("__engelbart"), false, "the API is not an enumerable global");
    const all = await events();
    const loaded = ofKind(all, "frame.loaded");
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].frameId, "f_parent01");
    assert.equal(loaded[0].data.url, "/page?…", "the query string's values stay out of the url");
    assert.deepEqual(loaded[0].data.query, { x: "1" });
    assert.equal(loaded[0].data.embedded, false);
    assert.equal(loaded[0].data.minted, "gateway");
    assert.equal(loaded[0].data.surfaces.counts.canvas, 1);
    assert.equal(loaded[0].data.surfaces.canvases[0].size, "500x600");
    assert.equal(loaded[0].data.surfaces.counts.textarea, 1);
  });
  it("mints its own id when the script tag carries none, and refuses a malformed one", async () => {
    const a = await load("", { frameId: "" });
    assert.match(a.api.frameId, /^f_[a-z0-9]{10}$/);
    const b = await load("", { frameId: "f_<script>" });
    assert.match(b.api.frameId, /^f_[a-z0-9]{10}$/);
  });
  it("installs once per window", async () => {
    const { win, api } = await load("");
    const again = win.document.createElement("script");
    again.textContent = BRIDGE;
    win.document.head.appendChild(again);
    assert.equal(win.__engelbart, api);
  });
});

describe("describe", () => {
  it("says what a person would call the element, with a selector that finds it again", async () => {
    const { api, doc } = await load(`
      <nav><a href="/docs/intro?ref=home#top" class="flex px-4 nav-link text-sm">Docs</a><a href="https://example.org/x?y=1">Out</a></nav>
      <div class="css-1x2y3z chat-panel"><button data-testid="send" class="btn primary" aria-label="Send message" type="submit"><svg></svg>Go</button></div>
      <ul><li>one</li><li><span id="pick-me">two</span></li></ul>`);
    const a = plain(api.describe(doc.querySelector("a")));
    assert.equal(a.tag, "a");
    assert.equal(a.text, "Docs");
    assert.equal(a.href, "/docs/intro?…#top");
    assert.deepEqual(a.classes, ["nav-link"], "utility classes are noise");
    assert.equal(api.describe(doc.querySelectorAll("a")[1]).href, "https://example.org/x?…");
    const b = plain(api.describe(doc.querySelector("button")));
    assert.equal(b.label, "Send message");
    assert.equal(b.testid, "send");
    assert.equal(b.type, "submit");
    assert.equal(b.text, "Go");
    assert.deepEqual(b.classes, ["btn", "primary"]);
    assert.equal(b.selector, "div.chat-panel > button.btn.primary");
    assert.equal(doc.querySelector(b.selector), doc.querySelector("button"));
    assert.equal(b.route, "/page?…");
    const li = api.describe(doc.querySelectorAll("li")[1]);
    assert.equal(li.selector, "ul > li:nth-of-type(2)");
    assert.equal(api.describe(doc.getElementById("pick-me")).selector, "#pick-me");
    assert.equal(api.describe(doc.body).tag, "body");
    assert.equal(api.describe(doc.body).selector, "body");
  });
  it("crosses an open shadow root", async () => {
    const { api, doc } = await load(`<my-widget id="w"></my-widget>`);
    const host = doc.getElementById("w");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<div><button>Inner</button></div>`;
    assert.equal(api.describe(root.querySelector("button")).selector, "#w >>> div > button");
  });
});

describe("keyboard policy", () => {
  const cases = (win, doc) => {
    const ta = doc.querySelector("textarea"), pw = doc.querySelector("input[type=password]"), ce = doc.querySelector("[contenteditable]"), editor = doc.querySelector(".cm-content"), body = doc.body, btn = doc.querySelector("button"), range = doc.querySelector("input[type=range]");
    return { ta, pw, ce, editor, body, btn, range };
  };
  it("never records printable keys on text-entry surfaces, and records control keys there by name", async () => {
    const { api, doc, win } = await load(`<textarea></textarea><input type=password><div contenteditable>x</div><div class="cm-editor"><div class="cm-content">y</div></div><button>b</button><input type=range>`);
    const k = (target, init) => { const r = api.classifyKey(new win.KeyboardEvent("keydown", init), target); return r === null ? null : plain(r); };
    const { ta, pw, ce, editor, body, btn, range } = cases(win, doc);
    assert.equal(k(ta, { key: "h" }), null);
    assert.equal(k(ta, { key: "H", shiftKey: true }), null);
    assert.equal(k(ta, { key: " " }), null);
    assert.equal(k(ta, { key: "Backspace" }), null, "editing keys are keystrokes too");
    assert.deepEqual(k(ta, { key: "Enter" }), { key: "Enter", class: "control", editable: "text" });
    assert.deepEqual(k(ta, { key: "Enter", shiftKey: true }), { key: "Shift+Enter", class: "control", editable: "text" });
    assert.deepEqual(k(ta, { key: "s", ctrlKey: true }), { key: "Ctrl+s", class: "chord", editable: "text" });
    assert.deepEqual(k(ta, { key: "Z", metaKey: true, shiftKey: true }), { key: "Meta+z", class: "chord", editable: "text" });
    assert.equal(k(ta, { key: "e", altKey: true }), null, "Alt+letter types characters on some keyboards");
    assert.equal(k(ce, { key: "a" }), null);
    assert.deepEqual(k(ce, { key: "Escape" }), { key: "Escape", class: "control", editable: "editor" });
    assert.equal(k(editor, { key: "a" }), null);
    assert.equal(k(editor, { key: "ArrowDown" }).editable, "editor");
    assert.equal(k(pw, { key: "a" }), null);
    assert.equal(k(pw, { key: "ArrowLeft" }), null, "not even navigation inside a password field");
    assert.deepEqual(k(pw, { key: "Enter" }), { key: "Enter", class: "control", editable: "password" });
    assert.equal(k(ta, { key: "Shift" }), null, "modifiers alone are not interactions");
    assert.equal(k(body, { key: "Control" }), null);
    assert.equal(k(ta, { key: "a", isComposing: true }), null);
    assert.equal(k(range, { key: "ArrowLeft" }).editable, null, "a slider is a control, not text entry");
    assert.deepEqual(k(btn, { key: "Enter" }), { key: "Enter", class: "control", editable: null });
  });
  it("records control keys by name and printable keys by class elsewhere", async () => {
    const { api, doc, win } = await load(`<canvas></canvas>`);
    const k = (target, init) => plain(api.classifyKey(new win.KeyboardEvent("keydown", init), target));
    assert.deepEqual(k(doc.body, { key: "ArrowLeft" }), { key: "ArrowLeft", class: "control", editable: null });
    assert.deepEqual(k(doc.body, { key: " " }), { key: "Space", class: "control", editable: null });
    assert.deepEqual(k(doc.body, { key: "Tab", shiftKey: true }), { key: "Shift+Tab", class: "control", editable: null });
    assert.deepEqual(k(doc.querySelector("canvas"), { key: "p" }), { key: "[printable]", class: "letter", editable: null });
    assert.deepEqual(k(doc.body, { key: "7" }), { key: "[printable]", class: "digit", editable: null });
    assert.deepEqual(k(doc.body, { key: "é" }), { key: "[printable]", class: "letter", editable: null });
    assert.deepEqual(k(doc.body, { key: "/" }), { key: "[printable]", class: "symbol", editable: null });
    assert.deepEqual(k(doc.body, { key: "r", ctrlKey: true }), { key: "Ctrl+r", class: "chord", editable: null });
  });
  it("folds repeats and quick identical presses into one event with a count, keeping the first timestamp", async () => {
    const { win, doc, events } = await load(`<canvas id=c></canvas><textarea></textarea>`);
    key(win, doc.body, { key: "ArrowLeft" });
    key(win, doc.body, { key: "ArrowLeft", repeat: true });
    key(win, doc.body, { key: "ArrowLeft", repeat: true });
    key(win, doc.body, { key: "ArrowUp" });
    key(win, doc.body, { key: " " });
    for (const ch of "hello") key(win, doc.body, { key: ch });
    for (const ch of "hello") key(win, doc.querySelector("textarea"), { key: ch });
    key(win, doc.querySelector("textarea"), { key: "Enter" });
    const all = await events();
    const keys = ofKind(all, "ui.key");
    assert.deepEqual(keys.map((e) => [e.data.key, e.data.class, e.data.count, e.data.repeat, e.data.target.tag]), [
      ["ArrowLeft", "control", 3, true, "body"], ["ArrowUp", "control", 1, false, "body"], ["Space", "control", 1, false, "body"],
      ["[printable]", "letter", 5, false, "body"], ["Enter", "control", 1, false, "textarea"],
    ]);
    assert.ok(keys[0].at <= keys[0].data.lastAt);
    assert.ok(keys.every((e) => /^i_parent01_\d+$/.test(e.interactionId)));
    assert.equal(new Set(keys.map((e) => e.interactionId)).size, 5, "one interaction id per emitted event");
    assert.equal(JSON.stringify(all).includes("hello"), false, "no character from the textarea anywhere in the batch");
  });
});

describe("interactions", () => {
  it("records a click with its target and the control around it", async () => {
    const { win, doc, events } = await load(`<button id="send" data-button-id="chat-submit"><span class="icon">➤</span><span>Send</span></button>`);
    click(win, doc.querySelector("#send span:last-child"));
    const [ev] = ofKind(await events(), "ui.click");
    assert.equal(ev.frameId, "f_parent01");
    assert.equal(ev.interactionId, "i_parent01_1");
    assert.equal(ev.data.target.tag, "span");
    assert.equal(ev.data.target.text, "Send");
    assert.equal(ev.data.control.id, "send");
    assert.equal(ev.data.control.text, "➤ Send");
    assert.equal(ev.data.trusted, false, "a synthetic click says so");
    assert.equal(typeof ev.data.target.rect.w, "number");
  });
  it("records a form submit with field names but never values", async () => {
    const { doc, events } = await load(`<form action="/chat?mode=x" method="post"><textarea name="message">my secret question</textarea><input name="email" value="a@b.c"><button type="submit" data-testid="go">Send</button></form>`);
    doc.querySelector("form").addEventListener("submit", (e) => e.preventDefault());
    doc.querySelector("form").requestSubmit(doc.querySelector("button"));
    const all = await events();
    const [ev] = ofKind(all, "ui.submit");
    assert.equal(ev.data.form.action, "/chat?…");
    assert.equal(ev.data.form.method, "post");
    assert.equal(ev.data.submitter.testid, "go");
    assert.deepEqual(ev.data.fields, [{ tag: "textarea", name: "message" }, { tag: "input", name: "email" }, { tag: "button", name: undefined, type: "submit" }].map((f) => JSON.parse(JSON.stringify(f))));
    const text = JSON.stringify(all);
    assert.equal(ev.data.form.text, "Send", "a form's visible text is its labels and buttons, never what was typed");
    assert.equal(text.includes("secret question"), false);
    assert.equal(text.includes("a@b.c"), false);
  });
  it("records committed control changes, and only the fact of a change for text", async () => {
    const { win, doc, events } = await load(`<select id=s><option>Tetris</option><option>Snake</option></select><input type=checkbox id=c><input type=range id=r min=0 max=10><input id=t placeholder="Name">`);
    const fire = (el) => el.dispatchEvent(new win.Event("change", { bubbles: true }));
    doc.getElementById("s").selectedIndex = 1; fire(doc.getElementById("s"));
    doc.getElementById("c").checked = true; fire(doc.getElementById("c"));
    doc.getElementById("r").value = "7"; fire(doc.getElementById("r"));
    doc.getElementById("t").value = "Ada Lovelace"; fire(doc.getElementById("t"));
    const inputs = ofKind(await events(), "ui.input");
    assert.deepEqual(inputs.map((e) => [e.data.kind, e.data.selected ?? e.data.checked ?? e.data.value ?? e.data.valueLength]), [["select", ["Snake"]], ["checkbox", true], ["range", "7"], ["text", 12]]);
    assert.equal(inputs[3].data.target.placeholder, "Name");
    assert.equal(JSON.stringify(inputs).includes("Lovelace"), false);
  });
  it("records that a person typed, without the characters, and never a password's length", async () => {
    // The committed-value handler above fires on blur with a changed
    // value, which a controlled component never produces: it clears the
    // box when the message is sent and focus never leaves. Without this
    // the one act that matters most in a text interface is invisible,
    // and a reading of the session says somebody was writing when all it
    // saw was a click into a field.
    const { win, doc, events } = await load(`<textarea placeholder="Say"></textarea><input id=p type=password><div id=e contenteditable>ab</div>`);
    const type = (el, value) => { el.value = value; el.dispatchEvent(new win.InputEvent("input", { bubbles: true, data: value.slice(-1), inputType: "insertText" })); };
    const field = doc.querySelector("textarea");
    for (const draft of ["c", "cr", "cre", "crea", "creat", "create"]) type(field, draft);
    // Sent with Return: the framework clears the box and focus stays put.
    key(win, field, { key: "Enter" });
    field.value = "";
    for (const draft of ["h", "hu"]) type(doc.getElementById("p"), draft);
    doc.getElementById("e").textContent = "abc";
    doc.getElementById("e").dispatchEvent(new win.InputEvent("input", { bubbles: true, inputType: "insertText" }));
    await sleep(60);
    const all = await events();
    const inputs = ofKind(all, "ui.input");
    assert.deepEqual(inputs.map((e) => [e.data.kind, e.data.editing === true, e.data.edits, e.data.valueLength]),
      [["text", true, 6, 6], ["password", true, 2, undefined], ["editor", true, 1, 3]]);
    assert.equal(inputs[0].data.target.placeholder, "Say");
    assert.equal(JSON.stringify(all).includes("create"), false, "the characters never leave the page");
    assert.equal(JSON.stringify(all).includes("hu"), false);
  });
  it("folds a run of edits to one field and starts again at the next", async () => {
    const { win, doc, events } = await load(`<input id=a placeholder=A><input id=b placeholder=B>`);
    const type = (id, v) => { const el = doc.getElementById(id); el.value = v; el.dispatchEvent(new win.InputEvent("input", { bubbles: true, inputType: "insertText" })); };
    type("a", "x"); type("a", "xy"); type("b", "q"); type("a", "xyz");
    await sleep(60);
    const inputs = ofKind(await events(), "ui.input");
    assert.deepEqual(inputs.map((e) => [e.data.target.placeholder, e.data.edits]), [["A", 2], ["B", 1], ["A", 1]]);
  });
  it("records route changes made through history and hashes", async () => {
    const { win, events } = await load(``);
    win.history.pushState({}, "", "/lesson/2?step=3");
    win.history.replaceState({}, "", "/lesson/2?step=4");
    win.location.hash = "#done";
    await sleep(10);
    const routes = ofKind(await events(), "ui.route");
    assert.deepEqual(routes.map((r) => [r.data.from, r.data.to, r.data.how]), [["/page?…", "/lesson/2?…", "push"], ["/lesson/2?…", "/lesson/2?…#done", "hash"]]);
    assert.equal(routes[0].interactionId, undefined, "no interaction to associate with");
  });
});

describe("network tagging", () => {
  it("adds the interaction header to same-origin requests only, within the window, and never to its own transport", async () => {
    const { win, doc, api, appCalls, batches } = await load(`<button>Go</button>`);
    await win.fetch("/api/before");
    click(win, doc.querySelector("button"));
    await win.fetch("/api/after", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    await win.fetch(new win.URL("/api/url-object", "http://app.test"));
    await win.fetch("https://cdn.example.org/lib.js");
    await win.fetch("/api/no-cors", { mode: "no-cors" });
    api.configure({ tagWindowMs: 0 });
    await sleep(2);
    await win.fetch("/api/late");
    const calls = Object.fromEntries(appCalls().map((c) => [c.url, c.headers["x-engelbart-interaction"] ?? null]));
    assert.deepEqual(calls, { "/api/before": null, "/api/after": "i_parent01_1", "http://app.test/api/url-object": "i_parent01_1", "https://cdn.example.org/lib.js": null, "/api/no-cors": null, "/api/late": null });
    assert.equal(appCalls()[1].headers["content-type"], "application/json", "existing headers survive");
    await api.flush();
    const transport = batches();
    assert.ok(transport.length >= 1);
    assert.equal(transport[0].frameId, "f_parent01");
    assert.equal(typeof transport[0].sentAt, "number");
  });
  it("treats an empty URL as the document itself, which is how Next.js posts a server action", async () => {
    const { win, doc, appCalls } = await load(`<form><textarea placeholder="Ask"></textarea></form>`);
    key(win, doc.querySelector("textarea"), { key: "Enter" });
    await win.fetch("", { method: "POST", headers: { "next-action": "a1b2", accept: "text/x-component" }, body: "[]" });
    const req = appCalls()[0];
    assert.equal(req.url, "", "the request itself is left as the framework made it");
    assert.equal(req.headers["x-engelbart-interaction"], "i_parent01_1");
    assert.equal(req.headers["next-action"], "a1b2");
  });
  it("tags XMLHttpRequest the same way", async () => {
    const { win, doc } = await load(`<button>Go</button>`);
    const set = [];
    const proto = win.XMLHttpRequest.prototype;
    proto.setRequestHeader = function (k, v) { set.push([k, v]); };
    const bridgedOpen = proto.open;
    proto.open = function (m, u) { set.push(["open", u]); return bridgedOpen.apply(this, arguments); };
    click(win, doc.querySelector("button"));
    const a = new win.XMLHttpRequest(); a.open("GET", "/api/x"); try { a.send(); } catch {}
    const b = new win.XMLHttpRequest(); b.open("GET", "https://other.test/x"); try { b.send(); } catch {}
    a.abort(); b.abort();
    assert.deepEqual(set, [["open", "/api/x"], ["x-engelbart-interaction", "i_parent01_1"], ["open", "https://other.test/x"]]);
  });
});

describe("what an application calls its own elements", () => {
  it("reads every test-harness attribute as one fact", async () => {
    const { doc, api } = await load(`<button data-cy=send>S</button><button data-qa=next>N</button><button data-e2e=go>G</button><button data-test-selector=stop>X</button>`);
    assert.deepEqual([...doc.querySelectorAll("button")].map((b) => api.describe(b).testid), ["send", "next", "go", "stop"]);
  });
  it("keeps an application's own identifier, by shape and not by name", async () => {
    // Applications that log their own clicks name the controls they care
    // about, and that name is the best one anything will ever have for
    // them. Every application invents its own attribute, so there is no
    // list to keep: what is general is that the name ends in "id".
    const { doc, api } = await load(
      `<button id=one data-button-id="reset-game">R</button>` +
      `<button id=two data-node-id="alpha.beta">N</button>` +
      `<button id=three data-id="pick">P</button>`);
    const id = (s) => api.describe(doc.getElementById(s)).appId;
    assert.deepEqual([id("one"), id("two"), id("three")], ["reset-game", "alpha.beta", "pick"]);
  });
  it("keeps which attribute the name came from, because the kind is not the instance", async () => {
    // data-cell-id="b7" and data-node-id="b7" are the same identifier
    // and not the same thing. In an interface made of many of something
    // the value is per-instance and useless as an anchor, while the
    // attribute is the author's own word for the category and is the
    // same on every one of them.
    const { doc, api } = await load(`<div id=a data-cell-id="b7">x</div><div id=b data-node-id="b7">y</div>`);
    const seen = ["a", "b"].map((s) => { const d = api.describe(doc.getElementById(s)); return [d.appIdAttr, d.appId]; });
    assert.deepEqual(seen, [["data-cell-id", "b7"], ["data-node-id", "b7"]]);
  });
  it("leaves state, content and anything private where it is", async () => {
    const { doc, api } = await load(
      `<div id=a data-row-id='{"user":"ada","email":"a@b.c"}'>x</div>` +
      `<div id=b data-user-id="a@b.c">x</div>` +
      `<div id=c data-order-id="0000123456">x</div>` +
      `<div id=d data-index="42">x</div>` +
      `<div id=e data-state="open">x</div>` +
      `<div id=f data-radix-collection-id="r1">x</div>` +
      `<div id=g data-note-id="a very long identifier that is really a sentence pretending to be one">x</div>`);
    const seen = ["a", "b", "c", "d", "e", "f", "g"].map((s) => api.describe(doc.getElementById(s)).appId);
    assert.deepEqual(seen, [undefined, undefined, undefined, undefined, undefined, undefined, undefined]);
  });
});

describe("visible change summaries", () => {
  it("folds the DOM changes after an interaction into one temporal ui.change", async () => {
    const { win, doc, events } = await load(`<main><div id="chat"><p>Hello</p></div><button>Ask</button></main>`);
    click(win, doc.querySelector("button"));
    const chat = doc.getElementById("chat");
    const p = doc.createElement("p"); p.textContent = "Thinking"; chat.appendChild(p);
    await sleep(5);
    p.firstChild.data = "Thinking about rotation";
    chat.querySelector("p").remove();
    await sleep(5);
    const answer = doc.createElement("div"); answer.innerHTML = "<b>Tip:</b> try the other way<script>var x=1</script>"; chat.appendChild(answer);
    const all = await events();
    await sleep(60);
    const changes = ofKind(await events(), "ui.change");
    assert.equal(changes.length, 1);
    const c = changes[0];
    assert.equal(c.interactionId, "i_parent01_1");
    assert.equal(c.correlation, "temporal");
    assert.equal(c.data.container.id, "chat");
    assert.deepEqual(c.data.removed, ["Hello"]);
    assert.deepEqual(c.data.added, ["Thinking about rotation", "Tip: try the other way"]);
    assert.ok(c.data.mutations >= 3);
    assert.equal(c.data.addedNodes, 2);
    assert.equal(c.data.removedNodes, 1);
    assert.equal(c.data.textChanges, 1);
    assert.equal(typeof c.data.sinceInteractionMs, "number");
    assert.equal(c.data.closed, "quiet");
    assert.ok(c.at <= c.data.lastMutationAt);
    assert.equal(JSON.stringify(all).includes("var x=1"), false, "script text is not visible text");
  });
  it("ignores changes with no interaction behind them, and dev overlays", async () => {
    const { win, doc, events } = await load(`<div id="a"></div><nextjs-portal></nextjs-portal><button>Go</button>`);
    doc.getElementById("a").textContent = "ticked by a timer";
    await sleep(60);
    assert.equal(ofKind(await events(), "ui.change").length, 0);
    click(win, doc.querySelector("button"));
    doc.querySelector("nextjs-portal").textContent = "1 error";
    await sleep(60);
    assert.equal(ofKind(await events(), "ui.change").length, 0);
  });
  it("names the regions a burst changed, not only the one element holding all of them", async () => {
    // The lowest common ancestor of a burst is the least specific true
    // answer there is: one repaint touching two unrelated panels reduces
    // both to whatever contains them, and a reading is left with two
    // texts, one container, and no way to say which panel said what.
    const { win, doc, events } = await load(
      `<main><section aria-label="Conversation"><div id=log></div></section>` +
      `<section aria-label="Requirements"><ul id=reqs></ul></section><button>Ask</button></main>`);
    click(win, doc.querySelector("button"));
    doc.getElementById("log").append(Object.assign(doc.createElement("p"), { textContent: "You identified the first step." }));
    doc.getElementById("reqs").append(Object.assign(doc.createElement("li"), { textContent: "Creating and Drawing the Board" }));
    await sleep(60);
    const c = ofKind(await events(), "ui.change")[0];
    assert.equal(c.data.container.tag, "main", "the container is still what it always was");
    assert.deepEqual(c.data.regions.map((r) => [r.target.id, r.added]), [
      ["log", ["You identified the first step."]],
      ["reqs", ["Creating and Drawing the Board"]],
    ]);
    // Several candidates, so a reading can anchor at whichever level of
    // the interface turns out to be the stable one.
    assert.deepEqual(c.data.regions.map((r) => r.within.map((w) => w.label ?? w.tag)), [
      ["Conversation", "main"], ["Requirements", "main"],
    ]);
    assert.equal(c.data.regions[0].target.rect, undefined, "where it was says nothing about which one it is");
  });
  it("degrades to what it can name when a panel is nothing but unlabelled divs", async () => {
    // An application that renders its panels as bare <div>s offers
    // nothing to anchor on, and no amount of walking up invents a name.
    // The honest answer is the one element that does say what it is —
    // which is exactly what the container said before — so this makes
    // such an interface no worse and never pretends otherwise.
    const { win, doc, events } = await load(`<main><div><div id=x></div></div><button>Ask</button></main>`);
    click(win, doc.querySelector("button"));
    doc.querySelector("#x > *, #x").append(Object.assign(doc.createElement("span"), { textContent: "some text arrived" }));
    await sleep(60);
    const c = ofKind(await events(), "ui.change")[0];
    assert.deepEqual(c.data.regions.map((r) => r.target.id ?? r.target.tag), ["x"]);
    assert.deepEqual(c.data.regions[0].within.map((w) => w.tag), ["main"]);
  });
  it("splits one burst per region, so two panels are never quoted as one voice", async () => {
    const { win, doc, events } = await load(`<main><div class="col"><div></div></div><button>Ask</button></main>`);
    click(win, doc.querySelector("button"));
    // Nothing between the text and <main> says anything at all.
    doc.querySelector(".col > div").append(Object.assign(doc.createElement("span"), { textContent: "arrived" }));
    await sleep(60);
    const c = ofKind(await events(), "ui.change")[0];
    assert.deepEqual(c.data.regions.map((r) => r.target.tag), ["main"], "no guess below it, so it says main and stops");
  });
  it("never quotes what a text field mirrors into its DOM, and counts a rerender instead of quoting it", async () => {
    const { win, doc, events } = await load(`<form><textarea placeholder="Say"></textarea></form><ul id="log"><li>create a board</li></ul><button>Go</button>`);
    const field = doc.querySelector("textarea");
    click(win, field);
    // A framework keeping the field's default value in step with the draft
    // replaces its text node on every keystroke.
    for (const draft of ["t", "th", "the", "they"]) { field.textContent = draft; await sleep(2); }
    await sleep(60);
    let all = await events();
    assert.equal(ofKind(all, "ui.change").length, 0, "what happens inside a text field is not a visible change");
    assert.equal(JSON.stringify(all).includes("they"), false);
    click(win, doc.querySelector("button"));
    const item = doc.querySelector("#log li"); const text = item.textContent;
    item.remove();
    const again = doc.createElement("li"); again.textContent = text; doc.getElementById("log").appendChild(again);
    const more = doc.createElement("li"); more.textContent = "Great start"; doc.getElementById("log").appendChild(more);
    await sleep(60);
    all = await events();
    const changes = ofKind(all, "ui.change");
    assert.equal(changes.length, 1);
    assert.deepEqual(changes[0].data.added, ["Great start"]);
    assert.deepEqual(changes[0].data.removed, []);
    assert.equal(changes[0].data.rerendered, 1);
    assert.equal(changes[0].interactionId, "i_parent01_2");
  });
  it("closes a long burst in parts under the same interaction", async () => {
    const { win, doc, api, events } = await load(`<div id="a"></div><button>Go</button>`);
    api.configure({ burstMaxMs: 60, quietMs: 30 });
    click(win, doc.querySelector("button"));
    const a = doc.getElementById("a");
    for (let i = 0; i < 8; i++) { a.appendChild(doc.createTextNode("t" + i)); await sleep(12); }
    await sleep(50);
    const changes = ofKind(await events(), "ui.change");
    assert.ok(changes.length >= 2, `expected parts, got ${changes.length}`);
    assert.deepEqual(changes.map((c) => c.data.part), changes.map((_, i) => i + 1));
    assert.ok(changes.every((c) => c.interactionId === "i_parent01_1"));
    assert.equal(changes[0].data.closed, "continued");
  });
});

describe("embedded frames", () => {
  it("answers a child's hello with where it sits", async () => {
    const { win, doc, api, events } = await load(`<section class="workspace"><iframe id="preview" name="solution" src="/sandbox/index.html?id=solution"></iframe></section>`);
    const iframe = doc.getElementById("preview");
    const replies = [];
    iframe.contentWindow.postMessage = (msg) => replies.push(msg);
    await sleep(30);
    win.dispatchEvent(new win.MessageEvent("message", { data: { engelbart: "bridge", v: 1, type: "hello", frameId: "f_child0001", url: "/sandbox/index.html?…" }, origin: win.location.origin, source: iframe.contentWindow }));
    assert.equal(replies.length, 1);
    assert.deepEqual(plain(replies[0]), { engelbart: "bridge", v: 1, type: "welcome", frameId: "f_child0001", parentFrameId: "f_parent01", selectorInParent: "#preview", name: "solution", frameKind: "document", depth: 1 });
    assert.deepEqual(plain(api.frames()), [{ frameId: "f_child0001", state: "self", selector: "#preview" }]);
    assert.equal(ofKind(await events(), "frame.attached").length, 0, "the child reports its own attachment");
    // A stranger's message and a stranger origin are ignored.
    win.dispatchEvent(new win.MessageEvent("message", { data: { engelbart: "bridge", v: 1, type: "hello", frameId: "f_evil00001" }, origin: "https://evil.test", source: iframe.contentWindow }));
    assert.equal(replies.length, 1);
  });
  it("as a child, says hello to its parent and reports the welcome", async () => {
    const { win, events, appCalls } = await load(`<iframe id="inner"></iframe>`, { frameId: "f_outer0001" });
    const inner = win.document.getElementById("inner");
    const posted = [];
    // The child document gets its own bridge, as the gateway would inject it.
    const cwin = inner.contentWindow, cdoc = inner.contentDocument;
    cwin.fetch = win.fetch;
    win.postMessage = (msg, origin) => posted.push([msg, origin]);
    const s = cdoc.createElement("script"); s.dataset.frame = "f_inner00001"; s.textContent = BRIDGE; cdoc.head.appendChild(s);
    cwin.__engelbart.configure({ flushMs: 5 });
    assert.equal(posted.length, 1);
    assert.equal(posted[0][0].type, "hello");
    assert.equal(posted[0][0].frameId, "f_inner00001");
    assert.equal(posted[0][1], "*", "an about:blank child has a null origin and cannot name its parent's");
    cwin.dispatchEvent(new cwin.MessageEvent("message", { data: { engelbart: "bridge", v: 1, type: "welcome", frameId: "f_inner00001", parentFrameId: "f_outer0001", selectorInParent: "#inner", frameKind: "blank", depth: 1 }, origin: win.location.origin, source: win }));
    await cwin.__engelbart.flush();
    await sleep(0);
    const all = await events();
    const attached = all.find((e) => e.kind === "frame.attached" && e.frameId === "f_inner00001");
    assert.ok(attached, "child reported frame.attached");
    assert.equal(attached.data.parentFrameId, "f_outer0001");
    assert.equal(attached.data.selectorInParent, "#inner");
    assert.equal(attached.data.instrumented, "self");
    assert.deepEqual(plain(cwin.__engelbart.parent()), { parentFrameId: "f_outer0001", depth: 1 });
    // The parent learns of the child's interactions: a request the parent
    // makes right after a click in the frame carries that click's id.
    cwin.postMessage = () => {};
    win.dispatchEvent(new win.MessageEvent("message", { data: posted[0][0], origin: win.location.origin, source: cwin }));
    click(cwin, cdoc.body);
    const activity = posted.map(([m]) => m).find((m) => m.type === "activity");
    assert.ok(activity, "the child told its parent");
    assert.equal(activity.frameId, "f_inner00001");
    assert.equal(activity.interactionId, "i_inner00001_1");
    win.dispatchEvent(new win.MessageEvent("message", { data: activity, origin: win.location.origin, source: cwin }));
    assert.equal(win.__engelbart.stats().latest.id, "i_inner00001_1");
    await win.fetch("/api/logClick", { method: "POST" });
    const logged = appCalls().find((c) => c.url === "/api/logClick");
    assert.equal(logged.headers["x-engelbart-interaction"], "i_inner00001_1");
    // A stranger claiming a frame's id is ignored.
    win.dispatchEvent(new win.MessageEvent("message", { data: { ...activity, interactionId: "i_inner00001_99", at: Date.now() + 5000 }, origin: win.location.origin, source: win }));
    assert.equal(win.__engelbart.stats().latest.id, "i_inner00001_1");
  });
  it("attaches to a same-origin frame that has no bridge of its own and reports its clicks under its own frame id", async () => {
    const { win, doc, api, events, appCalls } = await load(`<div class="stage"><iframe id="blank"></iframe></div>`);
    const iframe = doc.getElementById("blank");
    iframe.contentDocument.body.innerHTML = `<canvas id="c"></canvas><button id="b">Inside</button>`;
    await sleep(60);
    let all = await events();
    const attached = ofKind(all, "frame.attached");
    assert.equal(attached.length, 1);
    assert.equal(attached[0].data.instrumented, "parent-attached");
    assert.equal(attached[0].data.selectorInParent, "#blank");
    assert.equal(attached[0].data.frameKind, "blank");
    assert.equal(attached[0].data.depth, 1);
    const childId = attached[0].frameId;
    assert.match(childId, /^f_[a-z0-9]{10}$/);
    assert.equal(iframe.contentWindow.__engelbart.frameId, childId);
    click(win, iframe.contentDocument.getElementById("b"));
    key(win, iframe.contentDocument.body, { key: "ArrowLeft" });
    all = await events();
    const inside = all.filter((e) => e.frameId === childId);
    assert.deepEqual(inside.map((e) => e.kind), ["frame.attached", "frame.loaded", "ui.click", "ui.key"]);
    assert.equal(inside[2].data.target.id, "b");
    assert.equal(inside[3].data.key, "ArrowLeft");
    assert.match(inside[2].interactionId, new RegExp(`^i_${childId.slice(2)}_1$`));
    assert.equal(api.stats().latest.id, `i_${childId.slice(2)}_2`, "the parent counts the frame's interactions as the latest");
    await win.fetch("/api/from-parent", { method: "POST" });
    assert.equal(appCalls().find((c) => c.url === "/api/from-parent").headers["x-engelbart-interaction"], `i_${childId.slice(2)}_2`);
    iframe.remove();
    all = await events();
    const removed = ofKind(all, "frame.removed");
    assert.equal(removed.length, 1);
    assert.equal(removed[0].data.childFrameId, childId);
    assert.equal(api.frames().length, 0);
  });
  it("reports a frame it cannot reach, once, with the reason", async () => {
    const { doc, events } = await load(`<iframe id="far" src="https://other.test/embed?token=abc" title="Far away"></iframe><iframe id="boxed" sandbox="allow-scripts" src="/x"></iframe>`);
    for (const id of ["far", "boxed"]) {
      Object.defineProperty(doc.getElementById(id), "contentDocument", { get() { throw new Error("SecurityError"); } });
    }
    await sleep(60);
    const found = ofKind(await events(), "frame.discovered");
    assert.deepEqual(found.map((e) => [e.data.selectorInParent, e.data.reason, e.data.src, e.data.name, e.data.instrumented]), [
      ["#far", "cross-origin", "https://other.test/embed?…", "far", false], ["#boxed", "sandboxed", "/x", "boxed", false],
    ]);
    assert.equal(JSON.stringify(found).includes("abc"), false);
  });
});
