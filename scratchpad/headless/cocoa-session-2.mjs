// A second stretch of the same session: a second task, and working
// inside the card that comes back.
import { open } from "./cdp.mjs";

const URL_ = process.argv[2];
const SHOTS = "/private/tmp/claude-501/-Users-divadbaroon-Desktop-engelbart-web/9513afc7-e24b-43db-8b54-e5cd74b27ae9/scratchpad/headless";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const page = await open({ port: 9335 });
const find = (text) => page.evaluate(`(() => {
  const want = ${JSON.stringify(text)};
  const el = [...document.querySelectorAll("button, div[role='button'], div, a")].find((e) => (e.textContent || "").trim() === want);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
})()`);
const at = (selector) => page.evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
})()`);
const until = async (fn, ms, label) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { const b = await fn(); if (b) return b; await wait(300); }
  throw new Error(`never appeared: ${label}`);
};

try {
  await page.goto(URL_);
  await wait(1500);
  const name = await until(() => at('input[placeholder="Your name"]'), 20_000, "the join form");
  await page.click(name.x, name.y);
  await page.type("Dana");
  await wait(300);
  const join = await until(() => at("form button"), 5000, "Join");
  await page.click(join.x, join.y);
  say("joined again");
  await wait(3000);

  // look around first
  await page.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 640, y: 450, deltaX: 0, deltaY: 200 });
  await wait(1200);

  const plus = await until(() => at("#root > div > button"), 15_000, "the new-task control");
  await page.click(plus.x, plus.y);
  await wait(1000);
  const field = await until(() => at('textarea[placeholder="What would you like to work on?"]'), 10_000, "the task field");
  await page.click(field.x, field.y);
  await page.type("draft an interview guide for the study");
  say("wrote a second task");
  await wait(1500);
  const create = await until(() => find("Create"), 5000, "Create");
  await page.click(create.x, create.y);
  say("created it; waiting");

  const end = Date.now() + 90_000;
  while (Date.now() < end) {
    const t = await page.evaluate("document.body.innerText");
    if (/interview/i.test(t) && !/Generating plan/.test(t)) break;
    await wait(1000);
  }
  say("plan back");
  await wait(2500);
  await page.shot(`${SHOTS}/05-second.png`);

  const openIt = await find("Open");
  if (openIt) { await page.click(openIt.x, openIt.y); say("opened it"); await wait(3500); await page.shot(`${SHOTS}/06-second-card.png`); }
  await wait(3000);
  say((await page.evaluate("document.body.innerText.slice(0, 400)")));
} catch (err) {
  console.error("FAILED:", err.message);
  try { await page.shot(`${SHOTS}/98-failed.png`); } catch {}
  process.exitCode = 1;
} finally {
  page.close();
}
