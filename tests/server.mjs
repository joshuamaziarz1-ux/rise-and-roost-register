// Local test server: the actual Edge handler and SQL migration, synthetic records only.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {database,ADMIN,OTHER} from './database.mjs';
import {createHandler} from '../supabase/functions/rise-roost-sync/handler.mjs';
const db=await database();
const handler=createHandler({secret:'local-test-secret',origins:['http://127.0.0.1:4173','http://localhost:4173'],rpc:db.rpc,getUser:async token=>token==='test-admin-token'?ADMIN:token==='other-token'?OTHER:null});
const mime={'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1:4173');
  if(url.pathname==='/functions/v1/rise-roost-sync'){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const response=await handler(new Request(url,{method:req.method,headers:req.headers,body:req.method==='POST'?Buffer.concat(chunks):undefined}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
  }
  if(url.pathname==='/auth/v1/token' && req.method==='POST'){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks));
   if(body.password!=='test-password'&&body.refresh_token!=='test-refresh'){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Invalid credentials'}));return;}
   res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({access_token:'test-admin-token',refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,user:{id:ADMIN,email:'admin@test.invalid',aud:'authenticated'}}));return;
  }
  if(url.pathname.startsWith('/auth/')){res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');return;}
  if(url.pathname==='/cloud-config.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(`window.__RR_CLOUD_MODE=true;window.RR_CONFIG={url:location.origin,key:'test-key',endpoint:'rise-roost-sync',pollMs:300,timeoutMs:1500};`);return;}
  if(url.pathname.startsWith('/realtime/')){res.writeHead(503);res.end();return;}
  const file=path.resolve('.'+(url.pathname==='/'?'/index.html':url.pathname));const root=process.cwd()+path.sep;if(!file.startsWith(root)||file.includes(path.sep+'node_modules'+path.sep)){res.writeHead(403);res.end();return;}
  const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
 }catch(error){console.error(error);res.writeHead(500);res.end('Test server error');}
});
server.listen(4173,'127.0.0.1',()=>console.log('Synthetic test server ready on 4173'));
async function stop(){server.close();await db.stop();process.exit(0);}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
