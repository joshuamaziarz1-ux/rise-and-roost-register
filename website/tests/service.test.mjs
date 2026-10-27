import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  api,
  safeCSS,
  validateDocument,
  quote,
  inspectImage,
} from "../server/service.mjs";
import { seed, localInstant, safeLink, clone } from "../public/model.mjs";

const now = Date.parse("2026-10-26T14:00:00Z");
function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
  return {
    prepare(sql) {
      return {
        bind(...args) {
          args = args.map((a) =>
            a instanceof ArrayBuffer ? new Uint8Array(a) : a,
          );
          return {
            async first() {
              return sqlite.prepare(sql).get(...args) || null;
            },
            async run() {
              const result = sqlite.prepare(sql).run(...args);
              return { meta: { changes: result.changes } };
            },
          };
        },
      };
    },
  };
}
function harness() {
  const db = database();
  let cookie = "";
  async function call(path, body, options = {}) {
    const response = await api(
      new Request("https://beta.test" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Origin: "https://beta.test",
          "Content-Type": "application/json",
          Cookie: options.anonymous ? "" : cookie,
          ...options.headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      db,
      options.now ?? now,
    );
    if (response.headers.get("Set-Cookie") && !options.anonymous)
      cookie = response.headers.get("Set-Cookie").split(";")[0];
    const data = response.headers
      .get("Content-Type")
      ?.includes("application/json")
      ? await response.json()
      : await response.arrayBuffer();
    return { status: response.status, data, response };
  }
  return {
    call,
    db,
    get cookie() {
      return cookie;
    },
  };
}
const orderInput = (workspace) => ({
  workspaceId: workspace.id,
  revision: workspace.publishedRevision,
  requestId: crypto.randomUUID(),
  pickupId: workspace.published.pickups[0].id,
  lines: [{ productId: "bread", variantId: "classic", qty: 1, unitPrice: 900 }],
  total: 900,
});

test("farmhouse starter has complete editable pages, products, and valid future pickup windows", () => {
  const doc = validateDocument(seed(now));
  assert.deepEqual(
    doc.pages.map((p) => p.slug),
    ["/", "/shop", "/about", "/visit", "/contact", "/terms"],
  );
  assert.equal(doc.products.length, 3);
  assert.ok(
    doc.pickups.every((p) => localInstant(p.cutoffDate, p.cutoffTime) > now),
  );
});
test("Indianapolis conversion uses winter/summer offsets and rejects DST gaps, ambiguity, and invalid dates", () => {
  assert.equal(
    new Date(localInstant("2026-01-15", "18:00")).toISOString(),
    "2026-01-15T23:00:00.000Z",
  );
  assert.equal(
    new Date(localInstant("2026-07-15", "18:00")).toISOString(),
    "2026-07-15T22:00:00.000Z",
  );
  assert.throws(() => localInstant("2026-03-08", "02:30"));
  assert.throws(() => localInstant("2026-11-01", "01:30"));
  assert.throws(() => localInstant("2026-02-30", "18:00"));
});
test("CSS is parsed, scoped, and rejects external fetches and executable constructs", () => {
  assert.match(
    safeCSS("h1, .card { color: red; padding: 2px; }"),
    /\.site-root h1,\.site-root \.card/,
  );
  for (const css of [
    '@import "https://evil.test";',
    "h1{background-image:url(https://evil.test)}",
    "h1{color:expression(alert(1))}",
    "@font-face{font-family:x;src:url(x)}",
    "h1{position:fixed}",
    "h1{color:var(--x,url(https://evil.test))}",
  ])
    assert.throws(() => safeCSS(css));
});
test("links reject scripts, scheme-relative destinations, credentials, and unsafe paths", () => {
  assert.ok(safeLink("/shop"));
  assert.ok(safeLink("https://example.com/hello"));
  for (const value of [
    "javascript:alert(1)",
    "//evil.test",
    "data:text/html,x",
    "https://user:password@example.com",
    "/\n/evil.test",
  ])
    assert.equal(safeLink(value), false);
});
test("content schema rejects bad prices, duplicate pages, reserved routes, bad images, and unsafe CSS", () => {
  for (const mutate of [
    (d) => (d.products[0].price = -1),
    (d) => (d.products[0].price = 1.5),
    (d) => (d.pages[1].slug = "/"),
    (d) => (d.pages[1].slug = "/studio"),
    (d) => (d.products[0].images[0].src = "data:image/svg+xml,x"),
    (d) => (d.pages[0].sections[0].link = "javascript:alert(1)"),
    (d) => (d.theme.customCSS = '@import "x";'),
  ]) {
    const d = seed(now);
    mutate(d);
    assert.throws(() => validateDocument(d));
  }
});
test("owner sessions use secure HttpOnly cookies and public reads never reveal credentials or orders", async () => {
  const h = harness(),
    created = await h.call("/api/workspaces", {});
  assert.equal(created.status, 201);
  assert.match(
    created.response.headers.get("Set-Cookie"),
    /HttpOnly; SameSite=Strict/,
  );
  assert.match(created.response.headers.get("Set-Cookie"), /Secure/);
  const pub = await h.call(
    "/api/site?workspace=" + created.data.id,
    undefined,
    { anonymous: true },
  );
  assert.equal(pub.status, 200);
  assert.equal(pub.data.accessKey, undefined);
  assert.equal(pub.data.orders, undefined);
  assert.equal(pub.data.owner_hash, undefined);
  assert.equal(
    (await h.call("/api/studio", undefined, { anonymous: true })).status,
    401,
  );
  assert.equal(
    (
      await h.call(
        "/api/login",
        { id: created.data.id, accessKey: "wrong" },
        { anonymous: true },
      )
    ).status,
    401,
  );
});
test("draft save, cross-device login, read-only preview, publish, and restore remain distinct", async () => {
  const h = harness(),
    { data: original } = await h.call("/api/workspaces", {});
  const document = clone(original.draft);
  document.pages[0].sections[0].title = "Danielle’s new headline";
  const saved = await h.call("/api/draft", {
    revision: original.revision,
    document,
  });
  assert.equal(saved.status, 200);
  assert.notEqual(
    (await h.call("/api/site?workspace=" + original.id)).data.document.pages[0]
      .sections[0].title,
    "Danielle’s new headline",
  );
  const other = await h.call("/api/login", {
    id: original.id,
    accessKey: original.accessKey,
  });
  assert.equal(
    other.data.draft.pages[0].sections[0].title,
    "Danielle’s new headline",
  );
  const preview = await h.call("/api/preview", {
    revision: saved.data.revision,
  });
  const previewRead = await h.call("/api" + preview.data.path, undefined, {
    anonymous: true,
  });
  assert.equal(previewRead.status, 200);
  assert.equal(
    previewRead.data.document.pages[0].sections[0].title,
    "Danielle’s new headline",
  );
  assert.equal(
    (
      await h.call(
        "/api/publish",
        { revision: saved.data.revision },
        { anonymous: true },
      )
    ).status,
    401,
  );
  const published = await h.call("/api/publish", {
    revision: saved.data.revision,
  });
  assert.equal(
    (await h.call("/api/site?workspace=" + original.id)).data.document.pages[0]
      .sections[0].title,
    "Danielle’s new headline",
  );
  const restored = await h.call("/api/restore", {
    revision: published.data.revision,
    versionId: original.versions[0].id,
  });
  assert.equal(
    restored.data.published.pages[0].sections[0].title,
    original.published.pages[0].sections[0].title,
  );
  assert.equal(
    (
      await h.call("/api" + preview.data.path, undefined, {
        now: now + 8 * 86400000,
      })
    ).status,
    404,
  );
});
test("stale editors and parallel saves cannot overwrite the winning revision", async () => {
  const h = harness(),
    { data: s } = await h.call("/api/workspaces", {});
  const document = clone(s.draft);
  document.ui.announcement = "New";
  const results = await Promise.all([
    h.call("/api/draft", { revision: s.revision, document }),
    h.call("/api/draft", { revision: s.revision, document: s.draft }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
});
test("a concurrent publish cannot accept an order quoted against the previous revision", async () => {
  const h = harness();
  const { data: s } = await h.call("/api/workspaces", {});
  const document = clone(s.draft);
  document.products[0].price += 100;
  const saved = await h.call("/api/draft", { revision: s.revision, document });
  const prepare = h.db.prepare.bind(h.db);
  let published = false;
  h.db.prepare = (sql) => ({
    bind(...args) {
      const statement = prepare(sql).bind(...args);
      return {
        ...statement,
        async run() {
          if (!published && sql.startsWith("UPDATE workspaces SET ledger_json=")) {
            published = true;
            assert.equal((await h.call("/api/publish", { revision: saved.data.revision })).status, 200);
          }
          return statement.run();
        },
      };
    },
  });
  assert.equal((await h.call("/api/orders", orderInput(s))).status, 409);
  assert.equal((await h.call("/api/studio")).data.orders.length, 0);
});
test("invalid pickup input returns a useful validation error and preserves the saved draft", async () => {
  const h = harness();
  const { data: s } = await h.call("/api/workspaces", {});
  const document = clone(s.draft);
  document.pickups[0].date = "2026-02-30";
  const rejected = await h.call("/api/draft", { revision: s.revision, document });
  assert.equal(rejected.status, 400);
  assert.match(rejected.data.error, /invalid|ambiguous/);
  assert.deepEqual((await h.call("/api/studio")).data.draft, s.draft);
  document.pickups[0].date = s.draft.pickups[0].date;
  document.products[0].category = "Bakery";
  assert.equal((await h.call("/api/draft", { revision: s.revision, document })).status, 200);
  document.products[0].category = {};
  assert.throws(() => validateDocument(document), /category/);
});
test("all administrative writes require an owner session and other owners cannot change orders", async () => {
  const h = harness();
  for (const path of ["/api/draft", "/api/publish", "/api/restore", "/api/preview", "/api/upload", "/api/order-status"])
    assert.equal((await h.call(path, {}, { anonymous: true })).status, 401);
  const { data: s } = await h.call("/api/workspaces", {});
  const { data: order } = await h.call("/api/orders", orderInput(s));
  await h.call("/api/workspaces", {});
  assert.equal((await h.call("/api/order-status", { id: order.id, status: "canceled" })).status, 400);
});
test("root customer demos preserve an existing Studio session and never disclose an owner key", async () => {
  const h = harness();
  const { data: owner } = await h.call("/api/workspaces", {});
  const cookie = h.cookie;
  const demo = await h.call("/api/workspaces", { customerDemo: true });
  assert.equal(demo.status, 201);
  assert.equal(demo.response.headers.get("Set-Cookie"), null);
  assert.equal(demo.data.accessKey, undefined);
  assert.equal(demo.data.draft, undefined);
  assert.equal(h.cookie, cookie);
  assert.equal((await h.call("/api/studio")).data.id, owner.id);
});
test("public availability reflects reservations and cancellation without exposing orders or changing owner stock", async () => {
  const h = harness();
  const { data: s } = await h.call("/api/workspaces", {});
  const document = clone(s.draft);
  document.products[0].stock = 1;
  document.pickups[0].capacity = 1;
  const saved = (await h.call("/api/draft", { revision: s.revision, document })).data;
  const current = (await h.call("/api/publish", { revision: saved.revision })).data;
  const { data: order } = await h.call("/api/orders", orderInput(current));
  const pub = (await h.call("/api/site?workspace=" + s.id, undefined, { anonymous: true })).data;
  assert.equal(pub.document.products[0].stock, 0);
  assert.equal(pub.document.pickups[0].capacity, 0);
  assert.equal(pub.availabilityRevision, 2);
  assert.equal(pub.orders, undefined);
  assert.equal((await h.call("/api/studio")).data.published.products[0].stock, 1);
  await h.call("/api/order-status", { id: order.id, status: "canceled" });
  const reopened = (await h.call("/api/site?workspace=" + s.id)).data;
  assert.equal(reopened.document.products[0].stock, 1);
  assert.equal(reopened.document.pickups[0].capacity, 1);
  assert.equal(reopened.availabilityRevision, pub.availabilityRevision + 1);
});
test("requests use authoritative prices and preserve explicit unpaid status", async () => {
  const h = harness(),
    { data: s } = await h.call("/api/workspaces", {}),
    input = orderInput(s);
  assert.equal(
    (await h.call("/api/orders", { ...input, total: 1 })).status,
    409,
  );
  assert.equal(
    (
      await h.call("/api/orders", {
        ...input,
        lines: [{ ...input.lines[0], unitPrice: 1 }],
      })
    ).status,
    409,
  );
  const accepted = await h.call("/api/orders", input);
  assert.equal(accepted.status, 201);
  assert.equal(accepted.data.paymentStatus, "not_collected");
  assert.equal(accepted.data.simulated, true);
  assert.equal((await h.call("/api/orders", input)).data.id, accepted.data.id);
  assert.equal((await h.call("/api/studio")).data.orders.length, 1);
});
test("expired cutoffs, closed windows, unpublished revisions, and invalid quantities reject without orders", async () => {
  const h = harness(),
    { data: s } = await h.call("/api/workspaces", {}),
    input = orderInput(s),
    p = s.published.pickups[0];
  assert.equal(
    (
      await h.call("/api/orders", input, {
        now: localInstant(p.cutoffDate, p.cutoffTime),
      })
    ).status,
    409,
  );
  assert.equal(
    (await h.call("/api/orders", { ...input, revision: -1 })).status,
    409,
  );
  for (const qty of [0, -1, 1.5, 100])
    assert.equal(
      (
        await h.call("/api/orders", {
          ...input,
          lines: [{ ...input.lines[0], qty }],
        })
      ).status,
      400,
    );
  assert.equal((await h.call("/api/studio")).data.orders.length, 0);
});
test("atomic capacity and duplicate-request handling survive simultaneous requests", async () => {
  const h = harness(),
    { data: s } = await h.call("/api/workspaces", {});
  const document = clone(s.draft);
  document.pickups[0].capacity = 1;
  const saved = await h.call("/api/draft", { revision: s.revision, document });
  const { data: current } = await h.call("/api/publish", {
    revision: saved.data.revision,
  });
  const input = orderInput(current);
  const results = await Promise.all([
    h.call("/api/orders", input),
    h.call("/api/orders", { ...input, requestId: crypto.randomUUID() }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal((await h.call("/api/studio")).data.orders.length, 1);
});
test("product capacity aggregates varieties and stock across different pickups", () => {
  const doc = seed(now),
    ledger = { orders: [] },
    input = orderInput({ id: "x", publishedRevision: 1, published: doc });
  assert.throws(
    () =>
      quote(
        doc,
        ledger,
        {
          ...input,
          lines: [
            ...input.lines,
            {
              ...input.lines[0],
              variantId: "rosemary",
              qty: 8,
              unitPrice: 1000,
            },
          ],
          total: 8900,
        },
        now,
      ),
    /capacity/,
  );
  doc.products[0].channel = "store";
  assert.throws(() => quote(doc, ledger, input, now), /unavailable/);
});
test("cancellation releases capacity, never marks paid, and cannot resurrect a canceled order", async () => {
  const h = harness(),
    { data: s } = await h.call("/api/workspaces", {});
  const { data: order } = await h.call("/api/orders", orderInput(s));
  assert.equal(
    (await h.call("/api/order-status", { id: order.id, status: "paid" }))
      .status,
    400,
  );
  const canceled = await h.call("/api/order-status", {
    id: order.id,
    status: "canceled",
  });
  assert.equal(canceled.data.paymentStatus, "not_collected");
  assert.equal(
    (await h.call("/api/order-status", { id: order.id, status: "ready" }))
      .status,
    409,
  );
});
test("CSRF, malformed JSON bodies, and expired sessions are denied", async () => {
  const h = harness();
  assert.equal(
    (
      await h.call(
        "/api/workspaces",
        {},
        { headers: { Origin: "https://evil.test" } },
      )
    ).status,
    403,
  );
  assert.equal((await h.call("/api/workspaces", null)).status, 400);
  await h.call("/api/workspaces", {});
  assert.equal(
    (await h.call("/api/studio", undefined, { now: now + 13 * 3600000 }))
      .status,
    401,
  );
  await h.call("/api/logout", {});
  assert.equal((await h.call("/api/studio")).status, 401);
});
test("upload sanitation rejects SVG, HTML, spoofed MIME, truncated data, and excess size", () => {
  for (const [data, mime] of [
    ['<svg onload="alert(1)"></svg>', "image/svg+xml"],
    ["<html><script>alert(1)</script></html>", "image/png"],
    ["not an image".repeat(4), "image/jpeg"],
  ])
    assert.throws(() => inspectImage(new TextEncoder().encode(data), mime));
  assert.throws(() => inspectImage(new Uint8Array(2100000), "image/png"));
  const image = Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  assert.ok(inspectImage(image, "image/png"));
  assert.throws(() => inspectImage(image, "image/jpeg"));
});
test("workspace owners cannot save another workspace’s image references", async () => {
  const h = harness(),
    first = (await h.call("/api/workspaces", {})).data;
  const image =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
  const asset = await h.call("/api/upload", { mime: "image/png", data: image });
  assert.equal(asset.status, 201);
  const second = (await h.call("/api/workspaces", {})).data;
  second.draft.products[0].images[0].src = asset.data.src;
  assert.equal(
    (
      await h.call("/api/draft", {
        revision: second.revision,
        document: second.draft,
      })
    ).status,
    400,
  );
  assert.notEqual(first.id, second.id);
});
test("new-workspace and login rate limits return actionable errors", async () => {
  const h = harness();
  for (let i = 0; i < 30; i++)
    await h.call("/api/login", { id: "missing", accessKey: "x" });
  assert.equal(
    (await h.call("/api/login", { id: "missing", accessKey: "x" })).status,
    429,
  );
});
