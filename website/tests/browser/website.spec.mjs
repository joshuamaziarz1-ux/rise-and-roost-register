import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ "CF-Connecting-IP": randomUUID() });
});
async function owner(page) {
  await page.goto("/studio");
  await page.getByRole("button", { name: "Create my private demo" }).click();
  await expect(page.locator(".private-credentials")).toBeVisible();
  const id = await page
    .getByLabel("Workspace ID", { exact: true })
    .inputValue();
  const accessKey = await page
    .getByLabel("Private access key", { exact: true })
    .inputValue();
  await page.getByRole("button", { name: "I saved my access key" }).click();
  return { id, accessKey };
}
async function save(page) {
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.locator("#saved-status")).toHaveText("Draft saved");
}
async function publish(page) {
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Publish demo", exact: true }).click();
  await expect(page.locator("#saved-status")).toHaveText("Draft saved");
  await expect(page.locator("#notice")).toContainText("Published");
}
const nav = (page, label) =>
  page
    .getByRole("navigation", { name: "Studio navigation" })
    .getByRole("button", { name: label, exact: true });

test("responsive public pages, links, products, and empty basket load without browser errors", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const path of [
    "/",
    "/shop",
    "/about",
    "/visit",
    "/contact",
    "/terms",
    "/cart",
    "/product/bread",
  ]) {
    const response = await page.goto(path);
    expect(response.status()).toBe(200);
    await expect(page.locator(".site-header")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A little homemade. A lot of heart." }),
  ).toBeVisible();
  expect(
    await page.locator("h1").evaluate((el) => getComputedStyle(el).fontFamily),
  ).toContain("Georgia");
  expect(
    await page
      .locator(".announcement")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(62, 89, 70)");
  await mkdir("docs/screenshots", { recursive: true });
  if (["desktop-chromium", "iphone-webkit"].includes(info.project.name))
    await page.screenshot({
      path: `docs/screenshots/${info.project.name}-default.png`,
      fullPage: true,
    });
  expect(errors).toEqual([]);
});

test("first-run Studio edits draft, previews, publishes across contexts, and restores a version", async ({
  page,
  browser,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const { id, accessKey } = await owner(page);
  await expect(
    page.getByRole("heading", { name: "Welcome, Danielle." }),
  ).toBeVisible();
  const otherContext = await browser.newContext({
    ...info.project.use,
    extraHTTPHeaders: { "CF-Connecting-IP": randomUUID() },
  });
  const visitor = await otherContext.newPage();
  await visitor.goto("/demo/" + id);
  const original = await visitor.locator("h1").innerText();
  await nav(page, "Website · Simple Edit").click();
  await page
    .getByLabel("Heading", { exact: true })
    .fill("Fresh beginnings with Danielle.");
  await save(page);
  await expect(visitor.locator("h1")).toHaveText(original);
  await page.getByRole("button", { name: "Preview link", exact: true }).click();
  const previewLink = await page
    .getByLabel("Shareable draft preview link")
    .inputValue();
  const draft = await otherContext.newPage();
  await draft.goto(previewLink);
  await expect(draft.locator("h1")).toHaveText(
    "Fresh beginnings with Danielle.",
  );
  await expect(draft.locator(".demo-bar")).toContainText("UNPUBLISHED PREVIEW");
  // A separate Safari/Chrome context signs in without source, local storage, or developer tools.
  const secondOwner = await otherContext.newPage();
  await secondOwner.goto("/studio");
  await secondOwner.getByText("Return to an existing workspace").click();
  await secondOwner.getByLabel("Workspace ID", { exact: true }).fill(id);
  await secondOwner
    .getByLabel("Private access key", { exact: true })
    .fill(accessKey);
  await secondOwner
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await nav(secondOwner, "Website · Simple Edit").click();
  await expect(secondOwner.getByLabel("Heading", { exact: true })).toHaveValue(
    "Fresh beginnings with Danielle.",
  );
  await publish(page);
  await expect(visitor.locator("h1")).toHaveText(
    "Fresh beginnings with Danielle.",
    { timeout: 12000 },
  );
  if (info.project.name === "desktop-chromium") {
    await visitor.screenshot({
      path: "docs/screenshots/customized-published.png",
      fullPage: true,
    });
    await page.screenshot({
      path: "docs/screenshots/studio-simple-edit.png",
      fullPage: true,
    });
  }
  await nav(page, "Version History").click();
  page.once("dialog", (d) => d.accept());
  await page
    .locator(".sub-card")
    .filter({ hasText: "Farmhouse starter" })
    .getByRole("button", { name: "Restore this version" })
    .click();
  await expect(page.locator("#notice")).toContainText("restored");
  await visitor.reload();
  await expect(visitor.locator("h1")).toHaveText(original);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Welcome, Danielle." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await otherContext.close();
});

test("products, upload/crop, varieties, price, pickup cutoff, and simulated cart work together", async ({
  page,
}) => {
  const { id } = await owner(page);
  await nav(page, "Products").click();
  await page
    .getByLabel("Product name", { exact: true })
    .fill("Danielle’s demo loaf");
  await page
    .getByLabel("Product description", { exact: true })
    .fill("A sample description, made our own.");
  await page.getByLabel("Price ($)", { exact: true }).fill("11.50");
  // Generate a real image in-browser. Upload follows the same canvas re-encoding path as Finder.
  const bytes = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 400;
    c.height = 300;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#afc29e";
    ctx.fillRect(0, 0, 400, 300);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Replace photo 1", { exact: true }).setInputFiles({
    name: "owned-demo-photo.png",
    mimeType: "image/png",
    buffer: Buffer.from(bytes, "base64"),
  });
  await expect(page.locator("#notice")).toContainText("Photo uploaded");
  await page
    .getByLabel("Photo 1 alt text")
    .fill("Uploaded synthetic green image");
  await page.getByLabel("Crop horizontal (%)").fill("25");
  await save(page);
  await nav(page, "Pickup Schedule").click();
  const cutoff = page.getByLabel("Order-by time", { exact: true }).first();
  await cutoff.fill("17:30");
  await save(page);
  await publish(page);
  await page.goto("/demo/" + id + "/product/bread");
  await expect(page.locator("h1")).toHaveText("Danielle’s demo loaf");
  await expect(page.locator(".detail-price")).toHaveText("$11.50");
  await expect(page.locator(".detail-image")).toHaveAttribute(
    "alt",
    "Uploaded synthetic green image",
  );
  await page
    .getByRole("button", { name: "Add to basket", exact: true })
    .click();
  await page.locator(".basket-link").click();
  await page.getByLabel("Quantity Danielle’s demo loaf").fill("2");
  await page.getByLabel("Quantity Danielle’s demo loaf").press("Tab");
  const select = page.getByLabel("Choose your pickup", { exact: true });
  const value = await select
    .locator("option:not([disabled])")
    .nth(1)
    .getAttribute("value");
  await select.selectOption(value);
  await expect(page.locator(".deadline")).toContainText("17:30");
  await expect(page.locator(".total")).toContainText("$23.00");
  await page
    .getByRole("button", { name: "Request a demo preorder", exact: true })
    .click();
  await expect(page.locator(".receipt")).toContainText("no payment collected");
  await expect(page.locator(".receipt")).toContainText("$23.00");
});

test("page/section structure, undo, advanced design, and literal XSS text remain safe", async ({
  page,
}) => {
  await owner(page);
  await nav(page, "Website · Simple Edit").click();
  await page
    .getByLabel("Heading", { exact: true })
    .fill("<img src=x onerror=alert(1)> Our farm");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Heading", { exact: true })).toHaveValue(
    "A little homemade.\nA lot of heart.",
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await save(page);
  await page
    .getByRole("button", { name: "Duplicate section", exact: true })
    .click();
  await expect(page.locator(".section-row")).toHaveCount(5);
  await page.getByRole("button", { name: "Hide section", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Show section", exact: true }),
  ).toBeVisible();
  await page.getByText("Add a page", { exact: true }).click();
  await page.getByLabel("New page title").fill("Our garden");
  await page.getByLabel("New page path").fill("/garden");
  await page.getByRole("button", { name: "Add page", exact: true }).click();
  await page.getByRole("button", { name: "Add section", exact: true }).click();
  await page
    .getByLabel("Heading", { exact: true })
    .fill("A garden of good things");
  await save(page);
  await nav(page, "Advanced Design").click();
  await page
    .getByLabel("Heading font", { exact: true })
    .selectOption("Palatino");
  await page.getByLabel("Primary", { exact: true }).fill("#536b45");
  await page
    .getByLabel("Custom CSS (validated on save)")
    .fill("h1 { letter-spacing: -2px; }");
  await save(page);
  await expect(page.locator("#notice")).not.toHaveClass(/error/);
  await page
    .getByLabel("Custom CSS (validated on save)")
    .fill('@import "https://evil.test";');
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.locator("#notice")).toHaveClass(/error/);
  await expect(page.locator("#saved-status")).toHaveText("Unsaved draft");
});

test("protected Studio denies anonymous publishing and signout removes session access", async ({
  page,
  request,
}) => {
  const response = await request.post("/api/publish", {
    headers: { Origin: new URL(test.info().project.use.baseURL).origin },
    data: { revision: 1 },
  });
  expect(response.status()).toBe(401);
  await owner(page);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Create my private demo" }),
  ).toBeVisible();
  expect((await page.request.get("/api/studio")).status()).toBe(401);
});
