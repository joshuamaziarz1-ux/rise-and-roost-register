import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { primaryFixture } from '../primary-fixture.mjs';
import { availableDocument } from '../../server/service.mjs';
import { localInstant } from '../../public/model.mjs';

test.describe('Phase 3 selling and pickup controls', () => {
  test.skip(!!process.env.RR_BETA_BASE_URL || !!process.env.RR_MANAGEMENT_PREVIEW_URL,
    'Phase 3 writes only to disposable local fixtures.');
  let fixture;
  test.beforeEach(async () => {
    fixture = await primaryFixture({ experience: true, management: true, port: Number(process.env.RR_PHASE3_PORT || 4199), hostname: 'localhost' });
  });
  test.afterEach(async () => { await fixture?.close(); });

  const headers = () => ({ Origin: fixture.origin, 'X-RR-Workspace': fixture.id });
  const card = (page, name) => page.locator('.product-card').filter({ has: page.getByRole('heading', { name, exact: true }) });
  const product = (page, name) => page.locator('.ms-product').filter({ has: page.getByRole('heading', { name, exact: true }) });
  const nav = (page, name) => page.getByRole('navigation', {
    name: page.viewportSize().width < 900 ? 'Primary Studio navigation' : 'Studio navigation', exact: true,
  }).getByRole('button', { name, exact: true });
  async function owner(page) {
    const login = await page.request.post(fixture.origin + '/api/login', {
      headers: headers(), data: { id: fixture.id, accessKey: fixture.key },
    });
    expect(login.status()).toBe(200);
    await page.goto(fixture.origin + '/studio?workspace=' + fixture.id);
    await expect(page.getByRole('heading', { name: 'Hi, Danielle!', exact: true })).toBeVisible();
  }
  async function snapshot(page) {
    const response = await page.request.get(fixture.origin + '/api/manage/snapshot', { headers: headers() });
    expect(response.status()).toBe(200); return response.json();
  }
  async function change(page, action, payload) {
    const current = await snapshot(page);
    const response = await page.request.post(fixture.origin + '/api/manage/' + action, {
      headers: headers(),
      data: { revision: current.revision, ledgerVersion: current.ledgerVersion, operationId: crypto.randomUUID(), ...payload },
    });
    expect(response.status(), await response.text()).toBe(200); return response.json();
  }
  async function syntheticOrder(page) {
    const current = await snapshot(page), p = current.published.products[0];
    const response = await page.request.post(fixture.origin + '/api/orders', {
      headers: headers(), data: { workspaceId: fixture.id, storefront: 'main', revision: current.publishedRevision,
        requestId: crypto.randomUUID(), pickupId: current.published.pickups[0].id, checkoutMode: 'guest',
        customerDetails: { name: 'Synthetic Phase 3 visitor' }, lines: [{ productId: p.id, variantId: p.variants[0].id, qty: 1, unitPrice: p.price }], total: p.price },
    });
    expect(response.status(), await response.text()).toBe(201);
    return (await snapshot(page)).orders[0];
  }
  async function editProduct(page, name) {
    await nav(page, 'Products').click();
    await product(page, name).getByRole('button', { name: 'Edit product', exact: true }).click();
  }
  async function saveProduct(page, name) {
    await page.getByRole('button', { name: 'Save product live', exact: true }).click();
    await expect(product(page, name)).toBeVisible();
  }
  async function noOverflow(page) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }

  test('one product switches between all selling methods, zero stays listed, and restocking restores purchasing', async ({ page, browser }, info) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await owner(page);
    const visitors = await browser.newContext({ ...info.project.use });
    try {
      const visitor = await visitors.newPage();
      const name = 'Slow Sunday sourdough';
      await editProduct(page, name);
      await expect(page.getByLabel('Selling method', { exact: true })).toHaveValue('preorder');
      await expect(page.getByLabel('Reason for stock / price adjustment', { exact: true })).toHaveCount(0);
      await expect(page.getByLabel('Archived (keeps order history)', { exact: true })).toHaveCount(0);
      await page.getByLabel('Selling method', { exact: true }).selectOption('online');
      await expect(page.getByLabel('How many can I make?', { exact: true })).toHaveCount(0);
      await page.getByLabel('How many are available?', { exact: true }).fill('0');
      await saveProduct(page, name);
      await visitor.goto(fixture.origin + '/shop');
      await expect(card(visitor, name)).toContainText('Sold Out');
      await expect(card(visitor, name).getByRole('button', { name: name + ' is sold out', exact: true })).toBeDisabled();
      await editProduct(page, name);
      await page.getByLabel('How many are available?', { exact: true }).fill('2');
      await saveProduct(page, name);
      await visitor.reload();
      await expect(card(visitor, name).getByRole('button', { name: 'Add ' + name + ' to basket', exact: true })).toBeEnabled();
      // Existing products can use a date-specific allowance above their default.
      const legacy = await snapshot(page), legacyProduct = legacy.published.products.find(p => p.id === 'bread');
      await change(page, 'product', { product: { ...legacyProduct, sellingMethod: undefined, inventoryMode: 'legacy', channel: 'preorder', capacity: 0 }, available: 2 });
      await change(page, 'calendar', { pickups: legacy.published.pickups.map(p => ({ ...p, productionLimits: { ...p.productionLimits, bread: 2 } })), paused: false });
      await visitor.reload();
      await expect(card(visitor, name).getByRole('button', { name: 'Add ' + name + ' to basket', exact: true })).toBeEnabled();
      await change(page, 'calendar', { pickups: legacy.published.pickups, paused: false });
      await page.reload();
      await editProduct(page, name);
      await page.getByLabel('Selling method', { exact: true }).selectOption('preorder');
      await expect(page.getByLabel('How many are available?', { exact: true })).toHaveCount(0);
      await page.getByLabel('How many can I make?', { exact: true }).fill('0');
      await saveProduct(page, name);
      await visitor.reload();
      await expect(card(visitor, name)).toContainText(/Sold Out|Unavailable/);
      await expect(card(visitor, name).getByRole('button', { name: name + ' is sold out', exact: true })).toBeDisabled();
      await editProduct(page, name);
      await page.getByLabel('How many can I make?', { exact: true }).fill('3');
      await saveProduct(page, name);
      await visitor.reload();
      await expect(card(visitor, name).getByRole('button', { name: 'Add ' + name + ' to basket', exact: true })).toBeEnabled();
      await editProduct(page, name);
      await page.getByLabel('Selling method', { exact: true }).selectOption('in-store');
      await expect(page.getByLabel('How many can I make?', { exact: true })).toHaveCount(0);
      await page.getByLabel('How many are in the store?', { exact: true }).fill('2');
      await saveProduct(page, name);
      await visitor.goto(fixture.origin + '/');
      const fresh = visitor.locator('.fresh-at-roost');
      await expect(fresh.getByRole('heading', { name: 'Fresh at The Roost!', exact: true })).toBeVisible();
      await expect(card(visitor, name)).toContainText('Available in Store');
      await expect(card(visitor, name)).toContainText('$9.00');
      await expect(card(visitor, name).locator('img')).toHaveCount(1);
      await expect(card(visitor, name).locator('.fresh-description')).toContainText('golden crust');
      await expect(card(visitor, name).getByRole('button')).toHaveCount(0);
      await noOverflow(visitor); await noOverflow(page);
      await mkdir('qa-results/phase3', { recursive: true });
      await visitor.screenshot({ path: `qa-results/phase3/fresh-home-${info.project.name}.png`, fullPage: true });
      await visitor.goto(fixture.origin + '/product/bread');
      await expect(visitor.locator('main')).toContainText('Available in Store');
      await expect(visitor.getByRole('button', { name: /Add.*basket/i })).toHaveCount(0);
      const current = await snapshot(page), p = current.published.products.find(p => p.id === 'bread');
      const direct = await visitor.request.post(fixture.origin + '/api/orders', {
        headers: headers(), data: { workspaceId: fixture.id, storefront: 'main', revision: current.publishedRevision,
          requestId: crypto.randomUUID(), pickupId: current.published.pickups[0].id, checkoutMode: 'guest',
          customerDetails: { name: 'Synthetic Phase 3 visitor' }, lines: [{ productId: p.id, variantId: p.variants[0].id, qty: 1, unitPrice: p.price }], total: p.price },
      });
      expect(direct.status()).toBeGreaterThanOrEqual(400);
      expect((await snapshot(page)).orders).toHaveLength(0);
      await editProduct(page, name);
      await page.getByLabel('How many are in the store?', { exact: true }).fill('0');
      await saveProduct(page, name);
      await visitor.goto(fixture.origin + '/shop');
      await expect(card(visitor, name)).toContainText('Sold Out');
      await expect(card(visitor, name).getByRole('button')).toHaveCount(0);
      await visitor.screenshot({ path: `qa-results/phase3/sold-out-shop-${info.project.name}.png`, fullPage: true });
      expect((await visitor.locator('main').innerText()).toLowerCase()).not.toContain('studio');
      expect(errors).toEqual([]);
    } finally { await visitors.close(); }
  });

  test('Fresh supports multiple products and announcements; intentional hiding preserves products and order history', async ({ page, browser }, info) => {
    await owner(page);
    const order = await syntheticOrder(page);
    let current = await snapshot(page);
    for (const p of current.published.products.slice(0, 2)) {
      await change(page, 'product', { product: { ...p, sellingMethod: 'in-store', archived: false, soldOut: false }, available: p.id === 'bread' ? 2 : 0 });
    }
    await page.reload();
    await page.getByRole('button', { name: 'Edit daily announcement', exact: true }).click();
    await page.getByLabel('Daily announcement', { exact: true }).fill('Fresh cookies available today!');
    await page.getByRole('button', { name: 'Save announcement live', exact: true }).click();
    const visitors = await browser.newContext({ ...info.project.use });
    try {
      const visitor = await visitors.newPage();
      for (const path of ['/', '/shop']) {
        await visitor.goto(fixture.origin + path);
        await expect(visitor.locator('.fresh-at-roost .product-card')).toHaveCount(2);
        await expect(visitor.locator('.fresh-at-roost')).toContainText('Fresh cookies available today!');
        await expect(card(visitor, 'A dozen little sunrises')).toContainText('Sold Out');
        await noOverflow(visitor);
      }
      await page.getByRole('button', { name: 'Edit daily announcement', exact: true }).click();
      await page.getByLabel('Daily announcement', { exact: true }).fill('');
      await page.getByRole('button', { name: 'Save announcement live', exact: true }).click();
      await visitor.reload();
      await expect(visitor.locator('.fresh-at-roost')).not.toContainText('Fresh cookies available today!');
      await nav(page, 'Products').click();
      page.once('dialog', dialog => dialog.dismiss());
      await product(page, 'Slow Sunday sourdough').getByRole('button', { name: 'Hide Product', exact: true }).click();
      await expect(product(page, 'Slow Sunday sourdough')).toBeVisible();
      page.once('dialog', dialog => dialog.accept());
      await product(page, 'Slow Sunday sourdough').getByRole('button', { name: 'Hide Product', exact: true }).click();
      await expect(product(page, 'Slow Sunday sourdough')).toHaveCount(0);
      current = await snapshot(page);
      expect(current.published.products.find(p => p.id === 'bread')).toBeTruthy();
      expect(current.orders.find(saved => saved.id === order.id).lines).toEqual(order.lines);
      expect(current.orders.find(saved => saved.id === order.id).pickup).toEqual(order.pickup);
      expect(current.management.audit.some(entry => entry.kind === 'inventory' && entry.productId === 'bread' && entry.reason)).toBe(true);
      await visitor.reload();
      await expect(card(visitor, 'Slow Sunday sourdough')).toHaveCount(0);
      await page.getByRole('button', { name: 'Hidden', exact: true }).click();
      page.once('dialog', dialog => dialog.accept());
      await product(page, 'Slow Sunday sourdough').getByRole('button', { name: 'Show Product', exact: true }).click();
      await visitor.reload();
      await expect(card(visitor, 'Slow Sunday sourdough')).toContainText('Available in Store');
    } finally { await visitors.close(); }
  });

  test('automatic pickup capacity and closures preserve commitments; special dates follow noon deadlines', async ({ page }, info) => {
    await owner(page);
    const order = await syntheticOrder(page);
    await page.reload();
    await nav(page, 'Calendar').click();
    const committed = page.locator('.ms-calendar-list > article').filter({ hasText: '1 scheduled order' });
    await expect(committed).toHaveCount(1);
    await committed.locator('summary').filter({ hasText: 'View scheduled orders' }).click();
    await expect(committed).toContainText('Synthetic Phase 3 visitor');
    await committed.getByRole('button', { name: 'Edit pickup', exact: true }).click();
    await expect(page.getByRole('note')).toContainText('1 existing order');
    await page.getByLabel('Pickup window order limit', { exact: true }).fill('15');
    await page.getByRole('button', { name: 'Save pickup live', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('existing orders');
    await expect(page.getByLabel('Pickup window order limit', { exact: true })).toHaveValue('15');
    await page.getByLabel('I understand existing orders keep their original pickup details', { exact: true }).check();
    await page.getByRole('button', { name: 'Save pickup live', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible();
    let current = await snapshot(page);
    expect(current.published.pickups.find(p => p.id === order.pickupId).capacity).toBe(15);
    expect(current.published.pickups.find(p => p.id === order.pickupId).cutoffTime).toBe('12:00');
    expect(current.orders.find(saved => saved.id === order.id).pickup).toEqual(order.pickup);
    expect(current.orders.find(saved => saved.id === order.id).pickupDeadline).toEqual(order.pickupDeadline);
    page.once('dialog', dialog => dialog.accept());
    await committed.getByRole('button', { name: 'Skip / close date', exact: true }).click();
    await expect(committed).toContainText('Closed to new orders');
    current = await snapshot(page);
    expect(current.published.pickups.find(p => p.id === order.pickupId).closed).toBe(true);
    expect(current.orders.find(saved => saved.id === order.id).pickup).toEqual(order.pickup);
    const publicSite = await (await page.request.get(fixture.origin + '/api/site')).json();
    expect(publicSite.document.pickups.some(p => p.id === order.pickupId)).toBe(false);
    await noOverflow(page);
    await mkdir('qa-results/phase3', { recursive: true });
    await page.screenshot({ path: `qa-results/phase3/calendar-${info.project.name}.png`, fullPage: true, scale: 'css' });

    await page.getByRole('button', { name: 'Add special pickup', exact: true }).click();
    const special = new Date(Date.now() + 30 * 86400000);
    special.setUTCDate(special.getUTCDate() + (7 - special.getUTCDay()) % 7);
    const newDay = special.toISOString().slice(0, 10);
    await page.getByLabel('Pickup date', { exact: true }).fill(newDay);
    await page.getByLabel('Special event name (optional)', { exact: true }).fill('Synthetic future pickup');
    await page.getByRole('button', { name: 'Save pickup live', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible();
    const added = page.locator('.ms-calendar-list > article').filter({ hasText: 'Synthetic future pickup' });
    await expect(added).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    await added.getByRole('button', { name: 'Skip / close date', exact: true }).click();
    await expect(added).toContainText('Closed to new orders');
    expect((await snapshot(page)).orders.find(saved => saved.id === order.id).lines).toEqual(order.lines);
  });

  test('a basket hides a pickup at noon and chooses the next date with unchanged server revisions and a skewed client clock', async ({ page }) => {
    await owner(page);
    const current = await snapshot(page);
    const first = current.management.pickups.find(p => !p.closed && localInstant(p.cutoffDate, p.cutoffTime) > Date.now());
    let serverNow = localInstant(first.cutoffDate, first.cutoffTime) - 1000;
    // Replay actual server eligibility results at the boundary. The independent
    // HTTP tests cover reservation rejection at the same exact instants.
    await page.route('**/api/site', async route => {
      const response = await route.fetch(), result = await response.json();
      result.document = availableDocument(current.published, { orders: [] }, { managed: true, now: serverNow });
      result.serverNow = serverNow;
      await route.fulfill({ response, json: result });
    });
    await page.clock.install({ time: new Date(serverNow - 12 * 3600000 - 60000) });
    await page.clock.pauseAt(new Date(serverNow - 12 * 3600000));
    await page.goto(fixture.origin + '/shop');
    await card(page, current.published.products[0].name).getByRole('button', { name: 'Add ' + current.published.products[0].name + ' to basket', exact: true }).click();
    await page.getByRole('link', { name: /^Basket/ }).first().click();
    await expect(page.locator('#pickup-select')).toHaveValue(first.id);
    const retryId = await page.evaluate(() => JSON.parse(localStorage.getItem('rr-beta-cart:')).requestId);
    serverNow += 2000;
    await page.clock.runFor(2000);
    await expect(page.locator('#pickup-select option[value="' + first.id + '"]')).toHaveCount(0);
    const expected = availableDocument(current.published, { orders: [] }, { managed: true, now: serverNow }).pickups[0];
    await expect(page.locator('#pickup-select')).toHaveValue(expected.id);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rr-beta-cart:')).requestId)).toBe(retryId);
  });

  test('a basket with two preorder products chooses a date with enough capacity for both', async ({ page }) => {
    await owner(page);
    let current = await snapshot(page);
    for (const product of current.published.products.slice(0, 2)) {
      await change(page, 'product', { product: { ...product, sellingMethod: 'preorder', capacity: 2, archived: false, soldOut: false } });
    }
    current = await snapshot(page);
    const pickups = current.management.pickups.filter(p => !p.closed && localInstant(p.cutoffDate, p.cutoffTime) > Date.now());
    const [bread, eggs] = current.published.products;
    await change(page, 'calendar-date', { pickup: { ...pickups[0], productionLimits: { [bread.id]: 0 } } });
    await change(page, 'calendar-date', { pickup: { ...pickups[1], productionLimits: { [eggs.id]: 0 } } });
    await page.goto(fixture.origin + '/shop');
    for (const product of [bread, eggs]) await card(page, product.name).getByRole('button', { name: 'Add ' + product.name + ' to basket', exact: true }).click();
    await page.getByRole('link', { name: /^Basket/ }).first().click();
    await expect(page.locator('#pickup-select')).toHaveValue(pickups[2].id);
    await expect(page.locator('#pickup-select option[value="' + pickups[0].id + '"]')).toHaveCount(0);
    await expect(page.locator('#pickup-select option[value="' + pickups[1].id + '"]')).toHaveCount(0);
  });
});
