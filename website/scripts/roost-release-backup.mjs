// One-off, read-only production export. Never prints SQL, records, signed URLs or keys.
import { loadProductionExport } from './production-backup.mjs';
import { captureSnapshot, encryptSnapshot, decryptSnapshot } from '../server/daily-backup.mjs';
import { restoreNewLocalDatabase } from './restore-business-backup.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
process.umask(0o077);
const directory='/workspace/roost-email-release';
const postMigration=process.argv[2]==='post-migration';
if(process.argv[2] && !postMigration) throw Error('Unsupported backup label');
const settings=JSON.parse(await readFile(directory+'/settings.private.json','utf8'));
const workspace=settings.bindings.find(b=>b.name==='PUBLIC_WORKSPACE_ID').text;
const database='889a4b96-cabd-43d1-ad45-79f65b0052b0';
await mkdir('/workspace/.roost-release-recovery',{recursive:true,mode:0o700});
const keyPath='/workspace/.roost-release-recovery/roost-email-pre-release.key';
let key;try {key=(await readFile(keyPath,'utf8')).trim();}catch(e){if(e.code!=='ENOENT')throw e;key=randomBytes(32).toString('base64');await writeFile(keyPath,key+'\n',{mode:0o600,flag:'wx'});}
let source;
try {
 source=await loadProductionExport({accountId:process.env.CLOUDFLARE_ACCOUNT_ID,databaseId:database,token:process.env.CLOUDFLARE_API_TOKEN});
 const snapshot=await captureSnapshot({BACKUP_ENABLED:'true',BACKUP_DATABASE_ID:database,BACKUP_WORKSPACE_ID:workspace,BACKUP_KEY_ID:'roost-email-pre-release',BACKUP_ENCRYPTION_KEY:key,DB:source.db,ASSETS:{async fetch(request){const path=new URL(request.url).pathname;if(!/^\/assets\/[A-Za-z0-9._-]+$/.test(path))throw Error('Invalid media');return new Response(await readFile(resolve('public','.'+path)));}}});
 const encrypted=await encryptSnapshot(snapshot,key,'roost-email-pre-release',new Date().toISOString().slice(0,10));
 const archive=directory+(postMigration?'/production-after-email-migration.rrbk':'/production-before-email-login.rrbk');await writeFile(archive,encrypted,{mode:0o600,flag:'wx'});
 const disk=await readFile(archive,'utf8');const checked=await decryptSnapshot(disk,key,database);
 const restored=await restoreNewLocalDatabase({encrypted:disk,key,databaseId:database,outputPath:directory+(postMigration?'/verified-post-migration.sqlite':'/verified-pre-release.sqlite')});
 if(!restored.everyRecordMatches||!restored.schemaMatches)throw Error('Restore verification failed');
 const receipt={backupVerified:true,databaseId:database,capturedAt:snapshot.createdAt,archiveSha256:createHash('sha256').update(disk).digest('hex'),archiveBytes:Buffer.byteLength(disk),tableCount:checked.snapshot.tables.length,memberCount:checked.snapshot.tables.find(t=>t.name==='roost_members').rows.length,everyRecordMatches:restored.everyRecordMatches,schemaMatches:restored.schemaMatches,remoteWrites:0,archive,keyReference:keyPath,storage:'private workspace; not an offsite scheduled backup'};
 await writeFile(directory+(postMigration?'/post-migration-backup-receipt.json':'/backup-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{mode:0o600,flag:'wx'});console.log(JSON.stringify(receipt));
}finally{source?.close();}
