import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
export const ADMIN='11111111-1111-4111-8111-111111111111';
export const OTHER='22222222-2222-4222-8222-222222222222';
export async function database(){
  let pool,stopServer;
  if(process.env.RR_TEST_DATABASE_URL){
    // CI uses a disposable Postgres container. Never accept a remote store URL.
    const url=new URL(process.env.RR_TEST_DATABASE_URL);
    if(!['127.0.0.1','localhost'].includes(url.hostname))throw Error('Test database must be on loopback');
    const name='rise_roost_test_'+crypto.randomUUID().replaceAll('-','');
    const control=new pg.Pool({connectionString:url.href});await control.query('create database "'+name+'"');url.pathname='/'+name;
    pool=new pg.Pool({connectionString:url.href,max:10});
    stopServer=async()=>{if(!/^rise_roost_test_[0-9a-f]{32}$/.test(name))throw Error('Unexpected test database name');await control.query('drop database "'+name+'"');await control.end();};
  }else{
  const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
  const dir=path.resolve('work/pg-'+port);await fs.mkdir(dir,{recursive:true});
  const instance=new EmbeddedPostgres({databaseDir:dir,port,user:'postgres',password:'test-only',persistent:true,initdbFlags:['--no-sync','--encoding=UTF8'],onLog:()=>{},onError:()=>{}});
  await instance.initialise();
  if(process.platform==='win32'){
    // pg_ctl creates a restricted Windows token. Direct postgres.exe startup
    // rejects elevated GitHub Windows runner accounts even though initdb works.
    const {pg_ctl}=await import('@embedded-postgres/windows-x64');
    // Detached server handles must not keep execFile's stdout pipes open.
    const run=args=>new Promise((resolve,reject)=>{const child=spawn(pg_ctl,args,{stdio:'ignore',windowsHide:true});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('pg_ctl exited with '+code)));});
    try{await run(['-D',dir,'-l',path.join(dir,'server.log'),'-o','-p '+port+' -h 127.0.0.1','-w','start']);}
    catch(e){throw new Error('Test PostgreSQL startup failed: '+e.message+' '+await fs.readFile(path.join(dir,'server.log'),'utf8').catch(()=>''));}
    stopServer=()=>run(['-D',dir,'-m','fast','-w','stop']);
  }else{await instance.start();stopServer=()=>instance.stop();}
  pool=new pg.Pool({host:'127.0.0.1',port,user:'postgres',password:'test-only',database:'postgres',max:10});
  }
  try{
  await pool.query(await fs.readFile('tests/fixtures/existing-schema.sql','utf8')); 
  await pool.query(await fs.readFile('tests/fixtures/constraints.sql','utf8'));
  await pool.query(`insert into auth.users values('${ADMIN}'),('${OTHER}'); insert into admins(user_id,display_name) values('${ADMIN}','Test Admin');
    insert into brands(id,name) values('brand-test','Test Brand');
    insert into items(id,brand_id,name,price,stock) values('item-test','brand-test','Test Eggs',5,20),('item-other','brand-test','Test Jam',3,10);
    insert into customers(id,name,phone,carton_credits) values('member-test','Test Member','2025550100',12),('member-other','Other Member','2025550101',0);
    insert into settings(key,value) values('carton_settings','{"cartonsPerFreeDozen":12,"rewardItemId":"item-test"}'),('roost_credit_settings','{"creditValue":0.5,"allowFullPurchase":true,"returnTypes":[{"id":"egg-carton","name":"Egg Carton","credit":1,"active":true}]}');
    insert into payment_methods(method,display_name) values('cash','Cash'),('cashapp','Cash App'),('paypal','PayPal'),('applepay','Apple Pay'),('googlepay','Google Pay');`);
  const snapshot=async()=>{const {rows}=await pool.query("select jsonb_build_object('brands',(select jsonb_agg(to_jsonb(t)-'rr_extra'-'rr_version' order by id) from brands t),'items',(select jsonb_agg(to_jsonb(t)-'rr_extra'-'rr_version' order by id) from items t),'members',(select jsonb_agg(to_jsonb(t)-'rr_extra'-'rr_version' order by id) from customers t),'settings',(select jsonb_agg(to_jsonb(t)-'rr_extra'-'rr_version' order by key) from settings t)) as data");return JSON.stringify(rows[0].data);};
  const preserved=await snapshot();
  const migration=(await fs.readdir('supabase/migrations')).find(x=>x.endsWith('_shared_database_sync.sql'));
  await pool.query(await fs.readFile('supabase/migrations/'+migration,'utf8'));
  if(await snapshot()!==preserved)throw Error('Migration altered pre-existing records');
  }catch(e){await pool.end();await stopServer();throw e;}
  const rpc=async(action,payload={},actor=null,member=null)=>{
    const conn=await pool.connect();try{await conn.query('begin');await conn.query('set local role service_role');const {rows}=await conn.query('select public.rr_sync($1,$2::jsonb,$3::uuid,$4::text) as result',[action,JSON.stringify(payload),actor,member]);await conn.query('commit');return rows[0].result;}catch(e){await conn.query('rollback');throw e;}finally{conn.release();}
  };
  return {pool,rpc,stop:async()=>{await pool.end();await stopServer();}};
}
