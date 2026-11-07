import { h, button, guard, notify } from './dom.mjs';
import { money, pickupLabel, customerTimestamp } from './model.mjs';
import { paymentLabels, fulfillmentLabels } from './orders.mjs';

export function privateOrderUrl(order, origin) {
  const base = new URL(origin);
  const url = new URL(order.trackingPath || '', base.origin);
  if (url.origin !== base.origin || url.username || url.password || url.pathname.split('/').at(-1) !== order.id || !/^\/orders\/[a-f0-9]{48}\/[a-f0-9]{48}$/.test(url.pathname) || !/^#access=[a-f0-9]{48}$/.test(url.hash)) throw new Error('Open the complete private tracking link to save this confirmation.');
  return url.href;
}
export function confirmationText(order, origin, savedAt = new Date()) {
  const number = order.orderNumber || 'RR-' + order.id.slice(0, 16).toUpperCase();
  return [
    'RISE & ROOST — ORDER CONFIRMATION', 'Order number: ' + number,
    'Order received: ' + customerTimestamp(order.at),
    'Order status: ' + (fulfillmentLabels[order.status] || 'Order Received'),
    'Payment status: ' + (paymentLabels[order.paymentStatus] || 'Awaiting Payment Verification'),
    'This confirmation does not by itself confirm payment.', '', 'YOUR ITEMS',
    ...(order.lines || []).map(line => `${line.qty} × ${line.name}${line.variant ? ' (' + line.variant + ')' : ''} · ${money(line.qty * line.unitPrice)}`),
    ...(order.creditApplied ? ['Subtotal: ' + money(order.subtotal), 'Return credit: ' + money(order.creditApplied)] : []),
    'Order total: ' + money(order.total), '', 'PICKUP',
    order.pickupChange && !order.pickupChange.replacement ? 'Awaiting makeup date. Check your order page for the latest arrangement.' : pickupLabel(order.pickup),
    ...(order.pickupAddress ? [order.pickupAddress.name, order.pickupAddress.street, order.pickupAddress.city].filter(Boolean) : []),
    '', 'YOUR PRIVATE ORDER LINK', privateOrderUrl(order, origin),
    'Keep this link private. It provides access to your order and messages.',
    'Signed-in orders are also available under My Orders in The Roost.',
    '', 'Saved: ' + savedAt.toISOString(), 'This is a saved snapshot. Open your private order link for the latest status.'
  ].join('\n');
}
export function confirmationTools(order) {
  const origin = location.origin, url = privateOrderUrl(order, origin);
  const text = confirmationText(order, origin);
  const download = () => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const address = URL.createObjectURL(blob);
    const a = h('a', { href: address, download: ((order.orderNumber || 'order-confirmation').replace(/[^a-z0-9_-]/gi, '_')) + '.txt' });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(address), 1000);
  };
  const print = () => {
    document.body.setAttribute('data-print-order-confirmation', 'true');
    const cleanup = () => document.body.removeAttribute('data-print-order-confirmation');
    window.addEventListener('afterprint', cleanup, { once: true });
    try { window.print(); } catch (e) { cleanup(); throw e; }
  };
  return h('section', { class: 'confirmation-tools', 'aria-label': 'Save your order confirmation' },
    h('h2', {}, 'Keep your confirmation'),
    h('p', {}, 'Save your order number and private link so you can find this order again. Keep the link private.'),
    h('label', { class: 'field' }, 'Private order link', h('input', { type: 'text', readonly: true, value: url, 'aria-label': 'Private order link', onfocus: e => e.currentTarget.select() })),
    h('div', { class: 'confirmation-actions' },
      button('Save Confirmation', guard(download), { class: 'secondary-button' }),
      button('Print / Save as PDF', guard(print), { class: 'secondary-button' }),
      button('Copy Order Link', guard(async () => { if (!navigator.clipboard?.writeText) throw new Error('Select the private link above to copy it.'); await navigator.clipboard.writeText(url); notify('Private order link copied. Keep it safe.'); }), { class: 'text-button' })),
    h('section', { class: 'order-confirmation-print', 'aria-hidden': 'true' }, h('pre', {}, text)));
}
