import { h, button } from './dom.mjs';
import { money } from './model.mjs';
import { providers } from './commerce.mjs';
import { paymentTiles } from './payment-tiles.mjs';

export function paymentSelection(order, onChoose, busy = false) {
  if (!document.querySelector('link[href="/tracking.css"]')) document.head.append(h('link', { rel: 'stylesheet', href: '/tracking.css' }));
  if (order.paymentVerifiedAt || order.paidReceipt) return h('section', { class: 'sub-card', 'aria-label': 'Payment status' },
    h('h2', {}, 'Paid'), h('p', {}, 'Danielle confirmed your payment. No further payment is due.'));
  if (order.total === 0) return h('p', {}, 'No payment is required for this order.');
  if (order.status === 'canceled' || order.resolution) return null;
  const cash = order.selectedPaymentMethod === 'cash_pickup';
  return h('section', { class: 'sub-card', 'aria-label': 'Payment options' },
    h('h2', { style: { fontSize: '1.5rem' } }, 'Choose how to pay'), h('strong', {}, 'Amount due: ' + money(order.total)),
    h('p', { role: 'status' }, cash ? 'Cash at Pickup selected. Please bring your payment when you pick up your order. Payment remains due until Danielle confirms cash was received.' :
      order.selectedPaymentMethod ? providers[order.selectedPaymentMethod] + ' selected. Payment is awaiting Danielle’s verification.' : 'Your order is saved and unpaid. Choose a payment method now or return through your private tracking link.'),
    paymentTiles(order, onChoose, busy),
    button('Cash at Pickup', event => onChoose('cash_pickup', event), { class: 'secondary-button', disabled: busy, 'aria-pressed': cash }),
    h('p', { class: 'small-note' }, 'For app payments, pay the exact amount shown and include ' + order.orderNumber + ' as a note if available. Opening a payment link never marks your order paid. Danielle verifies every payment.'));
}
