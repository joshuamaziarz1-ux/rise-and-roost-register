import { clone, localInstant } from '../public/model.mjs';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const token = () => [...crypto.getRandomValues(new Uint8Array(24))].map(v => v.toString(16).padStart(2, '0')).join('');
async function hash(value) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(v => v.toString(16).padStart(2, '0')).join(''); }

// Restores only into an authenticated, empty private workspace. It cannot reset
// an existing site, restore credentials, replay notifications, or take ownership.
export async function restoreBusinessBackup({ db, row, input, fingerprint, actor, now, validateDocument }) {
  const b = input.backup, ledger = JSON.parse(row.ledger_json), at = new Date(now).toISOString();
  const first = (sql, ...values) => db.prepare(sql).bind(...values).first();
  if (input.confirmPrivateCopy !== true || b?.format !== 'rise-roost-business-backup-v1') fail('Choose a Rise & Roost backup and confirm restoration into an empty private copy.');
  if (input.targetIsPrimary === true || ledger.orders.length || ledger.management?.operations?.length || await first('SELECT id FROM roost_members WHERE workspace_id=? LIMIT 1', row.id) || await first('SELECT id FROM customer_comments WHERE workspace_id=? LIMIT 1', row.id)) fail('Restore is allowed only into a new empty private workspace. Existing data cannot be overwritten.', 409);
  if (!Array.isArray(b.members) || b.members.length > 500 || !Array.isArray(b.comments) || b.comments.length > 500) fail('Check the backup member/comment records.');
  const restoredLedger = clone(b.ledger);
  if (!restoredLedger || !Array.isArray(restoredLedger.orders) || restoredLedger.orders.length > 300) fail('Check the backup order ledger.');
  const members = new Map(), statements = [], claim = token();
  for (const member of b.members) {
    if (!/^[a-f0-9-]{16,48}$/.test(member.id || '') || members.has(member.id)) fail('Check restored member identifiers.');
    let profile; try { profile = JSON.parse(member.profile_json); } catch { fail('Check restored member contact details.'); }
    if (typeof profile.name !== 'string' || profile.name.length > 80 || (profile.email || '').length > 254 || (profile.phone || '').length > 32) fail('Check restored member contact details.');
    const id = token(); members.set(member.id, id);
    statements.push(db.prepare("INSERT INTO roost_members(id,workspace_id,profile_json,recovery_hash,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM workspaces WHERE id=? AND json_extract(ledger_json,'$.management.restoreClaim')=?)")
      .bind(id, row.id, JSON.stringify(profile), await hash('restored-contact:' + token()), Number(member.created_at) || now, row.id, claim));
  }
  const orderIds = new Set();
  for (const o of restoredLedger.orders) {
    if (!/^[a-f0-9-]{16,48}$/.test(o.id || '') || orderIds.has(o.id) || !Number.isSafeInteger(o.total) || o.total < 0 || !Array.isArray(o.lines) || o.lines.length > 50 || !o.pickup || !['pending', 'preparing', 'ready', 'picked-up', 'canceled'].includes(o.status)) fail('Check restored order records.');
    orderIds.add(o.id);
    if (!o.lines.every(l => /^[a-zA-Z0-9_-]{1,80}$/.test(l.productId) && /^[a-zA-Z0-9_-]{1,80}$/.test(l.variantId) && Number.isInteger(l.unitPrice) && l.unitPrice >= 0 && l.unitPrice <= 2000000 && Number.isInteger(l.qty) && l.qty > 0 && l.qty <= 99) || o.lines.reduce((n, l) => n + l.qty * l.unitPrice, 0) !== o.total) fail('A restored order total does not match its historical lines.');
    if (!Number.isFinite(Date.parse(o.at))) fail('Check restored order dates.');
    localInstant(o.pickup.date, o.pickup.start); localInstant(o.pickup.date, o.pickup.end); localInstant(o.pickup.cutoffDate, o.pickup.cutoffTime);
    if (o.customer?.memberId) o.customer.memberId = members.get(o.customer.memberId) || undefined;
    o.trackingKey = token();
    o.notifications = []; // Never resend old notifications during restoration.
  }
  restoredLedger.management ||= {};
  for (const b of restoredLedger.management.benefits || []) if (members.has(b.memberId)) b.memberId = members.get(b.memberId);
  restoredLedger.management.operations = [{ id: input.operationId, fingerprint, at, result: { restored: true } }];
  restoredLedger.management.audit ||= []; restoredLedger.management.audit.unshift({ id: token(), action: 'Business backup restored into a new private copy', at, actor });
  restoredLedger.management.restoreClaim = claim;
  if (new TextEncoder().encode(JSON.stringify(restoredLedger)).length > 1200000) fail('This backup exceeds the preview ledger storage limit.');
  const remap = value => JSON.parse(JSON.stringify(value).replace(/\/api\/assets\/([a-f0-9]{48})/g, (src, id) => input.assetMap?.[id] || src));
  const draft = remap(b.draft), published = remap(b.published);
  const versions = (Array.isArray(b.versions) ? b.versions.slice(0, 30) : []).map(v => ({ ...v, document: remap(v.document) }));
  if (new TextEncoder().encode(JSON.stringify(versions)).length > 1500000) fail('This backup revision history exceeds the preview storage limit. Keep the source backup intact and ask the operator to expand history storage.');
  for (const doc of [draft, published, ...versions.map(v => v.document)]) {
    validateDocument(doc);
    for (const asset of new Set([...JSON.stringify(doc).matchAll(/\/api\/assets\/([a-f0-9]{48})/g)].map(v => v[1]))) if (!await first('SELECT id FROM assets WHERE id=? AND workspace_id=?', asset, row.id)) fail('Upload backup photos to this new private workspace before importing their references.');
  }
  for (const c of b.comments) {
    if (!['pending', 'approved', 'hidden'].includes(c.status) || typeof c.body !== 'string' || c.body.length > 1000 || typeof c.name !== 'string' || c.name.length > 80) fail('Check restored comments.');
    statements.push(db.prepare("INSERT INTO customer_comments(id,workspace_id,name,body,status,version,created_at,reviewed_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM workspaces WHERE id=? AND json_extract(ledger_json,'$.management.restoreClaim')=?)")
      .bind(token(), row.id, c.name, c.body, c.status, c.version || 1, c.created_at || at, c.reviewed_at || null, row.id, claim));
  }
  const update = db.prepare('UPDATE workspaces SET draft_json=?,published_json=?,versions_json=?,ledger_json=?,revision=revision+1,published_revision=published_revision+1,ledger_version=ledger_version+1 WHERE id=? AND revision=? AND ledger_version=?')
    .bind(JSON.stringify(draft), JSON.stringify(published), JSON.stringify(versions), JSON.stringify(restoredLedger), row.id, row.revision, row.ledger_version);
  const written = await db.batch([update, ...statements]);
  if (written[0].meta.changes !== 1) fail('The restore target changed. Existing records were not overwritten.', 409);
}
