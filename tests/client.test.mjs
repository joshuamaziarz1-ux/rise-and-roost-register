import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const context=vm.createContext({});vm.runInContext(await fs.readFile('cloud-model.js','utf8'),context);const model=context.RRModel;
test('credit quotes match full, partial, minimum-cash and decimal-value policies',()=>{
 assert.equal(model.creditQuote(5,12).total,0);assert.equal(model.creditQuote(5,12).creditsUsed,10);
 assert.equal(model.creditQuote(5,3).total,3.5);assert.equal(model.creditQuote(5,12,{allowFullPurchase:false}).total,0.5);
 assert.equal(model.creditQuote(0.3,10,{creditValue:0.1}).creditsUsed,3);assert.equal(model.creditQuote(0.3,10,{creditValue:0.1}).total,0);
 assert.equal(model.creditQuote(4.99,99,{creditValue:0.5}).total,0.49);
});
test('diff sends only changed records and keeps row versions',()=>{
  const before={brands:[{id:'b',name:'Brand',_version:2}],items:[{id:'i',price:5,stock:7,_version:10}],sales:[{id:'s',total:5}],settings:{paymentQrs:{cashapp:'qr'}}};
  const after=JSON.parse(JSON.stringify(before));after.items[0].price=6;
  const diff=model.changes(before,after);assert.equal(diff.length,1);assert.equal(diff[0].before._version,10);assert.equal(diff[0].after.price,6);
});
test('ordering changes do not cause writes; metadata and QR changes are included',()=>{
 const before={customers:[{id:'a',name:'A'},{id:'b',name:'B'}],settings:{paymentQrs:{cashapp:'one'}}};const after={customers:[before.customers[1],before.customers[0]],settings:{paymentQrs:{cashapp:'two'}}};
 assert.equal(model.changes(before,after).length,1);assert.equal(model.changes(before,after)[0].collection,'payments');
});
test('vendor-and-products deletion orders children before the protected vendor',()=>{
 const diff=model.changes({brands:[{id:'b'}],items:[{id:'i',brandId:'b'}]},{brands:[],items:[]});assert.equal(diff[0].collection,'items');assert.equal(diff[1].collection,'brands');
});
test('original Comments & Requests backups keep their IDs, type, text and history',()=>{
 const rows=model.documents({customerMessages:[{id:'msg-existing',message:'A request',type:'product-request',status:'handled',handledAt:'2026-10-01'}]});
 assert.equal(rows.length,1);assert.equal(rows[0].collection,'comments');assert.equal(rows[0].id,'msg-existing');assert.equal(rows[0].value.text,'A request');assert.equal(rows[0].value.type,'product-request');assert.equal(rows[0].value.handledAt,'2026-10-01');
});
