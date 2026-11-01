import { ZONE, localInstant, clone } from '../public/model.mjs';
import { trackingPath } from '../public/orders.mjs';
import { enqueue } from './orders.mjs';
import { restoreBusinessBackup } from './management-backup.mjs';

const bad = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const cents = (n, max = 1000000) => Number.isInteger(n) && n >= 0 && n <= max;
const identifier = value => /^[a-zA-Z0-9_-]{1,80}$/.test(value || '');
const dayParts = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
export function businessDay(value) {
  const p = Object.fromEntries(dayParts.formatToParts(new Date(value)).map(v => [v.type, v.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
const addDays = (day, count) => new Date(Date.parse(day + 'T12:00:00Z') + count * 86400000).toISOString().slice(0, 10);
export function reportRange(period = 'today', now = Date.now(), start, end) {
  const today = businessDay(now); let from = today, through = today;
  if (period === 'week') {
    const weekday = new Date(today + 'T12:00:00Z').getUTCDay();
    from = addDays(today, -((weekday + 6) % 7)); through = addDays(from, 6);
  } else if (period === 'month') { from = today.slice(0, 7) + '-01'; through = addDays(new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7), 1)).toISOString().slice(0, 10), -1); }
  else if (period === 'year') { from = today.slice(0, 4) + '-01-01'; through = today.slice(0, 4) + '-12-31'; }
  else if (period === 'custom') { from = start; through = end; }
  else if (period !== 'today') bad('Choose Today, Week, Month, Year, or Custom Date.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(through || '')) bad('Choose valid start and end dates.');
  let first, until;
  try { first = localInstant(from, '00:00'); localInstant(through, '00:00'); until = localInstant(addDays(through, 1), '00:00'); }
  catch { bad('Choose valid calendar dates.'); }
  if (first >= until || until - first > 3660 * 86400000) bad('Choose a valid date range of no more than ten years.');
  return { period, start: from, end: through, first, until };
}
export function financialReport(orders, range) {
  const inside = value => !!value && Date.parse(value) >= range.first && Date.parse(value) < range.until;
  const placed = orders.filter(o => inside(o.at));
  const verified = orders.flatMap(o => (Array.isArray(o.verifications) ? o.verifications.filter(v => !v.voidedAt) : o.paymentVerifiedAt ? [{ at: o.paymentVerifiedAt, amount: o.paidReceipt?.total ?? o.total }] : []).map(v => ({ order: o, ...v }))).filter(v => inside(v.at));
  const adjustments = orders.flatMap(o => (o.refunds || []).map(r => ({ ...r, orderId: o.id }))).filter(r => inside(r.at));
  const corrections = orders.flatMap(o => o.paymentCorrections || []).filter(r => inside(r.at));
  const products = new Map();
  for (const { order: o } of verified) for (const l of o.lines) {
    const k = l.productId + ':' + l.variantId, prior = products.get(k) || { productId: l.productId, name: l.name, variant: l.variant, quantity: 0, value: 0 };
    prior.quantity += l.qty; prior.value += l.qty * l.unitPrice; products.set(k, prior);
  }
  const verifiedSales = verified.reduce((n, payment) => n + payment.amount, 0);
  const refunds = adjustments.reduce((n, r) => n + r.amount, 0), corrected = corrections.reduce((n, r) => n + r.amount, 0);
  const counts = new Map();
  for (const o of orders.filter(o => o.status !== 'canceled' && o.customer?.memberId)) counts.set(o.customer.memberId, (counts.get(o.customer.memberId) || 0) + 1);
  return { range, verifiedSales, refunds, verificationCorrections: corrected, netVerifiedReceipts: verifiedSales - refunds,
    orderValue: placed.reduce((n, o) => n + o.total, 0), ordersPlaced: placed.length,
    canceledOrders: placed.filter(o => o.status === 'canceled').length,
    canceledOrderValue: placed.filter(o => o.status === 'canceled').reduce((n, o) => n + o.total, 0),
    reportedValue: orders.filter(o => o.paymentStatus === 'reported' && o.status !== 'canceled').reduce((n, o) => n + o.total, 0),
    outstandingValue: orders.filter(o => !o.paymentVerifiedAt && o.status !== 'canceled').reduce((n, o) => n + o.total, 0),
    popularProducts: [...products.values()].sort((a, b) => b.quantity - a.quantity),
    returningMembers: new Set(placed.filter(o => o.status !== 'canceled' && o.customer?.memberId && counts.get(o.customer.memberId) > 1).map(o => o.customer.memberId)).size };
}
export const holdsInventory = o => o.status !== 'canceled' || o.keepInventory === true;
export const productionLimit = (product, pickup) => pickup.productionLimits?.[product.id] ?? product.capacity;
export function bookedUnits(ledger, productId, pickupId) {
  return ledger.orders.filter(o => holdsInventory(o) && (!pickupId || o.pickupId === pickupId)).flatMap(o => o.lines).filter(l => l.productId === productId).reduce((n, l) => n + l.qty, 0);
}
export function structure(document) {
  const fixed = s => Object.fromEntries(Object.entries(s).filter(([key]) => !['title', 'body', 'image', 'alt', 'items', 'button'].includes(key)));
  return canonical({ theme: document.theme, pages: document.pages.map(p => ({
    id: p.id, slug: p.slug, showInNav: p.showInNav,
    sections: p.sections.map(s => ({ ...fixed(s), items: (s.items || []).map(fixed) })),
  })) });
}
const text = (value, max, label, required = false) => {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) bad('Check ' + label + '.');
  return value.trim();
};
const opaque = () => crypto.randomUUID().replace(/-/g, '');
const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
async function digest(value) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(v => v.toString(16).padStart(2, '0')).join(''); }
export function productionList(orders, date) {
  const selected = orders.filter(o => o.pickup.date === date && !['canceled', 'picked-up'].includes(o.status));
  const combined = new Map();
  for (const o of selected) for (const l of o.lines) {
    const key = l.productId + ':' + l.variantId;
    const item = combined.get(key) || { productId: l.productId, name: l.name, variant: l.variant, quantity: 0 };
    item.quantity += l.qty; combined.set(key, item);
  }
  return { date, orders: selected, products: [...combined.values()].sort((a, b) => a.name.localeCompare(b.name)) };
}

export async function managementApi({ request, db, now, row, actor, input, path, json, validateDocument, ownerResult }) {
  const first = (sql, ...params) => db.prepare(sql).bind(...params).first();
  const all = async (sql, ...params) => (await db.prepare(sql).bind(...params).all()).results;
  const url = new URL(request.url), at = new Date(now).toISOString();
  if (input.workspaceId && input.workspaceId !== row.id) bad('This action belongs to another workspace.', 403);
  const current = async () => first('SELECT * FROM workspaces WHERE id=?', row.id);
  async function snapshot(source = row) {
    const doc = JSON.parse(source.published_json), ledger = JSON.parse(source.ledger_json), m = ledger.management || {};
    const members = await all('SELECT id,profile_json,created_at FROM roost_members WHERE workspace_id=? ORDER BY created_at DESC LIMIT 500', row.id);
    const comments = await all('SELECT * FROM customer_comments WHERE workspace_id=? ORDER BY created_at DESC LIMIT 500', row.id);
    const range = reportRange(url.searchParams.get('period') || 'today', now, url.searchParams.get('start'), url.searchParams.get('end'));
    const today = financialReport(ledger.orders, reportRange('today', now));
    const products = doc.products.map(p => ({ ...p, booked: bookedUnits(ledger, p.id), available: Math.max(0, p.stock - bookedUnits(ledger, p.id)) }));
    const contentOnly = document => { const d = clone(document); delete d.products; delete d.pickups; delete d.orderingPaused; return d; };
    return { ...ownerResult(source), hasContentDraft: canonical(contentOnly(JSON.parse(source.draft_json))) !== canonical(contentOnly(doc)), orders: ownerResult(source).orders.map(o => ({ ...o, businessDate: businessDay(o.at) })), ledgerVersion: source.ledger_version, actor, layoutLocked: true, now: at,
      management: { reports: financialReport(ledger.orders, range), today, products,
        members: members.map(m => ({ id: m.id, profile: JSON.parse(m.profile_json), createdAt: m.created_at,
          orderCount: ledger.orders.filter(o => o.customer?.memberId === m.id).length,
          benefits: (ledger.management?.benefits || []).filter(b => b.memberId === m.id) })), comments,
        audit: (m.audit || []).slice(0, 500), benefits: m.benefits || [],
        ownerAccounts: { provider: 'Descope', configured: false, activationRequiresApproval: true },
        notifications: { externalEnabled: false, preferences: m.notificationPreferences || { orders: true, payments: true, stock: true, pickups: true, comments: true, errors: true } },
        limits: { orderCount: ledger.orders.length, orderLimit: 300, memberDirectoryLimit: 500 },
        attention: {
          payments: ledger.orders.filter(o => o.paymentStatus === 'reported' && o.status !== 'canceled').length,
          newOrders: ledger.orders.filter(o => o.status === 'pending').length,
          upcoming: ledger.orders.filter(o => !['canceled', 'picked-up'].includes(o.status) && localInstant(o.pickup.date, o.pickup.end) > now && localInstant(o.pickup.date, o.pickup.start) < now + 2 * 86400000).length,
          lowStock: products.filter(p => !p.archived && p.inventoryMode !== 'production' && p.available <= (p.lowStockThreshold ?? 3)).length,
          comments: comments.filter(c => c.status === 'pending').length,
        } } };
  }
  if (path === '/api/manage/snapshot' && request.method === 'GET') return json(await snapshot());
  if (path === '/api/manage/operation' && request.method === 'GET') {
    const op = JSON.parse(row.ledger_json).management?.operations?.find(o => o.id === url.searchParams.get('operationId'));
    return json({ found: !!op, result: op?.result });
  }
  if (path === '/api/manage/production' && request.method === 'GET') return json(productionList(JSON.parse(row.ledger_json).orders, url.searchParams.get('date') || businessDay(now)));
  if (path === '/api/manage/export' && request.method === 'GET') {
    const photoSize = await first('SELECT COALESCE(SUM(length(bytes)),0) AS total FROM assets WHERE workspace_id=?', row.id);
    if (photoSize.total > 8000000) bad('This photo archive exceeds the in-app backup size. Use an operator-assisted Cloudflare D1 export for the complete backup; no records were changed.', 413);
    const members = await all('SELECT id,profile_json,created_at FROM roost_members WHERE workspace_id=?', row.id);
    const comments = await all('SELECT * FROM customer_comments WHERE workspace_id=?', row.id);
    const assets = await all('SELECT id,mime,hex(bytes) AS hex FROM assets WHERE workspace_id=?', row.id);
    const data = { format: 'rise-roost-business-backup-v1', exportedAt: at, sourceWorkspace: row.id,
      draft: JSON.parse(row.draft_json), published: JSON.parse(row.published_json), versions: JSON.parse(row.versions_json),
      ledger: JSON.parse(row.ledger_json), members, comments, assets };
    // Credentials/sessions/recovery hashes are never exported. Restoring business
    // data does not restore identity or give a backup holder owner access.
    return json(data, 200, { 'Content-Disposition': 'attachment; filename="rise-roost-business-backup.json"' });
  }
  if (request.method !== 'POST') bad('This Studio action was not found.', 404);
  if (!/^[a-f0-9-]{32,48}$/.test(input.operationId || '')) bad('Use a unique operation identifier.');
  const ledger = JSON.parse(row.ledger_json), draft = JSON.parse(row.draft_json), published = JSON.parse(row.published_json);
  ledger.management ||= { audit: [], operations: [], benefits: [] };
  const m = ledger.management; m.audit ||= []; m.operations ||= []; m.benefits ||= [];
  const logical = { ...input }; for (const key of ['operationId', 'revision', 'ledgerVersion', 'orderVersion']) delete logical[key];
  const fingerprint = await digest(path + canonical(logical)), prior = m.operations.find(o => o.id === input.operationId);
  if (prior) {
    if (path === '/api/manage/abandon-operation') return json({ ...await snapshot(await current()), result: prior.result });
    if (prior.fingerprint !== fingerprint) bad('This retry belongs to different changes. Reload the saved result before making another edit.', 409);
    return json({ ...await snapshot(await current()), duplicate: true, result: prior.result });
  }
  if (m.operations.length >= 2000) bad('This preview has reached its audit-operation limit. Export a backup and ask for a storage expansion; saved data has not been removed.', 409);
  let changedDocument = false, result = {}, description = '', commentChange;
  const expectedDocument = () => { if (input.revision !== row.revision) bad('The website changed on another device. Your edits are unsaved; reload the current fields before saving.', 409); };
  const order = () => {
    const o = ledger.orders.find(o => o.id === input.id);
    if (!o) bad('Choose an existing order.', 404);
    if (input.orderVersion !== (o.version || 1)) bad('This order changed on another device. Refresh it before trying again.', 409);
    o.audit ||= []; return o;
  };
  if (path === '/api/manage/abandon-operation') {
    result = { abandoned: true }; description = 'Unconfirmed operation fenced off before any retry';
  } else if (path === '/api/manage/import') {
    expectedDocument();
    if (ownerResult(row).isPrimary) bad('Restore into a new private copy; the main preview workspace cannot be a restore target.', 409);
    await restoreBusinessBackup({ db, row, input, fingerprint, actor, now, validateDocument });
    return json({ ...await snapshot(await current()), result: { restored: true, accountsRestored: false } });
  } else if (path === '/api/manage/product') {
    expectedDocument();
    if (!input.product || typeof input.product !== 'object' || Array.isArray(input.product)) bad('Choose a valid product.');
    const source = published.products.find(p => p.id === input.product?.id);
    const p = clone(input.product);
    delete p.booked; delete p.available;
    if (!p || !identifier(p.id)) bad('Choose a valid product.');
    if (p.inventoryMode && !['physical', 'production', 'legacy'].includes(p.inventoryMode)) bad('Choose physical inventory or preorder production.');
    if (p.lowStockThreshold !== undefined && !cents(p.lowStockThreshold, 10000)) bad('Use a valid low-stock threshold.');
    if (input.available !== undefined) {
      if (!cents(input.available, 10000)) bad('Use an available quantity from 0 to 10,000.');
      if (input.ledgerVersion !== row.ledger_version) bad('An order changed inventory. Your fields are unsaved; review the new available quantity.', 409);
      p.stock = input.available + bookedUnits(ledger, p.id);
    }
    if (typeof p.archived !== 'boolean' || typeof p.soldOut !== 'boolean') bad('Check product availability.');
    if (p.archived && !source?.archived && input.confirmArchive !== true) bad('Confirm archiving this product. Historical orders will be retained.');
    if (p.archived) p.active = false;
    if (p.stock > 10000) bad('This preview stock allowance cannot exceed 10,000 units.');
    for (const doc of [draft, published]) {
      const index = doc.products.findIndex(v => v.id === p.id);
      if (index < 0) doc.products.push(clone(p)); else doc.products[index] = clone(p);
    }
    changedDocument = true; result = { productId: p.id };
    description = (source ? 'Product updated: ' : 'Product added: ') + p.name;
    m.audit.unshift({ id: opaque(), kind: 'inventory', at, actor, productId: p.id, before: source ? { price: source.price, stock: source.stock, active: source.active, archived: source.archived || false } : null, after: { price: p.price, stock: p.stock, active: p.active, archived: p.archived }, reason: input.reason || 'Product save' });
  } else if (path === '/api/manage/calendar') {
    expectedDocument();
    if (!Array.isArray(input.pickups)) bad('Choose pickup dates.');
    const activeOrders = ledger.orders.filter(o => o.status !== 'canceled');
    const old = new Map(published.pickups.map(p => [p.id, p]));
    const next = clone(input.pickups), affected = [];
    for (const p of published.pickups) {
      const replacement = next.find(n => n.id === p.id), count = activeOrders.filter(o => o.pickupId === p.id).length;
      if (count && canonical(p) !== canonical(replacement)) affected.push({ id: p.id, count });
      if (count && !replacement) next.push({ ...p, closed: true });
      else if (count && ['date', 'start', 'end'].some(k => replacement?.[k] !== p[k])) {
        replacement.id = 'pickup-' + opaque(); next.push({ ...p, closed: true });
      }
    }
    if (affected.length && input.confirmExistingOrders !== true) bad('These changes affect dates with existing orders. Confirm that existing orders will retain their original pickup details.', 409);
    for (const p of next) {
      for (const [id, value] of Object.entries(p.productionLimits || {})) if (!published.products.some(v => v.id === id) || !cents(value, 10000)) bad('Check product-specific production limits.');
      if (p.event !== undefined) p.event = text(p.event, 120, 'the pickup event name');
    }
    for (const d of [draft, published]) { d.pickups = clone(next); d.orderingPaused = input.paused === true; }
    changedDocument = true; result = { affectedOrders: affected.reduce((n, a) => n + a.count, 0) }; description = 'Pickup calendar saved';
  } else if (path === '/api/manage/content') {
    expectedDocument();
    if (!input.document || structure(input.document) !== structure(draft)) bad('The approved layout and visual styling are locked. Change wording or images only.');
    // Operational fields are always taken from the current published site.
    const next = clone(input.document); next.products = clone(published.products); next.pickups = clone(published.pickups); next.orderingPaused = published.orderingPaused;
    Object.assign(draft, next); changedDocument = true; result = { draftOnly: true }; description = 'Website content draft saved';
  } else if (path === '/api/manage/publish' || path === '/api/manage/restore-content') {
    expectedDocument();
    let next = clone(draft);
    if (path.endsWith('restore-content')) {
      const v = JSON.parse(row.versions_json).find(v => v.id === input.versionId);
      if (!v) bad('Choose an existing content revision.', 404);
      next = clone(v.document);
      if (structure(next) !== structure(published)) bad('This old version has a different layout. Restore individual wording or pictures instead.');
    }
    next.products = clone(published.products); next.pickups = clone(published.pickups); next.orderingPaused = published.orderingPaused;
    Object.assign(published, next); Object.assign(draft, clone(next)); changedDocument = true;
    description = path.endsWith('restore-content') ? 'Website content restored' : 'Website content published';
  } else if (path === '/api/manage/verify-payment') {
    const o = order();
    if (o.paymentVerifiedAt && !o.paymentCorrectedAt) return json({ ...await snapshot(), duplicate: true });
    if (o.status === 'canceled') bad('Check cancellation and payment records before verifying a canceled order.');
    const evidence = text(input.evidence, 500, 'the independent payment reference', true);
    if (input.independentlyVerified !== true || evidence.length < 5 || !['bank_record', 'cash_record', 'external_record'].includes(input.method)) bad('Confirm an independent payment record for the full order total and enter its reference.');
    o.paymentStatus = 'verified'; o.paymentVerifiedAt = at;
    o.verifications ||= []; o.verifications.push({ id: opaque(), at, amount: o.total, actor, method: input.method, evidence });
    delete o.paymentCorrectedAt;
    o.verification = { method: input.method, evidence, at, author: actor.name, actorId: actor.id };
    o.paidReceipt = { number: 'BETA-PAID-' + o.id.slice(0, 16).toUpperCase() + (o.verifications.length > 1 ? '-' + o.verifications.length : ''), orderNumber: o.orderNumber,
      issuedAt: at, paidAt: at, total: o.total, currency: 'USD', lines: clone(o.lines),
      verification: 'An authorized owner checked an independent payment record', merchant: o.merchant || { name: published.business.name }, beta: true, websiteProcessedPayment: false };
    o.version = (o.version || 1) + 1; description = 'Independent payment verified; receipt issued';
    o.audit.push({ action: description, author: actor.name, at }); enqueue(o, 'verified', at, opaque); result = { orderId: o.id };
  } else if (path === '/api/manage/payment-correction') {
    const o = order();
    if (!o.paymentVerifiedAt || input.independentlyChecked !== true) bad('Check independent records and confirm this mistaken-verification correction.');
    if ((o.refunds || []).reduce((n, r) => n + r.amount, 0)) bad('This payment has refund records. Review both payment and refund records with the operator before voiding verification.');
    const reason = text(input.reason, 500, 'the correction reason', true); if (reason.length < 5) bad('Give a clear correction reason of at least five characters.');
    o.verifications ||= [{ id: opaque(), at: o.paymentVerifiedAt, amount: o.paidReceipt?.total ?? o.total, actor: { name: o.verification?.author || 'Previous owner' } }];
    const payment = o.verifications.findLast(v => !v.voidedAt);
    if (!payment) bad('There is no active verification to correct.');
    payment.voidedAt = at; payment.voidReason = reason;
    o.paymentCorrections ||= []; o.paymentCorrections.push({ id: opaque(), at, amount: payment.amount, reason, actor });
    o.receiptHistory ||= []; if (o.paidReceipt) o.receiptHistory.push({ ...o.paidReceipt, voidedAt: at, voidReason: reason });
    delete o.paidReceipt; delete o.paymentVerifiedAt; delete o.verification;
    o.paymentStatus = o.paymentReportedAt ? 'reported' : 'not_collected'; o.paymentCorrectedAt = at;
    o.version = (o.version || 1) + 1; description = 'Mistaken payment verification voided; original record retained';
    o.audit.push({ action: description + ': ' + reason, author: actor.name, at }); result = { orderId: o.id };
  } else if (path === '/api/manage/refund') {
    const o = order();
    if (!o.paymentVerifiedAt || input.independentlyVerified !== true) bad('A refund needs a verified payment and an independently checked refund record.');
    const refunded = (o.refunds || []).reduce((n, r) => n + r.amount, 0);
    if (!cents(input.amount) || input.amount <= 0 || input.amount > o.total - refunded) bad('The recorded refund must be positive and cannot exceed the unrefunded payment.');
    const evidence = text(input.evidence, 500, 'the independent refund reference', true); if (evidence.length < 5) bad('Enter at least five characters for the refund reference.');
    if ((o.refunds || []).some(r => r.evidence === evidence)) bad('This independent refund reference is already recorded on the order. Do not record it twice.', 409);
    o.refunds ||= []; o.refunds.push({ id: opaque(), amount: input.amount, evidence, reason: text(input.reason, 500, 'the refund reason', true), at, actor });
    o.paymentStatus = refunded + input.amount === o.total ? 'refunded' : 'partially_refunded';
    o.version = (o.version || 1) + 1; description = 'Independently verified external refund recorded'; o.audit.push({ action: description, author: actor.name, at });
    result = { orderId: o.id };
  } else if (path === '/api/manage/fulfillment') {
    const o = order(), target = input.status;
    if (!['pending', 'preparing', 'ready', 'picked-up', 'canceled'].includes(target)) bad('Choose a fulfillment status.');
    if (target === 'canceled' && input.confirmCancellation !== true) bad('Confirm this order cancellation. Payment and refunds remain separate.');
    const ordinary = { pending: ['preparing', 'ready', 'canceled'], preparing: ['ready', 'canceled'], ready: ['picked-up', 'canceled'], 'picked-up': [], canceled: [] };
    if (target === o.status && !(target === 'canceled' && o.keepInventory && input.releaseInventory === true)) return json({ ...await snapshot(), duplicate: true });
    const correction = !ordinary[o.status]?.includes(target);
    if (correction && input.confirmCorrection !== true) bad('Confirm this status correction and enter its reason.');
    const reason = text(input.reason || '', 500, 'the status reason', correction || target === 'canceled');
    if (o.status === 'canceled' && target !== 'canceled') {
      const pickup = published.pickups.find(p => p.id === o.pickupId);
      if (!pickup || pickup.closed) bad('This canceled order cannot be reopened into a closed or removed pickup.');
      if (!holdsInventory(o)) {
        if (ledger.orders.filter(order => holdsInventory(order) && order.pickupId === o.pickupId).length >= pickup.capacity) bad('This pickup no longer has an available order slot.', 409);
        for (const productId of new Set(o.lines.map(l => l.productId))) {
          const qty = o.lines.filter(l => l.productId === productId).reduce((n, l) => n + l.qty, 0), p = published.products.find(p => p.id === productId);
          if (!p || p.archived || (p.inventoryMode !== 'production' && bookedUnits(ledger, p.id) + qty > p.stock) || (p.inventoryMode !== 'physical' && bookedUnits(ledger, p.id, o.pickupId) + qty > productionLimit(p, pickup))) bad('Reopening this order would exceed available inventory or production capacity.', 409);
        }
      }
    }
    const previous = o.status;
    if (target === 'canceled') o.keepInventory = input.releaseInventory !== true;
    o.status = target;
    const stamp = { preparing: 'preparingAt', ready: 'readyAt', 'picked-up': 'pickedUpAt', canceled: 'canceledAt' }[target];
    if (stamp && previous !== target) o[stamp] = at;
    if (correction) for (const key of ['preparingAt', 'readyAt', 'pickedUpAt', 'canceledAt']) {
      const required = target === 'picked-up' ? ['pickedUpAt', 'readyAt', 'preparingAt'] : target === 'ready' ? ['readyAt', 'preparingAt'] : target === 'preparing' ? ['preparingAt'] : target === 'canceled' ? ['canceledAt'] : [];
      if (!required.includes(key)) delete o[key];
    }
    o.version = (o.version || 1) + 1; description = 'Fulfillment ' + previous + ' → ' + target;
    o.audit.push({ action: description + (reason ? ': ' + reason : ''), author: actor.name, at, correction, previous }); result = { orderId: o.id };
    enqueue(o, target, at, opaque);
  } else if (path === '/api/manage/comment') {
    const comment = await first('SELECT * FROM customer_comments WHERE id=? AND workspace_id=?', input.id, row.id);
    if (!comment || comment.version !== input.version) bad('This comment changed. Refresh it before reviewing.', 409);
    if (!['approved', 'hidden'].includes(input.status)) bad('Approve or hide the comment. Original text is retained.');
    commentChange = { ...comment, status: input.status, claim: opaque() }; m.lastCommentClaim = commentChange.claim;
    result = { commentId: comment.id }; description = 'Customer comment ' + input.status;
  } else if (path === '/api/manage/notifications') {
    const keys = ['orders', 'payments', 'stock', 'pickups', 'comments', 'errors'];
    if (!input.preferences || keys.some(k => typeof input.preferences[k] !== 'boolean')) bad('Check notification preferences.');
    m.notificationPreferences = Object.fromEntries(keys.map(k => [k, input.preferences[k]])); description = 'Studio notification preferences saved';
  } else if (path === '/api/manage/benefit') {
    if (!await first('SELECT id FROM roost_members WHERE id=? AND workspace_id=?', input.memberId, row.id)) bad('Choose a member of this workspace.');
    if (!['bottle_return', 'credit', 'debit', 'reversal'].includes(input.kind)) bad('Choose a return or credit adjustment.');
    if (!cents(input.amount, input.kind === 'bottle_return' ? 10000 : 1000000) || input.amount <= 0) bad('Use a positive quantity or credit amount.');
    const reason = text(input.reason, 500, 'the adjustment reason', true);
    const balance = m.benefits.filter(b => b.memberId === input.memberId && b.kind !== 'bottle_return').reduce((n, b) => n + (b.kind === 'credit' ? b.amount : -b.amount), 0);
    if (input.kind === 'debit' && input.amount > balance) bad('A credit adjustment cannot make the recorded balance negative.');
    if (input.kind === 'reversal') bad('Use an equal, referenced credit or debit adjustment to correct a prior entry. Original entries are retained.');
    m.benefits.unshift({ id: opaque(), memberId: input.memberId, kind: input.kind, amount: input.amount, reason, at, actor });
    description = 'Member ' + input.kind + ' recorded'; result = { memberId: input.memberId };
  } else bad('This Studio action was not found.', 404);

  if (changedDocument) { validateDocument(draft); validateDocument(published); }
  for (const doc of changedDocument ? [draft, published] : []) for (const id of new Set([...JSON.stringify(doc).matchAll(/\/api\/assets\/([a-f0-9]{48})/g)].map(v => v[1])))
    if (!await first('SELECT id FROM assets WHERE id=? AND workspace_id=?', id, row.id)) bad('Use photos uploaded to this workspace.');
  m.audit.unshift({ id: opaque(), kind: path.slice('/api/manage/'.length), action: description, at, actor, resource: result });
  m.operations.unshift({ id: input.operationId, fingerprint, at, result });
  const serialized = JSON.stringify(ledger); if (new TextEncoder().encode(serialized).length > 1200000) bad('This preview ledger is approaching its safe storage limit. Export a backup before adding more records.', 409);
  let versions = JSON.parse(row.versions_json);
  const draftOnly = result.draftOnly === true;
  if (changedDocument && !draftOnly) versions = [{ id: opaque(), document: clone(published), at, author: actor.name, label: description }, ...versions].slice(0, 30);
  if (new TextEncoder().encode(JSON.stringify(versions)).length > 1500000) bad('The saved revision history is approaching its safe storage limit. Export a backup and ask the operator to expand history storage before saving; no content was changed.', 409);
  const statement = db.prepare('UPDATE workspaces SET draft_json=?,published_json=?,revision=revision+?,published_revision=?,versions_json=?,ledger_json=?,ledger_version=ledger_version+1 WHERE id=? AND revision=? AND ledger_version=?' + (commentChange ? ' AND EXISTS(SELECT 1 FROM customer_comments WHERE id=? AND workspace_id=? AND version=?)' : ''))
    .bind(JSON.stringify(draft), JSON.stringify(published), changedDocument ? 1 : 0, changedDocument && !draftOnly ? row.revision + 1 : row.published_revision, JSON.stringify(versions), serialized, row.id, row.revision, row.ledger_version, ...(commentChange ? [commentChange.id, row.id, commentChange.version] : []));
  const written = commentChange ? (await db.batch([statement,
    db.prepare("UPDATE customer_comments SET status=?,version=version+1,reviewed_at=? WHERE id=? AND workspace_id=? AND version=? AND EXISTS(SELECT 1 FROM workspaces WHERE id=? AND json_extract(ledger_json,'$.management.lastCommentClaim')=?)")
      .bind(commentChange.status, at, commentChange.id, row.id, commentChange.version, row.id, commentChange.claim),
  ]))[0] : await statement.run();
  if (written.meta.changes !== 1) bad('Another device or order saved first. Your fields are unsaved; review the current data and retry.', 409);
  return json({ ...await snapshot(await current()), result });
}
