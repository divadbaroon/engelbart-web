import type { NextRequest } from "next/server";
import { openSandbox } from "@/lib/sandbox-access";

// A shell in a run's sandbox. GET opens a PTY and streams its output as
// server-sent events; POST sends keystrokes or a new size to it by process
// id. The browser never talks to E2B itself, so no key leaves the server.

const PTY_TIMEOUT_MS = 8 * 60 * 60_000;   // how long one shell may live
const MAX_INPUT_BYTES = 64 * 1024;

type Params = { params: Promise<{ runId: string }> };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));
const size = (cols: unknown, rows: unknown) => ({ cols: clamp(Number(cols) || 80, 20, 400), rows: clamp(Number(rows) || 24, 5, 200) });

export async function GET(req: NextRequest, { params }: Params) {
  const { runId } = await params;
  const opened = await openSandbox(runId);
  if ("error" in opened) return Response.json({ error: opened.error }, { status: 409 });
  const { sandbox, workdir } = opened;
  const { cols, rows } = size(req.nextUrl.searchParams.get("cols"), req.nextUrl.searchParams.get("rows"));

  const encoder = new TextEncoder();
  let pid: number | null = null;
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`)); } catch { closed = true; }
      };
      const finish = () => { if (!closed) { closed = true; try { controller.close(); } catch { /* already closed */ } } };
      try {
        const handle = await sandbox.pty.create({
          cols, rows, cwd: workdir, timeoutMs: PTY_TIMEOUT_MS,
          envs: { TERM: "xterm-256color", COLORTERM: "truecolor" },
          onData: (data) => send("data", Buffer.from(data).toString("base64")),
        });
        pid = handle.pid;
        send("pty", JSON.stringify({ pid }));
        handle.wait()
          .then((r) => send("exit", String(r.exitCode)))
          .catch((err: { exitCode?: number; message?: string }) => send("exit", String(err?.exitCode ?? err?.message ?? "")))
          .finally(finish);
        // The browser went away: the tab closed or the page reloaded.
        req.signal.addEventListener("abort", () => { if (pid !== null) sandbox.pty.kill(pid).catch(() => {}); finish(); });
      } catch (err) {
        send("fail", err instanceof Error ? err.message : String(err));
        finish();
      }
    },
    cancel() {
      closed = true;
      if (pid !== null) sandbox.pty.kill(pid).catch(() => {});
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" },
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { runId } = await params;
  let body: { pid?: unknown; input?: unknown; resize?: { cols?: unknown; rows?: unknown } };
  try { body = await req.json(); } catch { return Response.json({ error: "Malformed request." }, { status: 400 }); }
  const pid = Number(body.pid);
  if (!Number.isInteger(pid) || pid <= 0) return Response.json({ error: "No shell to send to." }, { status: 400 });

  const opened = await openSandbox(runId);
  if ("error" in opened) return Response.json({ error: opened.error }, { status: 409 });
  try {
    if (typeof body.input === "string" && body.input) {
      const bytes = Buffer.from(body.input, "base64");
      if (bytes.byteLength > MAX_INPUT_BYTES) return Response.json({ error: "Too much input at once." }, { status: 413 });
      await opened.sandbox.pty.sendInput(pid, new Uint8Array(bytes));
    }
    if (body.resize) await opened.sandbox.pty.resize(pid, size(body.resize.cols, body.resize.rows));
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
