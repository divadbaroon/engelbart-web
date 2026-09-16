// A loopback reverse proxy for the sandbox: each mapping listens on one port
// and forwards to a service on another, rewriting the Host header to the
// loopback address the service expects. Dev servers such as
// webpack-dev-server and Vite refuse requests for hosts they don't know, and
// the sandbox's public hostname is never one of them. WebSocket upgrades
// (hot reload) pass through. The target address is whichever loopback the
// service bound: 127.0.0.1 unless told otherwise (Vite, for one, prefers ::1).
//
//   node proxy.mjs <listen-port>:<target-port>[:<target-address>] ...
//
// One process serves every mapping, so a run with a frontend and an API
// exposes both with a single command.
import http from "node:http";
import net from "node:net";

const mappings = process.argv.slice(2).map((spec) => {
  const [listen, target, ...rest] = spec.split(":");
  return { listenPort: Number(listen), targetPort: Number(target), targetAddress: rest.join(":") || "127.0.0.1" };
});
if (!mappings.length || mappings.some((m) => !m.listenPort || !m.targetPort)) {
  console.error("usage: proxy.mjs <listen-port>:<target-port>[:<target-address>] ...");
  process.exit(2);
}

function serve({ listenPort, targetPort, targetAddress }) {
  const targetHost = `${targetAddress.includes(":") ? `[${targetAddress}]` : targetAddress}:${targetPort}`;

  const server = http.createServer((req, res) => {
    const headers = { ...req.headers, host: targetHost };
    const upstream = http.request({ host: targetAddress, port: targetPort, method: req.method, path: req.url, headers }, (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    });
    upstream.on("error", (err) => {
      if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
      res.end(`engelbart proxy: application not reachable on ${targetHost} (${err.message})`);
    });
    req.pipe(upstream);
  });

  server.on("upgrade", (req, socket, head) => {
    const upstream = net.connect(targetPort, targetAddress, () => {
      const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
      for (const [name, value] of Object.entries({ ...req.headers, host: targetHost })) {
        for (const v of Array.isArray(value) ? value : [value]) lines.push(`${name}: ${v}`);
      }
      upstream.write(lines.join("\r\n") + "\r\n\r\n");
      if (head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
  });

  server.listen(listenPort, "0.0.0.0", () => {
    console.log(JSON.stringify({ proxy: "listening", listenPort, targetPort, targetAddress }));
  });
}

for (const mapping of mappings) serve(mapping);
