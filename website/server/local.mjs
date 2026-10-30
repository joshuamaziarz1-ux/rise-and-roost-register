import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import worker from "./worker.mjs";
import { sqliteD1 } from "./sqlite-adapter.mjs";
import { PREVIEW_HOST, PREVIEW_DATABASE } from './preview-access.mjs';
const root = fileURLToPath(new URL("../", import.meta.url));
await mkdir(resolve(root, ".data"), { recursive: true });
const sqlite = new DatabaseSync(
  process.env.RR_TEST_DB || resolve(root, ".data/demo.sqlite"),
);
sqlite.exec(await readFile(resolve(root, "schema.sql"), "utf8"));
export const db = sqliteD1(sqlite);
const types = {
  ".html": "text/html",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  '.webmanifest': 'application/manifest+json',
};
const env = {
  DB: db,
  PUBLIC_WORKSPACE_ID: process.env.RR_PUBLIC_WORKSPACE_ID || "",
  CUSTOMER_EXPERIENCE_ENABLED: process.env.RR_CUSTOMER_EXPERIENCE || "false",
  REVIEW_BUILD: process.env.RR_REVIEW_BUILD || "false",
  STUDIO_MANAGEMENT_ENABLED: process.env.RR_STUDIO_MANAGEMENT || 'false',
  ASSETS: {
    async fetch(request) {
      let path = decodeURIComponent(new URL(request.url).pathname);
      let filename = resolve(root, "public", "." + path);
      if (
        filename !== resolve(root, "public") &&
        !filename.startsWith(resolve(root, "public") + "/")
      )
        return new Response("Not found", { status: 404 });
      try {
        const bytes = await readFile(filename);
        return new Response(bytes, {
          headers: {
            "Content-Type":
              types[extname(filename)] || "application/octet-stream",
          },
        });
      } catch {
        if (extname(path)) return new Response("Not found", { status: 404 });
        return new Response(
          await readFile(resolve(root, "public/index.html")),
          { headers: { "Content-Type": "text/html" } },
        );
      }
    },
  },
};
// Test-only infrastructure simulation, never imported by the deployed Worker.
// The local server binds 127.0.0.1 and requires an explicitly isolated test DB.
const networkTest = process.env.RR_PREVIEW_NETWORK_TEST === 'true' && !!process.env.RR_TEST_DB;
if (networkTest) Object.assign(env, {
  PREVIEW_ACCESS_MODE: 'trusted-network', PREVIEW_DATABASE_ID: PREVIEW_DATABASE,
  ORDER_EMAIL_ENABLED: 'false',
  PREVIEW_ACCESS_UNTIL: new Date(Date.now() + 86400000).toISOString(),
  PREVIEW_TESTER_IPS: JSON.stringify(['203.0.113.10', '2001:db8::1']),
});
const server = createServer(async (req, res) => {
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 3000000) {
        res.writeHead(413);
        res.end();
        return;
      }
      chunks.push(chunk);
    }
    const origin = 'http://' + req.headers.host;
    const url = (networkTest ? 'https://' + PREVIEW_HOST : origin) + req.url;
    const headers = new Headers(req.headers);
    if (networkTest) {
      if (headers.get('Origin') === origin) headers.set('Origin', 'https://' + PREVIEW_HOST);
      headers.set('CF-Connecting-IP', headers.get('X-RR-Test-Network') || '203.0.113.10');
      headers.delete('X-RR-Test-Network');
    }
    const request = new Request(url, {
        method: req.method,
        headers,
        body: ["GET", "HEAD"].includes(req.method)
          ? undefined
          : Buffer.concat(chunks),
      });
    if (networkTest) Object.defineProperty(request, 'cf', { value: { colo: 'TEST' } });
    const response = await worker.fetch(request, env);
    const responseHeaders = Object.fromEntries(response.headers);
    if (response.headers.getSetCookie().length) responseHeaders["set-cookie"] = response.headers.getSetCookie();
    res.writeHead(response.status, responseHeaders);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(500);
    res.end("Request failed");
  }
});
server.listen(Number(process.env.PORT || 4173), "127.0.0.1", () =>
  console.log(
    "Rise & Roost isolated website beta listening on port " +
      (process.env.PORT || 4173),
  ),
);
