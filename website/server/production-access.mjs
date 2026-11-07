import { createRemoteJWKSet, jwtVerify, customFetch } from 'jose';
import { PRODUCTION_DATABASE_ID, PRODUCTION_WORKSPACE_ID } from './production-preparation.mjs';

const contexts = new WeakSet(), resolvers = new Map();
// Match the existing Studio Access application's 730h session ceiling.
const accessSessionSeconds = 730 * 3600;
export const isProductionContext = value => !!value && contexts.has(value);
const validEmail = value => typeof value === 'string' && value.length <= 254 && /^[^\s@*]+@[^\s@*.]+(?:\.[^\s@*.]+)+$/.test(value);
export function productionConfiguration(env, request) {
  const url = new URL(request.url);
  if (env.DEPLOYMENT_ENVIRONMENT !== 'production' || env.REVIEW_BUILD !== 'false' || env.PRODUCTION_RELEASE_APPROVED !== 'true' ||
      env.PRODUCTION_DATABASE_ID !== PRODUCTION_DATABASE_ID || env.PUBLIC_WORKSPACE_ID !== PRODUCTION_WORKSPACE_ID ||
      env.WEBSITE_BASE_URL !== 'https://rise-and-roost.com' || url.origin !== env.WEBSITE_BASE_URL ||
      env.STUDIO_MANAGEMENT_ENABLED !== 'true' || env.COMMERCE_UPDATE_ENABLED !== 'true' || env.CUSTOMER_EXPERIENCE_ENABLED !== 'true' ||
      Object.keys(env).some(key => /^(?:PREVIEW_|STUDIO_PIN_)/.test(key))) return null;
  try {
    const issuer = new URL(env.PRODUCTION_ACCESS_TEAM_DOMAIN), owners = JSON.parse(env.PRODUCTION_OWNERS || '');
    if (issuer.protocol !== 'https:' || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/.test(issuer.hostname) || issuer.port || issuer.username || issuer.password || issuer.pathname !== '/' || issuer.search || issuer.hash ||
        !/^[a-f0-9]{64}$/.test(env.PRODUCTION_ACCESS_AUD || '') || !Array.isArray(owners) || !owners.length || owners.length > 10 ||
        owners.some(o => !validEmail(o.email) || typeof o.name !== 'string' || !o.name.trim() || o.name.length > 80 || o.role !== 'owner') ||
        new Set(owners.map(o => o.email.toLowerCase())).size !== owners.length) return null;
    return { issuer: issuer.origin, audience: env.PRODUCTION_ACCESS_AUD, owners };
  } catch { return null; }
}
function keys(issuer) {
  if (!resolvers.has(issuer)) {
    if (resolvers.size >= 8) resolvers.delete(resolvers.keys().next().value);
    resolvers.set(issuer, createRemoteJWKSet(new URL(issuer + '/cdn-cgi/access/certs'), { timeoutDuration: 5000, cacheMaxAge: 300000, cooldownDuration: 10000,
      // Workers supports manual redirects; JOSE rejects every non-200 response.
      [customFetch]: (url, init) => fetch(url, { ...init, redirect: 'manual' }) }));
  }
  return resolvers.get(issuer);
}
export async function productionOwner(request, config, now = Date.now()) {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || token.length > 16384) return { status: 401 };
  try {
    const { payload } = await jwtVerify(token, keys(config.issuer), { algorithms: ['RS256'], issuer: config.issuer, audience: config.audience,
      // Access sets each signed expiry; retain an age ceiling matching the
      // existing application rather than rejecting its fresh 730h sessions.
      requiredClaims: ['exp', 'iat', 'sub', 'email', 'type'], maxTokenAge: accessSessionSeconds, currentDate: new Date(now), clockTolerance: 5 });
    const owner = validEmail(payload.email) && config.owners.find(o => o.email.toLowerCase() === payload.email.toLowerCase());
    if (payload.type !== 'app' || !validEmail(payload.email) || !owner || typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255 ||
        !Number.isSafeInteger(payload.exp) || !Number.isSafeInteger(payload.iat) || payload.exp * 1000 <= now || payload.iat * 1000 > now + 5000 || payload.exp <= payload.iat || payload.exp - payload.iat > accessSessionSeconds) return { status: 403 };
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(config.issuer + ':' + payload.sub)))].map(v => v.toString(16).padStart(2, '0')).join('');
    return { actor: Object.freeze({ id: 'production-owner:' + digest, name: owner.name.trim(), email: owner.email.toLowerCase(), authentication: 'cloudflare_access', role: 'owner' }), expiresAt: payload.exp * 1000 };
  } catch (e) {
    return { status: !e.code || ['ERR_JWKS_TIMEOUT', 'ERR_JWKS_INVALID', 'ERR_JOSE_GENERIC'].includes(e.code) ? 503 : 403 };
  }
}
export function productionContext(owner, checkoutEnabled) {
  const context = Object.freeze({ workspaceId: PRODUCTION_WORKSPACE_ID, owner, checkoutEnabled });
  contexts.add(context);
  return context;
}
