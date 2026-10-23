import {test,expect} from '@playwright/test';
import {adminLogin,shop} from './helpers.js';
test('Admin hide/show, price, inventory and two Registers synchronize without refresh',async({browser,page})=>{
 await adminLogin(page);await page.evaluate(()=>showTab('items'));
 const a=await browser.newContext(),b=await browser.newContext();const r1=await a.newPage(),r2=await b.newPage();await shop(r1);await shop(r2);
 await page.locator('[data-ti="item-test"]').click();for(const r of [r1,r2])await expect(r.locator('[data-rr-plus="item-test"]')).toHaveCount(0);
 await expect(page.locator('#adminScreen')).not.toHaveAttribute('inert','');await page.locator('[data-ti="item-test"]').click();for(const r of [r1,r2])await expect(r.locator('[data-rr-plus="item-test"]')).toBeVisible();
 await page.locator('[data-ei="item-test"]').click();await page.locator('#editItemPrice').fill('7.25');await page.locator('#editItemStock').fill('0');await page.locator('#editSave').click();
 for(const r of [r1,r2]){await expect(r.locator('[data-rr-plus="item-test"]').locator('xpath=ancestor::div[contains(@class,"rr48-product-body")]')).toContainText('$7.25');await expect(r.locator('[data-rr-plus="item-test"]')).toBeDisabled();await expect(r.locator('.rr48-soldout')).toContainText('SOLD OUT');expect((await r.locator('.rr48-stock').allTextContents()).every(s=>!/[0-9]/.test(s))).toBe(true);}
  await expect(page.locator('#adminScreen')).not.toHaveAttribute('inert','');await page.locator('[data-ei="item-test"]').click();await page.locator('#editItemPrice').fill('5');await page.locator('#editItemStock').fill('20');await page.locator('#editSave').click();await expect(page.locator('#adminScreen')).not.toHaveAttribute('inert','');await expect.poll(()=>r1.evaluate(()=>data.items.find(x=>x.id==='item-test').stock)).toBe(20);await a.close();await b.close();
});
test('checkout writes shared inventory; lost response is safely replayed',async({page,context})=>{
 await shop(page);await page.locator('[data-rr-plus="item-test"]').click();await page.locator('#rr48CartBar').click();await page.locator('#payBtn').click();await page.locator('[data-method="cash"]').click();
 let lost=true;await page.route('**/functions/v1/rise-roost-sync',async route=>{const body=route.request().postDataJSON();if(body.action==='checkout'&&lost){lost=false;await route.fetch();await route.abort('failed');}else await route.continue();});
  page.on('dialog',d=>d.accept());const failure=page.waitForEvent('dialog');await page.locator('#rr48ConfirmPay').click();await failure;await expect(page.locator('#rr48ConfirmPay')).toBeEnabled();await expect(page.locator('#thanks')).toBeHidden();expect(await page.evaluate(()=>RRCloud.pendingCheckout)).toBe(true);
  await page.evaluate(()=>window.RRCloud.refreshCatalog());await expect(page.locator('body')).toHaveAttribute('data-cloud','online');await page.locator('#rr48ConfirmPay').click();await expect(page.locator('#thanks')).toBeVisible();
 const receipt=await page.evaluate(()=>sessionStorage.getItem('rr.pendingCheckout'));expect(receipt).toBeNull();
});
test('member credits and profile synchronize; network interruption reconnects',async({browser,page})=>{
 await shop(page);await page.evaluate(()=>window.RRRoost.open());await page.locator('#rrPhoneSignIn').fill('2025550100');await page.locator('#rrPhoneGo').click();
 await expect(page.locator('#rrShopMemberBar')).toContainText('Test Member');
 const c=await browser.newContext(),ad=await c.newPage();await adminLogin(ad);await ad.evaluate(()=>showTab('customers'));ad.on('dialog',d=>d.accept('18'));await ad.locator('[data-carton-adjust="member-test"]').click();
 await expect.poll(()=>page.evaluate(()=>data.customers[0]?.cartonCredits)).toBe(18);
 await page.context().setOffline(true);await page.evaluate(()=>window.dispatchEvent(new Event('offline')));await expect(page.locator('body')).toHaveAttribute('data-cloud','offline');
 await page.context().setOffline(false);await page.evaluate(()=>window.dispatchEvent(new Event('online')));await expect(page.locator('body')).toHaveAttribute('data-cloud','online');await c.close();
});
test('localStorage records are preserved but never used as cloud data',async({page})=>{
 const sentinel=JSON.stringify({brands:[{id:'fake',name:'Local fake'}],items:[{id:'fake-item',brandId:'fake',name:'Local product',stock:999,price:0}]});
 await page.addInitScript(s=>localStorage.setItem('riseRoostRegisterDataV2',s),sentinel);await shop(page);await expect(page.getByText('Local product',{exact:true})).toHaveCount(0);expect(await page.evaluate(()=>localStorage.getItem('riseRoostRegisterDataV2'))).toBe(sentinel);
});
test('Register recovers after six hours open and tab resume',async({page,browser})=>{
 await shop(page);await page.clock.install();await page.clock.fastForward('06:00:00');
 const c=await browser.newContext(),ad=await c.newPage();await adminLogin(ad);await ad.evaluate(()=>showTab('items'));await ad.locator('[data-stock="item-other"][data-d="1"]').click();
 await expect(ad.locator('#adminScreen')).not.toHaveAttribute('inert','');await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(()=>page.evaluate(()=>data.items.find(x=>x.id==='item-other').stock)).toBe(await ad.evaluate(()=>available(item('item-other'))));await c.close();
});
test('Admin offline edits retry once and reach Register after reconnection',async({page,browser})=>{
 await adminLogin(page);await page.evaluate(()=>showTab('items'));const c=await browser.newContext(),r=await c.newPage();await shop(r);
 const old=await r.evaluate(()=>data.items.find(x=>x.id==='item-other').stock);
 await page.context().setOffline(true);await page.locator('[data-stock="item-other"][data-d="1"]').click();await expect(page.locator('#rrCloudBadge')).toContainText('Not confirmed');
 await page.context().setOffline(false);await page.evaluate(()=>window.dispatchEvent(new Event('online')));await expect.poll(()=>r.evaluate(()=>data.items.find(x=>x.id==='item-other').stock)).toBe(old+1);await c.close();
});
test('expired Admin token refreshes; invalid sessions show the sign-in gate',async({page})=>{
 await adminLogin(page);let once=true;
 await page.route('**/functions/v1/rise-roost-sync',async route=>{if(route.request().postDataJSON().action==='admin_load'&&once){once=false;await route.fulfill({status:401,contentType:'application/json',body:'{"error":"Session expired"}'});}else await route.continue();});
 await page.evaluate(()=>window.RRCloud.refreshCatalog());await expect(page.locator('#rrCloudGate')).toHaveCount(0);expect(once).toBe(false);
 await page.unroute('**/functions/v1/rise-roost-sync');await page.route('**/functions/v1/rise-roost-sync',route=>route.fulfill({status:401,contentType:'application/json',body:'{"error":"Session expired"}'}));
 await page.evaluate(()=>window.RRCloud.refreshCatalog());await expect(page.locator('#rrCloudGate')).toBeVisible();
});
test('member profile and return UI save to shared storage',async({page})=>{
 await shop(page);await page.evaluate(()=>window.RRRoost.open());await page.locator('#rrPhoneSignIn').fill('2025550100');await page.locator('#rrPhoneGo').click();await expect(page.locator('#rrShopMemberBar')).toContainText('Test Member');await page.evaluate(()=>window.RRRoost.open());
 await expect(page.locator('#rrProfileName')).toBeVisible();await page.locator('#rrProfileName').fill('Test Member');await page.locator('#rrSaveProfile').click();await expect(page.locator('#rrProfileStatus')).toContainText('Saved');
 const before=await page.evaluate(()=>data.customers[0].cartonCredits);await page.locator('[data-ret-plus="egg-carton"]').click();await page.locator('#rrSubmitReturns').click();await expect.poll(()=>page.evaluate(()=>data.customers[0].cartonCredits)).toBe(before+1);
});
test('unconfirmed purchase survives reload and is recovered without a second sale',async({page})=>{
 await shop(page);const before=await page.evaluate(()=>data.items.find(x=>x.id==='item-test').stock);await page.locator('[data-rr-plus="item-test"]').click();await page.locator('#rr48CartBar').click();await page.locator('#payBtn').click();await page.locator('[data-method="cash"]').click();
 let lost=true;page.on('dialog',d=>d.accept());await page.route('**/functions/v1/rise-roost-sync',async route=>{if(route.request().postDataJSON().action==='checkout'&&lost){lost=false;await route.fetch();await route.abort('failed');}else await route.continue();});
 const failure=page.waitForEvent('dialog');await page.locator('#rr48ConfirmPay').click();await failure;await expect(page.locator('#rr48ConfirmPay')).toBeEnabled();await expect.poll(()=>page.evaluate(()=>window.RRCloud.pendingCheckout)).toBe(true);await page.reload();await expect(page.locator('#rrRecoverPurchase')).toBeVisible();await page.locator('#rrRecoverConfirm').click();await expect(page.locator('#rrRecoverPurchase')).toHaveCount(0);await expect(page.locator('#thanks')).toBeVisible();expect(await page.evaluate(()=>data.items.find(x=>x.id==='item-test').stock)).toBe(before-1);
});
test('concurrent Admin edits preserve the completed change and reject a stale modal',async({page,browser})=>{
 await adminLogin(page);await page.evaluate(()=>showTab('items'));await page.locator('[data-ei="item-other"]').click();const original=await page.locator('#editItemStock').inputValue();await page.locator('#editItemPrice').fill('8');
 const c=await browser.newContext(),second=await c.newPage();await adminLogin(second);await second.evaluate(()=>showTab('items'));await second.locator('[data-stock="item-other"][data-d="1"]').click();await expect(second.locator('#adminScreen')).not.toHaveAttribute('inert','');
 let conflict='';page.on('dialog',async d=>{conflict=d.message();await d.accept();});await page.locator('#editSave').click();await expect.poll(()=>conflict).toContain('changed on another device');await expect.poll(()=>page.evaluate(()=>data.items.find(x=>x.id==='item-other').stock)).toBe(Number(original)+1);expect(await page.evaluate(()=>data.items.find(x=>x.id==='item-other').price)).toBe(3);expect(await page.evaluate(()=>RRData.getDraft().unconfirmedChanges.some(c=>c.id==='item-other'&&c.after.price===8))).toBe(true);await c.close();
});
