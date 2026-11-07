// Isolated loopback fixture. Mock delivery stays in this process, never deployed.
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { api } from '../server/service.mjs';
import { sqliteD1 } from '../server/sqlite-adapter.mjs';
export async function contactFixture(){
 const sql=new DatabaseSync(':memory:');sql.exec(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));const db=sqliteD1(sql),messages=[];
 const config={customerExperienceEnabled:true,contactLoginEnv:{ROOST_SIMPLE_LOGIN_ENABLED:'true',ROOST_DELIVERY_VERIFIED:'true',ROOST_CODE_PEPPER:'synthetic'.repeat(8),RESEND_API_KEY:'mock',ROOST_EMAIL_FROM:'mock@example.test',TWILIO_ACCOUNT_SID:'mock',TWILIO_AUTH_TOKEN:'mock',ROOST_SMS_FROM:'+12605551234'},contactSend:async(_,target,code)=>messages.push({...target,code})};
 const root=resolve(new URL('../public/',import.meta.url).pathname);
 const server=createServer(async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(c);const request=new Request(origin+req.url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});let response;
 if(req.url.startsWith('/api/'))response=await api(request,db,Date.now(),config);
 else{const path=resolve(root,'.'+new URL(request.url).pathname);if(!path.startsWith(root+'/'))throw Error('path');let bytes,type;try{bytes=await readFile(path);type={'.mjs':'text/javascript','.css':'text/css','.webp':'image/webp','.svg':'image/svg+xml'}[extname(path)]||'text/html';}catch{bytes=await readFile(root+'/index.html');type='text/html';}response=new Response(bytes,{headers:{'Content-Type':type}});}
 const headers=Object.fromEntries(response.headers);if(response.headers.getSetCookie().length)headers['set-cookie']=response.headers.getSetCookie();res.writeHead(response.status,headers);res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500);res.end('Synthetic fixture error');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://localhost:'+server.address().port;
 const created=await api(new Request(origin+'/api/workspaces',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'}),db,Date.now(),config);const site=await created.json();config.publicWorkspaceId=site.id;
 return{origin,id:site.id,messages,sql,close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));sql.close();}};
}
