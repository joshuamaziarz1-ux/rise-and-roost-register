import { openAccountSettings, logOut } from '../account-settings-navigation.mjs';
import { test, expect } from "@playwright/test";
import { contactFixture } from "../contact-browser-fixture.mjs";
let f;
const password = "a friendly garden phrase";
test.beforeEach(async () => {
  f = await contactFixture({ email: true });
});
test.afterEach(async () => {
  await f?.close();
});
test("email registration, verification, sign-in, settings and reset work without browser authentication dialogs", async ({
  page,
}, info) => {
  const errors = [],
    ceremonies = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.url().includes("/api/roost/options")) ceremonies.push(r.url());
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "credentials", {
      value: {
        create() {
          throw Error("Unexpected prompt");
        },
        get() {
          throw Error("Unexpected prompt");
        },
      },
    });
  });
  await page.goto(f.origin + "/roost");
  await expect(
    page.getByRole("heading", { name: "Welcome to The Roost", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Email Address", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Username", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Create an Account", exact: true })
    .click();
  await page.getByLabel("Full Name", { exact: true }).fill("Friendly Neighbor");
  await page
    .getByLabel("Email Address", { exact: true })
    .fill("neighbor@example.test");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Show password", exact: true })
    .click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page
    .getByRole("button", { name: "Hide password", exact: true })
    .click();
  await page.screenshot({
    path: `qa-results/email-login/join-${info.project.name}.png`,
    fullPage: true,
    mask: [page.getByLabel("Password", { exact: true })],
  });
  await page
    .getByRole("button", { name: "Create an Account", exact: true })
    .first()
    .click();
  await expect(page.locator("main [role=status]")).toContainText(
    /Check your email/i,
  );
  expect(f.sql.prepare("SELECT COUNT(*) n FROM roost_members").get().n).toBe(0);
  await page.goto(f.origin + "/roost#auth=verify." + f.messages.at(-1).secret);

  await expect(page.locator("main [role=status]")).toContainText("Email Verified Successfully");
  expect(page.url()).not.toContain("#");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page
    .getByLabel("Email Address", { exact: true })
    .fill("neighbor@example.test");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Sign In", exact: true })
    .first()
    .click();
  await openAccountSettings(page);
  await expect(
    page.locator(".account-controls").getByText("neighbor@example.test", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Add a passkey on this device",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.reload();
  await openAccountSettings(page);
  await logOut(page);
  await page
    .getByRole("button", { name: "Forgot Password?", exact: true })
    .click();
  await page
    .getByLabel("Email Address", { exact: true })
    .fill("neighbor@example.test");
  await page
    .getByRole("button", { name: "Send Reset Link", exact: true })
    .click();
  await expect(page.locator("main [role=status]")).toContainText(
    "If an account exists",
  );
  await page.goto(f.origin + "/roost#auth=reset." + f.messages.at(-1).secret);
  await page
    .getByLabel("New Password", { exact: true })
    .fill("another friendly garden phrase");
  await page
    .getByLabel("Confirm New Password", { exact: true })
    .fill("another friendly garden phrase");
  await page
    .getByRole("button", { name: "Save New Password", exact: true })
    .click();
  await expect(page.locator("main [role=status]")).toContainText(
    "password is saved",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  expect(ceremonies).toEqual([]);
  expect(errors).toEqual([]);
});

test("existing customer verifies an email from settings without losing account data", async ({
  page,
}) => {
  f.config.contactLoginEnv.ROOST_EMAIL_LOGIN_ENABLED = "false";
  const response = await page.request.post(
    f.origin + "/api/roost/password/register",
    {
      headers: { Origin: f.origin },
      data: {
        workspaceId: f.id,
        username: "original.neighbor",
        name: "Original Neighbor",
        password,
      },
    },
  );
  expect(response.status()).toBe(200);
  const recovery = (await response.json()).recoveryKey;
  const original = f.sql.prepare("SELECT * FROM roost_members").all();
  f.config.contactLoginEnv.ROOST_EMAIL_LOGIN_ENABLED = "true";
  await page.goto(f.origin + "/roost");
  await openAccountSettings(page);
  await page.getByText("Verify email address", { exact: true }).click();
  await page
    .getByLabel("New Email Address", { exact: true })
    .fill("neighbor@example.test");
  await page.getByLabel("Current Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Send Verification Link", exact: true })
    .click();
  await expect(page.locator("main [role=status]")).toContainText(
    /Check your email/i,
  );
  await page.goto(f.origin + "/roost#auth=verify." + f.messages.at(-1).secret);

  await expect(page.locator("main [role=status]")).toContainText("Email Verified Successfully");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page
    .getByLabel("Email Address", { exact: true })
    .fill("neighbor@example.test");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await openAccountSettings(page);
  expect(f.sql.prepare("SELECT * FROM roost_members").all()).toEqual(original);
  await expect(
    page.getByText("Username: original.neighbor", { exact: true }),
  ).toHaveCount(0);
  await logOut(page);
  await page.getByText("Existing member sign-in", { exact: true }).click();
  await page
    .getByRole("button", {
      name: "Use email and saved recovery code",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Email Address", { exact: true })
    .fill("neighbor@example.test");
  await page.getByLabel("Saved Recovery Code", { exact: true }).fill(recovery);
  await page
    .getByLabel("New Password", { exact: true })
    .fill("another friendly garden phrase");
  await page
    .getByLabel("Confirm New Password", { exact: true })
    .fill("another friendly garden phrase");
  await page
    .getByRole("button", { name: "Recover My Account", exact: true })
    .click();
  await openAccountSettings(page);
  expect(f.sql.prepare("SELECT id FROM roost_members").get().id).toBe(
    original[0].id,
  );
});

test('verification in a separate browser context consumes once, never signs in or resends', async ({ browser, page }) => {
 await page.goto(f.origin + '/roost');
 await page.getByRole('button', { name: 'Create an Account', exact: true }).click();
 await page.getByLabel('Full Name', {exact:true}).fill('Isolated Neighbor');
 await page.getByLabel('Email Address', {exact:true}).fill('isolated@example.test');
 await page.getByLabel('Password', {exact:true}).fill(password);
 await page.getByRole('button', {name:'Create an Account',exact:true}).first().click();
 await expect(page.locator('main [role=status]')).toContainText(/Check your email/i);
 expect(f.messages).toHaveLength(1);
 const url = f.origin + '/roost#auth=verify.' + f.messages[0].secret;
 const other = await browser.newContext();
 try {
  const verifier = await other.newPage();
  await verifier.goto(url);
  await expect(verifier.getByRole('heading', {name:'Email Verified Successfully!',exact:true})).toBeVisible();
  expect(f.sql.prepare('SELECT COUNT(*) n FROM roost_sessions').get().n).toBe(0);
  expect(f.messages).toHaveLength(1);
  await verifier.reload();
  expect(f.messages).toHaveLength(1);
  await verifier.goto(url);
  await expect(verifier.getByRole('alert')).toContainText('already used successfully');
  expect(f.sql.prepare('SELECT COUNT(*) n FROM roost_members').get().n).toBe(1);
  expect(f.sql.prepare('SELECT COUNT(*) n FROM roost_sessions').get().n).toBe(0);
 } finally { await other.close(); }
});

test('Chrome registration verifies in WebKit without transferring browser storage', async ({ playwright, page, browserName }) => {
 test.skip(browserName !== 'webkit', 'Cross-engine check runs in the WebKit projects.');
 const chrome = await playwright.chromium.launch({executablePath:'/usr/bin/chromium'});
 try {
  const registration = await chrome.newPage();
  await registration.goto(f.origin + '/roost');
  await registration.getByRole('button', {name:'Create an Account',exact:true}).click();
  await registration.getByLabel('Full Name', {exact:true}).fill('Cross Browser Neighbor');
  await registration.getByLabel('Email Address', {exact:true}).fill('cross-browser@example.test');
  await registration.getByLabel('Password', {exact:true}).fill(password);
  await registration.getByRole('button', {name:'Create an Account',exact:true}).first().click();
  await expect(registration.locator('main [role=status]')).toContainText(/Check your email/i);
  await page.goto(f.origin + '/roost#auth=verify.' + f.messages[0].secret);
  await expect(page.getByRole('heading', {name:'Email Verified Successfully!',exact:true})).toBeVisible();
  expect(f.sql.prepare('SELECT COUNT(*) n FROM roost_sessions').get().n).toBe(0);
  expect(f.messages).toHaveLength(1);
 } finally { await chrome.close(); }
});
