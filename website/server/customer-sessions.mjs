// Customer sessions only. Studio authentication never imports this module.
export const INACTIVITY = 30 * 86400000;
export const ABSOLUTE = 90 * 86400000;
export const RECENT_AUTH = 10 * 60000;
export const sessionHash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
export const sessionToken = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');
const first = (db, sql, ...args) => db.prepare(sql).bind(...args).first();
export const customerCookieName = workspace => 'rr_roost_' + workspace;
export const customerCookie = (request, workspace, value, seconds) => `${customerCookieName(workspace)}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${seconds}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
export const customerToken = (request, workspace) => (request.headers.get('Cookie') || '').split(';').map(p => p.trim()).find(p => p.startsWith(customerCookieName(workspace) + '='))?.slice(customerCookieName(workspace).length + 1);
function deviceLabel(request) {
  const ua = request.headers.get('User-Agent') || '';
  return /iPhone|iPad/.test(ua) ? 'iPhone or iPad' : /Android/.test(ua) ? 'Android device' : /Windows/.test(ua) ? 'Windows computer' : /Macintosh/.test(ua) ? 'Mac' : 'Browser';
}
export function sessionStatements(db, request, workspace, memberId, raw, now, guard = '1', args = []) {
  // Hash is supplied by the caller so all statements can share one D1 transaction.
  return [
    db.prepare('INSERT INTO roost_sessions(hash,workspace_id,member_id,expires) SELECT ?,?,?,? WHERE ' + guard).bind(raw.hash, workspace, memberId, now + INACTIVITY, ...args),
    db.prepare('INSERT INTO roost_session_details(hash,id,created_at,last_seen,absolute_expires,authenticated_at,label) SELECT ?,?,?,?,?,?,? WHERE ' + guard).bind(raw.hash, sessionToken(), now, now, now + ABSOLUTE, now, deviceLabel(request), ...args),
  ];
}
export async function customerSession(request, db, workspace, now) {
  const raw = customerToken(request, workspace);
  if (!/^[a-f0-9]{48}$/.test(raw || '')) return null;
  const digest = await sessionHash(raw);
  const session = await first(db, 'SELECT m.*,s.hash AS session_hash,s.expires,d.id AS device_id,d.created_at AS session_created,d.absolute_expires,d.authenticated_at FROM roost_members m JOIN roost_sessions s ON s.member_id=m.id AND s.workspace_id=m.workspace_id LEFT JOIN roost_session_details d ON d.hash=s.hash WHERE s.hash=? AND s.workspace_id=? AND s.expires>?', digest, workspace, now);
  if (!session) return null;
  if (!session.device_id) {
    // Legacy sessions had a fixed 30-day lifetime. Preserve that identity and
    // infer the original issue time; migration never extends an expired session.
    const created = session.expires - INACTIVITY;
    await db.prepare('INSERT OR IGNORE INTO roost_session_details(hash,id,created_at,last_seen,absolute_expires,authenticated_at,label) VALUES(?,?,?,?,?,?,?)').bind(digest, sessionToken(), created, now, created + ABSOLUTE, created, 'Previously remembered browser').run();
    return customerSession(request, db, workspace, now);
  }
  return session.absolute_expires > now ? session : null;
}
export async function renewCustomerSession(request, db, workspace, member, now) {
  // Background storefront polling must not write twice every five seconds.
  if (member.expires - now > INACTIVITY - 6 * 3600000) return { member, cookie: customerCookie(request, workspace, customerToken(request, workspace), Math.max(1, Math.floor((member.expires - now) / 1000))) };
  const expires = Math.min(now + INACTIVITY, member.absolute_expires);
  const updated = await db.prepare('UPDATE roost_sessions SET expires=? WHERE hash=? AND workspace_id=? AND expires>?').bind(expires, member.session_hash, workspace, now).run();
  if (updated.meta.changes !== 1) return null;
  await db.prepare('UPDATE roost_session_details SET last_seen=? WHERE hash=?').bind(now, member.session_hash).run();
  return { member: { ...member, expires }, cookie: customerCookie(request, workspace, customerToken(request, workspace), Math.max(1, Math.floor((expires - now) / 1000))) };
}
