import { api } from "./service.mjs";
import { emailConfigured } from "./orders.mjs";
import { drainNotifications } from "./notifications.mjs";
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
    let response = new URL(request.url).pathname.startsWith("/api/")
      ? await api(request, env.DB, Date.now(), { publicWorkspaceId: env.PUBLIC_WORKSPACE_ID, emailEnabled: emailConfigured(env), customerExperienceEnabled: env.CUSTOMER_EXPERIENCE_ENABLED === "true", reviewBuild: env.REVIEW_BUILD === "true" })
      : await env.ASSETS.fetch(request);
    if (request.method === "POST" && response.ok && emailConfigured(env))
      ctx?.waitUntil(drainNotifications(env.DB, env));
    response = new Response(response.body, response);
    for (const [key, value] of Object.entries(security))
      response.headers.set(key, value);
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
