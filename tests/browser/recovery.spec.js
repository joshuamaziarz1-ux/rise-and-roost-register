import {test,expect} from '@playwright/test';
import {adminLogin,shop,rpc} from './helpers.js';
import fs from 'node:fs/promises';
async function pay(page){await shop(page);await page.locator('[data-rr-plus="item-test"]').click();await page.locator('#rr48CartBar').click();await page.locator('#payBtn').click();await page.locator('[data-method="cash"]').click();}
test('two rapid confirmation taps create exactly one sale and stock decrement',async({page})=>{
 await pay(page);const before=await rpc(page,'admin_load',{},true);let requests=0;
 await page.route('**/functions/v1/rise-roost-sync',route=>{if(route.request().postDataJSON().action==='checkout')requests++;return route.continue();});
 await page.locator('#rr48ConfirmPay').evaluate(b=>{b.click();b.click();});await expect(page.locator('#thanks')).toBeVisible();
 const after=await rpc(page,'admin_load',{},true);expect(after.data.sales.length).toBe(before.data.sales.length+1);expect(after.data.items.find(i=>i.id==='item-test').stock).toBe(before.data.items.find(i=>i.id==='item-test').stock-1);expect(requests).toBe(1);
 const sale=after.data.sales.find(s=>!before.data.sales.some(x=>x.id===s.id));expect(sale.providerVerified).toBe(false);expect(sale.paymentConfirmation).toBe('self-reported');
});
test('a malformed success response cannot show a completed purchase',async({page})=>{
 await pay(page);page.on('dialog',d=>d.accept());let once=true;
 await page.route('**/functions/v1/rise-roost-sync',route=>{if(route.request().postDataJSON().action==='checkout'&&once){once=false;return route.fulfill({status:200,contentType:'application/json',body:'{"result":{},"catalog":{"brands":[],"items":[]}}'});}return route.continue();});
 const failure=page.waitForEvent('dialog');await page.locator('#rr48ConfirmPay').click();await failure;await expect(page.locator('#thanks')).toBeHidden();expect(await page.evaluate(()=>RRCloud.pendingCheckout)).toBe(true);
 await page.evaluate(()=>RRCloud.refreshCatalog());await page.locator('#rr48ConfirmPay').click();await expect(page.locator('#thanks')).toBeVisible();
});
test('price changes preserve the payment quote and reject the stale checkout',async({page})=>{
 await pay(page);const quote=await page.locator('#payOverlay .big').innerText();let state=await rpc(page,'admin_load',{},true),i=state.data.items.find(i=>i.id==='item-test');
 await rpc(page,'admin_patch',{requestId:crypto.randomUUID(),changes:[{collection:'items',id:i.id,before:i,after:{...i,price:i.price+1}}]},true);await page.evaluate(()=>RRCloud.refreshCatalog());expect(await page.locator('#payOverlay .big').innerText()).toBe(quote);
 page.on('dialog',d=>d.accept());const failure=page.waitForEvent('dialog');await page.locator('#rr48ConfirmPay').click();await failure;await expect(page.locator('#thanks')).toBeHidden();expect((await rpc(page,'admin_load',{},true)).data.sales.length).toBe(state.data.sales.length);
 const latest=(await rpc(page,'admin_load',{},true)).data.items.find(x=>x.id===i.id);await rpc(page,'admin_patch',{requestId:crypto.randomUUID(),changes:[{collection:'items',id:i.id,before:latest,after:{...latest,price:i.price}}]},true);
});
test('unconfirmed Admin edits recover across a reload using the same request',async({page})=>{
 await adminLogin(page);await page.evaluate(()=>showTab('items'));const old=await page.evaluate(()=>item('item-other').stock);let blocked=true,ids=[];
 await page.route('**/functions/v1/rise-roost-sync',route=>{const body=route.request().postDataJSON();if(body.action==='admin_patch'){ids.push(body.requestId);if(blocked)return route.fulfill({status:200,contentType:'application/json',body:'{"result":{"saved":false}}'});}return route.continue();});
 await page.locator('[data-stock="item-other"][data-d="1"]').click();await expect(page.locator('#rrCloudBadge')).toContainText('Not confirmed');await expect(page.locator('#rrCloudSaveStatus')).toContainText('Not saved');await page.reload();blocked=false;await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await expect.poll(()=>page.evaluate(()=>item('item-other').stock)).toBe(old+1);await expect(page.locator('#adminScreen')).not.toHaveAttribute('inert','');expect(new Set(ids).size).toBe(1);
});
test('signup, purchase attribution, revisit, private history and inactivity logout',async({page})=>{
 await page.clock.install();
 await shop(page);await page.evaluate(()=>RRRoost.openSignup());const phone='202555'+String(Math.floor(Math.random()*10000)).padStart(4,'0');
 await page.locator('#rrJoinName').fill('Synthetic Signup');await page.locator('#rrJoinPhone').fill(phone);await page.locator('#rrJoinSubmit').click();await expect(page.locator('#rrShopMemberBar')).toContainText('Synthetic Signup');const id=await page.evaluate(()=>data.customers[0].id);
 await page.locator('[data-rr-plus="item-test"]').click();await page.locator('#rr48CartBar').click();await page.locator('#payBtn').click();await page.locator('[data-method="cash"]').click();await page.locator('#rr48ConfirmPay').click();await expect(page.locator('#thanks')).toBeVisible();
 const sale=(await rpc(page,'admin_load',{},true)).data.sales.find(s=>s.customerId===id);expect(sale).toBeTruthy();expect(sale.customerName).toBe('Synthetic Signup');
 await page.evaluate(()=>RRRoost.logout());expect(await page.evaluate(()=>data.sales.length+data.customers.length+data.roostReturns.length)).toBe(0);
 await page.evaluate(()=>RRRoost.open());await page.locator('#rrPhoneSignIn').fill(phone);await page.locator('#rrPhoneGo').click();await expect(page.locator('#rrShopMemberBar')).toContainText('Synthetic Signup');await page.evaluate(()=>RRRoost.open());await expect(page.locator('#rrHistoryList')).toContainText('Test Eggs');expect(await page.evaluate(()=>data.sales.every(s=>s.customerId===data.customers[0].id))).toBe(true);
 await page.clock.fastForward('02:01');await expect(page.locator('#rrRoostV2Overlay')).toBeHidden();expect(await page.evaluate(()=>sessionStorage.getItem('rr.memberToken'))).toBeNull();expect(await page.evaluate(()=>data.sales.length+data.customers.length)).toBe(0);
});
test('cached catalog survives an unavailable API and cannot confirm a sale',async({page})=>{
 await shop(page);let blocked=true;await page.route('**/functions/v1/rise-roost-sync',route=>blocked?route.abort():route.continue());await page.reload();await expect(page.locator('body')).toHaveAttribute('data-cloud','offline');await page.locator('#rr48StartShop').click();await expect(page.locator('[data-rr-plus="item-test"]')).toBeVisible();await page.locator('[data-rr-plus="item-test"]').click();await page.locator('#rr48CartBar').click();await expect(page.locator('#payBtn')).toBeDisabled();blocked=false;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await expect(page.locator('body')).toHaveAttribute('data-cloud','online');
});
test('customer comments reach the shared Admin state without private public data',async({page,browser})=>{
 await shop(page);const c=await browser.newContext(),ad=await c.newPage();await adminLogin(ad);const text='Synthetic request '+crypto.randomUUID();
 await page.locator('#rr410CommentOverlay').evaluate(e=>e.classList.remove('hidden'));await page.locator('#rr410CommentText').fill(text);await page.locator('#rr410SubmitComment').click();await expect.poll(()=>ad.evaluate(t=>data.comments.some(x=>x.text===t),text)).toBe(true);expect(await page.evaluate(()=>data.comments?.length||0)).toBe(0);await c.close();
});
test('existing Export Backup preserves cloud history, old device records and recovery fields',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('riseRoostRegisterDataV2',JSON.stringify({items:[{id:'legacy-only',name:'Old Device Record'}]})));
 await adminLogin(page);await page.evaluate(()=>showTab('settings'));const downloadEvent=page.waitForEvent('download');await page.locator('#exportBackup').click();const file=await downloadEvent,backup=JSON.parse(await fs.readFile(await file.path(),'utf8'));
 expect(backup.version).toBe(3);expect(backup.data.items.some(i=>i.id==='item-test')).toBe(true);expect(backup.data.items.some(i=>i.id==='legacy-only')).toBe(false);expect(backup.previousDeviceData.items[0].id).toBe('legacy-only');expect(backup).toHaveProperty('unsavedDraft');expect(backup.data).toHaveProperty('sales');
});
