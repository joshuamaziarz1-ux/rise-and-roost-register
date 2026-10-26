import assert from "node:assert/strict";
const origin = process.env.RR_BETA_BASE_URL || "http://127.0.0.1:4175";
const url = new URL(origin);
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) &&
  !(url.protocol === "https:" && url.hostname.endsWith(".workers.dev"))
)
  throw new Error(
    "Use an isolated workers.dev beta or the local Worker runtime.",
  );
const home = await fetch(origin + "/");
assert.equal(home.status, 200);
assert.match(home.headers.get("Content-Security-Policy"), /script-src 'self'/);
const created = await fetch(origin + "/api/workspaces", {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: "{}",
});
assert.equal(created.status, 201);
const data = await created.json();
const cookieHeader = created.headers.get("set-cookie");
assert.match(cookieHeader, /HttpOnly; SameSite=Strict/);
if (url.protocol === "https:") assert.match(cookieHeader, /Secure/);
const cookie = cookieHeader.split(";")[0];
const document = structuredClone(data.draft);
document.pages[0].sections[0].title = "Worker + D1 verified";
async function call(path, body) {
  const r = await fetch(origin + path, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify(body),
  });
  const out = await r.json();
  assert.equal(r.status, 200, out.error);
  return out;
}
const saved = await call("/api/draft", { revision: data.revision, document });
await call("/api/publish", { revision: saved.revision });
const pub = await (
  await fetch(origin + "/api/site?workspace=" + data.id)
).json();
assert.equal(pub.document.pages[0].sections[0].title, "Worker + D1 verified");
assert.equal((await fetch(origin + "/api/studio")).status, 401);
console.log(
  "PASS: Worker assets, security headers, D1 storage, owner draft/save/publish, and anonymous denial",
);
