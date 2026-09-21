import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { createWriteStream, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { SESSIONS } from "./sessions.mjs";
import { collect } from "./collect.mjs";

const R2 = "/private/tmp/claude-501/-Users-divadbaroon-Desktop-engelbart-web/9513afc7-e24b-43db-8b54-e5cd74b27ae9/scratchpad/run2";
const REPO = "/Users/divadbaroon/Desktop/engelbart-web";
const EXE = process.env.HOME + "/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const name = process.argv[2];
const port = Number(process.argv[3]);
if (!SESSIONS[name]) { console.error(`unknown session ${name}`); process.exit(2); }

const jsonl = `${R2}/sessions/${name}.jsonl`;
const out = createWriteStream(jsonl);
const gw = spawn("node", [`${REPO}/sandbox/trace/preview-gateway.mjs`, `${port}:4310:127.0.0.1`], { stdio: ["ignore", "pipe", "pipe"] });
gw.stdout.pipe(out);
gw.stderr.on("data", (d) => process.stderr.write(`[gw] ${d}`));
await sleep(2500);

const b = await chromium.launch({ executablePath: EXE, headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const t0 = Date.now();
const pause = (ms) => sleep(ms);
const drag = async (x1, y1, x2, y2) => {
  await p.mouse.move(x1, y1); await p.mouse.down();
  for (let i = 1; i <= 8; i++) { await p.mouse.move(x1 + ((x2 - x1) * i) / 8, y1 + ((y2 - y1) * i) / 8); await sleep(45); }
  await p.mouse.up();
};
const wheel = async (x, y, dy) => { await p.mouse.move(x, y); for (let i = 0; i < 4; i++) { await p.mouse.wheel(0, dy / 4); await sleep(90); } };
// Named the way a person would point at them, not the way the DOM does.
const BUTTON = { plus: "button.zoom-button-plus", minus: "button.zoom-button-minus", home: "button.zoom-button-reset >> nth=1", open: "button.zoom-button-reset >> nth=0" };
const click = async (what) => {
  if (BUTTON[what]) return p.click(BUTTON[what]);
  await p.locator("button", { hasText: new RegExp(`^\\s*${what}`) }).first().click({ force: true });
};
const type = async (sel, text) => { await p.click(sel); for (const ch of text) { await p.keyboard.type(ch); await sleep(70 + Math.round(60 * ((text.charCodeAt(0) + ch.charCodeAt(0)) % 5) / 5)); } };

await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load", timeout: 120000 });
await p.waitForFunction(() => document.querySelectorAll("canvas").length >= 3, null, { timeout: 120000 });
await sleep(18000);   // the data finishes streaming
console.log(`[${name}] loaded, driving…`);
try { await SESSIONS[name](p, { pause, drag, wheel, type, click }); }
catch (err) { console.error(`[${name}] driver stopped: ${err.message}`); }
await sleep(2000);
await p.evaluate(() => window.__engelbart?.flush?.());
await sleep(2500);
await p.screenshot({ path: `${R2}/sessions/${name}.png` });
await b.close();
await sleep(1500);
gw.kill("SIGTERM");
await sleep(1200);
out.end();
await sleep(400);

const runId = `wizmap-${name}`;
const s = collect(jsonl, runId);
writeFileSync(`${R2}/sessions/${name}.json`, JSON.stringify(s));
const k = {};
for (const e of s.events) k[e.kind] = (k[e.kind] ?? 0) + 1;
console.log(`[${name}] ${Math.round((Date.now() - t0) / 1000)}s  ${s.events.length} events  ${JSON.stringify(k)}`);
