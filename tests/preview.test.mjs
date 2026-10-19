import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {database} from './database.mjs';
test('preview deployment changes only isolated schemas and preserves live records',async t=>{
 const sql=await fs.readFile('work/preview-migration.sql','utf8');
 const db=await database();t.after(()=>db.stop());
 const before=(await db.rpc('admin_load',{},'11111111-1111-4111-8111-111111111111')).data;
 const privileges=()=>db.pool.query("select p.oid::regprocedure::text as signature,p.proacl::text as acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by 1");
 const originalPrivileges=(await privileges()).rows;
 await db.pool.query('create publication supabase_realtime');await db.pool.query(sql);
 const {rows}=await db.pool.query("select public.rr_preview_sync('catalog','{}') as catalog");assert.equal(rows[0].catalog.items.length,2);
 const after=(await db.rpc('admin_load',{},'11111111-1111-4111-8111-111111111111')).data;assert.deepEqual(after,before);
 assert.deepEqual((await privileges()).rows.filter(x=>x.signature!=='rr_preview_sync(text,jsonb,uuid,text)'),originalPrivileges,'Preview must not change production function permissions');
});
