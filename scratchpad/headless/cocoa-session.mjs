// One person using Cocoa Canvas, driven through real input events so the
// collector records clicks, typing and submits rather than a script
// setting values.
import { open } from "./cdp.mjs";

const URL_ = process.argv[2];
if (!URL_) { console.error("usage: cocoa-session.mjs <preview url>"); process.exit(1); }
const SHOTS = process.argv[3] ?? "/private/tmp/claude-501/-Users-divadbaroon-Desktop-engelbart-web/9513afc7-e24b-43db-8b54-e5cd74b27ae9/scratchpad/headless";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const page = await open({ port: 9334 });
const box = async (selector) => page.evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, text: (el.textContent || "").slice(0, 60) };
})()`);

const until = async (selector, ms = 30_000, label = selector) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const b = await box(selector);
    if (b) return b;
    await wait(300);
  }
  throw new Error(`never appeared: ${label}`);
};

const say = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

try {
  say("opening", URL_);
  await page.goto(URL_);
  await wait(1500);

  // ---- join the canvas
  const nameField = await until('input[placeholder="Your name"]', 30_000, "the join form");
  say("join form is up");
  await page.click(nameField.x, nameField.y);
  await wait(200);
  await page.type("Dana");
  await wait(400);
  const join = await until('form button', 5000, "the Join button");
  await page.click(join.x, join.y);
  say("joined");
  await wait(2500);
  await page.shot(`${SHOTS}/01-joined.png`);

  // ---- open the task composer
  const plus = await until("#root > div > button", 20_000, "the new-task control");
  await page.click(plus.x, plus.y);
  say("opened the composer");
  await wait(1200);

  // ---- write the task
  const field = await until('textarea[placeholder="What would you like to work on?"]', 15_000, "the task field");
  await page.click(field.x, field.y);
  await wait(200);
  await page.type("compare three note-taking apps for a small research team");
  say("wrote the task");
  await wait(1200);
  await page.shot(`${SHOTS}/02-written.png`);

  // ---- create it
  const create = await page.evaluate(`(() => {
    const el = [...document.querySelectorAll("button, div[role='button'], div")].reverse().find((e) => (e.textContent || "").trim() === "Create");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (!create) throw new Error("no Create control");
  await page.click(create.x, create.y);
  say("created the task; waiting for the plan");

  // ---- wait for the plan to land
  const deadline = Date.now() + 90_000;
  let seen = false;
  while (Date.now() < deadline) {
    const text = await page.evaluate(`document.body.innerText`);
    if (/of \d+ steps/.test(text) && !/Generating plan/.test(text)) { seen = true; break; }
    await wait(1000);
  }
  say(seen ? "the plan appeared" : "no plan after 90s");
  await wait(2000);
  await page.shot(`${SHOTS}/03-plan.png`);

  // ---- read it: open the card
  const openIt = await page.evaluate(`(() => {
    const el = [...document.querySelectorAll("button, div")].find((e) => (e.textContent || "").trim() === "Open");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (openIt) {
    await page.click(openIt.x, openIt.y);
    say("opened the card");
    await wait(3000);
    await page.shot(`${SHOTS}/04-card.png`);
    // scroll through it, which the collector records as a gesture
    await page.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 640, y: 500, deltaX: 0, deltaY: 300 });
    await wait(1500);
    await page.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 640, y: 500, deltaX: 0, deltaY: 300 });
    await wait(2500);
  } else {
    say("no Open control found");
  }

  const text = await page.evaluate("document.body.innerText.slice(0, 600)");
  say("page now reads:\n" + text);
  await wait(4000);
} catch (err) {
  console.error("FAILED:", err.message);
  try { await page.shot(`${SHOTS}/99-failed.png`); } catch {}
  process.exitCode = 1;
} finally {
  page.close();
}
