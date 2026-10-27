import * as css from "css-tree";
import { seed, ZONE, localInstant, safeLink } from "../public/model.mjs";

const encoder = new TextEncoder();
const token = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
const hash = async (value) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
const copy = (value) => JSON.parse(JSON.stringify(value));
const json = (value, status = 200, headers = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
const keyPattern = /^[a-zA-Z0-9_-]{1,80}$/;
export function safeCSS(source) {
  if (typeof source !== "string" || source.length > 12000)
    fail("Custom CSS is too long.");
  let tree;
  try {
    tree = css.parse(source, { parseCustomProperty: true });
  } catch {
    fail("Custom CSS could not be read. Check its braces and declarations.");
  }
  const properties =
    /^(--[a-z0-9-]+|color|background-color|font(-family|-size|-weight|-style)?|line-height|letter-spacing|text-align|text-transform|text-decoration|padding(-[a-z]+)?|margin(-[a-z]+)?|border(-[a-z-]+)?|border-radius|box-shadow|opacity|display|gap|row-gap|column-gap|grid-template-columns|align-items|justify-content|max-width|min-height|width|height|object-fit|object-position)$/i;
  css.walk(tree, (node) => {
    if (node.type === "Atrule" || node.type === "Url" || node.type === "Raw")
      fail(
        "CSS imports, external URLs, unknown syntax, and at-rules are not allowed. Use the design controls for responsive settings.",
      );
    if (node.type === "Declaration" && !properties.test(node.property))
      fail("Unsupported CSS property: " + node.property);
    if (
      node.type === "Function" &&
      !/^(rgb|rgba|hsl|hsla|var|calc|min|max|clamp|repeat|minmax|linear-gradient)$/i.test(
        node.name,
      )
    )
      fail("Unsupported CSS function.");
  });
  css.walk(tree, {
    visit: "Rule",
    enter(node) {
      if (node.prelude?.type !== "SelectorList")
        fail("Use ordinary CSS selectors.");
      const selectors = node.prelude.children
        .toArray()
        .map((s) => ".site-root " + css.generate(s));
      node.prelude = css.parse(selectors.join(","), {
        context: "selectorList",
      });
    },
  });
  return css.generate(tree);
}
export function validateDocument(doc) {
  if (!doc || typeof doc !== "object" || JSON.stringify(doc).length > 200000)
    fail("The draft is too large (200 KB maximum).");
  const walk = (value, depth = 0) => {
    if (depth > 12) fail("Content is nested too deeply.");
    if (typeof value === "string" && value.length > 16000)
      fail("A text field is too long.");
    if (value && typeof value === "object")
      for (const [key, entry] of Object.entries(value)) {
        if (["__proto__", "constructor", "prototype"].includes(key))
          fail("Invalid content field.");
        if (["link"].includes(key) && !safeLink(entry))
          fail("Links must be a local path or a secure HTTPS address.");
        walk(entry, depth + 1);
      }
  };
  walk(doc);
  if (doc.business?.zone !== ZONE)
    fail("Pickup times must use America/Indiana/Indianapolis.");
  if (!doc.business.name?.trim() || !doc.theme || !doc.ui)
    fail("Business name, theme, and website copy are required.");
  if (
    doc.business.email &&
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(doc.business.email)
  )
    fail("Use a valid public contact email.");
  const imageOK = (s) =>
    /^\/assets\/[a-zA-Z0-9._-]+$/.test(s) ||
    /^\/api\/assets\/[a-f0-9]{48}$/.test(s);
  if (!imageOK(doc.business.logo))
    fail("Choose an uploaded logo or the approved starter logo.");
  for (const key of [
    "background",
    "surface",
    "ink",
    "primary",
    "accent",
    "muted",
  ])
    if (!/^#[a-f0-9]{6}$/i.test(doc.theme[key]))
      fail("Use six-digit theme colors.");
  for (const key of ["width", "spacing", "radius", "buttonRadius", "fontSize"])
    if (!integer(doc.theme[key], 0, key === "width" ? 1800 : 160))
      fail("Invalid theme size.");
  const fonts = [
    "Georgia",
    "Palatino",
    "Garamond",
    "Times New Roman",
    "system-ui",
    "Arial",
    "Verdana",
    "Trebuchet MS",
    "Courier New",
  ];
  if (![doc.theme.font, doc.theme.bodyFont].every((f) => fonts.includes(f)))
    fail("Choose a supported font.");
  doc.theme.compiledCSS = safeCSS(doc.theme.customCSS || "");
  if (
    !Array.isArray(doc.pages) ||
    doc.pages.length < 1 ||
    doc.pages.length > 20 ||
    !doc.pages.some((p) => p.slug === "/")
  )
    fail("Keep a homepage and no more than 20 pages.");
  const slugs = new Set(),
    ids = new Set();
  for (const page of doc.pages) {
    if (
      !/^\/(?:[a-z0-9-]+)?$/.test(page.slug) ||
      ["/studio", "/cart", "/product", "/api", "/demo", "/preview"].includes(
        page.slug,
      ) ||
      slugs.has(page.slug)
    )
      fail("Choose a unique page path, such as /our-story.");
    slugs.add(page.slug);
    if (!keyPattern.test(page.id) || ids.has(page.id))
      fail("Page IDs must be unique.");
    ids.add(page.id);
    if (!Array.isArray(page.sections) || page.sections.length > 30)
      fail("Use no more than 30 sections per page.");
    const sections = new Set();
    for (const section of page.sections) {
      if (!keyPattern.test(section.id) || sections.has(section.id))
        fail("Section IDs must be unique.");
      sections.add(section.id);
      if (
        ![
          "hero",
          "text",
          "products",
          "split",
          "cta",
          "faq",
          "gallery",
          "cards",
          "visit",
          "contact",
        ].includes(section.type)
      )
        fail("Unsupported section type.");
      if (
        !["left", "center", "right"].includes(section.align) ||
        !integer(section.padding, 0, 160) ||
        !integer(section.fontSize, 16, 100)
      )
        fail("Invalid section design.");
      for (const key of ["color", "background"])
        if (section[key] && !/^#[a-f0-9]{6}$/i.test(section[key]))
          fail("Invalid section color.");
      if (section.image && !imageOK(section.image))
        fail("Choose an uploaded image.");
      if (!Array.isArray(section.items) || section.items.length > 20)
        fail("Use no more than 20 section cards.");
    }
  }
  if (!Array.isArray(doc.products) || doc.products.length > 60)
    fail("Use no more than 60 demo products.");
  const products = new Set();
  for (const p of doc.products) {
    if (!keyPattern.test(p.id) || products.has(p.id) || !p.name?.trim())
      fail("Products need unique IDs and names.");
    products.add(p.id);
    if (p.category !== undefined && (typeof p.category !== "string" || p.category.length > 100))
      fail("Use a product category of no more than 100 characters.");
    if (
      !integer(p.price, 0, 1000000) ||
      !integer(p.stock, 0, 10000) ||
      !integer(p.capacity, 0, 10000) ||
      !["preorder", "store"].includes(p.channel)
    )
      fail("Check product prices, stock, capacity, and sales channel.");
    if (
      !Array.isArray(p.variants) ||
      !p.variants.length ||
      p.variants.length > 20 ||
      new Set(p.variants.map((v) => v.id)).size !== p.variants.length
    )
      fail("Each product needs unique variants.");
    for (const v of p.variants)
      if (
        !keyPattern.test(v.id) ||
        !v.name?.trim() ||
        !integer(v.extra, 0, 1000000)
      )
        fail("Check variant names and price additions.");
    if (!Array.isArray(p.images) || p.images.length > 8)
      fail("Use no more than eight photos per product.");
    for (const i of p.images)
      if (!imageOK(i.src) || !integer(i.x, 0, 100) || !integer(i.y, 0, 100))
        fail("Check product images and crop focal points.");
  }
  if (
    !Array.isArray(doc.pickups) ||
    doc.pickups.length > 100 ||
    new Set(doc.pickups.map((p) => p.id)).size !== doc.pickups.length
  )
    fail("Use unique pickup windows, up to 100.");
  for (const p of doc.pickups) {
    if (!keyPattern.test(p.id) || !integer(p.capacity, 0, 10000))
      fail("Check pickup capacity.");
    let start, end, cutoff;
    try {
      start = localInstant(p.date, p.start);
      end = localInstant(p.date, p.end);
      cutoff = localInstant(p.cutoffDate, p.cutoffTime);
    } catch (error) {
      fail(error.message);
    }
    if (end <= start || cutoff >= start)
      fail(
        "The cutoff must precede pickup, and the window must end after it starts.",
      );
  }
  return doc;
}
export function quote(doc, ledger, input, now = Date.now()) {
  if (
    !Array.isArray(input.lines) ||
    !input.lines.length ||
    input.lines.length > 50
  )
    fail("Add an item to your basket.");
  const pickup = doc.pickups.find((p) => p.id === input.pickupId);
  if (
    !pickup ||
    pickup.closed ||
    now >= localInstant(pickup.cutoffDate, pickup.cutoffTime) ||
    now >= localInstant(pickup.date, pickup.start)
  )
    fail(
      "This pickup is closed or its order deadline has passed. Choose another window.",
      409,
    );
  const active = ledger.orders.filter(
    (o) => o.pickupId === pickup.id && o.status !== "canceled",
  );
  if (active.length >= pickup.capacity)
    fail("This pickup window is full.", 409);
  const seen = new Set();
  const lines = input.lines.map((line) => {
    const product = doc.products.find((p) => p.id === line.productId);
    const variant = product?.variants.find((v) => v.id === line.variantId);
    const key = line.productId + ":" + line.variantId;
    if (seen.has(key)) fail("Combine duplicate basket lines.");
    seen.add(key);
    if (
      !product ||
      !variant ||
      !product.active ||
      product.channel !== "preorder" ||
      !integer(line.qty, 1, 99)
    )
      fail("This item is unavailable or its quantity is invalid.");
    const sameProductQty = input.lines
      .filter((l) => l.productId === product.id)
      .reduce((n, l) => n + (Number.isInteger(l.qty) ? l.qty : 100000), 0);
    const booked = active
      .flatMap((o) => o.lines)
      .filter((l) => l.productId === product.id)
      .reduce((n, l) => n + l.qty, 0);
    const allBooked = ledger.orders
      .filter((o) => o.status !== "canceled")
      .flatMap((o) => o.lines)
      .filter((l) => l.productId === product.id)
      .reduce((n, l) => n + l.qty, 0);
    if (
      booked + sameProductQty > product.capacity ||
      allBooked + sameProductQty > product.stock
    )
      fail(product.name + " has reached its capacity.", 409);
    const unitPrice = product.price + variant.extra;
    if (line.unitPrice !== unitPrice)
      fail("A price changed. Review the latest basket before continuing.", 409);
    return {
      productId: product.id,
      variantId: variant.id,
      name: product.name,
      variant: variant.name,
      qty: line.qty,
      unitPrice,
    };
  });
  const total = lines.reduce((n, l) => n + l.qty * l.unitPrice, 0);
  if (input.total !== total)
    fail("Your basket total changed. Please review it.", 409);
  return {
    lines,
    total,
    pickupId: pickup.id,
    pickup: copy(pickup),
    paymentStatus: "not_collected",
    status: "pending",
    simulated: true,
  };
}
// Publish aggregate availability, never order details or customer/owner credentials.
export function availableDocument(document, ledger) {
  const doc = copy(document);
  const units = new Map(), orders = new Map();
  for (const order of ledger.orders) {
    if (order.status === "canceled") continue;
    orders.set(order.pickupId, (orders.get(order.pickupId) || 0) + 1);
    for (const line of order.lines)
      units.set(line.productId, (units.get(line.productId) || 0) + line.qty);
  }
  for (const product of doc.products)
    product.stock = Math.max(0, product.stock - (units.get(product.id) || 0));
  for (const pickup of doc.pickups)
    pickup.capacity = Math.max(0, pickup.capacity - (orders.get(pickup.id) || 0));
  return doc;
}
export function inspectImage(bytes, mime) {
  if (bytes.length > 2000000 || bytes.length < 24)
    fail("Use a JPG, PNG, or WebP smaller than 2 MB.");
  const b = bytes;
  const png =
    b[0] === 137 && String.fromCharCode(...b.slice(1, 8)) === "PNG\r\n\x1a\n";
  const jpeg =
    b[0] === 255 &&
    b[1] === 216 &&
    b[2] === 255 &&
    b.at(-2) === 255 &&
    b.at(-1) === 217;
  const webp =
    String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...b.slice(8, 12)) === "WEBP";
  if (
    !(
      (mime === "image/png" && png) ||
      (mime === "image/jpeg" && jpeg) ||
      (mime === "image/webp" && webp)
    )
  )
    fail(
      "The image contents do not match its format. SVG and HTML uploads are not accepted.",
    );
  return true;
}
export async function api(request, db, now = Date.now()) {
  const url = new URL(request.url),
    path = url.pathname;
  const first = (sql, ...args) =>
    db
      .prepare(sql)
      .bind(...args)
      .first();
  const run = (sql, ...args) =>
    db
      .prepare(sql)
      .bind(...args)
      .run();
  try {
    if (
      request.method !== "GET" &&
      request.headers.get("Origin") !== url.origin
    )
      fail("Reload this page before trying again.", 403);
    if (
      request.method !== "GET" &&
      !request.headers.get("Content-Type")?.startsWith("application/json")
    )
      fail("Use a JSON request.", 415);
    if (Number(request.headers.get("Content-Length") || 0) > 3000000)
      fail("Upload is too large.", 413);
    let input = {};
    if (request.method !== "GET") {
      const raw = await request.text();
      if (raw.length > 3000000) fail("Upload is too large.", 413);
      try {
        input = JSON.parse(raw);
      } catch {
        fail("The request could not be read.");
      }
      if (!input || typeof input !== "object" || Array.isArray(input))
        fail("Use a JSON object.");
    }
    const rateLimit = async (action, max) => {
      const ip = request.headers.get("CF-Connecting-IP") || "local";
      const key = await hash(action + ip + Math.floor(now / 3600000));
      await run(
        "INSERT INTO limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
        key,
        now + 7200000,
      );
      const row = await first("SELECT count FROM limits WHERE key=?", key);
      if (row.count > max)
        fail("Too many attempts. Please try again in an hour.", 429);
    };
    const sessionCookie = async (id) => {
      const raw = token();
      await run(
        "INSERT INTO sessions(hash,workspace_id,expires) VALUES(?,?,?)",
        await hash(raw),
        id,
        now + 12 * 3600000,
      );
      return `rr_studio=${raw}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${url.protocol === "https:" ? "; Secure" : ""}`;
    };
    const owner = async () => {
      const cookie = /(?:^|;\s*)rr_studio=([a-f0-9]{48})(?:;|$)/.exec(
        request.headers.get("Cookie") || "",
      );
      const session =
        cookie &&
        (await first(
          "SELECT * FROM sessions WHERE hash=? AND expires>?",
          await hash(cookie[1]),
          now,
        ));
      if (!session) fail("Sign in to your private demo workspace.", 401);
      const row = await first(
        "SELECT * FROM workspaces WHERE id=?",
        session.workspace_id,
      );
      if (!row) fail("This demo workspace no longer exists.", 404);
      return row;
    };
    const ownerResult = (row) => ({
      id: row.id,
      draft: JSON.parse(row.draft_json),
      published: JSON.parse(row.published_json),
      revision: row.revision,
      publishedRevision: row.published_revision,
      versions: JSON.parse(row.versions_json).map(({ document, ...v }) => v),
      orders: JSON.parse(row.ledger_json).orders,
      owner: "Danielle · Demo Owner",
    });
    if (path === "/api/workspaces" && request.method === "POST") {
      await rateLimit("create", 40);
      if ((await first("SELECT count(*) AS n FROM workspaces")).n >= 200)
        fail(
          "This beta has reached its 200-workspace limit. Ask the beta operator to archive and reset the demo database.",
          429,
        );
      const id = token(),
        accessKey = token(),
        document = validateDocument(seed(now));
      const version = {
        id: token(),
        author: "Danielle · Demo Owner",
        at: new Date(now).toISOString(),
        label: "Farmhouse starter",
        document,
      };
      await run(
        "INSERT INTO workspaces(id,owner_hash,draft_json,published_json,versions_json,created_at) VALUES(?,?,?,?,?,?)",
        id,
        await hash(id + accessKey),
        JSON.stringify(document),
        JSON.stringify(document),
        JSON.stringify([version]),
        version.at,
      );
      return json(
        input.customerDemo === true ? { id, publishedRevision: 1 } : {
          id,
          accessKey,
          ...ownerResult(
            await first("SELECT * FROM workspaces WHERE id=?", id),
          ),
        },
        201,
        input.customerDemo === true ? {} : { "Set-Cookie": await sessionCookie(id) },
      );
    }
    if (path === "/api/login" && request.method === "POST") {
      await rateLimit("login", 30);
      const row =
        typeof input.id === "string" &&
        (await first("SELECT * FROM workspaces WHERE id=?", input.id));
      if (
        !row ||
        typeof input.accessKey !== "string" ||
        input.accessKey.length > 100 ||
        (await hash(input.id + input.accessKey)) !== row.owner_hash
      )
        fail("Check your workspace ID and private access key.", 401);
      return json(ownerResult(row), 200, {
        "Set-Cookie": await sessionCookie(row.id),
      });
    }
    if (path === "/api/logout" && request.method === "POST") {
      const raw = /rr_studio=([a-f0-9]{48})/.exec(
        request.headers.get("Cookie") || "",
      )?.[1];
      if (raw) await run("DELETE FROM sessions WHERE hash=?", await hash(raw));
      return json({ ok: true }, 200, {
        "Set-Cookie":
          "rr_studio=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
      });
    }
    if (path === "/api/site" && request.method === "GET") {
      const id = url.searchParams.get("workspace");
      if (!id) return json({ document: seed(now), revision: 1, availabilityRevision: 0, id: "" });
      const row = await first(
        "SELECT published_json,published_revision,ledger_json,ledger_version FROM workspaces WHERE id=?",
        id,
      );
      if (!row) fail("This demo workspace was not found.", 404);
      return json({
        document: availableDocument(JSON.parse(row.published_json), JSON.parse(row.ledger_json)),
        revision: row.published_revision,
        availabilityRevision: row.ledger_version,
        id,
      });
    }
    if (path.startsWith("/api/preview/") && request.method === "GET") {
      const row = await first(
        "SELECT * FROM previews WHERE token_hash=? AND expires>?",
        await hash(path.split("/").at(-1)),
        now,
      );
      if (!row)
        fail("This preview expired. Create a new preview in Studio.", 404);
      return json({
        document: JSON.parse(row.document_json),
        id: row.workspace_id,
        preview: true,
      });
    }
    if (path.startsWith("/api/assets/") && request.method === "GET") {
      const row = await first(
        "SELECT * FROM assets WHERE id=?",
        path.split("/").at(-1),
      );
      if (!row) fail("Image not found.", 404);
      return new Response(row.bytes, {
        headers: {
          "Content-Type": row.mime,
          "Cache-Control": "public,max-age=86400",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox",
        },
      });
    }
    if (path === "/api/studio" && request.method === "GET")
      return json(ownerResult(await owner()));
    if (path === "/api/upload" && request.method === "POST") {
      const row = await owner();
      const count = await first(
        "SELECT count(*) AS n FROM assets WHERE workspace_id=?",
        row.id,
      );
      if (count.n >= 60)
        fail(
          "This demo has reached its 60-image limit. Create a fresh workspace.",
        );
      if (typeof input.data !== "string" || input.data.length > 2800000)
        fail("Image upload is too large.");
      let bytes;
      try {
        bytes = Uint8Array.from(atob(input.data), (c) => c.charCodeAt(0));
      } catch {
        fail("Image data could not be read.");
      }
      inspectImage(bytes, input.mime);
      const id = token();
      await run(
        "INSERT INTO assets(id,workspace_id,mime,bytes) VALUES(?,?,?,?)",
        id,
        row.id,
        input.mime,
        bytes.buffer,
      );
      return json({ src: "/api/assets/" + id }, 201);
    }
    if (
      ["/api/draft", "/api/publish", "/api/restore", "/api/preview"].includes(
        path,
      ) &&
      request.method === "POST"
    ) {
      const row = await owner();
      if (row.revision !== input.revision)
        fail(
          "This draft changed on another device. Export your changes, then reload the latest draft.",
          409,
        );
      if (path === "/api/preview") {
        const raw = token();
        await run(
          "INSERT INTO previews(token_hash,workspace_id,document_json,expires) VALUES(?,?,?,?)",
          await hash(raw),
          row.id,
          row.draft_json,
          now + 7 * 86400000,
        );
        return json({ path: "/preview/" + raw });
      }
      let document = input.document,
        versions = JSON.parse(row.versions_json);
      if (path === "/api/restore") {
        document = versions.find((v) => v.id === input.versionId)?.document;
        if (!document) fail("Version not found.", 404);
      }
      if (path === "/api/publish") document = JSON.parse(row.draft_json);
      document = validateDocument(copy(document));
      const serialized = JSON.stringify(document);
      const assetIds = [
        ...serialized.matchAll(/\/api\/assets\/([a-f0-9]{48})/g),
      ].map((m) => m[1]);
      for (const id of new Set(assetIds))
        if (
          !(await first(
            "SELECT id FROM assets WHERE id=? AND workspace_id=?",
            id,
            row.id,
          ))
        )
          fail("Use photos uploaded to this workspace.");
      const publish = path !== "/api/draft";
      if (publish)
        versions.unshift({
          id: token(),
          author: "Danielle · Demo Owner",
          at: new Date(now).toISOString(),
          label:
            path === "/api/restore"
              ? "Restored version"
              : "Published from Studio",
          document,
        });
      versions = versions.slice(0, 30);
      while (versions.length > 1 && JSON.stringify(versions).length > 1000000)
        versions.pop();
      const result = await run(
        "UPDATE workspaces SET draft_json=?,published_json=?,revision=revision+1,published_revision=?,versions_json=? WHERE id=? AND revision=?",
        serialized,
        publish ? serialized : row.published_json,
        publish ? row.revision + 1 : row.published_revision,
        JSON.stringify(versions.slice(0, 30)),
        row.id,
        row.revision,
      );
      if (result.meta.changes !== 1)
        fail("Another device saved first. Reload the latest draft.", 409);
      return json(
        ownerResult(await first("SELECT * FROM workspaces WHERE id=?", row.id)),
      );
    }
    if (path === "/api/orders" && request.method === "POST") {
      await rateLimit("orders", 100);
      if (
        typeof input.requestId !== "string" ||
        !/^[a-f0-9-]{20,60}$/.test(input.requestId)
      )
        fail("Invalid request ID.");
      for (let attempt = 0; attempt < 4; attempt++) {
        const row = await first(
          "SELECT * FROM workspaces WHERE id=?",
          input.workspaceId || "",
        );
        if (!row)
          fail(
            "Open or create a private demo before simulating an order.",
            404,
          );
        const ledger = JSON.parse(row.ledger_json),
          prior = ledger.orders.find((o) => o.requestId === input.requestId);
        if (prior) return json(prior);
        if (input.revision !== row.published_revision)
          fail(
            "The published site changed. Refresh your basket and review the latest prices and deadlines.",
            409,
          );
        if (ledger.orders.length >= 300)
          fail(
            "This demo has reached its order limit. Create a new workspace.",
          );
        const order = {
          ...quote(JSON.parse(row.published_json), ledger, input, now),
          id: token(),
          requestId: input.requestId,
          at: new Date(now).toISOString(),
          audit: [{ action: "Demo request", at: new Date(now).toISOString() }],
        };
        ledger.orders.unshift(order);
        const result = await run(
          "UPDATE workspaces SET ledger_json=?,ledger_version=ledger_version+1 WHERE id=? AND ledger_version=? AND published_revision=?",
          JSON.stringify(ledger),
          row.id,
          row.ledger_version,
          row.published_revision,
        );
        if (result.meta.changes === 1) return json(order, 201);
      }
      fail(
        "Another order reserved capacity. Review availability and try again.",
        409,
      );
    }
    if (path === "/api/order-status" && request.method === "POST") {
      const row = await owner(),
        ledger = JSON.parse(row.ledger_json),
        order = ledger.orders.find((o) => o.id === input.id);
      if (
        !order ||
        !["pending", "ready", "picked-up", "canceled"].includes(input.status)
      )
        fail("Choose an existing demo order and fulfillment status.");
      const transitions = {
        pending: ["pending", "ready", "canceled"],
        ready: ["ready", "picked-up", "canceled"],
        "picked-up": ["picked-up"],
        canceled: ["canceled"],
      };
      if (!transitions[order.status].includes(input.status))
        fail(
          "Completed or canceled orders cannot be reopened. Create a new request instead.",
          409,
        );
      order.status = input.status;
      order.audit.push({
        action: input.status,
        author: "Danielle · Demo Owner",
        at: new Date(now).toISOString(),
      });
      const result = await run(
        "UPDATE workspaces SET ledger_json=?,ledger_version=ledger_version+1 WHERE id=? AND ledger_version=?",
        JSON.stringify(ledger),
        row.id,
        row.ledger_version,
      );
      if (result.meta.changes !== 1)
        fail(
          "Another device updated orders. Refresh before trying again.",
          409,
        );
      return json(order);
    }
    fail("This action was not found.", 404);
  } catch (error) {
    return json(
      {
        error: error.status
          ? error.message
          : "Something went wrong. Please reload and try again.",
      },
      error.status || 500,
    );
  }
}
