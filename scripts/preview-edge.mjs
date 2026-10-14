import fs from 'node:fs';
const index=fs.readFileSync('supabase/functions/rise-roost-sync/index.ts','utf8')
 .replace("service.rpc('rr_sync'","service.rpc('rr_preview_sync'")
 .replace("'https://joshuamaziarz1-ux.github.io'","'https://rise-roost-sync-testing.mysticchub64.chatgpt.site,https://joshuamaziarz1-ux.github.io'")
 .replace('secret, origins,',"secret:secret+'rise-roost-sync-preview', origins,");
fs.mkdirSync('work',{recursive:true});fs.writeFileSync('work/preview-edge.json',JSON.stringify([{name:'index.ts',content:index},{name:'handler.mjs',content:fs.readFileSync('supabase/functions/rise-roost-sync/handler.mjs','utf8')}]))
// Replaces only preview functions after an initial isolated schema deployment.
let sql=fs.readFileSync('supabase/contract.sql','utf8').replaceAll('public.','rr_preview.').replaceAll('private.','rr_preview_private.').replaceAll('create function ','create or replace function ')
 .replace('select 1 from rr_preview.admins where user_id=p_actor','select 1 from public.admins where user_id=p_actor')
 .replace('create or replace function rr_preview.rr_sync(','create or replace function public.rr_preview_sync(');
sql+='\nrevoke all on function rr_preview_private.rr_patch(jsonb,boolean) from public,anon,authenticated;\n';
fs.writeFileSync('work/preview-functions-update.sql',sql);
