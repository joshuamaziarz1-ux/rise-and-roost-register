import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { primaryFixture } from '../primary-fixture.mjs';

test.describe('externally restricted direct Studio preview', () => {
  test.skip(!!process.env.RR_BETA_BASE_URL, 'This suite must never target the original beta.');
  let fixture;
  test.beforeEach(async () => { fixture = await primaryFixture({ experience: true, management: true, network: true, hostname: 'localhost', port: 4192 }); });
  test.afterEach(async () => { await fixture?.close(); });
  const nav = (page, name) => page.getByRole('navigation', { name: page.viewportSize().width <= 900 ? 'Primary Studio navigation' : 'Studio navigation', exact: true }).getByRole('button', { name, exact: true });
  async function noLogin(page) {
    await expect(page.getByRole('heading', { name: 'Hi, Danielle!', exact: true })).toBeVisible();
    await expect(page).toHaveURL(fixture.origin+'/studio');
    await expect(page.getByLabel('Workspace ID', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Private access key', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(0);
    expect((await page.context().cookies()).filter(c => c.name.startsWith('rr_studio'))).toHaveLength(0);
  }
  test('direct dashboard, existing-workspace routing and cross-device live product saves need no owner credentials', async ({ page, browser }, info) => {
    const requests = []; page.on('request', r => requests.push(new URL(r.url()).pathname));
    await page.goto(fixture.origin+'/studio?workspace='+'b'.repeat(48)); await noLogin(page);
    await mkdir('qa-results/network-preview', { recursive: true });
    await page.screenshot({ path: `qa-results/network-preview/studio-${info.project.name}.png`, fullPage: true });
    const second = await browser.newContext({ ...info.project.use });
    try {
      const other = await second.newPage(); await other.goto(fixture.origin+'/studio'); await noLogin(other);
      const visitor = await second.newPage(); await visitor.goto(fixture.origin+'/shop');
      await nav(page, 'Products').click(); await page.locator('.ms-product').first().getByRole('button', { name: 'Edit product', exact: true }).click();
      await page.getByLabel('Product name', { exact: true }).fill('Synthetic direct-preview loaf');
      await page.getByLabel('Price ($)', { exact: true }).fill('12.50');
      await page.getByRole('button', { name: 'Save product live', exact: true }).click();
      await expect(visitor.getByRole('heading', { name: 'Synthetic direct-preview loaf', exact: true })).toBeVisible();
      await expect(visitor.locator('.product-card').filter({ hasText: 'Synthetic direct-preview loaf' })).toContainText('$12.50');
      await nav(other, 'Products').click(); await expect(other.getByRole('heading', { name: 'Synthetic direct-preview loaf', exact: true })).toBeVisible();
      await page.reload(); await noLogin(page); await nav(page, 'Products').click(); await expect(page.getByRole('heading', { name: 'Synthetic direct-preview loaf', exact: true })).toBeVisible();
      if (page.viewportSize().width <= 900) { await nav(page, 'More').click(); await page.getByRole('button', { name: 'Settings', exact: true }).click(); }
      else await nav(page, 'Settings').click();
      await expect(page.getByRole('heading', { name: 'Testing access', exact: true })).toBeVisible();
      await expect(page.getByLabel('Connection code from your other device', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0);
      expect(requests.some(path => /\/api\/(login|workspaces|device-)/.test(path))).toBe(false);
      expect((await page.request.post(fixture.origin+'/api/workspaces', { headers: { Origin: fixture.origin }, data: {} })).status()).toBe(403);
    } finally { await second.close(); }
  });
  test('unapproved networks cannot read or write, and network recovery retains an unfinished form without a login screen', async ({ page }) => {
    await page.goto(fixture.origin+'/studio'); await noLogin(page);
    await nav(page, 'Products').click(); await page.locator('.ms-product').first().getByRole('button', { name: 'Edit product', exact: true }).click();
    await page.getByLabel('Product name', { exact: true }).fill('Unsaved direct-preview edit');
    await page.context().setExtraHTTPHeaders({ 'X-RR-Test-Network': '198.51.100.20', 'CF-Connecting-IP': '203.0.113.10' });
    await page.getByRole('button', { name: 'Check connection', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Private testing access required', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(0);
    const denied = await page.request.get(fixture.origin+'/api/manage/snapshot'); expect(denied.status()).toBe(403);
    const deniedWrite = await page.request.post(fixture.origin+'/api/manage/product', { headers: { Origin: fixture.origin }, data: { operationId: crypto.randomUUID() } }); expect(deniedWrite.status()).toBe(403);
    expect((await page.request.get(fixture.origin+'/studio')).status()).toBe(403);
    await page.context().setExtraHTTPHeaders({}); await page.getByRole('button', { name: 'Check connection', exact: true }).click();
    await expect(page.getByLabel('Product name', { exact: true })).toHaveValue('Unsaved direct-preview edit');
    await page.getByRole('button', { name: 'Save product live', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Unsaved direct-preview edit', exact: true })).toBeVisible();
  });
  test('the network restriction and direct Studio mode preserve the approved customer Home and Shop pixels', async ({ browser }, info) => {
    const baseline = await primaryFixture({ experience: true, management: true, hostname: 'localhost', port: 4193 });
    const context = await browser.newContext({ ...info.project.use, deviceScaleFactor: 1 });
    try {
      const page = await context.newPage();
      for (const path of ['/', '/shop']) {
        const captures = [];
        for (const origin of [baseline.origin, fixture.origin]) {
          await page.goto(origin+path); await expect(page.locator('.experience')).toBeVisible();
          await page.locator('img').evaluateAll(images => Promise.all(images.map(i => { i.loading = 'eager'; return i.decode(); })));
          await page.evaluate(() => document.fonts.ready); captures.push(await page.screenshot({ fullPage: true, animations: 'disabled' }));
        }
        expect(Buffer.compare(...captures), 'Customer '+path+' pixels changed').toBe(0);
      }
    } finally { await context.close(); await baseline.close(); }
  });
});
