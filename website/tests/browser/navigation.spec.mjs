import { test, expect } from '@playwright/test';
import { productionBrowserFixture } from '../production-browser-fixture.mjs';

test('Studio-only Back/Home, all sections, form protection and browser history', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const activate = control => test.info().project.use.isMobile ? control.tap() : control.click();
  const f = await productionBrowserFixture();
  try {
    await page.setExtraHTTPHeaders({ 'X-Synthetic-Owner': 'a' });
    const snapshot = () => f.snapshot();
    // Synthetic orders and payment configuration exist only in this in-memory DB.
    expect((await f.configure()).status).toBe(200);
    f.env.REAL_CHECKOUT_ENABLED = 'true';
    expect((await f.order()).status).toBe(201);
    f.env.REAL_CHECKOUT_ENABLED = 'false';
    f.sql.prepare('INSERT INTO roost_members VALUES(?,?,?,?,?)').run('d'.repeat(48), f.env.PUBLIC_WORKSPACE_ID, JSON.stringify({ name: 'Synthetic Navigation Member', email: '', phone: '' }), 'synthetic-only-recovery', Date.now());
    const before = await snapshot();
    // An unrelated preceding document must never be the header Back destination.
    await page.goto(f.origin + '/');
    await page.goto(f.origin + '/studio#Settings%2FHelp');
    const historyNav = page.getByRole('navigation', { name: 'Studio history', exact: true });
    const back = historyNav.getByRole('button', { name: 'Back', exact: true });
    const home = historyNav.getByRole('button', { name: 'Home', exact: true });
    async function homeDashboard() {
      await expect(page.getByRole('heading', { name: 'Hi, Danielle!', exact: true })).toBeVisible();
      await expect(historyNav).toHaveCount(0);
    }
    async function controls() {
      await expect(historyNav.getByRole('button')).toHaveText(['Home', 'Back']);
      await expect(historyNav.locator('svg[aria-hidden=true]')).toHaveCount(2);
      const left = await home.boundingBox(), right = await back.boundingBox();
      expect(left.x + left.width).toBeLessThanOrEqual(right.x);
      for (const box of [left, right]) { expect(box.height).toBeGreaterThanOrEqual(44); expect(box.width).toBeGreaterThanOrEqual(44); }
    }
    await controls();
    const sectionHeader = await page.locator('.ms-top').boundingBox();
    await expect(page.getByRole('heading', { name: 'Studio Help Guide', exact: true })).toBeVisible();
    await activate(back); await homeDashboard();
    const mobile = page.viewportSize().width < 900;
    if (mobile) expect((await page.locator('.ms-top').boundingBox()).height).toBeLessThan(sectionHeader.height);
    await page.screenshot({ path: `qa-results/navigation-home-${test.info().project.name}.png`, scale: 'css' });
    // Home edits are separate views and must retain navigation controls.
    await activate(page.getByRole('button', { name: 'Edit daily announcement', exact: true }));
    await controls();
    await activate(page.getByRole('button', { name: 'Cancel', exact: true }));
    await homeDashboard();
    const nav = page.getByRole('navigation', { name: mobile ? 'Primary Studio navigation' : 'Studio navigation', exact: true });
    async function section(name) {
      if (mobile && !['Home','Orders','Products','Calendar','More'].includes(name)) await activate(nav.getByRole('button', { name: 'More', exact: true }));
      if (mobile && !['Home','Orders','Products','Calendar','More'].includes(name)) await activate(page.locator('.ms-main').getByRole('button', { name, exact: true }));
      else await activate(nav.getByRole('button', { name, exact: true }));
      await expect(page.locator('.ms-main h1')).toHaveText(name);
    }
    for (const name of ['Orders','Products','Calendar','The Roost','Website Content','Customer Comments','Sales Reports','Settings']) {
      await section(name);
      await controls();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await activate(home); await homeDashboard();
    }
    await section('Orders');
    if (mobile) await activate(page.locator('.ms-order-card').first());
    else await activate(page.locator('.ms-order-table button').first());
    await expect(page.getByRole('heading', { name: before.orders[0].orderNumber, exact: true })).toBeVisible();
    await activate(back); await expect(page.getByRole('heading', { name: 'Orders', exact: true })).toBeVisible();
    await page.goForward(); await expect(page.getByRole('heading', { name: before.orders[0].orderNumber, exact: true })).toBeVisible();
    await activate(home);
    await section('The Roost');
    await activate(page.locator('.ms-main').getByRole('button', { name: /Synthetic Navigation Member/ }));
    await expect(page.getByRole('heading', { name: 'Synthetic Navigation Member', exact: true })).toBeVisible();
    await activate(back); await expect(page.getByRole('heading', { name: 'The Roost', exact: true })).toBeVisible();
    await activate(home);
    for (const [area, action] of [['Calendar', 'Add special pickup'], ['Website Content', 'Edit website content'], ['Settings', 'Edit business days'], ['Products', 'Edit daily announcement'], ['Settings', 'Edit PayPal link']]) {
      await section(area);
      if (action === 'Edit PayPal link') await activate(page.getByRole('button', { name: 'Payments', exact: true }));
      await activate(page.getByRole('button', { name: action, exact: true }));
      await expect(page.locator('.ms-edit')).toBeVisible();
      await controls();
      page.once('dialog', dialog => dialog.dismiss()); await activate(home);
      await expect(page.locator('.ms-edit')).toBeVisible();
      await controls();
      page.once('dialog', dialog => dialog.accept()); await activate(back);
      await expect(page.locator('.ms-edit')).toHaveCount(0);
      await page.goForward(); await expect(page.locator('.ms-edit')).toBeVisible();
      await activate(page.getByRole('button', { name: 'Cancel', exact: true }));
      await activate(home);
    }
    await section('Settings');
    await activate(page.getByRole('button', { name: 'Payments', exact: true }));
    await expect(page.getByRole('heading', { name: 'Payments', exact: true })).toBeVisible();
    await activate(back); await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await activate(page.getByRole('button', { name: 'Studio Help Guide', exact: true }));
    await activate(back); await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await page.goForward(); await expect(page.getByRole('heading', { name: 'Studio Help Guide', exact: true })).toBeVisible();
    await page.goBack(); await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await activate(home); await section('Products');
    await activate(page.locator('.ms-product').first().getByRole('button', { name: 'Edit product', exact: true }));
    const input = page.locator('.ms-edit input').first();
    await input.fill('Navigation unfinished draft');
    page.once('dialog', dialog => dialog.dismiss()); await activate(home);
    await expect(input).toHaveValue('Navigation unfinished draft');
    const editIndex = await page.evaluate(() => history.state.rrStudio.index);
    page.once('dialog', dialog => dialog.dismiss()); await page.goBack();
    await expect(input).toHaveValue('Navigation unfinished draft');
    // Let the canceled traversal return to the edit entry before the next action.
    await expect.poll(() => page.evaluate(() => history.state.rrStudio.index)).toBe(editIndex);
    page.once('dialog', dialog => dialog.accept()); await activate(back);
    await expect(page.locator('.ms-edit')).toHaveCount(0);
    await page.goForward(); await expect(input).toHaveValue('Navigation unfinished draft');
    await activate(page.getByRole('button', { name: 'Cancel', exact: true }));
    await activate(home);
    await homeDashboard();
    await section('Settings');
    await activate(page.getByRole('button', { name: 'Studio Help Guide', exact: true }));
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Studio Help Guide', exact: true })).toBeVisible();
    await page.goBack(); await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await page.goForward(); await expect(page.getByRole('heading', { name: 'Studio Help Guide', exact: true })).toBeVisible();
    await activate(home);
    expect(errors).toEqual([]);
    const after = await snapshot();
    expect(after.revision).toBe(before.revision); expect(after.ledgerVersion).toBe(before.ledgerVersion);
    expect(after.orders).toEqual(before.orders); expect(after.published).toEqual(before.published); expect(after.management.settings).toEqual(before.management.settings); expect(after.management.members).toEqual(before.management.members);
    await section('Settings');
    await controls();
    await home.focus(); await expect(home).toBeFocused();
    await page.keyboard.press('Tab'); await expect(back).toBeFocused();
    await page.screenshot({ path: `qa-results/navigation-${test.info().project.name}.png`, scale: 'css' });
    await activate(home); await homeDashboard();
  } finally { await f.close(); }
});
