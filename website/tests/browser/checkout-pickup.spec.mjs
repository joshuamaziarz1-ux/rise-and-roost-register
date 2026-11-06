import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { productionBrowserFixture } from '../production-browser-fixture.mjs';
import { localInstant } from '../../public/model.mjs';

const policy = 'I have read and acknowledge the Rise & Roost Pickup Policy';
const choices = page => page.getByRole('group', { name: 'Choose your pickup', exact: true });
const selected = page => page.locator('.pickup-date[aria-pressed="true"]');
const action = page => page.getByRole('button', { name: 'Place preorder', exact: true });
const tap = (locator, info) => info.project.use.hasTouch ? locator.tap() : locator.click();
async function basket(page, f, products) {
  await page.goto(f.origin + '/shop');
  for (const p of products) await page.getByRole('button', { name: 'Add ' + p.name + ' to basket', exact: true }).click();
  await page.locator('.basket-link').click();
}

test('date taps persist, validate fields and payment choices, and submit the exact pickup once', async ({ page }, info) => {
  const f = await productionBrowserFixture(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    for (const [provider, url] of Object.entries({paypal:'https://paypal.me/SyntheticCheckout',venmo:'https://venmo.com/u/SyntheticCheckout',cashapp:'https://cash.app/$SyntheticCheckout'}))
      expect((await f.configure(provider,url)).status).toBe(200);
    f.env.REAL_CHECKOUT_ENABLED = 'true'; // Disposable local fixture only.
    const site = (await f.call('/api/site')).data, p = site.document.products[0], pickup = site.document.pickups[1];
    await basket(page, f, [p]);
    await expect(page.locator('select#pickup-select')).toHaveCount(0);
    const card = choices(page).locator('[data-pickup-id="' + pickup.id + '"]');
    await tap(card, info);
    await expect(card).toHaveAttribute('aria-pressed', 'true');
    expect((await card.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await expect(action(page)).toBeDisabled();
    await page.getByLabel('Name', { exact:true }).fill('Synthetic Pickup Customer');
    await expect(action(page)).toBeDisabled();
    await page.getByLabel(policy, { exact:true }).check();
    await expect(action(page)).toBeEnabled();
    await page.getByLabel('Email (optional)', { exact:true }).fill('invalid');
    await expect(action(page)).toBeDisabled();
    await page.getByLabel('Email (optional)', { exact:true }).fill('');
    await page.getByLabel(policy, { exact:true }).uncheck();
    await expect(action(page)).toBeDisabled();
    await page.getByLabel(policy, { exact:true }).check();
    for (const method of ['Venmo','Cash App','PayPal']) {
      await page.getByRole('button', { name:method, exact:true }).click();
      await expect(selected(page)).toHaveAttribute('data-pickup-id',pickup.id);
      await expect(page.getByLabel('Name', { exact:true })).toHaveValue('Synthetic Pickup Customer');
      await expect(action(page)).toBeEnabled();
    }
    // A date near the end of the rolling calendar stays visible after redraws.
    const later = choices(page).getByRole('button').last();
    await tap(later, info);
    await expect(action(page)).toBeEnabled();
    await page.getByRole('button', { name:'PayPal', exact:true }).click();
    const bounds = await choices(page).boundingBox(), picked = await selected(page).boundingBox();
    expect(picked.y).toBeGreaterThanOrEqual(bounds.y);
    expect(picked.y + picked.height).toBeLessThanOrEqual(bounds.y + bounds.height + 1);
    await tap(card, info);
    await expect(action(page)).toBeEnabled();
    const retryId = await page.evaluate(() => JSON.parse(localStorage.getItem('rr-beta-cart:')).requestId);
    await tap(card, info);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rr-beta-cart:')).requestId)).toBe(retryId);
    await page.reload();
    await expect(selected(page)).toHaveAttribute('data-pickup-id', pickup.id);
    await page.getByLabel('Name', { exact:true }).fill('Synthetic Pickup Customer');
    await page.getByLabel(policy, { exact:true }).check();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await mkdir('qa-results/checkout', {recursive:true});
    await page.screenshot({path:'qa-results/checkout/cards-'+info.project.name+'.png',fullPage:true});
    let submissions = 0, payload, release;
    const pending = new Promise(resolve => release = resolve);
    await page.route('**/api/orders', async route => {
      submissions++; payload = route.request().postDataJSON();
      const response = await route.fetch();
      await pending;
      await route.fulfill({response});
    });
    await action(page).evaluate(el => { el.click(); el.click(); });
    await expect.poll(() => submissions).toBe(1);
    // A background availability refresh must not unlock a pending order.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('button', { name: 'Placing your order…', exact: true })).toBeDisabled();
    release();
    await expect(page.getByRole('heading', {name:'Thank you. Your preorder is in.',exact:true})).toBeVisible();
    expect(payload.pickupId).toBe(pickup.id);
    const snapshot = await f.snapshot();
    expect(snapshot.orders).toHaveLength(1);
    expect(snapshot.orders[0].pickup.id).toBe(pickup.id);
    expect(snapshot.orders[0].pickup.date).toBe(pickup.date);
    expect(snapshot.orders[0].lines[0].productId).toBe(p.id);
    const replay = await f.call('/api/orders', payload);
    expect(replay.status).toBe(200); expect(replay.data.id).toBe(snapshot.orders[0].id);
    expect((await f.snapshot()).orders).toHaveLength(1);
    await page.getByRole('link',{name:'Pay & track your order',exact:true}).click();
    await expect(page.getByRole('link',{name:'Open PayPal',exact:true})).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await f.close(); }
});

test('mixed product capacity, quantity changes, live closures and empty availability stay valid', async ({ page }, info) => {
  const f = await productionBrowserFixture();
  try {
    const initial = await f.snapshot(), [bread, eggs] = initial.published.products;
    for (const p of [bread,eggs]) expect((await f.change('product',{product:{...p,sellingMethod:'preorder',capacity:5,archived:false,soldOut:false}})).status).toBe(200);
    const current = await f.snapshot();
    const dates = current.management.pickups.filter(p => !p.closed && localInstant(p.cutoffDate,p.cutoffTime)>Date.now());
    expect((await f.change('calendar-date',{pickup:{...dates[0],productionLimits:{[bread.id]:1}}})).status).toBe(200);
    expect((await f.change('calendar-date',{pickup:{...dates[1],productionLimits:{[eggs.id]:0}}})).status).toBe(200);
    expect((await f.change('calendar-date',{pickup:{...dates[2],closed:true}})).status).toBe(200);
    expect((await f.change('calendar-date',{pickup:{...dates[3],capacity:0,dailyCapacity:0}})).status).toBe(200);
    await basket(page,f,[bread,eggs]);
    await expect(selected(page)).toHaveAttribute('data-pickup-id',dates[0].id);
    for (const p of dates.slice(1,4)) await expect(choices(page).locator('[data-pickup-id="'+p.id+'"]')).toHaveCount(0);
    await page.getByLabel('Quantity '+bread.name,{exact:true}).fill('2');
    await page.getByLabel('Quantity '+bread.name,{exact:true}).press('Tab');
    await expect(choices(page).locator('[data-pickup-id="'+dates[0].id+'"]')).toHaveCount(0);
    await expect(selected(page)).toHaveAttribute('data-pickup-id',dates[4].id);
    expect((await f.change('calendar-date',{pickup:{...dates[4],closed:true}})).status).toBe(200);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(selected(page)).toHaveAttribute('data-pickup-id',dates[5].id);
    await page.getByLabel('Quantity '+bread.name,{exact:true}).fill('6');
    await page.getByLabel('Quantity '+bread.name,{exact:true}).press('Tab');
    await expect(page.getByRole('status').filter({hasText:'No eligible pickup dates'})).toBeVisible();
    await expect(choices(page)).toHaveCount(0); await expect(action(page)).toBeDisabled();
    expect((await f.snapshot()).orders).toHaveLength(0);
  } finally { await f.close(); }
});

test('production activation and ordering pause remain enforced with a clear empty message', async ({ page }) => {
  const f = await productionBrowserFixture();
  try {
    await f.configure();
    const p = (await f.call('/api/site')).data.document.products[0];
    await basket(page,f,[p]);
    await page.getByLabel('Name',{exact:true}).fill('Synthetic Closed Checkout');
    await page.getByLabel(policy,{exact:true}).check();
    await expect(action(page)).toBeDisabled();
    expect((await f.change('calendar',{pickups:(await f.snapshot()).published.pickups,paused:true})).status).toBe(200);
    await page.reload();
    await expect(page.getByRole('status').filter({hasText:'Ordering is currently paused'})).toBeVisible();
    await expect(choices(page)).toHaveCount(0); await expect(action(page)).toBeDisabled();
    expect((await f.snapshot()).orders).toHaveLength(0);
  } finally { await f.close(); }
});

test('payment cards expose availability, retain keyboard focus, and fit narrow screens', async ({ page }, info) => {
  const f = await productionBrowserFixture();
  try {
    await f.configure();
    f.env.REAL_CHECKOUT_ENABLED = 'true';
    const p = (await f.call('/api/site')).data.document.products[0];
    await basket(page, f, [p]);
    const payments = page.getByRole('group', {name:'Choose payment method', exact:true});
    await expect(payments.getByRole('button', {name:'Venmo',exact:true})).toBeDisabled();
    await expect(payments.getByRole('button', {name:'Cash App',exact:true})).toBeDisabled();
    await expect(payments.getByRole('button', {name:'PayPal',exact:true})).toHaveAttribute('aria-pressed','true');
    await mkdir('qa-results/checkout', {recursive:true});
    await page.screenshot({path:`qa-results/checkout/unavailable-${info.project.name}.png`,fullPage:true});
    for (const [method,url] of [['venmo','https://venmo.com/u/SyntheticCheckout'],['cashapp','https://cash.app/$SyntheticCheckout']]) await f.configure(method,url);
    await page.reload();
    await page.getByLabel('Name',{exact:true}).fill('Synthetic Keyboard Customer');
    await page.getByLabel('Email (optional)',{exact:true}).fill('invalid');
    await expect(action(page)).toBeDisabled();
    await page.getByLabel('Email (optional)',{exact:true}).evaluate(el=>el.reportValidity());
    await page.screenshot({path:`qa-results/checkout/validation-${info.project.name}.png`,fullPage:true});
    await page.getByLabel('Email (optional)',{exact:true}).fill('');
    await page.getByLabel(policy,{exact:true}).check();
    for (const name of ['PayPal','Venmo','Cash App']) {
      const card=payments.getByRole('button',{name,exact:true});
      await card.focus();await card.press('Space');
      await expect(card).toBeFocused();
      await expect(card).toHaveAttribute('aria-pressed','true');
      await expect(payments.locator('[aria-pressed="true"]')).toHaveCount(1);
      await expect(action(page)).toBeEnabled();
      const box=await card.boundingBox();expect(box.height).toBeGreaterThanOrEqual(44);expect(box.width).toBeGreaterThanOrEqual(44);
      await page.screenshot({path:`qa-results/checkout/${name.replace(' ','-')}-${info.project.name}.png`,fullPage:true});
    }
    // The next Tab reaches the policy disclosure, rather than restarting the page.
    await payments.getByRole('button',{name:'Cash App',exact:true}).press('Tab');
    await expect(page.locator('.checkout-policy summary')).toBeFocused();
    const originalViewport=page.viewportSize();
    for (const width of [320,375,390,768,1440]) {
      await page.setViewportSize({width,height:900});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    }
    await page.setViewportSize(originalViewport);
    await page.screenshot({path:`qa-results/checkout/ready-${info.project.name}.png`,fullPage:true});
    expect((await f.snapshot()).orders).toHaveLength(0);
  } finally { await f.close(); }
});
