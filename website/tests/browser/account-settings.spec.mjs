import { test, expect } from '@playwright/test';
import { contactFixture } from '../contact-browser-fixture.mjs';
import { openAccountSettings, logOut } from '../account-settings-navigation.mjs';

const password = 'a friendly garden phrase';
let f;
test.beforeEach(async () => { f = await contactFixture({ email: true }); });
test.afterEach(async () => { await f?.close(); });
const post = async (client, route, data) => {
  const response = await client.post(f.origin + '/api/roost/' + route, { headers: { Origin: f.origin }, data: { workspaceId: f.id, ...data } });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
};
async function account(client, email = 'sarah@example.test', name = 'Sarah Neighbor') {
  await post(client, 'email/register', { name, email, password });
  await post(client, 'email/verify', { token: f.messages.at(-1).secret });
  await post(client, 'email/login', { email, password });
  await post(client, 'profile', { profile: { name, email, phone: '260-555-0100' } });
  return (await (await client.get(f.origin + '/api/roost/me?workspace=' + f.id)).json()).member;
}
async function basket(page) {
  await page.goto(f.origin + '/shop');
  await page.getByRole('button', { name: 'Add A dozen little sunrises to basket', exact: true }).click();
  await page.locator('.basket-link').click();
  await expect(page.getByLabel('Name', { exact: true })).toBeVisible();
}
const field = (page, name) => page.locator('[name="checkout-' + name + '"]');
const me = async client => (await (await client.get(f.origin + '/api/roost/me?workspace=' + f.id)).json()).member;

test('separate settings saves pickup contacts, preserves verified identity and orders, and keeps one dashboard balance', async ({ page }, info) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const member = await account(page.request);
  const site = await (await page.request.get(f.origin + '/api/site')).json(), product = site.document.products[0];
  const placed = await page.request.post(f.origin + '/api/orders', { headers: { Origin: f.origin }, data: {
    workspaceId: f.id, revision: site.revision, requestId: crypto.randomUUID(), pickupId: site.document.pickups[0].id,
    checkoutMode: 'member', customerDetails: member.profile, total: product.price,
    lines: [{ productId: product.id, variantId: product.variants[0].id, qty: 1, unitPrice: product.price }]
  } });
  expect(placed.status(), await placed.text()).toBe(201);
  const ordersBefore = f.sql.prepare('SELECT ledger_json FROM workspaces').get().ledger_json;
  expect(JSON.parse(ordersBefore).orders).toHaveLength(1);
  const identitiesBefore = f.sql.prepare('SELECT * FROM roost_email_identities').all();
  await page.goto(f.origin + '/roost');
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Sarah\./ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Upcoming Pickup', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fresh at The Roost!', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Your Return Credit:/ })).toHaveCount(1);
  await expect(page.locator('.credit-balance')).toHaveCount(0);
  await expect(page.locator('.roost-profile, .account-controls')).toHaveCount(0);
  await page.screenshot({ path: `qa-results/account-settings/dashboard-${info.project.name}.png`, fullPage: true });
  await openAccountSettings(page);
  await expect(page).toHaveURL(f.origin + '/roost/settings');
  for (const name of ['Personal Information', 'Pickup Details', 'Password & Security', 'Delete My Account']) await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Upcoming Pickup', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete My Account', exact: true })).toBeDisabled();
  await expect(page.getByText('sarah@example.test', { exact: true }).last()).toBeVisible();
  await page.getByLabel('Full Name', { exact: true }).fill('Sarah Updated');
  await page.getByLabel('Email Address (optional)', { exact: true }).fill('pickup@example.test');
  await page.getByLabel('Phone Number (optional)', { exact: true }).fill('260-555-0199');
  await page.getByRole('button', { name: 'Save my details', exact: true }).click();
  await expect(page.locator('#notice')).toHaveText('Your pickup details are saved.');
  await page.reload();
  await expect(page.getByLabel('Full Name', { exact: true })).toHaveValue('Sarah Updated');
  await expect(page.locator('dl')).toContainText('pickup@example.test');
  expect((await me(page.request)).id).toBe(member.id);
  expect(f.sql.prepare('SELECT ledger_json FROM workspaces').get().ledger_json).toBe(ordersBefore);
  expect(f.sql.prepare('SELECT * FROM roost_email_identities').all()).toEqual(identitiesBefore);
  await page.screenshot({ path: `qa-results/account-settings/settings-${info.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole('link', { name: 'Back to The Roost', exact: true }).click();
  await basket(page);
  for (const [key, value] of Object.entries({ name: 'Sarah Updated', email: 'pickup@example.test', phone: '260-555-0199' })) await expect(field(page, key)).toHaveValue(value);
  await field(page, 'name').fill('One Order Contact');
  await field(page, 'email').fill('one-order@example.test');
  await expect(field(page, 'name')).toBeEditable();
  expect((await me(page.request)).profile.name).toBe('Sarah Updated');
  await page.screenshot({ path: `qa-results/account-settings/checkout-${info.project.name}.png`, fullPage: true });
  await page.getByLabel('Choose your pickup', { exact: true }).getByRole('button').first().click();
  await page.getByRole('button', { name: 'Place preorder', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Thank you. Your preorder is in.', exact: true })).toBeVisible();
  const ordersAfter = JSON.parse(f.sql.prepare('SELECT ledger_json FROM workspaces').get().ledger_json).orders;
  expect(ordersAfter).toHaveLength(2);
  const existing = JSON.parse(ordersBefore).orders[0];
  expect(ordersAfter.find(o => o.id === existing.id)).toEqual(existing);
  expect(ordersAfter.find(o => o.id !== existing.id).customer.name).toBe('One Order Contact');
  expect(ordersAfter.find(o => o.id !== existing.id).customer.contactEmail).toBe('one-order@example.test');
  expect((await me(page.request)).profile.email).toBe('pickup@example.test');
  expect(errors).toEqual([]);
});

test('late authenticated profile preserves edits and pickup choice; blank saved fields remain blank', async ({ page }) => {
  await account(page.request);
  await post(page.request, 'profile', { profile: { name: 'Sarah Neighbor', email: '', phone: '' } });
  await basket(page);
  let release; const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/roost/me?*', async route => { await gate; await route.continue(); });
  await page.reload();
  await expect(field(page, 'name')).toBeVisible();
  await field(page, 'name').fill('Typed Before Profile');
  const pickups = page.getByLabel('Choose your pickup', { exact: true }).getByRole('button');
  await pickups.first().click();
  const selected = await page.locator('.pickup-date[aria-pressed=true]').getAttribute('data-pickup-id');
  release();
  await expect(page.getByRole('button', { name: 'Use my Roost details', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(field(page, 'name')).toHaveValue('Typed Before Profile');
  await expect(field(page, 'email')).toHaveValue('');
  await expect(field(page, 'phone')).toHaveValue('');
  await expect(page.locator('.pickup-date[aria-pressed=true]')).toHaveAttribute('data-pickup-id', selected);
  await expect(page.locator('.deadline')).toBeVisible();
  expect((await me(page.request)).profile.name).toBe('Sarah Neighbor');
});

test('guest opt-out survives delayed account load; logout and a second account cannot retain private contact fields', async ({ page, browser }, info) => {
  await account(page.request);
  await basket(page);
  let release; const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/roost/me?*', async route => { await gate; await route.continue(); });
  await page.reload();
  await page.getByRole('button', { name: 'Guest checkout', exact: true }).click();
  await field(page, 'name').fill('Guest Order');
  release();
  await expect(page.getByRole('button', { name: 'Use my Roost details', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guest checkout', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(field(page, 'name')).toHaveValue('Guest Order');
  await expect(field(page, 'email')).toHaveValue('');
  await page.unroute('**/api/roost/me?*');
  await page.getByRole('link', { name: 'The Roost', exact: true }).click();
  await logOut(page);
  await page.getByRole('link', { name: 'Shop', exact: true }).click();
  await page.locator('.basket-link').click();
  for (const key of ['name', 'email', 'phone']) await expect(field(page, key)).toHaveValue('');
  await account(page.request, 'another@example.test', 'Another Neighbor');
  await page.reload();
  await expect(field(page, 'name')).toHaveValue('Another Neighbor');
  await expect(field(page, 'email')).toHaveValue('another@example.test');
  const guest = await browser.newContext({ ...info.project.use });
  try {
    const other = await guest.newPage(); await basket(other);
    for (const key of ['name', 'email', 'phone']) await expect(field(other, key)).toHaveValue('');
    await expect(other.getByRole('button', { name: 'Use my Roost details', exact: true })).toHaveCount(0);
  } finally { await guest.close(); }
});

test('personalized morning, afternoon and evening greetings survive settings navigation', async ({ page }) => {
  await account(page.request);
  await page.goto(f.origin + '/roost');
  for (const [time, greeting] of [
    ['2026-11-08T14:00:00Z', 'Good morning, Sarah.'],
    ['2026-11-08T19:00:00Z', 'Good afternoon, Sarah.'],
    ['2026-11-09T00:00:00Z', 'Good evening, Sarah.']
  ]) {
    await page.clock.setFixedTime(new Date(time));
    await openAccountSettings(page);
    await page.getByRole('link', { name: 'Back to The Roost', exact: true }).click();
    await expect(page.getByRole('heading', { name: greeting, exact: true })).toBeVisible();
  }
});
