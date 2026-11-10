import { pickupRequest } from './pickup-request.mjs';
import { confirmationTools } from './order-confirmation.mjs?v=no-refund-20261109';
import { pickupNotice } from './pickup-notice.mjs';
import { requestedPickupLabel, POLICY_TITLE, POLICY } from './commerce.mjs?v=no-refund-20261109';
import { h, button, guard, field } from "./dom.mjs";
import { money, pickupLabel, orderByLabel, customerTime, customerTimestamp, seed } from "./model.mjs";
import { paymentLabels, fulfillmentLabels, stages, notificationLabels, eventLabels } from "./orders.mjs";
import { pickupLocation } from "./pickup-location.mjs";
import { paymentSelection } from './payment-selection.mjs?v=post-order-20261110';

export async function start(root) {
  const match = /^\/orders\/([a-f0-9]{48})\/([a-f0-9]{48})\/?$/.exec(location.pathname);
  const key = new URLSearchParams(location.hash.slice(1)).get("access");
  const endpoint = match && `/api/order-tracking/${match[1]}/${match[2]}`;
  let order, busy = false, error = "", refreshed = "", refreshSequence = 0, appliedSequence = 0;
  let doc = seed();
  const emptyDraft = () => ({ body: '', topic: 'pickup', requestedDate: '', requestedTime: '', website: '' });
  let messaging = false, draft = emptyDraft(), messageId = crypto.randomUUID(), pendingMessage = null, recoveryUnavailable = false;
  // Bind ephemeral recovery to this exact order capability; never store the key.
  const capabilityHash = key ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)))].map(v => v.toString(16).padStart(2,'0')).join('') : '';
  const draftKey = endpoint && capabilityHash ? 'rr-order-message:' + endpoint + ':' + capabilityHash : '';
  const validDraft = value => value && typeof value.body === 'string' && value.body.length <= 2000 && ['pickup','order'].includes(value.topic) && typeof value.requestedDate === 'string' && value.requestedDate.length <= 10 && typeof value.requestedTime === 'string' && value.requestedTime.length <= 5;
  try {
    const raw = draftKey && sessionStorage.getItem(draftKey), saved = raw && raw.length <= 8000 && JSON.parse(raw);
    if (validDraft(saved?.draft) && /^[a-f0-9-]{32,48}$/.test(saved.messageId || '')) {
      draft = { ...emptyDraft(), ...saved.draft, website: '' }; messageId = saved.messageId;
      if (validDraft(saved.pending) && saved.pending.requestId === messageId) pendingMessage = { ...draft, ...saved.pending, website: '' };
      messaging = !!saved.open || !!pendingMessage;
    }
  } catch { recoveryUnavailable = true; }
  const rememberMessage = () => {
    if (!draftKey) return;
    try {
      if (draft.body || draft.requestedDate || draft.requestedTime || pendingMessage) sessionStorage.setItem(draftKey, JSON.stringify({ draft, messageId, pending: pendingMessage, open: messaging }));
      else sessionStorage.removeItem(draftKey);
      recoveryUnavailable = false;
    } catch { recoveryUnavailable = true; }
    const note = root.querySelector('#contact-recovery-note'); if (note) note.hidden = !recoveryUnavailable;
  };
  const changeDraft = (name, value) => { draft[name] = value; rememberMessage(); };
  let experience = false, productionMode = false, primarySite = false, paymentMethodPending = false;
  const robots = h("meta", { name: "robots", content: "noindex,nofollow,noarchive" });
  document.head.append(robots);
  document.head.append(h("link", { rel: "stylesheet", href: "/tracking.css" }));
  async function call(action = '', body, options = {}) {
    if (!endpoint || !/^[a-f0-9]{48}$/.test(key || '')) throw new Error('Open the complete private tracking link from your order confirmation, including the part after #.');
    const response = await fetch(endpoint + action, { method: body ? 'POST' : 'GET', cache: 'no-store', ...options,
      headers: { Authorization: 'Bearer ' + key, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json().catch(() => ({ error: 'Your order status is temporarily unavailable. Please retry.' }));
    if (!response.ok || result?.error) throw Object.assign(new Error(result?.error || 'Unable to save. Please retry.'), { status: response.ok ? 0 : response.status });
    if (result?.id !== match[2] || !Number.isSafeInteger(result.version) || result.version < 1) throw new Error('The server did not confirm this order. Please retry.');
    if (action === '/message') {
      const confirmation = result.messageConfirmation;
      if (confirmation?.requestId !== body.requestId || !Array.isArray(result.messages) || !result.messages.some(m => m.id === confirmation.messageId && m.sender === 'customer' && m.body === body.body.trim() && (m.topic || '') === (body.topic || '') && (m.requestedDate || '') === (body.requestedDate || '') && (m.requestedTime || '') === (body.requestedTime || ''))) throw new Error('The server did not confirm this message. Your draft is kept; please retry.');
      delete result.messageConfirmation;
    }
    return result;
  }
  async function save(action, payload) {
    if (busy) return false;
    busy = true; error = ''; render();
    try { const result = await call(action,payload); if (!order || result.version >= order.version) order = result; return true; }
    catch (e) {
      if (action === '/message' && e.status >= 400 && e.status < 500) {
        pendingMessage = null; messageId = crypto.randomUUID(); rememberMessage();
      }
      error = e.message + ' Your changes are not confirmed. Retry the same request.'; return false;
    }
    finally { busy = false; render(); }
  }
  function choosePayment(method, event) {
    if (paymentMethodPending || busy) { event.preventDefault(); return; }
    paymentMethodPending = true;
    // Leave the ordinary link's native app handoff intact. Start the private
    // metadata save without replacing the clicked link before its activation.
    // The original order tab/link remains open; this never verifies payment.
    void (async () => {
      try {
        const result = await call('/payment-method', { method }, { keepalive: true });
        if (!order || result.version >= order.version) order = result;
        error = '';
      } catch (e) { error = 'Your payment-method choice was not confirmed. Keep this order page and retry after reconnecting. ' + e.message; }
      finally { paymentMethodPending = false; render(); }
    })();
  }
  async function refresh() {
    const sequence = ++refreshSequence;
    const before = JSON.stringify(order), previousError = error;
    try {
      const result = await call();
      if (!order || result.version > order.version || (result.version === order.version && sequence >= appliedSequence)) {
        order = result;
        appliedSequence = sequence;
        error = "";
        refreshed = customerTime(Date.now(), true);
      }
    } catch (e) { if (sequence >= appliedSequence) error = e.message; }
    if (before !== JSON.stringify(order) || previousError !== error || !order) render();
    else {
      const checked = root.querySelector("#order-last-checked");
      if (checked) checked.textContent = "Last checked: " + refreshed + ". This page checks for changes every five seconds.";
    }
  }
  const stamp = (at) => at ? customerTimestamp(at) : "Not yet recorded";
  const stageNote = (label, at) => {
    if (at) return stamp(at);
    if (label === "Preparing Your Order" && ["ready", "picked-up"].includes(order.status)) return "Preparation was not recorded";
    return order.status === "canceled" ? "Not recorded before cancellation" : "Not yet recorded";
  };
  function render() {
    const focused = document.activeElement?.id;
    const cursor = document.activeElement?.selectionStart;

    document.title = (order?.orderNumber || "Order tracking") + " · " + doc.business.name;
    const t = doc.theme;
    const site = h("div", { class: "site-root", style: {
      "--paper": t.background, "--surface": t.surface, "--ink": t.ink,
      "--green": t.primary, "--accent": t.accent, "--muted": t.muted,
      "--heading": `"${t.font}",serif`, "--body": `"${t.bodyFont}",sans-serif`,
      "--width": t.width + "px", "--radius": t.radius + "px",
      "--button-radius": t.buttonRadius + "px", fontSize: t.fontSize + "px",
    } });
    // Tracking/payment disclosures remain outside editable custom CSS.
    const notice = order && order.simulated !== false && !productionMode ? h("div", { class: "demo-bar" }, "WEBSITE BETA · No payment processed by this website") : null;
    const shop = primarySite || productionMode || order?.simulated === false ? '/shop' : match ? "/demo/" + match[1] + "/shop" : "/shop";
    site.append(h("a", { class: "skip-link", href: "#main-content" }, "Skip to content"),
      h("header", { class: "site-header section-inner" },
        h("a", { href: shop, class: "brand" }, h("img", { src: doc.business.logo, alt: doc.business.logoAlt }), h("span", {}, doc.business.name)),
        h("a", { href: shop }, "Back to the shop")));
    const main = h("main", { id: "main-content", tabindex: "-1", class: "section-inner cart-page tracking-page" + (order?.paidReceipt ? " has-paid-receipt" : "") },
      pickupRequest(order, payload => save('/pickup-request', payload), busy),
      pickupNotice(order || {}, payload => save('/pickup-response', payload), busy),
      h("span", { class: "eyebrow" }, "YOUR PRIVATE ORDER STATUS"),
      h("h1", { style: { fontSize: "clamp(1.25rem, 5vw, 2rem)" } }, order?.orderNumber || "Order tracking"),
      h("p", { class: "small-note" }, "Keep this link private. It lets you view this order and contact Danielle. Payment is verified only by an owner."),
      error ? h("p", { role: "alert", class: "deadline" }, error) : null);
    const appendMain = (...nodes) => main.append(...nodes.filter(node => node !== null && node !== undefined && node !== false));
    if (!order) appendMain(button("Retry loading order", () => refresh(), { class: "secondary-button" }));
    else {
      appendMain(confirmationTools(order));
      if (order.status === 'pending' && !order.resolution && !order.paymentVerifiedAt && !order.paidReceipt && !order.paymentReportedAt && ['not_collected', 'awaiting_cash'].includes(order.paymentStatus)) {
        appendMain(button('Cancel Order', async () => {
          if (busy || paymentMethodPending) return;
          if (!window.confirm('Cancel this order? This releases your reserved items and cannot be undone here. Confirm only if you have NOT sent payment. If you have paid, contact Danielle instead.')) return;
          await save('/cancel', { confirmCancellation: true, confirmUnpaid: true });
        }, { class: 'secondary-button', disabled: busy || paymentMethodPending }));
      }
      appendMain(h("div", { class: "order-summary", "aria-live": "polite", "aria-label": "Current order status" },
        h("h2", {}, (order.status === "picked-up" ? "Historical order" : fulfillmentLabels[order.status]) || "Order Received"),
        h("p", {}, paymentLabels[order.paymentStatus] || "Awaiting Payment Verification"),
        order.paymentCorrectedAt ? h('p', {}, 'An owner corrected a mistaken payment-verification record. Payment is awaiting independent verification; the previous receipt is no longer valid.') : null,
        order.selectedPaymentMethod === 'cash_pickup' ? h('div', {}, h('strong', {}, 'Payment: Cash at Pickup'), h('p', {}, 'Cash Due: ' + money(order.paymentVerifiedAt || order.status === 'canceled' || order.resolution ? 0 : order.total)), h('p', {}, order.paymentVerifiedAt ? 'Danielle confirmed your cash payment.' : order.status === 'canceled' || order.resolution ? 'This cash order is closed.' : 'Please bring your payment when you pick up your order.')) : order.total === 0 ? h('p', {}, 'No payment is required for this order.') : !order.paymentVerifiedAt ? h('p', {}, 'Danielle will check her payment account and confirm receipt. You do not need to report that you paid.') : h('p', {}, 'Danielle independently verified your payment.'),
        order.status === 'canceled' ? h('p', {}, 'This order was canceled. Contact Danielle about any payment or refund.') : null));
      appendMain(paymentSelection(order, choosePayment, busy || paymentMethodPending));
      appendMain(button('Contact Danielle', () => { messaging = !messaging; rememberMessage(); render(); root.querySelector('#contact-message')?.focus(); }, { class: 'primary-link' }),
        order.attention?.customerContacted ? h('p', { role: 'status' }, 'Customer Contacted — awaiting owner review. Your current pickup time stays unchanged until Danielle approves an arrangement.') : null,
        order.attention?.extensionApproved ? h('p', { role: 'status' }, 'Extension Approved — new arrangement confirmed') : null,
        order.attention?.overdue ? h('p', {}, 'Pickup Overdue — please contact Danielle for owner review.') : null,
        order.attention?.resolved ? h('p', {}, 'Resolved — your request has been handled.') : null,
        order.resolution ? h('p', {}, order.resolution.kind === 'forfeited' ? 'An owner reviewed and recorded this order as forfeited. Contact Danielle about any questions.' : 'Danielle reviewed and resolved this pickup.') : null);
      if (messaging) appendMain(h('form', { class: 'sub-card', 'aria-label': 'Message Danielle', onsubmit: async e => {
        e.preventDefault(); pendingMessage ||= { ...draft, requestId: messageId }; rememberMessage();
        const ok = await save('/message', pendingMessage);
        if (ok) { draft = emptyDraft(); messageId = crypto.randomUUID(); pendingMessage = null; messaging = false; rememberMessage(); render(); }
      } }, h('h2', {}, 'Message Danielle'),
        pendingMessage ? h('p', { role: 'status' }, 'Your last message is awaiting confirmation. Retry it here; it will not be sent twice. ' + (recoveryUnavailable ? 'Leave this tab open for a safe retry.' : 'Your original message is kept through refresh.')) : null,
        h('p', { id: 'contact-recovery-note', hidden: !recoveryUnavailable }, 'This browser could not keep your draft through refresh. Leave this tab open until your message is confirmed.'),
        field('What can Danielle help with?', draft.topic, v => changeDraft('topic',v), { id: 'contact-topic', choices: [{ value: 'pickup', label: 'Pickup delay or more time' }, { value: 'order', label: 'Order question' }], disabled: busy || !!pendingMessage }),
        field('Your message', draft.body, v => changeDraft('body',v), { id: 'contact-message', type: 'textarea', required: true, minlength: 3, maxlength: 2000, disabled: busy || !!pendingMessage }),
        field('Requested alternative pickup date (optional)', draft.requestedDate, v => changeDraft('requestedDate',v), { id: 'requested-date', type: 'date', disabled: busy || !!pendingMessage }),
        field('Requested alternative pickup time (optional)', draft.requestedTime, v => changeDraft('requestedTime',v), { id: 'requested-time', type: 'time', disabled: busy || !!pendingMessage }),
        h('input', { name: 'website', tabindex: '-1', autocomplete: 'off', hidden: true, oninput: e => draft.website = e.target.value }),
        h('p', {}, 'A request does not approve an extension. Danielle will review it and reply here.'),
        h('button', { type: 'submit', class: 'primary-link', disabled: busy }, busy ? 'Sending…' : pendingMessage ? 'Retry message' : 'Send message')));
      if (order.messages?.length) appendMain(h('section', { class: 'sub-card', 'aria-label': 'Conversation with Danielle' }, h('h2', {}, 'Conversation with Danielle'), order.messages.map(m => h('article', {}, h('strong', {}, m.sender === 'owner' ? 'Danielle' : 'You'), h('p', {}, m.body), h('small', {}, stamp(m.at)), (m.requestedDate || m.requestedTime) ? h('p', {}, 'Requested: ' + requestedPickupLabel(m)) : m.topic === 'pickup' ? h('p', {}, 'Pickup delay or more time requested; alternative date/time not specified.') : null))));
      appendMain(h("h2", {}, "Order progress"),
        h("p", {}, "Payment and preparation are tracked separately. A stage is complete only when its own event is recorded."),
        h("ol", { "aria-label": "Order stages" }, stages(order).map(([label, at]) =>
          h("li", { class: "sub-card" }, h("strong", {}, label), h("p", {}, stageNote(label, at))))),
        h("h2", {}, "Pickup details"), h("p", {}, order.pickupChange && !order.pickupChange.replacement ? "Awaiting makeup date — the original pickup has changed." : pickupLabel(order.pickup)),
        experience ? pickupLocation({ pickupAddress: order.pickupAddress }) : null,
        order.pickupDeadline && !order.pickupChange ? h('p', {}, h('strong', {}, 'Pickup deadline: ' + stamp(order.pickupDeadline))) : null,
        order.originalPickup && order.extension ? h('p', {}, 'Original pickup: ' + pickupLabel(order.originalPickup)) : null,
        h('details', {}, h('summary', {}, POLICY_TITLE), POLICY.map((paragraph,i) => h('p', {}, i === 2 ? h('strong', {}, paragraph) : paragraph))),
        h("h2", {}, "Your order"),
        h("div", { role: "group", "aria-label": "Order items" }, order.lines.map((line) => h("p", {}, `${line.qty} × ${line.name} (${line.variant}) · ${money(line.qty * line.unitPrice)}`))),
        order.creditApplied ? h('div', {}, h('p', {}, 'Order subtotal: ' + money(order.subtotal)), h('p', {}, 'Return credit: −' + money(order.creditApplied) + ' · ' + order.returnCredit.status), order.total === 0 ? h('p', {}, 'Covered by return credit. No external payment is needed.') : null) : null,
        h("p", {}, h("strong", {}, "Total: " + money(order.total))));
      if (order.paidReceipt) {
        const receipt = order.paidReceipt;
        appendMain(h("section", { class: "sub-card paid-receipt", "aria-label": "Paid receipt" },
          h("span", { class: "eyebrow" }, receipt.beta ? "BETA · PAID RECEIPT" : "PAID RECEIPT"),
          h("h2", {}, receipt.number),
          h("p", {}, receipt.merchant?.name || "Rise & Roost"),
          receipt.merchant?.address ? h("p", {}, receipt.merchant.address) : null,
          h("p", {}, "Order: " + receipt.orderNumber),
          h("p", {}, "Issued: " + stamp(receipt.issuedAt)),
          h("p", {}, receipt.verification),
          receipt.lines.map((line) => h("p", {}, `${line.qty} × ${line.name} (${line.variant}) · ${money(line.qty * line.unitPrice)}`)),
          h("strong", {}, "Paid total: " + money(receipt.total)),
          h("p", {}, receipt.beta ? "This beta receipt records Danielle's independent verification. No payment was processed by this website or its Square integration." : "This receipt records Danielle's independent verification of your external payment. The website did not process the payment."),
          button("Print or save receipt as PDF", () => window.print(), { class: "secondary-button" })));
      }
      if (order.refunds?.length) appendMain(h('section', { class: 'sub-card', 'aria-label': 'Recorded refunds' }, h('h2', {}, 'Recorded refunds'), order.refunds.map(r => h('p', {}, money(r.amount) + ' · ' + stamp(r.at))), h('p', {}, 'An owner checked independent refund records. This website did not process these refunds. The original paid receipt remains part of the order history.')));
      appendMain(h("h2", {}, "Email updates"),
        order.emailOptIn ? h("div", {}, order.notifications.map((n) => h("p", {}, `${eventLabels[n.event]}: ${notificationLabels[n.status] || "Submission not confirmed"}`)))
          : h("p", {}, "Email updates were not requested. This page updates automatically; keep its private link."),
        h("p", { class: "small-note" }, "Provider acceptance does not confirm inbox delivery. Your status page is the source of current order information."),
        button("Refresh order status", () => refresh(), { class: "secondary-button" }),
        h("p", { class: "small-note", id: "order-last-checked" }, "Last checked: " + refreshed + ". This page checks for changes every five seconds."));
    }
    site.append(main);
    if (notice) root.replaceChildren(notice, site); else root.replaceChildren(site);
    if (focused) { const node = document.getElementById(focused); if (node) { node.focus(); try { node.setSelectionRange(cursor,cursor); } catch {} } }
  }
  render();
  if (match) {
    try {
      const r = await fetch("/api/site?workspace=" + match[1], { cache: "no-store" });
      if (r.ok) {
        const site = await r.json();
        doc = site.document;
        experience = !!site.customerExperienceEnabled;
        productionMode = site.productionMode === true;
        primarySite = site.isPrimary === true;
      }
    } catch { /* Order access still works when storefront content is unavailable. */ }
  }
  await refresh();
  let checking = false;
  const check = async () => {
    if (document.hidden || busy || checking || !order) return;
    checking = true;
    try { await refresh(); } finally { checking = false; }
  };
  setInterval(check, 5000);
  window.addEventListener("focus", check);
  window.addEventListener("online", check);
  document.addEventListener("visibilitychange", check);
}
