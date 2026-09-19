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

    on(doc, "click", function (e) {
      flushKey();
      var target = targetOf(e);
      if (!target || target.nodeType !== 1) target = target && target.parentElement ? target.parentElement : doc.body;
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
      if (!el || el.nodeType !== 1) return;
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
    function detach() {
      try { if (observer) observer.disconnect(); } catch { /* ignore */ }
      timers.forEach(clearTimeout);
      frames.forEach(function (entry) { clearTimeout(entry.timer); if (entry.bridge) entry.bridge.detach(); });
      frames.clear();
      flushKey(); closeBurst("detach");
    }

    var api = {
      version: VERSION, frameId: frameId, describe: describe, selectorFor: selectorFor, classifyKey: classifyKey, editableKind: editableKind, safeUrl: safeUrl,
      configure: function (patch) { for (var k in patch) if (k in config) config[k] = patch[k]; },
      flush: function () { flushKey(); frames.forEach(function (entry) { if (entry.bridge) entry.bridge.flushAll(false); }); return transport.flush(false); },
      stats: function () { return { interactions: interactions, latest: latest, pendingRequests: pendingRequests, frames: frames.size, transport: transport.stats() }; },
      frames: function () { var out = []; frames.forEach(function (entry, el) { out.push({ frameId: entry.frameId, state: entry.state, reason: entry.reason, selector: selectorFor(el) }); }); return out; },
      parent: function () { return { parentFrameId: parentFrameId, depth: depth }; },
    };
    return { api: api, loaded: loaded, hello: hello, attached: attached, flushAll: flushAll, detach: detach };
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
