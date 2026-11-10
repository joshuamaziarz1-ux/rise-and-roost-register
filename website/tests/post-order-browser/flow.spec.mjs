import { test, expect } from '@playwright/test';
import { postOrderFixture } from '../post-order-fixture.mjs';
import { mkdir } from 'node:fs/promises';
const policy = 'I have read and acknowledge the Rise & Roost Sales, Cancellation & Pickup Policy, including the no-refund terms';
const methods = { paypal: ['PayPal','https://paypal.me/SyntheticFinalFlow'], venmo: ['Venmo','https://venmo.com/u/SyntheticFinalFlow'], cashapp: ['Cash App','https://cash.app/$SyntheticFinalFlow'], cash_pickup: ['Cash at Pickup',null] };
for (const [method,[label,url]] of Object.entries(methods)) test('place, choose '+label+', track and confirm paid',async({page},info)=>{
 const f=await postOrderFixture(), errors=[];page.on('pageerror',e=>errors.push(e.message));
 try {
  for (const [provider,[,destination]] of Object.entries(methods).filter(([,v])=>v[1])) await f.configure(provider,destination);
  f.env.REAL_CHECKOUT_ENABLED='true';
  await page.context().route(/https:\/\/(paypal\.me|venmo\.com|cash\.app)\//,r=>r.fulfill({contentType:'text/html',body:'<h1>Isolated payment destination</h1>'}));
  const p=(await f.call('/api/site')).data.document.products[0];
  await page.goto(f.origin+'/shop');await page.getByRole('button',{name:'Add '+p.name+' to basket',exact:true}).click();await page.locator('.basket-link').click();
  await expect(page.getByRole('region',{name:'Checkout payment options'})).toHaveCount(0);
  for (const [name] of Object.values(methods)) {await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);await expect(page.getByRole('link',{name:'Open '+name,exact:true})).toHaveCount(0);}
  const action=page.getByRole('button',{name:'Place Order',exact:true});await expect(action).toBeDisabled();
  await page.getByLabel('Name',{exact:true}).fill('Synthetic Final Customer');
  await page.getByLabel('Email address',{exact:true}).fill('synthetic@example.test');
  await page.getByLabel('Phone number',{exact:true}).fill('555-010-1234');
  await expect(action).toBeDisabled();await page.getByLabel(policy,{exact:true}).check();await expect(action).toBeEnabled();
  let count=0,payload;await page.route('**/api/orders',async route=>{count++;payload=route.request().postDataJSON();await route.continue();});
  await action.evaluate(el=>{el.click();el.click();});
  await expect(page.getByRole('heading',{name:'Order Received!',exact:true})).toBeVisible();
  expect(count).toBe(1);expect(payload.paymentMethod).toBeUndefined();
  const summary=page.getByRole('region',{name:'Order summary',exact:true});await expect(summary).toContainText(p.name);await expect(summary).toContainText('Total:');
  for(const [name,destination] of Object.values(methods)) await expect(destination?page.getByRole('link',{name:'Open '+name,exact:true}):page.getByRole('button',{name,exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await mkdir('qa-results/post-order',{recursive:true});await page.screenshot({path:`qa-results/post-order/received-${method}-${info.project.name}.png`,fullPage:true});
  const order=(await f.snapshot()).orders[0];expect(order.selectedPaymentMethod).toBeUndefined();expect(order.paymentVerifiedAt).toBeUndefined();
  const tracking=(await f.track((await f.order({requestId:payload.requestId})).data)).data.trackingPath;
  if(url){const opening=page.waitForEvent('popup');await page.getByRole('link',{name:'Open '+label,exact:true}).click();const popup=await opening;await expect(popup.getByRole('heading')).toHaveText('Isolated payment destination');expect(popup.url()).toBe(url);await popup.close();}
  else {let popups=0;page.on('popup',()=>popups++);await page.getByRole('button',{name:label,exact:true}).click();await expect(page.getByRole('region',{name:'Payment options'})).toContainText('Cash at Pickup selected');expect(popups).toBe(0);}
  await expect.poll(async()=>(await f.snapshot()).orders[0].selectedPaymentMethod).toBe(method);
  expect((await f.snapshot()).orders).toHaveLength(1);expect((await f.snapshot()).management.today.verifiedSales).toBe(0);
  await page.goto(f.origin+tracking);await expect(page.getByLabel('Current order status')).toContainText(method==='cash_pickup'?'Awaiting Cash at Pickup':'Awaiting Payment Verification');
  await page.reload();await expect(page.getByRole('region',{name:'Payment options'})).toContainText(label+' selected');
  let o=(await f.snapshot()).orders[0];
  const confirmed=method==='cash_pickup'?await f.change('cash-received',{id:o.id,orderVersion:o.version,confirmed:true,amount:o.total}):await f.change('verify-payment',{id:o.id,orderVersion:o.version,method,independentlyVerified:true,evidence:''});expect(confirmed.status).toBe(200);
  await expect(page.getByRole('heading',{name:'Paid',exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'Payment options'})).toHaveCount(0);
  await page.reload();await expect(page.getByLabel('Paid receipt',{exact:true})).toBeVisible();
  for(const [name,destination] of Object.values(methods)) await expect(destination?page.getByRole('link',{name:'Open '+name,exact:true}):page.getByRole('button',{name,exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  expect((await f.snapshot()).orders).toHaveLength(1);expect(errors).toEqual([]);
  await mkdir('qa-results/post-order',{recursive:true});await page.screenshot({path:`qa-results/post-order/${method}-${info.project.name}.png`,fullPage:true});
 }finally{await f.close();}
});
test('leave unpaid, resume privately, recover failed save and guard canceled orders',async({page})=>{
 const f=await postOrderFixture();try{
  await f.configure();f.env.REAL_CHECKOUT_ENABLED='true';const made=await f.order();expect(made.status).toBe(201);
  await page.goto(f.origin+made.data.trackingPath);await expect(page.getByRole('region',{name:'Payment options'})).toContainText('saved and unpaid');
  await page.goto(f.origin+'/shop');await page.goto(f.origin+made.data.trackingPath);await expect(page.getByRole('button',{name:'Cash at Pickup',exact:true})).toBeVisible();
  await page.route('**/payment-method',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"Synthetic network interruption"}'}));
  await page.getByRole('button',{name:'Cash at Pickup',exact:true}).click();await expect(page.getByRole('alert')).toContainText('payment-method choice was not confirmed');expect((await f.snapshot()).orders[0].selectedPaymentMethod).toBeUndefined();
  await page.unroute('**/payment-method');await page.getByRole('button',{name:'Cash at Pickup',exact:true}).click();await expect(page.getByRole('region',{name:'Payment options'})).toContainText('Cash at Pickup selected');
  // Complete the existing customer cancellation route; payment controls disappear.
  const canceled=await f.track(made.data,'/cancel',{confirmCancellation:true,confirmUnpaid:true});expect(canceled.status).toBe(200);
  await page.reload();await expect(page.getByRole('region',{name:'Payment options'})).toHaveCount(0);expect((await f.snapshot()).orders).toHaveLength(1);
 }finally{await f.close();}
});
test('saved confirmation recovers a failed cash save and stops asking after Studio confirmation',async({page})=>{
 const f=await postOrderFixture();try{
  f.env.REAL_CHECKOUT_ENABLED='true';await f.configure();const p=(await f.call('/api/site')).data.document.products[0];
  await page.goto(f.origin+'/shop');await page.getByRole('button',{name:'Add '+p.name+' to basket',exact:true}).click();await page.locator('.basket-link').click();
  await page.getByLabel('Name',{exact:true}).fill('Synthetic Receipt Customer');await page.getByLabel('Email address',{exact:true}).fill('receipt@example.test');await page.getByLabel('Phone number',{exact:true}).fill('555-010-1234');await page.getByLabel(policy,{exact:true}).check();
  await page.getByRole('button',{name:'Place Order',exact:true}).click();await expect(page.getByRole('heading',{name:'Order Received!',exact:true})).toBeInViewport();
  await page.route('**/payment-method',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"Synthetic save interruption"}'}));
  await page.getByRole('button',{name:'Cash at Pickup',exact:true}).click();await expect(page.locator('#notice')).toContainText('payment choice was not confirmed');expect((await f.snapshot()).orders[0].selectedPaymentMethod).toBeUndefined();
  await page.unroute('**/payment-method');await page.getByRole('button',{name:'Cash at Pickup',exact:true}).click();await expect(page.getByRole('region',{name:'Payment options'})).toContainText('Cash at Pickup selected');
  const o=(await f.snapshot()).orders[0];expect((await f.change('cash-received',{id:o.id,orderVersion:o.version,amount:o.total,confirmed:true})).status).toBe(200);
  await expect(page.getByRole('heading',{name:'Paid',exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'Payment options'})).toHaveCount(0);expect((await f.snapshot()).orders).toHaveLength(1);
 }finally{await f.close();}
});
