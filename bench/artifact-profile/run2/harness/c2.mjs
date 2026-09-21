import { chromium } from "playwright-core";
const EXE = process.env.HOME + "/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const b = await chromium.launch({ executablePath: EXE, headless: true, args: ["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://127.0.0.1:4310/", { waitUntil: "load", timeout: 120000 });
await p.waitForTimeout(20000);
console.log(JSON.stringify(await p.evaluate(() => {
  const SKIP_TEXT = /^(script|style|noscript|template|textarea|select|input|option|datalist)$/;
  const opaque = (el) => SKIP_TEXT.test(el.localName) || el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true";
  const visibleText = (node, max) => {
    if (node.nodeType !== 1 || opaque(node)) return "";
    let out = "";
    const w = node.ownerDocument.createTreeWalker(node, 5, { acceptNode: (n) => (n.nodeType === 1 ? (opaque(n) ? 2 : 3) : 1) });
    let t; while ((t = w.nextNode())) { out += " " + t.data; if (out.length > max * 3) break; }
    return out.replace(/\s+/g, " ").trim().slice(0, max);
  };
  return [...document.querySelectorAll(".control-bar > button")].map((el, i) => ({
    i, cls: el.className, walked: visibleText(el, 80), textContent: el.textContent.replace(/\s+/g," ").trim().slice(0,60),
    firstTextNodeDepth: (() => { const w = document.createTreeWalker(el, 4); let n, d = 0; while ((n = w.nextNode())) { d++; if (n.data.trim()) return d; } return -1; })(),
    kids: [...el.children].map((c) => c.tagName + "." + c.className),
  }));
}), null, 1));
await b.close();
