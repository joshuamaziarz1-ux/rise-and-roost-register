import { test, expect } from '@playwright/test';
import { productionBrowserFixture } from '../production-browser-fixture.mjs';
import { mockProvider } from '../marketing-provider-fixture.mjs';
test('owner reviews a real provider-shaped audience and explicitly confirms one isolated test, with campaign sending disabled',async({page})=>{
 const p=await productionBrowserFixture(),previousFetch=globalThis.fetch;
 try {
  const owner=JSON.parse(p.env.PRODUCTION_OWNERS)[0].email,provider=mockProvider(owner);
  globalThis.fetch=(url,options)=>String(url).startsWith('https://api.resend.com/')?provider.fetcher(url,options):previousFetch(url,options);
  Object.assign(p.env,{RESEND_MARKETING_API_KEY:'synthetic-marketing',MARKETING_PROVIDER_VERIFIED:'true',MARKETING_FREE_PLAN_CONFIRMED:'true',MARKETING_OWNER_TEST_ENABLED:'true',MARKETING_CAMPAIGNS_ENABLED:'false'});
  const row=p.sql.prepare('SELECT ledger_json FROM workspaces WHERE id=?').get(p.env.PUBLIC_WORKSPACE_ID),l=JSON.parse(row.ledger_json),at=new Date().toISOString();
  l.marketing={contacts:[{id:'c',email:owner,status:'confirmed',confirmedAt:at,consentAt:at}],campaigns:[{id:'draft',status:'draft',template:'updates',subject:'Synthetic owner preview',message:'Only a local test.',photo:''}],address:'Synthetic fixture address',history:[]};
  p.sql.prepare('UPDATE workspaces SET ledger_json=? WHERE id=?').run(JSON.stringify(l),p.env.PUBLIC_WORKSPACE_ID);
  await page.setExtraHTTPHeaders({'X-Synthetic-Owner':'a'});await page.goto(p.origin+'/studio#Marketing');
  await expect(page.getByRole('button',{name:'Review campaign audience',exact:true})).toHaveCount(0);
  page.once('dialog',d=>d.accept(owner));await page.getByRole('button',{name:'Review owner test',exact:true}).click();
  await expect(page.getByText('queued-review',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Synchronize and process pending work',exact:true}).click();
  await expect(page.getByRole('button',{name:'Confirm owner test',exact:true})).toBeVisible({timeout:60000});
  expect(provider.sends).toBe(0);await expect(page.getByText('Final audience (1): '+owner,{exact:true})).toBeVisible();
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Confirm owner test',exact:true}).click();
  await expect(page.getByText('queued-send',{exact:true})).toBeVisible();expect(provider.sends).toBe(0);
  await page.getByRole('button',{name:'Synchronize and process pending work',exact:true}).click();
  await expect(page.getByText('accepted · Provider: accepted',{exact:true})).toBeVisible({timeout:60000});expect(provider.sends).toBe(1);
  await page.getByRole('button',{name:'Refresh provider results',exact:true}).click();
  await expect(page.getByText('sent · Provider: sent',{exact:true})).toBeVisible({timeout:60000});
  await expect(page.getByText(/delivered: 1/)).toBeVisible();expect(provider.sends).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 } finally { globalThis.fetch=previousFetch;await p.close(); }
});
