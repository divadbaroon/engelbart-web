// Reading a real interface, end to end, without a database.
//
// The pipeline this exercises is the real one: the bridge that ships in
// the E2B template runs in a jsdom document on its own origin, answers a
// `survey` over the origin-pinned control channel, and what comes back
// goes through the same readCandidateTree, signatureOf and
// analyzeInterface the workspace uses. Only the preview frame and the
// cache table are stood in for.
//
// It exists for two questions that cannot be answered by argument:
//   what does a model actually call the parts of THIS page, and
//   does the signature hold across the changes a running page makes?
//
// The second is the important one. The signature policy is a heuristic,
// and the mutations below are the ones a real application makes on its
// own — a new message in a list, a rerender with the same content, a
// button that becomes disabled, a screen that replaces another. A policy
// that moves on the first three is a cache that never hits.
//
//   npm run semantics:verify -- <file-or-url> [more...]
//   npm run semantics:verify -- --no-model <file>      (survey and signature only)
import fs from "node:fs";
import { JSDOM, VirtualConsole, requestInterceptor } from "jsdom";
import { readCandidateTree } from "../../lib/semantics/model.ts";
import { diffSignature, sayDiff, signatureOf, type SignaturePolicy, DEFAULT_POLICY } from "../../lib/semantics/signature.ts";
import { analyzeInterface } from "../../lib/semantics/analyze.ts";
import type { CandidateTree } from "../../lib/semantics/types.ts";

const BRIDGE = fs.readFileSync(new URL("../../sandbox/trace/bridge.js", import.meta.url), "utf8");
const APP = "http://app.test";
const SHELL = "https://engelbart.test";

// ---- the page, in a document the bridge is really in
type Loaded = { dom: JSDOM; doc: Document; survey: () => unknown };

async function load(html: string, path = "/"): Promise<Loaded> {
  const serve = requestInterceptor((request: Request) =>
    request.url.startsWith(APP) ? new Response(html, { headers: { "Content-Type": "text/html" } }) : new Response("", { status: 404 }));
  const dom = new JSDOM(`<!doctype html><html><body><iframe src="${APP}${path}"></iframe></body></html>`, {
    runScripts: "dangerously", url: `${SHELL}/`, resources: { interceptors: [serve] }, virtualConsole: new VirtualConsole(),
  });
  const shell = dom.window as unknown as Window & typeof globalThis;
  await new Promise<void>((r) => (shell.document.readyState === "complete" ? r() : shell.addEventListener("load", () => r())));
  const frame = shell.document.querySelector("iframe") as HTMLIFrameElement;
  await new Promise<void>((r) => (frame.contentDocument?.body ? r() : frame.addEventListener("load", () => r(), { once: true })));
  const doc = frame.contentDocument as Document;
  const win = frame.contentWindow as unknown as Record<string, unknown>;
  (win as { fetch: unknown }).fetch = () => Promise.resolve({ ok: true, status: 204 });
  const script = doc.createElement("script");
  script.dataset.frame = "f_verify0001";
  script.dataset.config = JSON.stringify({ flushMs: 5, parentOrigin: SHELL });
  script.textContent = BRIDGE;
  doc.head.appendChild(script);
  const api = (win as { __engelbart?: { survey: () => unknown } }).__engelbart;
  if (!api?.survey) throw new Error("the bridge did not take, or this build has no survey");
  return { dom, doc, survey: () => ({ route: path, documentTitle: doc.title || null, frame: { frameId: "f_verify0001", name: null, selectorInParent: null, path: [], depth: 0, kind: "document" }, ...(api.survey() as object) }) };
}

const treeOf = (l: Loaded): CandidateTree => {
  const tree = readCandidateTree(l.survey());
  if (!tree) throw new Error("the document offered nothing that could be read");
  return tree;
};

// ---- the changes a running application makes on its own
// A mutation says what it touched, so a signature that did not move can
// be told from one that had nothing to move about: the survey is capped,
// and an element outside the cap is not part of the interface as far as
// any of this is concerned.
type Mutation = { name: string; hope: "holds" | "moves"; why: string; run: (doc: Document) => string | null };
const said = (el: Element) => `<${el.localName}${el.id ? `#${el.id}` : ""}> ${JSON.stringify((el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 32))}`;

const MUTATIONS: Mutation[] = [
  {
    name: "a rerender with the same content", hope: "holds",
    why: "React replaces a subtree with an identical one on every state change",
    run: (doc) => { const el = doc.querySelector("main, article, section, body > div"); if (!el) return null; el.innerHTML = el.innerHTML; return said(el); },
  },
  {
    name: "a new item in the longest list", hope: "holds",
    why: "a message arrives in a conversation, or a model writes another line of output",
    run: (doc) => {
      const lists = [...doc.querySelectorAll("ul, ol, tbody")].sort((a, b) => b.children.length - a.children.length);
      const list = lists[0];
      if (!list?.lastElementChild) return null;
      const copy = list.lastElementChild.cloneNode(true) as Element;
      copy.textContent = "Something else was said here, later.";
      list.appendChild(copy);
      return said(copy);
    },
  },
  {
    name: "text changing inside a paragraph", hope: "holds",
    why: "an answer appears where a placeholder was; the parts of the interface are the same parts",
    run: (doc) => { const p = doc.querySelector("p"); if (!p) return null; p.textContent = "A completely different sentence now stands here."; return said(p); },
  },
  {
    name: "a control becoming disabled", hope: "moves",
    why: "the interface offers something different from what it offered",
    run: (doc) => { const b = doc.querySelector("button, input, select, [role=button]"); if (!b) return null; b.setAttribute("disabled", ""); return said(b); },
  },
  {
    name: "a control being renamed", hope: "moves",
    why: "the same element now says it does something else",
    run: (doc) => {
      const b = doc.querySelector("button, [role=button], [aria-label], th, h1, h2, li");
      if (!b) return null;
      const was = said(b);
      b.textContent = "Do the other thing";
      if (b.hasAttribute("aria-label")) b.setAttribute("aria-label", "Do the other thing");
      return was;
    },
  },
  {
    name: "a whole screen replacing another", hope: "moves",
    why: "this is a different interface, and a reading of the old one would be wrong about it",
    run: (doc) => { if (!doc.body) return null; doc.body.innerHTML = `<main><h1>Settings</h1><form><label for="k">API key</label><input id="k" name="key"><button type="submit">Save</button></form></main>`; return "the whole body"; },
  },
];

const policies: Record<string, SignaturePolicy> = {
  default: DEFAULT_POLICY,
  "repeats=count": { ...DEFAULT_POLICY, repeats: "count" },
  "text=none": { ...DEFAULT_POLICY, namingText: "none" },
  "text=all": { ...DEFAULT_POLICY, namingText: "all" },
  "no-structure": { ...DEFAULT_POLICY, structure: false },
};

async function verify(source: string, useModel: boolean) {
  const isUrl = /^https?:\/\//.test(source);
  const html = isUrl ? await (await fetch(source)).text() : fs.readFileSync(source, "utf8");
  const route = isUrl ? new URL(source).pathname : "/";
  console.log(`\n${"=".repeat(72)}\n${source}\n${"=".repeat(72)}`);

  const base = await load(html, route);
  const tree = treeOf(base);
  const { signature, parts } = signatureOf(tree);
  console.log(`\nSurvey: ${tree.candidates.length} candidate${tree.candidates.length === 1 ? "" : "s"}, title ${JSON.stringify(tree.documentTitle ?? "")}.`);
  if (tree.truncated) console.log("  NOTE: the document offered more parts than the cap allows. Everything below is about the first 120, and a change outside them cannot move the signature.");
  console.log(`Signature (default policy): ${signature}`);
  const kinds = new Map<string, number>();
  for (const c of tree.candidates) kinds.set(c.target.tag ?? "?", (kinds.get(c.target.tag ?? "?") ?? 0) + 1);
  console.log(`Tags: ${[...kinds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k}×${n}`).join(" ")}`);
  base.dom.window.close();

  console.log("\n--- what the signature does when the page changes ---");
  for (const m of MUTATIONS) {
    const after = await load(html, route);
    const did = m.run(after.doc);
    if (!did) { console.log(`  (skipped) ${m.name} — this page has nothing to do it to`); after.dom.window.close(); continue; }
    const now = signatureOf(treeOf(after));
    const held = now.signature === signature;
    const right = held === (m.hope === "holds");
    console.log(`  ${right ? "ok  " : "BAD "} ${m.name}: ${held ? "held" : "moved"} (hoped it would ${m.hope === "holds" ? "hold" : "move"}) — ${m.why}`);
    console.log(`         touched ${did}`);
    if (!held) console.log(`         ${sayDiff(diffSignature(parts, now.parts))}`);
    after.dom.window.close();
  }

  console.log("\n--- the same page under other policies (the knob) ---");
  for (const [name, policy] of Object.entries(policies)) {
    const again = await load(html, route);
    const sig = signatureOf(treeOf(again), policy);
    const added = await load(html, route);
    MUTATIONS[1].run(added.doc);
    const sigAdded = signatureOf(treeOf(added), policy);
    console.log(`  ${name.padEnd(13)} ${sig.signature.slice(0, 12)}  · a new list item ${sig.signature === sigAdded.signature ? "holds" : "moves"} it`);
    again.dom.window.close(); added.dom.window.close();
  }

  if (!useModel) return;
  console.log("\n--- what a model calls the parts of it ---");
  const read = await analyzeInterface(tree, signature);
  if (!read.ok) { console.log(`  could not read it: ${read.error}`); return; }
  const m = read.map;
  console.log(`  Document: ${m.documentLabel ?? "(unnamed)"} [${m.documentConfidence}]`);
  console.log(`  For:      ${m.purpose ?? "(not said)"}`);
  for (const n of m.regions) console.log(`  region   ${n.label} (${n.kind}) [${n.confidence}] ← ${n.targets.length} element${n.targets.length === 1 ? "" : "s"}`);
  const names = new Map(m.regions.map((r) => [r.semanticId, r.label]));
  for (const n of m.controls) console.log(`  control  ${n.label} (${n.kind}) [${n.confidence}]${n.regionId ? ` in ${names.get(n.regionId) ?? n.regionId}` : ""} ← ${n.targets.map((t) => t.text ?? t.label ?? t.tag ?? "?").slice(0, 3).join(", ")}`);
  const ghosts = [...m.regions, ...m.controls].filter((n) => !n.targets.length);
  console.log(`  ${m.regions.length} regions, ${m.controls.length} controls, ${ghosts.length} pointing at nothing (must be 0).`);
}

const args = process.argv.slice(2);
const useModel = !args.includes("--no-model");
const sources = args.filter((a) => !a.startsWith("--"));
if (!sources.length) { console.error("usage: npm run semantics:verify -- <file-or-url> [more...] [--no-model]"); process.exit(1); }
for (const s of sources) await verify(s, useModel);
