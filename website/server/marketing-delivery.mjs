import { resendMarketing, marketingConnectionReady, MarketingProviderError } from './resend-marketing.mjs';
import { authorizedTestRecipient } from './email-policy.mjs';
import { campaignPreview, marketingState } from './marketing.mjs';
const fail = message => { throw Object.assign(new Error(message), { status: 409 }); };
export function deliveryAllowed(env, kind) {
  return marketingConnectionReady(env) && (kind === 'test' ? env.MARKETING_OWNER_TEST_ENABLED === 'true' :
    env.MARKETING_CAMPAIGNS_ENABLED === 'true' && env.MARKETING_DELIVERY_VERIFIED === 'true' && env.MARKETING_DANIELLE_APPROVED === 'true');
}
export function queueMarketing({ ledger, input, path, actor, env, now, id }) {
  const m = marketingState(ledger); m.deliveries ||= [];
  if (actor.role !== 'owner') fail('Only an owner can review or send Marketing.');
  if (path === '/api/manage/marketing-sync') {
    if (!marketingConnectionReady(env)) fail('Marketing connection is not activated.');
    m.syncRequested = true;
    return { description: 'Marketing synchronization requested', result: {} };
  }
  if (path === '/api/manage/marketing-review') {
    const kind = input.kind === 'test' ? 'test' : 'campaign';
    if (!deliveryAllowed(env, kind)) fail('Marketing delivery is not activated for this audience.');
    if (!m.address?.trim()) fail('Save the accurate physical mailing address first.');
    const c = m.campaigns.find(c => c.id === input.campaignId);
    if (!c || c.status !== 'draft') fail('Choose a saved campaign draft.');
    if (m.deliveries.length >= 100) fail('Marketing delivery history is full. Ask the operator to expand storage.');
    if (m.deliveries.some(d => d.campaignId === c.id && ['queued-review', 'preparing', 'assembling', 'queued-send', 'checking', 'sending', 'unknown'].includes(d.status))) fail('This campaign already has an active delivery. Review its history first.');
    const recipients = m.contacts.filter(c => c.status === 'confirmed' && c.confirmedAt && c.consentAt &&
      (kind !== 'test' || c.email === input.recipient?.toLowerCase() && authorizedTestRecipient(env, c.email))).map(c => c.email).sort();
    if (!recipients.length || kind === 'test' && recipients.length !== 1) fail('The audience needs confirmed, explicitly opted-in subscribers. Owner tests require one configured owner.');
    const deliveryId = id();
    m.deliveries.unshift({ id: deliveryId, campaignId: c.id, kind, status: 'queued-review', campaign: structuredClone(c), address: m.address,
      recipients, createdAt: new Date(now).toISOString(), requestedBy: actor.email || actor.name });
    return { description: 'Marketing audience review queued; no email sent', result: { deliveryId } };
  }
  const d = m.deliveries.find(d => d.id === input.deliveryId);
  if (!d) fail('Choose a reviewed delivery.');
  if (path === '/api/manage/marketing-results') {
    if (!marketingConnectionReady(env)) fail('Marketing connection is not activated.');
    if (!d.broadcastId) fail('No provider broadcast exists yet.');
    d.resultsRequested = true; d.resultsRevision = (d.resultsRevision || 0) + 1;
    return { description: 'Provider results refresh requested', result: { deliveryId: d.id } };
  }
  if (!deliveryAllowed(env, d.kind)) fail('Marketing delivery is not activated for this audience.');
  if (path !== '/api/manage/marketing-send' && path !== '/api/manage/marketing-test') fail('Marketing action not found.');
  if ((path.endsWith('-test') ? 'test' : 'campaign') !== d.kind || d.status !== 'reviewed' || input.confirmed !== true || input.reviewToken !== d.reviewToken)
    fail('Review the final audience and explicitly confirm this exact delivery.');
  if (now - Date.parse(d.reviewedAt) > 15 * 60000) fail('The audience review expired. Prepare a new review.');
  const c = m.campaigns.find(c => c.id === d.campaignId);
  if (JSON.stringify(c) !== JSON.stringify(d.campaign) || m.address !== d.address) fail('The draft or address changed. Prepare a new review.');
  if (d.recipients.some(email => !m.contacts.some(c => c.email === email && c.status === 'confirmed'))) fail('A subscriber changed. Prepare a new audience review.');
  if (d.kind === 'campaign' && m.deliveries.some(v => v.id !== d.id && v.campaignId === d.campaignId && ['queued-send', 'checking', 'sending', 'accepted', 'sent', 'unknown'].includes(v.status))) fail('This campaign was already submitted. Check its history.');
  d.status = 'queued-send'; d.confirmedAt = new Date(now).toISOString(); d.confirmedBy = actor.email || actor.name;
  return { description: 'Explicitly confirmed Marketing delivery queued', result: { deliveryId: d.id } };
}

async function read(db, workspace) {
  const row = await db.prepare('SELECT ledger_json,ledger_version FROM workspaces WHERE id=?').bind(workspace).first();
  if (!row) throw new MarketingProviderError('workspace_missing');
  return { ...row, ledger: JSON.parse(row.ledger_json) };
}
async function update(db, workspace, change) {
  for (let n = 0; n < 6; n++) {
    const row = await read(db, workspace); change(marketingState(row.ledger));
    const serialized = JSON.stringify(row.ledger);
    if (new TextEncoder().encode(serialized).length > 1200000) throw new MarketingProviderError('marketing_storage_full');
    const r = await db.prepare('UPDATE workspaces SET ledger_json=?,ledger_version=ledger_version+1 WHERE id=? AND ledger_version=?').bind(serialized, workspace, row.ledger_version).run();
    if (r.meta.changes === 1) return;
  }
  throw new MarketingProviderError('marketing_save_conflict');
}
const errorCode = e => e instanceof MarketingProviderError ? e.code : 'marketing_processing_failed';

export async function syncMarketing(db, env, provider, now, contactId) {
  const w = env.PUBLIC_WORKSPACE_ID, at = new Date(now).toISOString();
  await provider.verify();
  const remote = await provider.list('/contacts');
  let changed=0, remaining=false;
  for (const saved of marketingState((await read(db, w)).ledger).contacts) {
    if (contactId && saved.id !== contactId) continue;
    if (!['confirmed', 'unsubscribed'].includes(saved.status)) continue;
    try {
      let c = remote.find(c => c.email?.toLowerCase() === saved.email);
      if (c && typeof c.unsubscribed !== 'boolean') throw new MarketingProviderError('provider_subscription_invalid');
      if (c && c.unsubscribed === (saved.status === 'unsubscribed') && saved.providerId === c.id && saved.providerStatus === saved.status && !saved.syncError && saved.syncedAt) continue;
      if (!c && saved.status === 'unsubscribed' && saved.syncedAt && !saved.syncError) continue;
      if (!contactId && changed >= 2) {remaining=true;continue;}
      changed++;
      if (c?.unsubscribed === true) {
        await update(db, w, m => { const local = m.contacts.find(c => c.id === saved.id); if (local) { local.status = 'unsubscribed'; local.unsubscribedAt ||= at; local.providerStatus = 'unsubscribed'; local.providerId = c.id; local.syncedAt = at; delete local.syncError; } });
        continue;
      }
      const local = marketingState((await read(db, w)).ledger).contacts.find(c => c.id === saved.id);
      if (!local) continue;
      if (local.status === 'unsubscribed') {
        if (c) await provider.request('/contacts/' + encodeURIComponent(c.id), 'PATCH', { unsubscribed: true });
      } else if (local.status === 'confirmed' && local.confirmedAt && local.consentAt) {
        if (!c) {
          await provider.capacity(1);
          c = await provider.request('/contacts', 'POST', { email: local.email, unsubscribed: false });
          if (!c.id) throw new MarketingProviderError('provider_contact_invalid');
          remote.push({ ...c, email: local.email, unsubscribed: false });
        }
      } else continue;
      // Recheck local suppression after the provider write; never reactivate remotely.
      const latest = marketingState((await read(db, w)).ledger).contacts.find(c => c.id === saved.id);
      if (c && latest?.status === 'unsubscribed') await provider.request('/contacts/' + encodeURIComponent(c.id), 'PATCH', { unsubscribed: true });
      await update(db, w, m => { const local = m.contacts.find(c => c.id === saved.id); if (local) { local.providerId = c?.id; local.providerStatus = local.status; local.syncedAt = at; delete local.syncError; } });
    } catch (e) {
      await update(db, w, m => { const c = m.contacts.find(c => c.id === saved.id); if (c) c.syncError = errorCode(e); });
      throw e;
    }
  }
  await update(db, w, m => { if (!contactId) m.syncRequested = remaining; m.syncedAt = at; delete m.syncError; });
  return !remaining;
}
export async function syncOneMarketingContact(db, env, contactId, now, fetcher = fetch) {
  if (!marketingConnectionReady(env)) return;
  try { await syncMarketing(db, env, resendMarketing(env, fetcher), now, contactId); }
  catch (e) { await update(db, env.PUBLIC_WORKSPACE_ID, m => { m.syncRequested = true; m.syncError = errorCode(e); const c = m.contacts.find(c => c.id === contactId); if(c) c.syncError = errorCode(e); }); }
}

// Durable one-shot claims deliberately survive crashes. An uncertain send is
// reconciled by broadcast ID, never blindly retried or replaced by a new send.
export async function drainMarketing(db, env, now = Date.now(), fetcher = fetch, interval = 550) {
  if (!marketingConnectionReady(env)) return;
  const w = env.PUBLIC_WORKSPACE_ID, provider = resendMarketing(env, fetcher, interval);
  const row = await read(db, w), m = marketingState(row.ledger);
  const d = m.deliveries?.find(d => ['queued-review', 'assembling', 'queued-send'].includes(d.status) || d.resultsRequested);
  if (!d) {
    if (m.syncRequested || m.contacts.some(c => ['confirmed', 'unsubscribed'].includes(c.status) && (!c.syncedAt || c.syncError || Date.parse(c.syncedAt) < now - 3600000))) {
      try { await syncMarketing(db, env, provider, now); } catch (e) { await update(db, w, m => { m.syncError = errorCode(e); }); }
    }
    return;
  }
  if (!d.resultsRequested && !deliveryAllowed(env, d.kind)) return;
  if (!d.resultsRequested && d.status !== 'assembling') {
    try { if (!await syncMarketing(db, env, provider, now)) return; }
    catch (e) { await update(db,w,m=>{m.syncError=errorCode(e);}); return; }
  }
  const phase = d.status === 'assembling' ? 'assemble-' + (d.added || 0) : d.resultsRequested ? 'results-' + (d.resultsRevision || 0) : d.status;
  const claim = await db.prepare('INSERT INTO limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO NOTHING').bind('marketing-job:' + w + ':' + d.id + ':' + phase, now + 315360000000).run();
  if (claim.meta.changes !== 1) return;
  const save = change => update(db, w, m => { const job = m.deliveries.find(v => v.id === d.id); change(job, m); });
  let sending = false;
  try {
    if (d.resultsRequested) {
      const result = await provider.request('/broadcasts/' + encodeURIComponent(d.broadcastId));
      const events = {};
      for (const type of ['sent','delivered','bounced','complained','unsubscribed','suppressed']) {
        const recipients = await provider.list('/broadcasts/' + encodeURIComponent(d.broadcastId) + '/recipients?type=' + type);
        events[type] = recipients.map(r => ({ email: r.email, id: r.id }));
      }
      await save((job,m) => { job.providerStatus = result.status; job.providerResults = events; job.resultsRequested = false; delete job.resultsError; job.resultsAt = new Date(now).toISOString(); if (result.status === 'sent') job.status = 'sent';
        for (const type of ['bounced','complained','unsubscribed','suppressed']) for (const r of events[type]) { const c = m.contacts.find(c => c.email === r.email?.toLowerCase()); if (c) { c.status = 'unsubscribed'; c.providerStatus = type; c.unsubscribedAt ||= new Date(now).toISOString(); delete c.syncedAt; m.syncRequested = true; } }
      });
      return;
    }
    if(d.status !== 'assembling') await save(job => { job.status = d.status === 'queued-review' ? 'preparing' : 'checking'; });
    const latest = marketingState((await read(db, w)).ledger);
    const eligible = latest.contacts.filter(c => c.status === 'confirmed' && c.providerId && !c.syncError && c.confirmedAt && c.consentAt &&
      (d.kind !== 'test' || authorizedTestRecipient(env, c.email))).map(c => c.email);
    if (d.recipients.some(email => !eligible.includes(email))) throw new MarketingProviderError('audience_changed_review_again');
    if (d.status === 'queued-review') {
      await provider.capacity(0, true);
      const segment = await provider.request('/segments', 'POST', { name: 'Rise & Roost ' + d.kind + ' ' + d.id });
      if (!segment.id) throw new MarketingProviderError('provider_segment_invalid');
      await save(job => { job.segmentId = segment.id; job.added = 0; job.status = 'assembling'; });
      return;
    }
    if (d.status === 'assembling') {
      for (const email of d.recipients.slice(d.added || 0, (d.added || 0) + 4)) {
        const c = latest.contacts.find(c => c.email === email);
        await provider.request('/contacts/' + encodeURIComponent(c.providerId) + '/segments/' + encodeURIComponent(d.segmentId), 'POST');
      }
      const added = Math.min(d.recipients.length, (d.added || 0) + 4);
      if (added < d.recipients.length) { await save(job => { job.added = added; }); return; }
      const audience = await provider.list('/segments/' + encodeURIComponent(d.segmentId) + '/contacts');
      checkAudience(audience, d.recipients);
      const preview = campaignPreview(d.campaign, d.address, '{{{RESEND_UNSUBSCRIBE_URL}}}');
      const broadcast = await provider.request('/broadcasts', 'POST', { ...preview, segment_id: d.segmentId, name: 'Rise & Roost ' + d.kind + ' ' + d.id, send: false });
      if (!broadcast.id) throw new MarketingProviderError('provider_broadcast_invalid');
      await save(job => { job.broadcastId = broadcast.id; job.status = 'reviewed'; job.reviewedAt = new Date(now).toISOString(); job.reviewToken = crypto.randomUUID(); job.capacity = { contacts: latest.contacts.filter(c => c.status === 'confirmed').length }; });
      return;
    }
    await provider.verify();
    const audience = await provider.list('/segments/' + encodeURIComponent(d.segmentId) + '/contacts');
    checkAudience(audience, d.recipients);
    const broadcast = await provider.request('/broadcasts/' + encodeURIComponent(d.broadcastId));
    const expected = campaignPreview(d.campaign, d.address, '{{{RESEND_UNSUBSCRIBE_URL}}}');
    if (broadcast.status !== 'draft') {
      await save((job,m) => { job.status = broadcast.status === 'sent' ? 'sent' : 'unknown'; job.providerStatus = broadcast.status; job.error = 'provider_broadcast_already_submitted'; if(job.kind === 'campaign') m.campaigns.find(c => c.id === job.campaignId).status = 'submitted'; });
      return;
    }
    if (broadcast.segment_id !== d.segmentId || broadcast.subject !== expected.subject || broadcast.from !== expected.from || broadcast.html !== expected.html || broadcast.text !== expected.text)
      throw new MarketingProviderError('provider_draft_changed_review_again');
    // A compare-and-swap save rechecks local consent immediately before sending.
    await save((job, m) => {
      if (m.address !== d.address || JSON.stringify(m.campaigns.find(c => c.id === d.campaignId)) !== JSON.stringify(d.campaign) || d.recipients.some(email => !m.contacts.some(c => c.email === email && c.status === 'confirmed'))) throw new MarketingProviderError('audience_changed_review_again');
      job.status = 'sending'; job.attemptedAt = new Date(now).toISOString();
    });
    sending = true;
    await provider.request('/broadcasts/' + encodeURIComponent(d.broadcastId) + '/send', 'POST', {});
    await save((job, m) => { job.status = 'accepted'; job.providerStatus = 'accepted'; job.acceptedAt = new Date(now).toISOString(); if (job.kind === 'campaign') m.campaigns.find(c => c.id === job.campaignId).status = 'submitted'; });
  } catch (e) {
    await save(job => { if (d.resultsRequested) { job.resultsRequested = false; job.resultsError = errorCode(e); } else { job.status = sending ? 'unknown' : 'failed'; job.error = errorCode(e); job.failedAt = new Date(now).toISOString(); } });
  }
}
function checkAudience(contacts, expected) {
  const actual = contacts.filter(c => c.unsubscribed === false).map(c => c.email?.toLowerCase()).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) throw new MarketingProviderError('provider_audience_mismatch');
}
