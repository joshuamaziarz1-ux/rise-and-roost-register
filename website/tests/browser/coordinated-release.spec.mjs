import {test,expect} from '@playwright/test';
import {primaryFixture} from '../primary-fixture.mjs';
let f;test.beforeEach(async({},info)=>{if(info.title.startsWith('pickup request form')) f=await primaryFixture({experience:true,management:true,port:4384});});test.afterEach(async()=>{await f?.close();});
test('pickup request form and consent remain usable at this viewport',async({page})=>{
 await page.goto(f.origin+'/shop');
 await page.evaluate(async()=>{const {pickupRequest}=await import('/pickup-request.mjs'); const {subscriptionForm}=await import('/subscribe.mjs');document.body.replaceChildren(pickupRequest({id:'synthetic',orderNumber:'RR-TEST',status:'ready',pickupCustomerName:'Test Neighbor',pickup:{date:'2027-05-01',start:'14:00',end:'15:00'}},async value=>{window.submitted=value;return true;}),subscriptionForm());});
 await page.getByText('Request Pickup Change',{exact:true}).click();
 await expect(page.getByText('Current pickup:',{exact:false})).toBeVisible();
 await page.getByLabel('Requested new pickup date').fill('2027-05-05');await page.getByLabel('Requested new pickup time').fill('14:00');await page.getByRole('button',{name:'Send Request',exact:true}).click();
 expect(await page.evaluate(()=>window.submitted.date)).toBe('2027-05-05');
 await expect(page.getByRole('checkbox')).not.toBeChecked();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
import {productionBrowserFixture} from '../production-browser-fixture.mjs';
test('Studio saves a marketing draft, previews it and suppresses a subscriber without enabling delivery',async({page})=>{
 const p=await productionBrowserFixture();try{
 const row=p.sql.prepare('SELECT ledger_json FROM workspaces WHERE id=?').get(p.env.PUBLIC_WORKSPACE_ID);const ledger=JSON.parse(row.ledger_json);ledger.marketing={contacts:[{id:'f'.repeat(48),email:'synthetic-subscriber@example.test',status:'confirmed'}],campaigns:[],history:[],address:''};p.sql.prepare('UPDATE workspaces SET ledger_json=? WHERE id=?').run(JSON.stringify(ledger),p.env.PUBLIC_WORKSPACE_ID);
 await page.setExtraHTTPHeaders({'X-Synthetic-Owner':'a'});await page.goto(p.origin+'/studio#Marketing');
 await expect(page.getByRole('heading',{name:'Marketing',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Create campaign',exact:true}).click();
 await page.getByLabel('Subject',{exact:true}).fill('Fresh bread this week');await page.getByLabel('Message',{exact:true}).fill('See the bakery website for our latest breads.');
 await page.getByRole('button',{name:'Save draft',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Fresh bread this week',exact:true})).toBeVisible();
 await page.getByText('Preview email',{exact:true}).click();
 await expect(page.frameLocator('iframe').getByRole('heading',{name:'Fresh bread this week'})).toBeVisible();
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Unsubscribe',exact:true}).click();await expect(page.getByText('unsubscribed',{exact:true})).toBeVisible();
 const s=await p.snapshot();expect(s.management.marketing.contacts[0].status).toBe('unsubscribed');expect(s.management.marketing.campaigns.length).toBe(1);expect(s.management.marketing.sendingEnabled).toBe(false);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }finally{await p.close();}
});
test('private guest request reaches Studio and approval updates tracking while checkout and email stay disabled',async({page})=>{
 const p=await productionBrowserFixture();try{
 expect((await p.configure()).status).toBe(200);p.env.REAL_CHECKOUT_ENABLED='true';const created=await p.order();expect(created.status).toBe(201);p.env.REAL_CHECKOUT_ENABLED='false';p.env.ORDER_EMAIL_ENABLED='false';p.env.PICKUP_REQUESTS_ENABLED='true';
 const order=created.data;await page.goto(p.origin+order.trackingPath);await page.getByText('Request Pickup Change',{exact:true}).click();
 await page.getByLabel('Requested new pickup date').fill('2027-05-05');await page.getByLabel('Requested new pickup time').fill('14:00');await page.getByLabel('Message (optional)').fill('Please review this alternate time.');await page.getByRole('button',{name:'Send Request',exact:true}).click();await expect(page.getByRole('heading',{name:'Your request has been sent!'})).toBeVisible();
 const before=await p.snapshot();expect(before.orders[0].pickup.date).toBe(order.pickup.date);expect(before.management.attention.extensions).toBe(1);
 await page.setExtraHTTPHeaders({'X-Synthetic-Owner':'a'});await page.goto(p.origin+'/studio#Orders');await page.locator('.ms-order-card:visible, .ms-order-table button:visible').first().click();await expect(page.getByRole('heading',{name:'Pickup change request · pending'})).toBeVisible();
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Approve',exact:true}).click();await expect(page.getByRole('heading',{name:'Pickup change request · approved'})).toBeVisible();
 await page.goto(p.origin+order.trackingPath);await expect(page.getByText('Your request has been sent!',{exact:true})).toHaveCount(0);const after=await p.snapshot();expect(after.orders[0].pickup.date).toBe('2027-05-05');expect(p.env.REAL_CHECKOUT_ENABLED).toBe('false');expect(p.env.ORDER_EMAIL_ENABLED).toBe('false');
 }finally{await p.close();}
});
