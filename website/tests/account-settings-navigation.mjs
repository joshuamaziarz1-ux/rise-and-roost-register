import { expect } from '@playwright/test';
export async function openAccountSettings(page) {
  const link = page.getByRole('link', { name: 'Account Settings', exact: true });
  await expect(page.locator('main')).toBeVisible();
  // Login may still be completing; wait for either authenticated view.
  await expect(page.locator('main').filter({ has: page.getByRole('heading', { name: 'Account Settings', exact: true }) }).or(page.locator('main').filter({ has: link }))).toBeVisible();
  if (await link.count()) await link.click();
  await expect(page.getByRole('heading', { name: 'Account Settings', exact: true })).toBeVisible();
}
export async function logOut(page) {
  await openAccountSettings(page);
  await page.getByRole('button', { name: 'Log Out', exact: true }).click();
}
