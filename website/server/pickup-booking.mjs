import {
  calendarPickups,
  storeDay,
  addCalendarDays,
} from "./pickup-calendar.mjs";
import { localInstant } from "../public/model.mjs";
export const weekStart = (date) =>
  addCalendarDays(date, -((new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7));
// Legacy beta workspaces keep their behavior; production requires an audited transition.
export const bookingAllowed = (ledger, p) =>
  !ledger.pickupBooking ||
  (ledger.pickupBooking.weeks?.[weekStart(p.date)]?.status === "approved" &&
    ledger.pickupBooking.dates?.[p.date] !== false &&
    !ledger.pickupBooking.closedDates?.[p.date]);
export function bookingSummary(
  doc,
  ledger,
  now,
  paused = doc.orderingPaused,
  bookableDates = 0,
) {
  const first = weekStart(storeDay(now)),
    pickups = calendarPickups(doc, now, ledger);
  const weeks = Array.from({ length: 10 }, (_, i) => {
    const start = addCalendarDays(first, i * 7),
      end = addCalendarDays(start, 6),
      dates = pickups.filter(
        (p) => weekStart(p.date) === start && localInstant(p.date, p.end) > now,
      );
    const scheduled = dates.filter(
        (p) =>
          !p.closed &&
          !ledger.pickupBooking?.closedDates?.[p.date] &&
          ledger.pickupBooking?.dates?.[p.date] !== false,
      ),
      eligible = scheduled.filter(
        (p) => localInstant(p.cutoffDate, p.cutoffTime) > now,
      );
    return {
      start,
      end,
      status: ledger.pickupBooking?.weeks?.[start]?.status || "unapproved",
      dates,
      eligibleDates: new Set(eligible.map((p) => p.date)).size,
      scheduledDates: new Set(scheduled.map((p) => p.date)).size,
      orders: ledger.orders.filter((o) => weekStart(o.pickup.date) === start)
        .length,
    };
  });
  const approved = weeks.filter(
      (w) => w.status === "approved" && w.eligibleDates > 0,
    ),
    next = weeks.find((w) => w.status !== "approved" && w.eligibleDates > 0);
  if (paused) bookableDates = 0;
  const message = paused
    ? "Online ordering is paused. Week approvals do not activate ordering."
    : !bookableDates
      ? "No future pickup dates are currently open for ordering. " +
        (approved.length
          ? "Approved weeks have eligible dates, but product availability or capacity currently prevents booking."
          : next
            ? "Upcoming weeks are waiting for approval."
            : weeks.some((w) => w.scheduledDates > 0)
              ? "Ordering deadlines have passed or capacity and product limits apply."
              : "No eligible pickup dates are scheduled.")
      : approved.length < 2
        ? "Only one upcoming pickup week is approved. Review your next pickup weeks so customers can continue placing orders."
        : "";
  return {
    weeks,
    approved: approved.map((w) => w.start),
    nextUnapproved: next?.start || null,
    bookableDates,
    paused,
    message,
  };
}
