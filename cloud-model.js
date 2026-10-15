/* Shared model used by the browser and automated tests. */
(function(root) {
  'use strict';
  const collections = ['brands','items','customers','pickups','sales','stockLog','cartonReturns','cartonRewards','roostReturns','roostCreditUses','comments','roostAlerts','notificationLog','adminAudit'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const same = (a,b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
    return value;
  }
  function documents(state) {
    const rows=[];
    for (const collection of collections) {
      const records=collection==='comments'?(state.comments??state.customerMessages??[]).map(row=>row.text===undefined&&row.message!==undefined?{...row,text:row.message}:row):state[collection]||[];
      for (const row of records) rows.push({collection,id:row.id,value:row});
    }
    for (const [id,value] of Object.entries(state.settings || {})) {
      if (id === 'paymentQrs') for (const [method,qr] of Object.entries(value || {})) rows.push({collection:'payments',id:method,value:{id:method,qr}});
      else rows.push({collection:'settings',id,value:{id,value}});
    }
    for (const id of ['cartonSettings','notificationSettings','roostReturnTypes']) if (state[id]) rows.push({collection:'settings',id,value:{id,value:state[id]}});
    return rows;
  }
  function changes(before,after) {
    const old=new Map(documents(before).map(r=>[r.collection+':'+r.id,r]));
    const next=new Map(documents(after).map(r=>[r.collection+':'+r.id,r]));
    const out=[];
    for (const [key,row] of next) if (!same(old.get(key)?.value,row.value)) out.push({collection:row.collection,id:row.id,before:old.get(key)?.value || null,after:row.value});
    const removed=[];
    for (const [key,row] of old) if (!next.has(key)) removed.push({collection:row.collection,id:row.id,before:row.value,after:null});
    // Remove products before their vendor; historical receipt rows retain names.
    const rank={items:0,customers:1,brands:2};
    removed.sort((a,b)=>(rank[a.collection]??3)-(rank[b.collection]??3));out.push(...removed);
    // Inserts/updates before deletions preserves foreign keys when moving products.
    return out;
  }
  root.RRModel={collections,clone,same,changes,documents};
})(globalThis);
