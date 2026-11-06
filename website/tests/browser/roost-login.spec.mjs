import { test, expect } from '@playwright/test';
import { primaryFixture } from '../primary-fixture.mjs';
import { installTestPasskey } from '../install-test-passkey.mjs';

test.describe('customer remembered login', () => {
  let f;
  test.beforeEach(async () => { f = await primaryFixture({ experience: true, port: 4318, hostname: 'localhost' }); });
  test.afterEach(async () => { await f?.close(); });
  async function join(page, info) {
    await installTestPasskey(page, info, f.origin);
    await page.goto(f.origin + '/roost');
    await expect(page.getByRole('heading', { name: 'Make yourself at home.' })).toBeVisible();
    await page.screenshot({ path: `qa-results/roost-signin-${info.project.name}.png`, fullPage: true, scale: 'css' });
    await page.getByLabel('Name', { exact: true }).fill('Remembered Neighbor');
    await page.getByRole('button', { name: 'Join with a passkey', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Remembered\./ })).toBeVisible();
    const recovery = await page.getByLabel('Roost recovery key', { exact: true }).inputValue();
    await page.getByRole('button', { name: 'I saved my recovery key', exact: true }).click();
    return recovery;
  }
  test('persistent cookies survive browser context closure; logout clears private views and copied cookies', async ({ page, browser }, info) => {
    await join(page, info);
    const state = await page.context().storageState();
    const session = state.cookies.find(c => c.name === 'rr_roost_' + f.id);
    expect(session.httpOnly).toBe(true); expect(session.sameSite).toBe('Strict');
    expect(session.expires).toBeGreaterThan(Date.now()/1000 + 29*86400);
    expect(state.origins.flatMap(o => o.localStorage).some(v => /roost|passkey|session|auth|recovery/i.test(v.name))).toBe(false);
    // Close the original customer context, then reopen from its persistent cookie state.
    const remembered = await browser.newContext({ ...info.project.use, storageState: state });
    try {
      await page.context().close();
      const returning = await remembered.newPage(); await returning.goto(f.origin + '/roost');
      await expect(returning.getByRole('heading', { name: /Good (morning|afternoon|evening), Remembered\./ })).toBeVisible();
      await returning.getByRole('link', { name: 'Shop', exact: true }).click();
      await returning.getByRole('link', { name: 'The Roost', exact: true }).click();
      await returning.getByRole('button', { name: 'Log Out', exact: true }).click();
      await expect(returning.getByRole('heading', { name: 'Make yourself at home.' })).toBeVisible();
      await returning.goBack();
      await returning.goForward();
      await expect(returning.getByRole('heading', { name: 'Make yourself at home.' })).toBeVisible();
      await expect(returning.getByRole('heading', { name: 'Account Settings', exact: true })).toHaveCount(0);
      expect((await remembered.cookies()).find(c => c.name === session.name)).toBeUndefined();
      const copied = await browser.newContext({ ...info.project.use, storageState: state });
      try {
        const response = await copied.request.get(f.origin + '/api/roost/me?workspace=' + f.id);
        expect((await response.json()).member).toBeNull();
      } finally { await copied.close(); }
    } finally { await remembered.close(); }
  });
  test('unsupported-device recovery preserves identity, rotates the key, and allows a replacement passkey', async ({ page, browser }, info) => {
    const recovery = await join(page, info);
    const account = (await (await page.request.get(f.origin + '/api/roost/me?workspace=' + f.id)).json()).member.id;
    const fallback = await browser.newContext({ ...info.project.use });
    try {
      const other = await fallback.newPage();
      await other.addInitScript(() => { Object.defineProperty(window, 'PublicKeyCredential', { value: undefined, configurable: true }); });
      await other.goto(f.origin + '/roost');
      await other.getByRole('button', { name: 'Sign in with a passkey', exact: true }).click();
      await expect(other.getByRole('alert')).toContainText('Use your saved recovery key');
      await other.getByText('Another way to sign in / recover my membership', { exact: true }).click();
      await other.getByLabel('Saved recovery key', { exact: true }).fill('a'.repeat(48));
      await other.getByRole('button', { name: 'Recover my Roost', exact: true }).click();
      await expect(other.getByRole('alert')).toContainText('does not match');
      await other.getByText('Another way to sign in / recover my membership', { exact: true }).click();
      await other.getByLabel('Saved recovery key', { exact: true }).fill(recovery);
      await other.getByRole('button', { name: 'Recover my Roost', exact: true }).click();
      await expect(other.getByRole('heading', { name: /Good (morning|afternoon|evening), Remembered\./ })).toBeVisible();
      expect(await other.getByLabel('Roost recovery key', { exact: true }).inputValue()).not.toBe(recovery);
      expect((await (await other.request.get(f.origin + '/api/roost/me?workspace=' + f.id)).json()).member.id).toBe(account);
      await other.getByRole('button', { name: 'I saved my recovery key', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Make yourself at home.' })).toBeVisible();
      const replacement = await fallback.newPage();
      await installTestPasskey(replacement, info, f.origin);
      await replacement.goto(f.origin + '/roost');
      await replacement.getByRole('button', { name: 'Add a passkey on this device', exact: true }).click();
      await expect(replacement.getByRole('heading', { name: /Good (morning|afternoon|evening), Remembered\./ })).toBeVisible();
      await replacement.getByRole('button', { name: 'Log Out', exact: true }).click();
      await replacement.getByRole('button', { name: 'Sign in with a passkey', exact: true }).click();
      await expect(replacement.getByRole('heading', { name: /Good (morning|afternoon|evening), Remembered\./ })).toBeVisible();
      await replacement.evaluate(() => window.scrollTo(0, 0));
      await replacement.screenshot({ path: `qa-results/roost-${info.project.name}.png`, fullPage: true, scale: 'css' });
      expect(await replacement.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    } finally { await fallback.close(); }
  });
  test('cross-tab logout and restored history never retain private account fields', async ({ page, context }, info) => {
    await join(page, info);
    const tab = await context.newPage(); await tab.goto(f.origin + '/roost');
    await expect(tab.getByRole('heading', { name: /Good (morning|afternoon|evening), Remembered\./ })).toBeVisible();
    await page.getByRole('button', { name: 'Log Out', exact: true }).click();
    await expect(tab.getByRole('heading', { name: 'Make yourself at home.' })).toBeVisible();
    await expect(tab.getByLabel('Name', { exact: true })).toHaveValue('');
    await tab.evaluate(() => { window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); });
    await expect(tab.getByText('Opening your Roost…')).toBeVisible();
    await tab.evaluate(() => { window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
    await expect(tab.getByRole('heading', { name: 'Make yourself at home.' })).toBeVisible();
  });
});
