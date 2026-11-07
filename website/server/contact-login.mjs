import { SENDER } from './email-policy.mjs';
import { sessionHash as hash, sessionToken as token, customerCookie, sessionStatements, customerSession, RECENT_AUTH } from './customer-sessions.mjs';
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const first = (db, sql, ...args) => db.prepare(sql).bind(...args).first();
export function normalizeContact(value) {
  if (typeof value !== 'string' || value.length > 254) fail('Enter a valid email address or US mobile phone number.');
  const text = value.trim();
  if (text.includes('@')) {
    const email = text.toLowerCase();
    if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(email) || email.split('@')[0].startsWith('.') || email.split('@')[0].endsWith('.') || email.includes('..')) fail('Enter a valid email address.');
    return { contact: email, channel: 'email' };
  }
  if (!/^(?:\+1[ .-]?)?[\d() .-]+$/.test(text)) fail('Enter a valid email address or US mobile phone number.');
  let digits = text.replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '1') digits = digits.slice(1);
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) fail('Enter a 10-digit US mobile phone number, including its area code.');
  return { contact: '+1' + digits, channel: 'phone' };
}
export function contactLoginReady(env = {}) {
  return env.ROOST_SIMPLE_LOGIN_ENABLED === 'true' && env.ROOST_DELIVERY_VERIFIED === 'true' &&
    typeof env.ROOST_CODE_PEPPER === 'string' && env.ROOST_CODE_PEPPER.length >= 32 &&
    !!env.RESEND_API_KEY && !!env.ROOST_EMAIL_FROM && !!env.TWILIO_ACCOUNT_SID && !!env.TWILIO_AUTH_TOKEN && !!env.ROOST_SMS_FROM;
}
export function secureCode() {
  const a = new Uint32Array(1); do { crypto.getRandomValues(a); } while (a[0] >= 4294000000);
  return String(a[0] % 1000000).padStart(6, '0');
}
async function verifier(pepper, id, code) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(id + ':' + code))), b => b.toString(16).padStart(2, '0')).join('');
}
export async function deliverCode(env, target, code, id, fetcher = fetch) {
  // No logging of bodies, contacts, provider errors, or codes.
  let response;
  if (target.channel === 'email') response = await fetcher('https://api.resend.com/emails', {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json', 'Idempotency-Key': 'roost-' + id },
    body: JSON.stringify({ from: SENDER, to: [target.contact], subject: 'Your Rise & Roost sign-in code', text: `Your verification code is ${code}. It expires in five minutes. If you did not request it, ignore this message. Never share your code.` })
  });
  else response = await fetcher('https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(env.TWILIO_ACCOUNT_SID) + '/Messages.json', {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { Authorization: 'Basic ' + btoa(env.TWILIO_ACCOUNT_SID + ':' + env.TWILIO_AUTH_TOKEN), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: env.ROOST_SMS_FROM, To: target.contact, Body: `Rise & Roost: ${code} is your sign-in code. Expires in 5 minutes. Never share this code.` }).toString()
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || (target.channel === 'email' ? !result.id : !result.sid || !['queued', 'accepted', 'sending', 'sent', 'delivered'].includes(result.status))) throw new Error('delivery');
}
async function limit(db, key, max, until) {
  const row = await first(db, 'INSERT INTO limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count', await hash('contact-login:' + key), until);
  if (row.count > max) fail('Too many attempts. Please try again later.', 429);
}
async function legacyMatch(db, workspace, contact) {
  const rows = await db.prepare('SELECT profile_json FROM roost_members WHERE workspace_id=?').bind(workspace).all();
  return rows.results.some(row => {
    const p = JSON.parse(row.profile_json);
    return [p.email, p.phone].some(value => { try { return normalizeContact(value).contact === contact; } catch { return false; } });
  });
}
export async function contactLogin({ request, db, workspaceId: workspace, now, input, path, response, env, send = deliverCode }) {
  if (!contactLoginReady(env)) fail('Verification is temporarily unavailable. Please use your passkey or continue as a guest.', 503);
  const name = 'rr_roost_code_' + workspace;
  const codeCookie = (value, age) => `${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
  const raw = (request.headers.get('Cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(name + '='))?.slice(name.length + 1);
  const origin = new URL(request.url).origin;
  const hour = Math.floor(now / 3600000), ip = request.headers.get('CF-Connecting-IP') || 'local';
  await limit(db, `verify-ip:${ip}:${hour}`, 100, now + 7200000);
  if (path.endsWith('/start')) {
    const target = normalizeContact(input.contact), purpose = input.link === true ? 'link' : 'login';
    const member = purpose === 'link' ? await customerSession(request, db, workspace, now) : null;
    if (purpose === 'link' && (!member || member.authenticated_at + RECENT_AUTH <= now)) fail('Sign in again before adding a verified contact.', 401);
    if (purpose === 'login' && await customerSession(request, db, workspace, now)) fail('You are already signed in.', 409);
    const cooldown = await first(db, 'INSERT INTO limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET expires=excluded.expires WHERE limits.expires<=? RETURNING count', await hash('contact-cooldown:' + workspace + ':' + target.contact), now + 60000, now);
    if (!cooldown) fail('Please wait one minute before requesting another code.', 429);
    await limit(db, `identity:${workspace}:${target.contact}:${hour}`, 5, now + 7200000);
    await limit(db, `send-ip:${ip}:${hour}`, 20, now + 7200000);
    await limit(db, `global:${hour}`, 200, now + 7200000);
    const secret = token(), id = await hash(secret), code = secureCode();
    await db.batch([
      db.prepare('DELETE FROM roost_codes WHERE expires<?').bind(now - 86400000),
      db.prepare('UPDATE roost_codes SET state=\'used\' WHERE workspace_id=? AND contact=?').bind(workspace, target.contact),
      db.prepare('INSERT INTO roost_codes(hash,workspace_id,contact,channel,verifier,expires,purpose,member_id,session_hash,origin) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id, workspace, target.contact, target.channel, await verifier(env.ROOST_CODE_PEPPER, id, code), now + 300000, purpose, member?.id || null, member?.session_hash || null, origin)
    ]);
    try { await send(env, target, code, id); }
    catch { await db.prepare("UPDATE roost_codes SET state='used' WHERE hash=?").bind(id).run(); fail('We could not send your code. Please try again later, use a passkey, or continue as a guest.', 503); }
    return response({ ok: true, resendAfter: 60 }, [codeCookie(secret, 300)]);
  }
  const challenge = /^[a-f0-9]{48}$/.test(raw || '') && await first(db, 'SELECT * FROM roost_codes WHERE hash=? AND workspace_id=? AND origin=?', await hash(raw), workspace, origin);
  if (!challenge || challenge.expires <= now || challenge.state === 'used') fail('Your code expired or was already used. Please request a new code.', 401);
  if (challenge.attempts >= 5) fail('Too many attempts. Please request a new code later.', 429);
  if (path.endsWith('/verify')) {
    if (challenge.state !== 'pending') fail('This code was already verified.', 409);
    if (!/^\d{6}$/.test(input.code || '') || await verifier(env.ROOST_CODE_PEPPER, challenge.hash, input.code) !== challenge.verifier) {
      await db.prepare('UPDATE roost_codes SET attempts=attempts+1 WHERE hash=?').bind(challenge.hash).run();
      fail('That code does not match. Please try again.', 401);
    }
  } else if (!path.endsWith('/finish') || challenge.state !== 'verified') fail('Verify your contact before creating an account.', 401);
  const existing = await first(db, 'SELECT member_id FROM roost_contacts WHERE workspace_id=? AND contact=?', workspace, challenge.contact);
  const claim = token();
  let memberId = existing?.member_id, create = false;
  if (challenge.purpose === 'link') {
    const member = await customerSession(request, db, workspace, now);
    if (!member || member.session_hash !== challenge.session_hash || member.id !== challenge.member_id || member.authenticated_at + RECENT_AUTH <= now) fail('Sign in again before adding a verified contact.', 401);
    if (existing && existing.member_id !== member.id) fail('This contact cannot be linked. Use account recovery or contact support.', 409);
    memberId = member.id;
  } else if (!existing) {
    if (await legacyMatch(db, workspace, challenge.contact)) fail('To protect an existing membership, sign in with its passkey or recovery key, then verify this contact in Account Settings. Contact support if you need help.', 409);
    if (path.endsWith('/verify')) {
      const r = await db.prepare("UPDATE roost_codes SET state='verified' WHERE hash=? AND state='pending' AND attempts<5 AND expires>?").bind(challenge.hash, now).run();
      if (r.meta.changes !== 1) fail('Please start sign-in again.', 409);
      return response({ registrationRequired: true });
    }
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 40 || /[\x00-\x1f]/.test(input.name)) fail('Enter your preferred name, up to 40 characters.');
    if ((await first(db, 'SELECT COUNT(*) AS n FROM roost_members WHERE workspace_id=?', workspace)).n >= 500) fail('New memberships are temporarily unavailable. Please continue as a guest.', 409);
    memberId = token(); create = true;
  }
  const guard = 'EXISTS(SELECT 1 FROM roost_codes WHERE hash=? AND claim=?)', args = [challenge.hash, claim];
  let consume = "UPDATE roost_codes SET state='used',claim=? WHERE hash=? AND state=? AND attempts<5 AND expires>?";
  const values = [claim, challenge.hash, challenge.state, now];
  if (challenge.purpose === 'link') {
    consume += ' AND EXISTS(SELECT 1 FROM roost_sessions s JOIN roost_session_details d ON s.hash=d.hash WHERE s.hash=? AND s.member_id=? AND s.workspace_id=? AND s.expires>? AND d.absolute_expires>? AND d.authenticated_at>?)';
    values.push(challenge.session_hash, memberId, workspace, now, now, now - RECENT_AUTH);
  }
  const batch = [db.prepare(consume).bind(...values)];
  if (create) batch.push(db.prepare('INSERT INTO roost_members(id,workspace_id,profile_json,recovery_hash,created_at) SELECT ?,?,?,?,? WHERE ' + guard).bind(memberId, workspace, JSON.stringify({ name: input.name.trim(), email: challenge.channel === 'email' ? challenge.contact : '', phone: challenge.channel === 'phone' ? challenge.contact : '' }), await hash(token()), now, ...args));
  if (!existing) batch.push(db.prepare('INSERT INTO roost_contacts(workspace_id,contact,channel,member_id,verified_at) SELECT ?,?,?,?,? WHERE ' + guard).bind(workspace, challenge.contact, challenge.channel, memberId, now, ...args));
  const session = token();
  if (challenge.purpose !== 'link') batch.push(...sessionStatements(db, request, workspace, memberId, { hash: await hash(session) }, now, guard, args));
  const results = await db.batch(batch);
  if (results[0].meta.changes !== 1) fail('This code was already used. Please start again.', 409);
  return response({ ok: true }, [codeCookie('', 0), ...(challenge.purpose !== 'link' ? [customerCookie(request, workspace, session, 30 * 86400)] : [])]);
}
