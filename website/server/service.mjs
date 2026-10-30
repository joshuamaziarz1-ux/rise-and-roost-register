import * as css from "css-tree";
import { customerOrder, emailAddress, enqueue } from "./orders.mjs";
import { roostApi, commentsApi, memberFor, customerProfile } from "./roost.mjs";
import { trackingPath } from "../public/orders.mjs";
import { normalizeDeviceCode } from "../public/access.mjs";
import { seed, ZONE, localInstant, safeLink } from "../public/model.mjs";
import { managementApi, holdsInventory, productionLimit, structure } from './management.mjs';
import { isPreviewGrant } from './preview-access.mjs';

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
      "CDN-Cache-Control": "no-store",
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
  if (doc.business.pickupAddress && ['name', 'street', 'city'].some(key => typeof doc.business.pickupAddress[key] !== 'string' || !doc.business.pickupAddress[key].trim() || doc.business.pickupAddress[key].length > 200)) fail('Check the pickup address fields.');
  if (doc.business.paymentInstructions !== undefined && (typeof doc.business.paymentInstructions !== 'string' || doc.business.paymentInstructions.length > 3000)) fail('Use payment instructions of no more than 3,000 characters.');
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
      ["/studio", "/cart", "/product", "/api", "/demo", "/preview", "/orders"].includes(
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
    if (p.inventoryMode !== undefined && !['legacy', 'physical', 'production'].includes(p.inventoryMode)) fail('Choose a valid inventory model.');
    if (p.lowStockThreshold !== undefined && !integer(p.lowStockThreshold, 0, 10000)) fail('Check the low-stock threshold.');
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
    for (const [id, value] of Object.entries(p.productionLimits || {})) if (!doc.products.some(product => product.id === id) || !integer(value, 0, 10000)) fail('Check production limits for this pickup.');
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
  if (doc.orderingPaused) fail('New ordering is paused. Please check back soon.', 409);
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
    (o) => o.pickupId === pickup.id && holdsInventory(o),
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
      product.archived || product.soldOut ||
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
      .filter(holdsInventory)
      .flatMap((o) => o.lines)
      .filter((l) => l.productId === product.id)
      .reduce((n, l) => n + l.qty, 0);
    if (
      (product.inventoryMode !== 'physical' && booked + sameProductQty > productionLimit(product, pickup)) ||
      (product.inventoryMode !== 'production' && allBooked + sameProductQty > product.stock)
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
export function availableDocument(document, ledger, { managed = false, now = Date.now() } = {}) {
  const doc = copy(document);
  const units = new Map(), orders = new Map();
  for (const order of ledger.orders) {
    if (!holdsInventory(order)) continue;
    orders.set(order.pickupId, (orders.get(order.pickupId) || 0) + 1);
    for (const line of order.lines)
      units.set(line.productId, (units.get(line.productId) || 0) + line.qty);
  }
  const perPickup = new Map();
  for (const order of ledger.orders.filter(holdsInventory)) for (const line of order.lines) {
    const key = order.pickupId + ':' + line.productId; perPickup.set(key, (perPickup.get(key) || 0) + line.qty);
  }
  for (const product of doc.products) {
    if (product.inventoryMode !== 'production') product.stock = Math.max(0, product.stock - (units.get(product.id) || 0));
    else {
      const remaining = doc.pickups.filter(p => !p.closed && localInstant(p.cutoffDate, p.cutoffTime) > now).map(p => Math.max(0, productionLimit(product, p) - (perPickup.get(p.id + ':' + product.id) || 0)));
      product.stock = product.capacity = Math.max(0, ...remaining);
    }
    if (product.archived) product.active = false;
    if (product.soldOut) product.stock = 0;
  }
  for (const pickup of doc.pickups)
    pickup.capacity = Math.max(0, pickup.capacity - (orders.get(pickup.id) || 0));
  if (managed) {
    for (const p of doc.pickups) p.productionRemaining = Object.fromEntries(doc.products.filter(v => v.inventoryMode === 'production').map(product => [product.id, Math.max(0, productionLimit(document.products.find(v => v.id === product.id), p) - (perPickup.get(p.id + ':' + product.id) || 0))]));
    doc.pickups = doc.orderingPaused ? [] : doc.pickups.filter(p => !p.closed && p.capacity > 0 && localInstant(p.cutoffDate, p.cutoffTime) > now && localInstant(p.date, p.start) > now);
  }
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
export async function api(request, db, now = Date.now(), { publicWorkspaceId = "", emailEnabled = false, customerExperienceEnabled = false, reviewBuild = false, studioManagementEnabled = false, previewGrant } = {}) {
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
    if (previewGrant && (!isPreviewGrant(previewGrant) || previewGrant.expiresAt <= now || previewGrant.workspaceId !== publicWorkspaceId || !reviewBuild || !studioManagementEnabled)) fail('The private testing restriction could not be verified.', 403);
    if (previewGrant && (path === '/api/workspaces' || path === '/api/login' || path === '/api/logout' || path.startsWith('/api/device-'))) fail('This private preview uses its existing website and network restriction. Workspace creation and sign-in changes are disabled.', 403);
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
    const requestedOwnerId = request.headers.get("X-RR-Workspace") || "";
    if (requestedOwnerId && !/^[a-f0-9]{48}$/.test(requestedOwnerId)) fail("Use a valid workspace identifier.");
    let authenticated;
    const cookieValue = (name) => (request.headers.get("Cookie") || "").split(";").map((p) => p.trim()).find((p) => p.startsWith(name + "="))?.slice(name.length + 1);
    const cookie = (name, raw, seconds) => `${name}=${raw}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${seconds}${url.protocol === "https:" ? "; Secure" : ""}`;
    const sessionCookies = (id, raw, seconds = 43200) => [cookie("rr_studio", raw, seconds), cookie("rr_studio_" + id, raw, seconds)];
    const withCookies = (response, values) => {
      for (const value of values) response.headers.append("Set-Cookie", value);
      return response;
    };
    const preserveLegacy = async (values) => {
      const raw = cookieValue("rr_studio");
      if (/^[a-f0-9]{48}$/.test(raw || "")) {
        const previous = await first("SELECT * FROM sessions WHERE hash=? AND expires>?", await hash(raw), now);
        if (previous && !values.some((v) => v.startsWith("rr_studio_" + previous.workspace_id + "=")) && cookieValue("rr_studio_" + previous.workspace_id) !== raw)
          values.push(cookie("rr_studio_" + previous.workspace_id, raw, Math.max(1, Math.floor((previous.expires - now) / 1000))));
      }
      return values;
    };
    const sessionCookie = async (id) => {
      const raw = token();
      await run("INSERT INTO sessions(hash,workspace_id,expires) VALUES(?,?,?)", await hash(raw), id, now + 12 * 3600000);
      authenticated = { raw, workspace_id: id, expires: now + 12 * 3600000, hash: await hash(raw) };
      return preserveLegacy(sessionCookies(id, raw));
    };
    const owner = async () => {
      if (previewGrant) {
        if (requestedOwnerId && requestedOwnerId !== publicWorkspaceId) fail('This test session can manage only the existing main preview website.', 403);
        const row = await first('SELECT * FROM workspaces WHERE id=?', publicWorkspaceId);
        if (!row) fail('The existing preview workspace is unavailable. No replacement was created.', 503);
        authenticated = { expires: previewGrant.expiresAt, preview: true };
        return row;
      }
      const scoped = (request.headers.get("Cookie") || "").split(";").map((p) => p.trim()).filter((p) => /^rr_studio_[a-f0-9]{48}=/.test(p));
      const candidates = requestedOwnerId ? [cookieValue("rr_studio_" + requestedOwnerId), cookieValue("rr_studio")]
        : [cookieValue("rr_studio"), publicWorkspaceId ? cookieValue("rr_studio_" + publicWorkspaceId) : undefined, ...(scoped.length === 1 ? [scoped[0].split("=")[1]] : [])];
      for (const raw of candidates) {
        if (!/^[a-f0-9]{48}$/.test(raw || "")) continue;
        const session = await first("SELECT * FROM sessions WHERE hash=? AND expires>?", await hash(raw), now);
        if (!session || (requestedOwnerId && session.workspace_id !== requestedOwnerId)) continue;
        const row = await first("SELECT * FROM workspaces WHERE id=?", session.workspace_id);
        if (row) { authenticated = { ...session, raw }; return row; }
      }
      fail("This browser is not signed in to the requested workspace. Use that workspace's own access key or connect from a currently signed-in owner device. Sessions expire after 12 hours.", 401);
    };
    const ownerResult = (row) => ({
      id: row.id,
      draft: JSON.parse(row.draft_json),
      published: JSON.parse(row.published_json),
      revision: row.revision,
      publishedRevision: row.published_revision,
      versions: JSON.parse(row.versions_json).map(({ document, ...v }) => v),
      orders: JSON.parse(row.ledger_json).orders.map((o) => ({ ...o, orderNumber: o.orderNumber || "RR-" + o.id.slice(0, 16).toUpperCase(), version: o.version || 1, trackingPath: trackingPath(row.id, o) })),
      notificationsEnabled: emailEnabled && row.id === publicWorkspaceId,
      owner: "Danielle · Demo Owner",
      customerExperienceEnabled,
      studioManagementEnabled,
      previewDirectAccess: !!previewGrant,
      previewAccessExpiresAt: previewGrant ? new Date(previewGrant.expiresAt).toISOString() : undefined,
      isReview: reviewBuild,
      sessionExpiresAt: authenticated ? new Date(authenticated.expires).toISOString() : undefined,
      isPrimary: row.id === publicWorkspaceId,
      publishedPath: row.id === publicWorkspaceId ? "/" : "/demo/" + row.id,
      studioPath: previewGrant ? '/studio' : "/studio?workspace=" + row.id,
      mainStudioPath: previewGrant ? '/studio' : publicWorkspaceId ? "/studio?workspace=" + publicWorkspaceId : "",
    });
    if (customerExperienceEnabled && path.startsWith("/api/roost/"))
      return await roostApi({ request, db, now, input, path, json, rateLimit });
    if (customerExperienceEnabled && (path === "/api/comments" || path === "/api/studio-comments"))
      { if (studioManagementEnabled && path === '/api/studio-comments' && request.method === 'POST') fail('Use Website Studio comment management so changes are audited.', 403); return await commentsApi({ request, db, now, input, path, json, rateLimit, owner, publicWorkspaceId }); }
    if (studioManagementEnabled && request.method === 'POST' && ['/api/draft', '/api/publish', '/api/restore', '/api/order-payment', '/api/order-status', '/api/order-fulfillment'].includes(path)) {
      await owner(); fail('Use Website Studio management controls. The approved layout is locked and business changes require an audit record.', 403);
    }
    if (studioManagementEnabled && path.startsWith('/api/manage/')) {
      const row = await owner();
      const actor = previewGrant ? previewGrant.actor : { id: 'workspace-session:' + authenticated.hash.slice(0, 16), name: 'Owner · workspace access', authentication: 'workspace_access' };
      return await managementApi({ request, db, now, row, actor, input, path, json, validateDocument, ownerResult });
    }
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
      if (input.customerDemo === true) return json({ id, publishedRevision: 1 }, 201);
      const cookies = await sessionCookie(id);
      return withCookies(json({ id, accessKey, ...ownerResult(await first("SELECT * FROM workspaces WHERE id=?", id)) }, 201), cookies);
    }
    if (path === "/api/login" && request.method === "POST") {
      await rateLimit("login", 30);
      const id = typeof input.id === "string" ? input.id.trim() : "";
      const accessKey = typeof input.accessKey === "string" ? input.accessKey.trim() : "";
      const row = /^[a-f0-9]{48}$/.test(id) && await first("SELECT * FROM workspaces WHERE id=?", id);
      if (!row || accessKey.length > 100 || !accessKey || (await hash(id + accessKey)) !== row.owner_hash)
        fail("These workspace details do not match. Each private demo has its own key; the main website needs its original matching pair. Sessions last 12 hours. No key or saved website has been reset.", 401);
      if (requestedOwnerId && requestedOwnerId !== id) fail("These details belong to a different workspace. Open its own Studio URL; they cannot unlock the workspace selected here.", 409);
      const cookies = await sessionCookie(id);
      return withCookies(json(ownerResult(row)), cookies);
    }
    if (path === "/api/logout" && request.method === "POST") {
      let logoutWorkspaceId = requestedOwnerId;
      if (!logoutWorkspaceId) {
        try { logoutWorkspaceId = (await owner()).id; } catch { /* Expired legacy cookies can still be cleared below. */ }
      }
      const names = logoutWorkspaceId ? ["rr_studio_" + logoutWorkspaceId, "rr_studio"] : ["rr_studio"];
      const clear = [];
      for (const name of names) {
        const raw = cookieValue(name);
        if (!/^[a-f0-9]{48}$/.test(raw || "")) continue;
        const session = await first("SELECT * FROM sessions WHERE hash=?", await hash(raw));
        if (logoutWorkspaceId && session && session.workspace_id !== logoutWorkspaceId) continue;
        await run("UPDATE sessions SET expires=0 WHERE hash=?", await hash(raw));
        clear.push(cookie(name, "", 0));
      }
      if (!clear.length) clear.push(cookie(logoutWorkspaceId ? "rr_studio_" + logoutWorkspaceId : "rr_studio", "", 0));
      return withCookies(json({ ok: true }), clear);
    }
    if (path === "/api/studio-info" && request.method === "GET")
      return json({ mainWorkspaceId: publicWorkspaceId, mainStudioPath: previewGrant ? '/studio' : publicWorkspaceId ? "/studio?workspace=" + publicWorkspaceId : "", sessionHours: 12, studioManagementEnabled, previewDirectAccess: !!previewGrant });
    if (path === "/api/device-start" && request.method === "POST") {
      await rateLimit("device-start", 15);
      const id = typeof input.workspaceId === "string" ? input.workspaceId : "";
      if (!/^[a-f0-9]{48}$/.test(id) || !await first("SELECT id FROM workspaces WHERE id=?", id)) fail("Open the Studio URL for the workspace you want to connect to.", 404);
      if ((await first("SELECT count(*) AS n FROM device_links WHERE expires>? AND consumed_at IS NULL", now)).n >= 200) fail("Too many connection requests are pending. Try again after they expire.", 429);
      const requestId = token(), raw = token(), code = token().slice(0, 10).toUpperCase(), expires = now + 10 * 60000;
      await run("INSERT INTO device_links(id,workspace_id,code_hash,recipient_hash,created_at,expires) VALUES(?,?,?,?,?,?)", requestId, id, await hash("device-code:" + code), await hash(raw), now, expires);
      return withCookies(json({ requestId, workspaceId: id, code: code.slice(0, 4) + "-" + code.slice(4, 8) + "-" + code.slice(8), expiresAt: new Date(expires).toISOString() }, 201), [cookie("rr_pair_" + requestId, raw, 600)]);
    }
    if (["/api/device-review", "/api/device-approve"].includes(path) && request.method === "POST") {
      const row = await owner();
      await rateLimit("device-review", 30);
      const code = normalizeDeviceCode(input.code);
      if (!/^[A-F0-9]{10}$/.test(code)) fail("Enter the temporary code shown on the computer you want to connect.");
      const link = await first("SELECT * FROM device_links WHERE code_hash=? AND expires>? AND consumed_at IS NULL", await hash("device-code:" + code), now);
      if (!link) fail("This connection code is invalid, expired, or already used. Start again on the other computer.", 404);
      if (link.workspace_id !== row.id) fail("This code requests a different workspace. Only an owner signed in to that exact workspace can approve it. A private demo cannot authorize the main website.", 403);
      if (path === "/api/device-review") return json({ requestId: link.id, workspaceId: row.id, isPrimary: row.id === publicWorkspaceId, expiresAt: new Date(link.expires).toISOString() });
      if (input.confirmed !== true || input.requestId !== link.id) fail("Review this request and explicitly approve the matching code on your other computer.");
      const result = await run("UPDATE device_links SET approved_by=?,approved_at=? WHERE id=? AND approved_by IS NULL AND consumed_at IS NULL AND expires>?", authenticated.hash, now, link.id, now);
      if (result.meta.changes !== 1) fail("This connection request was already approved or expired. Check the other computer.", 409);
      return json({ approved: true, workspaceId: row.id });
    }
    if (path === "/api/device-claim" && request.method === "POST") {
      if (!/^[a-f0-9]{48}$/.test(input.requestId || "")) fail("Start a connection request on this computer first.");
      const raw = cookieValue("rr_pair_" + input.requestId);
      const link = await first("SELECT * FROM device_links WHERE id=?", input.requestId);
      if (!link || !/^[a-f0-9]{48}$/.test(raw || "") || await hash(raw) !== link.recipient_hash) fail("Only the browser that started this request can connect. Start again on this computer.", 401);
      if (link.consumed_at !== null) fail("This connection code has already been used. Sign in normally or start a new request.", 409);
      if (link.expires <= now) fail("This connection code expired. Start a new request.", 410);
      if (!link.approved_by) return json({ status: "pending", expiresAt: new Date(link.expires).toISOString() });
      const approver = await first("SELECT * FROM sessions WHERE hash=? AND workspace_id=? AND expires>?", link.approved_by, link.workspace_id, now);
      if (!approver) fail("The approving owner's session expired or was signed out. A currently authenticated owner must approve a new request.", 401);
      const sessionRaw = token(), sessionHash = await hash(sessionRaw), expires = now + 12 * 3600000;
      const results = await db.batch([
        db.prepare("UPDATE device_links SET consumed_at=?,claim_hash=? WHERE id=? AND consumed_at IS NULL AND expires>? AND EXISTS(SELECT 1 FROM sessions WHERE hash=device_links.approved_by AND workspace_id=device_links.workspace_id AND expires>?)").bind(now, sessionHash, link.id, now, now),
        db.prepare("INSERT INTO sessions(hash,workspace_id,expires) SELECT claim_hash,workspace_id,? FROM device_links WHERE id=? AND claim_hash=?").bind(expires, link.id, sessionHash),
      ]);
      if (results[0].meta.changes !== 1 || results[1].meta.changes !== 1) fail("This request changed or was already used. Start again on the other computer.", 409);
      authenticated = { raw: sessionRaw, hash: sessionHash, workspace_id: link.workspace_id, expires };
      const row = await first("SELECT * FROM workspaces WHERE id=?", link.workspace_id);
      return withCookies(json({ status: "connected", ...ownerResult(row) }), await preserveLegacy([...sessionCookies(row.id, sessionRaw), cookie("rr_pair_" + link.id, "", 0)]));
    }
    if (path === "/api/site" && request.method === "GET") {
      const id = url.searchParams.get("workspace") || publicWorkspaceId;
      if (!id) return json({ document: seed(now), revision: 1, availabilityRevision: 0, id: "", customerExperienceEnabled: false });
      const row = await first(
        "SELECT published_json,published_revision,ledger_json,ledger_version FROM workspaces WHERE id=?",
        id,
      );
      if (!row) fail("This published workspace was not found. Contact the beta operator; saved content has not been reset.", id === publicWorkspaceId ? 503 : 404);
      return json({
        customerExperienceEnabled,
        notificationsEnabled: emailEnabled && id === publicWorkspaceId,
        document: availableDocument(JSON.parse(row.published_json), JSON.parse(row.ledger_json), { managed: studioManagementEnabled, now }),
        revision: row.published_revision,
        availabilityRevision: row.ledger_version,
        studioManagementEnabled,
        id,
        isPrimary: id === publicWorkspaceId,
        studioPath: previewGrant ? '/studio' : "/studio?workspace=" + id,
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
        customerExperienceEnabled,
      });
    }
    if (path.startsWith("/api/assets/") && request.method === "GET") {
      const row = await first(
        "SELECT * FROM assets WHERE id=?",
        path.split("/").at(-1),
      );
      if (!row) fail("Image not found.", 404);
      // D1 returns BLOBs as number arrays; SQLite returns Uint8Array. Response
      // would stringify a plain array into comma-separated text and break images.
      return new Response(new Uint8Array(row.bytes), {
        headers: {
          "Content-Type": row.mime,
          "Cache-Control": "public,max-age=86400",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox",
        },
      });
    }
    if (path === "/api/studio" && request.method === "GET") {
      const row = await owner();
      const response = json(ownerResult(row));
      if (!previewGrant && cookieValue("rr_studio_" + row.id) !== authenticated.raw)
        response.headers.append("Set-Cookie", cookie("rr_studio_" + row.id, authenticated.raw, Math.max(1, Math.floor((authenticated.expires - now) / 1000))));
      return response;
    }
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
      if (studioManagementEnabled && structure(document) !== structure(JSON.parse(row.published_json))) fail('The approved layout is locked in Website Studio. Edit wording or images only.', 403);
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
      const checkoutMember = customerExperienceEnabled && input.checkoutMode === "member"
        ? await memberFor(request, db, input.workspaceId, now, true) : null;
      if (customerExperienceEnabled && input.checkoutMode && !["guest", "member"].includes(input.checkoutMode)) fail("Choose guest or member checkout.");
      if (
        typeof input.requestId !== "string" ||
        !/^[a-f0-9-]{20,60}$/.test(input.requestId)
      )
        fail("Invalid request ID.");
      if (input.storefront === "main" && (!publicWorkspaceId || input.workspaceId !== publicWorkspaceId))
        fail("The main website workspace changed or is unavailable. Reload the public website before placing an order; no separate demo order was created.", 409);
      for (let attempt = 0; attempt < 4; attempt++) {
        const row = await first(
          "SELECT * FROM workspaces WHERE id=?",
          input.storefront === "main" ? publicWorkspaceId : input.workspaceId || "",
        );
        if (!row)
          fail(
            "Open or create a private demo before simulating an order.",
            404,
          );
        const ledger = JSON.parse(row.ledger_json),
          prior = ledger.orders.find((o) => o.requestId === input.requestId);
        if (prior) return json(customerOrder(prior, row.id));
        if (input.revision !== row.published_revision)
          fail(
            "The published site changed. Refresh your basket and review the latest prices and deadlines.",
            409,
          );
        if (ledger.orders.length >= 300)
          fail(
            "This demo has reached its order limit. Create a new workspace.",
          );
        const customer = { emailOptIn: false };
        if (customerExperienceEnabled && (input.checkoutMode || input.customerDetails)) {
          const profile = customerProfile(input.customerDetails);
          customer.name = profile.name;
          customer.phone = profile.phone;
          customer.contactEmail = profile.email;
        }
        if (checkoutMember) customer.memberId = checkoutMember.id;
        if (input.emailOptIn === true) {
          if (!emailEnabled || row.id !== publicWorkspaceId)
            fail("Email updates are not configured for this beta site. Leave email updates off and use your private status page.", 409);
          const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
          if (!emailAddress(email)) fail("Enter a valid email address for order updates.");
          customer.email = email;
          customer.emailOptIn = true;
          customer.consentedAt = new Date(now).toISOString();
        }
        const order = {
          ...quote(JSON.parse(row.published_json), ledger, input, now),
          id: token(),
          requestId: input.requestId,
          trackingKey: token(),
          version: 1,
          customer,
          notifications: [],
          merchant: (() => {
            const { name, address, email, pickupAddress } = JSON.parse(row.published_json).business;
            return { name, address, email, ...(studioManagementEnabled ? { pickupAddress: pickupAddress || { name: 'Rise & Roost', street: '3431 County Rd. 60', city: 'Auburn, IN 46706' } } : {}) };
          })(),
          at: new Date(now).toISOString(),
          audit: [{ action: "Demo request", at: new Date(now).toISOString() }],
        };
        order.orderNumber = "RR-" + order.id.slice(0, 16).toUpperCase();
        enqueue(order, "received", order.at, token);
        ledger.orders.unshift(order);
        const result = await run(
          "UPDATE workspaces SET ledger_json=?,ledger_version=ledger_version+1 WHERE id=? AND ledger_version=? AND published_revision=?",
          JSON.stringify(ledger),
          row.id,
          row.ledger_version,
          row.published_revision,
        );
        if (result.meta.changes === 1) return json(customerOrder(order, row.id), 201);
      }
      fail(
        "Another order reserved capacity. Review availability and try again.",
        409,
      );
    }
    const tracking = /^\/api\/order-tracking\/([a-f0-9]{48})\/([a-f0-9]{48})(\/report)?$/.exec(path);
    if (tracking && ((request.method === "GET" && !tracking[3]) || (request.method === "POST" && tracking[3]))) {
      const raw = /^Bearer ([a-f0-9]{48})$/.exec(request.headers.get("Authorization") || "")?.[1];
      if (!raw) fail("Use the complete private tracking link from your order confirmation.", 401);
      for (let attempt = 0; attempt < 4; attempt++) {
        const row = await first("SELECT * FROM workspaces WHERE id=?", tracking[1]);
        const ledger = row && JSON.parse(row.ledger_json);
        const order = ledger?.orders.find((o) => o.id === tracking[2]);
        if (!order?.trackingKey || await hash(raw) !== await hash(order.trackingKey)) {
          await rateLimit("tracking-denied", 60);
          fail("This private tracking link is invalid. Check the complete link or contact the farm.", 404);
        }
        if (request.method === "GET") return json(customerOrder(order, row.id));
        if (order.status === "canceled") fail("This order was canceled. Contact the farm about payment.", 409);
        if (["reported", "verified"].includes(order.paymentStatus)) return json(customerOrder(order, row.id));
        order.paymentStatus = "reported";
        order.paymentReportedAt = new Date(now).toISOString();
        order.version = (order.version || 1) + 1;
        order.audit.push({ action: "Payment reported by customer; not verified", at: order.paymentReportedAt });
        const result = await run("UPDATE workspaces SET ledger_json=?,ledger_version=ledger_version+1 WHERE id=? AND ledger_version=?",
          JSON.stringify(ledger), row.id, row.ledger_version);
        if (result.meta.changes === 1) return json(customerOrder(order, row.id));
      }
      fail("Another update arrived first. Refresh your order status and try again.", 409);
    }
    if (["/api/order-status", "/api/order-fulfillment", "/api/order-payment", "/api/order-link"].includes(path) && request.method === "POST") {
      const row = await owner(),
        ledger = JSON.parse(row.ledger_json),
        order = ledger.orders.find((o) => o.id === input.id);
      if (!order) fail("Choose an existing order.");
      if (path !== "/api/order-status" && input.version !== (order.version || 1))
        fail("This order changed on another device. Refresh orders before trying again.", 409);
      const at = new Date(now).toISOString();
      let action;
      if (path === "/api/order-link") {
        if (order.trackingKey) return json({ ...order, trackingPath: trackingPath(row.id, order) });
        order.trackingKey = token();
        order.orderNumber ||= "RR-" + order.id.slice(0, 16).toUpperCase();
        action = "Private tracking link enabled for existing order";
      } else if (path === "/api/order-payment") {
        if (order.status === "canceled") fail("Canceled orders cannot be verified here. Check records and handle any refund separately.", 409);
        if (order.paymentStatus === "verified") return json(order);
        if (input.independentlyVerified !== true || !["bank_record", "cash_record", "external_record"].includes(input.method) ||
          typeof input.evidence !== "string" || input.evidence.trim().length < 5 || input.evidence.length > 500)
          fail("Confirm that you checked an independent payment record and enter its reference (5–500 characters). A customer report alone is not verification.");
        order.paymentStatus = "verified";
        order.paymentVerifiedAt = at;
        order.verification = { method: input.method, evidence: input.evidence.trim(), at, author: "Danielle · Demo Owner" };
        order.paidReceipt = {
          number: "BETA-PAID-" + order.id.slice(0, 16).toUpperCase(),
          orderNumber: order.orderNumber || "RR-" + order.id.slice(0, 16).toUpperCase(),
          issuedAt: at, paidAt: at, total: order.total, currency: "USD", lines: copy(order.lines),
          verification: "Independent payment record checked by Danielle",
          merchant: order.merchant || { name: "Rise & Roost" },
          beta: true, websiteProcessedPayment: false,
        };
        enqueue(order, "verified", at, token);
        action = "Payment independently verified; beta paid receipt issued";
      } else {
        const transitions = {
          pending: ["pending", "preparing", "ready", "canceled"],
          preparing: ["preparing", "ready", "canceled"],
          ready: ["ready", "picked-up", "canceled"],
          "picked-up": ["picked-up"], canceled: ["canceled"],
        };
        if (!Object.hasOwn(transitions, input.status)) fail("Choose an existing order and fulfillment status.");
        if (!transitions[order.status]?.includes(input.status))
          fail("Completed, canceled, or advanced orders cannot move backward. Refresh before trying again.", 409);
        if (input.status === order.status) return json(order);
        order.status = input.status;
        const timestamp = { preparing: "preparingAt", ready: "readyAt", "picked-up": "pickedUpAt", canceled: "canceledAt" }[input.status];
        if (timestamp) order[timestamp] = at;
        enqueue(order, input.status, at, token);
        action = "Fulfillment: " + input.status;
      }
      order.version = (order.version || 1) + 1;
      order.audit.push({ action, author: "Danielle · Demo Owner", at });
      const result = await run(
        "UPDATE workspaces SET ledger_json=?,ledger_version=ledger_version+1 WHERE id=? AND ledger_version=?",
        JSON.stringify(ledger), row.id, row.ledger_version,
      );
      if (result.meta.changes !== 1)
        fail("Another device updated orders. Refresh before trying again.", 409);
      return json({ ...order, trackingPath: trackingPath(row.id, order) });
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
