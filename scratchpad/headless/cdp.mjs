// A small CDP driver over the cached Playwright headless shell.
// Node 22 has a global WebSocket, so nothing is installed.
import { spawn } from "node:child_process";

const SHELL = "/Users/divadbaroon/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell";

export async function open({ port = 9333, width = 1280, height = 900 } = {}) {
  const proc = spawn(SHELL, [
    `--remote-debugging-port=${port}`, "--headless=new", "--no-sandbox", "--disable-gpu",
    `--window-size=${width},${height}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "ignore"] });

  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    await new Promise((r) => setTimeout(r, 150));
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === "page");
    } catch { /* not up yet */ }
  }
  if (!target) { proc.kill("SIGKILL"); throw new Error("the headless shell never came up"); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const waiting = new Map();
  const listeners = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
    else for (const l of listeners) l(msg);
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const n = ++id;
    waiting.set(n, (msg) => (msg.error ? rej(new Error(`${method}: ${msg.error.message}`)) : res(msg.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");

  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "evaluate threw");
    return r.result.value;
  };

  const goto = async (url) => {
    await send("Page.navigate", { url });
    for (let i = 0; i < 200; i++) {
      await new Promise((r) => setTimeout(r, 150));
      const state = await evaluate("document.readyState").catch(() => null);
      if (state === "complete") return;
    }
    throw new Error(`never finished loading: ${url}`);
  };

  const click = async (x, y) => {
    for (const type of ["mousePressed", "mouseReleased"]) {
      await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, buttons: type === "mousePressed" ? 1 : 0 });
      await new Promise((r) => setTimeout(r, 30));
    }
  };

  const type = async (text) => {
    for (const ch of text) {
      await send("Input.dispatchKeyEvent", { type: "keyDown", text: ch, key: ch });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: ch });
      await new Promise((r) => setTimeout(r, 18));
    }
  };

  const key = async (key, code, keyCode) => {
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
  };

  const shot = async (path) => {
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(path, Buffer.from(data, "base64"));
  };

  const close = () => { try { ws.close(); } catch {} proc.kill("SIGKILL"); };
  return { send, evaluate, goto, click, type, key, shot, close, on: (fn) => listeners.push(fn) };
}
