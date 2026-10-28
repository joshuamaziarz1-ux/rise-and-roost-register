import { test, expect } from '@playwright/test';
import { primaryFixture } from '../primary-fixture.mjs';
import { randomUUID } from 'node:crypto';

test('workspace authentication and device pairing keep the main site, demos and public orders separate', async ({ browser }, info) => {
  const remote = process.env.RR_BETA_BASE_URL;
  const fixture = remote ? null : await primaryFixture();
  const origin = remote || fixture.origin;
  const contexts = await Promise.all([1,2,3].map(() => browser.newContext({ ...info.project.use, baseURL: origin })));
  const [a,b,c] = contexts;
  if (!remote) for (const context of contexts) await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': randomUUID() });
  try {
    const publicId = (await (await a.request.get('/api/site')).json()).id;
    let id, key;
    if (fixture) { id = fixture.id; key = fixture.key; }
    else {
      // Hosted writes only to a fresh synthetic demo; the actual owner remains read-only.
      const r = await a.request.post('/api/workspaces', { headers: { Origin: origin }, data: {} });
      expect(r.status()).toBe(201); const created = await r.json(); id = created.id; key = created.accessKey;
    }
    const owner = await a.newPage();
    await owner.goto('/studio?workspace=' + id);
    if (fixture) {
      await owner.getByLabel('Private access key', { exact: true }).fill(key);
      await owner.getByRole('button', { name: 'Sign in', exact: true }).click();
    }
    await expect(owner.locator('.workspace-badge')).toContainText(fixture ? 'BETA WEBSITE' : 'PRIVATE DEMO');
    const r = await b.request.post('/api/workspaces', { headers: { Origin: origin }, data: {} });
    expect(r.status()).toBe(201); const demo = await r.json();
    const recipient = await b.newPage();
    // A private-demo cookie must never make generic /studio open that demo silently.
    await recipient.goto('/studio');
    await expect(recipient.getByLabel('Workspace ID', { exact: true })).toHaveValue(publicId);
    await expect(recipient.locator('.studio-workspace')).toHaveCount(0);
    await recipient.goto('/studio?workspace=' + id);
    await recipient.getByText('Use the saved ID and key together', { exact: true }).click();
    await recipient.getByLabel('Paste saved access details', { exact: true }).fill(`Workspace ID: ${demo.id}\nPrivate access key: ${demo.accessKey}\nSign in at: ${origin}/studio?workspace=${demo.id}`);
    await recipient.getByRole('button', { name: 'Use these saved details', exact: true }).click();
    await expect(recipient.locator('#workspace-signin-feedback')).toContainText('different workspace');
    await expect(recipient.getByLabel('Workspace ID', { exact: true })).toHaveValue(id);
    await expect(recipient.getByLabel('Private access key', { exact: true })).toHaveValue('');
    await recipient.getByRole('button', { name: 'Connect from a signed-in computer', exact: true }).click();
    const code = recipient.getByLabel('Device connection code', { exact: true });
    await expect(code).toHaveText(/^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{2}$/);
    expect((await b.request.get('/api/studio', { headers: { 'X-RR-Workspace': id } })).status()).toBe(401);
    const nav = (page, label) => page.getByRole('navigation', { name: 'Studio navigation' }).getByRole('button', { name: label, exact: true });
    await nav(owner, 'Workspace Access').click();
    await owner.getByLabel('Code from the other computer', { exact: true }).fill(await code.textContent());
    await owner.getByRole('button', { name: 'Review connection request', exact: true }).click();
    await owner.getByLabel('I recognize this code from my other computer and want that browser to edit this exact workspace', { exact: true }).check();
    await owner.getByRole('button', { name: 'Approve this computer', exact: true }).click();
    await expect(recipient.locator('.workspace-badge')).toContainText(fixture ? 'BETA WEBSITE' : 'PRIVATE DEMO', { timeout: 20000 });
    await expect(recipient).toHaveURL(origin + '/studio?workspace=' + id);
    // Replacing the generic cookie must leave the workspace-bound session intact.
    const otherLogin = await b.request.post('/api/login', { headers: { Origin: origin, 'X-RR-Workspace': demo.id }, data: { id: demo.id, accessKey: demo.accessKey } });
    expect(otherLogin.status()).toBe(200);
    await recipient.reload();
    await expect(recipient.locator('.workspace-badge')).toContainText(fixture ? 'BETA WEBSITE' : 'PRIVATE DEMO');
    // Password-manager autofill without input events still signs into the correct saved pair.
    const auto = await c.newPage(); await auto.goto('/studio?workspace=' + id);
    await auto.getByLabel('Private access key', { exact: true }).evaluate((input,value) => { input.value = value; }, key);
    await auto.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(auto.locator('.studio-workspace')).toBeVisible();
    const visitor = await c.newPage();
    const prefix = fixture ? '' : '/demo/' + id;
    await visitor.goto(prefix + '/product/bread');
    await visitor.getByRole('button', { name: 'Add to basket', exact: true }).click();
    await visitor.locator('.basket-link').click();
    const pickup = visitor.getByLabel('Choose your pickup', { exact: true });
    await pickup.selectOption(await pickup.locator('option:not([disabled])').nth(1).getAttribute('value'));
    const submission = visitor.waitForRequest(r => r.url().endsWith('/api/orders') && r.method() === 'POST');
    const response = visitor.waitForResponse(r => r.url().endsWith('/api/orders') && r.request().method() === 'POST');
    await visitor.getByRole('button', { name: 'Request a demo preorder', exact: true }).click();
    expect((await submission).postDataJSON().workspaceId).toBe(id);
    expect((await submission).postDataJSON().storefront).toBe(fixture ? 'main' : 'demo');
    const accepted = await response; expect(accepted.status()).toBe(201); const order = await accepted.json();
    for (const page of [owner,recipient]) {
      await nav(page, 'Orders').click();
      await page.getByRole('button', { name: 'Refresh orders', exact: true }).click();
      await expect(page.locator('article.sub-card')).toContainText(order.orderNumber);
    }
    await recipient.goto('/studio?workspace=' + demo.id);
    await nav(recipient, 'Orders').click();
    await expect(recipient.locator('article.sub-card')).toHaveCount(0);
    await recipient.goto('/studio?workspace=' + id);
    await nav(recipient, 'Orders').click();
    await expect(recipient.locator('article.sub-card')).toContainText(order.orderNumber);
    expect(await recipient.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await owner.route('**/api/studio', route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Session expired. Sign in to this exact workspace.' }) }), { times: 1 });
    await owner.getByRole('button', { name: 'Refresh orders', exact: true }).click();
    await expect(owner.locator('#studio-session-expired')).toContainText('Unsaved edits are still in this tab');
    await expect(owner.getByRole('link', { name: 'Sign in again to this exact workspace' })).toHaveAttribute('href', '/studio?workspace=' + id);
    await expect(owner.locator('article.sub-card')).toContainText(order.orderNumber);
    await owner.getByRole('button', { name: 'Refresh orders', exact: true }).click();
    await expect(owner.locator('#studio-session-expired')).toHaveCount(0);
  } finally { await Promise.all(contexts.map(c => c.close())); await fixture?.close(); }
});
