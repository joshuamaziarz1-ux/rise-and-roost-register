import { test, expect } from '@playwright/test';
import { primaryFixture } from '../primary-fixture.mjs';

test('the primary storefront shares published products across independent sessions and keeps drafts private', async ({ browser }, info) => {
  // Real owner's D1 content is read-only in hosted tests. Local fixtures exercise
  // saving/publishing the primary site using exactly the same Worker and SQL API.
  const remote = process.env.RR_BETA_BASE_URL;
  const fixture = remote ? null : await primaryFixture();
  const origin = remote || fixture.origin;
  const a = await browser.newContext({ ...info.project.use, baseURL: origin });
  const b = await browser.newContext({ ...info.project.use, baseURL: origin });
  try {
    const editor = await a.newPage();
    const visitor = await b.newPage();
    const publicSite = await (await b.request.get('/api/site')).json();
    expect(publicSite.isPrimary).toBe(true);
    const id = publicSite.id;
    if (remote) {
      await editor.goto('/shop');
      await visitor.goto('/demo/' + id + '/shop');
      await expect(editor.locator('.site-header')).toBeVisible();
      await expect(visitor.locator('.site-header')).toBeVisible();
      await expect(editor.getByRole('link', { name: 'Open Website Studio' })).toHaveAttribute('href', '/studio?workspace=' + id);
      expect(await editor.locator('.product-card').allTextContents()).toEqual(await visitor.locator('.product-card').allTextContents());
      await visitor.goto('/studio');
      await expect(visitor.getByLabel('Workspace ID', { exact: true })).toHaveValue(id);
      expect((await b.request.get('/api/studio')).status()).toBe(401);
      return;
    }
    await editor.goto('/studio?workspace=' + id);
    await editor.getByLabel('Private access key', { exact: true }).fill(fixture.key);
    await editor.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(editor.getByRole('link', { name: 'View published website' })).toHaveAttribute('href', '/');
    await expect(editor.locator('#publishing-destination')).toContainText('main beta website');
    await visitor.goto('/shop');
    await expect(visitor.getByRole('heading', { name: 'Slow Sunday sourdough', exact: true })).toBeVisible();
    await expect(visitor.getByRole('link', { name: 'Open Website Studio' })).toHaveAttribute('href', '/studio?workspace=' + id);
    await editor.getByRole('button', { name: 'Products', exact: true }).click();
    await editor.getByLabel('Product name', { exact: true }).fill('Cross-device published loaf');
    await editor.getByLabel('Price ($)', { exact: true }).fill('11.27');
    await editor.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(editor.locator('#saved-status')).toHaveText('Draft saved');
    await visitor.reload();
    await expect(visitor.getByRole('heading', { name: 'Slow Sunday sourdough', exact: true })).toBeVisible();
    editor.once('dialog', (dialog) => dialog.accept());
    await editor.getByRole('button', { name: 'Publish demo', exact: true }).click();
    await expect(editor.locator('#notice')).toHaveText(/^Published to the beta website\./);
    await visitor.bringToFront();
    await expect(visitor.getByRole('heading', { name: 'Cross-device published loaf', exact: true })).toBeVisible();
    await expect(visitor.locator('.product-card').filter({ hasText: 'Cross-device published loaf' })).toContainText('$11.27');
    await visitor.route('**/api/site', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(publicSite),
    }), { times: 1 });
    const staleResponse = visitor.waitForResponse((response) => new URL(response.url()).pathname === '/api/site');
    await visitor.evaluate(() => window.dispatchEvent(new Event('online')));
    await (await staleResponse).finished();
    await visitor.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(visitor.getByRole('heading', { name: 'Cross-device published loaf', exact: true })).toBeVisible();
    await visitor.reload();
    await expect(visitor.getByRole('heading', { name: 'Cross-device published loaf', exact: true })).toBeVisible();
    await visitor.goto('/demo/' + id + '/shop');
    await expect(visitor.getByRole('heading', { name: 'Cross-device published loaf', exact: true })).toBeVisible();
    const root = await b.request.get('/api/site');
    const canonical = await b.request.get('/api/site?workspace=' + id);
    expect(await root.json()).toEqual(await canonical.json());
    expect(root.headers()['cache-control']).toBe('no-store');
    // A later draft must remain private, including after a new device signs in.
    await editor.getByLabel('Product name', { exact: true }).fill('Unpublished next loaf');
    await editor.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(editor.locator('#saved-status')).toHaveText('Draft saved');
    await visitor.goto('/shop');
    await expect(visitor.getByRole('heading', { name: 'Cross-device published loaf', exact: true })).toBeVisible();
    await visitor.goto('/studio?workspace=' + id);
    await visitor.getByLabel('Private access key', { exact: true }).fill(fixture.key);
    await visitor.getByRole('button', { name: 'Sign in', exact: true }).click();
    await visitor.getByRole('button', { name: 'Products', exact: true }).click();
    await expect(visitor.getByLabel('Product name', { exact: true })).toHaveValue('Unpublished next loaf');
  } finally { await a.close(); await b.close(); await fixture?.close(); }
});
