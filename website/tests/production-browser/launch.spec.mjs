import { test, expect } from '@playwright/test';
import { productionBrowserFixture } from '../production-browser-fixture.mjs';
import jsQR from 'jsqr';
import { mkdir } from 'node:fs/promises';

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
    const pickup = visitor.getByLabel('Choose your pickup', { exact: true }); await pickup.getByRole('button').first().click();
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
    await expect(visitor.getByRole('link', { name: 'Back to the shop', exact: true })).toHaveAttribute('href', '/shop');
    await expect(visitor.locator('.demo-bar')).toHaveCount(0);
    await expect(visitor.getByRole('button', { name: /I've Sent Payment/ })).toHaveCount(0);
    await nav(page, 'Orders').click(); await page.locator('button:visible').filter({ hasText: 'Synthetic Production Customer' }).first().click();
    await page.getByRole('button', { name: 'Verify payment', exact: true }).click();
    await page.getByLabel('I checked an independent record for the full payment', { exact: true }).check(); await page.getByRole('button', { name: 'Confirm Verify Payment', exact: true }).click();
    await expect(visitor.getByLabel('Current order status')).toContainText('Payment Verified');
    await expect(visitor.getByLabel('Paid receipt', { exact: true })).not.toContainText('BETA');
    await expect(visitor.getByRole('link', { name: 'Open PayPal', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Start Preparing', exact: true }).click(); await expect(visitor.getByLabel('Current order status')).toContainText('Preparing Your Order');
    await page.getByRole('button', { name: 'Mark Ready for Pickup', exact: true }).click(); await expect(visitor.getByLabel('Current order status')).toContainText('Ready for Pickup');
    await expect(page.getByRole('button', { name: 'Start Preparing', exact: true })).toHaveCount(0); await expect(page.getByRole('button', { name: 'Picked Up', exact: true })).toHaveCount(0);
    expect((await f.snapshot(f.ownerB)).management.today.verifiedSales).toBe(product.price);
    await visitor.reload(); await expect(visitor.getByLabel('Current order status')).toContainText('Payment Verified');
    expect(await visitor.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); expect(errors).toEqual([]);
  } finally { for (const context of contexts) await context.close(); await f.close(); }
});

test('all three saved payment QR tiles decode correctly, open directly, and preserve private tracking without verifying payment', async ({ page }, info) => {
  const f = await productionBrowserFixture(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const destinations = {
    paypal: ['PayPal', 'https://www.paypal.com/ncp/payment/SYNTHETIC_QR'],
    venmo: ['Venmo', 'https://venmo.com/u/SyntheticQRBusiness'],
    cashapp: ['Cash App', 'https://cash.app/$SyntheticQRBusiness'],
  };
  try {
    for (const [method, [, url]] of Object.entries(destinations)) expect((await f.configure(method, url)).status).toBe(200);
    f.env.REAL_CHECKOUT_ENABLED = 'true';
    const made = await f.order(); expect(made.status).toBe(201);
    await page.context().route(/https:\/\/(www\.paypal\.com|venmo\.com|cash\.app)\//, r => r.fulfill({ contentType: 'text/html', body: '<h1>Synthetic payment destination; no money sent</h1>' }));
    await page.goto(f.origin + made.data.trackingPath);
    await expect(page.getByLabel('Current order status')).toContainText('Awaiting Payment Verification');
    const privateURL = page.url();
    expect(await page.locator('main').evaluate(main => {
      const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT), invalid = []; let node;
      while (node = walker.nextNode()) if (/^(?:null|undefined)+$/.test(node.textContent.trim())) invalid.push(node.textContent);
      return invalid;
    })).toEqual([]);
    await mkdir('qa-results/payments', { recursive: true });
    await page.screenshot({ path: 'qa-results/payments/production-tiles-' + info.project.name + '.png', fullPage: true });
    for (const [method, [label, url]] of Object.entries(destinations)) {
      const tile = page.getByRole('link', { name: 'Open ' + label, exact: true });
      await expect(tile).toHaveAttribute('href', url);
      const bitmap = await tile.locator('svg').evaluate(async svg => {
        const image = new Image(); image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg)); await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = svg.viewBox.baseVal.width * 5;
        const context = canvas.getContext('2d'); context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return { width: canvas.width, data: Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data) };
      });
      expect(jsQR(Uint8ClampedArray.from(bitmap.data), bitmap.width, bitmap.width)?.data).toBe(url);
      const opening = page.waitForEvent('popup'); await tile.click(); const external = await opening;
      await expect(external.getByRole('heading')).toContainText('Synthetic payment destination'); await external.close();
      await expect.poll(async () => (await f.snapshot()).orders[0].selectedPaymentMethod).toBe(method);
      expect(page.url()).toBe(privateURL); await expect(page.getByLabel('Current order status')).toContainText('Awaiting Payment Verification');
      expect((await f.snapshot()).management.today.verifiedSales).toBe(0);
    }
    // A failed choice save cannot lose the order or claim money was received.
    // A popup/focus refresh may clear the transient alert. Observe it from the
    // start of the failed request rather than after returning from the popup.
    await page.evaluate(() => {
      window.paymentChoiceFailureShown = false;
      const observer = new MutationObserver(() => {
        if (document.querySelector('[role="alert"]')?.textContent.includes('payment-method choice was not confirmed')) {
          window.paymentChoiceFailureShown = true; observer.disconnect();
        }
      });
      observer.observe(document.querySelector('#app'), { childList: true, subtree: true });
    });
    await page.route('**/api/order-tracking/*/*/payment-method', r => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Synthetic save interruption"}' }));
    const retryOpening = page.waitForEvent('popup'); await page.getByRole('link', { name: 'Open Venmo', exact: true }).click(); const retryExternal = await retryOpening;
    await expect(retryExternal.getByRole('heading')).toContainText('Synthetic payment destination'); await retryExternal.close();
    await expect.poll(() => page.evaluate(() => window.paymentChoiceFailureShown)).toBe(true);
    expect((await f.snapshot()).orders[0].selectedPaymentMethod).toBe('cashapp');
    expect((await f.snapshot()).management.today.verifiedSales).toBe(0); expect(page.url()).toBe(privateURL);
    await page.unroute('**/api/order-tracking/*/*/payment-method');
    // A link changed by the owner is removed until that new destination is tested.
    expect((await f.change('payment-destination', { provider: 'paypal', url: 'https://www.paypal.com/ncp/payment/CHANGED_SYNTHETIC_QR', enabled: true, businessConfirmed: true })).status).toBe(200);
    await expect(page.getByRole('link', { name: 'Open PayPal', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Open Venmo', exact: true })).toHaveAttribute('href', destinations.venmo[1]);
    expect((await f.snapshot()).orders).toHaveLength(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  } finally { await f.close(); }
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
    await expect(page.getByLabel('Selling method', { exact: true })).toHaveValue('online');
    await page.getByLabel('How many are available?', { exact: true }).fill('4');
    const png = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16; canvas.getContext('2d').fillRect(0, 0, 16, 16); return canvas.toDataURL('image/png').split(',')[1]; });
    await page.locator('input[type=file]').first().setInputFiles({ name: 'synthetic-product.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await expect(page.locator('.ms-photo img')).toHaveAttribute('src', /^\/api\/assets\//);
    await page.getByRole('button', { name: 'Save product live', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Synthetic new product', exact: true })).toBeVisible();
    await page.reload(); await nav(page, 'Products').click(); await expect(page.getByRole('heading', { name: 'Synthetic new product', exact: true })).toBeVisible();
    page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Hide Product', exact: true }).click();
    await expect(page.locator('.ms-main')).toContainText('No products in this view.');
    expect((await f.snapshot()).published.products[0].archived).toBe(true);
    await page.goto(f.origin + '/shop'); await expect(page.getByRole('heading', { name: 'Synthetic new product', exact: true })).toHaveCount(0);
    expect((await f.snapshot()).orders).toHaveLength(0); expect((await f.snapshot()).management.today.verifiedSales).toBe(0);
  } finally { await f.close(); }
});
