import { test, expect } from '@playwright/test';
import { productionBrowserFixture } from '../production-browser-fixture.mjs';
import { TESTER_A, TESTER_B } from '../access-jwt-fixture.mjs';

const nav = (page, name) => page.getByRole('navigation', {
  name: page.viewportSize().width < 900 ? 'Primary Studio navigation' : 'Studio navigation', exact: true,
}).getByRole('button', { name, exact: true });
const lifetime = 730 * 3600;
const snapshotRequest = page => page.evaluate(async () => {
  const response = await fetch('/studio/api/manage/snapshot');
  return { status: response.status, body: await response.json() };
});

test('both owners can navigate Studio with the existing Access session duration, including a session older than one day', async ({ page }) => {
  const f = await productionBrowserFixture(), errors = [], actors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    const now = Math.floor(Date.now() / 1000);
    for (const [slot, email, subject, age, name] of [
      ['a', TESTER_A, 'synthetic-owner-a', 0, 'Synthetic Danielle'],
      ['b', TESTER_B, 'synthetic-owner-b', 49 * 3600, 'Synthetic Other Owner'],
    ]) {
      const issuedAt = now - age;
      const token = await f.auth.mint({ email, subject, issuedAt, notBefore: issuedAt, expiresAt: issuedAt + lifetime });
      f.setOwnerToken(slot, token);
      await page.setExtraHTTPHeaders({ 'X-Synthetic-Owner': slot });
      expect((await page.goto(f.origin + '/studio')).status()).toBe(200);
      await expect(page.getByRole('heading', { name: 'Hi, Danielle!', exact: true })).toBeVisible();
      await expect(page.getByLabel('Owner PIN', { exact: true })).toHaveCount(0);
      for (const destination of ['Products', 'Orders', 'Calendar']) {
        await nav(page, destination).click();
        await expect(page.locator('.ms-main').getByRole('heading', { name: destination, exact: true }).first()).toBeVisible();
      }
      const response = await snapshotRequest(page);
      expect(response.status).toBe(200);
      const snapshot = response.body;
      expect(snapshot.owner).toBe(name);
      expect(snapshot.actor.authentication).toBe('cloudflare_access');
      expect(snapshot.sessionExpiresAt).toBe(new Date((issuedAt + lifetime) * 1000).toISOString());
      expect(snapshot.checkoutEnabled).toBe(false);
      actors.push(snapshot.actor.id);
      if (page.viewportSize().width < 900) await nav(page, 'More').click();
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await expect(page.locator('.ms-main')).toContainText('Signed in as ' + name + '.');
      await expect(page.getByRole('link', { name: 'Sign out', exact: true })).toHaveAttribute('href', '/cdn-cgi/access/logout');
      const body = await page.locator('body').innerText();
      expect(body).not.toContain(email);
      expect(body).not.toContain(token);
      await page.reload();
      await expect(page.locator('#management-connection')).toHaveText('Connected');
    }
    expect(actors[0]).not.toBe(actors[1]);
    expect((await page.context().cookies()).some(cookie => cookie.name.startsWith('rr_studio'))).toBe(false);
    expect(f.sql.prepare('SELECT count(*) n FROM sessions').get().n).toBe(0);
    expect(errors).toEqual([]);
  } finally { await f.close(); }
});

test('an expired Access session blocks private APIs and retains the unsaved form through reauthentication', async ({ page }) => {
  const f = await productionBrowserFixture();
  try {
    const now = Math.floor(Date.now() / 1000), issuedAt = now - 48 * 3600;
    const mint = options => f.auth.mint({ issuedAt, notBefore: issuedAt, expiresAt: issuedAt + lifetime, ...options });
    f.setOwnerToken('a', await mint());
    await page.setExtraHTTPHeaders({ 'X-Synthetic-Owner': 'a' });
    await page.goto(f.origin + '/studio');
    await expect(page.getByRole('heading', { name: 'Hi, Danielle!', exact: true })).toBeVisible();
    await nav(page, 'Products').click();
    await page.getByRole('button', { name: 'Add product', exact: true }).click();
    const unfinished = 'Synthetic unsaved product retained after reauthentication';
    await page.getByLabel('Product name', { exact: true }).fill(unfinished);
    f.setOwnerToken('a', await mint({ expiresAt: now - 1 }));
    await page.getByRole('button', { name: 'Check connection', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sign-in required', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in to this website', exact: true })).toHaveAttribute('href', '/studio');
    const rejected = await snapshotRequest(page);
    expect(rejected.status).toBe(403);
    const denied = rejected.body;
    expect(denied.productionOwnerAccessRequired).toBe(true);
    expect(denied).not.toHaveProperty('draft');
    expect(denied).not.toHaveProperty('orders');
    f.setOwnerToken('a', await f.auth.mint({ issuedAt: now, notBefore: now, expiresAt: now + lifetime }));
    await page.getByRole('button', { name: 'Check connection', exact: true }).click();
    await expect(page.locator('#management-connection')).toHaveText('Connected');
    await expect(page.getByLabel('Product name', { exact: true })).toHaveValue(unfinished);
    expect((await snapshotRequest(page)).status).toBe(200);
    expect((await f.snapshot()).published.products.some(product => product.name === unfinished)).toBe(false);
  } finally { await f.close(); }
});
