import fs from 'node:fs';
// The preview is in the user's existing Supabase PROJECT, with a separate schema.
// Never copy production products, members or sales into it.
const baseline=fs.readFileSync('tests/fixtures/existing-schema.sql','utf8').split('\n').slice(1).join('\n');
const constraints=fs.readFileSync('tests/fixtures/constraints.sql','utf8');
const migration=fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_shared_database_sync.sql')),'utf8');
let sql='create schema rr_preview;create schema rr_preview_private;set local search_path=rr_preview,public;\n'+baseline+constraints+migration;
sql=sql.replaceAll('public.','rr_preview.').replaceAll('private.','rr_preview_private.').replaceAll('schema private','schema rr_preview_private').replaceAll('schema public,private,auth','schema rr_preview,rr_preview_private,auth').replaceAll('schema public','schema rr_preview');
sql=sql.replace('select 1 from rr_preview.admins where user_id=p_actor','select 1 from public.admins where user_id=p_actor');
// Only the outer API wrapper lives in the exposed public schema.
sql=sql.replace('create function rr_preview.rr_sync(','create function public.rr_preview_sync(').replaceAll('function rr_preview.rr_sync(','function public.rr_preview_sync(');
sql+=`\ninsert into rr_preview.admins(user_id,display_name) select user_id,display_name from public.admins;
insert into rr_preview.brands(id,name) values('brand-test','Device Test Brand');
insert into rr_preview.items(id,brand_id,name,price,stock) values('item-test','brand-test','TEST Eggs',5,20),('item-other','brand-test','TEST Jam',3,10);
insert into rr_preview.customers(id,name,phone,carton_credits) values('member-test','Test Member','2025550100',12);
insert into rr_preview.settings(key,value) values('carton_settings','{"cartonsPerFreeDozen":12,"rewardItemId":"item-test"}'),('roost_credit_settings','{"creditValue":0.5,"allowFullPurchase":true,"returnTypes":[{"id":"egg-carton","name":"Egg Carton","credit":1,"active":true}]}');
insert into rr_preview.payment_methods(method,display_name) values('cash','Cash'),('cashapp','Cash App'),('paypal','PayPal'),('applepay','Apple Pay'),('googlepay','Google Pay');
revoke all on schema rr_preview,rr_preview_private from anon,authenticated;
grant usage on schema rr_preview to anon,authenticated,service_role;
revoke all on all tables in schema rr_preview from anon,authenticated;
grant select on rr_preview.store_revision_public to anon,authenticated;
grant select on rr_preview.admins to authenticated;
grant usage on schema rr_preview_private to service_role;
revoke all on all functions in schema rr_preview,rr_preview_private from public,anon,authenticated;
grant execute on all functions in schema rr_preview to service_role;
grant execute on function rr_preview_private.rr_sync(text,jsonb,uuid,text) to service_role;
alter publication supabase_realtime add table rr_preview.store_revision_public;
reset search_path;
`;
fs.mkdirSync('work',{recursive:true});fs.writeFileSync('work/preview-migration.sql',sql);
