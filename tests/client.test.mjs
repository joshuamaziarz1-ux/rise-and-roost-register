import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const context=vm.createContext({});vm.runInContext(await fs.readFile('cloud-model.js','utf8'),context);const model=context.RRModel;
test('diff sends only changed records and keeps row versions',()=>{
  const before={brands:[{id:'b',name:'Brand',_version:2}],items:[{id:'i',price:5,stock:7,_version:10}],sales:[{id:'s',total:5}],settings:{paymentQrs:{cashapp:'qr'}}};
  const after=JSON.parse(JSON.stringify(before));after.items[0].price=6;
  const diff=model.changes(before,after);assert.equal(diff.length,1);assert.equal(diff[0].before._version,10);assert.equal(diff[0].after.price,6);
});
test('ordering changes do not cause writes; metadata and QR changes are included',()=>{
 const before={customers:[{id:'a',name:'A'},{id:'b',name:'B'}],settings:{paymentQrs:{cashapp:'one'}}};const after={customers:[before.customers[1],before.customers[0]],settings:{paymentQrs:{cashapp:'two'}}};
 assert.equal(model.changes(before,after).length,1);assert.equal(model.changes(before,after)[0].collection,'payments');
});
