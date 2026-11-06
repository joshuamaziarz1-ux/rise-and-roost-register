import { test, expect } from '@playwright/test';
import { primaryFixture } from '../primary-fixture.mjs';
test('Settings-only help, real search, categories, keyboard and unchanged business state', async ({ page }) => {
  const fixture = await primaryFixture({ experience: true, management: true, port: 4309, hostname: 'localhost' });
  try {
    const headers = { Origin: fixture.origin, 'X-RR-Workspace': fixture.id };
    const login = await page.request.post(fixture.origin + '/api/login', { headers, data: { id: fixture.id, accessKey: fixture.key } });
    expect(login.status()).toBe(200);
    const before = await (await page.request.get(fixture.origin + '/api/manage/snapshot', { headers })).json();
    await page.goto(fixture.origin + '/studio?workspace=' + fixture.id);
    await expect(page.getByRole('heading', { name: 'Hi, Danielle!' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Studio Help Guide', exact: true })).toHaveCount(0);
    const nav = page.getByRole('navigation', { name: page.viewportSize().width < 900 ? 'Primary Studio navigation' : 'Studio navigation', exact: true });
    if (page.viewportSize().width < 900) await nav.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).filter({ visible: true }).click();
    await page.getByRole('button', { name: 'Studio Help Guide', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Studio Help Guide', exact: true })).toBeVisible();
    const category = page.locator('.ms-help-category').filter({ has: page.locator('summary', { hasText: /^Frequently Asked Questions/ }) });
    await category.locator('summary').focus(); await page.keyboard.press('Enter');
    await expect(category.getByRole('heading', { name: 'Why can’t customers place an order?' })).toBeVisible();
    const search = page.getByRole('searchbox', { name: 'Search the Studio Help Guide' });
    await expect(page.getByRole('button', { name: 'Clear search', exact: true })).toBeHidden();
    for (const term of ['paused', 'checkout', 'payment', 'inventory', 'sold out', 'hidden', 'pickup', 'calendar', 'deadline', 'price', 'orders', 'announcement']) {
      await search.fill(term); await expect(page.locator('.ms-help-topic').first()).toBeVisible(); await expect(search).toBeFocused();
    }
    await search.fill('missing-zxcvbnm'); await expect(page.getByText('No help topics match your search.', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Clear search', exact: true }).click(); await expect(search).toHaveValue(''); await expect(search).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `qa-results/help-${test.info().project.name}.png`, scale: 'css' });
    await page.getByRole('navigation', { name: 'Studio history', exact: true }).getByRole('button', { name: 'Back', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    const after = await (await page.request.get(fixture.origin + '/api/manage/snapshot', { headers })).json();
    expect(after.revision).toBe(before.revision); expect(after.ledgerVersion).toBe(before.ledgerVersion);
    expect(after.published).toEqual(before.published); expect(after.orders).toEqual(before.orders); expect(after.management.settings).toEqual(before.management.settings);
  } finally { await fixture.close(); }
});

test('production owner opens Settings help with closed checkout and retained Access session', async ({ page }) => {
  const { productionBrowserFixture } = await import('../production-browser-fixture.mjs');
  const { TESTER_A } = await import('../access-jwt-fixture.mjs');
  const f = await productionBrowserFixture();
  try {
    const now = Math.floor(Date.now() / 1000), issuedAt = now - 49 * 3600;
    f.setOwnerToken('a', await f.auth.mint({ email: TESTER_A, subject: 'synthetic-help-owner', issuedAt, notBefore: issuedAt, expiresAt: issuedAt + 730 * 3600 }));
    await page.setExtraHTTPHeaders({ 'X-Synthetic-Owner': 'a' });
    await page.goto(f.origin + '/studio');
    await expect(page.getByRole('heading', { name: 'Hi, Danielle!' })).toBeVisible();
    if (page.viewportSize().width < 900) await page.getByRole('navigation', { name: 'Primary Studio navigation', exact: true }).getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).filter({ visible: true }).click();
    await page.getByRole('button', { name: 'Studio Help Guide', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Studio Help Guide', exact: true })).toBeFocused();
    await page.getByRole('searchbox').fill('checkout');
    await expect(page.locator('.ms-help-topic').first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Studio Help Guide', exact: true })).toBeVisible();
    await page.getByRole('navigation', { name: 'Studio history', exact: true }).getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeFocused();
    const snapshot = await page.evaluate(async () => (await fetch('/studio/api/manage/snapshot')).json());
    expect(snapshot.checkoutEnabled).toBe(false);
    expect(f.sql.prepare('SELECT count(*) n FROM sessions').get().n).toBe(0);
  } finally { await f.close(); }
});
