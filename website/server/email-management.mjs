import { emailConfigured, emailProviderReady, emailPreferences, customerEmailAllowed, EMAIL_TYPES, SENDER, emailAddress, retryableEmail } from './email-policy.mjs';
import { applicableEmail } from './notifications.mjs';
const bad = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
export function emailSnapshot(ledger, env, actor, now) {
  const settings = ledger.management?.email;
  const entries = [
    ...(ledger.management?.emailTests || []).map(n => ({ n, order: null })),
    ...ledger.orders.flatMap(order => (order.notifications || []).map(n => ({ n, order }))),
  ].sort((a,b) => b.n.at.localeCompare(a.n.at)).slice(0, 60);
  return { configured: emailProviderReady(env), sender: SENDER, enabled: settings?.enabled !== false,
    active: emailConfigured(env, settings), releaseEnabled: env.ORDER_EMAIL_ENABLED === 'true',
    freePlanConfirmed: env.ORDER_EMAIL_FREE_PLAN_CONFIRMED === 'true', deliveryVerified: env.ORDER_EMAIL_DELIVERY_VERIFIED === 'true',
    types: emailPreferences(settings), testRecipient: actor.authentication === 'cloudflare_access' ? actor.email : null,
    attempts: entries.map(({ n, order }) => ({ id: n.id, orderId: order?.id, orderNumber: order?.orderNumber, event: n.event || 'test', at: n.at, status: n.status, attempts: n.attempts, acceptedAt: n.acceptedAt, errorCode: n.errorCode, retryAt: n.retryAt, history: n.history || [],
      retryable: retryableEmail(n, now) && (order ? emailConfigured(env, settings) && customerEmailAllowed(settings, n.event) && applicableEmail(order, n.event) : emailProviderReady(env)) })) };
}
// Called only after normal Studio authentication, CSRF/origin validation and
// operation-id deduplication. The same ledger CAS commits settings and outbox.
export function manageEmail({ path, ledger, input, env, actor, now, id }) {
  const m = ledger.management;
  if (path === '/api/manage/email-settings') {
    if (typeof input.enabled !== 'boolean' || !input.types || Object.keys(EMAIL_TYPES).some(k => typeof input.types[k] !== 'boolean')) bad('Check the customer email choices.');
    m.email = { enabled: input.enabled, types: Object.fromEntries(Object.keys(EMAIL_TYPES).map(k => [k, input.types[k]])) };
    // Turning a type off withdraws its pending entries. Turning it on later must
    // not deliver a backlog of messages the owner deliberately disabled.
    for (const o of ledger.orders) for (const n of o.notifications || []) if (!customerEmailAllowed(m.email,n.event) && ['queued','retry','quota_paused','failed'].includes(n.status)) { n.status='suppressed'; delete n.deliveryPayload; }
    return { description: 'Customer email preferences saved', result: {} };
  }
  if (path === '/api/manage/email-test') {
    if (!emailProviderReady(env)) bad('Resend is not configured. Ask the website operator to check the existing secure connection.', 409);
    if (actor.authentication !== 'cloudflare_access' || actor.role !== 'owner' || !emailAddress(actor.email)) bad('Sign in with your individual owner account to send a test.', 403);
    if (input.confirmed !== true || input.recipient !== undefined) bad('Confirm sending a test to your own authorized owner address.');
    m.emailTests ||= [];
    const recent = m.emailTests.filter(n => Date.parse(n.at) > now - 3600000);
    if (recent.some(n => Date.parse(n.at) > now - 60000) || recent.length >= 5) bad('Please wait. Studio allows one test per minute and five per hour.',429);
    if (m.emailTests.length >= 100) bad('The saved test history is full. Ask the website operator to expand storage.',409);
    const testId = id();
    m.emailTests.unshift({ id: testId, event:'test', recipient: actor.email, at: new Date(now).toISOString(), status:'queued', attempts:0 });
    return { description: 'Owner-only test email queued', result: { notificationId: testId } };
  }
  if (path === '/api/manage/email-retry') {
    const order = input.orderId ? ledger.orders.find(o=>o.id===input.orderId) : null;
    const n = (order ? order.notifications : m.emailTests)?.find(n=>n.id===input.notificationId);
    if (!n || !retryableEmail(n,now)) bad('This message cannot be retried safely. Accepted, expired and uncertain old submissions must not be resent.',409);
    if (order && (!order.customer?.emailOptIn || !emailConfigured(env,m.email) || !customerEmailAllowed(m.email,n.event) || !applicableEmail(order,n.event))) bad('This customer email is disabled or no longer matches the order state.',409);
    if (!order && (actor.authentication !== 'cloudflare_access' || actor.email !== n.recipient || !emailProviderReady(env))) bad('Only the original authorized owner may retry this test.',403);
    if (input.confirmed !== true) bad('Confirm retrying this saved notification.');
    if (n.retryAt && n.retryAt > now) bad('Wait until the retry time shown in Studio.',429);
    n.status='queued'; n.retryAt=now;
    return { description:'Email retry queued using its original identifier', result:{ notificationId:n.id } };
  }
  bad('This email action was not found.',404);
}
