import { test,expect } from '@playwright/test';
import { randomInt } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { primaryFixture } from '../primary-fixture.mjs';
test.describe('remembered testing PIN Studio',()=>{
 test.skip(!!process.env.RR_BETA_BASE_URL,'Never run this suite on the original beta.');
 let fixture,pin;
 test.beforeEach(async()=>{fixture=await primaryFixture({experience:true,management:true,pin:true,port:4194});pin=String(randomInt(10000)).padStart(4,'0');});
 test.afterEach(async()=>{await fixture?.close();});
 const nav=(page,name)=>page.getByRole('navigation',{name:page.viewportSize().width<=900?'Primary Studio navigation':'Studio navigation',exact:true}).getByRole('button',{name,exact:true});
 async function absentLegacy(page){for(const label of ['Workspace ID','Private access key','Email address'])await expect(page.getByLabel(label,{exact:true})).toHaveCount(0);}
 async function setup(page){await page.goto(fixture.origin+'/studio/setup#setup='+fixture.setupToken);await expect(page).toHaveURL(fixture.origin+'/studio/setup');await page.getByLabel('Choose a 4-digit PIN',{exact:true}).fill(pin);await page.getByLabel('Confirm PIN',{exact:true}).fill(pin);await page.getByRole('button',{name:'Save PIN and open Studio',exact:true}).click();await expect(page.getByRole('heading',{name:'Hi, Danielle!',exact:true})).toBeVisible();}
 async function unlock(page){await page.getByLabel('Owner PIN',{exact:true}).fill(pin);await page.getByRole('button',{name:'Open Studio',exact:true}).click();await expect(page.getByRole('heading',{name:'Hi, Danielle!',exact:true})).toBeVisible();await absentLegacy(page);}
 test('private setup, two remembered devices, cross-device publication and one-click locking',async({page,browser},info)=>{
  await page.goto(fixture.origin+'/studio?workspace='+'b'.repeat(48));await absentLegacy(page);
  await expect(page.getByRole('heading',{name:'Website Studio',exact:true})).toBeVisible();
  expect((await page.request.get(fixture.origin+'/api/manage/snapshot')).status()).toBe(401);
  await setup(page);await expect(page).toHaveURL(fixture.origin+'/studio#Home');
  await mkdir('qa-results/pin-preview',{recursive:true});await page.screenshot({path:`qa-results/pin-preview/dashboard-${info.project.name}.png`,fullPage:true});
  const context=await browser.newContext({...info.project.use});
  try{
   const second=await context.newPage();await second.goto(fixture.origin+'/studio');await absentLegacy(second);await unlock(second);
   const customer=await browser.newContext({...info.project.use});
   try{
    const visitor=await customer.newPage();await visitor.goto(fixture.origin+'/shop');expect((await customer.request.get(fixture.origin+'/api/studio')).status()).toBe(401);
    await nav(page,'Products').click();await page.locator('.ms-product').first().getByRole('button',{name:'Edit product',exact:true}).click();await page.getByLabel('Product name',{exact:true}).fill('Synthetic remembered-PIN loaf');await page.getByRole('button',{name:'Save product live',exact:true}).click();
    await expect(visitor.getByRole('heading',{name:'Synthetic remembered-PIN loaf',exact:true})).toBeVisible();await nav(second,'Products').click();await expect(second.getByRole('heading',{name:'Synthetic remembered-PIN loaf',exact:true})).toBeVisible();
    await context.setExtraHTTPHeaders({'CF-Connecting-IP':'2001:db8::123'});await second.reload();await expect(second.getByRole('heading',{name:'Hi, Danielle!',exact:true})).toBeVisible();await expect(second).toHaveURL(fixture.origin+'/studio#Home');
    const cookies=await context.cookies();expect(cookies.find(c=>c.name==='rr_pin_loopback').httpOnly).toBe(true);expect(cookies.some(c=>c.name.startsWith('rr_studio'))).toBe(false);
    await page.getByRole('button',{name:'Lock Studio',exact:true}).click();await expect(page.getByLabel('Owner PIN',{exact:true})).toBeVisible();await absentLegacy(page);await page.screenshot({path:`qa-results/pin-preview/pin-${info.project.name}.png`,fullPage:true});
    expect((await page.request.get(fixture.origin+'/api/manage/snapshot')).status()).toBe(401);expect((await second.request.get(fixture.origin+'/api/manage/snapshot')).status()).toBe(200);
    await page.reload();await expect(page.getByLabel('Owner PIN',{exact:true})).toBeVisible();await unlock(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
   }finally{await customer.close();}
  }finally{await context.close();}
 });
 test('PIN rejection and expired sessions protect APIs while preserving an unsaved form through unlock and lock',async({page})=>{
  await setup(page);await nav(page,'Products').click();await page.locator('.ms-product').first().getByRole('button',{name:'Edit product',exact:true}).click();await page.getByLabel('Product name',{exact:true}).fill('Kept unsaved PIN form');
  await page.context().clearCookies();await page.getByRole('button',{name:'Check connection',exact:true}).click();await expect(page.getByRole('heading',{name:'Studio is locked',exact:true})).toBeVisible();await absentLegacy(page);
  expect((await page.request.post(fixture.origin+'/api/manage/product',{headers:{Origin:fixture.origin},data:{}})).status()).toBe(401);
  const signin=await page.context().newPage();await signin.goto(fixture.origin+'/studio');await signin.getByLabel('Owner PIN',{exact:true}).fill(pin==='0000'?'0001':'0000');await signin.getByRole('button',{name:'Open Studio',exact:true}).click();await expect(signin.getByRole('status').first()).toContainText('PIN did not match');await unlock(signin);
  await page.getByRole('button',{name:'Check connection',exact:true}).click();await expect(page.getByLabel('Product name',{exact:true})).toHaveValue('Kept unsaved PIN form');await signin.close();
  await page.getByRole('button',{name:'Lock Studio',exact:true}).click();await expect(page.getByLabel('Owner PIN',{exact:true})).toBeVisible();await page.getByLabel('Owner PIN',{exact:true}).fill(pin);await page.getByRole('button',{name:'Open Studio',exact:true}).click();await expect(page.getByLabel('Product name',{exact:true})).toHaveValue('Kept unsaved PIN form');
  await page.getByRole('button',{name:'Save product live',exact:true}).click();await expect(page.getByRole('heading',{name:'Kept unsaved PIN form',exact:true})).toBeVisible();
 });
 test('public customer Home and Shop remain visually unchanged without a PIN or account',async({browser},info)=>{
  const baseline=await primaryFixture({experience:true,management:true,port:4195});const context=await browser.newContext({...info.project.use,deviceScaleFactor:1});
  try{const page=await context.newPage();for(const path of ['/','/shop']){const captures=[];for(const origin of [baseline.origin,fixture.origin]){await page.goto(origin+path);await expect(page.locator('.experience')).toBeVisible();await page.locator('img').evaluateAll(images=>Promise.all(images.map(i=>{i.loading='eager';return i.decode();})));await page.evaluate(()=>document.fonts.ready);captures.push(await page.screenshot({fullPage:true,animations:'disabled'}));}expect(Buffer.compare(...captures),'Customer '+path+' changed').toBe(0);}}finally{await context.close();await baseline.close();}
 });
});
