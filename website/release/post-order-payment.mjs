// Narrow release transform: the active production bundle contains later account,
// policy, email and pickup fixes absent from the historical repository branch.
// Require its exact digest; retain every unrelated byte and original asset binding.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
export const baselineSHA256 = '127cfe8d792deecbf06d2923071ac2a514eadd7dda987731aa9f1567122a2e27';
export async function buildPostOrderPayment(baseline) {
  if (createHash('sha256').update(baseline).digest('hex') !== baselineSHA256) throw Error('Production baseline changed; review the new release first.');
  let source = String(baseline);
  const replace = (before, after) => {
    if (source.split(before).length !== 2) throw Error('Expected one matching production section.');
    source = source.replace(before, after);
  };
  const start = source.indexOf('        let selectedPaymentMethod;\n');
  const end = source.indexOf('        const order = {', start);
  if (start < 0 || end < 0) throw Error('Order creation section missing.');
  replace(source.slice(start, end), '        // Payment selection belongs to the saved order, never order submission.\n');
  replace('          ...selectedPaymentMethod ? { selectedPaymentMethod } : {},\n', '');
  replace('          else if (selectedPaymentMethod === CASH_METHOD) order.paymentStatus = "awaiting_cash";\n', '');
  const trackingStart = source.indexOf('          if (order.selectedPaymentMethod === CASH_METHOD) fail8("Contact Danielle');
  const trackingEnd = source.indexOf('        } else if (tracking[3] === "/message")', trackingStart);
  if (trackingStart < 0 || trackingEnd < 0) throw Error('Private payment endpoint missing.');
  replace(source.slice(trackingStart, trackingEnd), `          if (order.total === 0 || order.paymentVerifiedAt || order.paidReceipt || order.status === "canceled" || order.resolution) fail8("This order no longer needs payment.", 409);
          if (input.method !== CASH_METHOD && (!Object.hasOwn(providers, input.method) || !configuredPayments(ledger.management?.settings)[input.method])) fail8("This business payment destination is not configured. Contact Danielle.");
          if (order.selectedPaymentMethod === input.method) return json(customerOrder(order, row.id, ledger.management?.settings, now));
          order.selectedPaymentMethod = input.method;
          order.paymentStatus = input.method === CASH_METHOD ? "awaiting_cash" : "not_collected";
          order.audit.push({ action: "Customer selected " + (input.method === CASH_METHOD ? "Cash at Pickup" : providers[input.method]) + "; payment remains unverified", at: new Date(now).toISOString() });
`);
  // Intercept only these three public modules before the previous inline assets.
  const overrides = {};
  for (const name of ['app.mjs', 'tracking.mjs', 'payment-selection.mjs']) overrides['/' + name] = await readFile(new URL('../public/' + name, import.meta.url), 'utf8');
  replace('    if (["GET", "HEAD"].includes(request.method) && path === "/commerce.mjs")',
    `    if (["GET", "HEAD"].includes(request.method) && Object.hasOwn(postOrderAssets, path)) return new Response(request.method === "HEAD" ? null : postOrderAssets[path], { headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store", "CDN-Cache-Control": "no-store" } });\n    if (["GET", "HEAD"].includes(request.method) && path === "/commerce.mjs")`);
  source += '\nconst postOrderAssets = ' + JSON.stringify(overrides) + ';\n';
  return source;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [baseline, target] = process.argv.slice(2);
  if (!baseline || !target) throw Error('Usage: node release/post-order-payment.mjs baseline.js candidate.mjs');
  await writeFile(target, await buildPostOrderPayment(await readFile(baseline)));
}
