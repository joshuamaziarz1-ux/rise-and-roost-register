import { createRemoteJWKSet, jwtVerify, customFetch } from 'jose';

// Static Assets do not reliably propagate ctx.access. Verify the signed Access
// JWT explicitly before serving any page, asset, or administrative API.
export const PREVIEW_HOST = 'rise-roost-experience-preview.joshua-maziarz1.workers.dev';
export const PREVIEW_DATABASE = '21352b95-d7f6-406f-8527-4b8dbcebf1bf';
export const PREVIEW_WORKSPACE = '2a7ca191c1639aaf023b02d96bcd9519fe099333302d9204';
const grants = new WeakSet(), resolvers = new Map();
export const isPreviewGrant = value => !!value && grants.has(value);
const validEmail = value => typeof value === 'string' && value.length <= 254 && /^[^\s@*]+@[^\s@*.]+(?:\.[^\s@*.]+)+$/.test(value);
const normalizeEmail = value => value.trim().toLowerCase();

function signingKeys(issuer) {
  if (!resolvers.has(issuer)) {
    if (resolvers.size >= 8) resolvers.delete(resolvers.keys().next().value);
    resolvers.set(issuer, createRemoteJWKSet(new URL(issuer + '/cdn-cgi/access/certs'), {
      timeoutDuration: 5000, cacheMaxAge: 300000, cooldownDuration: 10000,
      [customFetch]: (url, init) => fetch(url, { ...init, redirect: 'error' }),
    }));
  }
  return resolvers.get(issuer);
}

export async function previewAccess(request, env, now = Date.now()) {
  if (!env.PREVIEW_ACCESS_MODE || env.PREVIEW_ACCESS_MODE === 'off') return { active: false };
  const unavailable = () => ({ active: true, status: 503, error: 'Private preview access is not configured. Existing data has not changed.' });
  const denied = () => ({ active: true, status: 403, error: 'Cloudflare Access verification is required for this private preview. Reopen Website Studio to verify your testing session.' });
  const url = new URL(request.url);
  if (env.PREVIEW_ACCESS_MODE !== 'cloudflare-access' || url.protocol !== 'https:' || url.hostname !== PREVIEW_HOST || url.port ||
      env.PREVIEW_DATABASE_ID !== PREVIEW_DATABASE || env.PUBLIC_WORKSPACE_ID !== PREVIEW_WORKSPACE ||
      env.REVIEW_BUILD !== 'true' || env.STUDIO_MANAGEMENT_ENABLED !== 'true' || env.CUSTOMER_EXPERIENCE_ENABLED !== 'true' || env.ORDER_EMAIL_ENABLED !== 'false') return unavailable();
  const until = Date.parse(env.PREVIEW_ACCESS_UNTIL || '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(env.PREVIEW_ACCESS_UNTIL || '') || !Number.isFinite(until) || until > now + 31 * 86400000) return unavailable();
  if (until <= now) return { active: true, status: 403, error: 'Temporary preview access has expired. Ask the preview operator to renew testing access.' };
  let team, emails;
  try { team = new URL(env.CF_ACCESS_TEAM_DOMAIN); emails = JSON.parse(env.PREVIEW_TESTER_EMAILS || ''); }
  catch { return unavailable(); }
  if (team.protocol !== 'https:' || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/.test(team.hostname) || team.port || team.username || team.password || team.pathname !== '/' || team.search || team.hash ||
      !/^[a-f0-9]{64}$/.test(env.CF_ACCESS_AUD || '') || !Array.isArray(emails) || !emails.length || emails.length > 10 || emails.some(v => !validEmail(v))) return unavailable();
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || token.length > 16384) return denied();
  try {
    const { payload } = await jwtVerify(token, signingKeys(team.origin), {
      algorithms: ['RS256'], issuer: team.origin, audience: env.CF_ACCESS_AUD,
      requiredClaims: ['exp', 'iat', 'sub', 'email', 'type'], maxTokenAge: '31d',
      currentDate: new Date(now), clockTolerance: 5,
    });
    if (payload.type !== 'app' || !validEmail(payload.email) || typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255 ||
        !Number.isSafeInteger(payload.exp) || !Number.isSafeInteger(payload.iat) || payload.exp * 1000 <= now || payload.iat * 1000 > now + 5000 || payload.exp - payload.iat > 31 * 86400 ||
        !emails.map(normalizeEmail).includes(normalizeEmail(payload.email))) return denied();
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload.sub)))].map(v => v.toString(16).padStart(2, '0')).join('');
    const grant = Object.freeze({ workspaceId: PREVIEW_WORKSPACE, expiresAt: Math.min(until, payload.exp * 1000), actor: {
      id: 'cloudflare-access:' + hash.slice(0, 16), name: normalizeEmail(payload.email), authentication: 'cloudflare_access',
    } });
    grants.add(grant);
    return { active: true, grant };
  } catch (e) {
    if (!e.code || ['ERR_JWKS_TIMEOUT', 'ERR_JWKS_INVALID', 'ERR_JOSE_GENERIC'].includes(e.code)) return { active: true, status: 503, error: 'Cloudflare Access verification is temporarily unavailable. Your existing data is unchanged; please retry.' };
    return denied();
  }
}

export function restrictedResponse(request, access) {
  const headers = { 'Cache-Control': 'no-store, private', 'CDN-Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' };
  if (new URL(request.url).pathname.startsWith('/api/')) return new Response(JSON.stringify({ error: access.error, previewAccessRequired: true }), { status: access.status, headers: { ...headers, 'Content-Type': 'application/json' } });
  return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rise &amp; Roost · Private preview</title><body><main><h1>Private Rise &amp; Roost preview</h1><p>' + access.error + '</p></main></body></html>', { status: access.status, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
}
