import { readFile, open, unlink, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { decryptSnapshot } from '../server/daily-backup.mjs';

const q = name => '"' + name.replaceAll('"', '""') + '"';
const sorted = rows => rows.map(r => JSON.stringify(Object.fromEntries(Object.entries(r).sort(([a], [b]) => a.localeCompare(b))))).sort();
export async function restoreNewLocalDatabase({ encrypted, key, databaseId, outputPath }) {
  // Authenticate before opening anything. Exclusive creation forbids overwrites.
  const { snapshot } = await decryptSnapshot(encrypted, key, databaseId);
  const file = await open(outputPath, 'wx', 0o600); await file.close();
  let db, mediaCreated = false;
  const mediaDirectory = outputPath + '.media';
  try {
    await mkdir(mediaDirectory, { mode: 0o700 }); mediaCreated = true;
    for (const media of snapshot.media) {
      const name = media.path.slice('/assets/'.length);
      if (['.', '..'].includes(name)) throw new Error('Invalid release media filename.');
      await writeFile(join(mediaDirectory, name), Buffer.from(media.bytes, 'base64'), { flag: 'wx', mode: 0o600 });
    }
    db = new DatabaseSync(outputPath); db.exec('BEGIN');
    for (const s of snapshot.schema.filter(s => s.type === 'table')) db.exec(s.sql);
    for (const table of snapshot.tables) for (const source of table.rows) {
      const row = { ...source };
      if (table.name === 'assets') { row.bytes = Buffer.from(row.bytes_hex, 'hex'); delete row.bytes_hex; }
      const columns = Object.keys(row);
      db.prepare(`INSERT INTO ${q(table.name)} (${columns.map(q).join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...columns.map(c => row[c]));
    }
    for (const s of snapshot.schema.filter(s => s.type !== 'table')) db.exec(s.sql);
    for (const table of snapshot.tables) {
      const rows = db.prepare(table.name === 'assets' ? 'SELECT id,workspace_id,mime,hex(bytes) AS bytes_hex FROM assets' : 'SELECT * FROM ' + q(table.name)).all();
      if (JSON.stringify(sorted(rows)) !== JSON.stringify(sorted(table.rows))) throw new Error('Restored records differ for ' + table.name);
    }
    const restoredSchema = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('table','index','view','trigger') AND sql IS NOT NULL AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' ORDER BY type,name").all();
    if (JSON.stringify(sorted(restoredSchema)) !== JSON.stringify(sorted(snapshot.schema))) throw new Error('Restored database schema differs.');
    db.exec('COMMIT'); db.close(); db = null;
    return { restored: true, databaseId, tableCount: snapshot.tables.length, everyRecordMatches: true, schemaMatches: true, mediaCount: snapshot.media.length, mediaDirectory, remoteWrites: 0 };
  } catch (error) { db?.close(); await unlink(outputPath); if (mediaCreated) await rm(mediaDirectory, { recursive: true }); throw error; }
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const [inputPath, outputPath, databaseId] = process.argv.slice(2);
  if (!inputPath || !outputPath || !databaseId || !process.env.RR_BACKUP_RECOVERY_KEY) throw new Error('Use: node scripts/restore-business-backup.mjs ARCHIVE NEW_LOCAL_DB EXPECTED_DATABASE_ID with RR_BACKUP_RECOVERY_KEY set privately. No remote restore is performed.');
  const result = await restoreNewLocalDatabase({ encrypted: await readFile(inputPath, 'utf8'), key: process.env.RR_BACKUP_RECOVERY_KEY, databaseId, outputPath });
  console.log(JSON.stringify(result));
}
