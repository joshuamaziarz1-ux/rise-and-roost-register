import { test, expect } from '@playwright/test';
import { primaryFixture } from '../primary-fixture.mjs';
import { installTestPasskey } from '../install-test-passkey.mjs';
import { mkdir } from 'node:fs/promises';

test.describe('isolated customer experience', () => {
  test.skip(!!process.env.RR_BETA_BASE_URL, 'Never run new experience tests against the existing beta.');
  let fixture;
  test.beforeEach(async () => { fixture = await primaryFixture({ experience: true, port: 4184, hostname: 'localhost' }); });
  test.afterEach(async () => { await fixture?.close(); });
  async function owner(browser, info) {
    const context = await browser.newContext({ ...info.project.use, baseURL: fixture.origin });
    const r = await context.request.post(fixture.origin+'/api/login', { headers: { Origin: fixture.origin }, data: { id: fixture.id, accessKey: fixture.key } });
    expect(r.status()).toBe(200); return context;
  }
  const authenticator = (page, info) => installTestPasskey(page, info, fixture.origin);
  async function pickup(page) {
    const select = page.getByLabel('Choose your pickup', { exact: true });
    await select.selectOption(await select.locator('option:not([disabled])').nth(1).getAttribute('value'));
  }
  async function imageCheck(page) {
    await expect.poll(() => page.locator('.product-image img').evaluateAll(imgs => imgs.every(i => i.complete && i.naturalWidth > 0))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1)).toBe(true);
  }
  async function pickupAddress(page) {
    const location = page.getByRole('region', { name: 'Pickup Location', exact: true });
    await expect(location).toContainText('Rise & Roost');
    await expect(location).toContainText('3431 County Rd. 60');
    await expect(location).toContainText('Auburn, IN 46706');
    const directions = location.getByRole('link');
    expect(decodeURIComponent(await directions.getAttribute('href'))).toContain('3431 County Rd. 60, Auburn, IN 46706');
    const agent = await page.evaluate(() => navigator.userAgent);
    await expect(directions).toHaveAttribute('href', /Android/i.test(agent) ? /^geo:/ : /iPhone|iPad|iPod|Macintosh/i.test(agent) ? /^https:\/\/maps.apple.com\// : /^https:\/\/www.google.com\/maps\/dir\//);
  }

  test('guest journey: three homepage choices, quick add, one checkout, private tracking and reported payment', async ({ page, browser }, info) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(fixture.origin+'/');
    const choices = page.locator('.home-choices');
    await expect(choices.getByRole('link')).toHaveCount(3);
    await expect(choices.getByRole('link', { name: 'The Roost', exact: true })).toBeVisible();
    await expect(choices.getByRole('link', { name: 'Leave a Comment', exact: true })).toBeVisible();
    await expect(page.locator('main .site-section')).toHaveCount(1);
    await expect(page.locator('.product-card, .quick-add, .comment-form')).toHaveCount(0);
    await expect(page.locator('.site-header nav, .site-header .basket-link')).toHaveCount(0);
    await expect(page.locator('.art-label')).toHaveCount(0);
    await expect(page).toHaveTitle('Rise & Roost · Home');
    const lastChoice = await choices.getByRole('link', { name: 'Leave a Comment', exact: true }).boundingBox();
    expect(lastChoice.y + lastChoice.height).toBeLessThan(page.viewportSize().height);
    await mkdir('qa-results/customer', { recursive: true });
    await page.screenshot({ path: `qa-results/customer/home-${info.project.name}.png`, fullPage: true });
    await choices.getByRole('link', { name: 'Start Shopping', exact: true }).click();
    await expect(page).toHaveURL(fixture.origin+'/shop');
    await expect(page).toHaveTitle('Rise & Roost · Shop');
    await expect(page.getByRole('heading', { level: 1, name: 'Shop', exact: true })).toBeVisible();
    await expect(page.locator('.home-choices')).toHaveCount(0);
    await expect(page.locator('nav [aria-current="page"]')).toHaveText('Shop');
    await imageCheck(page);
    await page.screenshot({ path: `qa-results/customer/shop-${info.project.name}.png`, fullPage: true });
    const bread = page.locator('.product-card').filter({ has: page.getByRole('heading', { name: 'Slow Sunday sourdough', exact: true }) });
    await bread.getByLabel('Choose variety for Slow Sunday sourdough').selectOption('rosemary');
    await bread.getByRole('button', { name: 'Add Slow Sunday sourdough to basket', exact: true }).click();
    await expect(page.locator('.basket-count')).toHaveText('1');
    await page.locator('.basket-link').click();
    await pickupAddress(page);
    await expect(page.getByRole('button', { name: 'Guest checkout', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('No account needed.', { exact: true })).toBeVisible();
    await page.getByLabel('Name', { exact: true }).fill('Guest Neighbor');
    await pickup(page);
    await expect(page.locator('.total')).toContainText('$10.00');
    await page.screenshot({ path: `qa-results/customer/guest-checkout-${info.project.name}.png`, fullPage: true });
    await page.getByLabel('Name', { exact: true }).press('Enter');
    await expect(page.getByRole('heading', { name: 'Thank you. Your preorder is in.' })).toBeVisible();
    await pickupAddress(page);
    const tracking = await page.getByRole('link', { name: 'Track your order', exact: true }).getAttribute('href');
    expect((await page.request.get(fixture.origin+'/api/roost/me?workspace='+fixture.id)).status()).toBe(200);
    expect((await (await page.request.get(fixture.origin+'/api/roost/me?workspace='+fixture.id)).json()).member).toBeNull();
    expect((await page.request.get(fixture.origin+'/api/studio')).status()).toBe(401);
    await page.getByRole('link', { name: 'Track your order', exact: true }).click();
    await page.getByRole('button', { name: "I've Sent Payment", exact: true }).click();
    await expect(page.getByLabel('Current order status', { exact: true })).toContainText('Payment Reported');
    await pickupAddress(page);
    await page.getByRole('region', { name: 'Pickup Location', exact: true }).screenshot({ path: `qa-results/customer/pickup-location-${info.project.name}.png` });
    await expect(page.getByLabel('Current order status', { exact: true })).toContainText('has not been accepted or processed');
    const second = await browser.newContext({ ...info.project.use, baseURL: fixture.origin });
    try {
      const other = await second.newPage(); await other.goto(fixture.origin+tracking);
      await expect(other.getByLabel('Current order status', { exact: true })).toContainText('Payment Reported');
      await expect(other.getByLabel('Paid receipt', { exact: true })).toHaveCount(0);
    } finally { await second.close(); }
    await page.goto(fixture.origin+'/cart');
    await expect(page.getByText('Your basket is waiting for something good.')).toBeVisible();
    // Keep navigation/reload coverage in its own browser context. Playwright's
    // Linux WebKit crashes some multi-entry pushState histories on a subsequent
    // full navigation, reproducible on empty HTML without any website code.
    const navigation = await browser.newContext({ ...info.project.use, baseURL: fixture.origin });
    try {
      const nav = await navigation.newPage();
      await nav.goto(fixture.origin+'/shop'); await nav.reload();
      await expect(nav.locator('.product-card')).toHaveCount(3);
      await nav.getByRole('button', { name: 'Add Slow Sunday sourdough to basket', exact: true }).click();
      await nav.getByRole('link', { name: 'Rise & Roost home', exact: true }).click();
      await expect(nav.locator('.product-card')).toHaveCount(0);
      await expect(nav.locator('.basket-count')).toHaveText('1');
      const reopened = await navigation.newPage();
      await reopened.goto(fixture.origin+'/'); await reopened.reload();
      await expect(reopened.locator('.basket-count')).toHaveText('1');
      await expect(reopened.locator('.product-card')).toHaveCount(0);
      await reopened.close(); await nav.bringToFront();
      const options = nav.locator('.home-choices');
      await options.getByRole('link', { name: 'The Roost', exact: true }).click();
      await expect(nav.getByRole('heading', { name: 'Make yourself at home.' })).toBeVisible();
      await expect(nav.locator('nav [aria-current="page"]')).toHaveText('The Roost');
      await nav.getByRole('link', { name: 'Rise & Roost home', exact: true }).click();
      await options.getByRole('link', { name: 'Leave a Comment', exact: true }).click();
      await expect(nav.getByLabel('Your comment', { exact: true })).toBeVisible();
      await expect(nav.locator('nav [aria-current="page"]')).toHaveText('Comments');
      await nav.goBack(); await expect(options).toBeVisible();
      await options.getByRole('link', { name: 'Start Shopping', exact: true }).click();
      await nav.locator('.product-card').first().locator('.product-image').click();
      await expect(nav).toHaveURL(fixture.origin+'/product/bread');
      await expect(nav.locator('nav [aria-current="page"]')).toHaveText('Shop');
      await nav.goBack(); await expect(nav.locator('.product-card')).toHaveCount(3);
    } finally { await navigation.close(); }
    expect(errors).toEqual([]);
  });

  test('member journey: passkey enrollment, saved details, remembered session, member checkout, history and sign-in', async ({ page, browser }, info) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await authenticator(page, info);
    await page.goto(fixture.origin+'/roost');
    await page.getByLabel('Name', { exact: true }).fill('Returning Neighbor');
    await page.getByLabel('Email (optional)', { exact: true }).fill('neighbor@example.test');
    await page.getByLabel('Phone (optional)', { exact: true }).fill('555-0101');
    await page.getByRole('button', { name: 'Join with a passkey', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back, Returning.' })).toBeVisible();
    await expect(page.getByLabel('Roost recovery key', { exact: true })).toBeVisible();
    // Even an undismissed one-time secret and prefilled contact fields must clear.
    await page.getByRole('button', { name: 'Sign out of The Roost', exact: true }).click();
    await expect(page.getByLabel('Roost recovery key', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('');
    await page.getByRole('button', { name: 'Sign in with a passkey', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back, Returning.' })).toBeVisible();
    await page.getByLabel('Phone (optional)', { exact: true }).fill('555-0102');
    await page.getByRole('button', { name: 'Save my details', exact: true }).click();
    await expect(page.locator('#notice')).toHaveText('Your pickup details are saved.');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Welcome back, Returning.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in with a passkey', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Phone (optional)', { exact: true })).toHaveValue('555-0102');
    await page.goto(fixture.origin+'/shop');
    await page.getByRole('button', { name: 'Add A dozen little sunrises to basket', exact: true }).click();
    await page.locator('.basket-link').click();
    await expect(page.getByRole('button', { name: 'Use my Roost details', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Returning Neighbor');
    await expect(page.getByLabel('Phone (optional)', { exact: true })).toHaveValue('555-0102');
    await pickup(page);
    await page.getByRole('button', { name: 'Place preorder', exact: true }).click();
    await page.getByRole('link', { name: 'View my Roost orders', exact: true }).click();
    await expect(page.locator('.member-order')).toHaveCount(1);
    await expect(page.locator('.member-order')).toContainText('A dozen little sunrises');
    await expect(page.locator('.member-order')).toContainText('Awaiting payment report');
    await page.locator('#notice').evaluate(el => el.className = '');
    await page.screenshot({ path: `qa-results/customer/member-roost-${info.project.name}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1)).toBe(true);
    const restored = await browser.newContext({ ...info.project.use, baseURL: fixture.origin, storageState: await page.context().storageState() });
    try {
      const other = await restored.newPage(); await other.goto(fixture.origin+'/roost');
      await expect(other.locator('.member-order')).toHaveCount(1);
      expect((await restored.request.get(fixture.origin+'/api/studio')).status()).toBe(401);
    } finally { await restored.close(); }
    await page.getByRole('button', { name: 'Sign out of The Roost', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Make yourself at home.' })).toBeVisible();
    await page.getByRole('button', { name: 'Sign in with a passkey', exact: true }).click();
    await expect(page.locator('.member-order')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('comment journey: guest submission, owner moderation, safe public text, hide and preserved products', async ({ page, browser }, info) => {
    await page.goto(fixture.origin+'/comments');
    await page.getByLabel('Your name', { exact: true }).fill('A Neighbor');
    const note = '<b>Our favorite loaf.</b> Thank you!';
    await page.getByLabel('Your comment', { exact: true }).fill(note);
    await page.getByLabel('My name and comment may be shared after review.').check();
    await page.getByRole('button', { name: 'Send comment', exact: true }).click();
    await expect(page.getByText('Your comment is waiting for Danielle’s review.')).toBeVisible();
    await expect(page.locator('.neighbor-notes')).not.toContainText(note);
    const studioContext = await owner(browser, info);
    try {
      const studio = await studioContext.newPage(); await studio.goto(fixture.origin+'/studio');
      await expect(studio.locator('.workspace-badge')).toHaveText('REVIEW WEBSITE · OWNER');
      await studio.getByRole('navigation', { name: 'Studio navigation' }).getByRole('button', { name: 'Comments', exact: true }).click();
      await expect(studio.frameLocator('iframe').locator('.home-choices').getByRole('link')).toHaveCount(3);
      await expect(studio.getByText('Waiting for review', { exact: true })).toBeVisible();
      await studio.getByRole('button', { name: 'Approve comment', exact: true }).click();
      await expect(studio.getByText('Visible on website', { exact: true })).toBeVisible();
      await page.reload(); await expect(page.locator('.neighbor-notes')).toContainText(note);
      await expect(page.locator('.neighbor-notes b')).toHaveCount(0);
      await studio.getByRole('button', { name: 'Hide comment', exact: true }).click();
      await expect(studio.getByText('Hidden', { exact: true })).toBeVisible();
      await page.reload(); await expect(page.locator('.neighbor-notes')).not.toContainText(note);
      const site = await (await studioContext.request.get(fixture.origin+'/api/studio')).json();
      expect(site.revision).toBe(1); expect(site.published.products).toHaveLength(3); expect(site.orders).toHaveLength(0);
      const document = structuredClone(site.draft); document.products.find(p => p.id === 'rolls').stock = 0;
      const saved = await studioContext.request.post(fixture.origin+'/api/draft', { headers: { Origin: fixture.origin, 'X-RR-Workspace': fixture.id }, data: { document, revision: site.revision } });
      expect(saved.status()).toBe(200);
      await studioContext.request.post(fixture.origin+'/api/publish', { headers: { Origin: fixture.origin, 'X-RR-Workspace': fixture.id }, data: { revision: (await saved.json()).revision } });
      await page.goto(fixture.origin+'/shop');
      await expect(page.getByRole('button', { name: 'Morning cinnamon rolls is sold out', exact: true })).toBeDisabled();
      await imageCheck(page);
    } finally { await studioContext.close(); }
  });
});
