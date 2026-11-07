import { emailConfigured, emailProviderReady, emailAddress, customerEmailAllowed, SENDER, authorizedTestRecipient } from './email-policy.mjs';
import { orderEmail, testEmail } from './email-templates.mjs';
export const applicableEmail = (order, event) => event === 'verified' ? !!order.paymentVerifiedAt && ['verified','partially_refunded','refunded'].includes(order.paymentStatus) : event === 'forfeited' ? order.resolution?.kind === 'forfeited' : event === 'canceled' ? order.status === 'canceled' : event === 'ready' ? order.status === 'ready' && !order.resolution : event === 'preparing' ? order.status === 'preparing' && !order.resolution : event === 'received' && !['canceled','picked-up'].includes(order.status) && !order.resolution;
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
export { orderEmail } from './email-templates.mjs';

// Outbox entries live in the same D1 ledger transaction as the order transition.
// A lease + CAS prevents competing Worker requests from submitting independently;
// the provider's idempotency key also protects a retry after an uncertain timeout.
export async function drainNotifications(db, env, { fetcher = fetch, now = Date.now(), max = 8 } = {}) {
  if (!emailProviderReady(env)) return;
  const first = async () => db.prepare("SELECT id,ledger_json,ledger_version FROM workspaces WHERE id=?").bind(env.PUBLIC_WORKSPACE_ID).first();
  const save = async (row, ledger) => (await db.prepare("UPDATE workspaces SET ledger_json=?,ledger_version=ledger_version+1 WHERE id=? AND ledger_version=?")
    .bind(JSON.stringify(ledger), row.id, row.ledger_version).run()).meta.changes === 1;
  for (let i = 0; i < max; i++) {
    const row = await first();
    if (!row) return;
    const ledger = JSON.parse(row.ledger_json);
    let selected;
    const settings = ledger.management?.email;
    const candidates = [
      ...(ledger.management?.emailTests || []).map(n => ({ order: null, n })),
      ...(emailConfigured(env, settings) ? ledger.orders.filter(o => o.customer?.emailOptIn).flatMap(order => (order.notifications || []).map(n => ({ order, n }))) : []),
    ];
    selected = candidates.find(({ n }) => ((n.status === "failed" && now - Date.parse(n.at) >= 23 * 3600000) || ["queued", "retry", "quota_paused"].includes(n.status) && (!n.retryAt || n.retryAt <= now)) || (n.status === "sending" && n.leaseUntil <= now));
    if (!selected) return;
    const { order, n } = selected;
    const findItem = current => order ? current.orders.find(o => o.id === order.id)?.notifications?.find(v => v.id === n.id) : current.management?.emailTests?.find(v => v.id === n.id);
    const recipient = order ? order.customer?.email : n.recipient;
    if (!emailAddress(recipient) || !order && !authorizedTestRecipient(env,recipient) || order && (!customerEmailAllowed(settings, n.event) || !applicableEmail(order, n.event))) {
      n.status = !emailAddress(recipient) ? 'invalid' : 'suppressed'; delete n.deliveryPayload;
      await save(row, ledger); continue;
    }
    // Never replay outside Resend's 24-hour idempotency window.
    if (n.attempts >= 8 || (n.firstAttemptAt && now - n.firstAttemptAt >= 23 * 3600000) || now - Date.parse(n.at) >= 23 * 3600000) {
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
    let accepted = "", failure = "retry", errorCode = "timeout_or_network", retryDelay = 0;
    const budget = await reserveEmailBudget(db, env.PUBLIC_WORKSPACE_ID, now);
    if (!budget) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const fresh = await first(); if (!fresh) break;
        const current = JSON.parse(fresh.ledger_json);
        const item = findItem(current);
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
      const prepared = order ? orderEmail(order, n.event, row.id, env) : testEmail(n.recipient);
      for (let attempt = 0; attempt < 8; attempt++) {
        const fresh = await first(); if (!fresh) break;
        const current = JSON.parse(fresh.ledger_json);
        const item = findItem(current);
        if (!item || item.lease !== lease) break;
        item.deliveryPayload = prepared;
        if (await save(fresh, current)) { deliveryPayload = prepared; break; }
      }
      if (!deliveryPayload) continue;
    }
    const finalRow = await first();
    if (!finalRow) return;
    const finalLedger = JSON.parse(finalRow.ledger_json), finalItem = findItem(finalLedger);
    if (!finalItem || finalItem.lease !== lease) continue;
    const finalOrder = order && finalLedger.orders.find(o => o.id === order.id);
    if (deliveryPayload.from !== SENDER || !order && !authorizedTestRecipient(env,recipient) || order && (!emailConfigured(env, finalLedger.management?.email) || !customerEmailAllowed(finalLedger.management?.email, n.event) || !finalOrder?.customer?.emailOptIn || !applicableEmail(finalOrder,n.event))) {
      finalItem.status = 'suppressed'; delete finalItem.deliveryPayload; delete finalItem.lease; delete finalItem.leaseUntil;
      await save(finalRow, finalLedger); continue;
    }
    try {
      const result = await fetcher("https://api.resend.com/emails", {
        method: "POST", redirect: "manual",
        signal: AbortSignal.timeout(15000),
        headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json", "Idempotency-Key": "rr-beta-" + n.id },
        body: JSON.stringify(deliveryPayload),
      });
      const payload = await result.json().catch(() => ({}));
      if (result.ok && typeof payload.id === "string" && payload.id.length > 0 && payload.id.length < 200) accepted = payload.id;
      else {
        errorCode = 'provider_http_' + result.status;
        const retryAfter = result.headers.get('Retry-After');
        retryDelay = retryAfter ? Math.min(3600000, Math.max(0, (/^\d+$/.test(retryAfter) ? Number(retryAfter)*1000 : Date.parse(retryAfter)-now) || 0)) : 0;
      }
      if (!accepted && ((result.status >= 300 && result.status < 400) || (result.status >= 400 && result.status < 500 && ![408, 409, 429].includes(result.status)))) failure = "failed";
    } catch { /* The provider may have accepted before a timeout. Retry the same key. */ }
    for (let attempt = 0; attempt < 8; attempt++) {
      const fresh = await first();
      if (!fresh) break;
      const current = JSON.parse(fresh.ledger_json);
      const item = findItem(current);
      if (!item || item.lease !== lease) break;
      item.status = accepted ? "accepted" : failure;
      if (accepted) delete item.deliveryPayload;
      item.history ||= []; item.history.push({ at: new Date(now).toISOString(), status: item.status, ...(accepted ? {} : { errorCode }) });
      item.history = item.history.slice(-8);
      if (!accepted) item.errorCode = errorCode; else delete item.errorCode;
      if (accepted) {
        item.providerId = accepted;
        item.acceptedAt = new Date(now).toISOString();
      } else item.retryAt = now + Math.max(retryDelay, Math.min(3600000, 60000 * 2 ** Math.min(item.attempts, 6)));
      delete item.lease;
      delete item.leaseUntil;
      if (await save(fresh, current)) break;
    }
  }
}
