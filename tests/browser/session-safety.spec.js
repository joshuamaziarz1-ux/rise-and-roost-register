import {test,expect} from '@playwright/test';
import {shop,adminLogin,rpc} from './helpers.js';
// These cases deliberately hold valid responses across several UI actions.
// Keep the transport deadline separate from the session-race behavior under test.
test.beforeEach(async({page})=>{await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{if(window.RR_CONFIG)window.RR_CONFIG.timeoutMs=10000;}));});
async function signIn(page,phone='2025550100'){await page.evaluate(()=>RRRoost.open());await page.locator('#rrPhoneSignIn').fill(phone);await page.locator('#rrPhoneGo').click();await expect(page.locator('#rrShopMemberBar')).toContainText(phone.endsWith('0101')?'Other Member':'Test Member');}
test('a delayed sign-in response cannot restore an account after logout',async({page})=>{
 await shop(page);let release,started;const held=new Promise(r=>release=r),seen=new Promise(r=>started=r);
 await page.route('**/functions/v1/rise-roost-sync',async route=>{if(route.request().postDataJSON().action==='member_lookup_phone'){const response=await route.fetch();started();await held;await route.fulfill({response});}else await route.continue();});
 await page.evaluate(()=>RRRoost.open());await page.locator('#rrPhoneSignIn').fill('2025550100');await page.locator('#rrPhoneGo').click();await seen;await page.evaluate(()=>RRRoost.logout());release();
 await expect(page.locator('#rrPhoneGo')).toBeEnabled();expect(await page.evaluate(()=>sessionStorage.getItem('rr.memberToken'))).toBeNull();expect(await page.evaluate(()=>data.customers.length+data.sales.length)).toBe(0);await expect(page.locator('#rrShopMemberBar')).not.toContainText('Test Member');
});
test('a stale account expiry cannot sign out the next member',async({page})=>{
 await shop(page);await signIn(page);let release,started;const held=new Promise(r=>release=r),seen=new Promise(r=>started=r);let captured=false;
 await page.route('**/functions/v1/rise-roost-sync',async route=>{if(route.request().postDataJSON().action==='member_account'&&!captured){captured=true;started();await held;await route.fulfill({status:401,contentType:'application/json',body:'{"error":"Expired previous session"}'});}else await route.continue();});
 await page.evaluate(()=>{window.heldRefresh=RRCloud.refreshCatalog();});await seen;await page.evaluate(()=>RRRoost.logout());await signIn(page,'2025550101');release();await page.evaluate(()=>window.heldRefresh);
 await expect(page.locator('#rrShopMemberBar')).toContainText('Other Member');expect(await page.evaluate(()=>data.customers[0]?.id)).toBe('member-other');expect(await page.evaluate(()=>!!sessionStorage.getItem('rr.memberToken'))).toBe(true);
});
test('a delayed committed return cannot repopulate private data after logout',async({page})=>{
 await shop(page);await signIn(page);await page.evaluate(()=>RRRoost.open());let release,started;const held=new Promise(r=>release=r),seen=new Promise(r=>started=r);
 await page.route('**/functions/v1/rise-roost-sync',async route=>{if(route.request().postDataJSON().action==='roost_return'){const response=await route.fetch();started();await held;await route.fulfill({response});}else await route.continue();});
 await page.locator('[data-ret-plus="egg-carton"]').click();await page.locator('#rrSubmitReturns').click();await seen;await page.evaluate(()=>RRRoost.logout());release();await expect(page.locator('#rrSubmitReturns')).toBeEnabled();expect(await page.evaluate(()=>data.customers.length+data.roostReturns.length)).toBe(0);expect(await page.evaluate(()=>sessionStorage.getItem('rr.memberToken'))).toBeNull();
});
test('an open Roost account updates eligible returns and pickup cards automatically',async({page})=>{
 await shop(page);await signIn(page);await page.evaluate(()=>RRRoost.open());const state=await rpc(page,'admin_load',{},true),settings=state.data.settings.roostCreditSettings;
 const next={...settings,returnTypes:[...settings.returnTypes,{id:'synthetic-bottle',name:'Synthetic Bottle',credit:2,active:true}]};
 await rpc(page,'admin_patch',{requestId:crypto.randomUUID(),changes:[{collection:'settings',id:'roostCreditSettings',before:{id:'roostCreditSettings',value:settings},after:{id:'roostCreditSettings',value:next}}]},true);
 await expect(page.locator('[data-ret-plus="synthetic-bottle"]')).toBeVisible();
 const order={id:'ui-pickup-'+crypto.randomUUID(),code:'U'+Date.now().toString().slice(-6),customerId:'member-test',customerName:'Test Member',phone:'2025550100',status:'ready',paid:false,items:[{itemId:'item-other',qty:1}],created:new Date().toISOString()};
 order.scheduledAt='2026-10-25T16:00:00.000Z';order.doorPin='NEVER-DISPLAY';
 await rpc(page,'admin_import',{requestId:crypto.randomUUID(),records:[{collection:'pickups',id:order.id,value:order}]},true);await expect(page.locator('#rrPickupList')).toContainText('Test Jam');await expect(page.locator('#rrPickupList')).toContainText(await page.evaluate(date=>new Date(date).toLocaleString(),order.scheduledAt));await expect(page.locator('#rrPickupList')).not.toContainText('NEVER-DISPLAY');
 const latest=(await rpc(page,'admin_load',{},true)).data.settings.roostCreditSettings;await rpc(page,'admin_patch',{requestId:crypto.randomUUID(),changes:[{collection:'settings',id:'roostCreditSettings',before:{id:'roostCreditSettings',value:latest},after:{id:'roostCreditSettings',value:settings}}]},true);
 await expect(page.locator('[data-ret-plus="synthetic-bottle"]')).toHaveCount(0);
 const saved=(await rpc(page,'admin_load',{},true)).data.pickups.find(x=>x.id===order.id);await rpc(page,'admin_patch',{requestId:crypto.randomUUID(),changes:[{collection:'pickups',id:order.id,before:saved,after:{...saved,status:'cancelled',completed:new Date().toISOString()}}]},true);await expect(page.locator('#rrPickupList')).toContainText('Cancelled');
});
test('pending Admin recovery cannot be submitted by a different approved account',async({page})=>{
 await adminLogin(page);await page.evaluate(()=>showTab('items'));let blocked=true,wrongActorRequests=0;
 await page.route('**/functions/v1/rise-roost-sync',route=>{if(route.request().postDataJSON().action==='admin_patch'){if(route.request().headers().authorization==='Bearer different-approved-token')wrongActorRequests++;if(blocked)return route.abort();}return route.continue();});
 await page.locator('[data-stock="item-other"][data-d="1"]').click();await expect(page.locator('#rrCloudSaveStatus')).toContainText('Not saved');
 await page.evaluate(async()=>{const {data:{session}}=await RRCloud.client.auth.getSession();RRCloud.client.auth.getSession=async()=>({data:{session:{...session,user:{...session.user,id:'33333333-3333-4333-8333-333333333333'},access_token:'different-approved-token'}}});});blocked=false;await page.evaluate(()=>dispatchEvent(new Event('online')));await expect(page.locator('#rrCloudGate')).toBeVisible();expect(wrongActorRequests).toBe(0);
});
test('administrator sign-out clears private in-memory records behind the sign-in gate',async({page})=>{
 await adminLogin(page);expect(await page.evaluate(()=>data.customers.length)).toBeGreaterThan(0);await page.evaluate(()=>RRCloud.client.auth.signOut());await expect(page.locator('#rrCloudGate')).toBeVisible();await expect.poll(()=>page.evaluate(()=>data.customers.length+data.sales.length+data.pickups.length)).toBe(0);await expect(page.locator('#adminScreen')).toHaveAttribute('inert','');
});
test('a delayed Admin read cannot reopen the store after administrator sign-out',async({page})=>{
 await adminLogin(page);let release,started;const held=new Promise(r=>release=r),seen=new Promise(r=>started=r);let captured=false;
 await page.route('**/functions/v1/rise-roost-sync',async route=>{if(route.request().postDataJSON().action==='admin_load'&&!captured){captured=true;const response=await route.fetch();started();await held;await route.fulfill({response});}else await route.continue();});
 await page.evaluate(()=>{window.heldAdminRead=RRCloud.refreshCatalog();});await seen;await page.evaluate(()=>RRCloud.client.auth.signOut());await expect(page.locator('#rrCloudGate')).toBeVisible();release();await page.evaluate(()=>window.heldAdminRead);await expect(page.locator('#rrCloudGate')).toBeVisible();expect(await page.evaluate(()=>data.customers.length+data.sales.length)).toBe(0);expect(await page.evaluate(()=>RRCloud.ready)).toBe(false);
});
