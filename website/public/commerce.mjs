import { localInstant, customerTime } from './model.mjs';
export const POLICY_VERSION = '2026-11-01';
export const POLICY_TITLE = 'Rise & Roost Pickup Policy';
export const POLICY = [
  'Please pick up your order at your scheduled pickup time or within one business day afterward.',
  "If you're unable to make your scheduled pickup or need additional time, please contact Danielle through your order page as soon as possible so other arrangements can be discussed.",
  'Orders not picked up within the allowed time, without prior communication or approved arrangements, will be forfeited without a refund.',
  'Thank you for understanding and supporting Rise & Roost!',
];
export const providers = { paypal: 'PayPal', venmo: 'Venmo', cashapp: 'Cash App' };
export const defaultCalendar = () => ({ days: [0,1,2,3,4,5,6], closures: [] });
const bad = message => { throw Object.assign(new Error(message), { status: 400 }); };
export function calendarConfig(value = defaultCalendar()) {
  if (!value || !Array.isArray(value.days) || !value.days.length || value.days.length > 7 || new Set(value.days).size !== value.days.length || value.days.some(d => !Number.isInteger(d) || d < 0 || d > 6) || !Array.isArray(value.closures) || value.closures.length > 366) bad('Choose at least one business day and up to 366 closures.');
  for (const day of value.closures) { if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) bad('Use valid closure dates.'); try { localInstant(day, '12:00'); } catch { bad('Use valid closure dates.'); } }
  return { days: [...value.days], closures: [...new Set(value.closures)] };
}
export function pickupDeadline(pickup, calendar = defaultCalendar()) {
  calendarConfig(calendar);
  let day = pickup.date;
  // At the same local clock time on the next open business date, across DST.
  for (let i = 0; i < 740; i++) {
    day = new Date(Date.parse(day + 'T12:00:00Z') + 86400000).toISOString().slice(0,10);
    if (calendar.days.includes(new Date(day + 'T12:00:00Z').getUTCDay()) && !calendar.closures.includes(day)) return new Date(localInstant(day, pickup.end || pickup.start)).toISOString();
  }
  bad('No business day is available for this pickup deadline.');
}
export function paymentDestination(provider, value) {
  if (!Object.hasOwn(providers, provider) || typeof value !== 'string' || value.length > 500) bad('Choose a supported payment destination.');
  let u; try { u = new URL(value); } catch { bad('Use the complete HTTPS payment link supplied by your business payment provider.'); }
  if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hash || u.search) bad('Use a provider payment link without added query parameters or fragments.');
  const paths = {
    paypal: /^(?:\/(?:ncp\/payment|invoice\/p)\/[A-Za-z0-9_-]+)\/?$/,
    venmo: /^\/(?:u\/)?[A-Za-z0-9_-]{2,80}\/?$/,
    cashapp: /^\/\$[A-Za-z0-9_-]{1,80}\/?$/,
  };
  const hosts = { paypal: ['www.paypal.com','paypal.com'], venmo: ['venmo.com','www.venmo.com'], cashapp: ['cash.app'] };
  if (!hosts[provider].includes(u.hostname) || !paths[provider].test(u.pathname)) bad('Use an approved PayPal payment/invoice link, Venmo business profile, or Cash App Business cashtag destination.');
  return u.href;
}
export function configuredPayments(settings = {}) {
  return Object.fromEntries(Object.entries(settings.payments || {}).filter(([key,v]) => {
    try { return v.businessConfirmed === true && paymentDestination(key,v.url); } catch { return false; }
  }).map(([key,v]) => [key, { url: v.url }]));
}
export function orderAttention(order, now = Date.now()) {
  const unresolved = !!order.contact?.unresolved;
  const terminal = ['canceled','picked-up'].includes(order.status) || !!order.resolution;
  const deadline = order.pickupDeadline || null; // Historical orders retain their original policy; no retroactive deadline.
  const overdue = !terminal && !unresolved && !!deadline && Date.parse(deadline) < now;
  const history = (terminal && !unresolved && !order.dispute?.open) || (!!order.archivedAt && !unresolved && !overdue && !!order.paymentVerifiedAt);
  return { customerContacted: unresolved, extensionRequested: unresolved && !!order.contact?.extensionRequested,
    extensionApproved: !!order.extension && !unresolved && !terminal && !overdue, resolved: !!order.contact?.resolvedAt && !unresolved,
    overdue, history, needsAttention: unresolved || overdue || order.dispute?.open === true };
}

export function requestedPickupLabel(message) {
  if (!message.requestedDate) return message.requestedTime ? customerTime(localInstant('2000-01-01', message.requestedTime)) + ' · date not specified' : '';
  const date = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(message.requestedDate + 'T12:00:00Z'));
  return date + (message.requestedTime ? ' at ' + customerTime(localInstant(message.requestedDate, message.requestedTime)) : ' · time not specified');
}
