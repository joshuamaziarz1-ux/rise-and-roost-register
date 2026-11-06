import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./member-checkout-fixture.mjs";
import { weekStart, bookingSummary } from "../server/pickup-booking.mjs";
import {
  calendarPickups,
  addCalendarDays,
} from "../server/pickup-calendar.mjs";
import { orderAttention } from "../public/commerce.mjs";
const ok = (r) => assert.equal(r.status, 200, r.data.error);
async function setup() {
  const h = await fixture(),
    l = h.ledger();
  l.pickupBooking = { weeks: {}, dates: {}, closedDates: {} };
  h.putLedger(l);
  const d = (await h.snapshot()).published,
    p = calendarPickups(d, h.now).find(
      (p) =>
        !p.closed && Date.parse(p.cutoffDate + "T12:00:00Z") > h.now + 86400000,
    );
  const approve = () =>
    h.change("pickup-week", { week: weekStart(p.date), status: "approved" });
  return { ...h, p, approve };
}
const preview = (h, date = h.p.date) =>
  h.call(h.owner, "/api/manage/pickup-preview?date=" + date);
async function change(h, extra = {}) {
  const p = (await preview(h)).data;
  return h.change("pickup-change", {
    date: h.p.date,
    orderIds: p.orders.map((o) => o.id),
    confirmed: true,
    mode: "makeup",
    replacementDate: addCalendarDays(h.p.date, 3),
    start: "14:00",
    end: "17:00",
    message: "We need to move your pickup. Thank you for understanding.",
    reason: "illness-family",
    ...extra,
  });
}
function tracking(h, o) {
  const u = new URL(o.trackingPath, h.origin);
  return {
    path: u.pathname.replace("/orders/", "/api/order-tracking/"),
    headers: {
      Authorization:
        "Bearer " + new URLSearchParams(u.hash.slice(1)).get("access"),
    },
  };
}
test("approval gates public dates and direct requests; closing/reopening and visibility preserve rules", async () => {
  const h = await setup();
  assert.equal(
    (await h.call(h.guest, "/api/site")).data.document.pickups.length,
    0,
  );
  assert.equal((await h.order({ pickupId: h.p.id })).status, 409);
  ok(await h.approve());
  const site = (await h.call(h.guest, "/api/site")).data;
  assert.ok(site.document.pickups.length);
  assert.ok(
    site.document.pickups.every(
      (p) => weekStart(p.date) === weekStart(h.p.date),
    ),
  );
  ok(await h.change("pickup-visibility", { date: h.p.date, visible: false }));
  assert.ok(
    !(await h.call(h.guest, "/api/site")).data.document.pickups.some(
      (p) => p.date === h.p.date,
    ),
  );
  assert.equal((await h.order({ pickupId: h.p.id })).status, 409);
  ok(await h.change("pickup-visibility", { date: h.p.date, visible: true }));
  assert.equal((await h.order({ pickupId: h.p.id })).status, 201);
  const orders = structuredClone(h.ledger().orders);
  assert.equal(
    (
      await h.change("pickup-week", {
        week: weekStart(h.p.date),
        status: "closed",
      })
    ).status,
    409,
  );
  ok(
    await h.change("pickup-week", {
      week: weekStart(h.p.date),
      status: "closed",
      confirmExistingOrders: true,
    }),
  );
  assert.deepEqual(h.ledger().orders, orders);
  assert.equal((await h.order({ pickupId: h.p.id })).status, 409);
  ok(await h.approve());
  assert.equal((await h.order({ pickupId: h.p.id })).status, 201);
});
test("makeup closes original date; preserves money, credits and inventory; member and guest responses are private/versioned", async () => {
  const h = await setup();
  ok(await h.approve());
  ok(await h.enable());
  ok(await h.award());
  const member = (await h.order({ pickupId: h.p.id, creditCents: 200 })).data,
    guest = (await h.order({ pickupId: h.p.id }, h.guest)).data;
  const before = h.ledger(),
    r = await change(h);
  ok(r);
  const after = h.ledger();
  assert.equal(after.pickupChanges.length, 1);
  assert.ok(after.pickupBooking.closedDates[h.p.date]);
  assert.deepEqual(after.returnCredits, before.returnCredits);
  for (const o of after.orders) {
    const old = before.orders.find((v) => v.id === o.id);
    for (const key of [
      "total",
      "subtotal",
      "lines",
      "returnCredit",
      "paymentStatus",
      "pickupId",
      "trackingKey",
      "selectedPaymentMethod",
    ])
      assert.deepEqual(o[key], old[key], key);
    assert.deepEqual(o.originalPickup, old.pickup);
    assert.equal(o.pickupChange.acknowledgement, null);
    assert.equal(orderAttention(o, h.now + 400 * 86400000).overdue, false);
  }
  const t = tracking(h, guest),
    get = await h.call(h.guest, t.path, undefined, { headers: t.headers });
  ok(get);
  assert.ok(!JSON.stringify(get.data.pickupChange).includes("illness"));
  assert.equal(get.data.customer, undefined);
  const payload = {
    eventId: r.data.result.eventId,
    version: 1,
    response: "confirmed",
  };
  assert.equal(
    (await h.post(h.guest, t.path + "/pickup-response", payload)).status,
    401,
  );
  ok(
    await h.post(h.guest, t.path + "/pickup-response", payload, {
      headers: t.headers,
    }),
  );
  ok(
    await h.post(h.guest, t.path + "/pickup-response", payload, {
      headers: t.headers,
    }),
  );
  assert.equal(
    (
      await h.post(h.other, "/api/roost/pickup-response", {
        ...payload,
        orderId: member.id,
      })
    ).status,
    404,
  );
  ok(
    await h.post(h.member, "/api/roost/pickup-response", {
      ...payload,
      response: "alternate",
      orderId: member.id,
    }),
  );
  assert.equal(
    orderAttention(
      h.ledger().orders.find((o) => o.id === member.id),
      h.now,
    ).needsAttention,
    true,
  );
  const e = h.ledger().pickupChanges[0];
  ok(
    await h.change("pickup-contact", {
      eventId: e.id,
      eventVersion: 1,
      customerKey: e.contacts[0].key,
      method: "phone",
    }),
  );
  assert.equal(h.ledger().pickupChanges[0].contacts[0].history.length, 1);
  ok(
    await h.change("pickup-change-update", {
      eventId: e.id,
      eventVersion: 1,
      confirmed: true,
      mode: "makeup",
      replacementDate: addCalendarDays(h.p.date, 4),
      start: "14:00",
      end: "17:00",
      message: "A revised pickup appointment.",
      reason: "unexpected",
    }),
  );
  const latest = h.ledger();
  assert.equal(latest.pickupChanges[0].revisions.length, 2);
  assert.equal(latest.orders[0].pickupChange.acknowledgement, null);
  assert.ok(latest.orders[0].pickupChangeHistory[0].acknowledgement);
  assert.equal(
    (
      await h.post(h.guest, t.path + "/pickup-response", payload, {
        headers: t.headers,
      })
    ).status,
    409,
  );
  assert.equal(latest.pickupChanges[0].contacts[0].contactedVersion, 1);
  assert.ok(
    !(await h.call(h.guest, "/api/site")).data.document.pickups.some(
      (p) => p.makeupOnly,
    ),
  );
});
test("pending makeup preserves original appointment; excludes terminal orders; duplicate and rollback safeguards", async () => {
  const h = await setup();
  ok(await h.approve());
  const a = (await h.order({ pickupId: h.p.id })).data,
    b = (await h.order({ pickupId: h.p.id })).data;
  ok(await h.cancel(b));
  const p = (await preview(h)).data;
  assert.equal(p.orderCount, 1);
  const before = h.ledger();
  assert.equal((await change(h, { orderIds: [] })).status, 409);
  assert.equal(
    (await change(h, { replacementDate: "2026-02-30" })).status,
    400,
  );
  assert.deepEqual(h.ledger(), before);
  const operationId = crypto.randomUUID();
  ok(await change(h, { mode: "pending", operationId }));
  const l = h.ledger(),
    o = l.orders.find((o) => o.id === a.id);
  assert.deepEqual(o.pickup, before.orders.find((o) => o.id === a.id).pickup);
  assert.equal(o.pickupDeadline, null);
  assert.equal(o.pickupChange.replacement, null);
  assert.deepEqual(
    l.orders.find((o) => o.id === b.id),
    before.orders.find((o) => o.id === b.id),
  );
  const e = l.pickupChanges[0],
    update = {
      eventId: e.id,
      eventVersion: 1,
      confirmed: true,
      mode: "pending",
      message: "Still awaiting a date.",
      reason: "unexpected",
    };
  h.sql.exec(
    "CREATE TRIGGER synthetic_failure BEFORE UPDATE OF ledger_json ON workspaces BEGIN SELECT RAISE(ABORT,'synthetic rollback'); END",
  );
  assert.equal((await h.change("pickup-change-update", update)).status, 500);
  assert.deepEqual(h.ledger(), l);
});
test("owner-only and CSRF, stale review, date validation and audit", async () => {
  const h = await setup();
  for (const a of [
    "pickup-week",
    "pickup-change",
    "pickup-contact",
    "pickup-visibility",
  ]) {
    assert.equal(
      (
        await h.post(h.guest, "/api/manage/" + a, {
          operationId: crypto.randomUUID(),
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await h.post(
          h.owner,
          "/api/manage/" + a,
          { operationId: crypto.randomUUID() },
          { headers: { Origin: "https://evil.test" } },
        )
      ).status,
      403,
    );
  }
  assert.equal(
    (await h.change("pickup-week", { week: "2026-02-30", status: "approved" }))
      .status,
    400,
  );
  assert.equal(
    (
      await h.change("pickup-week", {
        week: weekStart(h.p.date),
        status: "approved",
        ledgerVersion: 0,
      })
    ).status,
    409,
  );
  ok(await h.approve());
  assert.ok(h.ledger().management.audit.some((a) => a.kind === "pickup-week"));
});
test("dashboard differentiates approval, closed schedule, deadlines and global pause", async () => {
  const h = await setup(),
    d = (await h.snapshot()).published;
  let b = bookingSummary(d, h.ledger(), h.now, false, 0);
  assert.match(b.message, /waiting for approval/);
  assert.match(bookingSummary(d, h.ledger(), h.now, true, 0).message, /paused/);
  ok(await h.approve());
  b = bookingSummary(d, h.ledger(), h.now, false, 2);
  assert.match(b.message, /Only one/);
  const closed = {
    ...d,
    pickups: [],
    pickupSchedule: { capacity: 0, start: "15:00", end: "18:00" },
  };
  const l = h.ledger();
  for (const p of calendarPickups(closed, h.now))
    l.pickupBooking.closedDates[p.date] = true;
  assert.match(
    bookingSummary(closed, l, h.now, false, 0).message,
    /No eligible/,
  );
});
test("schedule confirmation retries and simultaneous writes create exactly one event and no notification duplication", async () => {
  const h = await setup();
  ok(await h.approve());
  await h.order({ pickupId: h.p.id });
  const p = (await preview(h)).data,
    s = await h.snapshot(),
    body = {
      workspaceId: h.site.id,
      operationId: crypto.randomUUID(),
      ledgerVersion: s.ledgerVersion,
      date: h.p.date,
      orderIds: p.orders.map((o) => o.id),
      mode: "pending",
      message: "Please await a makeup date.",
      reason: "unexpected",
      confirmed: true,
    };
  const rs = await Promise.all([
    h.post(h.owner, "/api/manage/pickup-change", body),
    h.post(h.owner, "/api/manage/pickup-change", body),
  ]);
  assert.ok(rs.some((r) => r.status === 200));
  ok(await h.post(h.owner, "/api/manage/pickup-change", body));
  const l = h.ledger();
  assert.equal(l.pickupChanges.length, 1);
  assert.equal(l.orders[0].pickupChangeHistory.length, 0);
  assert.equal(l.pickupChanges[0].contacts.length, 1);
  assert.equal(l.pickupChanges[0].contacts[0].history.length, 0);
  assert.ok(
    !(l.orders[0].notifications || []).some((n) => n.event === "pickup-change"),
  );
  assert.equal(
    (
      await h.post(h.owner, "/api/manage/pickup-change", {
        ...body,
        message: "A different message",
      })
    ).status,
    409,
  );
});
test("approval never overrides a closed date or deadline, and makeup preserves unpaid cash and credit reservations", async () => {
  const h = await setup();
  ok(await h.approve());
  ok(await h.change("cash-settings", { enabled: true }));
  ok(await h.enable());
  ok(await h.award());
  const o = (
    await h.order({
      pickupId: h.p.id,
      paymentMethod: "cash_pickup",
      creditCents: 200,
    })
  ).data;
  const balance = h.balance();
  ok(await change(h));
  const changed = h.ledger().orders.find((v) => v.id === o.id);
  assert.equal(changed.paymentStatus, "awaiting_cash");
  assert.equal(changed.paymentVerifiedAt, undefined);
  assert.deepEqual(h.balance(), balance);
  const later = h.now + 400 * 86400000;
  h.sql.prepare("UPDATE sessions SET expires=?").run(later + 86400000);
  assert.equal(
    (
      await h.change(
        "cash-unpaid",
        {
          id: o.id,
          orderVersion: changed.version,
          amount: changed.total,
          confirmed: true,
          reason: "Owner delay is protected",
        },
        { now: later },
      )
    ).status,
    409,
  ); // the owner cannot impose a missed-pickup penalty for an owner delay
  const d = (await h.snapshot()).published;
  const p = calendarPickups(d, h.now).find((p) => p.id === h.p.id);
  ok(
    await h.change("calendar-date", {
      revision: (await h.snapshot()).revision,
      pickup: { ...p, closed: true },
      confirmExistingOrders: true,
    }),
  );
  ok(await h.change("pickup-visibility", { date: h.p.date, visible: true }));
  assert.equal((await h.order({ pickupId: h.p.id }, h.other)).status, 409);
});
test("week boundaries follow Indiana calendar dates across year and DST changes", () => {
  assert.equal(weekStart("2027-01-03"), "2026-12-28");
  assert.equal(weekStart("2027-01-04"), "2027-01-04");
  assert.equal(weekStart("2026-11-01"), "2026-10-26");
  assert.equal(weekStart("2026-11-02"), "2026-11-02");
});
test("one-time transition preserves only two eligible weeks and cannot be repeated or advance on reads", async () => {
  const { approvalTransition } =
    await import("../server/pickup-approval-transition.mjs");
  const h = await fixture(),
    doc = (await h.snapshot()).published,
    l = h.ledger(),
    before = JSON.stringify(l),
    booking = approvalTransition(doc, l, h.now, { id: "synthetic-transition" });
  assert.equal(Object.keys(booking.weeks).length, 2);
  assert.equal(JSON.stringify(l), before);
  assert.ok(booking.transition.preservedDates.length >= 3);
  l.pickupBooking = booking;
  assert.throws(
    () => approvalTransition(doc, l, h.now, { id: "synthetic" }),
    /already exists/,
  );
  const s = bookingSummary(doc, l, h.now + 50 * 86400000, false, 0);
  assert.equal(s.approved.length, 0);
  assert.equal(Object.keys(l.pickupBooking.weeks).length, 2);
});
test("approved date still closes exactly at its ordering deadline", async () => {
  const { quote } = await import("../server/service.mjs");
  const { localInstant } = await import("../public/model.mjs");
  const h = await setup();
  ok(await h.approve());
  const doc = (await h.snapshot()).published,
    p = calendarPickups(doc, h.now).find((p) => p.id === h.p.id),
    product = doc.products[0],
    input = {
      pickupId: p.id,
      total: product.price,
      lines: [
        {
          productId: product.id,
          variantId: product.variants[0].id,
          qty: 1,
          unitPrice: product.price,
        },
      ],
    };
  const cutoff = localInstant(p.cutoffDate, p.cutoffTime);
  assert.equal(
    quote(doc, h.ledger(), input, cutoff - 1, { recurring: true }).pickup.id,
    p.id,
  );
  assert.throws(
    () => quote(doc, h.ledger(), input, cutoff, { recurring: true }),
    /deadline/,
  );
  assert.throws(
    () => quote(doc, h.ledger(), input, cutoff + 1, { recurring: true }),
    /deadline/,
  );
});
