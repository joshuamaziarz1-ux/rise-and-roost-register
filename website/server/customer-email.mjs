import { emailAddress, customerOrder } from './orders.mjs';
const DAY = 86400000, TEN_MINUTES = 600000;
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
export const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
export const digest = async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), b => b.toString(16).padStart(2, '0')).join('');
async function verifier(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text))), b => b.toString(16).padStart(2, '0')).join('');
}
function equal(a, b) { if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false; let n = 0; for (let i = 0; i < a.length; i++) n |= a.charCodeAt(i) ^ b.charCodeAt(i); return n === 0; }
const first = (db, sql, ...v) => db.prepare(sql).bind(...v).first();
const run = (db, sql, ...v) => db.prepare(sql).bind(...v).run();
const cookieName = w => '__Host-rr_email_' + w;
const challengeName = w => '__Host-rr_email_code_' + w;
const readCookie = (r, n) => (r.headers.get('Cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith(n + '='))?.slice(n.length + 1) || '';
const cookie = (name, value, seconds) => `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict${seconds === undefined ? '' : '; Max-Age=' + seconds}`;
export function customerEmailConfigured(env = {}) {
  return env.CUSTOMER_EMAIL_ENABLED === 'true' && env.CUSTOMER_EMAIL_DOMAIN_VERIFIED === 'true' && !!env.RESEND_API_KEY && emailAddress(env.CUSTOMER_EMAIL_FROM) && typeof env.CUSTOMER_EMAIL_CODE_SECRET === 'string' && env.CUSTOMER_EMAIL_CODE_SECRET.length >= 32;
}
export async function sendCustomerCode(env, email, code, id, fetcher = fetch) {
  const response = await fetcher('https://api.resend.com/emails', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json', 'Idempotency-Key': 'rr-signin-' + id },
    body: JSON.stringify({ from: env.CUSTOMER_EMAIL_FROM, to: [email], subject: 'Your Rise & Roost sign-in code', text: `Your Rise & Roost verification code is ${code}.\n\nIt expires in 10 minutes and can be used once. If you did not request this code, you can ignore this email. Never share this code. This is a sign-in email, not a marketing subscription.` }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.id !== 'string' || !result.id) throw Error('Mail unavailable');
}
function sixDigits() {
  // Rejection sampling avoids modulo bias.
  const v = new Uint32Array(1); do { crypto.getRandomValues(v); } while (v[0] >= 4294000000);
  return String(v[0] % 1000000).padStart(6, '0');
}
export async function emailMemberFor(request, db, workspace, now) {
  const raw = readCookie(request, cookieName(workspace));
  if (!/^[a-f0-9]{64}$/.test(raw)) return null;
  return await first(db, 'SELECT m.*,s.hash AS session_hash,s.expires,s.absolute_expires,s.renewed_at,s.remember,a.email AS verified_email FROM roost_email_sessions s JOIN roost_members m ON m.id=s.member_id AND m.workspace_id=s.workspace_id JOIN roost_email_accounts a ON a.member_id=m.id AND a.workspace_id=m.workspace_id WHERE s.workspace_id=? AND (s.hash=? OR (s.previous_hash=? AND s.previous_until>?)) AND s.expires>? AND s.absolute_expires>?', workspace, await digest(raw), await digest(raw), now, now, now);
}
export async function emailCsrf(request, workspace) { return digest(readCookie(request, cookieName(workspace)) + ':customer-csrf'); }
export async function requireEmailCsrf(request, workspace) {
  if (request.headers.get('Origin') !== new URL(request.url).origin || !equal(request.headers.get('X-RR-CSRF'), await emailCsrf(request, workspace))) fail('Reload My Roost before trying again. Your basket is saved.', 403);
}
const safeMember = m => ({ id: m.id, profile: { ...JSON.parse(m.profile_json), email: m.verified_email }, emailVerified: true, membershipStatus: 'Free member', sessionExpiresAt: new Date(m.expires).toISOString(), sessionMaximumAt: new Date(m.absolute_expires).toISOString() });
export async function customerEmailApi({ request, db, now, input, path, json, env, sendCode }) {
  const workspace = request.method === 'GET' ? new URL(request.url).searchParams.get('workspace') : input.workspaceId;
  if (!/^[a-f0-9]{48}$/.test(workspace || '') || !await first(db, 'SELECT id FROM workspaces WHERE id=?', workspace)) fail('Open The Roost from this website.', 404);
  const reply = (data, cookies = [], status = 200) => { const r = json(data, status); for (const c of cookies) r.headers.append('Set-Cookie', c); return r; };
  if (path === '/api/roost/email/status' && request.method === 'GET') return reply({ available: customerEmailConfigured(env) });
  if (!customerEmailConfigured(env)) fail('Email sign-in is not available yet. You can continue as a guest.', 503);
  if (request.method !== 'GET' && (request.headers.get('Origin') !== new URL(request.url).origin || !request.headers.get('Content-Type')?.startsWith('application/json'))) fail('Reload this page before trying again.', 403);
  const throttle = async (key, max, span) => {
    const k = await digest(key + ':' + Math.floor(now / span));
    const r = await first(db, 'INSERT INTO roost_email_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count', k, now + span * 2);
    if (r.count > max) fail('Too many attempts. Please wait before trying again.', 429);
  };
  if (path === '/api/roost/email/request' && request.method === 'POST') {
    if (typeof input.email !== 'string' || input.email.length > 254 || !emailAddress(input.email.trim())) fail('Enter a valid email address.');
    const email = input.email.trim().toLowerCase(), name = typeof input.name === 'string' ? input.name.trim() : '';
    if ((input.kind !== 'login' && input.kind !== 'join') || (input.kind === 'join' && !name) || name.length > 80 || /[\x00-\x1f]/.test(name) || typeof input.remember !== 'boolean') fail('Enter your name and choose whether to remember this device.');
    const ip = request.headers.get('CF-Connecting-IP') || 'local';
    await throttle('send-ip:' + ip, 20, 3600000);
    await throttle('send-global:' + workspace, 500, DAY);
    const cooldownKey = await digest('resend:' + workspace + email);
    const cooldown = await first(db, 'INSERT INTO roost_email_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1,expires=excluded.expires WHERE roost_email_limits.expires<=? RETURNING count', cooldownKey, now + 60000, now);
    if (!cooldown) fail('Please wait one minute before requesting another code.', 429);
    await throttle('send-email:' + workspace + email, 5, 3600000);
    const raw = randomToken(), id = await digest(raw), code = sixDigits();
    // Replace prior challenges for this address atomically; only protected verifiers persist.
    await db.batch([
      db.prepare('UPDATE roost_email_challenges SET consumed=? WHERE workspace_id=? AND email=? AND consumed IS NULL').bind('superseded', workspace, email),
      db.prepare('INSERT INTO roost_email_challenges(hash,workspace_id,email,name,verifier,remember,expires) VALUES(?,?,?,?,?,?,?)').bind(id, workspace, email, name || 'Roost member', await verifier(env.CUSTOMER_EMAIL_CODE_SECRET, id + ':' + code), input.remember ? 1 : 0, now + TEN_MINUTES),
    ]);
    try { await (sendCode || ((email, code, id) => sendCustomerCode(env, email, code, id)))(email, code, id); }
    catch { await run(db, 'UPDATE roost_email_challenges SET consumed=? WHERE hash=?', 'delivery-failed', id); fail('Email sign-in is temporarily unavailable. Please try later or continue as a guest.', 503); }
    return reply({ ok: true, message: 'Check your email for a six-digit code. It expires in 10 minutes.' }, [cookie(challengeName(workspace), raw, 600)], 202);
  }
  if (path === '/api/roost/email/verify' && request.method === 'POST') {
    await throttle('verify-ip:' + (request.headers.get('CF-Connecting-IP') || 'local'), 50, 3600000);
    const raw = readCookie(request, challengeName(workspace)), id = await digest(raw);
    const c = /^[a-f0-9]{64}$/.test(raw) && await first(db, 'UPDATE roost_email_challenges SET attempts=attempts+1 WHERE hash=? AND workspace_id=? AND consumed IS NULL AND attempts<5 AND expires>? RETURNING *', id, workspace, now);
    if (!c || typeof input.code !== 'string' || !/^\d{6}$/.test(input.code) || !equal(c.verifier, await verifier(env.CUSTOMER_EMAIL_CODE_SECRET, id + ':' + input.code))) fail('This code is invalid or expired. Try again or request a new code.', 401);
    const claim = randomToken(), memberId = randomToken().slice(0, 48), session = randomToken(), sessionHash = await digest(session), absolute = now + (c.remember ? 90 * DAY : DAY / 2), expires = Math.min(absolute, now + 30 * DAY);
    const guard = 'EXISTS(SELECT 1 FROM roost_email_challenges WHERE hash=? AND consumed=?)';
    const results = await db.batch([
      db.prepare('UPDATE roost_email_challenges SET consumed=? WHERE hash=? AND consumed IS NULL AND expires>?').bind(claim, id, now),
      db.prepare(`INSERT INTO roost_members(id,workspace_id,profile_json,recovery_hash,created_at) SELECT ?,?,?,?,? WHERE ${guard} AND NOT EXISTS(SELECT 1 FROM roost_email_accounts WHERE workspace_id=? AND email=?)`).bind(memberId, workspace, JSON.stringify({ name: c.name, email: c.email, phone: '' }), await digest(randomToken()), now, id, claim, workspace, c.email),
      db.prepare(`INSERT INTO roost_email_accounts(workspace_id,email,member_id,verified_at) SELECT ?,?,?,? WHERE ${guard} AND NOT EXISTS(SELECT 1 FROM roost_email_accounts WHERE workspace_id=? AND email=?)`).bind(workspace, c.email, memberId, now, id, claim, workspace, c.email),
      db.prepare(`INSERT INTO roost_email_sessions(hash,workspace_id,member_id,expires,absolute_expires,renewed_at,remember) SELECT ?,workspace_id,member_id,?,?,?,? FROM roost_email_accounts WHERE workspace_id=? AND email=? AND ${guard}`).bind(sessionHash, expires, absolute, now, c.remember, workspace, c.email, id, claim),
    ]);
    if (results[0].meta.changes !== 1 || results[3].meta.changes !== 1) fail('This code is invalid or expired. Request a new code.', 401);
    // A new sign-in replaces this browser's prior email session (fixation protection).
    const prior = readCookie(request, cookieName(workspace));
    const legacy = readCookie(request, 'rr_roost_' + workspace);
    if (legacy) await run(db, 'UPDATE roost_sessions SET expires=0 WHERE hash=? AND workspace_id=?', await digest(legacy), workspace);
    if (prior) await run(db, 'UPDATE roost_email_sessions SET expires=0 WHERE workspace_id=? AND (hash=? OR previous_hash=?)', workspace, await digest(prior), await digest(prior));
    return reply({ ok: true }, [cookie(cookieName(workspace), session, c.remember ? Math.floor((absolute - now) / 1000) : undefined), cookie(challengeName(workspace), '', 0), cookie('rr_roost_' + workspace, '', 0)]);
  }
  const member = await emailMemberFor(request, db, workspace, now);
  if (path === '/api/roost/email/me' && request.method === 'GET') {
    if (!member) return reply({ member: null });
    let csrf = await emailCsrf(request, workspace); const cookies = [];
    if (member.remember && now - member.renewed_at >= DAY) {
      const raw = randomToken(), expires = Math.min(now + 30 * DAY, member.absolute_expires);
      const renewed = await run(db, 'UPDATE roost_email_sessions SET previous_hash=hash,previous_until=?,hash=?,expires=?,renewed_at=? WHERE hash=? AND renewed_at=? AND expires>?', now + 120000, await digest(raw), expires, now, member.session_hash, member.renewed_at, now);
      if (renewed.meta.changes === 1) { cookies.push(cookie(cookieName(workspace), raw, Math.floor((member.absolute_expires - now) / 1000))); member.expires = expires; csrf = await digest(raw + ':customer-csrf'); }
    }
    const row = await first(db, 'SELECT ledger_json FROM workspaces WHERE id=?', workspace);
    const orders = JSON.parse(row.ledger_json).orders.filter(o => o.customer?.memberId === member.id).map(o => customerOrder(o, workspace));
    return reply({ member: safeMember(member), orders, csrf }, cookies);
  }
  if (!member) fail('Sign in to My Roost to continue. Your basket is saved.', 401);
  await requireEmailCsrf(request, workspace);
  if (path === '/api/roost/email/profile' && request.method === 'POST') {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > 80 || /[\x00-\x1f]/.test(name)) fail('Enter a display name of up to 80 characters.');
    const profile = { ...JSON.parse(member.profile_json), name, email: member.verified_email };
    await run(db, 'UPDATE roost_members SET profile_json=? WHERE id=? AND workspace_id=?', JSON.stringify(profile), member.id, workspace);
    return reply({ ok: true });
  }
  if (path === '/api/roost/email/logout' && request.method === 'POST') {
    await run(db, 'UPDATE roost_email_sessions SET expires=0,previous_until=0 WHERE hash=?', member.session_hash);
    return reply({ ok: true }, [cookie(cookieName(workspace), '', 0)]);
  }
  fail('This action was not found.', 404);
}
