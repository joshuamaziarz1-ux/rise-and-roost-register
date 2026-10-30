import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { primaryFixture } from '../primary-fixture.mjs';
const hosted = process.env.RR_MANAGEMENT_PREVIEW_URL;
if (hosted && hosted !== 'https://rise-roost-experience-preview.joshua-maziarz1.workers.dev') throw new Error('Management tests allow only the isolated experience preview.');

test.describe('Rise & Roost management Studio', () => {
  test.skip(!!process.env.RR_BETA_BASE_URL, 'Never target the original beta with management tests.');
  let fixture;
  test.beforeEach(async ({ page }) => {
    if (!hosted) { fixture = await primaryFixture({ experience: true, management: true, port: 4189, hostname: 'localhost' }); return; }
    const response = await page.request.post(hosted+'/api/workspaces', { headers: { Origin: hosted }, data: {} });
    expect(response.status()).toBe(201); const site = await response.json();
    expect(site.isPrimary).toBe(false); expect(site.studioManagementEnabled).toBe(true);
    fixture = { id: site.id, key: site.accessKey, origin: hosted, prefix: '/demo/'+site.id, close: async () => {} };
  });
  test.afterEach(async () => { await fixture?.close(); });
  async function owner(page) {
    const existing = await page.request.get(fixture.origin+'/api/studio', { headers: { 'X-RR-Workspace': fixture.id } });
    if (existing.status() !== 200) {
      const r = await page.request.post(fixture.origin+'/api/login', { headers: { Origin: fixture.origin, 'X-RR-Workspace': fixture.id }, data: { id: fixture.id, accessKey: fixture.key } });
      expect(r.status()).toBe(200);
    }
    await page.goto(fixture.origin+'/studio?workspace='+fixture.id);
    await expect(page.getByRole('heading', { name: 'Hi, Danielle!', exact: true })).toBeVisible();
  }
  const nav = (page, name) => page.getByRole('navigation', { name: page.viewportSize().width < 900 ? 'Primary Studio navigation' : 'Studio navigation', exact: true }).getByRole('button', { name, exact: true });
  async function more(page, name) { if (page.viewportSize().width < 900) { await nav(page, 'More').click(); await page.getByRole('button', { name, exact: true }).click(); } else await nav(page, name).click(); }
  const productCard = page => page.locator('.ms-product').filter({ has: page.getByRole('heading', { name: 'Slow Sunday sourdough', exact: true }) });
  const customerPath = path => fixture.origin+(fixture.prefix || '')+path;

  test('mobile navigation, live product save, photo errors, content draft and locked layout', async ({ page, browser }, info) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await owner(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1)).toBe(true);
    await mkdir('qa-results/management', { recursive: true });
    await page.screenshot({ path: `qa-results/management/home-${info.project.name}.png`, fullPage: true });
    const publicContext = await browser.newContext({ ...info.project.use, baseURL: fixture.origin });
    try {
      const visitor = await publicContext.newPage();
      if (hosted) {
        expect((await visitor.goto(hosted+'/')).status()).toBe(200); await expect(visitor.locator('.home-choices a')).toHaveCount(3);
        expect((await visitor.goto(hosted+'/studio')).status()).toBe(200); await expect(visitor.getByRole('heading', { name: 'Welcome back.', exact: true })).toBeVisible();
      }
      await visitor.goto(customerPath('/shop'));
      await nav(page, 'Products').click(); await productCard(page).getByRole('button', { name: 'Edit product', exact: true }).click();
      await page.getByLabel('Product name', { exact: true }).fill('Danielle’s management loaf');
      await page.getByLabel('Price ($)', { exact: true }).fill('12.50');
      await page.getByLabel('Available units (after existing orders)', { exact: true }).fill('4');
      await page.locator('input[type=file]').first().setInputFiles({ name: 'invalid.gif', mimeType: 'image/gif', buffer: Buffer.from('not an image') });
      await expect(page.getByRole('alert')).toContainText('JPG, PNG, or WebP');
      await expect(page.getByLabel('Product name', { exact: true })).toHaveValue('Danielle’s management loaf');
      const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 16; c.getContext('2d').fillRect(0, 0, 16, 16); return c.toDataURL('image/png').split(',')[1]; });
      await page.locator('input[type=file]').first().setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
      await expect(page.locator('.ms-photo img').first()).toHaveAttribute('src', /\/api\/assets\//);
      await page.getByRole('button', { name: 'Save product live', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Danielle’s management loaf', exact: true })).toBeVisible();
      await expect(visitor.getByRole('heading', { name: 'Danielle’s management loaf', exact: true })).toBeVisible();
      await expect(visitor.locator('.product-card').filter({ hasText: 'Danielle’s management loaf' })).toContainText('$12.50');
      await more(page, 'Website Content');
      await page.getByRole('button', { name: 'Edit website content', exact: true }).click();
      await page.locator('details').filter({ has: page.getByText('Home', { exact: true }) }).first().locator('summary').click();
      await page.getByLabel('Home · heading', { exact: true }).first().fill('A draft welcome from Danielle');
      await page.getByRole('button', { name: 'Save content draft', exact: true }).click();
      await visitor.goto(customerPath('/'));
      await expect(visitor.locator('h1')).not.toHaveText('A draft welcome from Danielle');
      page.once('dialog', d => d.accept());
      await page.getByRole('button', { name: 'Publish website content', exact: true }).click();
      await expect(visitor.locator('h1')).toHaveText('A draft welcome from Danielle');
      await expect(page.getByRole('button', { name: 'Advanced Design', exact: true })).toHaveCount(0);
      await page.screenshot({ path: `qa-results/management/content-${info.project.name}.png`, fullPage: true });
      expect((await publicContext.request.get(fixture.origin+'/api/manage/snapshot')).status()).toBe(401);
      expect(errors).toEqual([]);
    } finally { await publicContext.close(); }
  });

  test('failed save retains fields, idempotent retry reconciles, and another owner device stays synchronized', async ({ page, browser }, info) => {
    await owner(page);
    const second = await browser.newContext({ ...info.project.use, baseURL: fixture.origin });
    try {
      const other = await second.newPage(); await owner(other);
      await nav(page, 'Products').click(); await productCard(page).getByRole('button', { name: 'Edit product', exact: true }).click();
      await page.getByLabel('Product name', { exact: true }).fill('Saved after an interrupted connection');
      await page.route('**/api/manage/product', async route => {
        await route.fetch(); await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic interrupted response.' }) });
      }, { times: 1 });
      await page.getByRole('button', { name: 'Save product live', exact: true }).click();
      // The server may already have committed. Reconciliation uses the same
      // operation identity, never a guessed success or a second inventory write.
      await page.getByRole('button', { name: 'Check connection', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Saved after an interrupted connection', exact: true })).toBeVisible();
      await nav(other, 'Products').click();
      await expect(other.getByRole('heading', { name: 'Saved after an interrupted connection', exact: true })).toBeVisible();
      const snapshot = await (await page.request.get(fixture.origin+'/api/manage/snapshot', { headers: { 'X-RR-Workspace': fixture.id } })).json();
      expect(snapshot.management.audit.filter(a => a.kind === 'product')).toHaveLength(1);
      await other.context().setOffline(true);
      await other.locator('.ms-product').first().getByRole('button', { name: 'Edit product', exact: true }).click();
      await other.getByLabel('Product name', { exact: true }).fill('Offline unsaved product');
      await other.getByRole('button', { name: 'Save product live', exact: true }).click();
      await expect(other.getByRole('alert')).toContainText('offline');
      await expect(other.getByLabel('Product name', { exact: true })).toHaveValue('Offline unsaved product');
      await other.context().setOffline(false);
      await other.getByRole('button', { name: 'Save product live', exact: true }).click();
      await expect(other.getByRole('heading', { name: 'Offline unsaved product', exact: true })).toBeVisible();
      await other.locator('.ms-product').first().getByRole('button', { name: 'Edit product', exact: true }).click();
      await other.getByLabel('Product name', { exact: true }).fill('Unsaved during sign-in renewal');
      expect((await other.request.post(fixture.origin+'/api/logout', { headers: { Origin: fixture.origin, 'X-RR-Workspace': fixture.id }, data: {} })).status()).toBe(200);
      await other.getByRole('button', { name: 'Check connection', exact: true }).click();
      await expect(other.getByRole('heading', { name: 'Sign-in required', exact: true })).toBeVisible();
      expect((await other.request.post(fixture.origin+'/api/login', { headers: { Origin: fixture.origin, 'X-RR-Workspace': fixture.id }, data: { id: fixture.id, accessKey: fixture.key } })).status()).toBe(200);
      await other.getByRole('button', { name: 'Check connection', exact: true }).click();
      await expect(other.getByLabel('Product name', { exact: true })).toHaveValue('Unsaved during sign-in renewal');
    } finally { await second.close(); }
  });

  test('public order appears in Studio, verification changes financial totals, and pickup lists/status track separately', async ({ page, browser }, info) => {
    await owner(page);
    const customers = await browser.newContext({ ...info.project.use, baseURL: fixture.origin });
    try {
      const customer = await customers.newPage(); await customer.goto(customerPath('/shop'));
      await customer.getByRole('button', { name: 'Add Slow Sunday sourdough to basket', exact: true }).click();
      await customer.locator('.basket-link').click(); await customer.getByLabel('Name', { exact: true }).fill('Synthetic Pickup Neighbor');
      const pickup = customer.getByLabel('Choose your pickup', { exact: true }); await pickup.selectOption(await pickup.locator('option:not([disabled])').nth(1).getAttribute('value'));
      await customer.getByRole('button', { name: 'Place preorder', exact: true }).click();
      await customer.getByRole('link', { name: 'Track your order', exact: true }).click();
      await customer.getByRole('button', { name: "I've Sent Payment", exact: true }).click();
      await nav(page, 'Orders').click(); await page.getByRole('button').filter({ hasText: 'Synthetic Pickup Neighbor' }).filter({ visible: true }).click();
      await page.getByRole('button', { name: 'Verify payment', exact: true }).click();
      await page.getByLabel('Independent payment reference', { exact: true }).fill('SYNTHETIC cash receipt 001');
      await page.getByLabel('I checked an independent record for the full payment', { exact: true }).check();
      await page.getByRole('button', { name: 'Record verified payment', exact: true }).click();
      await expect(customer.getByLabel('Current order status', { exact: true })).toContainText('Payment Verified');
      await expect(customer.getByLabel('Current order status', { exact: true }).getByRole('heading')).toHaveText('Order Received');
      await page.getByRole('button', { name: 'Ready for Pickup', exact: true }).click();
      await page.getByRole('button', { name: 'Save order status', exact: true }).click();
      await expect(customer.getByLabel('Current order status', { exact: true })).toContainText('Ready for Pickup');
      await nav(page, 'Home').click(); await expect(page.locator('.ms-sales')).toContainText('$9.00');
      await page.screenshot({ path: `qa-results/management/verified-sales-${info.project.name}.png`, fullPage: true });
      await nav(page, 'Calendar').click(); await expect(page.getByRole('button', { name: 'Print pickup & production lists', exact: true })).toBeVisible();
      await page.screenshot({ path: `qa-results/management/calendar-${info.project.name}.png`, fullPage: true });
    } finally { await customers.close(); }
  });

  test('management leaves the approved customer landing and shop visually unchanged', async ({ browser }, info) => {
    test.skip(!!hosted, 'Pixel comparison uses paired identical local documents; hosted root is read-only.');
    const baseline = await primaryFixture({ experience: true, management: false, port: 4191, hostname: 'localhost' });
    // Normalize raster density for exact comparison; Pixel 7's fractional 2.625
    // density can round glyph origins differently during full-page capture.
    // Functional tests and device screenshots retain the actual profile density.
    const visualContext = await browser.newContext({ ...info.project.use, deviceScaleFactor: 1 });
    const page = await visualContext.newPage();
    try {
      for (const path of ['/', '/shop']) {
        await page.goto(baseline.origin+path); await expect(page.locator('.experience')).toBeVisible();
        await page.locator('img').evaluateAll(images => Promise.all(images.map(i => { i.loading = 'eager'; return i.decode(); })));
        await page.evaluate(() => document.fonts.ready);
        const before = await page.screenshot({ fullPage: true, animations: 'disabled' });
        await page.goto(fixture.origin+path); await expect(page.locator('.experience')).toBeVisible();
        await page.locator('img').evaluateAll(images => Promise.all(images.map(i => { i.loading = 'eager'; return i.decode(); })));
        await page.evaluate(() => document.fonts.ready);
        const after = await page.screenshot({ fullPage: true, animations: 'disabled' });
        if (Buffer.compare(before, after)) { await mkdir('qa-results/management', { recursive: true }); await writeFile(`qa-results/management/customer-before-${info.project.name}.png`, before); await writeFile(`qa-results/management/customer-after-${info.project.name}.png`, after); }
        expect(Buffer.compare(before, after), 'Customer '+path+' screenshot changed').toBe(0);
      }
    } finally { await visualContext.close(); await baseline.close(); }
  });

  test('conflicting owner edits preserve unsaved fields and require a reviewed rebase', async ({ page, browser }, info) => {
    await owner(page); const second = await browser.newContext({ ...info.project.use });
    try {
      const other = await second.newPage(); await owner(other);
      for (const p of [page, other]) { await nav(p, 'Products').click(); await productCard(p).getByRole('button', { name: 'Edit product', exact: true }).click(); }
      await page.getByLabel('Product name', { exact: true }).fill('Synthetic winning product name');
      await other.getByLabel('Price ($)', { exact: true }).fill('15.50');
      await page.getByRole('button', { name: 'Save product live', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Synthetic winning product name', exact: true })).toBeVisible();
      await other.getByRole('button', { name: 'Save product live', exact: true }).click();
      await expect(other.getByRole('alert')).toContainText('another device');
      await expect(other.getByLabel('Price ($)', { exact: true })).toHaveValue(/^15\.50?$/);
      await other.getByRole('button', { name: 'Check connection', exact: true }).click();
      other.once('dialog', d => d.accept());
      await other.getByRole('button', { name: 'Review latest and keep my edits', exact: true }).click();
      await expect(other.getByLabel('Product name', { exact: true })).toHaveValue('Synthetic winning product name');
      await other.getByRole('button', { name: 'Save product live', exact: true }).click();
      await expect(other.locator('.ms-product').filter({ hasText: 'Synthetic winning product name' })).toContainText('$15.50');
    } finally { await second.close(); }
  });

  test('recurring arbitrary pickup days, pause, and comment moderation synchronize without refresh', async ({ page, browser }, info) => {
    await owner(page); await nav(page, 'Calendar').click();
    await page.getByRole('button', { name: 'Set recurring days', exact: true }).click();
    const start = new Date(); start.setUTCDate(start.getUTCDate()+8); const end = new Date(start); end.setUTCDate(end.getUTCDate()+6);
    await page.getByLabel('First date', { exact: true }).fill(start.toISOString().slice(0,10));
    await page.getByLabel('Repeat through', { exact: true }).fill(end.toISOString().slice(0,10));
    await page.getByLabel('Wednesday', { exact: true }).check(); await page.getByLabel('Sunday', { exact: true }).check();
    await page.getByRole('button', { name: 'Save recurring pickups', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible();
    const snapshot = await (await page.request.get(fixture.origin+'/api/manage/snapshot', { headers: { 'X-RR-Workspace': fixture.id } })).json();
    const added = snapshot.published.pickups.filter(p => p.date >= start.toISOString().slice(0,10));
    expect(added.some(p => new Date(p.date+'T12:00Z').getUTCDay() === 0)).toBe(true);
    expect(added.some(p => new Date(p.date+'T12:00Z').getUTCDay() === 3)).toBe(true);
    const visitors = await browser.newContext({ ...info.project.use });
    try {
      const visitor = await visitors.newPage(); await visitor.goto(customerPath('/comments'));
      await visitor.getByLabel('Your name', { exact: true }).fill('Synthetic Studio Neighbor');
      await visitor.getByLabel('Your comment', { exact: true }).fill('Synthetic comment for live moderation.');
      await visitor.getByLabel('My name and comment may be shared after review.').check();
      await visitor.getByRole('button', { name: 'Send comment', exact: true }).click();
      await more(page, 'Customer Comments'); await expect(page.getByText('Synthetic comment for live moderation.', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Approve comment', exact: true }).click();
      await expect(visitor.locator('.neighbor-notes')).toContainText('Synthetic comment for live moderation.');
      page.once('dialog', d => d.accept()); await page.getByRole('button', { name: 'Hide comment', exact: true }).click();
      await expect(visitor.locator('.neighbor-notes')).not.toContainText('Synthetic comment for live moderation.');
      await nav(page, 'Calendar').click(); page.once('dialog', d => d.accept());
      await page.getByRole('button', { name: 'Pause new ordering', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: 'New ordering is paused.' })).toBeVisible();
      const available = await (await visitor.request.get(fixture.origin+'/api/site?workspace='+fixture.id)).json();
      expect(available.document.orderingPaused).toBe(true); expect(available.document.pickups).toHaveLength(0);
    } finally { await visitors.close(); }
  });
});
