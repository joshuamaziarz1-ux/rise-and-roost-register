import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const baseURL = process.env.RR_BETA_BASE_URL || "http://127.0.0.1:4175";
if (
  process.env.RR_BETA_BASE_URL &&
  !["127.0.0.1", "localhost"].includes(new URL(baseURL).hostname) &&
  !(
    new URL(baseURL).protocol === "https:" &&
    new URL(baseURL).hostname.endsWith(".workers.dev")
  )
)
  throw new Error("Use an isolated HTTPS beta.");
await mkdir("docs/screenshots", { recursive: true });
const browser = await chromium.launch(
  existsSync("/usr/bin/chromium")
    ? { executablePath: "/usr/bin/chromium" }
    : {},
);
try {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(90000);
  page.setDefaultNavigationTimeout(90000);
  await page.goto("/");
  await page.locator(".site-header").waitFor();
  await page.screenshot({
    path: "docs/screenshots/desktop-storefront.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "docs/screenshots/mobile-storefront.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/studio");
  await page.getByRole("button", { name: "Create my private demo" }).click();
  await page.locator(".private-credentials").waitFor();
  const id = await page
    .getByLabel("Workspace ID", { exact: true })
    .inputValue();
  assert.match(id, /^[a-f0-9]{48}$/);
  // Never include the one-time owner credentials in evidence screenshots.
  await page.getByRole("button", { name: "I saved my access key" }).click();
  await page.frameLocator("iframe").locator(".site-header").waitFor();
  await page.screenshot({
    path: "docs/screenshots/desktop-studio.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Website · Simple Edit", exact: true })
    .click();
  await page
    .getByLabel("Heading", { exact: true })
    .fill("Fresh bakes.\nFamiliar faces.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector("#saved-status").textContent === "Draft saved",
  );
  await page
    .frameLocator("iframe")
    .locator("h1")
    .filter({ hasText: "Fresh bakes." })
    .waitFor();
  await page.screenshot({
    path: "docs/screenshots/studio-simple-edit.png",
    fullPage: true,
  });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Publish demo", exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector("#notice").textContent.startsWith("Published to"),
  );
  const visitor = await context.newPage();
  await visitor.goto("/demo/" + id);
  await visitor.locator("h1").filter({ hasText: "Fresh bakes." }).waitFor();
  await visitor.screenshot({
    path: "docs/screenshots/customized-published.png",
    fullPage: true,
  });
  await visitor.setViewportSize({ width: 390, height: 844 });
  await visitor.screenshot({
    path: "docs/screenshots/mobile-customized.png",
    fullPage: true,
  });
  console.log(
    "PASS: default desktop/mobile, Studio, live editing, and matching published screenshots captured without owner credentials",
  );
} finally {
  await browser.close();
}
