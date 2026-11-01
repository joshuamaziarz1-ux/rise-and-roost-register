// Read-only/denial-only HTTPS acceptance: no PIN, setup capability or session.
import assert from 'node:assert/strict';
const origin='https://rise-roost-experience-preview.joshua-maziarz1.workers.dev';
if(process.env.RR_PIN_PREVIEW_URL!==origin)throw Error('Only the isolated PIN preview is allowed.');
let checked=0;
async function read(path,status){const r=await fetch(origin+path,{redirect:'error'});assert.equal(r.status,status,path);checked++;return r;}
for(const path of ['/','/shop','/studio','/studio/setup','/studio-pin.mjs'])await read(path,200);
const info=await(await read('/api/studio-info',200)).json();assert.equal(info.previewPinAccess,true);assert.equal(info.mainStudioPath,'/studio');
const status=await(await read('/api/studio-pin/status',200)).json();assert.equal(status.authenticated,false);assert.equal(typeof status.configured,'boolean');
for(const path of ['/api/studio','/api/manage/snapshot','/api/studio-comments','/api/preview/invalid','/api/roost/admin','/api/future-admin']){
 const r=await fetch(origin+path,{headers:{Cookie:'rr_studio=forged; __Host-rr_studio_pin=forged','Cf-Access-Jwt-Assertion':'forged','Cf-Access-Authenticated-User-Email':'forged@example.test'}});assert.equal(r.status,401,path);assert.match(r.headers.get('cache-control'),/no-store/);checked++;
}
for(const path of ['/api/manage/product','/api/upload','/api/publish']){const r=await fetch(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});assert.equal(r.status,401,path);checked++;}
const site=await(await read('/api/site',200)).json();assert.equal(site.studioPath,'/studio');assert.equal(site.id,'2a7ca191c1639aaf023b02d96bcd9519fe099333302d9204');
console.log(JSON.stringify({https:true,checksPassed:checked,pinModeEnabled:true,anonymousAdminAccessBlocked:true,customerWebsitePublic:true,configured:status.configured,workspacesCreated:0,businessWrites:0}));
