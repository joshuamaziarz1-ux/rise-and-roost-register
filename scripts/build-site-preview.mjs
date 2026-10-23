import fs from 'node:fs/promises';
import path from 'node:path';
// Package the original live layout for the isolated owner-private device preview.
const target=path.resolve(process.argv[2]||'work/site-preview/dist');
if(path.basename(target)!=='dist'||target===process.cwd())throw Error('Use a separate preview dist directory');
await fs.mkdir(target,{recursive:true});
for(const file of await fs.readdir('.'))if(/\.(html|css|js|webmanifest)$/.test(file))await fs.copyFile(file,path.join(target,file));
for(const directory of ['assets','vendor'])await fs.cp(directory,path.join(target,directory),{recursive:true});
let config=await fs.readFile('cloud-config.js','utf8');
config=config.replace("endpoint: 'rise-roost-sync'","endpoint: 'rise-roost-sync-preview', revisionSchema: 'rr_preview', preview: true");
if(!config.includes("revisionSchema: 'rr_preview'"))throw Error('Preview endpoint was not isolated');
await fs.writeFile(path.join(target,'cloud-config.js'),config);
console.log('Approved split cloud UI preview assets prepared in '+target);
