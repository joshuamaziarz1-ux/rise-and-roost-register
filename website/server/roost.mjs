import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { customerOrder, emailAddress } from './orders.mjs';
import { customerSession, renewCustomerSession, customerCookie, sessionStatements, RECENT_AUTH } from './customer-sessions.mjs';

const token = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const cookieValue = (request, name) => (request.headers.get('Cookie') || '').split(';').map(p => p.trim()).find(p => p.startsWith(name + '='))?.slice(name.length + 1);
const cookie = (request, name, value, seconds) => `${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${seconds}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
const first = (db, sql, ...args) => db.prepare(sql).bind(...args).first();
const run = (db, sql, ...args) => db.prepare(sql).bind(...args).run();
const list = async (db, sql, ...args) => JSON.parse((await first(db, sql, ...args))?.items || '[]');
export function customerProfile(input) {
  if (!input || typeof input !== 'object') fail('Enter your pickup details.');
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const phone = typeof input.phone === 'string' ? input.phone.trim() : '';
  if (!name || name.length > 80 || /[\x00-\x1f]/.test(name)) fail('Enter a name of up to 80 characters.');
  if (email && !emailAddress(email)) fail('Enter a valid email address or leave it blank.');
  if (phone.length > 32 || (phone && !/^[+()\d .-]{5,32}$/.test(phone))) fail('Enter a valid phone number or leave it blank.');
  return { name, email, phone };
}
export async function memberFor(request, db, workspaceId, now, required = false) {
  const member = await customerSession(request, db, workspaceId, now);
  if (!member && required) fail('Sign in to The Roost to continue. Your basket is saved.', 401);
  return member || null;
}
const safeMember = m => ({ id: m.id, profile: JSON.parse(m.profile_json), sessionExpiresAt: new Date(m.expires).toISOString(), ...(m.absolute_expires ? { sessionMaximumAt: new Date(m.absolute_expires).toISOString() } : {}), ...(m.authenticated_at ? { passkeyAdditionUntil: new Date(m.authenticated_at + RECENT_AUTH).toISOString() } : {}) });
export async function roostApi({ request, db, now, input, path, json, rateLimit }) {
  const url = new URL(request.url);
  const workspaceId = request.method === 'GET' ? url.searchParams.get('workspace') : input.workspaceId;
  if (!/^[a-f0-9]{48}$/.test(workspaceId || '') || !await first(db, 'SELECT id FROM workspaces WHERE id=?', workspaceId)) fail('Open The Roost from this website.', 404);
  const response = (data, cookies = [], status = 200) => {
    const result = json(data, status);
    result.headers.set('Cache-Control', 'no-store, private');
    result.headers.set('CDN-Cache-Control', 'no-store');
    for (const c of cookies) result.headers.append('Set-Cookie', c);
    return result;
  };
  if (path === '/api/roost/me' && request.method === 'GET') {
    const current = await memberFor(request, db, workspaceId, now);
    const renewed = current && await renewCustomerSession(request, db, workspaceId, current, now);
    if (!renewed) return response({ member: null }, cookieValue(request, 'rr_roost_' + workspaceId) ? [customerCookie(request, workspaceId, '', 0)] : []);
    const member = renewed.member;
    const row = await first(db, 'SELECT ledger_json FROM workspaces WHERE id=?', workspaceId);
    const orders = JSON.parse(row.ledger_json).orders.filter(o => o.customer?.memberId === member.id).map(o => customerOrder(o, workspaceId));
    const devices = await list(db, "SELECT json_group_array(json_object('id',d.id,'label',d.label,'lastSeen',d.last_seen,'current',s.hash=?)) AS items FROM roost_sessions s JOIN roost_session_details d ON d.hash=s.hash WHERE s.workspace_id=? AND s.member_id=? AND s.expires>? AND d.absolute_expires>?", member.session_hash, workspaceId, member.id, now, now);
    return response({ member: safeMember(member), orders, devices }, [renewed.cookie]);
  }
  if (path === '/api/roost/revoke-device' && request.method === 'POST') {
    const member = await memberFor(request, db, workspaceId, now, true);
    if (!/^[a-f0-9]{48}$/.test(input.deviceId || '')) fail('Choose a remembered device.');
    await run(db, 'UPDATE roost_sessions SET expires=0 WHERE workspace_id=? AND member_id=? AND hash IN (SELECT hash FROM roost_session_details WHERE id=?)', workspaceId, member.id, input.deviceId);
    return response({ ok: true }, input.deviceId === member.device_id ? [customerCookie(request, workspaceId, '', 0)] : []);
  }
  if (path === '/api/roost/profile' && request.method === 'POST') {
    const member = await memberFor(request, db, workspaceId, now, true), profile = customerProfile(input.profile);
    await run(db, 'UPDATE roost_members SET profile_json=? WHERE id=? AND workspace_id=?', JSON.stringify(profile), member.id, workspaceId);
    return response({ member: safeMember({ ...member, profile_json: JSON.stringify(profile) }) });
  }
  if (path === '/api/roost/logout' && request.method === 'POST') {
    const raw = cookieValue(request, 'rr_roost_' + workspaceId);
    if (raw) await run(db, 'UPDATE roost_sessions SET expires=0 WHERE hash=? AND workspace_id=?', await hash(raw), workspaceId);
    return response({ ok: true }, [cookie(request, 'rr_roost_' + workspaceId, '', 0)]);
  }
  if (path === '/api/roost/options' && request.method === 'POST') {
    await rateLimit('roost-options', 40);
    if (!['register', 'login', 'add'].includes(input.kind)) fail('Choose a sign-in method.');
    const member = input.kind === 'add' ? await memberFor(request, db, workspaceId, now, true) : null;
    if (member && member.authenticated_at + RECENT_AUTH <= now) fail('Please sign in again before adding a passkey.', 401);
    if (input.kind === 'register' && await memberFor(request, db, workspaceId, now)) fail('You already have a Roost. Add a passkey to this account instead.', 409);
    const id = member?.id || token();
    const profile = input.kind === 'register' ? customerProfile(input.profile) : member ? JSON.parse(member.profile_json) : null;
    const count = (await first(db, 'SELECT COUNT(*) AS n FROM roost_members WHERE workspace_id=?', workspaceId)).n;
    if (input.kind === 'register' && count >= 500) fail('New memberships are temporarily unavailable. You can still check out as a guest.', 409);
    const existing = member ? await list(db, "SELECT json_group_array(json_object('id',id)) AS items FROM roost_credentials WHERE workspace_id=? AND member_id=?", workspaceId, id) : [];
    if (input.kind === 'add' && existing.length >= 10) fail('This membership already has ten passkeys.');
    const options = input.kind === 'login'
      ? await generateAuthenticationOptions({ rpID: url.hostname, userVerification: 'required' })
      : await generateRegistrationOptions({ rpName: 'Rise & Roost · The Roost', rpID: url.hostname, userID: new TextEncoder().encode(id), userName: profile.name + ' · ' + id.slice(0, 6), userDisplayName: profile.name, attestationType: 'none', authenticatorSelection: { residentKey: 'required', userVerification: 'required' }, excludeCredentials: existing, supportedAlgorithmIDs: [-7, -257] });
    const raw = token(), data = { challenge: options.challenge, id, profile, origin: url.origin };
    await run(db, 'INSERT INTO roost_challenges(hash,workspace_id,kind,data_json,expires) VALUES(?,?,?,?,?)', await hash(raw), workspaceId, input.kind, JSON.stringify(data), now + 300000);
    return response({ options }, [cookie(request, 'rr_roost_challenge_' + workspaceId, raw, 300)]);
  }
  if (path === '/api/roost/verify' && request.method === 'POST') {
    await rateLimit('roost-verify', 40);
    const raw = cookieValue(request, 'rr_roost_challenge_' + workspaceId);
    const challenge = raw && await first(db, 'SELECT * FROM roost_challenges WHERE hash=? AND workspace_id=? AND expires>? AND claimed_by IS NULL', await hash(raw), workspaceId, now);
    if (!challenge) fail('This sign-in request expired. Please try again.', 401);
    const data = JSON.parse(challenge.data_json);
    if (data.origin !== url.origin) fail('Start sign-in on this website.', 401);
    let credential, previousCredential, additionSession, memberId = data.id;
    try {
      if (challenge.kind === 'login') {
        const saved = await first(db, 'SELECT * FROM roost_credentials WHERE workspace_id=? AND id=?', workspaceId, input.response?.id || '');
        if (!saved) fail('Use a passkey registered with this Roost membership.', 401);
        credential = JSON.parse(saved.credential_json);
        previousCredential = saved.credential_json;
        const result = await verifyAuthenticationResponse({ response: input.response, expectedChallenge: data.challenge, expectedOrigin: url.origin, expectedRPID: url.hostname, requireUserVerification: true, credential: { ...credential, publicKey: new Uint8Array(credential.publicKey) } });
        if (!result.verified) fail('Your passkey could not be verified.', 401);
        credential.counter = result.authenticationInfo.newCounter;
        memberId = saved.member_id;
      } else {
        if (challenge.kind === 'add') {
          const member = await memberFor(request, db, workspaceId, now, true);
          if (member.id !== data.id) fail('Sign in to the same membership before adding a passkey.', 401);
          if (member.authenticated_at + RECENT_AUTH <= now) fail('Please sign in again before adding a passkey.', 401);
          additionSession = member.session_hash;
        }
        const result = await verifyRegistrationResponse({ response: input.response, expectedChallenge: data.challenge, expectedOrigin: url.origin, expectedRPID: url.hostname, requireUserVerification: true, supportedAlgorithmIDs: [-7, -257] });
        if (!result.verified || !result.registrationInfo) fail('Your passkey could not be verified.', 401);
        credential = { ...result.registrationInfo.credential, publicKey: Array.from(result.registrationInfo.credential.publicKey) };
      }
    } catch (e) { if (e.status) throw e; fail('Your passkey could not be verified. Please try again.', 401); }
    const claim = token(), recovery = token(), session = token(), expires = now + 30 * 86400000;
    const guard = 'EXISTS(SELECT 1 FROM roost_challenges WHERE hash=? AND claimed_by=?)';
    const consume = 'UPDATE roost_challenges SET claimed_by=? WHERE hash=? AND claimed_by IS NULL AND expires>?';
    const batch = [challenge.kind === 'login'
      ? db.prepare(consume + ' AND EXISTS(SELECT 1 FROM roost_credentials WHERE workspace_id=? AND id=? AND credential_json=?)').bind(claim, challenge.hash, now, workspaceId, credential.id, previousCredential)
      : challenge.kind === 'add'
        ? db.prepare(consume + ' AND EXISTS(SELECT 1 FROM roost_sessions s JOIN roost_session_details d ON d.hash=s.hash WHERE s.hash=? AND s.workspace_id=? AND s.member_id=? AND s.expires>? AND d.absolute_expires>? AND d.authenticated_at>?)').bind(claim, challenge.hash, now, additionSession, workspaceId, memberId, now, now, now - RECENT_AUTH)
        : db.prepare(consume).bind(claim, challenge.hash, now)];
    if (challenge.kind === 'register') batch.push(db.prepare('INSERT INTO roost_members(id,workspace_id,profile_json,recovery_hash,created_at) SELECT ?,?,?,?,? WHERE ' + guard).bind(memberId, workspaceId, JSON.stringify(data.profile), await hash(recovery), now, challenge.hash, claim));
    if (challenge.kind !== 'login') batch.push(db.prepare('INSERT INTO roost_credentials(id,workspace_id,member_id,credential_json) SELECT ?,?,?,? WHERE ' + guard).bind(credential.id, workspaceId, memberId, JSON.stringify(credential), challenge.hash, claim));
    else batch.push(db.prepare('UPDATE roost_credentials SET credential_json=? WHERE workspace_id=? AND id=? AND ' + guard).bind(JSON.stringify(credential), workspaceId, credential.id, challenge.hash, claim));
    const previousSession = cookieValue(request, 'rr_roost_' + workspaceId);
    if (previousSession) batch.push(db.prepare('UPDATE roost_sessions SET expires=0 WHERE hash=? AND workspace_id=? AND ' + guard).bind(await hash(previousSession), workspaceId, challenge.hash, claim));
    batch.push(...sessionStatements(db, request, workspaceId, memberId, { hash: await hash(session) }, now, guard, [challenge.hash, claim]));
    const results = await db.batch(batch);
    if (results[0].meta.changes !== 1) fail('This sign-in request was already used. Please try again.', 409);
    const member = await first(db, 'SELECT * FROM roost_members WHERE id=? AND workspace_id=?', memberId, workspaceId);
    return response({ member: safeMember({ ...member, expires }), ...(challenge.kind === 'register' ? { recoveryKey: recovery } : {}) }, [cookie(request, 'rr_roost_' + workspaceId, session, 30 * 86400), cookie(request, 'rr_roost_challenge_' + workspaceId, '', 0)]);
  }
  if (path === '/api/roost/recover' && request.method === 'POST') {
    await rateLimit('roost-recovery', 10);
    if (!/^[a-f0-9]{48}$/.test(input.recoveryKey || '')) fail('Enter your saved recovery key.', 401);
    const member = await first(db, 'SELECT * FROM roost_members WHERE workspace_id=? AND recovery_hash=?', workspaceId, await hash(input.recoveryKey));
    if (!member) fail('This recovery key does not match. Your membership has not changed.', 401);
    const next = token(), nextHash = await hash(next), session = token();
    const guard = 'EXISTS(SELECT 1 FROM roost_members WHERE id=? AND workspace_id=? AND recovery_hash=?)';
    const args = [member.id, workspaceId, nextHash];
    const batch = [db.prepare('UPDATE roost_members SET recovery_hash=? WHERE id=? AND workspace_id=? AND recovery_hash=?').bind(nextHash, member.id, workspaceId, member.recovery_hash),
      db.prepare('UPDATE roost_sessions SET expires=0 WHERE member_id=? AND workspace_id=? AND ' + guard).bind(member.id, workspaceId, ...args),
      db.prepare('DELETE FROM roost_credentials WHERE member_id=? AND workspace_id=? AND ' + guard).bind(member.id, workspaceId, ...args),
      // Invalidate pre-recovery challenges too, so a stolen credential cannot
      // complete a previously started add/login ceremony after recovery.
      db.prepare("UPDATE roost_challenges SET expires=0 WHERE workspace_id=? AND json_extract(data_json,'$.id')=? AND " + guard).bind(workspaceId, member.id, ...args),
      ...sessionStatements(db, request, workspaceId, member.id, { hash: await hash(session) }, now, guard, args)];
    const results = await db.batch(batch);
    if (results[0].meta.changes !== 1) fail('This recovery key was already used.', 409);
    return response({ member: safeMember({ ...member, expires: now + 30 * 86400000 }), recoveryKey: next }, [customerCookie(request, workspaceId, session, 30 * 86400)]);
  }
  if (path === '/api/roost/claim-order' && request.method === 'POST') {
    const member = await memberFor(request, db, workspaceId, now, true);
    await rateLimit('roost-claim', 30);
    let link;
    try { link = new URL(input.link, url.origin); } catch { fail('Paste the complete private tracking link.'); }
    const match = /^\/orders\/([a-f0-9]{48})\/([a-f0-9]{48})$/.exec(link.pathname), key = new URLSearchParams(link.hash.slice(1)).get('access');
    if (link.origin !== url.origin || match?.[1] !== workspaceId || !/^[a-f0-9]{48}$/.test(key || '')) fail('Use the private tracking link for an order on this website.');
    const row = await first(db, 'SELECT ledger_json,ledger_version FROM workspaces WHERE id=?', workspaceId), ledger = JSON.parse(row.ledger_json);
    const order = ledger.orders.find(o => o.id === match[2]);
    if (!order || await hash(order.trackingKey || '') !== await hash(key)) fail('This private tracking link could not be verified.', 404);
    if (order.customer?.memberId && order.customer.memberId !== member.id) fail('This order already belongs to a different membership.', 409);
    order.customer ||= {}; order.customer.memberId = member.id;
    const result = await run(db, 'UPDATE workspaces SET ledger_json=?,ledger_version=ledger_version+1 WHERE id=? AND ledger_version=?', JSON.stringify(ledger), workspaceId, row.ledger_version);
    if (result.meta.changes !== 1) fail('The order changed. Please try again.', 409);
    return response({ order: customerOrder(order, workspaceId) });
  }
  fail('This action was not found.', 404);
}

export async function commentsApi({ request, db, now, input, path, json, rateLimit, owner, publicWorkspaceId }) {
  if (path.startsWith('/api/studio-comments')) {
    const workspace = await owner();
    if (request.method === 'POST') {
      if (!['approved', 'hidden'].includes(input.status)) fail('Choose approve or hide.');
      if (!/^[a-f0-9]{48}$/.test(input.id || '') || !Number.isInteger(input.version) || input.version < 1) fail('Refresh comments and select a saved comment.');
      const result = await run(db, 'UPDATE customer_comments SET status=?,version=version+1,reviewed_at=? WHERE id=? AND workspace_id=? AND version=?', input.status, new Date(now).toISOString(), input.id || '', workspace.id, input.version);
      if (result.meta.changes !== 1) fail('This comment changed. Refresh comments before trying again.', 409);
    }
    const items = await list(db, "SELECT json_group_array(json_object('id',id,'name',name,'body',body,'status',status,'version',version,'createdAt',created_at)) AS items FROM (SELECT * FROM customer_comments WHERE workspace_id=? ORDER BY created_at DESC LIMIT 200)", workspace.id);
    return json({ comments: items });
  }
  const workspaceId = request.method === 'GET' ? new URL(request.url).searchParams.get('workspace') || publicWorkspaceId : input.workspaceId;
  if (!/^[a-f0-9]{48}$/.test(workspaceId || '') || !await first(db, 'SELECT id FROM workspaces WHERE id=?', workspaceId)) fail('Open the comments page from this website.', 404);
  if (request.method === 'POST') {
    await rateLimit('comments', 8);
    const name = typeof input.name === 'string' ? input.name.trim() : '', body = typeof input.body === 'string' ? input.body.trim() : '';
    if (!name || name.length > 80 || body.length < 3 || body.length > 1000 || /[\x00-\x08\x0b-\x1f]/.test(name + body)) fail('Add your name and a comment of 3–1,000 characters.');
    if (input.website || input.publicConsent !== true) fail('Please confirm your comment may be shared after review.');
    if ((await first(db, 'SELECT COUNT(*) AS n FROM customer_comments WHERE workspace_id=?', workspaceId)).n >= 1000) fail('Comments are temporarily full. Please try again later.', 409);
    await run(db, 'INSERT INTO customer_comments(id,workspace_id,name,body,created_at) VALUES(?,?,?,?,?)', token(), workspaceId, name, body, new Date(now).toISOString());
    return json({ status: 'pending' }, 201);
  }
  return json({ comments: await list(db, "SELECT json_group_array(json_object('name',name,'body',body,'createdAt',created_at)) AS items FROM (SELECT * FROM customer_comments WHERE workspace_id=? AND status='approved' ORDER BY created_at DESC LIMIT 30)", workspaceId) });
}
