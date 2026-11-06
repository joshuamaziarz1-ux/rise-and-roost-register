import { test, expect } from '@playwright/test';
import { productionBrowserFixture } from '../production-browser-fixture.mjs';
import { addCalendarDays, storeDay } from '../../server/pickup-calendar.mjs';
import { mkdir } from 'node:fs/promises';

test('Studio separates legacy Tuesdays from upcoming pickups while preserving special dates and all records', async ({ page }, info) => {
  const f = await productionBrowserFixture();
  try {
    let tuesday = addCalendarDays(storeDay(Date.now()), 7);
    while (new Date(tuesday + 'T12:00:00Z').getUTCDay() !== 2) tuesday = addCalendarDays(tuesday, 1);
    const row = f.sql.prepare('SELECT * FROM workspaces').get(), doc = JSON.parse(row.published_json);
    const legacy = { id: 'legacy-tuesday', date: tuesday, start: '15:00', end: '18:00', cutoffDate: addCalendarDays(tuesday, -2), cutoffTime: '12:00', capacity: 12, closed: true };
    const special = { ...legacy, id: 'special-tuesday', date: addCalendarDays(tuesday, 7), cutoffDate: addCalendarDays(tuesday, 5), closed: false, special: true, event: 'Deliberate special pickup' };
    doc.pickups.push(legacy, special);
    f.sql.prepare('UPDATE workspaces SET draft_json=?,published_json=?').run(JSON.stringify(doc), JSON.stringify(doc));
    const before = f.sql.prepare('SELECT * FROM workspaces').get();
    await page.setExtraHTTPHeaders({ 'X-Synthetic-Owner': 'a' });
    await page.goto(f.origin + '/studio#Calendar');
    await expect(page.getByRole('heading', { name:'Calendar', exact:true })).toBeVisible();
    const upcoming=page.getByRole('region',{name:'Upcoming pickup dates',exact:true});
    await expect(upcoming).not.toContainText('Legacy date');
    await expect(upcoming).toContainText('Deliberate special pickup');
    await expect(upcoming).toContainText('Wednesday');
    await expect(upcoming).toContainText('Thursday');
    await expect(upcoming).toContainText('Friday');
    const history=page.locator('details').filter({has:page.locator('summary',{hasText:'Older pickup records'})});
    await expect(history).not.toHaveAttribute('open','');
    await history.locator('summary').focus();await history.locator('summary').press('Enter');
    await expect(history).toContainText('Tuesday');
    await expect(history).toContainText('Closed to new orders');
    await expect(history).toContainText('excluded from customer ordering');
    const site=(await f.call('/api/site')).data;
    expect(site.checkoutEnabled).toBe(false);
    expect(site.document.pickups.some(p=>p.id===legacy.id)).toBe(false);
    expect(site.document.pickups.some(p=>p.id===special.id)).toBe(true);
    expect(f.sql.prepare('SELECT * FROM workspaces').get()).toEqual(before);
    await history.locator('summary').press('Enter');
    await mkdir('qa-results/calendar-history',{recursive:true});
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:`qa-results/calendar-history/${info.project.name}.png`,fullPage:true,scale:"css"});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  } finally { await f.close(); }
});
