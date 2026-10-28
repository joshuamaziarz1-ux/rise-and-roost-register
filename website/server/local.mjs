import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import worker from "./worker.mjs";
import { sqliteD1 } from "./sqlite-adapter.mjs";
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
};
const env = {
  DB: db,
  PUBLIC_WORKSPACE_ID: process.env.RR_PUBLIC_WORKSPACE_ID || "",
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
    const url = "http://" + req.headers.host + req.url;
    const response = await worker.fetch(
      new Request(url, {
        method: req.method,
        headers: req.headers,
        body: ["GET", "HEAD"].includes(req.method)
          ? undefined
          : Buffer.concat(chunks),
      }),
      env,
    );
    const headers = Object.fromEntries(response.headers);
    if (response.headers.getSetCookie().length) headers["set-cookie"] = response.headers.getSetCookie();
    res.writeHead(response.status, headers);
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
