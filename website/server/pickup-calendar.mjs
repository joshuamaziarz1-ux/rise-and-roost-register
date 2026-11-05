import { ZONE, localInstant, clone } from '../public/model.mjs';

const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
export function storeDay(now) {
  const p = Object.fromEntries(dateFormatter.formatToParts(now).map(p => [p.type, p.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
// Calendar arithmetic is independent of the length of the intervening DST day.
export const addCalendarDays = (date, days) => new Date(Date.parse(date + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10);
export const orderingDeadline = date => ({ cutoffDate: addCalendarDays(date, -2), cutoffTime: '12:00' });

export function pickupSchedule(document) {
  if (document.pickupSchedule) return clone(document.pickupSchedule);
  // Adopt conservative existing limits and pickup hours without a data migration.
  // A date-specific edit freezes these defaults before changing its exception.
  const existing = document.pickups.filter(p => !p.closed).sort((a, b) => a.date.localeCompare(b.date));
  const first = existing[0];
  return {
    start: first?.start || '15:00', end: first?.end || '18:00',
    capacity: existing.length ? Math.min(...existing.map(p => Math.min(p.capacity, p.dailyCapacity ?? p.capacity))) : 12,
    // Per-product overrides belong to their date. New weeks use each product's
    // current production capacity rather than inheriting a one-day exception.
    productionLimits: {},
  };
}

export function calendarPickups(document, now = Date.now(), ledger = { orders: [] }) {
  const pickups = clone(document.pickups), schedule = pickupSchedule(document), today = storeDay(now);
  const dates = new Set(pickups.map(p => p.date));
  // Nine calendar weeks guarantee at least eight weeks beyond the first cutoff.
  for (let i = 0; i <= 63; i++) {
    const date = addCalendarDays(today, i);
    if (![3, 4, 5].includes(new Date(date + 'T12:00:00Z').getUTCDay()) || dates.has(date)) continue;
    pickups.push({ id: 'recurring-' + date, date, ...clone(schedule), dailyCapacity: schedule.capacity, ...orderingDeadline(date), closed: false, automatic: true });
    dates.add(date);
  }
  // Generated windows live in order snapshots once booked. Keep them visible in
  // Studio history after the rolling horizon passes, without rewriting orders.
  const ids = new Set(pickups.map(p => p.id));
  for (const order of ledger.orders) {
    const pickup = order.originalPickup || order.pickup;
    if (pickup && !ids.has(pickup.id)) {
      pickups.push({ ...clone(pickup), closed: true }); ids.add(pickup.id);
    }
  }
  for (const pickup of pickups) {
    if (localInstant(pickup.date, pickup.end) <= now) continue;
    const deadline = orderingDeadline(pickup.date);
    // The confirmed policy applies to every future date, including legacy and
    // special windows. Stored history and existing order snapshots stay intact.
    Object.assign(pickup, deadline);
  }
  return pickups.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
}
