import { BETA_ORIGIN, emailConfigured } from "./orders.mjs";
import { trackingPath, eventLabels, paymentLabels } from "../public/orders.mjs";
import { pickupLabel } from "../public/model.mjs";

const money = (n) => "$" + (n / 100).toFixed(2);
// Hard limits reserve API attempts, including retries/timeouts. No paid overage
// is enabled. The rolling window is conservative across any monthly boundary.
export const EMAIL_DAILY_LIMIT = 90;
export const EMAIL_ROLLING_LIMIT = 2700;
export async function reserveEmailBudget(db, workspace, now) {
  const day = new Date(now).toISOString().slice(0, 10);
  const start = new Date(now - 30 * 86400000).toISOString().slice(0, 10);
  const prefix = 'rr-order-email:' + workspace + ':';
  const key = prefix + day;
  const sql = 'INSERT INTO limits(key,count,expires) SELECT ?,1,? WHERE COALESCE((SELECT count FROM limits WHERE key=?),0)<? AND COALESCE((SELECT SUM(count) FROM limits WHERE key>=? AND key<=?),0)<? ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<? AND COALESCE((SELECT SUM(count) FROM limits WHERE key>=? AND key<=?),0)<? RETURNING count';
  return !!await db.prepare(sql).bind(key, now + 35 * 86400000, key, EMAIL_DAILY_LIMIT, prefix + start, key, EMAIL_ROLLING_LIMIT, EMAIL_DAILY_LIMIT, prefix + start, key, EMAIL_ROLLING_LIMIT).first();
}
export function orderEmail(order, event, workspace, env) {
  const production = env.DEPLOYMENT_ENVIRONMENT === 'production';
  const label = eventLabels[event];
  return {
    from: env.ORDER_EMAIL_FROM, to: [order.customer.email],
    subject: `Rise & Roost · ${order.orderNumber} · ${label}`,
    text: [
      production ? 'RISE & ROOST — YOUR ORDER' : 'RISE & ROOST — TEST ORDER',
      `${order.orderNumber}: ${label}`,
      event === 'verified' ? 'Danielle recorded independent payment verification. Your payment receipt is available on your private order page.' : event === 'received' ? 'Your order was received. This confirmation does not confirm payment.' : event === 'preparing' ? 'Danielle marked your order as Preparing Your Order.' : 'Danielle marked your order Ready for Pickup.',
      'Payment status: ' + (paymentLabels[order.paymentStatus] || 'Awaiting Payment Verification'),
      '', 'Your items:', ...(order.lines || []).map(line => `${line.qty} × ${line.name}${line.variant ? ' (' + line.variant + ')' : ''} · ${money(line.qty * line.unitPrice)}`),
      `Order total: ${money(order.total)}`, `Pickup: ${pickupLabel(order.pickup)}`,
      '', 'Your private order link (keep it private):',
      (env.WEBSITE_BASE_URL || BETA_ORIGIN).replace(/\/$/, '') + trackingPath(workspace, order),
      'Save this email or use Save Confirmation / Print on your order page. Signed-in orders also appear in My Orders in The Roost.',
      production ? 'This website did not process a payment. Your order page shows the current payment and pickup status. You requested order updates; no marketing messages.' : 'This is a test order. Do not send real money. You requested transactional order updates; no marketing messages.'
    ].join('\n\n')
  };
}

// Outbox entries live in the same D1 ledger transaction as the order transition.
// A lease + CAS prevents competing Worker requests from submitting independently;
// the provider's idempotency key also protects a retry after an uncertain timeout.
export async function drainNotifications(db, env, { fetcher = fetch, now = Date.now(), max = 8 } = {}) {
  if (!emailConfigured(env)) return;
  const first = async () => db.prepare("SELECT id,ledger_json,ledger_version FROM workspaces WHERE id=?").bind(env.PUBLIC_WORKSPACE_ID).first();
  const save = async (row, ledger) => (await db.prepare("UPDATE workspaces SET ledger_json=?,ledger_version=ledger_version+1 WHERE id=? AND ledger_version=?")
    .bind(JSON.stringify(ledger), row.id, row.ledger_version).run()).meta.changes === 1;
  for (let i = 0; i < max; i++) {
    const row = await first();
    if (!row) return;
    const ledger = JSON.parse(row.ledger_json);
    let selected;
    for (const order of ledger.orders) {
      const n = (order.notifications || []).find((n) =>
        (["queued", "retry", "quota_paused"].includes(n.status) && (!n.retryAt || n.retryAt <= now)) ||
        (n.status === "sending" && n.leaseUntil <= now));
      if (n) { selected = { order, n }; break; }
    }
    if (!selected) return;
    const { order, n } = selected;
    // Never replay outside Resend's 24-hour idempotency window.
    if ((n.firstAttemptAt && now - n.firstAttemptAt >= 23 * 3600000) || now - Date.parse(n.at) >= 23 * 3600000) {
      n.status = "expired"; delete n.deliveryPayload;
      await save(row, ledger);
      continue;
    }
    const lease = crypto.randomUUID();
    n.status = "sending";
    n.lease = lease;
    n.leaseUntil = now + 90000;
    n.firstAttemptAt ||= now;
    n.attempts++;
    if (!await save(row, ledger)) continue;
    let accepted = "", failure = "retry";
    const budget = await reserveEmailBudget(db, env.PUBLIC_WORKSPACE_ID, now);
    if (!budget) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const fresh = await first(); if (!fresh) break;
        const current = JSON.parse(fresh.ledger_json);
        const item = current.orders.find(o => o.id === order.id)?.notifications?.find(v => v.id === n.id);
        if (!item || item.lease !== lease) break;
        item.status = 'quota_paused'; item.retryAt = now + 3600000;
        // No provider call was made; do not begin its idempotency window.
        item.attempts--; if (!n.firstAttemptAt || n.attempts === 1) delete item.firstAttemptAt;
        delete item.lease; delete item.leaseUntil;
        if (await save(fresh, current)) break;
      }
      return;
    }
    // Freeze the complete provider payload before the first HTTP submission.
    // Payment/pickup edits or a deployment must not change a retry's body.
    let deliveryPayload = n.deliveryPayload;
    if (!deliveryPayload) {
      const prepared = orderEmail(order, n.event, row.id, env);
      for (let attempt = 0; attempt < 8; attempt++) {
        const fresh = await first(); if (!fresh) break;
        const current = JSON.parse(fresh.ledger_json);
        const item = current.orders.find(o => o.id === order.id)?.notifications?.find(v => v.id === n.id);
        if (!item || item.lease !== lease) break;
        item.deliveryPayload = prepared;
        if (await save(fresh, current)) { deliveryPayload = prepared; break; }
      }
      if (!deliveryPayload) continue;
    }
    try {
      const result = await fetcher("https://api.resend.com/emails", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json", "Idempotency-Key": "rr-beta-" + n.id },
        body: JSON.stringify(deliveryPayload),
      });
      const payload = await result.json().catch(() => ({}));
      if (result.ok && typeof payload.id === "string" && payload.id.length > 0 && payload.id.length < 200) accepted = payload.id;
      else if (result.status >= 400 && result.status < 500 && ![408, 409, 429].includes(result.status)) failure = "failed";
    } catch { /* The provider may have accepted before a timeout. Retry the same key. */ }
    for (let attempt = 0; attempt < 8; attempt++) {
      const fresh = await first();
      if (!fresh) break;
      const current = JSON.parse(fresh.ledger_json);
      const item = current.orders.find((o) => o.id === order.id)?.notifications?.find((v) => v.id === n.id);
      if (!item || item.lease !== lease) break;
      item.status = accepted ? "accepted" : failure;
      if (accepted || failure === "failed") delete item.deliveryPayload;
      if (accepted) {
        item.providerId = accepted;
        item.acceptedAt = new Date(now).toISOString();
      } else item.retryAt = now + Math.min(3600000, 60000 * 2 ** Math.min(item.attempts, 6));
      delete item.lease;
      delete item.leaseUntil;
      if (await save(fresh, current)) break;
    }
  }
}
