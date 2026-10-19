import {test,expect} from '@playwright/test';
import {adminLogin,rpc,settled} from './helpers.js';
import fs from 'node:fs/promises';
import path from 'node:path';
// Baseline serves immutable main files. All external requests are intercepted;
// neither context can reach the production API, Auth or Realtime service.
test('approved split Register and Admin retain layout, styles, text and assets',async({page,browser},info)=>{
 test.setTimeout(180000);
 const baselineContext=await browser.newContext({...info.project.use});
 const before=await baselineContext.newPage();
 const state=await rpc(page,'admin_load',{},true),catalog=await rpc(page,'catalog');
 state.admin={email:'admin@test.invalid'};
 await baselineContext.route('https://**/*',async route=>{
  const request=route.request();
  if(request.url().includes('cdn.jsdelivr.net'))return route.fulfill({contentType:'text/javascript',body:`window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'baseline-token'}}}),onAuthStateChange:()=>({}),signOut:async()=>({})},channel:()=>({on(){return this},subscribe(){return this}})})};`});
  if(request.url().includes('/functions/v1/')){
   if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'POST'}});
   const {action}=request.postDataJSON();
   if(!['catalog','admin_load'].includes(action))throw Error('Baseline attempted a write: '+action);
   return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(action==='catalog'?catalog:state)});
  }
  return route.abort();
 });
 async function compare(name,selectors){
  await before.locator('#settingsTab .danger-zone .hint').evaluateAll(es=>es.forEach(e=>e.textContent='Store records are saved in the shared Supabase database.'));
  // Issue #2 explicitly forbids customer stock counts. Keep the approved stock
  // line's geometry/styles, but compare its required availability-only wording.
  const originalStock=await before.locator('.rr48-stock').allTextContents();
  if(name==='shop')await before.locator('.rr48-stock').evaluateAll(es=>es.forEach(e=>{if(!/sold out/i.test(e.textContent))e.textContent='Available';}));
  await page.locator('#rrCloudBadge').evaluate(e=>e.style.opacity='0').catch(()=>{});
  await before.locator('#rrCloudBadge').evaluate(e=>e.style.opacity='0').catch(()=>{});
  const measure=async p=>p.evaluate(selectors=>selectors.flatMap(selector=>[...document.querySelectorAll(selector)].filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().height).map(e=>{
   const r=e.getBoundingClientRect(),c=getComputedStyle(e);return {selector,text:e.textContent.replace(/v\d[\w. -]*/g,'VERSION').trim(),x:r.x,y:r.y,w:r.width,h:r.height,font:c.fontFamily,size:c.fontSize,weight:c.fontWeight,color:c.color,background:c.backgroundColor,radius:c.borderRadius};
  })),selectors);
  const a=await measure(before),b=await measure(page);expect(b,name).toEqual(a);
  // Versions and connection messages intentionally differ. Normalize only these
  // metadata nodes; masking their variable-sized boxes would create false diffs.
  for(const p of [before,page])await p.evaluate(()=>{document.querySelectorAll('.version,.admin-top .sub,#settingsTab .danger-zone strong').forEach(e=>e.textContent='Rise & Roost VERSION');document.querySelectorAll('#rrCloudBadge').forEach(e=>e.style.display='none');});
  const options=p=>({fullPage:true,animations:'disabled',scale:'css'});
  const golden=info.snapshotPath(name+'.png');await fs.mkdir(path.dirname(golden),{recursive:true});await fs.writeFile(golden,await before.screenshot(options(before)));
  await expect(page).toHaveScreenshot(name+'.png',{...options(page),maxDiffPixels:0});
  for(const [label,p] of [['before',before],['after',page]]){const file=info.outputPath(name+'-'+label+'.png');await p.screenshot({path:file,fullPage:true});await info.attach(name+'-'+label,{path:file,contentType:'image/png'});}
  if(name==='shop')await before.locator('.rr48-stock').evaluateAll((es,texts)=>es.forEach((e,i)=>e.textContent=texts[i]),originalStock);
 }
 await before.goto('/original/register-cloud-beta.html');await page.goto('/register-cloud-beta.html');await settled(page);await settled(before);
 await compare('home',['#kioskHome button','#kioskHome img']);
 await before.locator('#rr48StartShop').click();await page.locator('#rr48StartShop').click();
 await compare('shop',['.rr48-product','.rr48-shop-head','#rrShopMemberBar','#rr48CartBar']);
 await before.locator('[data-rr-plus="item-test"]').click();await page.locator('[data-rr-plus="item-test"]').click();
 await before.locator('#rr48CartBar').click();await page.locator('#rr48CartBar').click();
 await compare('cart',['#cartDrawer .modal','#cartList','#payBtn','#clearBtn']);
 await before.locator('#payBtn').click();await page.locator('#payBtn').click();
 await compare('payment-methods',['#payOverlay .modal','#payOverlay button','#payOverlay img']);
 for(const p of [before,page])await p.locator('[data-method="cash"]').click();
 await compare('cash',['#payOverlay .modal','#payOverlay button','#payOverlay img']);
 for(const p of [before,page]){await p.locator('#rr48BackMethods').click();await p.locator('#rr48BackCart').click();await p.evaluate(()=>RRRoost.open());}
 await compare('roost',['#rrRoostV2Overlay .modal','#rrRoostV2Overlay button','#rrRoostV2Overlay input']);
 await before.goto('/original/admin-cloud-beta.html');await adminLogin(page);await settled(page);await settled(before);
 for(const tab of ['dashboard','items','customers','sales','inventory','settings']){
  for(const p of [before,page])await p.evaluate(t=>showTab(t),tab);
  await compare('admin-'+tab,['.admin-top','.tabs','#'+tab+'Tab .card','#'+tab+'Tab button']);
 }
 await baselineContext.close();
});
