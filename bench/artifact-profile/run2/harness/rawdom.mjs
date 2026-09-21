// The document itself, straight from the artifact, with no collector in the
// way: every element, every attribute, in tree order. Repeated sibling
// groups are collapsed with a count so the generated label layer does not
// bury the rest; nothing else is dropped or renamed.
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";
const EXE = process.env.HOME + "/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const b = await chromium.launch({ executablePath: EXE, headless: true, args: ["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://127.0.0.1:4310/", { waitUntil: "load", timeout: 120000 });
await p.waitForTimeout(20000);

const WALK = () => {
  const out = [];
  // Two siblings count as the same shape only when they are the same tag
  // AND carry the same class and the same attribute names. Without the
  // class, four buttons that differ only by "zoom-button-plus" versus
  // "zoom-button-minus" would collapse into one and the interface would
  // read as far simpler than it is.
  const sig = (el) => el.tagName + "|" + el.getAttribute("class") + "|" + [...el.attributes].map((a) => a.name).sort().join(",");
  const own = (el) => { let t = ""; for (const n of el.childNodes) if (n.nodeType === 3) t += n.nodeValue; return t.replace(/\s+/g, " ").trim(); };
  const walk = (el, depth) => {
    const lim = (n) => (n === "d" || n === "style" || n === "transform" || n === "viewBox" ? 40 : 90);
    const attrs = [...el.attributes].map((a) => `${a.name}=${JSON.stringify(a.value.length > lim(a.name) ? a.value.slice(0, lim(a.name)) + "…" : a.value)}`).join(" ");
    const text = own(el);
    out.push(`${"  ".repeat(depth)}<${el.tagName.toLowerCase()}${attrs ? " " + attrs : ""}>${text ? " " + JSON.stringify(text.length > 90 ? text.slice(0, 90) + "…" : text) : ""}`);
    const kids = [...el.children];
    let i = 0;
    while (i < kids.length) {
      let j = i; const s = sig(kids[i]);
      while (j + 1 < kids.length && sig(kids[j + 1]) === s) j++;
      const n = j - i + 1;
      if (n > 2) { walk(kids[i], depth + 1); out.push(`${"  ".repeat(depth + 1)}… ${n - 1} more siblings of the same shape`); }
      else for (let k = i; k <= j; k++) walk(kids[k], depth + 1);
      i = j + 1;
    }
  };
  walk(document.documentElement, 0);
  return out.join("\n");
};

const ATTRS = () => {
  const out = [];
  for (const el of document.querySelectorAll("*")) {
    const a = {};
    for (const at of el.attributes) a[at.name] = at.value;
    out.push({ tag: el.tagName.toLowerCase(), attrs: a });
  }
  return out;
};

const shots = {};
const attrs = {};
shots["01-on-load"] = await p.evaluate(WALK); attrs["01-on-load"] = await p.evaluate(ATTRS);
await p.locator("button", { hasText: /^\s*Label/ }).first().click({ force: true }); await p.waitForTimeout(1200);
shots["02-label-menu-open"] = await p.evaluate(WALK); attrs["02-label-menu-open"] = await p.evaluate(ATTRS);
await p.locator("button", { hasText: /^\s*Label/ }).first().click({ force: true });
await p.locator("button", { hasText: /^\s*Time/ }).first().click({ force: true }); await p.waitForTimeout(1200);
shots["03-time-menu-open"] = await p.evaluate(WALK); attrs["03-time-menu-open"] = await p.evaluate(ATTRS);
await p.locator("button", { hasText: /^\s*Time/ }).first().click({ force: true });
await p.click("#search-bar-input"); await p.keyboard.type("translation"); await p.waitForTimeout(3000);
shots["04-search-results"] = await p.evaluate(WALK); attrs["04-search-results"] = await p.evaluate(ATTRS);
await b.close();

let md = `# The document, as the browser holds it

Captured straight from the running artifact with no collector involved: every
element and every attribute, in tree order, at four moments of the interface's
life. Where more than three consecutive siblings have the same tag and the same
set of attribute names, the first is shown and the rest counted — that is the
only thing removed, and it is always counted.

Long attribute values and long text runs are cut at 90 characters with an ellipsis.
`;
for (const [k, v] of Object.entries(shots)) md += `\n## ${k} — ${v.split("\n").length} lines\n\n\`\`\`\n${v}\n\`\`\`\n`;
writeFileSync("pack/evidence/02-raw-dom.md", md);
writeFileSync("attrs.json", JSON.stringify(attrs));
for (const [k, v] of Object.entries(shots)) console.log(k, v.split("\n").length, "lines");
