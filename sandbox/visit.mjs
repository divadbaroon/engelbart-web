// Loads a page the way a person would and reports what they would see: the
// status, the title, the visible text, console errors and failed requests.
// A server can answer 200 long before the application behind it has run
// (Streamlit runs its script when a browser connects; a client-side app
// renders after hydration), so a health check that only fetches the page
// cannot tell a working app from a crashed one. This can.
//
//   node visit.mjs <url> [wait-ms] [screenshot-path]
//
// Prints one JSON object. Never throws: a failure to load is part of the report.
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/opt/ms-playwright";
const [url, waitArg, screenshot] = process.argv.slice(2);
const waitMs = Number(waitArg ?? 6000);
const out = { url, status: null, title: "", text: "", consoleErrors: [], failedRequests: [], error: null };
let browser;
try {
  const { chromium } = await import("playwright");
  browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 } });
  page.on("console", (m) => { if (m.type() === "error" && out.consoleErrors.length < 20) out.consoleErrors.push(m.text().slice(0, 300)); });
  page.on("requestfailed", (r) => { if (out.failedRequests.length < 20) out.failedRequests.push(`${r.method()} ${r.url().slice(0, 200)} ${r.failure()?.errorText ?? ""}`.trim()); });
  const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
  out.status = res?.status() ?? null;
  await page.waitForTimeout(waitMs);   // a lazy app runs its code now
  out.title = (await page.title()).slice(0, 200);
  out.text = (await page.evaluate(() => document.body?.innerText ?? "")).replace(/\s+/g, " ").slice(0, 4000);
  if (screenshot) await page.screenshot({ path: screenshot });
} catch (err) {
  out.error = String(err?.message ?? err).slice(0, 300);
} finally {
  await browser?.close().catch(() => {});
}
console.log(JSON.stringify(out));
