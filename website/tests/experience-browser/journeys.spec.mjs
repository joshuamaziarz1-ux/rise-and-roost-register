import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { installTestPasskey } from '../install-test-passkey.mjs';
const origin = process.env.RR_EXPERIENCE_PREVIEW_URL;
if (origin !== 'https://rise-roost-experience-preview.joshua-maziarz1.workers.dev') throw new Error('Only the separate preview is an allowed target.');

async function freshWorkspace(browser, info) {
  const owner = await browser.newContext({ ...info.project.use, baseURL: origin });
  const r = await owner.request.post(origin+'/api/workspaces', { headers: { Origin: origin }, data: {} });
  expect(r.status()).toBe(201);
  const site = await r.json();
  expect(site.id).not.toBe('2a7ca191c1639aaf023b02d96bcd9519fe099333302d9204');
  expect(site.id).not.toBe('be1fcd22410ed1f18cab57eddf780aa840c2b2213ab123ae');
  return { owner, site, prefix: '/demo/'+site.id };
}
async function selectPickup(page) {
  const pickup = page.getByLabel('Choose your pickup', { exact: true });
  await pickup.selectOption(await pickup.locator('option:not([disabled])').nth(1).getAttribute('value'));
}
async function pickupAddress(page) {
  const location = page.getByRole('region', { name: 'Pickup Location', exact: true });
  await expect(location).toContainText('Rise & Roost');
  await expect(location).toContainText('3431 County Rd. 60');
  await expect(location).toContainText('Auburn, IN 46706');
  expect(decodeURIComponent(await location.getByRole('link').getAttribute('href'))).toContain('3431 County Rd. 60, Auburn, IN 46706');
}

test('hosted HTTPS guest and member shopping, private tracking, remembered session and Studio isolation', async ({ page, browser }, info) => {
  const { owner, site, prefix } = await freshWorkspace(browser, info), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await installTestPasskey(page, info, origin);
  try {
    // Read-only checks on the actual landing site; all orders/accounts below use
    // a newly created synthetic workspace, never an existing workspace.
    expect((await page.goto(origin+'/')).status()).toBe(200);
    await expect(page.locator('.home-choices a')).toHaveCount(3);
    await expect(page.locator('.product-card, .quick-add, .comment-form')).toHaveCount(0);
    await mkdir('qa-results/experience-hosted', { recursive: true });
    await page.screenshot({ path: `qa-results/experience-hosted/public-home-${info.project.name}.png`, fullPage: true });
    await page.locator('.home-choices').getByRole('link', { name: 'Start Shopping', exact: true }).click();
    await expect(page).toHaveURL(origin+'/shop');
    await expect(page.locator('.product-card').first()).toBeVisible();
    await expect(page.locator('nav [aria-current="page"]')).toHaveText('Shop');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({ path: `qa-results/experience-hosted/public-shop-${info.project.name}.png`, fullPage: true });
    const r = await page.goto(origin+prefix+'/'); expect(r.status()).toBe(200);
    await expect(page.locator('.home-choices a')).toHaveCount(3);
    await expect(page.locator('.product-card, .quick-add, .comment-form')).toHaveCount(0);
    await expect(page.locator('main .site-section')).toHaveCount(1);
    await expect(page.locator('.site-header nav')).toHaveCount(0);
    await mkdir('qa-results/experience-hosted', { recursive: true });
    await page.screenshot({ path: `qa-results/experience-hosted/home-${info.project.name}.png`, fullPage: true });
    await page.locator('.home-choices').getByRole('link', { name: 'Start Shopping', exact: true }).click();
    await expect(page).toHaveURL(origin+prefix+'/shop');
    await expect(page.getByRole('heading', { level: 1, name: 'Shop', exact: true })).toBeVisible();
    await expect(page.locator('nav [aria-current="page"]')).toHaveText('Shop');
    await expect(page.locator('.product-card')).toHaveCount(3);
    await page.screenshot({ path: `qa-results/experience-hosted/shop-${info.project.name}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Add Slow Sunday sourdough to basket', exact: true }).click();
    await page.getByRole('link', { name: 'Rise & Roost home', exact: true }).click();
    await expect(page.locator('.product-card')).toHaveCount(0);
    await expect(page.locator('.basket-count')).toHaveText('1');
    await page.locator('.home-choices').getByRole('link', { name: 'Start Shopping', exact: true }).click();
    await page.locator('.basket-link').click();
    await pickupAddress(page);
    await page.getByLabel('Name', { exact: true }).fill('Synthetic Guest Neighbor');
    await selectPickup(page);
    await page.getByRole('button', { name: 'Place preorder', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Thank you. Your preorder is in.' })).toBeVisible();
    await pickupAddress(page);
    const guestTracking = await page.getByRole('link', { name: 'Track your order', exact: true }).getAttribute('href');
    await page.getByRole('link', { name: 'Track your order', exact: true }).click();
    await page.getByRole('button', { name: "I've Sent Payment", exact: true }).click();
    await expect(page.getByLabel('Current order status', { exact: true })).toContainText('Payment Reported');
    await pickupAddress(page);
    await expect(page.getByLabel('Current order status', { exact: true })).toContainText('has not been accepted or processed');
    await expect(page.getByLabel('Paid receipt', { exact: true })).toHaveCount(0);
    const otherContext = await browser.newContext({ ...info.project.use, baseURL: origin });
    try {
      const other = await otherContext.newPage(); await other.goto(origin+guestTracking);
      await expect(other.getByLabel('Current order status', { exact: true })).toContainText('Payment Reported');
    } finally { await otherContext.close(); }
    await page.goto(origin+prefix+'/roost');
    await page.getByLabel('Name', { exact: true }).fill('Synthetic Member Neighbor');
    await page.getByLabel('Email (optional)', { exact: true }).fill('qa@example.test');
    await page.getByRole('button', { name: 'Join with a passkey', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back, Synthetic.' })).toBeVisible();
    await page.getByRole('button', { name: 'I saved my recovery key', exact: true }).click();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Welcome back, Synthetic.' })).toBeVisible();
    expect((await page.request.get(origin+'/api/studio')).status()).toBe(401);
    await page.goto(origin+prefix+'/shop');
    await page.getByRole('button', { name: 'Add A dozen little sunrises to basket', exact: true }).click();
    await page.locator('.basket-link').click();
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Synthetic Member Neighbor');
    await expect(page.getByRole('button', { name: 'Use my Roost details', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await selectPickup(page);
    await page.getByRole('button', { name: 'Place preorder', exact: true }).click();
    await page.getByRole('link', { name: 'View my Roost orders', exact: true }).click();
    await expect(page.locator('.member-order')).toHaveCount(1);
    await expect(page.locator('.member-order')).toContainText('A dozen little sunrises');
    await page.locator('#notice').evaluate(el => el.className='');
    await mkdir('qa-results/experience-hosted', { recursive: true });
    await page.screenshot({ path: `qa-results/experience-hosted/roost-${info.project.name}.png`, fullPage: true });
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.getByRole('button', { name: 'Sign out of The Roost', exact: true }).click();
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('');
    await page.getByRole('button', { name: 'Sign in with a passkey', exact: true }).click();
    await expect(page.locator('.member-order')).toHaveCount(1);
    const orders = await (await owner.request.get(origin+'/api/studio', { headers: { 'X-RR-Workspace': site.id } })).json();
    expect(orders.orders).toHaveLength(2);
    expect(errors).toEqual([]);
  } finally { await owner.close(); }
});

test('hosted HTTPS comments require Studio approval and hiding preserves the original text', async ({ page, browser }, info) => {
  const { owner, site, prefix } = await freshWorkspace(browser, info);
  try {
    await page.goto(origin+prefix+'/comments');
    await page.getByLabel('Your name', { exact: true }).fill('Synthetic Neighbor');
    await page.getByLabel('Your comment', { exact: true }).fill('Synthetic hosted review comment. <b>Shared as text.</b>');
    await page.getByLabel('My name and comment may be shared after review.').check();
    await page.getByRole('button', { name: 'Send comment', exact: true }).click();
    await expect(page.getByText('Your comment is waiting for Danielle’s review.')).toBeVisible();
    await expect(page.locator('.neighbor-notes')).not.toContainText('Synthetic hosted review comment.');
    const studio = await owner.newPage(); await studio.goto(origin+'/studio?workspace='+site.id);
    await studio.getByRole('navigation', { name: 'Studio navigation' }).getByRole('button', { name: 'Comments', exact: true }).click();
    await studio.getByRole('button', { name: 'Approve comment', exact: true }).click();
    await expect(studio.getByText('Visible on website', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.locator('.neighbor-notes')).toContainText('Synthetic hosted review comment.');
    await expect(page.locator('.neighbor-notes b')).toHaveCount(0);
    await studio.getByRole('button', { name: 'Hide comment', exact: true }).click();
    await expect(studio.getByText('Hidden', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.locator('.neighbor-notes')).not.toContainText('Synthetic hosted review comment.');
    const saved = await (await owner.request.get(origin+'/api/studio-comments', { headers: { 'X-RR-Workspace': site.id } })).json();
    expect(saved.comments[0].body).toContain('Shared as text.');
  } finally { await owner.close(); }
});
