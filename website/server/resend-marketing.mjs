// Marketing uses a separate credential and only Contacts/Segments/Broadcasts.
// No promotional payload can reach the transactional /emails endpoint.
export class MarketingProviderError extends Error {
  constructor(code, status = 503) { super(code); this.code = code; this.status = status; }
}
export function marketingConnectionReady(env) {
  return !!env.RESEND_MARKETING_API_KEY && env.MARKETING_PROVIDER_VERIFIED === 'true' && env.MARKETING_FREE_PLAN_CONFIRMED === 'true';
}
export function resendMarketing(env, fetcher = fetch, interval = 550) {
  if (!env.RESEND_MARKETING_API_KEY) throw new MarketingProviderError('marketing_credential_missing');
  let lastRequest = 0;
  async function request(path, method = 'GET', body) {
    if (!/^\/(?:usage|domains|contacts|segments|broadcasts)(?:[/?]|$)/.test(path)) throw new MarketingProviderError('unsupported_marketing_endpoint');
    let r;
    try {
      const wait = interval - (Date.now() - lastRequest);
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
      lastRequest = Date.now();
      r = await fetcher('https://api.resend.com' + path, { method, redirect: 'manual', signal: AbortSignal.timeout(15000),
        headers: { Authorization: 'Bearer ' + env.RESEND_MARKETING_API_KEY, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch { throw new MarketingProviderError('provider_connection_uncertain'); }
    if (!r.ok) throw new MarketingProviderError('provider_http_' + r.status, r.status);
    try { return await r.json(); } catch { throw new MarketingProviderError('provider_response_invalid'); }
  }
  async function list(path, maximum = 1000) {
    const result = []; let after;
    for (let page = 0; page < 12; page++) {
      const r = await request(path + (path.includes('?') ? '&' : '?') + 'limit=100' + (after ? '&after=' + encodeURIComponent(after) : ''));
      if (!Array.isArray(r.data)) throw new MarketingProviderError('provider_list_invalid');
      result.push(...r.data);
      if (result.length > maximum) throw new MarketingProviderError('provider_capacity_exceeded');
      if (r.has_more === false) return result;
      if (r.has_more !== true || !r.data.length || r.data.at(-1).id === after) throw new MarketingProviderError('provider_pagination_invalid');
      after = r.data.at(-1).id;
    }
    throw new MarketingProviderError('provider_pagination_incomplete');
  }
  async function capacity(additional = 0, segment = false) {
    const usage = await request('/usage');
    const c = usage.contacts, s = usage.segments;
    // An unrecognised, paid, or exhausted allowance requires operator review.
    if (!Number.isInteger(c?.used) || c.used < 0 || !Number.isInteger(c?.limit) || c.limit < 1 || c.limit > 1000 || c.used + additional > c.limit)
      throw new MarketingProviderError('marketing_contact_capacity_unverified');
    if (segment && (!Number.isInteger(s?.used) || s.used < 0 || !Number.isInteger(s?.limit) || s.limit < 1 || s.used >= s.limit))
      throw new MarketingProviderError('marketing_segment_capacity_unverified');
    return { contacts: { used: c.used, limit: c.limit }, segments: { used: s?.used, limit: s?.limit } };
  }
  async function verify() {
    const usage = await capacity(), domains = await list('/domains', 100);
    if (!domains.some(d => d.name === 'rise-and-roost.com' && d.status === 'verified')) throw new MarketingProviderError('sending_domain_not_verified');
    // Read probes verify actual permissions; flags alone are insufficient.
    await list('/segments', 100); await list('/broadcasts', 100);
    return usage;
  }
  return { request, list, capacity, verify };
}
