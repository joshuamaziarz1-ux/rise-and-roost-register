// Temporary preview authorization is enforced before assets, APIs, or D1.
// CF-Connecting-IP is trusted only on an actual Cloudflare request. Never use
// forwarded/client-supplied identity headers or an application cookie here.
export const PREVIEW_HOST = 'rise-roost-experience-preview.joshua-maziarz1.workers.dev';
export const PREVIEW_DATABASE = '21352b95-d7f6-406f-8527-4b8dbcebf1bf';
export const PREVIEW_WORKSPACE = '2a7ca191c1639aaf023b02d96bcd9519fe099333302d9204';
const grants = new WeakSet();
export const isPreviewGrant = value => !!value && grants.has(value);

export function normalizeIP(value) {
  if (typeof value !== 'string' || value !== value.trim() || !value || value.length > 45) return null;
  if (value.includes(':') && /^[a-fA-F0-9:.]+$/.test(value)) {
    try { return new URL('http://[' + value + ']/').hostname.slice(1, -1).toLowerCase(); } catch { return null; }
  }
  const parts = value.split('.');
  return parts.length === 4 && parts.every(p => /^(0|[1-9]\d{0,2})$/.test(p) && +p <= 255) ? parts.join('.') : null;
}
export async function previewAccess(request, env, now = Date.now()) {
  if (!env.PREVIEW_ACCESS_MODE || env.PREVIEW_ACCESS_MODE === 'off') return { active: false };
  const unavailable = () => ({ active: true, status: 503, error: 'Private preview access is not configured. Existing data has not changed.' });
  const url = new URL(request.url);
  if (env.PREVIEW_ACCESS_MODE !== 'trusted-network' || url.protocol !== 'https:' || url.hostname !== PREVIEW_HOST || url.port ||
      env.PREVIEW_DATABASE_ID !== PREVIEW_DATABASE || env.PUBLIC_WORKSPACE_ID !== PREVIEW_WORKSPACE ||
      env.REVIEW_BUILD !== 'true' || env.STUDIO_MANAGEMENT_ENABLED !== 'true' || env.CUSTOMER_EXPERIENCE_ENABLED !== 'true' || env.ORDER_EMAIL_ENABLED !== 'false') return unavailable();
  const until = Date.parse(env.PREVIEW_ACCESS_UNTIL || '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(env.PREVIEW_ACCESS_UNTIL || '') || !Number.isFinite(until) || until > now + 31 * 86400000) return unavailable();
  const denied = () => ({ active: true, status: 403, error: 'This private preview is restricted to approved testing networks. Connect to an approved private network and reopen this page.' });
  if (until <= now) return { active: true, status: 403, error: 'Temporary preview access has expired. Ask the preview operator to renew the testing restriction.' };
  let entries;
  try { entries = JSON.parse(env.PREVIEW_TESTER_IPS || ''); } catch { return unavailable(); }
  if (!Array.isArray(entries) || !entries.length || entries.length > 32 || entries.some(ip => !normalizeIP(ip) || ['0.0.0.0', '::', '127.0.0.1', '::1'].includes(normalizeIP(ip)))) return unavailable();
  // Cloudflare supplies request.cf. HTTP headers cannot manufacture this object.
  if (!request.cf || typeof request.cf.colo !== 'string' || !request.cf.colo) return denied();
  const ip = normalizeIP(request.headers.get('CF-Connecting-IP'));
  if (!ip || !entries.map(normalizeIP).includes(ip)) return denied();
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip)))].map(v => v.toString(16).padStart(2, '0')).join('');
  const grant = Object.freeze({ workspaceId: PREVIEW_WORKSPACE, expiresAt: until, actor: { id: 'preview-network:' + hash.slice(0, 16), name: 'Approved preview tester', authentication: 'preview_network' } });
  grants.add(grant);
  return { active: true, grant };
}

export function restrictedResponse(request, access) {
  const headers = { 'Cache-Control': 'no-store, private', 'CDN-Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' };
  if (new URL(request.url).pathname.startsWith('/api/')) return new Response(JSON.stringify({ error: access.error }), { status: access.status, headers: { ...headers, 'Content-Type': 'application/json' } });
  return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rise &amp; Roost · Private preview</title><body><main><h1>Private Rise &amp; Roost preview</h1><p>' + access.error + '</p></main></body></html>', { status: access.status, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
}
