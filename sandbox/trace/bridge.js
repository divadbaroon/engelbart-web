// Engelbart browser bridge: a generic observer of what a person does in a
// served document. The preview gateway injects it into every HTML document
// it proxies (top-level pages and the iframes they embed alike), each with
// a frame id minted by the gateway. The bridge reports meaningful
// interactions (clicks, submits, committed control changes, control keys,
// frame activation, route changes), the frame's identity and its relation
// to the frame that embeds it, and a short summary of what visibly changed
// after each interaction. It posts batches to the gateway on its own
// origin, which stamps them with the run they belong to.
//
// What it never does: record pointer movement, printable keystrokes on any
// text-entry surface, field values, DOM snapshots, or anything specific to
// one application. Every observation is a DOM fact (tag, role, visible
// text, selector, frame) that a later interpretation layer can read.
//
// The only footprints on the page: one listener per event type on the
// document, a wrapped fetch/XMLHttpRequest that adds an x-engelbart-
// interaction header to same-origin requests, patched history.pushState/
// replaceState that also emit a route event, one MutationObserver, and a
// non-enumerable window.__engelbart for the frame protocol and tests.
//
// One more, and only while the workspace asks for it: annotate mode adds
// a picker — listeners that take the pointer and an outline drawn in a
// closed shadow root — so a researcher can point at an element and write
// a note about it. It observes nothing, records nothing and posts nothing
// to the gateway; it is off until an embedding window whose origin is
// config.parentOrigin turns it on, and it leaves no listener behind when
// it is turned off.
(function () {
  "use strict";
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.__engelbart) { debug("already installed in this frame"); return; }

  var VERSION = 1;
  var ENDPOINT = "/__engelbart/events";
  var config = {
    keyFoldMs: 800,       // identical keys this close together fold into one event with a count
    quietMs: 700,         // a change summary closes after this much DOM silence
    burstMaxMs: 10000,    // ...or after this long, continuing in a new part
    armMs: 45000,         // mutations count as "after the interaction" for this long
    settleMs: 5000,       // ...and for this long after a tagged request settles
    tagWindowMs: 10000,   // requests started this soon after an interaction carry its id
    flushMs: 250,         // batch debounce
    batchEvents: 50, batchBytes: 48 * 1024, eventBytes: 4 * 1024, maxQueue: 500,
    textChars: 80, sampleChars: 200, sampleNodes: 40,
    helloRetryMs: [0, 250, 1000, 3000],
    attachGraceMs: 400,   // how long the parent waits for an embedded frame to say hello after it loads
    // The one origin allowed to turn annotate mode on in this document.
    // Empty — the default — means the control channel never opens and the
    // bridge only observes, as it always has. The gateway sets it per run
    // from ENGELBART_BRIDGE_CONFIG.
    parentOrigin: "",
  };

  function debug() {
    try { console.debug.apply(console, ["[browser-bridge]"].concat([].slice.call(arguments))); } catch { /* no console */ }
  }
  function safely(fn) {
    return function () { try { return fn.apply(this, arguments); } catch (err) { debug("listener failed:", err && err.message); } };
  }
  var ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
  function randomId(prefix, length) {
    var bytes = new Uint8Array(length);
    try { window.crypto.getRandomValues(bytes); } catch { for (var j = 0; j < length; j++) bytes[j] = Math.floor(Math.random() * 256); }
    var out = "";
    for (var i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
    return prefix + out;
  }
  var collapse = function (s) { return String(s || "").replace(/\s+/g, " ").trim(); };
  function cap(s, max) { s = collapse(s); return s.length > max ? s.slice(0, max - 1) + "…" : s; }
  function cssEscape(s) { try { return CSS.escape(s); } catch { return String(s).replace(/([^\w-])/g, "\\$1"); } }

  // ---- URLs: never a query string's values, never another origin's path
  // beyond its host, never credentials.
  function safeUrl(href, base, loc) {
    var u;
    loc = loc || location;
    try { u = new URL(href, base || loc.href); } catch { return null; }
    if (u.protocol === "about:" || u.protocol === "blob:" || u.protocol === "data:") return u.protocol + (u.protocol === "data:" ? "…" : u.pathname.slice(0, 40));
    var same = u.origin === loc.origin;
    var out = (same ? "" : u.origin) + u.pathname + (u.search ? "?…" : "") + (u.hash && same ? cap(u.hash, 40) : "");
    return out;
  }
  // The query's parameter names, and short values that don't look secret:
  // an embedded document's "?id=solution" is the best generic evidence of
  // what it is, while "?token=…" stays out.
  var SECRET_PARAM = /token|key|secret|auth|password|passwd|session|sig|credential|cookie|bearer/i;
  function queryParams(search) {
    var out = {}; var n = 0;
    try {
      new URLSearchParams(search).forEach(function (value, name) {
        if (n++ >= 8) return;
        out[cap(name, 32)] = SECRET_PARAM.test(name) || value.length > 48 ? "[omitted]" : value;
      });
    } catch { /* not parseable */ }
    return n ? out : undefined;
  }
  function route(loc) {
    loc = loc || location;
    return loc.pathname + (loc.search ? "?…" : "") + (loc.hash ? cap(loc.hash, 40) : "");
  }
  function locationOf(node) {
    try { var v = node && node.ownerDocument ? node.ownerDocument.defaultView : node && node.defaultView; return v && v.location ? v.location : location; } catch { return location; }
  }

  // ---- Element descriptions: what a person would call the thing.
  var GENERATED_CLASS = /\d{3,}|^(css|sc|jsx|emotion|chakra|mui|Mui|_)[-_]|^[a-zA-Z]{1,2}[-_][a-z0-9]{5,}$|[-_][a-z0-9]{6,}$|^[a-z]+_[a-z0-9]{5,}$/;
  var UTILITY_CLASS = /^(!?-?(flex|grid|block|inline|hidden|relative|absolute|fixed|sticky|static|container|truncate|sr-only|group|peer|w|h|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|space|text|bg|border|rounded|shadow|font|items|justify|self|place|content|overflow|min|max|top|left|right|bottom|inset|z|opacity|transition|duration|ease|delay|animate|cursor|select|pointer|outline|ring|leading|tracking|whitespace|break|list|order|col|row|basis|grow|shrink|object|aspect|size|divide|backdrop|blur|scale|rotate|translate|origin|resize|scroll|snap|touch|will|fill|stroke|decoration|underline|uppercase|lowercase|capitalize|italic|antialiased|tabular)(-|$)|(hover|focus|active|disabled|dark|sm|md|lg|xl|2xl|group-hover|peer-focus|first|last|odd|even):)/;
  function usefulClasses(el, max) {
    var out = [];
    var list = el.classList ? el.classList : [];
    for (var i = 0; i < list.length && out.length < max; i++) {
      var c = list[i];
      if (c.length > 40 || GENERATED_CLASS.test(c) || UTILITY_CLASS.test(c)) continue;
      out.push(c);
    }
    return out;
  }
  var GOOD_ID = /^[A-Za-z_][\w-]{0,47}$/;
  function goodId(el) { var id = el.id; return typeof id === "string" && GOOD_ID.test(id) && !/\d{4,}/.test(id) ? id : null; }
  function rootOf(node) { return node.getRootNode ? node.getRootNode() : document; }
  // A CSS path that finds the element again in its document: an id when it
  // has a stable one, otherwise tag, stable classes and position, up to
  // eight levels. Crossing an open shadow root is written as "host >>> …".
  function selectorFor(el) {
    var parts = [];
    var node = el;
    for (var depth = 0; node && node.nodeType === 1 && depth < 8; depth++) {
      var name = node.localName;
      if (name === "html" || name === "body") { if (!parts.length) parts.unshift(name); break; }
      var id = goodId(node);
      var root = rootOf(node);
      if (id) {
        parts.unshift("#" + cssEscape(id));
        var matches = 1;
        try { matches = root.querySelectorAll("#" + cssEscape(id)).length; } catch { /* keep going */ }
        if (matches === 1) break;
      } else {
        var part = name;
        var classes = usefulClasses(node, 2);
        if (classes.length) part += "." + classes.map(cssEscape).join(".");
        var parent = node.parentNode;
        if (parent && parent.nodeType === 1) {
          var same = 0, index = 0;
          for (var c = parent.firstElementChild; c; c = c.nextElementSibling) {
            if (c.localName === name) { same++; if (c === node) index = same; }
          }
          if (same > 1) part += ":nth-of-type(" + index + ")";
        }
        parts.unshift(part);
      }
      var up = node.parentNode;
      if (up && up.nodeType === 11 && up.host) return selectorFor(up.host) + " >>> " + parts.join(" > ");
      node = up && up.nodeType === 1 ? up : null;
    }
    return parts.join(" > ");
  }
  // Text a person can see, never text a person typed: the walk skips
  // scripts and styles, hidden subtrees, and every text-entry surface
  // (inputs, textareas, selects, editors), whose contents are the
  // person's, not the page's.
  var SKIP_TEXT = /^(script|style|noscript|template|textarea|select|input|option|datalist)$/;
  function opaque(el) {
    return SKIP_TEXT.test(el.localName) || el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true" || !!editableKind(el);
  }
  function visibleText(node, max) {
    if (!node) return "";
    if (node.nodeType === 3) {
      var parent = node.parentElement;
      if (!parent) return cap(node.data, max);
      for (var a = parent; a; a = a.parentElement) if (SKIP_TEXT.test(a.localName) || a.hasAttribute("hidden")) return "";
      return editableKind(parent) ? "" : cap(node.data, max);
    }
    if (node.nodeType !== 1 || opaque(node)) return "";
    var out = "";
    try {
      var walker = node.ownerDocument.createTreeWalker(node, 5, { acceptNode: function (n) { return n.nodeType === 1 ? (opaque(n) ? 2 : 3) : 1; } });
      var t;
      while ((t = walker.nextNode())) { out += " " + t.data; if (out.length > max * 3) break; }
    } catch { return ""; }
    return cap(out, max);
  }
  function labelFor(el) {
    var aria = el.getAttribute("aria-label");
    if (aria) return cap(aria, config.textChars);
    var by = el.getAttribute("aria-labelledby");
    if (by) {
      var root = rootOf(el); var texts = [];
      by.split(/\s+/).forEach(function (id) { var t = root.getElementById ? root.getElementById(id) : null; if (t) texts.push(visibleText(t, config.textChars)); });
      if (texts.length) return cap(texts.join(" "), config.textChars);
    }
    if (el.labels && el.labels.length) return visibleText(el.labels[0], config.textChars);
    return undefined;
  }
  var CONTROL_SELECTOR = "a[href],button,input,select,textarea,label,summary,option,canvas,video,audio,[role=button],[role=link],[role=tab],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],[role=option],[role=checkbox],[role=radio],[role=switch],[role=slider],[role=treeitem],[role=gridcell],[contenteditable]:not([contenteditable=false]),[tabindex]:not([tabindex='-1']),[onclick]";
  function controlOf(el) { try { return el.closest ? el.closest(CONTROL_SELECTOR) : null; } catch { return null; } }
  function rectOf(el) {
    try { var r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; } catch { return undefined; }
  }
  function describe(el) {
    var loc = locationOf(el);
    if (!el || el.nodeType !== 1) {
      if (el && el.nodeType === 3 && el.parentElement) return describe(el.parentElement);
      if (el && el.nodeType === 9) return { tag: "#document", selector: "", route: route(loc) };
      return { tag: el && el.nodeName ? String(el.nodeName).toLowerCase() : "?", selector: "", route: route(loc) };
    }
    var d = { tag: el.localName, selector: selectorFor(el) };
    var id = goodId(el); if (id) d.id = id;
    var name = el.getAttribute("name"); if (name) d.name = cap(name, 48);
    var type = el.getAttribute("type"); if (type && (d.tag === "input" || d.tag === "button")) d.type = type.toLowerCase();
    var role = el.getAttribute("role"); if (role) d.role = cap(role, 32);
    var text = visibleText(el, config.textChars); if (text) d.text = text;
    var label = labelFor(el); if (label) d.label = label;
    var placeholder = el.getAttribute("placeholder"); if (placeholder) d.placeholder = cap(placeholder, config.textChars);
    var title = el.getAttribute("title"); if (title) d.title = cap(title, config.textChars);
    var testid = el.getAttribute("data-testid") || el.getAttribute("data-test-id") || el.getAttribute("data-test"); if (testid) d.testid = cap(testid, 64);
    var classes = usefulClasses(el, 6); if (classes.length) d.classes = classes;
    var href = d.tag === "a" || d.tag === "area" ? el.getAttribute("href") : null; if (href) { var h = safeUrl(href, el.ownerDocument.baseURI, loc); if (h) d.href = h; }
    if (d.tag === "form") { var action = el.getAttribute("action"); var a = safeUrl(action || loc.href, el.ownerDocument.baseURI, loc); if (a) d.action = a; d.method = (el.getAttribute("method") || "get").toLowerCase(); }
    if (d.tag === "canvas" || d.tag === "video" || d.tag === "img" || d.tag === "svg" || d.tag === "iframe") { var w = el.getAttribute("width"), hgt = el.getAttribute("height"); if (w || hgt) d.size = (w || "?") + "x" + (hgt || "?"); }
    if (el.disabled === true) d.disabled = true;
    var editable = editableKind(el); if (editable) d.editable = editable;
    var rect = rectOf(el); if (rect) d.rect = rect;
    d.route = route(loc);
    return d;
  }

  // ---- Keyboard policy. Editable surfaces are text entry: only a short
  // list of control keys, and Ctrl/Meta commands, are recorded there and
  // always by name. Elsewhere, control keys are recorded by name and
  // printable keys only by class and count. The character never leaves
  // the page. Modifier keys on their own and composition are ignored.
  var EDITABLE_INPUT = /^(button|submit|reset|checkbox|radio|range|color|file|image|hidden)$/;
  var EDITOR_CLASS = /(^|\s)(cm-editor|cm-content|CodeMirror|monaco-editor|ace_editor|ProseMirror|ql-editor|tiptap|w-md-editor|jodit|ck-editor|tox-edit-area|public-DraftEditor-content)(\s|$)/;
  var TEXT_ROLE = /^(textbox|combobox|searchbox|spinbutton)$/;
  function editableKind(el) {
    if (!el || el.nodeType !== 1) return null;
    var tag = el.localName;
    if (tag === "input") { var t = (el.getAttribute("type") || "text").toLowerCase(); if (t === "password") return "password"; return EDITABLE_INPUT.test(t) ? null : "text"; }
    if (tag === "textarea") return "text";
    if (tag === "select") return null;
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
      var ce = n.getAttribute("contenteditable");
      if (ce !== null && ce !== "false") return "editor";
      var role = n.getAttribute("role"); if (role && TEXT_ROLE.test(role)) return "text";
      if (EDITOR_CLASS.test(n.className && typeof n.className === "string" ? n.className : "")) return "editor";
    }
    return null;
  }
  var MODIFIER_KEY = /^(Shift|Control|Alt|Meta|CapsLock|NumLock|ScrollLock|Fn|FnLock|Hyper|Super|Symbol|SymbolLock|AltGraph|Dead|Unidentified|Process)$/;
  var EDITABLE_NAMED = /^(Enter|Escape|Tab|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End|PageUp|PageDown|F\d{1,2})$/;
  var PASSWORD_NAMED = /^(Enter|Escape|Tab)$/;
  function chord(event, key, withShift) {
    var parts = [];
    if (event.ctrlKey) parts.push("Ctrl");
    if (event.altKey) parts.push("Alt");
    if (event.metaKey) parts.push("Meta");
    if (withShift && event.shiftKey) parts.push("Shift");
    parts.push(key);
    return parts.join("+");
  }
  function classifyKey(event, target) {
    var key = event.key;
    if (typeof key !== "string" || !key || event.isComposing || MODIFIER_KEY.test(key)) return null;
    var editable = editableKind(target);
    var printable = key.length === 1;
    var command = event.ctrlKey || event.metaKey;
    if (editable === "password") return PASSWORD_NAMED.test(key) ? { key: chord(event, key, true), class: "control", editable: editable } : null;
    if (editable) {
      if (!printable) return EDITABLE_NAMED.test(key) ? { key: chord(event, key, true), class: "control", editable: editable } : null;
      return command && !event.altKey && key !== " " ? { key: chord(event, key.toLowerCase(), false), class: "chord", editable: editable } : null;
    }
    if (!printable) return { key: chord(event, key, true), class: "control", editable: null };
    if (key === " ") return { key: chord(event, "Space", true), class: "control", editable: null };
    if (command) return { key: chord(event, key.toLowerCase(), false), class: "chord", editable: null };
    return { key: "[printable]", class: /\p{L}/u.test(key) ? "letter" : /\p{N}/u.test(key) ? "digit" : "symbol", editable: null };
  }

  // ---- Transport: batches of events to the gateway on this origin.
  function createTransport(frameId) {
    var originalFetch = typeof window.fetch === "function" ? window.fetch.bind(window) : null;
    var queue = [], bytes = 0, timer = null, sent = 0, dropped = 0, failures = 0;
    function shrink(ev) {
      var copy = { kind: ev.kind, at: ev.at, frameId: ev.frameId, interactionId: ev.interactionId, correlation: ev.correlation, data: {} };
      for (var k in ev.data) if (k !== "added" && k !== "removed" && k !== "text" && k !== "fields") copy.data[k] = ev.data[k];
      copy.data.truncated = true;
      return copy;
    }
    function push(ev) {
      var s = JSON.stringify(ev);
      if (s.length > config.eventBytes) s = JSON.stringify(shrink(ev));
      if (s.length > config.eventBytes) s = JSON.stringify({ kind: ev.kind, at: ev.at, frameId: ev.frameId, interactionId: ev.interactionId, data: { truncated: true } });
      if (queue.length >= config.maxQueue) { dropped++; queue.shift(); }
      queue.push(s); bytes += s.length;
      if (queue.length >= config.batchEvents || bytes >= config.batchBytes) flush(false);
      else if (!timer) timer = setTimeout(function () { timer = null; flush(false); }, config.flushMs);
    }
    function flush(unloading) {
      if (timer) { clearTimeout(timer); timer = null; }
      if (!queue.length) return Promise.resolve();
      var body = '{"engelbart":"bridge","v":' + VERSION + ',"frameId":"' + frameId + '","sentAt":' + Date.now() + ',"dropped":' + dropped + ',"events":[' + queue.join(",") + "]}";
      var count = queue.length;
      queue = []; bytes = 0; dropped = 0;
      if (unloading && navigator.sendBeacon) {
        try { if (navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }))) { sent += count; return Promise.resolve(); } } catch { /* fall through */ }
      }
      if (!originalFetch) { failures++; return Promise.resolve(); }
      return originalFetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: body, credentials: "omit", keepalive: body.length < 60000 })
        .then(function (res) { if (res && res.ok === false) { failures++; debug("events endpoint answered", res.status); } else sent += count; })
        .catch(function (err) { failures++; if (failures <= 3) debug("could not deliver events:", err && err.message); });
    }
    return { push: push, flush: flush, originalFetch: originalFetch, stats: function () { return { queued: queue.length, sent: sent, failures: failures }; } };
  }

  // ---- One bridged document. `own` is true when this script runs inside
  // the document; false when a parent bridge attached to a same-origin
  // frame that had no script of its own.
  function createFrameBridge(opts) {
    var win = opts.win, doc = opts.doc, frameId = opts.frameId, transport = opts.transport;
    var loc = win.location;
    var short = frameId.replace(/^f_/, "");
    var interactions = 0;
    var latest = null;              // { id, at }
    var parentFrameId = opts.parentFrameId || null;
    var depth = typeof opts.depth === "number" ? opts.depth : null;
    var pendingKey = null;
    var burst = null;
    var pendingRequests = 0, lastSettledAt = 0;
    var frames = new Map();         // iframe element -> { frameId, state, load, bridge, src }
    var frameInfo = { name: null, selectorInParent: null, frameKind: null };   // what the parent said this frame is
    var timers = [];
    var loadedEmitted = false;

    function emit(kind, data, ids) {
      var ev = { kind: kind, at: ids && typeof ids.at === "number" ? ids.at : Date.now(), frameId: frameId, data: data || {} };
      if (ids && ids.interactionId) ev.interactionId = ids.interactionId;
      if (ids && ids.correlation) ev.correlation = ids.correlation;
      transport.push(ev);
      return ev;
    }
    function mint(at) {
      var id = "i_" + short + "_" + (++interactions);
      latest = { id: id, at: at };
      notifyParent(id, at);
      return id;
    }
    function interaction(kind, data, at) {
      closeBurst("interaction");
      var id = mint(at || Date.now());
      emit(kind, data, { interactionId: id, at: latest.at });
      return id;
    }
    // "The latest interaction" includes what happens in the documents this
    // one embeds: a request the page makes because of a key press in a
    // frame (a message from the frame, say) carries that press's id, and
    // what changes on the page after it is attributed to it. The parent is
    // told the same way the frame said hello.
    function notifyParent(id, at) {
      if (opts.onActivity) { opts.onActivity(id, at); return; }
      if (!opts.own || win.parent === win || !parentFrameId) return;
      try { win.parent.postMessage({ engelbart: "bridge", v: VERSION, type: "activity", frameId: frameId, interactionId: id, at: at }, loc.origin === "null" ? "*" : loc.origin); } catch { /* ignore */ }
    }
    function childActivity(id, at) {
      if (latest && at < latest.at) return;
      closeBurst("interaction");
      latest = { id: id, at: at };
      notifyParent(id, at);
    }
    function currentTag(now) {
      return latest && now - latest.at <= config.tagWindowMs ? latest.id : null;
    }
    function armed(now) {
      if (burst) return true;
      if (!latest) return false;
      return now - latest.at <= config.armMs || pendingRequests > 0 || now - lastSettledAt <= config.settleMs;
    }
    function on(target, type, fn, options) {
      var wrapped = safely(fn);
      target.addEventListener(type, wrapped, options === undefined ? { capture: true, passive: true } : options);
    }

    // -- interactions
    function modifiers(e) { var m = []; if (e.shiftKey) m.push("Shift"); if (e.ctrlKey) m.push("Ctrl"); if (e.altKey) m.push("Alt"); if (e.metaKey) m.push("Meta"); return m.length ? m : undefined; }
    function targetOf(e) { var path = e.composedPath ? e.composedPath() : null; return (path && path[0]) || e.target; }
    // Engelbart's own DOM in the page — the annotate overlay — is not
    // something the person did. composedPath() reaches into a shadow
    // root, so being in one is no cover; the marked host is.
    function ours(node) {
      var el = node && node.nodeType === 1 ? node : node && node.parentElement;
      try { return !!(el && el.closest && el.closest("[data-engelbart]")); } catch { return false; }
    }

    on(doc, "click", function (e) {
      flushKey();
      var target = targetOf(e);
      if (!target || target.nodeType !== 1) target = target && target.parentElement ? target.parentElement : doc.body;
      if (ours(target)) return;
      var control = controlOf(target);
      var data = { button: e.button, detail: e.detail, trusted: e.isTrusted === true, target: describe(target) };
      var mods = modifiers(e); if (mods) data.modifiers = mods;
      if (control && control !== target) data.control = describe(control);
      interaction("ui.click", data);
    });

    on(doc, "submit", function (e) {
      flushKey();
      var form = e.target;
      var data = { trusted: e.isTrusted === true, form: describe(form) };
      if (e.submitter) data.submitter = describe(e.submitter);
      var fields = [];
      try {
        var elements = form.elements || [];
        for (var i = 0; i < elements.length && fields.length < 20; i++) {
          var f = elements[i]; var tag = f.localName; if (tag === "fieldset" || tag === "output") continue;
          var entry = { tag: tag }; var nm = f.getAttribute("name"); if (nm) entry.name = cap(nm, 48); var ty = f.getAttribute("type"); if (ty) entry.type = ty.toLowerCase();
          fields.push(entry);
        }
      } catch { /* not a form */ }
      data.fields = fields;
      interaction("ui.submit", data);
    });

    // A control's committed value: which option, on or off, where a slider
    // stopped. Text-entry surfaces report only that they changed.
    on(doc, "change", function (e) {
      var el = targetOf(e);
      if (!el || el.nodeType !== 1 || ours(el)) return;
      var tag = el.localName; var type = (el.getAttribute("type") || "").toLowerCase();
      var data = { target: describe(el), trusted: e.isTrusted === true };
      if (tag === "select") {
        data.kind = "select";
        var picked = [];
        for (var i = 0; i < el.selectedOptions.length && picked.length < 5; i++) picked.push(cap(el.selectedOptions[i].text || el.selectedOptions[i].value, config.textChars));
        data.selected = picked; if (el.selectedIndex >= 0) data.index = el.selectedIndex;
      } else if (tag === "input" && (type === "checkbox" || type === "radio")) {
        data.kind = type; data.checked = el.checked === true;
      } else if (tag === "input" && (type === "range" || type === "number" || type === "color" || type === "date" || type === "time" || type === "month" || type === "week" || type === "datetime-local")) {
        data.kind = type; data.value = cap(el.value, 32);
      } else if (tag === "input" && type === "file") {
        data.kind = "file"; data.files = el.files ? el.files.length : 0;
      } else if (editableKind(el)) {
        data.kind = editableKind(el) === "password" ? "password" : "text"; data.valueLength = typeof el.value === "string" ? el.value.length : undefined;
      } else {
        data.kind = tag;
      }
      interaction("ui.input", data);
    });

    function flushKey() {
      if (!pendingKey) return;
      var k = pendingKey; pendingKey = null;
      if (k.timer) clearTimeout(k.timer);
      var data = { key: k.key, class: k.class, count: k.count, repeat: k.repeat, editable: k.editable, target: k.target };
      if (k.active) data.active = k.active;
      if (k.count > 1) data.lastAt = k.lastAt;
      emit("ui.key", data, { interactionId: k.id, at: k.firstAt });
    }
    on(doc, "keydown", function (e) {
      var target = targetOf(e);
      if (!target || target.nodeType !== 1) target = doc.activeElement || doc.body;
      if (ours(target)) return;
      var result = classifyKey(e, target);
      if (!result) return;
      var now = Date.now();
      var selector = selectorFor(target);
      if (pendingKey && pendingKey.key === result.key && pendingKey.class === result.class && pendingKey.selector === selector && now - pendingKey.lastAt <= config.keyFoldMs) {
        pendingKey.count++; pendingKey.lastAt = now; if (e.repeat) pendingKey.repeat = true;
        clearTimeout(pendingKey.timer); pendingKey.timer = setTimeout(flushKey, config.keyFoldMs);
        return;
      }
      flushKey();
      closeBurst("interaction");
      var id = mint(now);
      pendingKey = { id: id, key: result.key, class: result.class, editable: result.editable, count: 1, repeat: e.repeat === true, firstAt: now, lastAt: now, selector: selector, target: describe(target), timer: setTimeout(flushKey, config.keyFoldMs) };
      var active = doc.activeElement;
      if (active && active !== target && active !== doc.body && active.nodeType === 1) pendingKey.active = describe(active);
    });

    // Focus arriving in an embedded document means the person moved into
    // it (a click or Tab into an iframe). Only embedded frames report it.
    on(win, "focus", function () {
      if (win.parent === win) return;
      var active = doc.activeElement;
      interaction("ui.focus", { embedded: true, target: describe(active && active !== doc.body ? active : doc.body) });
    }, { capture: false, passive: true });

    // -- routes
    var lastRoute = route(loc);
    function routeChanged(how) {
      var now = route(loc); if (now === lastRoute) return;
      var from = lastRoute; lastRoute = now;
      if (from.split("#")[0] === now.split("#")[0]) how = "hash";
      emit("ui.route", { from: from, to: now, how: how, title: cap(doc.title, 120) }, { interactionId: currentTag(Date.now()), correlation: latest ? "temporal" : undefined });
    }
    on(win, "popstate", function () { routeChanged("pop"); }, { capture: false, passive: true });
    on(win, "hashchange", function () { routeChanged("hash"); }, { capture: false, passive: true });
    if (opts.own && win.history && typeof win.history.pushState === "function") {
      ["pushState", "replaceState"].forEach(function (method) {
        var original = win.history[method];
        win.history[method] = function () { var r = original.apply(this, arguments); try { routeChanged(method === "pushState" ? "push" : "replace"); } catch { /* ignore */ } return r; };
      });
    }

    // -- network tagging: same-origin requests started soon after an
    // interaction carry its id, so the gateway can join them explicitly.
    // Third-party and no-cors requests are left exactly as they were.
    function tagFor(input, init) {
      // "" is the document's own URL: that is how Next.js posts a server action.
      var url = typeof input === "string" ? input : input && typeof input.url === "string" ? input.url : input && typeof input.href === "string" ? input.href : null;
      if (url === null) return null;
      var u; try { u = new URL(url, doc.baseURI); } catch { return null; }
      if (u.origin !== loc.origin || u.pathname.indexOf("/__engelbart/") === 0) return null;
      if (init && init.mode === "no-cors") return null;
      return currentTag(Date.now());
    }
    function track(promise) {
      pendingRequests++;
      var settle = function () { pendingRequests = Math.max(0, pendingRequests - 1); lastSettledAt = Date.now(); };
      promise.then(settle, settle);
    }
    if (opts.own && typeof win.fetch === "function") {
      var originalFetch = win.fetch;
      win.fetch = function (input, init) {
        var id = null;
        try { id = tagFor(input, init); } catch { id = null; }
        if (!id) return originalFetch.apply(this, arguments);
        var headers;
        try {
          headers = new Headers(init && init.headers ? init.headers : (input && typeof input.headers === "object" && input.headers ? input.headers : undefined));
          headers.set("x-engelbart-interaction", id);
        } catch { return originalFetch.apply(this, arguments); }
        var next = Object.assign({}, init, { headers: headers });
        var promise = originalFetch.call(this, input, next);
        try { track(promise); } catch { /* ignore */ }
        return promise;
      };
    }
    if (opts.own && win.XMLHttpRequest) {
      var urls = new WeakMap();
      var proto = win.XMLHttpRequest.prototype;
      var open = proto.open, send = proto.send;
      proto.open = function (method, url) { try { urls.set(this, String(url)); } catch { /* ignore */ } return open.apply(this, arguments); };
      proto.send = function () {
        try {
          var id = tagFor(urls.get(this), null);
          if (id) {
            this.setRequestHeader("x-engelbart-interaction", id);
            pendingRequests++;
            var done = false;
            this.addEventListener("loadend", function () { if (done) return; done = true; pendingRequests = Math.max(0, pendingRequests - 1); lastSettledAt = Date.now(); });
          }
        } catch { /* header refused: leave the request alone */ }
        return send.apply(this, arguments);
      };
    }

    // -- what visibly changed after an interaction. One MutationObserver
    // records counts and small text samples while the page is "armed"
    // (an interaction happened recently, or a tagged request is still in
    // flight); a burst closes after a quiet period and becomes one
    // ui.change event, attributed to the latest interaction by time only.
    var IGNORED = "script,style,link,meta,template,noscript,head,nextjs-portal,[data-nextjs-toast],[data-nextjs-dialog-overlay],#__next-build-watcher,[data-engelbart]";
    function ignored(node) {
      var el = node.nodeType === 1 ? node : node.parentElement;
      try { return !!(el && el.closest && el.closest(IGNORED)); } catch { return false; }
    }
    function textOf(node) { return visibleText(node, config.sampleChars); }
    // Text entry surfaces mirror what the person types into their DOM (a
    // framework setting a textarea's default value replaces its text node
    // on every keystroke). Nothing that happens inside one is recorded.
    function insideEditable(node) {
      var el = node && node.nodeType === 1 ? node : node ? node.parentElement : null;
      for (var a = el; a; a = a.parentElement) if (a.localName === "textarea" || a.localName === "input") return true;
      return !!editableKind(el);
    }
    function openBurst(now) {
      burst = { interactionId: latest ? latest.id : null, interactionAt: latest ? latest.at : null, firstAt: now, lastAt: now, part: 1, mutations: 0, addedNodes: 0, removedNodes: 0, textChanges: 0, attributeChanges: 0,
        added: [], changed: [], removed: [], removedChars: 0, targets: [], requestsInFlight: pendingRequests, timer: null, maxTimer: null };
      burst.maxTimer = setTimeout(function () { continueBurst(); }, config.burstMaxMs);
    }
    function continueBurst() {
      if (!burst) return;
      var part = burst.part; var id = burst.interactionId; var at = burst.interactionAt;
      closeBurst("continued");
      openBurst(Date.now());
      burst.part = part + 1; burst.interactionId = id; burst.interactionAt = at;
    }
    function lowestCommonAncestor(nodes) {
      var chain = null;
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i]; if (!n || !n.isConnected) continue;
        var el = n.nodeType === 1 ? n : n.parentElement; if (!el) continue;
        if (!chain) { chain = []; for (var a = el; a; a = a.parentElement) chain.push(a); continue; }
        var found = -1;
        for (var b = el; b && found < 0; b = b.parentElement) found = chain.indexOf(b);
        if (found > 0) chain = chain.slice(found);
        else if (found < 0) return doc.body;
      }
      return chain ? chain[0] : null;
    }
    function samples(nodes, budget) {
      var out = [], chars = 0, seen = {};
      for (var i = 0; i < nodes.length && chars < budget; i++) {
        var n = nodes[i];
        if (n.isConnected === false) continue;
        // A node inside another sampled node would repeat its text.
        var nested = false;
        for (var j = 0; j < nodes.length && !nested; j++) if (j !== i && nodes[j].nodeType === 1 && nodes[j] !== n && nodes[j].contains(n)) nested = true;
        if (nested) continue;
        var t = textOf(n); if (!t || seen[t]) continue;
        seen[t] = true;
        if (chars + t.length > budget) t = t.slice(0, Math.max(0, budget - chars - 1)) + "…";
        out.push(t); chars += t.length;
      }
      return out;
    }
    function closeBurst(why) {
      if (!burst) return;
      var b = burst; burst = null;
      clearTimeout(b.timer); clearTimeout(b.maxTimer);
      if (!b.mutations) return;
      var added = samples(b.added.concat(b.changed), config.sampleChars);
      var removed = b.removed;
      // Text taken out and put back is a rerender, not a visible change;
      // it is counted, not quoted.
      var same = added.filter(function (t) { return removed.indexOf(t) >= 0; });
      if (same.length) {
        added = added.filter(function (t) { return same.indexOf(t) < 0; });
        removed = removed.filter(function (t) { return same.indexOf(t) < 0; });
      }
      var container = lowestCommonAncestor(b.targets);
      var data = {
        part: b.part, closed: why, firstMutationAt: b.firstAt, lastMutationAt: b.lastAt, durationMs: b.lastAt - b.firstAt,
        sinceInteractionMs: b.interactionAt ? b.firstAt - b.interactionAt : null, requestsInFlight: b.requestsInFlight,
        mutations: b.mutations, addedNodes: b.addedNodes, removedNodes: b.removedNodes, textChanges: b.textChanges, attributeChanges: b.attributeChanges,
        added: added.slice(0, 12), removed: removed.slice(0, 12), rerendered: same.length || undefined,
        container: container ? describe(container) : undefined,
      };
      emit("ui.change", data, { interactionId: b.interactionId, correlation: b.interactionId ? "temporal" : undefined, at: b.firstAt });
    }
    function remember(list, node, limit) { if (list.length < limit && list.indexOf(node) < 0) list.push(node); }
    function onMutations(records) {
      var now = Date.now();
      // Embedded frames appearing or leaving are always tracked.
      for (var r = 0; r < records.length; r++) {
        var rec = records[r];
        if (rec.type !== "childList") continue;
        for (var a = 0; a < rec.addedNodes.length; a++) scanForFrames(rec.addedNodes[a]);
        for (var d = 0; d < rec.removedNodes.length; d++) forgetFrames(rec.removedNodes[d]);
      }
      if (!armed(now)) return;
      if (!burst) openBurst(now);
      for (var i = 0; i < records.length; i++) {
        var m = records[i];
        if (ignored(m.target)) continue;
        if (m.type !== "attributes" && insideEditable(m.target)) continue;
        burst.mutations++; burst.lastAt = now;
        remember(burst.targets, m.target, 50);
        if (m.type === "childList") {
          burst.addedNodes += m.addedNodes.length; burst.removedNodes += m.removedNodes.length;
          for (var x = 0; x < m.addedNodes.length; x++) { var an = m.addedNodes[x]; if ((an.nodeType === 1 || an.nodeType === 3) && !ignored(an)) remember(burst.added, an, config.sampleNodes); }
          for (var y = 0; y < m.removedNodes.length && burst.removedChars < config.sampleChars; y++) {
            var rn = m.removedNodes[y]; if (rn.nodeType !== 1 && rn.nodeType !== 3) continue;
            var t = textOf(rn); if (!t || burst.removed.indexOf(t) >= 0) continue;
            if (burst.removedChars + t.length > config.sampleChars) t = t.slice(0, Math.max(0, config.sampleChars - burst.removedChars - 1)) + "…";
            burst.removed.push(t); burst.removedChars += t.length;
          }
        } else if (m.type === "characterData") {
          burst.textChanges++; remember(burst.changed, m.target, config.sampleNodes);
        } else if (m.type === "attributes") {
          burst.attributeChanges++;
        }
      }
      clearTimeout(burst.timer);
      burst.timer = setTimeout(function () { closeBurst("quiet"); }, config.quietMs);
    }
    var observer = null;
    try {
      observer = new win.MutationObserver(safely(onMutations));
      observer.observe(doc.documentElement || doc, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["hidden", "open", "disabled", "aria-expanded", "aria-selected", "aria-checked", "aria-pressed", "aria-hidden", "aria-busy"] });
    } catch (e) { debug("no MutationObserver:", e && e.message); }

    // -- embedded frames: which ones exist, which say hello, which cannot.
    function iframeName(el) { var n = el.getAttribute("name") || el.getAttribute("id") || el.getAttribute("title"); return n ? cap(n, 64) : undefined; }
    function frameKind(el) {
      if (el.hasAttribute("srcdoc")) return "srcdoc";
      var src = el.getAttribute("src") || "";
      if (!src || src === "about:blank") return "blank";
      if (src.indexOf("blob:") === 0) return "blob";
      if (src.indexOf("data:") === 0) return "data";
      return "document";
    }
    function inspect(el) {
      var sandbox = el.getAttribute("sandbox");
      var cwin, cdoc;
      try { cwin = el.contentWindow; cdoc = el.contentDocument; if (cdoc) void cdoc.readyState; } catch { return { reason: sandbox !== null && !/\ballow-same-origin\b/.test(sandbox) ? "sandboxed" : "cross-origin" }; }
      if (!cwin) return { reason: "no-window" };
      if (!cdoc) return { reason: sandbox !== null && !/\ballow-same-origin\b/.test(sandbox) ? "sandboxed" : "cross-origin" };
      return { win: cwin, doc: cdoc, scripts: sandbox === null || /\ballow-scripts\b/.test(sandbox) };
    }
    function watchFrame(el) {
      if (frames.has(el)) return;
      var entry = { frameId: null, state: "pending", bridge: null, src: el.getAttribute("src") || (el.hasAttribute("srcdoc") ? "srcdoc" : ""), timer: null };
      frames.set(el, entry);
      var check = function () { entry.timer = setTimeout(function () { settleFrame(el, entry); }, config.attachGraceMs); };
      on(el, "load", function () { entry.state = entry.state === "attached" || entry.state === "self" ? "pending" : entry.state; if (entry.bridge) { entry.bridge.detach(); entry.bridge = null; } clearTimeout(entry.timer); check(); }, { capture: false, passive: true });
      check();
    }
    function settleFrame(el, entry) {
      if (!el.isConnected || entry.state === "self" || entry.state === "attached") return;
      var probe = inspect(el);
      var selector = selectorFor(el);
      var base = { parentFrameId: frameId, selectorInParent: selector, name: iframeName(el), frameKind: frameKind(el), src: safeUrl(el.getAttribute("src") || "about:blank", doc.baseURI, loc) };
      if (!probe.doc) {
        if (entry.state === "unavailable" && entry.reason === probe.reason) return;
        entry.state = "unavailable"; entry.reason = probe.reason;
        emit("frame.discovered", Object.assign(base, { instrumented: false, reason: probe.reason }));
        return;
      }
      if (probe.win.__engelbart) { entry.state = "self"; return; }   // its own bridge is there; it will say hello
      if (probe.doc.readyState === "loading") { entry.timer = setTimeout(function () { settleFrame(el, entry); }, config.attachGraceMs); return; }
      // Same origin, no bridge of its own (a srcdoc, blob or blank frame,
      // or a document the gateway could not inject): observe it from here.
      var childId = randomId("f_", 10);
      entry.frameId = childId; entry.state = "attached";
      entry.bridge = createFrameBridge({ win: probe.win, doc: probe.doc, frameId: childId, transport: transport, own: false, minted: "bridge", onActivity: childActivity });
      try { Object.defineProperty(probe.win, "__engelbart", { value: entry.bridge.api, enumerable: false, configurable: true }); } catch { /* ignore */ }
      entry.bridge.attached({ parentFrameId: frameId, selectorInParent: selector, name: base.name, frameKind: base.frameKind, depth: depth === null ? null : depth + 1 });
      entry.bridge.loaded();
    }
    function scanForFrames(node) {
      if (!node || node.nodeType !== 1) return;
      if (node.localName === "iframe") watchFrame(node);
      var list = node.querySelectorAll ? node.querySelectorAll("iframe") : [];
      for (var i = 0; i < list.length; i++) watchFrame(list[i]);
    }
    function forgetFrames(node) {
      if (!node || node.nodeType !== 1) return;
      var list = node.localName === "iframe" ? [node] : node.querySelectorAll ? node.querySelectorAll("iframe") : [];
      for (var i = 0; i < list.length; i++) {
        var el = list[i]; var entry = frames.get(el); if (!entry) continue;
        clearTimeout(entry.timer);
        if (entry.bridge) { entry.bridge.detach(); }
        if (entry.frameId) emit("frame.removed", { childFrameId: entry.frameId, selectorInParent: selectorFor(el), name: iframeName(el) });
        frames.delete(el);
      }
    }
    function findFrame(source) {
      var it = frames.keys(); var step;
      while (!(step = it.next()).done) { try { if (step.value.contentWindow === source) return step.value; } catch { /* ignore */ } }
      var all = doc.querySelectorAll("iframe");
      for (var i = 0; i < all.length; i++) { try { if (all[i].contentWindow === source) { watchFrame(all[i]); return all[i]; } } catch { /* ignore */ } }
      return null;
    }
    // The frame protocol: an embedded document with its own bridge posts
    // "hello" to its parent; the parent answers with where it sits.
    on(win, "message", function (e) {
      var msg = e.data;
      if (msg && msg.engelbart === ANNOTATE) { if (annotator) annotator.receive(e); return; }
      if (!msg || msg.engelbart !== "bridge" || typeof msg.type !== "string") return;
      if (e.origin !== loc.origin && e.origin !== "null" && loc.origin !== "null") return;
      if (msg.type === "hello" && e.source && e.source !== win) {
        var el = findFrame(e.source);
        if (!el) return;
        var entry = frames.get(el);
        if (entry.bridge) { entry.bridge.detach(); entry.bridge = null; }
        entry.frameId = msg.frameId; entry.state = "self"; clearTimeout(entry.timer);
        var reply = { engelbart: "bridge", v: VERSION, type: "welcome", frameId: msg.frameId, parentFrameId: frameId, selectorInParent: selectorFor(el), name: iframeName(el), frameKind: frameKind(el), depth: depth === null ? null : depth + 1 };
        try { e.source.postMessage(reply, e.origin === "null" ? "*" : loc.origin); } catch (err) { debug("could not answer hello:", err && err.message); }
      } else if (msg.type === "welcome" && opts.own && msg.frameId === frameId && e.source === win.parent) {
        attached({ parentFrameId: msg.parentFrameId, selectorInParent: msg.selectorInParent, name: msg.name, frameKind: msg.frameKind, depth: msg.depth });
      } else if (msg.type === "activity" && e.source && e.source !== win && typeof msg.interactionId === "string" && typeof msg.at === "number") {
        var from = findFrame(e.source); var known = from ? frames.get(from) : null;
        if (known && known.frameId === msg.frameId) childActivity(msg.interactionId, msg.at);
      }
    }, { capture: false, passive: true });
    function attached(info) {
      if (parentFrameId) return;
      parentFrameId = typeof info.parentFrameId === "string" ? info.parentFrameId : null;
      depth = typeof info.depth === "number" ? info.depth : depth;
      frameInfo = { name: info.name || null, selectorInParent: info.selectorInParent || null, frameKind: info.frameKind || null };
      emit("frame.attached", { parentFrameId: parentFrameId, selectorInParent: info.selectorInParent, name: info.name, frameKind: info.frameKind, depth: depth, instrumented: opts.own ? "self" : "parent-attached", minted: opts.minted, url: safeUrl(loc.href, doc.baseURI, loc), title: cap(doc.title, 120) });
    }
    function hello() {
      if (!opts.own || win.parent === win) return;
      var attempt = 0;
      var send = function () {
        if (parentFrameId) return;
        try { win.parent.postMessage({ engelbart: "bridge", v: VERSION, type: "hello", frameId: frameId, url: safeUrl(loc.href, doc.baseURI, loc) }, loc.origin === "null" ? "*" : loc.origin); } catch { /* parent is another origin: stays silent */ }
        if (++attempt < config.helloRetryMs.length) timers.push(setTimeout(send, config.helloRetryMs[attempt]));
      };
      send();
    }

    // -- the document itself
    function surfaces() {
      var out = {};
      ["canvas", "video", "audio", "svg", "iframe", "form", "input", "textarea", "select", "button", "a[href]", "[contenteditable]", "[role=application]", "[role=dialog]", "table"].forEach(function (sel) {
        try { var n = doc.querySelectorAll(sel).length; if (n) out[sel] = n; } catch { /* ignore */ }
      });
      var canvases = [];
      try { var cs = doc.querySelectorAll("canvas"); for (var i = 0; i < cs.length && i < 3; i++) canvases.push(describe(cs[i])); } catch { /* ignore */ }
      return { counts: out, canvases: canvases.length ? canvases : undefined };
    }
    function loaded() {
      if (loadedEmitted) return; loadedEmitted = true;
      emit("frame.loaded", { url: safeUrl(loc.href, doc.baseURI, loc), query: queryParams(loc.search), title: cap(doc.title, 120), embedded: win.parent !== win, readyState: doc.readyState, parentFrameId: parentFrameId, depth: depth, instrumented: opts.own ? "self" : "parent-attached", minted: opts.minted, surfaces: surfaces() });
      scanForFrames(doc.documentElement);
    }
    function flushAll(unloading) {
      flushKey();
      if (unloading) closeBurst("unload");
      frames.forEach(function (entry) { if (entry.bridge) entry.bridge.flushAll(unloading); });
    }
    // Annotate mode over this document. It observes nothing on its own:
    // it installs listeners only while the workspace has turned it on.
    var annotator = createAnnotator({
      win: win, doc: doc, frameId: frameId,
      frameRef: function () {
        return { frameId: frameId, name: frameInfo.name, selectorInParent: frameInfo.selectorInParent, depth: 0, kind: frameInfo.frameKind || "document", path: [] };
      },
      children: function () { var out = []; frames.forEach(function (entry, el) { out.push(el); }); return out; },
      unavailable: function () {
        var out = [];
        frames.forEach(function (entry, el) { if (entry.state === "unavailable") out.push({ selectorInParent: selectorFor(el), name: iframeName(el) || null, reason: entry.reason || "unavailable" }); });
        return out;
      },
      findFrame: findFrame,
    });

    function detach() {
      annotator.detach();
      try { if (observer) observer.disconnect(); } catch { /* ignore */ }
      timers.forEach(clearTimeout);
      frames.forEach(function (entry) { clearTimeout(entry.timer); if (entry.bridge) entry.bridge.detach(); });
      frames.clear();
      flushKey(); closeBurst("detach");
    }

    var api = {
      version: VERSION, frameId: frameId, describe: describe, selectorFor: selectorFor, annotatableAt: annotatableAt, classifyKey: classifyKey, editableKind: editableKind, safeUrl: safeUrl,
      configure: function (patch) { for (var k in patch) if (k in config) config[k] = patch[k]; },
      flush: function () { flushKey(); frames.forEach(function (entry) { if (entry.bridge) entry.bridge.flushAll(false); }); return transport.flush(false); },
      stats: function () { return { interactions: interactions, latest: latest, pendingRequests: pendingRequests, frames: frames.size, transport: transport.stats() }; },
      frames: function () { var out = []; frames.forEach(function (entry, el) { out.push({ frameId: entry.frameId, state: entry.state, reason: entry.reason, selector: selectorFor(el) }); }); return out; },
      parent: function () { return { parentFrameId: parentFrameId, depth: depth }; },
      annotate: function () { return annotator.state(); },
      resolveAnnotation: function (anchor) { return annotator.resolve(anchor); },
    };
    return { api: api, loaded: loaded, hello: hello, attached: attached, flushAll: flushAll, detach: detach };
  }

  // ---- Annotate mode: choosing an element of the running interface to
  // write a note about.
  //
  // All this adds to the page is a picker. While it is on, an overlay
  // outlines whatever the pointer is over, the next click is taken by the
  // overlay instead of by the application, and the element it names is
  // described with the same describe() every trace event uses — an
  // annotation's element and a trace event's element are one shape, and
  // there is no second way of naming an element anywhere in Engelbart.
  //
  // Nothing is written from here. The note is composed in the workspace,
  // on an authenticated origin, and stored from there; what crosses this
  // channel is a description of an element and never a note, a user or a
  // run. Nor does any of it reach the events endpoint: that one is open
  // on the sandbox's host, and a researcher's words do not belong on it.
  //
  // Who may turn it on: the window that embeds this document, and only
  // when its origin is the one the gateway was configured with. With no
  // config.parentOrigin the channel never opens. Whoever turned it on is
  // who results go back to, so an embedded document is told by its parent
  // and answers its parent, and a pick made three frames down arrives at
  // the workspace with each frame's offset and selector added on the way.
  var ANNOTATE = "annotate";
  var ANNOTATE_V = 1;

  // What is worth attaching a note to: a control, or the nearest thing
  // above the pointer that says what it is. A <div> with no role, no
  // label, no stable id and no class of its own says nothing, so the walk
  // goes past it. If nothing above it says anything either, the element
  // under the pointer is the answer — an ancestor picked for being nearby
  // would be a guess, and a guess is worse than a plain <div>.
  var REGION_SELECTOR = "main,article,section,aside,nav,header,footer,figure,figcaption,blockquote,li,tr,td,th,table,form,fieldset,legend,h1,h2,h3,h4,h5,h6,p,pre,dl,dt,dd,[role],[aria-label],[aria-labelledby],[data-testid],[data-test-id],[data-test]";
  function meaningfulElement(el) {
    if (!el || el.nodeType !== 1) return false;
    var name = el.localName;
    if (name === "html" || name === "body") return false;
    try { if (el.matches(REGION_SELECTOR)) return true; } catch { /* not matchable */ }
    if (goodId(el)) return true;
    if (labelFor(el)) return true;
    return usefulClasses(el, 1).length > 0;
  }
  function upFrom(node) {
    var parent = node.parentNode;
    if (parent && parent.nodeType === 11 && parent.host) return parent.host;
    return parent && parent.nodeType === 1 ? parent : null;
  }
  function annotatableAt(node) {
    var el = node && node.nodeType === 1 ? node : node && node.parentElement ? node.parentElement : null;
    if (!el) return null;
    var control = controlOf(el);
    if (control) return control;                    // canvas, button, link, field: already the unit that is acted on
    for (var up = el, i = 0; up && i < 8; i++, up = upFrom(up)) if (meaningfulElement(up)) return up;
    return el;
  }
  // The ancestors a person would recognise it by. Not a path: three
  // things that say where in the interface this was, so it can be found
  // again when the selector no longer matches.
  function ancestorsOf(el) {
    var out = [];
    for (var up = upFrom(el), i = 0; up && out.length < 3 && i < 12; i++, up = upFrom(up)) {
      if (!meaningfulElement(up)) continue;
      var d = describe(up);
      delete d.rect;      // where an ancestor was on screen says nothing about which one it is
      delete d.route;
      out.push(d);
    }
    return out;
  }
  function shortLabel(d) {
    return cap(d.text || d.label || d.title || d.placeholder || d.testid || d.id || d.name || d.role || d.tag || "element", 48);
  }

  // What the chip says while the pointer is over an element. The tag comes
  // first and the size last, the way a browser's own inspector reads them:
  // with nested elements whose edges nearly coincide, the text alone does
  // not say which of them is about to be annotated, and the size does.
  function hoverLabel(d, r) {
    var said = cap(d.text || d.label || d.title || d.placeholder || d.testid || d.id || d.name || d.role || "", 40);
    return (d.tag || "element") + (said ? " \u00b7 " + said : "") + (r ? "  " + Math.round(r.w) + "\u00d7" + Math.round(r.h) : "");
  }

  // ---- Finding an annotated element again
  //
  // A note was written about an element in a document that has since been
  // reloaded, rebuilt or changed. The ladder below tries the handles that
  // mean something first — a test id, a stable id, the selector — and only
  // then looks for the element by what it is and what it says. Screen
  // position is never identity: a stored rect is where the element was in
  // a viewport that no longer exists, and it decides nothing here.
  //
  // What it will not do is attach a note to whatever happens to be nearby.
  // Three answers only: "resolved", when a handle found exactly one
  // element and it still says what it said; "approximate", when one
  // element is clearly the best match but something about it has changed;
  // and "unresolved", which is left where it is, without a marker, and
  // said out loud.
  function textOf(t) { return collapse(t && (t.text || t.label || t.title || t.placeholder) || "").toLowerCase(); }
  function uniqueIn(root, selector) {
    var found;
    try { found = root.querySelectorAll(selector); } catch { return null; }
    return found.length === 1 ? found[0] : null;
  }
  // The stored selector crosses an open shadow root as "host >>> rest",
  // which querySelector does not accept. Each hop is resolved in the root
  // the one before it opened.
  function bySelector(doc, selector) {
    if (!selector) return null;
    var hops = selector.split(" >>> ");
    var root = doc, el = null;
    for (var i = 0; i < hops.length; i++) {
      el = uniqueIn(root, hops[i]);
      if (!el) return null;
      if (i + 1 < hops.length) { root = el.shadowRoot; if (!root) return null; }
    }
    return el;
  }
  function sharedClasses(el, classes) {
    if (!classes || !classes.length) return 0;
    var mine = usefulClasses(el, 6), n = 0;
    for (var i = 0; i < classes.length; i++) if (mine.indexOf(classes[i]) >= 0) n++;
    return n;
  }
  // How much of what was stored about the element is still true of this
  // one. A tag that disagrees is not the element at all.
  function scoreCandidate(el, want) {
    if (!want.tag || el.localName !== want.tag) return -1;
    var d = describe(el);
    var score = 1;
    if (want.testid && d.testid === want.testid) score += 5;
    if (want.id && d.id === want.id) score += 5;
    if (want.name && d.name === want.name) score += 2;
    if (want.role && d.role === want.role) score += 1;
    if (want.type && d.type === want.type) score += 1;
    var wanted = textOf(want);
    if (wanted && textOf(d) === wanted) score += 4;
    score += Math.min(2, sharedClasses(el, want.classes));
    return score;
  }
  // The ancestors are recognition, not a path: each stored one that is
  // still somewhere above this element is a point in its favour.
  function ancestorScore(el, ancestors) {
    if (!ancestors || !ancestors.length) return 0;
    var chain = [];
    for (var up = upFrom(el), i = 0; up && i < 12; i++, up = upFrom(up)) chain.push(describe(up));
    var n = 0;
    for (var a = 0; a < ancestors.length && n < 3; a++) {
      var want = ancestors[a];
      for (var c = 0; c < chain.length; c++) {
        var has = chain[c];
        if (has.tag !== want.tag) continue;
        if ((want.testid && has.testid === want.testid) || (want.id && has.id === want.id) || (textOf(want) && textOf(has) === textOf(want)) || (!want.testid && !want.id && !textOf(want))) { n++; break; }
      }
    }
    return n;
  }
  function byCandidates(doc, want, ancestors) {
    var list;
    try { list = doc.querySelectorAll(want.role ? want.tag + "[role=" + cssEscape(want.role) + "]" : want.tag); } catch { return null; }
    var best = null, bestScore = 0, runnerUp = 0;
    for (var i = 0; i < list.length && i < 500; i++) {
      var s = scoreCandidate(list[i], want);
      if (s < 0) continue;
      s += ancestorScore(list[i], ancestors);
      if (s > bestScore) { runnerUp = bestScore; bestScore = s; best = list[i]; }
      else if (s > runnerUp) runnerUp = s;
    }
    // Clearly the best, and good enough to be worth claiming. A tie is
    // two elements that look the same, which is not an answer.
    return best && bestScore >= 5 && bestScore > runnerUp ? { el: best, score: bestScore } : null;
  }
  function resolveAnchor(doc, anchor) {
    var want = anchor && anchor.element;
    if (!want || (!want.tag && !want.selector)) return { confidence: "unresolved", matchedOn: null, el: null, changed: null };
    var el = null, on = null;
    if (want.testid) { el = uniqueIn(doc, "[data-testid=\"" + cssEscape(want.testid) + "\"]") || uniqueIn(doc, "[data-test-id=\"" + cssEscape(want.testid) + "\"]") || uniqueIn(doc, "[data-test=\"" + cssEscape(want.testid) + "\"]"); if (el) on = "testid"; }
    if (!el && want.id) { el = uniqueIn(doc, "#" + cssEscape(want.id)); if (el) on = "id"; }
    if (el && want.tag && el.localName !== want.tag) { el = null; on = null; }   // the handle survived on something else
    if (!el && want.selector) { el = bySelector(doc, want.selector); if (el && want.tag && el.localName !== want.tag) el = null; if (el) on = "selector"; }
    if (el) {
      var wanted = textOf(want);
      var still = !wanted || textOf(describe(el)) === wanted;
      return { confidence: still ? "resolved" : "approximate", matchedOn: on, el: el, changed: still ? null : "text" };
    }
    var guess = byCandidates(doc, want, anchor.ancestors);
    if (guess) return { confidence: "approximate", matchedOn: "candidate", el: guess.el, changed: want.selector ? "selector" : null };
    return { confidence: "unresolved", matchedOn: null, el: null, changed: null };
  }

  // The outline, drawn inside a closed shadow root on an element the
  // bridge already ignores, so annotating never becomes something the
  // trace recorded. Every style is set as a property rather than through
  // a <style> element or a style attribute: a page with a strict
  // style-src would block those, and the outline would silently not be
  // drawn. CSSOM is not subject to that directive.
  function setStyle(style, props) { for (var k in props) { try { style[k] = props[k]; } catch { /* ignore */ } } }
  // One colour for the picker, nothing the page can be assumed to own.
  var ACCENT = "rgba(37,99,235,.95)", ACCENT_WASH = "rgba(37,99,235,.20)", ACCENT_HALO = "rgba(37,99,235,.22)";
  function createOverlay(doc, onMarker) {
    var host = null, root = null, box = null, chip = null, pins = null;
    var marks = [];   // { id, el, dot, confidence }
    function ensure() {
      if (host && host.isConnected) return true;
      var parent = doc.body || doc.documentElement;
      if (!parent) return false;
      host = doc.createElement("div");
      host.setAttribute("data-engelbart", "annotate");
      setStyle(host.style, { position: "fixed", top: "0", left: "0", width: "100%", height: "100%", margin: "0", padding: "0", border: "0", pointerEvents: "none", zIndex: "2147483647" });
      try { root = host.attachShadow({ mode: "closed" }); } catch { root = host; }
      // The page underneath is any colour at all, so the outline is drawn
      // in three bands: a white hairline that separates it from a dark
      // background, the accent itself, and a soft halo that separates it
      // from a light one. A wash over the element says which one is meant
      // when several are nested and their edges nearly coincide.
      box = doc.createElement("div");
      setStyle(box.style, {
        position: "fixed", display: "none", boxSizing: "border-box", pointerEvents: "none",
        border: "2px solid " + ACCENT, background: ACCENT_WASH, borderRadius: "3px",
        boxShadow: "0 0 0 1px rgba(255,255,255,.9), 0 0 0 6px " + ACCENT_HALO,
      });
      chip = doc.createElement("div");
      setStyle(chip.style, {
        position: "fixed", display: "none", pointerEvents: "none", maxWidth: "280px", overflow: "hidden",
        textOverflow: "ellipsis", whiteSpace: "nowrap", font: "600 11px/18px ui-monospace,SFMono-Regular,Menlo,monospace",
        color: "#fff", background: ACCENT, padding: "1px 6px", borderRadius: "3px",
        boxShadow: "0 1px 3px rgba(0,0,0,.35)",
      });
      pins = doc.createElement("div");
      setStyle(pins.style, { position: "fixed", top: "0", left: "0", width: "100%", height: "100%", pointerEvents: "none" });
      root.appendChild(box); root.appendChild(chip); root.appendChild(pins);
      parent.appendChild(host);
      return true;
    }
    // A marker is a small dot at the element's corner: a filled one where
    // the element was found for certain, a hollow one where it is the best
    // match but something about it has changed. Nothing is drawn for an
    // element that was not found — a marker on a guess would be a lie
    // about where the note belongs.
    function pin(item) {
      var dot = doc.createElement("button");
      dot.setAttribute("type", "button");
      dot.setAttribute("data-engelbart", "marker");
      dot.setAttribute("title", item.confidence === "approximate" ? "An annotation, on the closest match to what it was written about" : "An annotation");
      dot.setAttribute("aria-label", "Open annotation");
      var filled = item.confidence !== "approximate";
      setStyle(dot.style, {
        position: "fixed", display: "none", pointerEvents: "auto", cursor: "pointer",
        width: "10px", height: "10px", padding: "0", borderRadius: "50%",
        border: "1px solid " + (filled ? "rgba(250,250,250,.9)" : "rgba(24,24,24,.85)"),
        background: filled ? "rgba(24,24,24,.85)" : "rgba(250,250,250,.9)",
        boxShadow: "0 0 0 1px rgba(24,24,24,.25)",
      });
      dot.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); if (onMarker) onMarker(item.id); }, { capture: true });
      pins.appendChild(dot);
      return dot;
    }
    // The pointer, for as long as the picker is on. A page sets cursors on
    // its own elements, so the only thing that reliably wins over all of
    // them is a rule about all of them. A constructed stylesheet is CSSOM
    // like everything else drawn here and so is not style-src's business,
    // and it is dropped again the moment the mode ends. Where constructed
    // sheets are missing, the root's cursor is what can be done: it shows
    // everywhere the page has not set one of its own.
    var sheet = null, rooted = false;
    var adopted = function () { try { return [].slice.call(doc.adoptedStyleSheets || []); } catch { return []; } };
    function cursor(on) {
      var view = doc.defaultView;
      if (on && !sheet && view && typeof view.CSSStyleSheet === "function") {
        try {
          var made = new view.CSSStyleSheet();
          made.replaceSync("*,*::before,*::after{cursor:pointer !important}");
          sheet = made;
        } catch { sheet = null; }
      }
      if (sheet) {
        try {
          var have = adopted(), at = have.indexOf(sheet);
          if (on && at < 0) doc.adoptedStyleSheets = have.concat([sheet]);
          else if (!on && at >= 0) { have.splice(at, 1); doc.adoptedStyleSheets = have; }
          // A document may take the assignment without keeping it, so what
          // is actually there decides whether the root is still needed.
          if (adopted().indexOf(sheet) >= 0 === on) { if (!on) rootCursor(false); return; }
        } catch { /* the root, then */ }
      }
      rootCursor(on);
    }
    function rootCursor(on) {
      var el = doc.documentElement;
      if (!el) return;
      if (on) { try { el.style.setProperty("cursor", "pointer", "important"); rooted = true; } catch { /* ignore */ } }
      else if (rooted) { try { el.style.removeProperty("cursor"); } catch { /* ignore */ } rooted = false; }
    }

    function place() {
      for (var i = 0; i < marks.length; i++) {
        var m = marks[i];
        var r = m.el && m.el.isConnected ? rectOf(m.el) : null;
        if (!r || (!r.w && !r.h)) { m.dot.style.display = "none"; continue; }
        setStyle(m.dot.style, { display: "block", left: Math.max(0, r.x - 5) + "px", top: Math.max(0, r.y - 5) + "px" });
      }
    }
    return {
      ensure: ensure,
      cursor: cursor,
      owns: function (e) { try { return !!host && (e.composedPath ? e.composedPath().indexOf(host) >= 0 : false); } catch { return false; } },
      show: function (rect, label) {
        if (!rect || !ensure()) return;
        setStyle(box.style, { display: "block", left: rect.x + "px", top: rect.y + "px", width: rect.w + "px", height: rect.h + "px" });
        chip.textContent = label || "";
        var above = rect.y >= 30;
        setStyle(chip.style, { display: label ? "block" : "none", left: Math.max(0, rect.x - 2) + "px", top: (above ? rect.y - 26 : rect.y + rect.h + 8) + "px" });
      },
      hide: function () { if (box) box.style.display = "none"; if (chip) chip.style.display = "none"; },
      mark: function (items) {
        if (!ensure()) return;
        while (pins.firstChild) pins.removeChild(pins.firstChild);
        marks = [];
        for (var i = 0; i < items.length; i++) marks.push({ id: items[i].id, el: items[i].el, confidence: items[i].confidence, dot: pin(items[i]) });
        place();
      },
      place: place,
      marked: function () { return marks.length; },
      flash: function (id) {
        for (var i = 0; i < marks.length; i++) {
          if (marks[i].id !== id || !marks[i].el) continue;
          try { marks[i].el.scrollIntoView({ block: "center", inline: "nearest" }); } catch { /* ignore */ }
          var r = rectOf(marks[i].el);
          if (r) { ensure(); setStyle(box.style, { display: "block", left: r.x + "px", top: r.y + "px", width: r.w + "px", height: r.h + "px" }); chip.style.display = "none"; }
          place();
          return true;
        }
        return false;
      },
      remove: function () { cursor(false); try { if (host && host.parentNode) host.parentNode.removeChild(host); } catch { /* ignore */ } host = root = box = chip = pins = null; marks = []; },
    };
  }

  // ctx: { win, doc, frameId, frameRef(), children(), unavailable(), findFrame(source) }
  function createAnnotator(ctx) {
    var win = ctx.win, doc = ctx.doc;
    var loc = doc.location || win.location;
    var overlay = createOverlay(doc, function (id) { report({ type: "marker", id: id }); });
    var active = false;
    var channel = null;         // who turned it on, and who results go back to
    var hovering = null;
    var pending = 0;
    var bound = [];
    var watching = [];          // the listeners that keep markers on their elements
    var showing = false;        // markers are up in this document

    function sameOrigin(origin) { return origin === loc.origin || origin === "null" || loc.origin === "null"; }
    function downOk(origin) { return sameOrigin(origin) || (!!config.parentOrigin && origin === config.parentOrigin); }
    function targetOriginFor(origin) { return origin === "null" ? "*" : origin; }
    function post(target, origin, msg) {
      try { target.postMessage(msg, origin); } catch (err) { debug("annotate: could not post:", err && err.message); }
    }
    function report(msg) {
      if (!channel) return;
      post(channel.win, channel.origin, Object.assign({ engelbart: ANNOTATE, v: ANNOTATE_V, dir: "up" }, msg));
    }
    function tellChildren(msg) {
      var out = Object.assign({ engelbart: ANNOTATE, v: ANNOTATE_V, dir: "down" }, msg);
      ctx.children().forEach(function (el) {
        var w = null;
        try { w = el.contentWindow; } catch { w = null; }   // another origin: it is reported unavailable, not driven
        if (w && w !== win) post(w, targetOriginFor(loc.origin), out);
      });
    }

    // A child's report, coming up through this frame: the rect moves into
    // this document's coordinates and this frame's selector joins the
    // path, so what reaches the workspace is where it is on screen and
    // which frames it sits inside.
    function liftThrough(msg, el) {
      var out = Object.assign({}, msg);
      var r = null;
      try { r = el.getBoundingClientRect(); } catch { r = null; }
      if (out.rect && r) out.rect = { x: Math.round(out.rect.x + r.left), y: Math.round(out.rect.y + r.top), w: out.rect.w, h: out.rect.h };
      var f = out.anchor && out.anchor.frame ? out.anchor.frame : out.frame;
      if (f) {
        f.path = [selectorFor(el)].concat(f.path || []);
        if (!f.selectorInParent) f.selectorInParent = selectorFor(el);
        if (!f.name) f.name = iframeNameOf(el);
        if (typeof f.depth === "number") f.depth = f.depth + 1;
      }
      return out;
    }
    function iframeNameOf(el) {
      try { var n = el.getAttribute("name") || el.getAttribute("id") || el.getAttribute("title"); return n ? cap(n, 64) : null; } catch { return null; }
    }

    function pathTarget(e) { var path = e.composedPath ? e.composedPath() : null; return (path && path[0]) || e.target; }
    function draw() {
      pending = 0;
      if (!active || !hovering || !hovering.isConnected) { overlay.hide(); return; }
      var r = rectOf(hovering);
      if (!r || (!r.w && !r.h)) { overlay.hide(); return; }
      overlay.show(r, hoverLabel(describe(hovering), r));
    }
    function schedule() {
      if (pending) return;
      try { pending = win.requestAnimationFrame(draw); } catch { draw(); }
    }
    function onMove(e) {
      if (!active) return;
      var el = annotatableAt(pathTarget(e));
      if (el === hovering) return;
      hovering = el;
      schedule();
    }
    function onLeave() { hovering = null; schedule(); }
    function onViewport() { if (active) schedule(); if (showing) overlay.place(); }
    function watch() {
      if (watching.length) return;
      var place = safely(function () { overlay.place(); });
      [["scroll", { capture: true, passive: true }], ["resize", { capture: false, passive: true }]].forEach(function (pair) {
        try { win.addEventListener(pair[0], place, pair[1]); watching.push([pair[0], place, pair[1]]); } catch { /* ignore */ }
      });
    }
    function unwatch() {
      watching.forEach(function (w) { try { win.removeEventListener(w[0], w[1], w[2]); } catch { /* ignore */ } });
      watching = [];
    }
    // Where each saved note belongs in this document now. Only what was
    // found is reported: a frame that does not hold an element says
    // nothing about it, and the workspace treats what nobody claimed as
    // unresolved rather than guessing which frame lost it.
    function show(items) {
      var found = [], report_ = [];
      for (var i = 0; i < items.length && i < 200; i++) {
        var item = items[i];
        if (!item || typeof item.id !== "string") continue;
        var got = resolveAnchor(doc, item.anchor);
        if (!got.el) continue;
        found.push({ id: item.id, el: got.el, confidence: got.confidence });
        report_.push({ id: item.id, confidence: got.confidence, matchedOn: got.matchedOn, changed: got.changed, rect: rectOf(got.el) || null });
      }
      showing = found.length > 0;
      overlay.mark(found);
      if (showing) watch(); else unwatch();
      if (report_.length) report({ type: "resolved", items: report_, frame: ctx.frameRef() });
    }
    // With neither markers nor picker there is nothing for the overlay to
    // draw, so it leaves the page rather than sitting there empty.
    function clearMarks() {
      showing = false; unwatch();
      if (active) overlay.mark([]); else overlay.remove();
    }
    // The application does not get this click, this keypress or this
    // drag: while a note is being placed, the pointer belongs to the
    // picker. The bridge's own listeners are on the document, so stopping
    // here — on the window, in the capture phase — also keeps the pick
    // out of the trace.
    function swallow(e) { if (!active || overlay.owns(e)) return; e.preventDefault(); e.stopPropagation(); }
    function onClick(e) {
      if (!active) return;
      if (overlay.owns(e)) return;     // a marker is Engelbart's, not the page's: let it have its click
      e.preventDefault(); e.stopPropagation();
      var el = annotatableAt(pathTarget(e));
      if (!el) return;
      hovering = el; schedule();
      var d = describe(el);
      report({
        type: "picked",
        rect: rectOf(el) || d.rect || null,
        label: shortLabel(d),
        anchor: { element: d, ancestors: ancestorsOf(el), frame: ctx.frameRef(), route: route(loc), documentTitle: cap(doc.title, 120) },
      });
    }
    function onKey(e) {
      if (!active) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); report({ type: "exited" }); setMode(false); return; }
      e.stopPropagation();
    }

    function add(target, type, fn, options) {
      var wrapped = safely(fn);
      try { target.addEventListener(type, wrapped, options); bound.push([target, type, wrapped, options]); } catch { /* ignore */ }
    }
    function listen() {
      add(win, "pointermove", onMove, { capture: true, passive: true });
      add(win, "pointerdown", swallow, { capture: true, passive: false });
      add(win, "mousedown", swallow, { capture: true, passive: false });
      add(win, "mouseup", swallow, { capture: true, passive: false });
      add(win, "dblclick", swallow, { capture: true, passive: false });
      add(win, "contextmenu", swallow, { capture: true, passive: false });
      add(win, "click", onClick, { capture: true, passive: false });
      add(win, "keydown", onKey, { capture: true, passive: false });
      add(win, "scroll", onViewport, { capture: true, passive: true });
      add(win, "resize", onViewport, { capture: false, passive: true });
      add(doc, "pointerleave", onLeave, { capture: true, passive: true });
    }
    function unlisten() {
      bound.forEach(function (b) { try { b[0].removeEventListener(b[1], b[2], b[3]); } catch { /* ignore */ } });
      bound = [];
    }
    function setMode(next) {
      if (active === next) return;
      active = next;
      hovering = null;
      if (active) { listen(); overlay.ensure(); } else unlisten();
      overlay.cursor(active);
      overlay.hide();
      if (!active && !showing) overlay.remove();
    }

    function announce() {
      report({ type: "ready", frame: ctx.frameRef(), route: route(loc), title: cap(doc.title, 120), unavailable: ctx.unavailable() });
    }
    function receive(e) {
      var msg = e.data;
      if (!msg || msg.engelbart !== ANNOTATE || typeof msg.type !== "string") return;
      if (msg.dir === "down") {
        if (!e.source || e.source === win || e.source !== win.parent || !downOk(e.origin)) return;
        channel = { win: e.source, origin: targetOriginFor(e.origin) };
        if (msg.type === "mode") {
          setMode(msg.on === true);
          tellChildren({ type: "mode", on: msg.on === true });
          if (active) announce();
        } else if (msg.type === "show") {
          var items = Array.isArray(msg.items) ? msg.items : [];
          if (items.length) show(items); else clearMarks();
          tellChildren({ type: "show", items: items });
        } else if (msg.type === "flash") {
          if (!overlay.flash(msg.id)) tellChildren({ type: "flash", id: msg.id });
        }
        return;
      }
      if (msg.dir === "up") {
        if (!e.source || e.source === win || !sameOrigin(e.origin)) return;
        var el = ctx.findFrame(e.source);
        if (!el) return;
        report(liftThrough(msg, el));
      }
    }

    return {
      receive: receive,
      detach: function () { setMode(false); clearMarks(); overlay.remove(); channel = null; },
      state: function () { return { active: active, channel: !!channel, hovering: hovering ? selectorFor(hovering) : null, label: hovering ? hoverLabel(describe(hovering), rectOf(hovering)) : null, markers: overlay.marked() }; },
      resolve: function (anchor) { var got = resolveAnchor(doc, anchor); return { confidence: got.confidence, matchedOn: got.matchedOn, changed: got.changed, selector: got.el ? selectorFor(got.el) : null }; },
      annotatableAt: annotatableAt,
    };
  }

  // ---- this document
  var script = document.currentScript;
  if (script && script.dataset && script.dataset.config) {
    try { var given = JSON.parse(script.dataset.config); for (var key in given) if (key in config && typeof given[key] === typeof config[key]) config[key] = given[key]; } catch (e) { debug("ignoring data-config:", e && e.message); }
  }
  var frameId = script && script.dataset && script.dataset.frame ? String(script.dataset.frame) : null;
  var minted = frameId ? "gateway" : "bridge";
  if (!frameId || !/^f_[a-z0-9]{6,32}$/.test(frameId)) { frameId = randomId("f_", 10); minted = "bridge"; }
  var transport = createTransport(frameId);
  var top = createFrameBridge({ win: window, doc: document, frameId: frameId, transport: transport, own: true, minted: minted, depth: window.parent === window ? 0 : null });
  try { Object.defineProperty(window, "__engelbart", { value: top.api, enumerable: false, configurable: true }); } catch { window.__engelbart = top.api; }

  top.hello();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", safely(function () { top.loaded(); }), { once: true });
  else top.loaded();
  window.addEventListener("pagehide", safely(function () { top.flushAll(true); transport.flush(true); }));
  document.addEventListener("visibilitychange", safely(function () { if (document.visibilityState === "hidden") { top.flushAll(true); transport.flush(true); } }));
  debug("frame " + frameId + " observing " + safeUrl(location.href));
})();
