// Monetary events share the order ledger's compare-and-swap transaction. No
// balance cache, detached reservation write, or destructive history cleanup.
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const id = () => crypto.randomUUID();
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
export const MAX_BALANCE = 100000000;
export const creditProgram = ledger => ledger.returnCredits || { enabled: false, items: [], transactions: [] };
export function creditBalance(ledger, memberId) {
  const entries = creditProgram(ledger).transactions.filter(t => t.memberId === memberId);
  const available = entries.reduce((n, t) => n + t.availableDelta, 0);
  const reserved = entries.reduce((n, t) => n + t.reservedDelta, 0);
  if (!integer(available, 0, MAX_BALANCE) || !integer(reserved, 0, MAX_BALANCE)) fail('Credit records need owner review. No credits were changed.', 409);
  return { available, reserved };
}
function event(ledger, memberId, kind, amount, availableDelta, reservedDelta, now, extra = {}) {
  ledger.returnCredits ||= { enabled: false, items: [], transactions: [] };
  const t = { id: id(), memberId, kind, amount, availableDelta, reservedDelta, at: new Date(now).toISOString(), ...extra };
  ledger.returnCredits.transactions.push(t);
  creditBalance(ledger, memberId);
  return t;
}
export function customerCredits(ledger, memberId) {
  const program = creditProgram(ledger);
  return { enabled: program.enabled, ...creditBalance(ledger, memberId),
    items: program.enabled ? program.items.filter(i => i.status === 'active').map(({ id, name, cents }) => ({ id, name, cents })) : [],
    transactions: program.transactions.filter(t => t.memberId === memberId).map(({ id, kind, amount, availableDelta, at, description, orderNumber, lines }) => ({ id, kind, amount, availableDelta, at, description, orderNumber, lines })) };
}
export function reserveCredit(ledger, order, amount, now) {
  if (!integer(amount, 0, 1000000)) fail('Choose a valid return-credit amount.');
  if (!amount) return;
  if (!order.customer?.memberId) fail('Sign in and choose member checkout to use return credits.', 401);
  if (!creditProgram(ledger).enabled) fail('Return-credit checkout is currently unavailable.', 409);
  if (amount > order.total || amount > creditBalance(ledger, order.customer.memberId).available) fail('Your credit balance or order total changed. Review checkout before retrying.', 409);
  order.subtotal = order.total; order.creditApplied = amount; order.total -= amount;
  order.returnCredit = { amount, status: 'reserved' };
  event(ledger, order.customer.memberId, 'reserved', amount, -amount, amount, now, { orderId: order.id, orderNumber: order.orderNumber, description: 'Credit reserved for ' + order.orderNumber });
  if (order.total === 0) finalizeCredit(ledger, order, now);
}
export function finalizeCredit(ledger, order, now) {
  if (order.returnCredit?.status !== 'reserved') return;
  const amount = order.returnCredit.amount;
  event(ledger, order.customer.memberId, 'used', amount, 0, -amount, now, { orderId: order.id, orderNumber: order.orderNumber, description: 'Credit used toward ' + order.orderNumber });
  order.returnCredit.status = 'used';
}
export function cancelCredit(ledger, order, now, actor) {
  const credit = order.returnCredit;
  if (!credit || credit.status === 'released') return;
  const reserved = credit.status === 'reserved';
  event(ledger, order.customer.memberId, reserved ? 'released' : 'restored', credit.amount, credit.amount, reserved ? -credit.amount : 0, now,
    { orderId: order.id, orderNumber: order.orderNumber, actor, description: (reserved ? 'Reservation released: ' : 'Credit restored after cancellation: ') + order.orderNumber });
  credit.status = 'released';
}
export function reopenCredit(ledger, order, now) {
  if (order.returnCredit?.status !== 'released') return;
  if (order.refunds?.length) fail('This canceled order has external refund records. Place a new order after reviewing those records instead of reusing its old payment.', 409);
  const amount = order.returnCredit.amount;
  if (creditBalance(ledger, order.customer.memberId).available < amount) fail('This customer has insufficient credit to reopen this order.', 409);
  event(ledger, order.customer.memberId, 'reserved', amount, -amount, amount, now, { orderId: order.id, orderNumber: order.orderNumber, description: 'Credit reserved again for reopened ' + order.orderNumber });
  order.returnCredit.status = 'reserved';
  if (order.paymentVerifiedAt || order.total === 0) finalizeCredit(ledger, order, now);
}
export async function manageCredits({ ledger, input, action, now, actor, db, workspaceId }) {
  if (input.confirmed !== true) fail('Review and confirm this return-credit change.');
  ledger.returnCredits ||= { enabled: false, items: [], transactions: [] };
  const program = ledger.returnCredits, at = new Date(now).toISOString();
  if (action === 'credit-settings') {
    if (typeof input.enabled !== 'boolean') fail('Choose whether return credits are enabled.');
    if (input.enabled && input.termsReviewed !== true) fail('Review applicable store-credit legal and accounting requirements before enabling the program.');
    if (input.enabled && (ledger.management?.benefits || []).some(b => b.kind !== 'bottle_return')) fail('Legacy credit ownership and values need a verified migration before activation.', 409);
    program.enabled = input.enabled;
    program.review = { at, actor, termsReviewed: input.termsReviewed === true };
    return { description: 'Return-credit program ' + (input.enabled ? 'enabled after owner review' : 'paused'), result: {} };
  }
  if (action === 'credit-item') {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > 80 || /[\x00-\x1f]/.test(name) || !integer(input.cents, 0, 100000) || !['active', 'inactive', 'retired'].includes(input.status)) fail('Enter a name, a dollar value from $0 to $1,000, and an item status.');
    let item = input.id ? program.items.find(i => i.id === input.id) : null;
    if (input.id && (!item || input.itemVersion !== item.version)) fail('This return item changed. Refresh and review its current value.', 409);
    if (!item && program.items.length >= 100) fail('The return list is full. Reactivate or edit an existing item.');
    const before = item ? { ...item } : null;
    if (!item) { item = { id: id(), version: 0 }; program.items.push(item); }
    Object.assign(item, { name, cents: input.cents, status: input.status, version: item.version + 1, updatedAt: at, updatedBy: actor });
    return { description: 'Return item saved: ' + name, result: { itemId: item.id, before, after: { ...item } } };
  }
  const member = await db.prepare('SELECT id FROM roost_members WHERE id=? AND workspace_id=?').bind(input.memberId || '', workspaceId).first();
  if (!member) fail('Choose an existing Roost account.');
  if (action === 'credit-return') {
    if (!program.enabled) fail('Enable the return program after reviewing its terms before recording a return.', 409);
    if (!Array.isArray(input.lines) || !input.lines.length || input.lines.length > 20 || new Set(input.lines.map(l => l.id)).size !== input.lines.length) fail('Choose up to 20 different eligible return items.');
    const lines = input.lines.map(line => {
      const item = program.items.find(i => i.id === line.id && i.status === 'active');
      if (!item || line.version !== item.version) fail('A return item changed. Review the current items and values before confirming.', 409);
      if (!integer(line.qty, 1, 100)) fail('Enter a whole return quantity from 1 to 100.');
      return { itemId: item.id, name: item.name, cents: item.cents, qty: line.qty };
    });
    const amount = lines.reduce((n, line) => n + line.cents * line.qty, 0);
    if (!integer(amount, 1, 1000000)) fail('A confirmed return must earn between $0.01 and $10,000.');
    const t = event(ledger, member.id, 'earned', amount, amount, 0, now, { actor, lines, description: lines.map(l => l.qty + ' × ' + l.name).join(', ') });
    return { description: 'Customer return confirmed', result: { transactionId: t.id, memberId: member.id } };
  }
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (reason.length < 5 || reason.length > 500) fail('Record a correction reason of 5–500 characters.');
  let delta = input.delta, original;
  if (action === 'credit-reverse') {
    original = program.transactions.find(t => t.id === input.transactionId && t.memberId === member.id && ['earned', 'adjusted'].includes(t.kind));
    if (!original || program.transactions.some(t => t.reversalOf === original.id)) fail('Choose an earned credit or adjustment that has not already been reversed.', 409);
    delta = -original.availableDelta;
  } else if (action !== 'credit-adjust') fail('Return-credit action was not found.', 404);
  if (!integer(delta, -1000000, 1000000) || delta === 0) fail('Enter a nonzero adjustment of at most $10,000.');
  if (creditBalance(ledger, member.id).available + delta < 0) fail('This correction would spend reserved or used credit and make the available balance negative.', 409);
  const t = event(ledger, member.id, original ? 'reversed' : 'adjusted', Math.abs(delta), delta, 0, now, { actor, description: reason, ...(original ? { reversalOf: original.id } : {}) });
  return { description: 'Return credit ' + (original ? 'reversed' : 'adjusted') + ': ' + reason, result: { transactionId: t.id, memberId: member.id } };
}
