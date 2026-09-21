// The preload: how an application's model calls become visible without
// the application being changed.
//
// hc launches the artifact with `--require` pointing here, so this runs
// before the application's first line and before any SDK has captured a
// transport. All it does is redirect: an outbound HTTP request keeps its
// method, headers, body, stream, timeouts, retries and abort, and is sent
// to the model gateway with its original destination written into the
// path. The gateway does the rest — recognising a provider, decoding,
// redacting, minting a call id. Nothing here knows what a model is.
//
//   https://api.openai.com/v1/chat/completions
//     -> http://127.0.0.1:43200/t/<token>/https/api.openai.com/v1/chat/completions
//
// The application is never told. It believes it is calling its own URL,
// because as far as anything it can observe goes, it is.
//
// Three rules shape everything below.
//
// It must never cost the run. Any failure here — a missing module, a
// malformed marker, a hook that throws — leaves the original call to
// happen exactly as it would have. The whole file is one try/catch and
// so is every hook, and a hook that cannot decide forwards. Failure to
// observe is not failure to run.
//
// It must never speak. A line on the application's stdout or stderr is
// Engelbart's words inside the artifact's log, and hc reads certain
// lines there as the application having crashed and sends an agent to
// repair it — so instrumentation that complained out loud could get the
// repository edited, which is the one outcome all of this exists to
// prevent. Everything this has to say goes to the gateway instead.
//
// It must only wake up where it belongs. The gate is positive: a marker
// hc puts in the artifact's process and nowhere else. Engelbart's own
// services, the gateways, and the agents that repair repositories run
// in the same sandbox and must stay untouched — an agent's own model
// calls filed as the artifact's would not be a gap in the trace, it
// would be a false one.
"use strict";

const ARMED = Symbol.for("engelbart.modelCapture.armed");
const MARKER = "ENGELBART_MODEL_CAPTURE";
// Undici and Node's built-in fetch find the global dispatcher here.
const DISPATCHER = Symbol.for("undici.globalDispatcher.1");
// Client TLS material the gateway cannot carry upstream. A request that
// brings any of it is left alone: capture is worth less than a
// connection the application set up on purpose.
const TLS_KEYS = ["ca", "cert", "key", "pfx", "rejectUnauthorized", "checkServerIdentity", "secureContext", "clientCertEngine", "crl", "ciphers", "pskCallback"];

// Hosts that look local but are a model endpoint anyway: a model served
// on the same machine or the same network. Named by the run, since
// nothing about the address itself can say which it is.
const alsoExternal = new Set(String(process.env.ENGELBART_MODEL_CAPTURE_LOCAL || "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean));

// Addresses that are the application talking to itself or to something
// beside it: its own API routes, its database, a sidecar, the gateway.
// Redirecting those would add a hop and a risk for something that was
// never going to be a model call.
function isLocal(hostname) {
  const h = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!h || h === "localhost" || h === "::1" || h === "0.0.0.0") return true;
  if (h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^(fe80|fc|fd)/.test(h) && h.includes(":")) return true;
  // A name with no dot is a host on this machine or this network, not a
  // provider on the internet.
  return !h.includes(".") && !/^\d+$/.test(h);
}

try { arm(); } catch { /* an artifact must not be able to tell this file exists */ }

function arm() {
  const marker = process.env[MARKER];
  if (!marker) return;                                  // not this run's application
  if (globalThis[ARMED]) return;                        // already, in this realm
  // Defence in depth behind the marker: Engelbart's own processes carry
  // things no artifact does, and must never be watched as one.
  if (process.env.ENGELBART_TRACE_TOKEN) return;        // a gateway
  const entry = String(process.argv[1] || "");
  if (entry.startsWith("/opt/engelbart") || entry.startsWith("/opt/hc")) return;

  let base;
  try {
    base = new URL(marker);
    if (base.protocol !== "http:" && base.protocol !== "https:") return;
    if (!/^\/t\/[^/]+\/?$/.test(base.pathname)) return;
  } catch { return; }
  const prefix = base.origin + base.pathname.replace(/\/$/, "");
  const selfHost = base.host.toLowerCase();
  globalThis[ARMED] = true;

  const http = require("node:http");
  const https = require("node:https");
  // Captured before anything is replaced. Every redirect goes out
  // through these, never through the patched functions, or one request
  // becomes a chain of them.
  const original = { http: http.request, httpGet: http.get, https: https.request, httpsGet: https.get, fetch: globalThis.fetch };

  // ---- which interaction a call belongs to ----------------------------
  //
  // The collector can guess from the clock: a model call made while
  // exactly one application request was open probably belongs to it.
  // That is an association, it is only right while one request is open,
  // and it says so. Here the answer is known rather than guessed. The
  // browser tags the request, the preview gateway adds its own id and
  // passes both on, and this holds them for the whole of handling that
  // request — through a server action that answers before its work is
  // finished, through an SDK's retry, through anything that was started
  // while the request was being handled.
  //
  // Reading them is all this does. They are put back on the hop to the
  // gateway and go no further; the provider never sees them.
  let handling = null;
  try {
    const { AsyncLocalStorage } = require("node:async_hooks");
    handling = new AsyncLocalStorage();
    const scope = (prototype) => {
      const emit = prototype.emit;
      prototype.emit = function (event, ...rest) {
        if (event !== "request") return emit.call(this, event, ...rest);
        const headers = (rest[0] && rest[0].headers) || {};
        const context = { interaction: headers["x-engelbart-interaction"], request: headers["x-engelbart-request"] };
        if (!context.interaction && !context.request) return emit.call(this, event, ...rest);
        return handling.run(context, () => emit.call(this, event, ...rest));
      };
    };
    scope(require("node:http").Server.prototype);
    scope(require("node:https").Server.prototype);
  } catch { handling = null; }   // calls are still caught; the collector falls back to timing
  const claim = (headers) => {
    const context = handling && handling.getStore();
    if (!context) return headers;
    const pairs = [["x-engelbart-interaction", context.interaction], ["x-engelbart-request", context.request]].filter(([, v]) => v);
    // undici takes headers as an object or as a flat array of pairs.
    if (Array.isArray(headers)) return [...headers, ...pairs.flat()];
    const out = { ...headers };
    for (const [name, value] of pairs) out[name] = value;
    return out;
  };

  let thread = null;
  try {
    const { isMainThread, threadId } = require("node:worker_threads");
    if (!isMainThread) thread = "worker " + threadId;
  } catch { /* an older runtime without threads is the main one by definition */ }

  const transports = [];   // the layers installed
  const used = [];         // and the ones that actually carried something
  // Redirecting into a gateway that is not there would turn every model
  // call into a connection error: the observer breaking the thing it
  // watches, which is the one failure that must not be possible. So the
  // first sign that the gateway has gone stops the redirecting, and
  // everything after it goes straight out the way it always would.
  // One call is lost rather than all of them.
  //
  // Which is also why nothing is redirected until the gateway has
  // answered once. Being wrong about a gateway that is not there would
  // cost the application its first model call, and losing sight of a
  // call costs nothing but the sight of it. The check is a loopback
  // round trip made as this file loads, and an application does not
  // reach its first model call until it has bound a port and been
  // asked for something, so in practice nothing is missed — and when
  // something is, it is counted and said.
  let ready = false;
  let down = false;
  let missed = 0;
  const GONE = new Set(["ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH", "ENOTFOUND", "EPIPE", "EADDRNOTAVAIL"]);
  const gatewayFailed = (error) => {
    const code = error && (error.code || (error.cause && error.cause.code));
    // An upstream that cannot be reached comes back as a 502 from the
    // gateway, not as a socket error, so a socket error on this hop is
    // the gateway itself.
    if (down || !GONE.has(code)) return;
    down = true;
    report("unavailable", "the model gateway stopped answering (" + code + "); calls are going direct and are not being watched");
  };

  // Where the request would have gone, or null to leave it alone.
  //
  // This is the whole policy, and it is about transport and never about
  // content: no body is read, no provider is guessed, no host list is
  // consulted. Everything the application sends out of the sandbox goes
  // through the gateway, and the gateway decides what is worth reading.
  // A host list here would mean a provider the gateway could have
  // recognised by shape never reaching it.
  const routeFor = (url, headers) => {
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (down) return null;
    if (!ready) {
      // Only count what would have been redirected, so an application
      // talking to itself does not read as a missed model call.
      if (!isLocal(url.hostname) || alsoExternal.has(url.host.toLowerCase())) missed += 1;
      return null;
    }
    const host = url.host.toLowerCase();
    if (host === selfHost) return null;                 // already ours
    if (isLocal(url.hostname) && !alsoExternal.has(host) && !alsoExternal.has(url.hostname.toLowerCase())) return null;
    // A handshake is not a request, and a proxy that reads both sides
    // cannot forward one. Left alone, it succeeds the way it always did.
    if (headerOf(headers, "upgrade")) return null;
    return prefix + "/" + url.protocol.slice(0, -1) + "/" + url.host + url.pathname + url.search;
  };

  const headerOf = (headers, name) => {
    if (!headers) return null;
    if (typeof headers.get === "function") return headers.get(name);
    for (const k of Object.keys(headers)) if (k.toLowerCase() === name) return headers[k];
    return null;
  };

  // ---- the dispatcher Node's fetch and undici share -------------------
  //
  // The audit's sharpest finding was that a dispatcher hook can be
  // replaced with no error and no missing-data signal, which is worse
  // than not having one: a trace that looks healthy and is empty. So it
  // is wrapped through a proxy (everything but dispatch passes through,
  // instanceof still holds), re-checked before every request we see, and
  // a replacement is reported rather than absorbed.
  let dispatcherState = "absent";
  // Shadowing the one method on the instance, rather than standing a
  // proxy in front of it. A proxy looks tidier and is wrong: undici's
  // agents and pools keep private state, and a method reached through a
  // proxy runs with the proxy as `this`, which either throws or hangs.
  // An own property leaves the object, its prototype chain and its
  // identity exactly as they were.
  const wrapDispatcher = (real) => {
    if (!real || typeof real.dispatch !== "function" || real[ARMED]) return real;
    const inner = real.dispatch.bind(real);
    Object.defineProperty(real, "dispatch", {
      configurable: true, writable: true, enumerable: false,
      value: function dispatch(options, handler) {
        try {
          const rewritten = rewriteDispatch(options);
          if (rewritten) return inner(rewritten, handler);
        } catch { /* fall through to exactly what would have happened */ }
        return inner(options, handler);
      },
    });
    Object.defineProperty(real, ARMED, { value: true, configurable: true });
    return real;
  };
  const rewriteDispatch = (options) => {
    if (!options || !options.origin) return null;
    const url = new URL(String(options.path ?? "/"), String(options.origin));
    const to = routeFor(url, options.headers);
    if (!to) return null;
    note("undici");
    const target = new URL(to);
    return { ...options, origin: target.origin, path: target.pathname + target.search, headers: claim(options.headers ?? {}) };
  };
  const ensureDispatcher = () => {
    try {
      const current = globalThis[DISPATCHER];
      if (!current) return;
      if (current[ARMED]) { dispatcherState = "wrapped"; return; }
      // undici defines the property non-configurably, so it cannot be
      // redefined — but it stays writable, so it can be wrapped again.
      globalThis[DISPATCHER] = wrapDispatcher(current);
      dispatcherState = dispatcherState === "absent" ? "wrapped" : "rewrapped";
      if (dispatcherState === "rewrapped") { said.delete("active"); report("active", "the global dispatcher was replaced and has been wrapped again"); }
    } catch { dispatcherState = "unreachable"; }
  };
  const define = Object.defineProperty;
  try {
    if (globalThis[DISPATCHER]) ensureDispatcher();
    else {
      // Nothing has made one yet. Catch a plain assignment making one.
      define(globalThis, DISPATCHER, {
        configurable: true, enumerable: false,
        get() { return this[Symbol.for("engelbart.dispatcher")]; },
        set(value) {
          define(this, Symbol.for("engelbart.dispatcher"), { value: wrapDispatcher(value), writable: true, configurable: true });
          dispatcherState = "wrapped";
        },
      });
    }
    // The accessor is not enough, and this is the finding the audit was
    // sharpest about. undici's setGlobalDispatcher does not assign, it
    // defines — over our accessor, with a property of its own that
    // cannot be redefined — and it does so with no error and no
    // missing-data signal, which is the worst failure available: a
    // trace that looks healthy and is empty. So the definition itself
    // is what we watch. Two comparisons on a hot path buys the one
    // guarantee worth having here: whoever installs a dispatcher,
    // whenever, we are on it before the next request.
    Object.defineProperty = function defineProperty(target, property, descriptor) {
      const defined = define(target, property, descriptor);
      if (target === globalThis && property === DISPATCHER) {
        try { wrapDispatcher(globalThis[DISPATCHER]); dispatcherState = "wrapped"; } catch { /* nothing changes for the caller */ }
      }
      return defined;
    };
    transports.push("undici");
  } catch { /* the fetch wrapper still covers Node's own fetch */ }

  // ---- http.request / https.request -----------------------------------
  //
  // The one that matters most in practice: openai v4 and every
  // node-fetch-based SDK arrive here and never touch globalThis.fetch.
  // .get is wrapped too, because Node's http.get calls the module's own
  // request rather than the exported one.
  const hookRequest = (module_, scheme, name, call) => {
    const ends = name === "get";
    module_[name] = function (...args) {
      try {
        ensureDispatcher();
        const redirected = redirectOptions(scheme, args);
        if (redirected) {
          note("http");
          // Out through http.request whatever came in: the gateway is a
          // plaintext loopback server, and https.request would try to
          // speak TLS to it. The scheme the application meant travels
          // in the path instead, and the gateway dials that.
          const sent = original.http.apply(http, redirected);
          sent.on("error", gatewayFailed);
          if (ends) sent.end();
          return sent;
        }
      } catch { /* fall through */ }
      return call.apply(this, args);
    };
  };
  // http.request takes (url), (url, options), (options) and any of them
  // with a callback. Normalised here, rewritten, and handed back in the
  // one shape that always works: (options, callback).
  const redirectOptions = (scheme, args) => {
    const callback = typeof args[args.length - 1] === "function" ? args[args.length - 1] : undefined;
    const positional = callback ? args.slice(0, -1) : args.slice();
    let url = null; let options = {};
    if (typeof positional[0] === "string" || positional[0] instanceof URL) {
      url = new URL(String(positional[0]));
      options = positional[1] && typeof positional[1] === "object" ? { ...positional[1] } : {};
    } else if (positional[0] && typeof positional[0] === "object") {
      options = { ...positional[0] };
      const host = options.hostname || options.host || "localhost";
      const port = options.port ? ":" + options.port : "";
      const protocol = options.protocol || scheme + ":";
      url = new URL(`${protocol}//${host.includes(":") && !host.startsWith("[") ? host : host + port}${options.path || "/"}`);
    } else return null;

    // A caller that configured TLS itself gets the connection it
    // configured. The gateway cannot carry a client certificate or a
    // pinned authority upstream, so redirecting would quietly change
    // what the application asked for.
    if (TLS_KEYS.some((k) => options[k] !== undefined)) return null;

    const to = routeFor(url, options.headers);
    if (!to) return null;
    const target = new URL(to);
    const headers = claim({ ...(options.headers || {}) });
    // What the application meant by Host is kept; the gateway sends the
    // destination's own Host upstream from the path.
    headers.host = url.host;
    const rewritten = {
      ...options,
      protocol: "http:", hostname: target.hostname, host: undefined, port: target.port,
      path: target.pathname + target.search, headers,
      // An https agent cannot carry a plaintext hop. The default one can.
      agent: undefined, servername: undefined, setHost: false,
    };
    for (const k of TLS_KEYS) delete rewritten[k];
    return callback ? [rewritten, callback] : [rewritten];
  };
  hookRequest(http, "http", "request", original.http);
  hookRequest(http, "http", "get", original.httpGet);
  hookRequest(https, "https", "request", original.https);
  hookRequest(https, "https", "get", original.httpsGet);
  transports.push("http");

  // ---- globalThis.fetch ------------------------------------------------
  //
  // openai v5 and recent Anthropic SDKs read globalThis.fetch once, in
  // their constructor, which is why this has to be in place before the
  // application's first line rather than merely before its first call.
  if (typeof original.fetch === "function") {
    globalThis.fetch = function fetch(input, init) {
      try {
        ensureDispatcher();
        const request = redirectFetch(input, init);
        if (request) {
          note("fetch");
          const answer = original.fetch.call(this, request, undefined);
          // Watched on a branch, so the caller still owns the promise
          // it was given and neither of them goes unhandled.
          answer.then(null, gatewayFailed);
          return answer;
        }
      } catch { /* fall through */ }
      return original.fetch.call(this, input, init);
    };
    transports.push("fetch");
  }
  const redirectFetch = (input, init) => {
    const isRequest = typeof Request !== "undefined" && input instanceof Request;
    const url = new URL(isRequest ? input.url : String(input && input.url ? input.url : input));
    const headers = (init && init.headers) || (isRequest ? input.headers : null);
    const to = routeFor(url, headers);
    if (!to) return null;
    // Building a Request from the original carries the method, headers,
    // body stream, signal, duplex, credentials and redirect mode over
    // unchanged, so a stream still streams and an abort still aborts.
    const built = isRequest && !init ? new Request(to, input) : new Request(to, { ...(isRequest ? requestInit(input) : {}), ...(init || {}) });
    const context = handling && handling.getStore();
    if (context) {
      if (context.interaction) built.headers.set("x-engelbart-interaction", context.interaction);
      if (context.request) built.headers.set("x-engelbart-request", context.request);
    }
    return built;
  };
  const requestInit = (request) => ({
    method: request.method, headers: request.headers, body: request.body, signal: request.signal,
    redirect: request.redirect, referrer: request.referrer, referrerPolicy: request.referrerPolicy,
    mode: request.mode, credentials: request.credentials, integrity: request.integrity,
    keepalive: request.keepalive, duplex: request.body ? "half" : undefined,
  });

  // ---- saying so -------------------------------------------------------
  //
  // Every realm reports, because every realm has to make its own
  // liveness check before it may redirect anything, and the report is
  // that check. A worker thread runs this file too — Next's compiler
  // and route workers are worker threads — so it says which one it is
  // rather than staying silent and never arming.
  const said = new Set();
  function note(kind) {
    if (!used.includes(kind)) { used.push(kind); said.delete("active"); }
    report("active", "watching over " + used.join(", "));
  }
  // `available` is armed and waiting; `active` is having actually
  // caught something. They are different facts and the run wants both:
  // an application that was watched and made no model calls reads
  // nothing like one that was never watched.
  function report(state, detail) {
    const key = state + "\u0000" + detail;
    if (said.has(key) || (state === "active" && said.has("active"))) return;
    said.add(key);
    if (state === "active") said.add("active");
    try {
      const target = new URL(prefix + "/gateway/status");   // the gateway's own endpoint, not an upstream
      const body = JSON.stringify({ state, detail, transports, used, pid: process.pid, thread, runtime: "node " + process.versions.node });
      const request = original.http.call(http, {
        protocol: "http:", hostname: target.hostname, port: target.port, path: target.pathname,
        method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) },
      });
      // Nothing waits for this and nothing is said if it fails. The
      // application must not be kept alive by our own socket.
      // The first report doubles as the liveness check. Any answer at
      // all means the gateway is there; only a socket error means it is
      // not.
      request.on("response", (answer) => {
        answer.resume();
        if (down) return;
        const first = !ready;
        ready = true;
        if (first && missed) report("active", "the gateway answered after " + missed + " call(s) had already gone out unwatched");
      });
      request.on("error", (err) => gatewayFailed(err));
      request.setTimeout(2000, () => { gatewayFailed({ code: "ECONNRESET" }); request.destroy(); });
      if (typeof request.unref === "function") request.unref();
      request.end(body);
    } catch { /* it was only a report */ }
  }
  report("available", "armed before the application, over " + transports.join(", ") + (thread ? ` (${thread})` : ""));
}
