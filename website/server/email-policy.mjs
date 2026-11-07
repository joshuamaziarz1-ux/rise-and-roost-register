export const SENDER_ADDRESS = 'orders@rise-and-roost.com';
export const SENDER = 'Rise & Roost <' + SENDER_ADDRESS + '>';
export const emailAddress = value => typeof value === 'string' && value.length <= 254 && value.split('@')[0].length <= 64 &&
  /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/.test(value);
export const EMAIL_TYPES = { received: 'Order Received', verified: 'Payment Confirmed', preparing: 'Preparing', ready: 'Ready for Pickup', canceled: 'Order Canceled', forfeited: 'Pickup Forfeited' };
export const emailPreferences = settings => ({ received: true, verified: true, preparing: true, ready: true, canceled: true, forfeited: true, ...settings?.types });
export const emailProviderReady = env => !!env.RESEND_API_KEY && /^[a-f0-9]{48}$/.test(env.PUBLIC_WORKSPACE_ID || '') &&
  (!env.ORDER_EMAIL_FROM || emailAddress(env.ORDER_EMAIL_FROM));
export const customerEmailAllowed = (settings, event) => settings?.enabled !== false && (!event || emailPreferences(settings)[event] === true);
export function emailConfigured(env, settings) {
  return env.ORDER_EMAIL_ENABLED === 'true' && env.ORDER_EMAIL_FREE_PLAN_CONFIRMED === 'true' && env.ORDER_EMAIL_DELIVERY_VERIFIED === 'true' &&
    !!env.ORDER_EMAIL_FROM && emailProviderReady(env) && customerEmailAllowed(settings);
}
export const retryableEmail = (n, now) => ['failed', 'retry', 'quota_paused'].includes(n.status) && !!n.deliveryPayload &&
  now - (n.firstAttemptAt || Date.parse(n.at)) < 23 * 3600000 && now - Date.parse(n.at) < 23 * 3600000 && n.attempts < 8;

export function authorizedTestRecipient(env, recipient) {
  try { const owners = JSON.parse(env.PRODUCTION_OWNERS || '[]'); return env.DEPLOYMENT_ENVIRONMENT === 'production' && emailAddress(recipient) && Array.isArray(owners) && owners.some(o => o.role === 'owner' && o.email?.toLowerCase() === recipient.toLowerCase()); } catch { return false; }
}
