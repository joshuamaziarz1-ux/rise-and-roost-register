import { test, expect } from "@playwright/test";
import { primaryFixture } from "../primary-fixture.mjs";
import { mkdir } from "node:fs/promises";
import { weekStart } from "../../server/pickup-booking.mjs";
import { addCalendarDays } from "../../server/pickup-calendar.mjs";
import { POLICY_VERSION } from "../../public/commerce.mjs";
let f;
test.beforeEach(async () => {
  f = await primaryFixture({
    experience: true,
    management: true,
    commerce: true,
    readyPayments: true,
    hostname: "localhost",
    port: 4213,
  });
});
test.afterEach(async () => {
  await f?.close();
});
test("owner approval, date visibility, emergency preview and guest acknowledgement", async ({
  page,
  browser,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const ctx = await browser.newContext({
    ...info.project.use,
    baseURL: f.origin,
  });
  try {
    expect(
      (
        await ctx.request.post(f.origin + "/api/login", {
          headers: { Origin: f.origin },
          data: { id: f.id, accessKey: f.key },
        })
      ).status(),
    ).toBe(200);
    const snapshot = async () =>
      (await ctx.request.get(f.origin + "/api/manage/snapshot")).json();
    const mutate = async (action, payload) => {
      const s = await snapshot();
      const r = await ctx.request.post(f.origin + "/api/manage/" + action, {
        headers: { Origin: f.origin },
        data: {
          operationId: crypto.randomUUID(),
          ledgerVersion: s.ledgerVersion,
          ...payload,
        },
      });
      expect(r.status(), await r.text()).toBe(200);
      return r.json();
    };
    let site = await (await page.request.get(f.origin + "/api/site")).json(),
      pickup = site.document.pickups[0];
    await mutate("pickup-week", {
      week: weekStart(pickup.date),
      status: "closed",
    });
    const studio = await ctx.newPage();
    studio.on("pageerror", (e) => errors.push(e.message));
    await studio.goto(f.origin + "/studio");
    await expect(
      studio.getByRole("heading", {
        name: "Upcoming Pickup Weeks",
        exact: true,
      }),
    ).toBeVisible();
    await studio
      .getByRole("button", { name: "Review Upcoming Weeks", exact: true })
      .click();
    await expect(
      studio.getByRole("heading", {
        name: "Customer Booking Approval",
        exact: true,
      }),
    ).toBeVisible();
    const week = studio.locator(".ms-panel").filter({
      has: studio.getByRole("heading", {
        name:
          weekStart(pickup.date) +
          " through " +
          addCalendarDays(weekStart(pickup.date), 6),
        exact: true,
      }),
    });
    await week
      .getByRole("button", { name: "Reopen / Approve Week", exact: true })
      .click();
    await expect(
      week.getByRole("button", { name: "Approve Week", exact: true }),
    ).toBeDisabled();
    await mkdir("qa-results/pickup-approvals", { recursive: true });
    await studio.screenshot({
      path: `qa-results/pickup-approvals/weeks-${info.project.name}.png`,
      fullPage: true,
      scale: "css",
    });
    site = await (await page.request.get(f.origin + "/api/site")).json();
    expect(
      site.document.pickups.every(
        (p) => weekStart(p.date) === weekStart(pickup.date),
      ),
    ).toBe(true);
    await mutate("pickup-visibility", { date: pickup.date, visible: false });
    expect(
      (
        await (await page.request.get(f.origin + "/api/site")).json()
      ).document.pickups.some((p) => p.date === pickup.date),
    ).toBe(false);
    await mutate("pickup-visibility", { date: pickup.date, visible: true });
    const product = site.document.products[0],
      placed = await page.request.post(f.origin + "/api/orders", {
        headers: { Origin: f.origin },
        data: {
          workspaceId: f.id,
          revision: site.revision,
          requestId: crypto.randomUUID(),
          pickupId: pickup.id,
          checkoutMode: "guest",
          customerDetails: {
            name: "Synthetic Pickup Neighbor",
            phone: "555 010 0100",
          },
          policyAccepted: true,
          policyVersion: POLICY_VERSION,
          total: product.price,
          lines: [
            {
              productId: product.id,
              variantId: product.variants[0].id,
              qty: 1,
              unitPrice: product.price,
            },
          ],
        },
      });
    expect(placed.status(), await placed.text()).toBe(201);
    const order = await placed.json();
    await studio.reload();
    await expect(studio.locator(".management")).toBeVisible();
    const home = studio
      .locator(".ms-sidebar")
      .getByRole("button", { name: "Home", exact: true });
    if (await home.isVisible()) await home.click();
    else
      await studio
        .locator(".ms-bottom")
        .getByRole("button", { name: "Home", exact: true })
        .click();
    await studio
      .getByRole("button", { name: "Pickup Schedule Changes", exact: true })
      .click();
    await studio
      .getByLabel("Original pickup date", { exact: true })
      .fill(pickup.date);
    await studio
      .getByRole("button", { name: "Preview affected orders", exact: true })
      .click();
    await expect(
      studio.getByRole("heading", {
        name: "Review Pickup Schedule Change",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      studio.getByText(/1 affected orders · 1 customers/),
    ).toBeVisible();
    await studio
      .getByLabel("Makeup pickup date (for Set a Makeup Date)", { exact: true })
      .fill(addCalendarDays(pickup.date, 3));
    await studio
      .getByLabel(
        "I reviewed these orders, pickup arrangement and customer message and confirm the change",
      )
      .check();
    await studio.screenshot({
      path: `qa-results/pickup-approvals/review-${info.project.name}.png`,
      fullPage: true,
      scale: "css",
    });
    await studio
      .getByRole("button", {
        name: "Confirm pickup schedule change",
        exact: true,
      })
      .click();
    await expect(
      studio.getByRole("heading", {
        name: "Pickup Schedule Changes",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      studio.getByText("Needs direct contact", { exact: true }),
    ).toBeVisible();
    await page.goto(f.origin + order.trackingPath);
    await expect(
      page.getByRole("heading", {
        name: "Your Pickup Date Has Changed",
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: `qa-results/pickup-approvals/notice-${info.project.name}.png`,
      fullPage: true,
      scale: "css",
    });
    await page
      .getByRole("button", {
        name: "The new pickup day works for me.",
        exact: true,
      })
      .click();
    await expect(
      page.getByText("You confirmed the new pickup day.", { exact: true }),
    ).toBeVisible();
    await studio.reload();
    await expect(studio.locator(".management")).toBeVisible();
    await studio
      .getByRole("button", { name: "Pickup Schedule Changes", exact: true })
      .click();
    await expect(studio.getByText(/1 orders · 1 confirmed/)).toBeVisible();
    await studio
      .getByRole("button", { name: "Mark customer contacted", exact: true })
      .click();
    await expect(
      studio.getByText("Contact recorded for this notice.", { exact: true }),
    ).toBeVisible();
    expect(
      await studio.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
  }
});

test("member sees pending makeup in Roost, then requests another arrangement on revised notice", async ({
  page,
  browser,
}, info) => {
  const { installTestPasskey } = await import("../install-test-passkey.mjs");
  await installTestPasskey(page, info, f.origin);
  await page.goto(f.origin + "/roost");
  await page.getByRole('button', { name: 'Join The Roost', exact: true }).click();
  await page
    .getByLabel("Name", { exact: true })
    .fill("Synthetic Makeup Member");
  await page
    .getByRole("button", { name: "Create My Account", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "I saved my recovery key" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "I saved my recovery key" }).click();
  const ctx = await browser.newContext({
    ...info.project.use,
    baseURL: f.origin,
  });
  try {
    expect(
      (
        await ctx.request.post(f.origin + "/api/login", {
          headers: { Origin: f.origin },
          data: { id: f.id, accessKey: f.key },
        })
      ).status(),
    ).toBe(200);
    const mutate = async (action, payload) => {
      const s = await (
        await ctx.request.get(f.origin + "/api/manage/snapshot")
      ).json();
      const r = await ctx.request.post(f.origin + "/api/manage/" + action, {
        headers: { Origin: f.origin },
        data: {
          operationId: crypto.randomUUID(),
          ledgerVersion: s.ledgerVersion,
          ...payload,
        },
      });
      expect(r.status(), await r.text()).toBe(200);
      return r.json();
    };
    const site = await (await page.request.get(f.origin + "/api/site")).json(),
      pickup = site.document.pickups[0],
      p = site.document.products[0];
    await mutate("pickup-week", {
      week: weekStart(pickup.date),
      status: "approved",
    });
    const placed = await page.request.post(f.origin + "/api/orders", {
      headers: { Origin: f.origin },
      data: {
        workspaceId: f.id,
        revision: site.revision,
        requestId: crypto.randomUUID(),
        pickupId: pickup.id,
        checkoutMode: "member",
        customerDetails: { name: "Synthetic Makeup Member" },
        policyAccepted: true,
        policyVersion: POLICY_VERSION,
        total: p.price,
        lines: [
          {
            productId: p.id,
            variantId: p.variants[0].id,
            qty: 1,
            unitPrice: p.price,
          },
        ],
      },
    });
    expect(placed.status(), await placed.text()).toBe(201);
    const o = await placed.json();
    const pending = await mutate("pickup-change", {
      date: pickup.date,
      orderIds: [o.id],
      mode: "pending",
      reason: "unexpected",
      message: "Please await your makeup date. Thank you!",
      confirmed: true,
    });
    await page.reload();
    await expect(
      page.getByRole("heading", {
        name: "Pickup schedule update",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Your Pickup Date Has Changed",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Date To Be Announced · Awaiting a makeup date", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "The new pickup day works for me.",
        exact: true,
      }),
    ).toHaveCount(0);
    const e = pending.management.pickupChanges[0];
    await mutate("pickup-change-update", {
      eventId: e.id,
      eventVersion: 1,
      mode: "makeup",
      replacementDate: addCalendarDays(pickup.date, 4),
      start: "13:00",
      end: "15:00",
      reason: "unexpected",
      message: "Here is your proposed makeup appointment.",
      confirmed: true,
    });
    await page.reload();
    await page
      .getByRole("button", {
        name: "I need a different arrangement.",
        exact: true,
      })
      .click();
    await expect(
      page.getByText(/Danielle has been asked to help/),
    ).toBeVisible();
    const s = await (
      await ctx.request.get(f.origin + "/api/manage/snapshot")
    ).json();
    expect(s.orders[0].pickupChange.acknowledgement.response).toBe("alternate");
    expect(s.orders[0].attention.needsAttention).toBe(true);
    expect(s.management.pickupChanges[0].revisions).toHaveLength(2);
    await page.screenshot({
      path: `qa-results/pickup-approvals/member-${info.project.name}.png`,
      fullPage: true,
      scale: "css",
    });
  } finally {
    await ctx.close();
  }
});
