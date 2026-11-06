import { test, expect } from '@playwright/test';
import { productionBrowserFixture } from '../production-browser-fixture.mjs';

test('email join, remembered return, name update, sign-out and new-device verification', async ({ page, context, browser }) => {
  const f = await productionBrowserFixture({ customerEmail: true });
  try {
    expect((await f.configure()).status).toBe(200);
    f.env.REAL_CHECKOUT_ENABLED = 'true'; // Isolated fixture only.
    const product = (await f.call('/api/site')).data.document.products[0];
    await page.goto(f.origin + '/shop'); await page.getByRole('button', { name: 'Add ' + product.name + ' to basket', exact: true }).click();
    await page.goto(f.origin + '/roost');
    await page.getByLabel('Name', { exact: true }).fill('Test Neighbor'); await page.getByLabel('Email', { exact: true }).fill('neighbor@example.test');
    await page.getByRole('button', { name: 'Email me a code', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    const code = f.emailMessages[0].text.match(/code is (\d{6})/)[1];
    if (code !== '999999') { await page.getByLabel('Verification code', { exact: true }).fill('999999'); await page.getByRole('button', { name: 'Verify and Sign In' }).click(); await expect(page.getByRole('alert')).toContainText('invalid or expired'); }
    await page.getByLabel('Verification code', { exact: true }).fill(code); await page.getByRole('button', { name: 'Verify and Sign In' }).click();
    await expect(page.getByRole('heading', { name: 'My Roost', exact: true })).toBeVisible();
    const session = (await context.cookies()).find(c => c.name.startsWith('__Host-rr_email_') && !c.name.includes('_code_'));
    expect(session?.httpOnly).toBe(true); expect(session?.secure).toBe(true); expect(session?.expires).toBeGreaterThan(Date.now()/1000 + 89 * 86400);
    await page.getByLabel('Display name', { exact: true }).fill('Neighbor Updated'); await page.getByRole('button', { name: 'Save display name' }).click();
    await expect(page.getByText('Your display name is saved.', { exact: true })).toBeVisible();
    await page.reload(); await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('Neighbor Updated'); expect(f.emailMessages.length).toBe(1);
    expect(await page.evaluate(() => Object.values(localStorage).some(v => /__Host-rr_email_|customer-csrf/.test(v)))).toBe(false);
    const second = await browser.newContext({ ignoreHTTPSErrors: true, storageState: await context.storageState() });
    const returnPage = await second.newPage(); await returnPage.goto(f.origin + '/roost'); await expect(returnPage.getByRole('heading', { name: 'My Roost', exact: true })).toBeVisible(); await second.close();
    const newDevice = await browser.newContext({ ignoreHTTPSErrors: true }); const fresh = await newDevice.newPage(); await fresh.goto(f.origin + '/roost'); await expect(fresh.getByRole('button', { name: 'Email me a code', exact: true })).toBeVisible(); await newDevice.close();
    await page.goto(f.origin + '/cart');
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Neighbor Updated');
    await expect(page.getByLabel('Email (optional)', { exact: true })).toHaveValue('neighbor@example.test');
    await expect(page.locator('.basket-count')).toHaveText('1');
    await page.getByLabel('I have read and acknowledge the Rise & Roost Pickup Policy', { exact: true }).check();
    await page.getByRole('button', { name: 'Place preorder', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Thank you. Your preorder is in.' })).toBeVisible();
    await page.goto(f.origin + '/roost'); await expect(page.locator('.member-order')).toHaveCount(1);
    await page.goto(f.origin + '/shop'); await page.getByRole('button', { name: 'Add ' + product.name + ' to basket', exact: true }).click();
    await page.goto(f.origin + '/roost');
    await page.getByRole('button', { name: 'Sign Out', exact: true }).click(); await expect(page.getByRole('button', { name: 'Email me a code', exact: true })).toBeVisible();
    await page.reload(); await expect(page.getByRole('heading', { name: 'Join The Roost', exact: true })).toBeVisible();
    await expect(page.locator('.basket-count')).toHaveText('1');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  } finally { await f.close(); }
});

test('unconfigured email offers guest shopping; Studio navigation and updated guide stay in Settings', async ({ page }) => {
  const f = await productionBrowserFixture();
  try {
    await page.goto(f.origin + '/roost'); await expect(page.getByRole('button', { name: 'Email me a code' })).toBeDisabled(); await page.getByRole('link', { name: 'Continue as Guest' }).click(); await expect(page).toHaveURL(/\/shop$/);
    await page.setExtraHTTPHeaders({ 'X-Synthetic-Owner': 'a' }); await page.goto(f.origin + '/studio#Settings%2FHelp');
    await expect(page.getByRole('heading', { name: 'Studio Help Guide', exact: true })).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Studio history', exact: true });
    await expect(nav.getByRole('button', { name: 'Back', exact: true })).toBeVisible(); await expect(nav.getByRole('button', { name: 'Home', exact: true })).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search the Studio Help Guide' }).fill('Remember me and returning visits'); await expect(page.getByText(/absolute maximum of 90 days/)).toBeVisible();
  } finally { await f.close(); }
});

test('Remember me disabled issues a session cookie and still signs in without a password', async ({ page, context }) => {
  const f = await productionBrowserFixture({ customerEmail: true });
  try {
    await page.goto(f.origin + '/roost'); await page.getByLabel('Name', { exact: true }).fill('Short Session'); await page.getByLabel('Email', { exact: true }).fill('short@example.test');
    await page.getByLabel('Remember me on this device', { exact: true }).uncheck(); await page.getByRole('button', { name: 'Email me a code', exact: true }).click();
    await page.getByLabel('Verification code', { exact: true }).fill(f.emailMessages[0].text.match(/code is (\d{6})/)[1]); await page.getByRole('button', { name: 'Verify and Sign In' }).click();
    await expect(page.getByRole('heading', { name: 'My Roost', exact: true })).toBeVisible();
    expect((await context.cookies()).find(c => c.name.startsWith('__Host-rr_email_') && !c.name.includes('_code_')).expires).toBe(-1);
    await page.reload(); await expect(page.getByRole('heading', { name: 'My Roost', exact: true })).toBeVisible(); expect(f.emailMessages.length).toBe(1);
  } finally { await f.close(); }
});
