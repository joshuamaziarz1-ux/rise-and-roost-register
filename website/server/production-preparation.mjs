import { calendarConfig, defaultCalendar, paymentDestination, providers } from '../public/commerce.mjs';

export const PRODUCTION_DATABASE_ID = '889a4b96-cabd-43d1-ad45-79f65b0052b0';
export const PRODUCTION_WORKSPACE_ID = '5c6b64c991570cc03df650282e1a5a90bf72283c1de5f542';
const encoder = new TextEncoder();
const digest = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))].map(b => b.toString(16).padStart(2, '0')).join('');

// Produces a private REVIEW artifact only. It has no database or network writer.
export async function reviewBusinessInitialization(source, assets = []) {
  if (!source?.id || source.id === PRODUCTION_WORKSPACE_ID || typeof source.published_json !== 'string') throw new Error('Choose the approved source workspace, not the production target.');
  const document = JSON.parse(source.published_json);
  const allowed = ['business', 'theme', 'ui', 'pages', 'products', 'pickups', 'orderingPaused', 'customCSS'];
  if (Object.keys(document).some(key => !allowed.includes(key)) || !Array.isArray(document.products) || !Array.isArray(document.pickups) || !Array.isArray(document.pages) || !document.business || !document.theme || !document.ui) throw new Error('Review the published document structure before initialization.');
  const serialized = JSON.stringify(document);
  if (/https?:\/\/[^"\s]*workers\.dev|https?:\/\/[^"\s]*\/api\/assets\/|\/api\/preview\//i.test(serialized)) throw new Error('Review environment-specific media and preview links before initialization.');
  const references = [...new Set([...serialized.matchAll(/\/api\/assets\/([a-f0-9]{48})/g)].map(m => m[1]))];
  const remap = new Map(), copiedAssets = [];
  for (const id of references) {
    const asset = assets.find(a => a.id === id && a.workspace_id === source.id);
    if (!asset || !['image/jpeg', 'image/png', 'image/webp'].includes(asset.mime) || !/^(?:[a-f0-9]{2})+$/i.test(asset.bytes_hex || '')) throw new Error('A referenced source photo is missing or belongs to another workspace.');
    const newId = (await digest(PRODUCTION_DATABASE_ID + ':' + id)).slice(0, 48); remap.set(id, newId);
    copiedAssets.push({ id: newId, workspace_id: PRODUCTION_WORKSPACE_ID, mime: asset.mime, bytes_hex: asset.bytes_hex });
  }
  const targetDocument = JSON.parse(serialized.replace(/\/api\/assets\/([a-f0-9]{48})/g, (_, id) => '/api/assets/' + remap.get(id)));
  targetDocument.orderingPaused = true;
  const sourceLedger = JSON.parse(source.ledger_json || '{"orders":[]}'), settings = sourceLedger.management?.settings || {}, payments = {};
  for (const [provider, destination] of Object.entries(settings.payments || {})) {
    if (!Object.hasOwn(providers, provider)) throw new Error('Review unsupported saved payment settings.');
    if (!destination?.url) continue;
    if (destination.businessConfirmed !== true) throw new Error('Business approval is required before preserving a payment destination.');
    payments[provider] = { url: paymentDestination(provider, destination.url), enabled: false, businessConfirmed: true };
  }
  return {
    status: 'REVIEW ONLY — not applied', databaseId: PRODUCTION_DATABASE_ID, workspaceId: PRODUCTION_WORKSPACE_ID,
    published: targetDocument, assets: copiedAssets,
    ledger: { orders: [], management: { settings: { calendar: calendarConfig(settings.calendar || defaultCalendar()), payments, paymentsVersion: 0 }, audit: [], operations: [], benefits: [] } },
    reviewRequired: { approvedPublishedContent: true, physicalStockAndProductionCapacity: true, futurePickupWindows: true, businessDays: true, customerRecordClassification: true, individualOwnerAuthentication: true, paymentDestinationsInProduction: true },
    sourceHasCustomerActivity: Number(source.order_count) > 0 || !!sourceLedger.orders?.length,
    sourceDraftNotCopied: source.draft_json !== source.published_json,
    excluded: ['orders', 'customers', 'members', 'messages', 'payment verifications', 'sales', 'refunds', 'disputes', 'sessions', 'owner hashes', 'PINs', 'old revision/operation history', 'payment test certificates'],
  };
}
