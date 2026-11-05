import { defaultCalendar, calendarConfig, paymentDestination, providers, pickupDeadline, orderAttention, paymentReadiness } from '../public/commerce.mjs';
import { ZONE, localInstant, clone } from '../public/model.mjs';
import { trackingPath } from '../public/orders.mjs';
import { enqueue } from './orders.mjs';
import { restoreBusinessBackup } from './management-backup.mjs';
import { sellingMethod, inventoryMode, normalizeSellingMethod } from '../public/selling.mjs';
import { calendarPickups, pickupSchedule, orderingDeadline } from './pickup-calendar.mjs';

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
  if (period === 'yesterday') { from = addDays(today, -1); through = from; }
  else if (period === 'week') {
    const weekday = new Date(today + 'T12:00:00Z').getUTCDay();
    from = addDays(today, -((weekday + 6) % 7)); through = addDays(from, 6);
  } else if (period === 'month') { from = today.slice(0, 7) + '-01'; through = addDays(new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7), 1)).toISOString().slice(0, 10), -1); }
  else if (period === 'year') { from = today.slice(0, 4) + '-01-01'; through = today.slice(0, 4) + '-12-31'; }
  else if (period === 'custom') { from = start; through = end; }
  else if (period !== 'today') bad('Choose Today, Yesterday, This Week, This Month, This Year, or Custom Date Range.');
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
  const methods = new Map();
  for (const payment of verified) { const method = payment.method || payment.order.verification?.method || 'historical'; methods.set(method, (methods.get(method) || 0) + payment.amount); }
  const verifiedSales = verified.reduce((n, payment) => n + payment.amount, 0);
  const refunds = adjustments.reduce((n, r) => n + r.amount, 0), corrected = corrections.reduce((n, r) => n + r.amount, 0);
  const counts = new Map();
  for (const o of orders.filter(o => o.status !== 'canceled' && o.customer?.memberId)) counts.set(o.customer.memberId, (counts.get(o.customer.memberId) || 0) + 1);
  return { range, verifiedSales, salesByPaymentMethod: [...methods].map(([method, value]) => ({ method, value })), refunds, verificationCorrections: corrected, netVerifiedReceipts: verifiedSales - refunds,
    orderValue: placed.reduce((n, o) => n + o.total, 0), ordersPlaced: placed.length,
    canceledOrders: placed.filter(o => o.status === 'canceled').length,
    canceledOrderValue: placed.filter(o => o.status === 'canceled').reduce((n, o) => n + o.total, 0),
    reportedValue: placed.filter(o => o.paymentStatus === 'reported' && o.status !== 'canceled').reduce((n, o) => n + o.total, 0),
    outstandingValue: placed.filter(o => !o.paymentVerifiedAt && o.status !== 'canceled' && !o.resolution).reduce((n, o) => n + o.total, 0),
    popularProducts: [...products.values()].sort((a, b) => b.quantity - a.quantity),
    returningMembers: new Set(placed.filter(o => o.status !== 'canceled' && o.customer?.memberId && counts.get(o.customer.memberId) > 1).map(o => o.customer.memberId)).size };
}
export const holdsInventory = o => o.status !== 'canceled' || o.keepInventory === true;
export const productionLimit = (product, pickup, pickups = [pickup]) => inventoryMode(product) === 'production' ? Math.min(...pickups.filter(p => p.date === pickup.date).map(p => p.productionLimits?.[product.id] ?? product.capacity)) : pickup.productionLimits?.[product.id] ?? product.capacity;
export function bookedUnits(ledger, productId, pickupId, date) {
  return ledger.orders.filter(o => holdsInventory(o) && (date ? (o.originalPickup || o.pickup).date === date : !pickupId || o.pickupId === pickupId)).flatMap(o => o.lines).filter(l => l.productId === productId).reduce((n, l) => n + l.qty, 0);
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
  const selected = orders.filter(o => o.pickup.date === date && !o.resolution && !['canceled', 'picked-up'].includes(o.status));
  const combined = new Map();
  for (const o of selected) for (const l of o.lines) {
    const key = l.productId + ':' + l.variantId;
    const item = combined.get(key) || { productId: l.productId, name: l.name, variant: l.variant, quantity: 0 };
    item.quantity += l.qty; combined.set(key, item);
  }
  return { date, orders: selected, products: [...combined.values()].sort((a, b) => a.name.localeCompare(b.name)) };
}

export async function managementApi({ request, db, now, row, actor, input, path, json, validateDocument, ownerResult, availableDocument }) {
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
    const remaining = new Map(availableDocument(doc, ledger, { managed: true, now }).products.map(p => [p.id, p.stock]));
    const products = doc.products.map(p => ({ ...p, booked: bookedUnits(ledger, p.id), available: Math.max(0, p.stock - bookedUnits(ledger, p.id)), availableToOrder: remaining.get(p.id) || 0 }));
    const contentOnly = document => { const d = clone(document); delete d.products; delete d.pickups; delete d.pickupSchedule; delete d.orderingPaused; delete d.freshAnnouncement; return d; };
    return { ...ownerResult(source), hasContentDraft: canonical(contentOnly(JSON.parse(source.draft_json))) !== canonical(contentOnly(doc)), orders: ownerResult(source).orders.map(o => ({ ...o, businessDate: businessDay(o.at), attention: orderAttention(o, now) })), ledgerVersion: source.ledger_version, actor, layoutLocked: true, now: at,
      management: { pickups: calendarPickups(doc, now, ledger, { includeHistory: true }), pickupSchedule: pickupSchedule(doc), paymentReadiness: paymentReadiness(m.settings), settings: m.settings || { calendar: defaultCalendar(), payments: {} }, reports: financialReport(ledger.orders, range), today, products,
        members: members.map(m => ({ id: m.id, profile: JSON.parse(m.profile_json), createdAt: m.created_at,
          orderCount: ledger.orders.filter(o => o.customer?.memberId === m.id).length,
          benefits: (ledger.management?.benefits || []).filter(b => b.memberId === m.id) })), comments,
        audit: (m.audit || []).slice(0, 500), benefits: m.benefits || [],
        ownerAccounts: actor.authentication === 'cloudflare_access' && actor.role === 'owner' ? { provider: 'Cloudflare Access', configured: true } : { provider: 'Descope', configured: false, activationRequiresApproval: true },
        notifications: { externalEnabled: false, preferences: m.notificationPreferences || { orders: true, payments: true, stock: true, pickups: true, comments: true, errors: true } },
        limits: { orderCount: ledger.orders.length, orderLimit: 300, memberDirectoryLimit: 500 },
        attention: {
          payments: ledger.orders.filter(o => o.total > 0 && !o.paymentVerifiedAt && o.status !== 'canceled' && !o.resolution).length,
          preparing: ledger.orders.filter(o => o.status === 'preparing' && !o.resolution).length,
          ready: ledger.orders.filter(o => o.status === 'ready' && !o.resolution).length,
          contacted: ledger.orders.filter(o => orderAttention(o,now).customerContacted).length,
          extensions: ledger.orders.filter(o => orderAttention(o,now).extensionRequested).length,
          overdue: ledger.orders.filter(o => orderAttention(o,now).overdue).length,
          other: ledger.orders.filter(o => o.dispute?.open === true).length,
          newOrders: ledger.orders.filter(o => o.status === 'pending' && !o.resolution).length,
          upcoming: ledger.orders.filter(o => !['canceled', 'picked-up'].includes(o.status) && !o.resolution && localInstant(o.pickup.date, o.pickup.end) > now && localInstant(o.pickup.date, o.pickup.start) < now + 2 * 86400000).length,
          lowStock: products.filter(p => p.active && !p.archived && inventoryMode(p) !== 'production' && p.available <= (p.lowStockThreshold ?? 3)).length,
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
  const logical = { ...input }; for (const key of ['operationId', 'revision', 'ledgerVersion', 'orderVersion', 'paymentsVersion']) delete logical[key];
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
  if (['/api/manage/payment-destination','/api/manage/payment-test-start','/api/manage/payment-test-confirm'].includes(path)) {
    const provider = input.provider;
    if (!Object.hasOwn(providers,provider)) bad('Choose PayPal, Venmo or Cash App.');
    m.settings ||= { calendar: defaultCalendar(), payments: {} }; m.settings.payments ||= {};
    const version = m.settings.paymentsVersion || 0;
    if (input.paymentsVersion !== version) bad('Payment settings changed on another device. Refresh and review the saved settings before retrying.',409);
    const previous = clone(m.settings.payments[provider] || {});
    if (path.endsWith('payment-destination')) {
      if (typeof input.url !== 'string' || typeof input.enabled !== 'boolean' || typeof input.businessConfirmed !== 'boolean') bad('Check the payment link and enable setting.');
      const url = input.url.trim() ? paymentDestination(provider,input.url) : '';
      if (input.enabled && !url) bad('Save a supported payment link before enabling this method.');
      if (url && !input.businessConfirmed) bad('Confirm this destination is approved for your business sales.');
      const retained = previous.url === url && input.businessConfirmed ? previous : {};
      m.settings.payments[provider] = { ...retained, url, enabled: input.enabled, businessConfirmed: input.businessConfirmed, updatedAt: at, updatedBy: actor };
      description = providers[provider] + ' payment destination saved' + (previous.url && previous.url !== url ? '; previous link test invalidated' : '');
    } else {
      const destination = m.settings.payments[provider];
      if (!destination?.url || !destination.businessConfirmed) bad('Save and confirm the business payment link before testing it.');
      const url = paymentDestination(provider,destination.url);
      if (path.endsWith('payment-test-start')) {
        destination.pendingTest = { id: opaque(), url, at, actor };
        result = { provider, url, testId: destination.pendingTest.id };
        description = providers[provider] + ' link test started; no payment or verification performed';
      } else {
        const pending = destination.pendingTest;
        if (input.confirmed !== true) bad('Confirm you opened the saved link and checked the correct business recipient. Do not send money for this test.');
        if (!pending || pending.id !== input.testId || pending.url !== url || now - Date.parse(pending.at) > 30 * 60000) bad('The payment link test changed or expired. Start Test Link again for the current saved destination.',409);
        destination.tested = { url, at, actor, testId: pending.id, startedAt: pending.at, startedBy: pending.actor };
        delete destination.pendingTest;
        description = providers[provider] + ' link test confirmed by owner; payment receipt remains independently verified';
      }
    }
    m.settings.paymentsVersion = version + 1;
    m.audit.unshift({ id: opaque(), kind: 'payment-settings-history', at, actor, provider, before: previous, after: clone(m.settings.payments[provider]) });
    result = { ...result, provider }; // Test metadata is owner-only; public APIs return active URLs only.
  } else if (path === '/api/manage/settings') {
    if (input.ledgerVersion !== row.ledger_version) bad('Settings changed or an order arrived. Refresh before saving.', 409);
    if (input.payments !== undefined) bad('Use Settings → Payments to change or test payment destinations.');
    const calendar = calendarConfig(input.calendar);
    m.audit.unshift({ id: opaque(), kind: 'settings-history', at, actor, before: clone(m.settings || {}), after: { ...clone(m.settings || {}), calendar } });
    m.settings = { ...m.settings, calendar }; description = 'Business days and closures saved; payment settings and existing deadlines retained';
  } else if (path === '/api/manage/reply') {
    const o = order();
    const body = text(input.body, 2000, 'the reply', true);
    if ((o.messages || []).length >= 100) bad('The conversation has reached its safe message limit.', 409);
    o.messages ||= []; o.messages.push({ id: opaque(), sender: 'owner', name: 'Danielle', body, at, actor });
    o.version = (o.version || 1) + 1; description = 'Owner replied to customer'; o.audit.push({ action: description, at, author: actor.name }); result = { orderId: o.id };
  } else if (path === '/api/manage/approve-extension') {
    const o = order();
    if (input.confirmed !== true || ['canceled','picked-up'].includes(o.status) || o.resolution) bad('Confirm the new pickup arrangement for an active order.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date || '') || !/^\d{2}:\d{2}$/.test(input.time || '')) bad('Choose the approved pickup date and time.');
    let instant; try { instant = localInstant(input.date, input.time); } catch { bad('Choose a valid pickup date and time.'); }
    if (instant <= now) bad('Choose a future pickup time.');
    const previous = { pickup: clone(o.pickup), deadline: o.pickupDeadline };
    o.originalPickup ||= clone(o.pickup);
    o.pickup = { ...o.pickup, date: input.date, start: input.time, end: input.time };
    o.pickupDeadline = pickupDeadline(o.pickup, m.settings?.calendar || o.policyAcceptance?.calendar || defaultCalendar());
    o.extension = { date: input.date, time: input.time, at, actor, previous, deadline: o.pickupDeadline };
    o.extensionHistory ||= []; o.extensionHistory.push(clone(o.extension));
    o.contact = { ...o.contact, unresolved: false, extensionRequested: false, resolvedAt: at, resolvedBy: actor };
    o.messages ||= []; if (o.messages.length >= 100) bad('The conversation has reached its safe message limit.', 409);
    o.messages.push({ id: opaque(), sender: 'owner', name: 'Danielle', body: 'Your new pickup arrangement is approved. See your updated pickup details below.', at, actor });
    o.version = (o.version || 1) + 1; description = 'Extension Approved — new pickup arrangement confirmed'; o.audit.push({ action: description, at, author: actor.name, previous, approved: clone(o.extension) }); result = { orderId: o.id };
  } else if (path === '/api/manage/resolve-contact') {
    const o = order(), reason = text(input.reason, 500, 'the resolution', true);
    if (input.confirmed !== true) bad('Confirm this conversation is resolved.');
    o.contact = { ...o.contact, unresolved: false, extensionRequested: false, resolvedAt: at, resolvedBy: actor, reason };
    o.version = (o.version || 1) + 1; description = 'Customer conversation resolved: ' + reason; o.audit.push({ action: description, at, author: actor.name }); result = { orderId: o.id };
  } else if (path === '/api/manage/dispute') {
    const o = order(), reason = text(input.reason, 500, 'the dispute details', true);
    if (input.confirmed !== true || typeof input.open !== 'boolean') bad('Confirm the dispute record. No money is transferred by this action.');
    o.dispute = { open: input.open, reason, at, actor }; o.version = (o.version || 1) + 1;
    description = input.open ? 'Payment dispute recorded for review' : 'Payment dispute resolved'; o.audit.push({ action: description + ': ' + reason, at, author: actor.name }); result = { orderId: o.id };
  } else if (path === '/api/manage/resolve-pickup') {
    const o = order(), reason = text(input.reason, 500, 'the owner pickup review', true);
    if (input.confirmed !== true || !['forfeited','reviewed'].includes(input.resolution)) bad('Confirm an owner-reviewed resolution.');
    if (o.contact?.unresolved || o.dispute?.open) bad('Resolve customer communications and any payment dispute before recording a pickup resolution.', 409);
    if (['canceled','picked-up'].includes(o.status) || o.resolution) bad('This order already has a final resolution.', 409);
    if (input.resolution === 'forfeited' && !orderAttention(o,now).overdue) bad('Forfeiture requires a passed pickup deadline and explicit owner review.', 409);
    o.resolution = { kind: input.resolution, reason, at, actor, deadline: o.pickupDeadline }; o.archivedAt = at;
    o.version = (o.version || 1) + 1; description = 'Owner reviewed pickup: ' + input.resolution + '. No refund or collection recorded.'; o.audit.push({ action: description + ' ' + reason, at, author: actor.name }); result = { orderId: o.id };
  } else if (path === '/api/manage/abandon-operation') {
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
    if (input.product.sellingMethod !== undefined && !['online', 'preorder', 'in-store'].includes(input.product.sellingMethod)) bad('Choose Online Ordering, Preorder, or In-Store Only.');
    const p = normalizeSellingMethod(input.product);
    delete p.booked; delete p.available; delete p.availableToOrder;
    if (!p || !identifier(p.id)) bad('Choose a valid product.');
    if (p.inventoryMode && !['physical', 'production', 'legacy'].includes(p.inventoryMode)) bad('Choose a valid availability setting.');
    if (p.lowStockThreshold !== undefined && !cents(p.lowStockThreshold, 10000)) bad('Use a valid low-stock threshold.');
    if (input.available !== undefined) {
      if (!cents(input.available, 10000)) bad('Use an available quantity from 0 to 10,000.');
      if (input.ledgerVersion !== row.ledger_version) bad('An order changed inventory. Your fields are unsaved; review the new available quantity.', 409);
      p.stock = input.available + bookedUnits(ledger, p.id);
    }
    if (typeof p.archived !== 'boolean' || typeof p.soldOut !== 'boolean') bad('Check product availability.');
    if (((p.archived && !source?.archived) || (source?.active && !p.active)) && input.confirmArchive !== true) bad('Confirm hiding this product from customers. Existing orders and product history will be retained.');
    if (p.archived) p.active = false;
    if (p.stock > 10000) bad('This preview stock allowance cannot exceed 10,000 units.');
    for (const doc of [draft, published]) {
      const index = doc.products.findIndex(v => v.id === p.id);
      if (index < 0) doc.products.push(clone(p)); else doc.products[index] = clone(p);
    }
    changedDocument = true; result = { productId: p.id };
    description = (source ? 'Product updated: ' : 'Product added: ') + p.name;
    m.audit.unshift({ id: opaque(), kind: 'inventory', at, actor, productId: p.id, before: source ? { price: source.price, stock: source.stock, capacity: source.capacity, sellingMethod: sellingMethod(source), active: source.active, archived: source.archived || false } : null, after: { price: p.price, stock: p.stock, capacity: p.capacity, sellingMethod: sellingMethod(p), active: p.active, archived: p.archived }, reason: 'Product details and availability saved by owner' });
  } else if (path === '/api/manage/product-visibility') {
    expectedDocument();
    if (input.ledgerVersion !== row.ledger_version) bad('An order or product changed. Refresh before changing product visibility.', 409);
    if (typeof input.hidden !== 'boolean' || input.confirmed !== true) bad('Confirm whether to hide or show this product. Existing orders and product history will be retained.');
    const source = published.products.find(p => p.id === input.id);
    if (!source) bad('Choose an existing product.', 404);
    const before = { active: source.active, archived: source.archived || false };
    for (const doc of [draft, published]) {
      const p = doc.products.find(p => p.id === input.id);
      if (!p) bad('This product changed. Refresh before changing product visibility.', 409);
      p.archived = input.hidden; p.active = !input.hidden;
    }
    changedDocument = true; result = { productId: source.id, hidden: input.hidden };
    description = (input.hidden ? 'Product hidden: ' : 'Product shown: ') + source.name + '; existing orders and product history retained';
    m.audit.unshift({ id: opaque(), kind: 'product-visibility-history', at, actor, productId: source.id, before, after: { active: !input.hidden, archived: input.hidden } });
  } else if (path === '/api/manage/fresh-announcement') {
    expectedDocument();
    if (input.ledgerVersion !== row.ledger_version) bad('The website changed. Refresh before saving the announcement.', 409);
    const announcement = text(input.announcement, 240, 'the daily announcement');
    m.audit.unshift({ id: opaque(), kind: 'fresh-announcement-history', at, actor, before: published.freshAnnouncement || '', after: announcement });
    draft.freshAnnouncement = announcement; published.freshAnnouncement = announcement;
    changedDocument = true; result = { announcement };
    description = announcement ? 'Fresh at The Roost announcement saved' : 'Fresh at The Roost announcement cleared';
  } else if (path === '/api/manage/calendar' || path === '/api/manage/calendar-date') {
    expectedDocument();
    const schedule = pickupSchedule(published);
    if (path === '/api/manage/calendar-date') {
      if (!input.pickup || typeof input.pickup !== 'object') bad('Choose a pickup date.');
      const p = clone(input.pickup), effective = calendarPickups(published, now, ledger, { includeHistory: true });
      if (!identifier(p.id)) bad('Choose a valid pickup identifier.');
      try { localInstant(p.date, p.start); localInstant(p.date, p.end); }
      catch { bad('Choose a valid pickup date and time.'); }
      const existing = effective.find(v => v.id === p.id);
      if (existing && p.date !== existing.date) bad('Close this date and add a special pickup to change its date. Existing commitments are kept.', 409);
      if (!existing && (p.id.startsWith('recurring-') || published.pickups.some(v => v.date === p.date && !v.closed) || effective.some(v => v.date === p.date && !v.closed))) bad('This pickup date already exists. Edit its capacity or close it instead.', 409);
      // A newly added Studio date is an intentional special pickup, even unnamed.
      // Editing a legacy window alone must not silently promote it.
      if (!existing || existing.special === true || typeof existing.event === 'string' && existing.event.trim()) p.special = true;
      Object.assign(p, orderingDeadline(p.date)); delete p.automatic; delete p.productionRemaining;
      if (existing && !published.pickups.some(v => v.id === existing.id)) published.pickups.push({ ...existing });
      input.pickups = published.pickups.filter(v => v.id !== p.id).concat(p);
      if (input.closeDate === true) {
        for (const window of effective.filter(v => v.date === p.date)) {
          if (!input.pickups.some(v => v.id === window.id)) input.pickups.push(clone(window));
        }
        input.pickups.filter(v => v.date === p.date).forEach(v => { v.closed = true; });
      }
      input.paused = published.orderingPaused;
    }
    if (!Array.isArray(input.pickups)) bad('Choose pickup dates.');
    if (input.ledgerVersion !== undefined && input.ledgerVersion !== row.ledger_version) bad('An order or pickup date changed. Refresh and review the scheduled orders before saving.', 409);
    const next = clone(input.pickups), affected = [];
    for (const p of published.pickups) {
      const replacement = next.find(n => n.id === p.id), count = ledger.orders.filter(o => o.pickupId === p.id).length;
      // Past windows are history, never editable or deletable through the active
      // calendar. Omitting one merely retains the original record unchanged.
      if (localInstant(p.date, p.end) <= now) {
        if (replacement && canonical(p) !== canonical(replacement)) bad('Past pickup dates are kept in history and cannot be changed. Add a future date instead.', 409);
        if (!replacement) next.push(clone(p));
        continue;
      }
      if (count && canonical(p) !== canonical(replacement)) affected.push({ id: p.id, count });
      if (!replacement) next.push({ ...p, closed: true });
      else if (count && ['date', 'start', 'end'].some(k => replacement?.[k] !== p[k])) {
        replacement.id = 'pickup-' + opaque(); next.push({ ...p, closed: true });
      }
    }
    if (affected.length && input.confirmExistingOrders !== true) bad('These changes affect dates with existing orders. Confirm that existing orders will retain their original pickup details.', 409);
    for (const p of next) {
      if (!published.pickups.some(old => old.id === p.id) && localInstant(p.date, p.end) <= now) bad('Choose a future pickup date. Past dates stay in order history.');
      for (const [id, value] of Object.entries(p.productionLimits || {})) if (!published.products.some(v => v.id === id) || !cents(value, 10000)) bad('Check product-specific production limits.');
      if (p.event !== undefined) p.event = text(p.event, 120, 'the pickup event name');
    }
    const windows = new Set();
    for (const p of next.filter(p => !p.closed && localInstant(p.date, p.end) > now)) {
      const key = p.date + ':' + p.start + ':' + p.end;
      if (windows.has(key)) bad('This pickup window already exists. Edit its capacity instead.', 409);
      windows.add(key);
    }
    for (const d of [draft, published]) { d.pickupSchedule = clone(schedule); d.pickups = clone(next); d.orderingPaused = input.paused === true; }
    const stored = JSON.parse(row.published_json);
    const previous = [...stored.pickups, ...calendarPickups(stored, now, ledger, { includeHistory: true }).filter(p => !stored.pickups.some(v => v.id === p.id))];
    const changes = next.filter(p => canonical(p) !== canonical(previous.find(v => v.id === p.id))).map(p => ({ id: p.id, before: previous.find(v => v.id === p.id) || null, after: clone(p) }));
    m.audit.unshift({ id: opaque(), kind: 'pickup-calendar-history', at, actor, changes });
    changedDocument = true; result = { affectedOrders: affected.reduce((n, a) => n + a.count, 0), preservedPickups: next.filter(p => p.closed).map(p => p.id) }; description = 'Pickup calendar saved; existing order commitments and past pickup history retained';
  } else if (path === '/api/manage/content') {
    expectedDocument();
    if (!input.document || structure(input.document) !== structure(draft)) bad('The approved layout and visual styling are locked. Change wording or images only.');
    // Operational fields are always taken from the current published site.
    const next = clone(input.document); next.products = clone(published.products); next.pickups = clone(published.pickups); next.pickupSchedule = clone(pickupSchedule(published)); next.orderingPaused = published.orderingPaused; next.freshAnnouncement = published.freshAnnouncement || '';
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
    next.products = clone(published.products); next.pickups = clone(published.pickups); next.pickupSchedule = clone(pickupSchedule(published)); next.orderingPaused = published.orderingPaused; next.freshAnnouncement = published.freshAnnouncement || '';
    Object.assign(published, next); Object.assign(draft, clone(next)); changedDocument = true;
    description = path.endsWith('restore-content') ? 'Website content restored' : 'Website content published';
  } else if (path === '/api/manage/verify-payment') {
    const o = order();
    if (o.total === 0) bad('This order does not require payment.');
    if (o.paymentVerifiedAt && !o.paymentCorrectedAt) return json({ ...await snapshot(), duplicate: true });
    if (o.resolution) bad('Review the pickup resolution before verifying payment.');
    if (o.status === 'canceled') bad('Check cancellation and payment records before verifying a canceled order.');
    const evidence = text(input.evidence || '', 500, 'the optional transaction reference');
    if (input.independentlyVerified !== true || !['paypal', 'venmo', 'cashapp', 'bank_record', 'cash_record', 'external_record'].includes(input.method)) bad('Confirm that you checked your payment account and received the full order total.');
    o.paymentStatus = 'verified'; o.paymentVerifiedAt = at;
    o.verifications ||= []; o.verifications.push({ id: opaque(), at, amount: o.total, actor, method: input.method, evidence });
    delete o.paymentCorrectedAt;
    o.verification = { method: input.method, evidence, at, author: actor.name, actorId: actor.id };
    o.paidReceipt = { number: (o.environment === 'production' ? 'RR-PAID-' : 'BETA-PAID-') + o.id.slice(0, 16).toUpperCase() + (o.verifications.length > 1 ? '-' + o.verifications.length : ''), orderNumber: o.orderNumber,
      issuedAt: at, paidAt: at, total: o.total, currency: 'USD', lines: clone(o.lines),
      verification: 'An authorized owner checked an independent payment record', merchant: o.merchant || { name: published.business.name }, beta: o.environment !== 'production', websiteProcessedPayment: false };
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
    if (o.status === 'picked-up') bad('Historical pickup records are preserved. Add an owner reply or review communications without changing the original fulfillment record.', 409);
    if (!['pending', 'preparing', 'ready', 'canceled'].includes(target)) bad('Choose a fulfillment status.');
    if (target === 'canceled' && input.confirmCancellation !== true) bad('Confirm this order cancellation. Payment and refunds remain separate.');
    const ordinary = { pending: ['preparing', 'canceled'], preparing: ['ready', 'canceled'], ready: ['canceled'], 'picked-up': [], canceled: [] };
    if (o.resolution) bad('This order has a pickup resolution. Review its history before making further changes.', 409);
    if (target === o.status && !(target === 'canceled' && o.keepInventory && input.releaseInventory === true)) return json({ ...await snapshot(), duplicate: true });
    const correction = !ordinary[o.status]?.includes(target);
    if (correction && input.confirmCorrection !== true) bad('Confirm this status correction and enter its reason.');
    const reason = text(input.reason || '', 500, 'the status reason', correction || target === 'canceled');
    if (correction && reason.length < 5) bad('Give a correction reason of at least five characters.');
    if (o.status === 'canceled' && target !== 'canceled') {
      const pickups = calendarPickups(published, now, ledger, { includeHistory: true });
      const pickup = pickups.find(p => p.id === o.pickupId);
      if (!pickup || pickup.closed) bad('This canceled order cannot be reopened into a closed or removed pickup.');
      if (!holdsInventory(o)) {
        if (ledger.orders.filter(order => holdsInventory(order) && order.pickupId === o.pickupId).length >= pickup.capacity || pickups.filter(p => p.date === pickup.date && p.dailyCapacity !== undefined).some(p => ledger.orders.filter(order => holdsInventory(order) && (order.originalPickup || order.pickup).date === pickup.date).length >= p.dailyCapacity)) bad('This pickup no longer has an available order slot.', 409);
        for (const productId of new Set(o.lines.map(l => l.productId))) {
          const qty = o.lines.filter(l => l.productId === productId).reduce((n, l) => n + l.qty, 0), p = published.products.find(p => p.id === productId);
          if (!p || p.archived || !p.active || sellingMethod(p) === 'in-store' || (inventoryMode(p) !== 'production' && bookedUnits(ledger, p.id) + qty > p.stock) || (inventoryMode(p) !== 'physical' && bookedUnits(ledger, p.id, o.pickupId, inventoryMode(p) === 'production' ? pickup.date : undefined) + qty > productionLimit(p, pickup, pickups))) bad('Reopening this order would exceed available inventory or production capacity, or the product is no longer available online.', 409);
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
