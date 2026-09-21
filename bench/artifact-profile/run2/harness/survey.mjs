// The DOM survey the collector itself produces, at three moments of the
// interface's life. Nothing here is written by hand.
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
const EXE = process.env.HOME + "/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const b = await chromium.launch({ executablePath: EXE, headless: true, args: ["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://127.0.0.1:4311/", { waitUntil: "load", timeout: 120000 });
await p.waitForTimeout(20000);
const shots = {};
const take = async (label) => { shots[label] = await p.evaluate(() => window.__engelbart.survey()); };
await take("01-on-load");
await p.locator("button", { hasText: /^\s*Label/ }).first().click({ force: true }); await p.waitForTimeout(1200);
await take("02-label-menu-open");
await p.locator("button", { hasText: /^\s*Label/ }).first().click({ force: true });
await p.locator("button", { hasText: /^\s*Time/ }).first().click({ force: true }); await p.waitForTimeout(1200);
await take("03-time-menu-open");
await p.locator("button", { hasText: /^\s*Time/ }).first().click({ force: true });
await p.click("#search-bar-input"); await p.keyboard.type("translation"); await p.waitForTimeout(3000);
await take("04-search-results");
writeFileSync("pack/evidence/surveys.json", JSON.stringify(shots, null, 1));
for (const [k, v] of Object.entries(shots)) console.log(k, Array.isArray(v) ? `${v.length} entries` : JSON.stringify(v).slice(0, 120));
await b.close();
