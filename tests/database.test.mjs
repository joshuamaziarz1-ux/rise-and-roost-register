import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {database,ADMIN,OTHER} from './database.mjs';
const request=payload=>({requestId:crypto.randomUUID(),...payload});
test('PostgreSQL transactions, permissions and data preservation',async t=>{
  const db=await database();t.after(()=>db.stop());const {rpc,pool}=db;
  const state=async()=>(await rpc('admin_load',{},ADMIN)).data;
  const patch=async(collection,before,after)=>rpc('admin_patch',request({changes:[{collection,id:(after||before).id,before,after}]}),ADMIN);
  await t.test('hide and show; revision changes; inactive brand removes its items',async()=>{
    let d=await state(),item=d.items.find(x=>x.id==='item-test');const rev=(await rpc('catalog')).revision;
    await patch('items',item,{...item,active:false});assert(!(await rpc('catalog')).items.some(x=>x.id===item.id));assert((await rpc('catalog')).revision>rev);
    d=await state();item=d.items.find(x=>x.id===item.id);await patch('items',item,{...item,active:true});assert((await rpc('catalog')).items.some(x=>x.id===item.id));
    const b=(await state()).brands[0];await patch('brands',b,{...b,active:false});assert.equal((await rpc('catalog')).items.length,0);await patch('brands',(await state()).brands[0],{...(await state()).brands[0],active:true});
  });
  await t.test('prices, inventory, sold out, stale edits and unrelated row edits',async()=>{
    let item=(await state()).items.find(x=>x.id==='item-test');await patch('items',item,{...item,price:6,stock:0});let cat=await rpc('catalog');assert.equal(cat.items.find(x=>x.id===item.id).stock,0);assert.equal(cat.items.find(x=>x.id===item.id).price,6);
    await assert.rejects(()=>patch('items',item,{...item,price:8}),/DATA_CONFLICT/);
    item=(await state()).items.find(x=>x.id==='item-test');await patch('items',item,{...item,price:5,stock:2});
    const d=await state();await patch('items',d.items[0],{...d.items[0],name:'Updated name'});await patch('items',d.items[1],{...d.items[1],name:'Updated second name'});
  });
  await t.test('two concurrent Registers cannot sell the same last units',async()=>{
    let item=(await state()).items.find(x=>x.id==='item-test');await patch('items',item,{...item,stock:1});
    const payload=()=>request({payment:'cash',expectedTotal:5,lines:[{itemId:'item-test',qty:1}]});
    const results=await Promise.allSettled([rpc('checkout',payload()),rpc('checkout',payload())]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal((await state()).items.find(x=>x.id==='item-test').stock,0);
  });
  await t.test('lost response retry returns original sale and does not decrement twice',async()=>{
    let item=(await state()).items.find(x=>x.id==='item-test');await patch('items',item,{...item,stock:10});
    const payload=request({payment:'cash',expectedTotal:5,lines:[{itemId:'item-test',qty:1}]});const a=await rpc('checkout',payload),b=await rpc('checkout',payload);assert.deepEqual(a,b);assert.equal((await state()).items.find(x=>x.id==='item-test').stock,9);
    await assert.rejects(()=>rpc('checkout',{...payload,payment:'paypal'}),/different operation/);
  });
  await t.test('atomic credit checkout, insufficient stock rollback, void restores credits once',async()=>{
    const before=await state(),m=before.customers.find(x=>x.id==='member-test');
    const sale=await rpc('checkout',request({payment:'cash',expectedTotal:5,expectedDue:0,useCredits:true,lines:[{itemId:'item-test',qty:1}]}),null,m.id);
    assert.equal(sale.result.creditsUsed,10);assert.equal((await state()).customers.find(x=>x.id===m.id).cartonCredits,m.cartonCredits-10);
    const account=await rpc('member_account',{},null,m.id),other=await rpc('member_account',{},null,'member-other');
    assert.equal(account.roostCreditUses.find(x=>x.saleId===sale.result.saleId).creditsUsed,10);assert(other.roostCreditUses.every(x=>x.customerId==='member-other'));
    await rpc('admin_void',request({id:sale.result.saleId}),ADMIN);await rpc('admin_void',request({id:sale.result.saleId}),ADMIN);assert.equal((await state()).customers.find(x=>x.id===m.id).cartonCredits,m.cartonCredits);
    const d=await state();await assert.rejects(()=>rpc('checkout',request({payment:'cash',expectedTotal:500,lines:[{itemId:'item-test',qty:100}],useCredits:true}),null,m.id),/inventory/);assert.deepEqual((await state()).customers,d.customers);
  });
  await t.test('member signup, profile versions, returns and concurrent credit changes',async()=>{
    const out=await rpc('member_signup',request({name:'Synthetic New Member',phone:'2025550111'}));const m=(await rpc('member_account',{},null,out.result.id)).member;
    await rpc('member_profile',request({name:'Updated Synthetic',phone:'2025550111',version:m._version}),null,m.id);
    await assert.rejects(()=>rpc('member_profile',request({name:'Stale',phone:m.phone,version:m._version}),null,m.id),/DATA_CONFLICT/);
    await Promise.all([rpc('roost_return',request({returns:[{typeId:'egg-carton',qty:2}]}),null,m.id),rpc('roost_return',request({returns:[{typeId:'egg-carton',qty:3}]}),null,m.id)]);
    assert.equal((await rpc('member_account',{},null,m.id)).member.cartonCredits,5);
    await assert.rejects(()=>rpc('roost_return',request({returns:[{typeId:'egg-carton',qty:2}]})),/UNAUTHORIZED/);
  });
  await t.test('invalid quantities and changed totals are rejected without writes',async()=>{
    const d=await state();for(const qty of [-1,0,1.5])await assert.rejects(()=>rpc('checkout',request({payment:'cash',expectedTotal:5,lines:[{itemId:'item-test',qty}]})),/quantity/);
    await assert.rejects(()=>rpc('checkout',request({payment:'cash',expectedTotal:0,lines:[{itemId:'item-test',qty:1}]})),/total changed/);assert.deepEqual(await state(),d);
  });
  await t.test('pickup reservations, completion, free-dozen rewards and voids stay atomic',async()=>{
    let d=await state();const p={id:'pickup-test',code:'TEST1',customerName:'Test Member',status:'ready',paid:false,items:[{itemId:'item-test',qty:2}],created:new Date().toISOString()};
    await patch('pickups',null,p);const stock=d.items.find(x=>x.id==='item-test').stock;assert.equal((await rpc('catalog')).items.find(x=>x.id==='item-test').stock,stock-2);
    const reservedItem=(await state()).items.find(x=>x.id==='item-test');await assert.rejects(()=>patch('items',reservedItem,{...reservedItem,stock:1}),/reserved/);
    const done=request({code:'TEST1'});await rpc('pickup_complete',done);await rpc('pickup_complete',done);assert.equal((await state()).items.find(x=>x.id==='item-test').stock,stock-2);
    const reward=await rpc('reward_redeem',request({}),null,'member-test');assert.equal((await state()).customers.find(x=>x.id==='member-test').cartonCredits,0);
    await rpc('admin_void',request({id:reward.result.saleId}),ADMIN);assert.equal((await state()).customers.find(x=>x.id==='member-test').cartonCredits,12);
  });
  await t.test('RLS and service-only functions reject anon and unauthorized authenticated accounts',async()=>{
    await assert.rejects(()=>rpc('admin_load',{},OTHER),/UNAUTHORIZED/);
    await assert.rejects(()=>pool.query("select public.rr_admin_replace_state(0,'{}')"),/whole-store saves are disabled/);
    const conn=await pool.connect();try{for(const role of ['anon','authenticated']){await conn.query('begin');await conn.query('set local role '+role);const rows=await conn.query('select * from customers');assert.equal(rows.rowCount,0);await assert.rejects(()=>conn.query("select rr_sync('admin_load','{}',null,null)"),/permission denied/);await conn.query('rollback');}}finally{conn.release();}
  });
  await t.test('backup import adds missing history and never overwrites existing balances or stock',async()=>{
    const before=await state(),existing=before.items.find(x=>x.id==='item-test');
    const records=[{collection:'items',id:existing.id,value:{...existing,stock:999}},{collection:'sales',id:'imported-sale-test',value:{id:'imported-sale-test',date:new Date().toISOString(),total:5,payment:'cash',source:'store',voided:false,items:[{itemId:existing.id,itemName:'Historical Eggs',brandName:'Historical Brand',price:5,qty:1}]}}];
    await rpc('admin_import',request({records}),ADMIN);const after=await state();assert.equal(after.items.find(x=>x.id===existing.id).stock,existing.stock);assert.deepEqual(after.customers,before.customers);assert.equal(after.sales.find(x=>x.id==='imported-sale-test').items[0].itemName,'Historical Eggs');
  });
  await t.test('deleting a vendor and its products preserves historical receipts',async()=>{
    await rpc('admin_import',request({records:[
      {collection:'brands',id:'delete-brand-test',value:{id:'delete-brand-test',name:'Historical Vendor',active:true}},
      {collection:'items',id:'delete-item-test',value:{id:'delete-item-test',brandId:'delete-brand-test',name:'Historical Product',price:2,stock:2,lowStock:1,active:true}},
      {collection:'sales',id:'delete-sale-test',value:{id:'delete-sale-test',date:new Date().toISOString(),total:2,payment:'cash',source:'store',voided:false,items:[{itemId:'delete-item-test',itemName:'Historical Product',brandId:'delete-brand-test',brandName:'Historical Vendor',price:2,qty:1}]}}
    ]}),ADMIN);
    const d=await state(),b=d.brands.find(x=>x.id==='delete-brand-test'),i=d.items.find(x=>x.id==='delete-item-test');
    await rpc('admin_patch',request({changes:[{collection:'items',id:i.id,before:i,after:null},{collection:'brands',id:b.id,before:b,after:null}]}),ADMIN);
    const receipt=(await state()).sales.find(x=>x.id==='delete-sale-test');assert.equal(receipt.items[0].itemName,'Historical Product');assert.equal(receipt.items[0].brandName,'Historical Vendor');assert.equal(receipt.items[0].itemId,null);
  });
  await t.test('appointments survive edits and backup, while private access codes stay out of public/member responses',async()=>{
    const p={id:'appointment-preservation',code:'APPT1',customerId:'member-test',customerName:'Test Member',phone:'2025550100',status:'ready',paid:false,items:[{itemId:'item-other',qty:1}],created:new Date().toISOString()};
    await patch('pickups',null,p);await pool.query("insert into pickup_appointments(pickup_id,scheduled_at,door_pin) values('appointment-preservation','2026-10-20T16:00:00Z','TEST-ONLY')");
    let order=(await state()).pickups.find(x=>x.id===p.id);assert.equal(new Date(order.scheduledAt).toISOString(),'2026-10-20T16:00:00.000Z');assert.equal(order.doorPin,'TEST-ONLY');
    const appointment=await pool.query("select to_jsonb(a) as value from pickup_appointments a where pickup_id=$1",[p.id]);
    await patch('pickups',order,{...order,note:'Changed only this note'});
    assert.deepEqual((await pool.query("select to_jsonb(a) as value from pickup_appointments a where pickup_id=$1",[p.id])).rows,appointment.rows);
    const lookup=await rpc('pickup_lookup',{code:p.code});assert(!('doorPin' in lookup.pickup));
    const account=await rpc('member_account',{},null,'member-test');assert.equal(new Date(account.pickups.find(x=>x.id===p.id).scheduledAt).toISOString(),'2026-10-20T16:00:00.000Z');assert(!('doorPin' in account.pickups.find(x=>x.id===p.id)));
    const backup={...order,id:'imported-appointment',code:'APPT2'};await rpc('admin_import',request({records:[{collection:'pickups',id:backup.id,value:backup}]}),ADMIN);assert.equal((await state()).pickups.find(x=>x.id===backup.id).scheduledAt,order.scheduledAt);
  });
  await t.test('member scheduling uses store time zone, prevents double booking and preserves access metadata',async()=>{
    const cfg={enabled:true,timeZone:'America/New_York',slotMinutes:60,days:Array.from({length:7},(_,day)=>({day,enabled:true,times:['10:00','12:00']}))};
    await patch('settings',null,{id:'pickupSchedule',value:cfg});
    for(const [id,member] of [['schedule-a','member-test'],['schedule-b','member-other']])await patch('pickups',null,{id,code:id.toUpperCase(),customerId:member,customerName:member,status:'waiting',paid:false,items:[{itemId:'item-other',qty:1}],created:new Date().toISOString()});
    const d=await state(),a=d.pickups.find(x=>x.id==='schedule-a'),b=d.pickups.find(x=>x.id==='schedule-b');
    const offered=await rpc('pickup_slots',{id:a.id},null,'member-test');assert(offered.slots.length>10);assert.equal(offered.timeZone,'America/New_York');
    assert(offered.slots.every(x=>['10:00','12:00'].includes(new Intl.DateTimeFormat('en-GB',{timeZone:offered.timeZone,hour:'2-digit',minute:'2-digit'}).format(new Date(x)))));
    await assert.rejects(()=>rpc('pickup_slots',{id:a.id},null,'member-other'),/UNAUTHORIZED/);
    const book=p=>request({id:p.id,version:p._version,appointmentVersion:p._appointmentVersion??null,scheduledAt:offered.slots[0]});
    const results=await Promise.allSettled([rpc('pickup_schedule',book(a),null,'member-test'),rpc('pickup_schedule',book(b),null,'member-other')]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
    const winner=(await state()).pickups.find(x=>x.appointmentStatus==='pending');assert(winner);
    await assert.rejects(()=>rpc('pickup_complete',request({code:winner.code})),/approval/);
    await pool.query("update pickup_appointments set door_pin='KEEP-PRIVATE',pin_texted_at=now(),access_extended_until=now()+interval '2 days' where pickup_id=$1",[winner.id]);
    const before=(await state()).pickups.find(x=>x.id===winner.id);await patch('pickups',before,{...before,appointmentStatus:'approved'});
    const after=(await state()).pickups.find(x=>x.id===winner.id);assert.equal(after.doorPin,before.doorPin);assert.equal(after.pinTextedAt,before.pinTextedAt);assert.equal(after.accessExtendedUntil,before.accessExtendedUntil);
    const account=await rpc('member_account',{},null,after.customerId);assert(!('doorPin' in account.pickups.find(x=>x.id===after.id)));
    await pool.query('update pickup_appointments set updated_at=now() where pickup_id=$1',[after.id]);const snapshot=await state();await assert.rejects(()=>patch('pickups',after,{...after,note:'Stale editor'}),/DATA_CONFLICT: appointment/);assert.deepEqual(await state(),snapshot);
    for(const id of [a.id,b.id]){const p=(await state()).pickups.find(x=>x.id===id);await patch('pickups',p,{...p,status:'cancelled'});}
  });
  await t.test('credit quote and member mismatches roll back the entire sale',async()=>{
    const before=await state();
    for(const extra of [{expectedMemberId:'member-other'},{expectedCreditsUsed:999},{expectedCreditValue:999}])await assert.rejects(()=>rpc('checkout',request({payment:'cash',expectedTotal:5,lines:[{itemId:'item-test',qty:1}],useCredits:true,...extra}),null,'member-test'),/changed/);
    assert.deepEqual(await state(),before);
  });
  await t.test('comment review is Admin-only, conflict-safe and retains original text',async()=>{
    const out=await rpc('comment_submit',request({name:'Synthetic <name>',text:'Keep <script> as text',type:'product-request'}));
    const c=(await state()).comments.find(x=>x.id===out.result.id);assert(c);
    await assert.rejects(()=>rpc('admin_patch',request({changes:[{collection:'comments',id:c.id,before:c,after:{...c,status:'reviewed'}}]}),OTHER),/UNAUTHORIZED/);
    await patch('comments',c,{...c,status:'reviewed'});await assert.rejects(()=>patch('comments',c,{...c,status:'resolved'}),/DATA_CONFLICT/);
    const latest=(await state()).comments.find(x=>x.id===c.id);assert.equal(latest.text,c.text);assert.equal(latest.name,c.name);assert.equal(latest.status,'reviewed');assert(!JSON.stringify(await rpc('catalog')).includes(c.text));
  });
  await t.test('QR settings are shared, Admin-only and conflict-checked',async()=>{
    const qr='data:image/png;base64,SYNTHETIC';
    const value={id:'cashapp',qr};await patch('payments',null,value);assert.equal((await rpc('catalog')).paymentQrs.cashapp,qr);
    await assert.rejects(()=>patch('payments',null,{...value,qr:'stale'}),/DATA_CONFLICT/);
    await assert.rejects(()=>rpc('admin_patch',request({changes:[{collection:'payments',id:'cashapp',before:value,after:null}]}),OTHER),/UNAUTHORIZED/);
    await patch('payments',value,null);assert.equal((await rpc('catalog')).paymentQrs.cashapp,undefined);
  });
  await t.test('comments retry once and unconfigured return types cannot issue credits',async()=>{
    const payload=request({name:'Synthetic Request',text:'Please stock more test jam'}),a=await rpc('comment_submit',payload),b=await rpc('comment_submit',payload);assert.deepEqual(a,b);
    assert.equal((await state()).comments.filter(x=>x.text===payload.text).length,1);
    const before=(await rpc('member_account',{},null,'member-test')).member.cartonCredits;
    await assert.rejects(()=>rpc('roost_return',request({returns:[{typeId:'unconfigured-jar',qty:1}]}),null,'member-test'),/not available/);
    assert.equal((await rpc('member_account',{},null,'member-test')).member.cartonCredits,before);
  });
  await t.test('missing or null checkout, patch and return payloads never create records or credits',async()=>{
    const before=await state();
    for(const lines of [undefined,null,{},[]])await assert.rejects(()=>rpc('checkout',request({payment:'cash',expectedTotal:0,...lines===undefined?{}:{lines}})),/Invalid checkout lines/);
    for(const changes of [undefined,null,{}])await assert.rejects(()=>rpc('admin_patch',request({changes}),ADMIN),/Invalid changes/);
    for(const returns of [undefined,null,{},[],[{typeId:'egg-carton'}],[{typeId:'egg-carton',qty:null}]])await assert.rejects(()=>rpc('roost_return',request({returns}),null,'member-test'),/Invalid return/);
    for(const qty of [null,0,-1,1.5])await assert.rejects(()=>rpc('carton_return',request({qty}),null,'member-test'),/Invalid return/);
    assert.deepEqual(await state(),before);
  });
});
