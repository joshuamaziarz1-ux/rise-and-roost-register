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
const accessTest = process.env.RR_PREVIEW_ACCESS_TEST === 'true' && !!process.env.RR_TEST_DB;
if (accessTest) Object.assign(env, {
  PREVIEW_ACCESS_MODE: 'cloudflare-access', PREVIEW_DATABASE_ID: PREVIEW_DATABASE,
  ORDER_EMAIL_ENABLED: 'false',
  PREVIEW_ACCESS_UNTIL: new Date(Date.now() + 86400000).toISOString(),
  PREVIEW_TESTER_EMAILS: JSON.stringify(['owner-a@example.test', 'owner-b@example.test']),
  CF_ACCESS_TEAM_DOMAIN: process.env.RR_TEST_ACCESS_TEAM,
  CF_ACCESS_AUD: process.env.RR_TEST_ACCESS_AUD,
});
if (accessTest) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (url, init) => String(url) === env.CF_ACCESS_TEAM_DOMAIN + '/cdn-cgi/access/certs'
    ? Promise.resolve(new Response(process.env.RR_TEST_ACCESS_JWKS, { headers: { 'Content-Type': 'application/json' } })) : originalFetch(url, init);
}
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
    const url = (accessTest ? 'https://' + PREVIEW_HOST : origin) + req.url;
    const headers = new Headers(req.headers);
    if (accessTest) {
      if (headers.get('Origin') === origin) headers.set('Origin', 'https://' + PREVIEW_HOST);
      // Simulate the Access edge passing its signed authorization cookie as a
      // JWT header. The Worker still performs real signature/claim validation.
      if (!headers.has('Cf-Access-Jwt-Assertion')) {
        const jwt = (headers.get('Cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith('CF_Authorization='))?.slice('CF_Authorization='.length);
        if (jwt) headers.set('Cf-Access-Jwt-Assertion', jwt);
      }
    }
    const request = new Request(url, {
        method: req.method,
        headers,
        body: ["GET", "HEAD"].includes(req.method)
          ? undefined
          : Buffer.concat(chunks),
      });
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
