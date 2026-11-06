import { test, expect } from '@playwright/test';
import { randomInt } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { primaryFixture } from '../primary-fixture.mjs';

test('guest checkout, payments, owner verification, messages and extensions synchronize across three independent sessions',async({page,browser},info)=>{
  const fixture=await primaryFixture({experience:true,management:true,commerce:true,pin:true,port:4196});
  const contexts=[];const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const pin=String(randomInt(10000)).padStart(4,'0');
  const nav=(p,name)=>p.getByRole('navigation',{name:p.viewportSize().width<900?'Primary Studio navigation':'Studio navigation',exact:true}).getByRole('button',{name,exact:true});
  const unlock=async p=>{await p.goto(fixture.origin+'/studio');await p.getByLabel('Owner PIN',{exact:true}).fill(pin);await p.getByRole('button',{name:'Open Studio',exact:true}).click();await expect(p.getByRole('heading',{name:'Hi, Danielle!',exact:true})).toBeVisible();};
  try {
    await page.goto(fixture.origin+'/studio/setup#setup='+fixture.setupToken);
    await page.getByLabel('Choose a 4-digit PIN',{exact:true}).fill(pin);await page.getByLabel('Confirm PIN',{exact:true}).fill(pin);await page.getByRole('button',{name:'Save PIN and open Studio',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Hi, Danielle!',exact:true})).toBeVisible();
    if(page.viewportSize().width<900){await nav(page,'More').click();await page.getByRole('button',{name:'Settings',exact:true}).click();}else await nav(page,'Settings').click();
    await page.getByRole('button',{name:'Payments',exact:true}).click();
    await page.context().route(/https:\/\/(www.paypal.com|venmo.com|cash.app)\//,route=>route.fulfill({status:200,contentType:'text/html',body:'<h1>Fictional link test — no money sent</h1>'}));
    for(const [label,url] of [['PayPal','https://www.paypal.com/ncp/payment/FICTIONAL_PREVIEW'],['Venmo','https://venmo.com/u/FictionalPreviewBusiness'],['Cash App','https://cash.app/$FictionalPreviewBusiness']]){
      await page.getByRole('button',{name:'Add '+label+' link',exact:true}).click();
      await page.getByLabel(label+' payment URL',{exact:true}).fill(url);await page.getByLabel('Enabled for customer payments',{exact:true}).check();await page.getByLabel('This destination is approved for my business sales',{exact:true}).check();
      await page.getByRole('button',{name:'Save payment link',exact:true}).click();
      const popup=page.waitForEvent('popup');await page.getByRole('button',{name:'Test '+label+' Link',exact:true}).click();const external=await popup;await expect(external.getByRole('heading')).toContainText('Fictional link test');await external.close();
      await page.getByLabel('I opened the '+label+' link and confirmed the correct business recipient',{exact:true}).check();await page.getByRole('button',{name:'Confirm '+label+' Link Test',exact:true}).click();
    }
    await expect(page.getByRole('heading',{name:'Payments',exact:true})).toBeVisible();
    const owner2=await browser.newContext({...info.project.use});contexts.push(owner2);const second=await owner2.newPage();await unlock(second);
    const customer=await browser.newContext({...info.project.use});contexts.push(customer);const visitor=await customer.newPage();visitor.on('pageerror',e=>errors.push(e.message));
    await customer.route(/https:\/\/(www.paypal.com|venmo.com|cash.app)\//,route=>route.fulfill({status:200,contentType:'text/html',body:'<h1>Fictional payment destination — no money sent</h1>'}));
    await visitor.goto(fixture.origin+'/shop');await visitor.getByRole('button',{name:'Add Slow Sunday sourdough to basket',exact:true}).click();await visitor.locator('.basket-link').click();
    await visitor.getByLabel('Name',{exact:true}).fill('Fictional Preview Neighbor');
    const pickup=visitor.getByLabel('Choose your pickup',{exact:true});await pickup.getByRole('button').first().click();
    await expect(visitor.getByRole('button',{name:'Place preorder',exact:true})).toBeDisabled();await expect(visitor.getByRole('heading',{name:'Thank you. Your preorder is in.',exact:true})).toHaveCount(0);
    await visitor.getByText('Rise & Roost Pickup Policy',{exact:true}).first().click();await expect(visitor.locator('main')).toContainText('forfeited without a refund');
    await visitor.getByLabel('I have read and acknowledge the Rise & Roost Pickup Policy',{exact:true}).check();await visitor.getByRole('button',{name:'Place preorder',exact:true}).click();
    const tracking=await visitor.getByRole('link',{name:'Pay & track your order',exact:true}).getAttribute('href');await visitor.goto(fixture.origin+tracking);
    const current=visitor.getByLabel('Current order status',{exact:true});await expect(current).toContainText('Awaiting Payment Verification');await expect(visitor.getByRole('button',{name:"I've Sent Payment",exact:true})).toHaveCount(0);
    for(const label of ['PayPal','Venmo','Cash App']){
      const popup=visitor.waitForEvent('popup');await visitor.getByRole('link',{name:'Open '+label,exact:true}).click();const external=await popup;await expect(external.getByRole('heading')).toContainText('Fictional payment');await external.close();
      await expect(current).toContainText('Awaiting Payment Verification');await expect(visitor.locator('main')).toContainText('Amount due: $9.00');
    }
    await nav(page,'Orders').click();await page.getByRole('button').filter({hasText:'Fictional Preview Neighbor'}).filter({visible:true}).click();await expect(page.locator('.ms-main')).toContainText('Selected method: Cash App');
    await page.getByRole('button',{name:'Verify payment',exact:true}).click();await page.getByLabel('I checked an independent record for the full payment',{exact:true}).check();await page.getByRole('button',{name:'Confirm Verify Payment',exact:true}).click();
    await expect(current).toContainText('Payment Verified');await expect(visitor.getByLabel('Paid receipt',{exact:true})).toContainText('$9.00');
    await nav(second,'Home').click();await expect(second.locator('.ms-sales')).toContainText('$9.00');
    await page.getByRole('button',{name:'Start Preparing',exact:true}).click();await expect(current).toContainText('Preparing Your Order');await page.getByRole('button',{name:'Mark Ready for Pickup',exact:true}).click();await expect(current).toContainText('Ready for Pickup');await expect(page.getByRole('button',{name:'Start Preparing',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Picked Up',exact:true})).toHaveCount(0);
    await visitor.getByRole('button',{name:'Contact Danielle',exact:true}).click();await visitor.getByLabel('Your message',{exact:true}).fill('I need extra time for this fictional pickup, please.');
    const future=new Date(Date.now()+12*86400000).toISOString().slice(0,10);await visitor.getByLabel('Requested alternative pickup date (optional)',{exact:true}).fill(future);
    const messageRoute='**/api/order-tracking/*/*/message';
    await visitor.route(messageRoute,async route=>{const saved=await route.fetch();expect(saved.status()).toBe(200);await route.fulfill({status:503,contentType:'text/html',body:'<h1>Lost confirmation</h1>'});});
    await visitor.getByRole('button',{name:'Send message',exact:true}).click();await expect(visitor.getByRole('alert')).toContainText('temporarily unavailable');await expect(visitor.getByLabel('Your message',{exact:true})).toHaveValue('I need extra time for this fictional pickup, please.');
    await visitor.unroute(messageRoute);await visitor.reload();
    await expect(visitor.getByRole('form',{name:'Message Danielle'})).toContainText('awaiting confirmation');
    await expect(visitor.getByLabel('Your message',{exact:true})).toHaveValue('I need extra time for this fictional pickup, please.');await expect(visitor.getByLabel('Your message',{exact:true})).toBeDisabled();await expect(visitor.getByLabel('Requested alternative pickup date (optional)',{exact:true})).toHaveValue(future);
    await visitor.getByRole('button',{name:'Retry message',exact:true}).click();await expect(visitor.getByRole('form',{name:'Message Danielle'})).toHaveCount(0);await expect(visitor.locator('main').getByRole('status').filter({hasText:'Customer Contacted'})).toHaveCount(1);await expect(page.locator('.ms-main')).toContainText('I need extra time');await expect(visitor.getByLabel('Conversation with Danielle')).toContainText('time not specified');await expect(page.locator('.ms-main')).toContainText('time not specified');await expect(page.getByText('I need extra time for this fictional pickup, please.',{exact:true})).toHaveCount(1);await expect(second.locator('.ms-metrics')).toContainText('Customer Contacted');
    await page.getByRole('button',{name:'Reply to customer',exact:true}).click();await page.getByLabel('Your reply',{exact:true}).fill('I can approve a new arrangement.');await page.getByRole('button',{name:'Send reply',exact:true}).click();await expect(visitor.getByLabel('Conversation with Danielle')).toContainText('I can approve');
    await page.getByRole('button',{name:'Approve New Pickup Time',exact:true}).click();await page.getByLabel('Approved pickup date',{exact:true}).fill(future);await page.getByLabel('I confirm this new pickup arrangement',{exact:true}).check();await page.getByRole('button',{name:'Approve New Pickup Time',exact:true}).click();
    await expect(visitor.locator('main')).toContainText('Extension Approved');await expect(visitor.locator('main')).toContainText('Original pickup:');
    await visitor.reload();await expect(visitor.locator('main')).toContainText('Extension Approved');expect((await customer.request.get(fixture.origin+'/api/manage/snapshot')).status()).toBe(401);
    await visitor.getByRole('button',{name:'Contact Danielle',exact:true}).click();await visitor.getByLabel('What can Danielle help with?',{exact:true}).selectOption('order');await visitor.getByLabel('Your message',{exact:true}).fill('A fictional ingredient question after approval.');
    await visitor.reload();await expect(visitor.getByLabel('Your message',{exact:true})).toHaveValue('A fictional ingredient question after approval.');await expect(visitor.getByLabel('What can Danielle help with?',{exact:true})).toHaveValue('order');
    await visitor.route(messageRoute,route=>route.fulfill({status:200,contentType:'text/html',body:'<h1>Unexpected success document</h1>'}));
    await visitor.getByRole('button',{name:'Send message',exact:true}).click();await expect(visitor.getByRole('alert')).toContainText('temporarily unavailable');await expect(visitor.getByLabel('Your message',{exact:true})).toBeDisabled();await expect(visitor.getByLabel('Conversation with Danielle')).not.toContainText('A fictional ingredient question after approval.');
    await visitor.unroute(messageRoute);await visitor.route(messageRoute,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:'f'.repeat(48),version:999})}));
    await visitor.getByRole('button',{name:'Retry message',exact:true}).click();await expect(visitor.getByRole('alert')).toContainText('did not confirm this order');
    await visitor.unroute(messageRoute);await visitor.route(messageRoute,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:new URL(fixture.origin+tracking).pathname.split('/').at(-1),version:999,messages:[]})}));
    await visitor.getByRole('button',{name:'Retry message',exact:true}).click();await expect(visitor.getByRole('alert')).toContainText('did not confirm this message');
    await visitor.unroute(messageRoute);await visitor.reload();await expect(visitor.getByLabel('Your message',{exact:true})).toHaveValue('A fictional ingredient question after approval.');await visitor.getByRole('button',{name:'Retry message',exact:true}).click();
    await expect(visitor.getByLabel('Conversation with Danielle').getByText('A fictional ingredient question after approval.',{exact:true})).toHaveCount(1);
    expect(await visitor.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('rr-order-message:')).length)).toBe(0);
    await expect(second.locator('.ms-metric').filter({hasText:'Pickup Extension Requests'}).locator('strong')).toHaveText('0');
    await expect(page.locator('.ms-main')).toContainText('A fictional ingredient question after approval.');await page.getByRole('button',{name:'Resolve conversation',exact:true}).click();await page.getByLabel('Owner review and reason',{exact:true}).fill('Owner answered the fictional ingredient question.');await page.getByLabel('I confirm this owner-reviewed decision',{exact:true}).check();await page.getByRole('button',{name:'Confirm decision',exact:true}).click();
    await expect(visitor.locator('main')).toContainText('Extension Approved');
    expect(await visitor.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await mkdir('qa-results/commerce',{recursive:true});await visitor.screenshot({path:`qa-results/commerce/tracking-${info.project.name}.png`,fullPage:true});await page.screenshot({path:`qa-results/commerce/studio-${info.project.name}.png`,fullPage:true});expect(errors).toEqual([]);
  } finally {for(const c of contexts)await c.close();await fixture.close();}
});

test('blocked browser draft storage is reported without losing safe retries or inventing pickup approval',async({page})=>{
  const fixture=await primaryFixture({experience:true,management:true,commerce:true,readyPayments:true,port:4197}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try {
    const site=await (await page.request.get(fixture.origin+'/api/site')).json(),product=site.document.products[0];
    const made=await page.request.post(fixture.origin+'/api/orders',{headers:{Origin:fixture.origin},data:{workspaceId:fixture.id,storefront:'main',revision:site.revision,requestId:crypto.randomUUID(),pickupId:site.document.pickups[0].id,checkoutMode:'guest',customerDetails:{name:'Fictional Storage Test'},policyAccepted:true,policyVersion:'2026-11-01',lines:[{productId:product.id,variantId:product.variants[0].id,qty:1,unitPrice:product.price}],total:product.price}});expect(made.status()).toBe(201);const order=await made.json();
    await page.addInitScript(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(String(key).startsWith('rr-order-message:'))throw new DOMException('Synthetic storage denial','QuotaExceededError');return set.call(this,key,value);};});
    await page.goto(fixture.origin+order.trackingPath);await page.getByRole('button',{name:'Contact Danielle',exact:true}).click();await page.getByLabel('Your message',{exact:true}).fill('I need more pickup time but have no alternative date yet.');await page.getByLabel('Requested alternative pickup time (optional)',{exact:true}).fill('17:00');
    await expect(page.locator('#contact-recovery-note')).toBeVisible();
    const route='**/api/order-tracking/*/*/message';await page.route(route,r=>r.fulfill({status:503,contentType:'text/html',body:'<h1>Not saved</h1>'}));
    await page.getByRole('button',{name:'Send message',exact:true}).click();await expect(page.getByRole('form',{name:'Message Danielle'})).toContainText('Leave this tab open');await expect(page.getByRole('form',{name:'Message Danielle'})).not.toContainText('kept through refresh');await expect(page.getByLabel('Your message',{exact:true})).toHaveValue('I need more pickup time but have no alternative date yet.');
    await page.unroute(route);await page.getByRole('button',{name:'Retry message',exact:true}).click();await expect(page.getByLabel('Conversation with Danielle')).toContainText('5:00 PM · date not specified');
    const tracked=await (await page.request.get(fixture.origin+new URL(order.trackingPath,fixture.origin).pathname.replace('/orders/','/api/order-tracking/'),{headers:{Authorization:'Bearer '+order.trackingPath.split('=')[1]}})).json();
    expect(tracked.messages).toHaveLength(1);expect(tracked.messages[0].requestedTime).toBe('17:00');expect(tracked.messages[0].requestedDate).toBe('');expect(tracked.attention.extensionRequested).toBe(true);expect(tracked.attention.extensionApproved).toBe(false);expect(tracked.pickup).toEqual(order.pickup);expect(tracked.pickupDeadline).toBe(order.pickupDeadline);expect(errors).toEqual([]);
  } finally {await fixture.close();}
});
