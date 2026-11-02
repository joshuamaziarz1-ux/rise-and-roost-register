import { test, expect } from '@playwright/test';
import { productionBrowserFixture } from '../production-browser-fixture.mjs';

const nav = (page, name) => page.getByRole('navigation', { name: page.viewportSize().width < 900 ? 'Primary Studio navigation' : 'Studio navigation', exact: true }).getByRole('button', { name, exact: true });
async function paymentSettings(page) {
  if (page.viewportSize().width < 900) { await nav(page, 'More').click(); await page.getByRole('button', { name: 'Settings', exact: true }).click(); }
  else await nav(page, 'Settings').click();
  await page.getByRole('button', { name: 'Payments', exact: true }).click();
}

test('production owner identities, payment settings, launch lock and complete customer order journey', async ({ page, browser }, info) => {
  const f = await productionBrowserFixture(), contexts = [], errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.setExtraHTTPHeaders({ 'X-Synthetic-Owner': 'a' });
    await page.goto(f.origin + '/studio'); await expect(page.getByRole('heading', { name: 'Hi, Danielle!', exact: true })).toBeVisible();
    await expect(page.locator('.ms-sales')).toContainText('$0.00'); await expect(page.getByLabel('Owner PIN', { exact: true })).toHaveCount(0);
    const customer = await browser.newContext({ ...info.project.use }), otherOwner = await browser.newContext({ ...info.project.use, extraHTTPHeaders: { 'X-Synthetic-Owner': 'b' } });
    contexts.push(customer, otherOwner);
    const visitor = await customer.newPage(), second = await otherOwner.newPage();
    visitor.on('pageerror', e => errors.push(e.message));
    expect((await customer.request.get(f.origin + '/studio/api/manage/snapshot')).status()).toBe(401);
    await second.goto(f.origin + '/studio'); await expect(second.getByRole('heading', { name: 'Hi, Danielle!', exact: true })).toBeVisible();
    await paymentSettings(page);
    await page.getByRole('button', { name: 'Add PayPal link', exact: true }).click();
    const paymentURL = 'https://paypal.me/SyntheticProductionRecipient';
    await page.getByLabel('PayPal payment URL', { exact: true }).fill(paymentURL);
    await page.getByLabel('Enabled for customer payments', { exact: true }).check(); await page.getByLabel('This destination is approved for my business sales', { exact: true }).check();
    await page.getByRole('button', { name: 'Save payment link', exact: true }).click();
    await expect(page.locator('.ms-main')).toContainText('Test required');
    await page.context().route('https://paypal.me/**', r => r.fulfill({ contentType: 'text/html', body: '<h1>Synthetic recipient; no money sent</h1>' }));
    const popupEvent = page.waitForEvent('popup'); await page.getByRole('button', { name: 'Test PayPal Link', exact: true }).click(); const popup = await popupEvent;
    await expect(popup.getByRole('heading')).toContainText('Synthetic recipient'); await popup.close();
    await page.getByLabel('I opened the PayPal link and confirmed the correct business recipient', { exact: true }).check(); await page.getByRole('button', { name: 'Confirm PayPal Link Test', exact: true }).click();
    await expect(page.locator('.ms-main')).toContainText('Ready');
    await paymentSettings(second); await expect(second.locator('.ms-main')).toContainText(paymentURL);
    await otherOwner.close(); contexts.splice(contexts.indexOf(otherOwner), 1);
    const site = (await f.call('/api/site')).data, product = site.document.products[0];
    await visitor.goto(f.origin + '/shop'); await expect(visitor.locator('.demo-bar')).toBeHidden();
    await visitor.getByRole('button', { name: 'Add ' + product.name + ' to basket', exact: true }).click(); await visitor.locator('.basket-link').click();
    await visitor.getByLabel('Name', { exact: true }).fill('Synthetic Production Customer');
    const pickup = visitor.getByLabel('Choose your pickup', { exact: true }); await pickup.selectOption(await pickup.locator('option:not([disabled])').nth(1).getAttribute('value'));
    await visitor.getByLabel('I have read and acknowledge the Rise & Roost Pickup Policy', { exact: true }).check();
    await expect(visitor.getByRole('button', { name: 'Place preorder', exact: true })).toBeDisabled();
    // Approval flag changed only in the disposable local test environment.
    f.env.REAL_CHECKOUT_ENABLED = 'true'; await visitor.reload();
    await visitor.getByLabel('Name', { exact: true }).fill('Synthetic Production Customer');
    await visitor.getByLabel('I have read and acknowledge the Rise & Roost Pickup Policy', { exact: true }).check();
    await expect(visitor.getByRole('button', { name: 'Place preorder', exact: true })).toBeEnabled();
    await visitor.getByRole('button', { name: 'Place preorder', exact: true }).click(); await expect(visitor.getByRole('heading', { name: 'Thank you. Your preorder is in.', exact: true })).toBeVisible();
    await visitor.bringToFront();
    await visitor.getByRole('link', { name: 'Pay & track your order', exact: true }).click();
    await expect(visitor.getByLabel('Current order status')).toContainText('Awaiting Payment Verification');
    await expect(visitor.getByRole('link', { name: 'Open PayPal', exact: true })).toHaveAttribute('href', paymentURL);
    await expect(visitor.getByRole('button', { name: /I've Sent Payment/ })).toHaveCount(0);
    await nav(page, 'Orders').click(); await page.locator('button:visible').filter({ hasText: 'Synthetic Production Customer' }).first().click();
    await page.getByRole('button', { name: 'Verify payment', exact: true }).click();
    await page.getByLabel('I checked an independent record for the full payment', { exact: true }).check(); await page.getByRole('button', { name: 'Confirm Verify Payment', exact: true }).click();
    await expect(visitor.getByLabel('Current order status')).toContainText('Payment Verified');
    await page.getByRole('button', { name: 'Start Preparing', exact: true }).click(); await expect(visitor.getByLabel('Current order status')).toContainText('Preparing Your Order');
    await page.getByRole('button', { name: 'Mark Ready for Pickup', exact: true }).click(); await expect(visitor.getByLabel('Current order status')).toContainText('Ready for Pickup');
    await expect(page.getByRole('button', { name: 'Start Preparing', exact: true })).toHaveCount(0); await expect(page.getByRole('button', { name: 'Picked Up', exact: true })).toHaveCount(0);
    expect((await f.snapshot(f.ownerB)).management.today.verifiedSales).toBe(product.price);
    await visitor.reload(); await expect(visitor.getByLabel('Current order status')).toContainText('Payment Verified');
    expect(await visitor.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); expect(errors).toEqual([]);
  } finally { for (const context of contexts) await context.close(); await f.close(); }
});

test('Danielle can start with no products, upload a photo, save a product and remove it from the storefront', async ({ page }) => {
  const f = await productionBrowserFixture();
  try {
    const row = f.sql.prepare('SELECT published_json FROM workspaces').get(), doc = JSON.parse(row.published_json); doc.products = []; doc.orderingPaused = true;
    f.sql.prepare('UPDATE workspaces SET published_json=?,draft_json=?').run(JSON.stringify(doc), JSON.stringify(doc));
    await page.setExtraHTTPHeaders({ 'X-Synthetic-Owner': 'a' }); await page.goto(f.origin + '/studio');
    await expect(page.getByRole('heading', { name: 'Hi, Danielle!', exact: true })).toBeVisible(); await nav(page, 'Products').click();
    await expect(page.locator('.ms-main')).toContainText('No products in this view.'); await page.getByRole('button', { name: 'Add product', exact: true }).click();
    await page.getByLabel('Product name', { exact: true }).fill('Synthetic new product'); await page.getByLabel('Price ($)', { exact: true }).fill('8.50');
    await page.getByLabel('Available units (after existing orders)', { exact: true }).fill('4');
    const png = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16; canvas.getContext('2d').fillRect(0, 0, 16, 16); return canvas.toDataURL('image/png').split(',')[1]; });
    await page.locator('input[type=file]').first().setInputFiles({ name: 'synthetic-product.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await expect(page.locator('.ms-photo img')).toHaveAttribute('src', /^\/api\/assets\//);
    await page.getByRole('button', { name: 'Save product live', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Synthetic new product', exact: true })).toBeVisible();
    await page.reload(); await nav(page, 'Products').click(); await expect(page.getByRole('heading', { name: 'Synthetic new product', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Edit product', exact: true }).click(); await page.getByLabel('Archived (keeps order history)', { exact: true }).check();
    page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Save product live', exact: true }).click();
    await expect(page.locator('.ms-main')).toContainText('No products in this view.');
    expect((await f.snapshot()).published.products[0].archived).toBe(true);
    await page.goto(f.origin + '/shop'); await expect(page.getByRole('heading', { name: 'Synthetic new product', exact: true })).toHaveCount(0);
    expect((await f.snapshot()).orders).toHaveLength(0); expect((await f.snapshot()).management.today.verifiedSales).toBe(0);
  } finally { await f.close(); }
});
