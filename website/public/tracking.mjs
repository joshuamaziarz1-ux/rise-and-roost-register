import { h, button, guard } from "./dom.mjs";
import { money, pickupLabel, orderByLabel, customerTime, customerTimestamp, seed } from "./model.mjs";
import { paymentLabels, fulfillmentLabels, stages, notificationLabels, eventLabels } from "./orders.mjs";
import { pickupLocation } from "./pickup-location.mjs";

export async function start(root) {
  const match = /^\/orders\/([a-f0-9]{48})\/([a-f0-9]{48})\/?$/.exec(location.pathname);
  const key = new URLSearchParams(location.hash.slice(1)).get("access");
  const endpoint = match && `/api/order-tracking/${match[1]}/${match[2]}`;
  let order, busy = false, error = "", refreshed = "", refreshSequence = 0, appliedSequence = 0;
  let doc = seed();
  let experience = false;
  const robots = h("meta", { name: "robots", content: "noindex,nofollow,noarchive" });
  document.head.append(robots);
  document.head.append(h("link", { rel: "stylesheet", href: "/tracking.css" }));
  async function call(report = false) {
    if (!endpoint || !/^[a-f0-9]{48}$/.test(key || ""))
      throw new Error("Open the complete private tracking link from your order confirmation, including the part after #. Contact the farm if you have lost it.");
    const response = await fetch(endpoint + (report ? "/report" : ""), {
      method: report ? "POST" : "GET",
      cache: "no-store",
      headers: { Authorization: "Bearer " + key, ...(report ? { "Content-Type": "application/json" } : {}) },
      ...(report ? { body: "{}" } : {}),
    });
    const result = await response.json().catch(() => ({ error: "Your order status is temporarily unavailable. Please retry." }));
    if (!response.ok) throw new Error(result.error || "Unable to refresh your order status.");
    return result;
  }
  async function refresh(report = false) {
    const sequence = ++refreshSequence;
    const before = JSON.stringify(order), previousError = error;
    try {
      const result = await call(report);
      if (!order || result.version > order.version || (result.version === order.version && sequence >= appliedSequence)) {
        order = result;
        appliedSequence = sequence;
        error = "";
        refreshed = customerTime(Date.now(), true);
      }
    } catch (e) { if (report || sequence >= appliedSequence) error = e.message; }
    if (report || before !== JSON.stringify(order) || previousError !== error || !order) render();
    else {
      const checked = root.querySelector("#order-last-checked");
      if (checked) checked.textContent = "Last checked: " + refreshed + ". This page checks for changes every five seconds.";
    }
  }
  const stamp = (at) => at ? customerTimestamp(at) : "Not yet recorded";
  const stageNote = (label, at) => {
    if (at) return stamp(at);
    if (label === "Payment Reported" && order.paymentStatus === "verified") return "Not reported separately; payment was independently verified";
    if (label === "Preparing Your Order" && ["ready", "picked-up"].includes(order.status)) return "Preparation was not recorded";
    return order.status === "canceled" ? "Not recorded before cancellation" : "Not yet recorded";
  };
  function render() {
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
    const notice = h("div", { class: "demo-bar" }, "WEBSITE BETA · No payment processed by this website");
    const shop = match ? "/demo/" + match[1] + "/shop" : "/shop";
    site.append(h("a", { class: "skip-link", href: "#main-content" }, "Skip to content"),
      h("header", { class: "site-header section-inner" },
        h("a", { href: shop, class: "brand" }, h("img", { src: doc.business.logo, alt: doc.business.logoAlt }), h("span", {}, doc.business.name)),
        h("a", { href: shop }, "Back to the shop")));
    const main = h("main", { id: "main-content", tabindex: "-1", class: "section-inner cart-page tracking-page" + (order?.paidReceipt ? " has-paid-receipt" : "") },
      h("span", { class: "eyebrow" }, "YOUR PRIVATE ORDER STATUS"),
      h("h1", { style: { fontSize: "clamp(1.25rem, 5vw, 2rem)" } }, order?.orderNumber || "Order tracking"),
      h("p", { class: "small-note" }, "Keep this link private. It lets you view this order and report a payment; it cannot verify payment or change preparation status."),
      error ? h("p", { role: "alert", class: "deadline" }, error) : null);
    if (!order) main.append(button("Retry loading order", () => refresh(), { class: "secondary-button" }));
    else {
      main.append(h("div", { class: "order-summary", "aria-live": "polite", "aria-label": "Current order status" },
        h("h2", {}, fulfillmentLabels[order.status] || "Order Received"),
        h("p", {}, paymentLabels[order.paymentStatus] || "Awaiting payment report"),
        order.paymentCorrectedAt ? h('p', {}, 'An owner corrected a mistaken payment-verification record. Payment is awaiting independent verification; the previous receipt is no longer valid.') : null,
        order.paymentStatus === "reported" ? h("p", {}, "Thank you — your payment has been reported. Danielle still needs to verify it independently. It has not been accepted or processed by this website.") : null,
        order.paymentStatus === "verified" ? h("p", {}, "Danielle recorded independent payment verification. Your beta paid receipt is below. Payment verification does not mean preparation has started.") : null,
        order.status === "canceled" ? h("p", {}, "This order was canceled. Contact the farm about any payment or refund; this website does not issue refunds.") : null,
        order.paymentStatus === "not_collected" && order.status !== "canceled" ? button(busy ? "Reporting your payment…" : "I've Sent Payment", guard(async () => {
          busy = true; render();
          try { await refresh(true); }
          finally { busy = false; render(); }
        }), { class: "primary-link", disabled: busy }) : null,
        h("p", { class: "small-note" }, (doc.business.paymentInstructions || "Use the payment arrangements agreed with the farm.") + " This button reports payment only; it does not charge a card or transfer money.")));
      main.append(h("h2", {}, "Order progress"),
        h("p", {}, "Payment and preparation are tracked separately. A stage is complete only when its own event is recorded."),
        h("ol", { "aria-label": "Order stages" }, stages(order).map(([label, at]) =>
          h("li", { class: "sub-card" }, h("strong", {}, label), h("p", {}, stageNote(label, at))))),
        h("h2", {}, "Pickup details"), h("p", {}, pickupLabel(order.pickup)),
        experience ? pickupLocation({ pickupAddress: order.pickupAddress }) : null,
        h("p", {}, "Order deadline: " + orderByLabel(order.pickup)),
        h("h2", {}, "Your order"),
        h("div", { role: "group", "aria-label": "Order items" }, order.lines.map((line) => h("p", {}, `${line.qty} × ${line.name} (${line.variant}) · ${money(line.qty * line.unitPrice)}`))),
        h("p", {}, h("strong", {}, "Total: " + money(order.total))));
      if (order.paidReceipt) {
        const receipt = order.paidReceipt;
        main.append(h("section", { class: "sub-card paid-receipt", "aria-label": "Paid receipt" },
          h("span", { class: "eyebrow" }, "BETA · PAID RECEIPT"),
          h("h2", {}, receipt.number),
          h("p", {}, receipt.merchant?.name || "Rise & Roost"),
          receipt.merchant?.address ? h("p", {}, receipt.merchant.address) : null,
          h("p", {}, "Order: " + receipt.orderNumber),
          h("p", {}, "Issued: " + stamp(receipt.issuedAt)),
          h("p", {}, receipt.verification),
          receipt.lines.map((line) => h("p", {}, `${line.qty} × ${line.name} (${line.variant}) · ${money(line.qty * line.unitPrice)}`)),
          h("strong", {}, "Paid total: " + money(receipt.total)),
          h("p", {}, "This beta receipt records Danielle's independent verification. No payment was processed by this website or its Square integration."),
          button("Print or save receipt as PDF", () => window.print(), { class: "secondary-button" })));
      }
      if (order.refunds?.length) main.append(h('section', { class: 'sub-card', 'aria-label': 'Recorded refunds' }, h('h2', {}, 'Recorded refunds'), order.refunds.map(r => h('p', {}, money(r.amount) + ' · ' + stamp(r.at))), h('p', {}, 'An owner checked independent refund records. This website did not process these refunds. The original paid receipt remains part of the order history.')));
      main.append(h("h2", {}, "Email updates"),
        order.emailOptIn ? h("div", {}, order.notifications.map((n) => h("p", {}, `${eventLabels[n.event]}: ${notificationLabels[n.status] || "Submission not confirmed"}`)))
          : h("p", {}, "Email updates were not requested. This page updates automatically; keep its private link."),
        h("p", { class: "small-note" }, "Provider acceptance does not confirm inbox delivery. Your status page is the source of current order information."),
        button("Refresh order status", () => refresh(), { class: "secondary-button" }),
        h("p", { class: "small-note", id: "order-last-checked" }, "Last checked: " + refreshed + ". This page checks for changes every five seconds."));
    }
    site.append(main);
    root.replaceChildren(notice, site);
  }
  render();
  if (match) {
    try {
      const r = await fetch("/api/site?workspace=" + match[1], { cache: "no-store" });
      if (r.ok) {
        const site = await r.json();
        doc = site.document;
        experience = !!site.customerExperienceEnabled;
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
