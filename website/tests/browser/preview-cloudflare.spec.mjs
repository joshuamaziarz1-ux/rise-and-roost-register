import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { primaryFixture } from '../primary-fixture.mjs';

test.describe('Cloudflare Access remembered Studio preview', () => {
  test.skip(!!process.env.RR_BETA_BASE_URL, 'This suite must never target the original beta.');
  let fixture;
  async function authorize(context, token) { await context.addCookies([{ name: 'CF_Authorization', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax', expires: Math.floor(Date.now()/1000)+30*86400 }]); }
  test.beforeEach(async ({ page }) => { fixture = await primaryFixture({ experience: true, management: true, access: true, hostname: 'localhost', port: 4192 }); await authorize(page.context(), fixture.authority.token); });
  test.afterEach(async () => { await fixture?.close(); });
  const nav = (page, name) => page.getByRole('navigation', { name: page.viewportSize().width <= 900 ? 'Primary Studio navigation' : 'Studio navigation', exact: true }).getByRole('button', { name, exact: true });
  async function noLogin(page) {
    await expect(page.getByRole('heading', { name: 'Hi, Danielle!', exact: true })).toBeVisible();
    await expect(page).toHaveURL(fixture.origin+'/studio');
    await expect(page.getByLabel('Workspace ID', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Private access key', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(0);
    expect((await page.context().cookies()).filter(c => c.name.startsWith('rr_studio'))).toHaveLength(0);
    expect((await page.context().cookies()).filter(c => c.name === 'CF_Authorization')).toHaveLength(1);
  }
  test('direct dashboard, existing-workspace routing and remembered cross-device sessions need no Studio credentials', async ({ page, browser }, info) => {
    const requests = []; page.on('request', r => requests.push(new URL(r.url()).pathname));
    await page.goto(fixture.origin+'/studio?workspace='+'b'.repeat(48)); await noLogin(page);
    await mkdir('qa-results/access-preview', { recursive: true });
    await page.screenshot({ path: `qa-results/access-preview/studio-${info.project.name}.png`, fullPage: true });
    const second = await browser.newContext({ ...info.project.use });
    try {
      await authorize(second, fixture.authority.secondToken);
      const other = await second.newPage(); await other.goto(fixture.origin+'/studio'); await noLogin(other);
      const visitor = await second.newPage(); await visitor.goto(fixture.origin+'/shop');
      await nav(page, 'Products').click(); await page.locator('.ms-product').first().getByRole('button', { name: 'Edit product', exact: true }).click();
      await page.getByLabel('Product name', { exact: true }).fill('Synthetic direct-preview loaf');
      await page.getByLabel('Price ($)', { exact: true }).fill('12.50');
      await page.getByRole('button', { name: 'Save product live', exact: true }).click();
      await expect(visitor.getByRole('heading', { name: 'Synthetic direct-preview loaf', exact: true })).toBeVisible();
      await expect(visitor.locator('.product-card').filter({ hasText: 'Synthetic direct-preview loaf' })).toContainText('$12.50');
      await nav(other, 'Products').click(); await expect(other.getByRole('heading', { name: 'Synthetic direct-preview loaf', exact: true })).toBeVisible();
      await page.context().setExtraHTTPHeaders({ 'CF-Connecting-IP': '2001:db8::abc' });
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
  test('unverified browsers cannot read or write; session renewal preserves forms without the old login', async ({ page }) => {
    await page.route('**/api/studio-info', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic Access verification outage', previewAccessRequired: true }) }), { times: 1 });
    await page.goto(fixture.origin+'/studio');
    await expect(page.getByRole('heading', { name: 'Testing access needs verification', exact: true })).toBeVisible();
    await expect(page.getByLabel('Workspace ID', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Private access key', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Reopen Website Studio', exact: true }).click();
    await noLogin(page);
    await page.goto(fixture.origin+'/studio'); await noLogin(page);
    await nav(page, 'Products').click(); await page.locator('.ms-product').first().getByRole('button', { name: 'Edit product', exact: true }).click();
    await page.getByLabel('Product name', { exact: true }).fill('Unsaved direct-preview edit');
    await page.context().clearCookies();
    await page.context().setExtraHTTPHeaders({ 'Cf-Access-Authenticated-User-Email': 'owner-a@example.test', 'CF-Connecting-IP': '203.0.113.10' });
    await page.getByRole('button', { name: 'Check connection', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Testing access needs verification', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(0);
    const denied = await page.request.get(fixture.origin+'/api/manage/snapshot'); expect(denied.status()).toBe(403);
    const deniedWrite = await page.request.post(fixture.origin+'/api/manage/product', { headers: { Origin: fixture.origin }, data: { operationId: crypto.randomUUID() } }); expect(deniedWrite.status()).toBe(403);
    expect((await page.request.get(fixture.origin+'/studio')).status()).toBe(403);
    await page.context().setExtraHTTPHeaders({}); await authorize(page.context(), fixture.authority.token); await page.getByRole('button', { name: 'Check connection', exact: true }).click();
    await expect(page.getByLabel('Product name', { exact: true })).toHaveValue('Unsaved direct-preview edit');
    await page.getByRole('button', { name: 'Save product live', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Unsaved direct-preview edit', exact: true })).toBeVisible();
  });
  test('Cloudflare Access protection and direct Studio mode preserve the approved customer Home and Shop pixels', async ({ browser }, info) => {
    const baseline = await primaryFixture({ experience: true, management: true, hostname: 'localhost', port: 4193 });
    const context = await browser.newContext({ ...info.project.use, deviceScaleFactor: 1 });
    await authorize(context, fixture.authority.token);
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
