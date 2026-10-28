import { BETA_ORIGIN, emailConfigured } from "./orders.mjs";
import { trackingPath, eventLabels } from "../public/orders.mjs";

const money = (n) => "$" + (n / 100).toFixed(2);
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
        (["queued", "retry"].includes(n.status) && (!n.retryAt || n.retryAt <= now)) ||
        (n.status === "sending" && n.leaseUntil <= now));
      if (n) { selected = { order, n }; break; }
    }
    if (!selected) return;
    const { order, n } = selected;
    // Never replay outside Resend's 24-hour idempotency window.
    if (n.firstAttemptAt && now - n.firstAttemptAt >= 23 * 3600000) {
      n.status = "expired";
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
    try {
      const result = await fetcher("https://api.resend.com/emails", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json", "Idempotency-Key": "rr-beta-" + n.id },
        body: JSON.stringify({
          from: env.ORDER_EMAIL_FROM,
          to: [order.customer.email],
          subject: `Rise & Roost · ${order.orderNumber} · ${eventLabels[n.event]}`,
          text: [
            "RISE & ROOST · BETA ORDER",
            `${order.orderNumber}: ${eventLabels[n.event]}`,
            n.event === "verified"
              ? "Danielle recorded independent payment verification. Your beta paid receipt is available on your private status page. This website did not process a payment."
              : n.event === "received" ? "Your beta order was received. Payment had not been verified at order receipt. See your status page for current information."
              : n.event === "preparing" ? "Danielle marked your order as Preparing Your Order."
              : "Danielle marked your order Ready for Pickup.",
            `Order total: ${money(order.total)}`,
            `Pickup: ${order.pickup.date}, ${order.pickup.start}–${order.pickup.end} (America/Indiana/Indianapolis)`,
            "Your private status page (keep this link private):",
            BETA_ORIGIN + trackingPath(row.id, order),
            "This is an isolated website beta. No Square payment was processed. Your status page is the source of current order information. You requested transactional order updates; no marketing messages.",
          ].join("\n\n"),
        }),
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
