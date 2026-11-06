// Cash eligibility is derived only from authenticated membership and the current
// workspace ledger. Checkout checks and the order are committed by one ledger CAS.
export const CASH_METHOD = 'cash_pickup';
export const OUTSTANDING_MESSAGE = 'You already have an order awaiting cash payment. Please complete that order before placing another cash order.';
export function outstandingCash(order) {
  return order.selectedPaymentMethod === CASH_METHOD && order.total > 0 && !order.paymentVerifiedAt && order.status !== 'canceled' && !order.resolution;
}
export function cashEligibility(ledger, memberId) {
  const enabled = ledger.management?.settings?.cashPickupEnabled === true;
  const allowed = !!memberId && ledger.management?.cashPrivileges?.[memberId]?.allowed !== false;
  const outstanding = !!memberId && ledger.orders.some(o => o.customer?.memberId === memberId && outstandingCash(o));
  return { enabled, allowed, outstanding, eligible: enabled && allowed && !outstanding };
}
export function requireCash(ledger, memberId, excludeOrderId) {
  const state = cashEligibility({ ...ledger, orders: ledger.orders.filter(o => o.id !== excludeOrderId) }, memberId);
  const bad = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };
  if (!memberId) bad('Sign in to The Roost to pay cash at pickup.', 401);
  if (!state.enabled || !state.allowed) bad('Cash at Pickup is currently unavailable. Please choose another payment method.');
  if (state.outstanding) bad(OUTSTANDING_MESSAGE);
}
