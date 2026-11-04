import { api } from './service.mjs';
import { productionConfiguration, productionOwner, productionContext } from './production-access.mjs';
import { PRODUCTION_DATABASE_ID, PRODUCTION_WORKSPACE_ID } from './production-preparation.mjs';

const response = (error, status) => new Response(JSON.stringify({ error, productionOwnerAccessRequired: status === 401 || status === 403 }), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, private', 'CDN-Cache-Control': 'no-store' } });
const publicApi = (path, method) => method === 'GET' && (['/api/site', '/api/comments', '/api/roost/me'].includes(path) || /^\/api\/assets\/[a-f0-9]{48}$/.test(path) || /^\/api\/order-tracking\/[a-f0-9]{48}\/[a-f0-9]{48}$/.test(path)) ||
  method === 'POST' && (['/api/orders', '/api/comments', '/api/roost/profile', '/api/roost/logout', '/api/roost/options', '/api/roost/verify', '/api/roost/recover', '/api/roost/claim-order'].includes(path) || /^\/api\/order-tracking\/[a-f0-9]{48}\/[a-f0-9]{48}\/(?:message|payment-method)$/.test(path));

// All production owner traffic lives below /studio, so one Access application
// protects the page AND its APIs. Unprotected legacy owner URLs are closed.
export async function productionFetch(request, env, now = Date.now()) {
  const url = new URL(request.url), alias = url.origin === 'https://www.rise-and-roost.com';
  const canonical = new URL(url); canonical.hostname = 'rise-and-roost.com';
  const config = productionConfiguration(env, alias ? new Request(canonical) : request);
  if (!config) return response('Production launch is blocked pending individual owner accounts and launch review.', 503);
  if (alias) {
    // Never accept a cross-host write or forward owner credentials/data. Public
    // navigation reaches the canonical host, where Access/JWT checks still run.
    if (!['GET', 'HEAD'].includes(request.method)) return response('Use the main Rise & Roost website before submitting changes.', 403);
    return new Response(null, { status: 308, headers: { Location: canonical.href, 'Cache-Control': 'no-store' } });
  }
  const privatePath = url.pathname === '/studio' || url.pathname.startsWith('/studio/');
  let owner;
  if (privatePath) {
    owner = await productionOwner(request, config, now);
    if (!owner.actor) return response(owner.status === 503 ? 'Owner sign-in verification is temporarily unavailable.' : 'Open Website Studio to sign in with your own owner account.', owner.status);
  }
  let path = url.pathname;
  if (path.startsWith('/studio/api/')) path = path.slice('/studio'.length);
  const ownerApi = privatePath && (path === '/api/studio' || path === '/api/studio-info' || path === '/api/upload' || path === '/api/preview' || /^\/api\/preview\/[a-f0-9]{48}$/.test(path) || path.startsWith('/api/manage/'));
  if ((path.startsWith('/api/') && !ownerApi && !publicApi(path, request.method) && !(path === '/api/studio-info' && request.method === 'GET')) ||
      /^\/(?:demo|preview)(?:\/|$)/.test(path) || path === '/studio/setup' || path === '/api/manage/import') return response('Page not found.', 404);
  const trackingWorkspace = /^\/api\/order-tracking\/([a-f0-9]{48})\//.exec(path)?.[1];
  if (trackingWorkspace && trackingWorkspace !== PRODUCTION_WORKSPACE_ID) return response('Order not found.', 404);
  try {
    const identity = await env.DB.prepare("SELECT * FROM deployment_identity WHERE id='main'").bind().first();
    if (identity?.environment !== 'production' || identity.database_id !== PRODUCTION_DATABASE_ID || identity.workspace_id !== PRODUCTION_WORKSPACE_ID) return response('The production database identity could not be verified.', 503);
    if (path === '/api/studio-info') return new Response(JSON.stringify({ productionOwnerAccess: true, studioManagementEnabled: true, mainStudioPath: '/studio' }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    if (!path.startsWith('/api/')) return await env.ASSETS.fetch(request);
    url.pathname = path;
    const rewritten = new Request(url, request);
    return await api(rewritten, env.DB, now, { publicWorkspaceId: PRODUCTION_WORKSPACE_ID, customerExperienceEnabled: true, studioManagementEnabled: true, commerceEnabled: true,
      productionContext: productionContext(owner, env.REAL_CHECKOUT_ENABLED === 'true') });
  } catch { return response('The website is temporarily unavailable. No successful save is confirmed; keep your order link and retry.', 503); }
}
