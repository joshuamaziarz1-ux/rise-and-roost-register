import { customerPasswordError } from '../public/customer-password-policy.mjs';
import { customerSession, customerCookie, customerToken, sessionStatements, sessionHash as hash, sessionToken as token, RECENT_AUTH } from './customer-sessions.mjs';
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const first = (db, sql, ...args) => db.prepare(sql).bind(...args).first();
export const passwordLoginReady = (env = {}) => env.ROOST_PASSWORD_LOGIN_ENABLED === 'true' && typeof env.ROOST_PASSWORD_PEPPER === 'string' && env.ROOST_PASSWORD_PEPPER.length >= 32;
export function normalizeUsername(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,29}$/.test(value.trim())) fail('Choose a username of 3–30 letters, numbers, dots, dashes or underscores. Start with a letter or number.');
  return value.trim().toLowerCase();
}
export function validatePassword(value) {
  const error = customerPasswordError(value);
  if (error) fail(error);
  return value;
}

const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
const bytes = text => Uint8Array.from(text.match(/../g), b => parseInt(b, 16));
export function constantEqual(a, b) { let diff = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return diff === 0; }
export async function passwordVerifier(password, salt, pepper) {
  // Standard PBKDF2: six SHA256 output blocks, each 100,000 iterations.
  // workerd caps iterations at 100,000. Deriving all 192 bytes costs 600,000
  // PRF evaluations; only a keyed verifier of the entire output is retained.
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: bytes(salt), iterations: 100000 }, key, 1536);
  const secret = await crypto.subtle.importKey('raw', new TextEncoder().encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', secret, derived));
}
async function limit(db, key, max, now, window = 3600000) {
  const row = await first(db, 'INSERT INTO limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count', await hash('password:' + key + ':' + Math.floor(now / window)), now + window * 2);
  if (row.count > max) fail('Too many attempts. Please try again later. Your account has not changed.', 429);
}
const safeCredentials = row => row && /^[a-f0-9]{48}$/.test(row.salt) && /^[a-f0-9]{64}$/.test(row.verifier) && row.scheme === 'pbkdf2-sha256-100000-192-hmac-v1';
export async function passwordLogin({ request, db, workspaceId: workspace, now, input, path, response, env }) {
  if (!passwordLoginReady(env)) fail('Username sign-in is temporarily unavailable. Use your existing passkey or recovery code.', 503);
  const action = path.split('/').at(-1), ip = request.headers.get('CF-Connecting-IP') || 'local';
  await limit(db, 'ip:' + ip, 50, now);
  await limit(db, 'global', 1000, now);
  const member = await customerSession(request, db, workspace, now);
  let username, row;
  if (['setup', 'change'].includes(action)) {
    if (!member) fail('Sign in to your existing account first.', 401);
    row = await first(db, 'SELECT * FROM roost_passwords WHERE workspace_id=? AND member_id=?', workspace, member.id);
    if (action === 'setup') {
      if (row) fail('This account already has a username. Use Change password instead.', 409);
      if (member.authenticated_at + RECENT_AUTH <= now) fail('Sign in again with your existing passkey or recovery code before adding a username.', 401);
      username = normalizeUsername(input.username);
    } else {
      if (!row || !safeCredentials(row)) fail('Add a username to this account first.', 409);
      username = row.username;
    }
  } else {
    username = normalizeUsername(input.username);
    row = await first(db, 'SELECT * FROM roost_passwords WHERE workspace_id=? AND username=?', workspace, username);
  }
  await limit(db, 'identity:' + workspace + ':' + username, 10, now, 900000);
  if (['register', 'login'].includes(action) && member) fail('You are already signed in. Use Account Settings for this account.', 409);
  if (action === 'register' || action === 'setup') {
    await limit(db, 'enroll-ip:' + ip, 5, now);
    await limit(db, 'enroll-global', 50, now);
    if (await first(db, 'SELECT member_id FROM roost_passwords WHERE workspace_id=? AND username=?', workspace, username)) fail('That username is unavailable. Choose another, or sign in to your existing account.', 409);
  }
  let replacement, recoveryKey, id = ['setup', 'change'].includes(action) ? member.id : row?.member_id;
  if (action === 'login' || action === 'change') {
    const supplied = action === 'change' ? input.currentPassword : input.password;
    if (typeof supplied !== 'string' || supplied.length > 512) fail('The username or password does not match.', 401);
    // Unknown usernames perform the same KDF work; never reveal account existence.
    const salt = safeCredentials(row) ? row.salt : '00'.repeat(24);
    const calculated = await passwordVerifier(supplied, salt, env.ROOST_PASSWORD_PEPPER);
    if (!safeCredentials(row) || !constantEqual(calculated, row.verifier)) fail('The username or password does not match.', 401);
  } else if (action === 'recover') {
    if (!/^[a-f0-9]{48}$/.test(input.recoveryKey || '')) fail('The username or recovery code does not match.', 401);
    const saved = row && await first(db, 'SELECT recovery_hash FROM roost_members WHERE workspace_id=? AND id=?', workspace, row.member_id);
    if (!saved || !constantEqual(await hash(input.recoveryKey), saved.recovery_hash)) fail('The username or recovery code does not match.', 401);
    row = { ...row, recovery_hash: saved.recovery_hash };
    recoveryKey = token();
  }
  if (action !== 'login') {
    validatePassword(input.password);
    replacement = { salt: token(), scheme: 'pbkdf2-sha256-100000-192-hmac-v1' };
    replacement.verifier = await passwordVerifier(input.password, replacement.salt, env.ROOST_PASSWORD_PEPPER);
  }
  let profile;
  if (action === 'register') {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > 40 || /[\x00-\x1f]/.test(name)) fail('Enter your preferred name, up to 40 characters.');
    if ((await first(db, 'SELECT COUNT(*) AS n FROM roost_members WHERE workspace_id=?', workspace)).n >= 500) fail('New accounts are temporarily unavailable. You can continue as a guest.', 409);
    profile = JSON.stringify({ name, preferredName: name, email: '', phone: '' }); id = token(); recoveryKey = token();
  }
  const session = token(), claim = token(), guard = 'EXISTS(SELECT 1 FROM roost_password_grants WHERE id=?)', args = [claim];
  let condition = '1', conditions = [];
  if (action === 'register') { condition = 'NOT EXISTS(SELECT 1 FROM roost_passwords WHERE workspace_id=? AND username=?) AND (SELECT COUNT(*) FROM roost_members WHERE workspace_id=?)<500'; conditions = [workspace, username, workspace]; }
  if (action === 'setup' || action === 'change') {
    condition = 'EXISTS(SELECT 1 FROM roost_sessions s JOIN roost_session_details d ON d.hash=s.hash WHERE s.hash=? AND s.workspace_id=? AND s.member_id=? AND s.expires>? AND d.absolute_expires>?' + (action === 'setup' ? ' AND d.authenticated_at>?' : '') + ')';
    conditions = [member.session_hash, workspace, id, now, now, ...(action === 'setup' ? [now - RECENT_AUTH] : [])];
    condition += action === 'setup' ? ' AND NOT EXISTS(SELECT 1 FROM roost_passwords WHERE workspace_id=? AND (member_id=? OR username=?))' : ' AND EXISTS(SELECT 1 FROM roost_passwords WHERE workspace_id=? AND member_id=? AND verifier=? AND revision=?)';
    conditions.push(workspace, id, ...(action === 'setup' ? [username] : [row.verifier, row.revision]));
  }
  if (action === 'login' || action === 'recover') {
    condition = 'EXISTS(SELECT 1 FROM roost_passwords WHERE workspace_id=? AND username=? AND member_id=? AND verifier=? AND revision=?)'; conditions = [workspace, username, id, row.verifier, row.revision];
    if (action === 'recover') { condition += ' AND EXISTS(SELECT 1 FROM roost_members WHERE workspace_id=? AND id=? AND recovery_hash=?)'; conditions.push(workspace, id, row.recovery_hash); }
  }
  const batch = [db.prepare('INSERT INTO roost_password_grants(id,expires) SELECT ?,? WHERE ' + condition).bind(claim, now + 300000, ...conditions)];
  if (action === 'register') batch.push(db.prepare('INSERT INTO roost_members(id,workspace_id,profile_json,recovery_hash,created_at) SELECT ?,?,?,?,? WHERE ' + guard).bind(id, workspace, profile, await hash(recoveryKey), now, ...args));
  if (action === 'register' || action === 'setup') batch.push(db.prepare('INSERT INTO roost_passwords(workspace_id,username,member_id,salt,verifier,scheme,revision) SELECT ?,?,?,?,?,?,1 WHERE ' + guard).bind(workspace, username, id, replacement.salt, replacement.verifier, replacement.scheme, ...args));
  if (action === 'change' || action === 'recover') batch.push(db.prepare('UPDATE roost_passwords SET salt=?,verifier=?,scheme=?,revision=revision+1 WHERE workspace_id=? AND member_id=? AND ' + guard).bind(replacement.salt, replacement.verifier, replacement.scheme, workspace, id, ...args));
  if (action === 'recover') batch.push(db.prepare('UPDATE roost_members SET recovery_hash=? WHERE workspace_id=? AND id=? AND ' + guard).bind(await hash(recoveryKey), workspace, id, ...args));
  if (action === 'change' || action === 'recover') {
    batch.push(db.prepare('UPDATE roost_sessions SET expires=0 WHERE workspace_id=? AND member_id=? AND ' + guard).bind(workspace, id, ...args));
    // Recovery and password changes fence pre-existing account ceremonies, too.
    batch.push(db.prepare("UPDATE roost_challenges SET expires=0 WHERE workspace_id=? AND json_extract(data_json,'$.id')=? AND " + guard).bind(workspace, id, ...args));
  } else {
    const previous = customerToken(request, workspace);
    if (previous) batch.push(db.prepare('UPDATE roost_sessions SET expires=0 WHERE hash=? AND workspace_id=? AND ' + guard).bind(await hash(previous), workspace, ...args));
  }
  batch.push(...sessionStatements(db, request, workspace, id, { hash: await hash(session) }, now, guard, args));
  batch.push(db.prepare('DELETE FROM roost_password_grants WHERE expires<?').bind(now));
  const result = await db.batch(batch);
  if (result[0].meta.changes !== 1) fail('This account changed. Please sign in again or choose another username.', 409);
  return response({ ok: true, ...(recoveryKey ? { recoveryKey } : {}) }, [customerCookie(request, workspace, session, 30 * 86400)]);
}
