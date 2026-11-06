import { localInstant, clone } from "../public/model.mjs";
import { pickupDeadline } from "../public/commerce.mjs";
import { calendarPickups, storeDay } from "./pickup-calendar.mjs";
import { bookingAllowed, weekStart } from "./pickup-booking.mjs";
const bad = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
export const neutralMessage =
  "Something unexpected has come up, and we need to reschedule your pickup. We're sorry for the inconvenience and appreciate your understanding.";
export function validDay(day) {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day || "")) throw Error();
    localInstant(day, "12:00");
  } catch {
    bad("Choose a valid calendar date.");
  }
  return day;
}
export const affectedOrders = (ledger, date) =>
  ledger.orders.filter(
    (o) =>
      o.pickup.date === date &&
      !o.resolution &&
      ["pending", "preparing", "ready"].includes(o.status),
  );
const customerKey = (o) =>
  o.customer?.memberId ||
  o.customer?.email?.toLowerCase() ||
  o.customer?.phone ||
  o.id;
export function changePreview(doc, ledger, date, now) {
  validDay(date);
  const orders = affectedOrders(ledger, date),
    windows = calendarPickups(doc, now, ledger, {
      includeHistory: true,
    }).filter((p) => p.date === date);
  return {
    date,
    orders,
    orderCount: orders.length,
    customerCount: new Set(orders.map(customerKey)).size,
    windows,
    openForBookings:
      !doc.orderingPaused &&
      windows.some(
        (p) =>
          !p.closed &&
          bookingAllowed(ledger, p) &&
          localInstant(p.cutoffDate, p.cutoffTime) > now,
      ),
    manualReview: orders
      .filter((o) => o.dispute?.open || o.contact?.unresolved)
      .map((o) => o.id),
    notificationMethods: [
      "Secure order page",
      "Direct contact recorded by Danielle",
    ],
  };
}
export function managePickup({ action, input, ledger, published, now, actor }) {
  ledger.pickupBooking ||= { weeks: {}, dates: {}, closedDates: {} };
  const b = ledger.pickupBooking;
  b.weeks ||= {};
  b.dates ||= {};
  b.closedDates ||= {};
  const at = new Date(now).toISOString();
  if (action === "pickup-week") {
    validDay(input.week);
    if (
      weekStart(input.week) !== input.week ||
      !["approved", "closed"].includes(input.status)
    )
      bad("Choose a Monday week and approval status.");
    if (
      input.status === "closed" &&
      ledger.orders.some((o) => weekStart(o.pickup.date) === input.week) &&
      input.confirmExistingOrders !== true
    )
      bad(
        "This week has existing customer orders. Closing it will prevent new bookings but will not cancel or move existing orders.",
        409,
      );
    b.weeks[input.week] = { status: input.status, at, actor };
    return { week: input.week, status: input.status };
  }
  if (action === "pickup-visibility") {
    validDay(input.date);
    if (typeof input.visible !== "boolean")
      bad("Choose Show at Checkout: Yes / No.");
    b.dates[input.date] = input.visible;
    if (input.visible) delete b.closedDates[input.date];
    return { date: input.date, visible: input.visible };
  }
  ledger.pickupChanges ||= [];
  if (action === "pickup-contact") {
    const event = ledger.pickupChanges.find((e) => e.id === input.eventId),
      c = event?.contacts.find((c) => c.key === input.customerKey);
    if (!c || input.eventVersion !== event.version)
      bad("Refresh this schedule change before recording contact.", 409);
    if (
      !["phone", "email", "text", "in-person", "other"].includes(input.method)
    )
      bad("Choose the contact method you used.");
    c.history.push({ method: input.method, at, actor, version: event.version });
    c.contactedVersion = event.version;
    return { eventId: event.id, customerKey: c.key };
  }
  if (
    !["pickup-change", "pickup-change-update"].includes(action) ||
    input.confirmed !== true
  )
    bad("Review and confirm the pickup schedule change.");
  if (
    typeof input.message !== "string" ||
    !input.message.trim() ||
    input.message.length > 2000
  )
    bad("Write a customer message of 1–2,000 characters.");
  if (!["unexpected", "illness-family", "other"].includes(input.reason))
    bad("Choose a reason for internal records.");
  if (!["makeup", "pending"].includes(input.mode))
    bad("Choose a makeup date or Date To Be Announced.");
  let replacement = null;
  if (input.mode === "makeup") {
    validDay(input.replacementDate);
    try {
      if (
        input.replacementDate < storeDay(now) ||
        localInstant(input.replacementDate, input.end) <=
          localInstant(input.replacementDate, input.start) ||
        localInstant(input.replacementDate, input.start) <= now
      )
        throw Error();
    } catch {
      bad("Choose a future makeup date and a valid pickup time window.");
    }
    replacement = {
      id: "makeup-" + input.operationId,
      date: input.replacementDate,
      start: input.start,
      end: input.end,
      closed: true,
      makeupOnly: true,
    };
  }
  let event, orders;
  if (action === "pickup-change-update") {
    event = ledger.pickupChanges.find((e) => e.id === input.eventId);
    if (!event || event.version !== input.eventVersion)
      bad("This schedule change was updated. Refresh and review it.", 409);
    orders = ledger.orders.filter(
      (o) =>
        o.pickupChange?.eventId === event.id &&
        !o.resolution &&
        ["pending", "preparing", "ready"].includes(o.status),
    );
    if (!orders.length)
      bad("No eligible orders remain in this schedule change.", 409);
    event.version++;
  } else {
    validDay(input.date);
    if (replacement?.date === input.date)
      bad("Choose a different makeup date.");
    orders = affectedOrders(ledger, input.date);
    if (!orders.length)
      bad("There are no eligible orders on this pickup date.", 409);
    if (
      !Array.isArray(input.orderIds) ||
      JSON.stringify(input.orderIds.slice().sort()) !==
        JSON.stringify(orders.map((o) => o.id).sort())
    )
      bad("Affected orders changed. Preview and review them again.", 409);
    event = {
      id: input.operationId,
      originalDate: input.date,
      version: 1,
      createdAt: at,
      actor,
      revisions: [],
      contacts: [],
    };
    ledger.pickupChanges.unshift(event);
  }
  b.closedDates[event.originalDate] = { at, actor, eventId: event.id };
  event.message = input.message.trim();
  event.reason = input.reason;
  event.replacement = replacement;
  event.updatedAt = at;
  event.revisions.push({
    version: event.version,
    at,
    actor,
    message: event.message,
    reason: event.reason,
    replacement: clone(replacement),
    orderIds: orders.map((o) => o.id),
  });
  for (const o of orders) {
    o.pickupChangeHistory ||= [];
    if (o.pickupChange) o.pickupChangeHistory.push(clone(o.pickupChange));
    const previous = {
      pickup: clone(o.pickup),
      pickupDeadline: o.pickupDeadline ?? null,
    };
    o.originalPickup ||= clone(o.pickup);
    // Keep pickupId and originalPickup for inventory reservations; never add a makeup to the ordinary schedule.
    if (replacement) {
      o.pickup = clone(replacement);
      o.pickupDeadline = pickupDeadline(
        replacement,
        ledger.management?.settings?.calendar,
      );
    } else o.pickupDeadline = null;
    o.pickupChange = {
      eventId: event.id,
      version: event.version,
      originalDate: event.originalDate,
      replacement: clone(replacement),
      message: event.message,
      at,
      acknowledgement: null,
      previous,
      forfeitureProtected: true,
    };
    o.version = (o.version || 1) + 1;
    o.audit ||= [];
    o.audit.push({
      action: "Owner initiated pickup schedule change",
      at,
      actor,
      eventId: event.id,
      version: event.version,
    });
    const key = customerKey(o);
    if (!event.contacts.some((c) => c.key === key))
      event.contacts.push({
        key,
        orderIds: [],
        history: [],
        contactedVersion: null,
      });
    const c = event.contacts.find((c) => c.key === key);
    if (!c.orderIds.includes(o.id)) c.orderIds.push(o.id);
  }
  return {
    eventId: event.id,
    version: event.version,
    affectedOrders: orders.length,
  };
}
export function acknowledgePickup(o, input, now, actor) {
  const c = o.pickupChange;
  if (
    !c ||
    !c.replacement ||
    c.eventId !== input.eventId ||
    c.version !== input.version ||
    !["confirmed", "alternate"].includes(input.response)
  )
    bad("This notice changed. Refresh and review the proposed pickup.", 409);
  if (o.resolution || ["canceled", "picked-up"].includes(o.status))
    bad("This order is no longer awaiting a response.", 409);
  if (c.acknowledgement?.response === input.response) return false;
  if (c.acknowledgement)
    bad("Your response is recorded. Contact Danielle to change it.", 409);
  const at = new Date(now).toISOString();
  c.acknowledgement = { response: input.response, at };
  o.audit ||= [];
  o.audit.push({
    action: "Customer pickup response: " + input.response,
    eventId: c.eventId,
    version: c.version,
    at,
    actor,
  });
  return true;
}
