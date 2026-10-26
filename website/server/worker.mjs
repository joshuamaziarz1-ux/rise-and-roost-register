import { api } from "./service.mjs";
export const security = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000",
};
export default {
  async fetch(request, env) {
    let response = new URL(request.url).pathname.startsWith("/api/")
      ? await api(request, env.DB)
      : await env.ASSETS.fetch(request);
    response = new Response(response.body, response);
    for (const [key, value] of Object.entries(security))
      response.headers.set(key, value);
    if (response.headers.get("Content-Type")?.includes("text/html"))
      response.headers.set("Cache-Control", "no-store");
    return response;
  },
};
