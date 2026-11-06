import { api } from "./service.mjs";
import { emailConfigured } from "./orders.mjs";
import { drainNotifications } from "./notifications.mjs";
import { previewAccess, restrictedResponse } from './preview-access.mjs';
import { studioPinAccess } from './studio-pin.mjs';
import { productionFetch } from './production-runtime.mjs';
export const security = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000",
};
export default {
  async fetch(request, env, ctx) {
    // Enforce production transport before launch gates, auth, assets or storage.
    const url = new URL(request.url);
    if (env.DEPLOYMENT_ENVIRONMENT === 'production' && url.protocol === 'http:') {
      url.protocol = 'https:';
      return Response.redirect(url.href, 308);
    }
    // Reserve the disclosure endpoint instead of serving the SPA's homepage.
    // A real RFC 9116 contact file requires an owner-approved, monitored contact.
    if (url.pathname === '/.well-known/security.txt') {
      return new Response(request.method === 'HEAD' ? null : 'Security contact file is not configured.\n', {
        status: 404,
        headers: { ...security, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
    if (env.DEPLOYMENT_ENVIRONMENT === 'production') {
      const result = await productionFetch(request, env);
      const response = new Response(result.body, result);
      for (const [key, value] of Object.entries(security)) response.headers.set(key, value);
      if (/\/studio(?:\/|$)|\/orders(?:\/|$)/.test(new URL(request.url).pathname)) response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
      if (response.headers.get('Content-Type')?.includes('text/html')) response.headers.set('Cache-Control', 'no-store');
      return response;
    }
    if (env.STUDIO_MANAGEMENT_ENABLED === 'true' && env.REVIEW_BUILD !== 'true') return new Response('Production launch is blocked pending individual owner accounts and launch review.', { status: 503 });
    if (env.COMMERCE_UPDATE_ENABLED === 'true' && (env.REVIEW_BUILD !== 'true' || env.PREVIEW_DATABASE_ID !== '21352b95-d7f6-406f-8527-4b8dbcebf1bf')) return new Response('Production launch is blocked pending owner accounts and launch review.', { status: 503 });
    const pin = await studioPinAccess(request, env);
    const access = pin.active ? pin : await previewAccess(request, env);
    let response = pin.response || (!pin.active && access.active && !access.grant ? restrictedResponse(request, access) : new URL(request.url).pathname.startsWith("/api/")
      ? await api(request, env.DB, Date.now(), { customerEmailEnv: env, publicWorkspaceId: env.PUBLIC_WORKSPACE_ID, emailEnabled: emailConfigured(env), customerExperienceEnabled: env.CUSTOMER_EXPERIENCE_ENABLED === "true", reviewBuild: env.REVIEW_BUILD === "true", studioManagementEnabled: env.STUDIO_MANAGEMENT_ENABLED === "true", previewGrant: access.grant, previewPinMode: pin.active, commerceEnabled: env.COMMERCE_UPDATE_ENABLED === "true" })
      : await env.ASSETS.fetch(request));
    if (request.method === "POST" && response.ok && emailConfigured(env))
      ctx?.waitUntil(drainNotifications(env.DB, env));
    response = new Response(response.body, response);
    for (const [key, value] of Object.entries(security))
      response.headers.set(key, value);
    if (access.active) {
      response.headers.set('Cache-Control', 'no-store, private');
      response.headers.set('CDN-Cache-Control', 'no-store');
    }
    if (response.headers.get("Content-Type")?.includes("text/html"))
      response.headers.set("Cache-Control", "no-store");
    if (env.REVIEW_BUILD === "true" || /\/(orders|roost|studio)(\/|$)/.test(new URL(request.url).pathname))
      response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return response;
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(drainNotifications(env.DB, env));
  },
};
