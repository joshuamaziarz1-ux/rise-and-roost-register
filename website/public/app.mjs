import { paymentSelection } from './payment-selection.mjs?v=post-order-20261110';
import { subscriptionForm, subscriptionAction } from './subscribe.mjs';
import { checkoutContact } from './checkout-contact.mjs';
import { confirmationTools } from './order-confirmation.mjs?v=no-refund-20261109';
import { dollarsToCents, centsToDollars } from './credit-money.mjs';
import { POLICY_VERSION, POLICY_TITLE, POLICY } from './commerce.mjs?v=no-refund-20261109';
import { h, button, notify, request, guard } from "./dom.mjs";
import { money, localInstant, pickupLabel, orderByLabel } from "./model.mjs";
import { createCustomerExperience } from "./customer.mjs?v=customer-cleanup-20261109";
import { pickupLocation } from "./pickup-location.mjs";
import { sellingMethod } from './selling.mjs';

const root = document.querySelector("#app");
if (!location.pathname.startsWith('/studio/preview/') && (
  location.pathname === "/studio" ||
  location.pathname.startsWith("/studio/")
)) {
  import("./studio.mjs?v=coordinated-20261107")
    .then((m) => m.start(root))
    .catch((e) => notify(e.message, true));
} else if (location.pathname.startsWith("/orders/")) {
  import("./tracking.mjs?v=coordinated-20261107").then((m) => m.start(root)).catch((e) => notify(e.message, true));
} else {
  let doc,
    revision = 1,
    availabilityRevision = 0,
    workspace = "",
    studioPath = "/studio",
    isPreview = false,
    prefix = "",
    path = "/",
    receipt,
    notificationsEnabled = false,
    checkoutEmail = "";
  let marketingSignupEnabled=false;
  const subscriptionPanel=location.pathname==='/subscribe'?subscriptionAction():null;
  let commerceEnabled = false, policyAccepted = false, productionMode = false, checkoutEnabled = true;
  let automaticCalendar = false, serverOffset = 0, calendarTimer;
  const calendarNow = () => Date.now() + serverOffset;
  let creditChoice = 0;
  let experience = false, customer, customerWorkspace = "", checkoutMode = "guest";
  let checkoutTouched = new Set(), checkoutMemberId = null, checkoutGuestChosen = false;
  let checkoutProfile = { name: "", email: "", phone: "" };
  let orderSubmitting = false;
  const editing = new URLSearchParams(location.search).has("studio-preview");
  let previewDocumentReceived = false;
  const match = location.pathname.match(
    /^\/(demo|preview|studio\/preview)\/([a-f0-9]{48})(.*)$/,
  );
  if (match) {
    prefix = "/" + match[1] + "/" + match[2];
    path = match[3] || "/";
    workspace = match[1] === "demo" ? match[2] : "";
    isPreview = match[1].endsWith("preview");
  } else path = location.pathname;
  let cart;
  try {
    cart = JSON.parse(localStorage.getItem("rr-beta-cart:" + prefix)) || {
      lines: [],
      pickupId: "",
      requestId: crypto.randomUUID(),
    };
  } catch {
    cart = { lines: [], pickupId: "", requestId: crypto.randomUUID() };
  }
  const saveCart = () => {
    try {
      localStorage.setItem("rr-beta-cart:" + prefix, JSON.stringify(cart));
    } catch {
      notify(
        "Browser storage is unavailable. Keep this tab open until your demo request finishes.",
      );
    }
  };
  const link = (href, text, cls = "") =>
    h(
      "a",
      { href: href.startsWith("/") ? prefix + href : href, class: cls },
      text,
    );
  const navigate = (next) => {
    path = next;
    receipt = null;
    history.pushState(
      {},
      "",
      prefix + path + (editing ? "?studio-preview=1" : ""),
    );
    render();
    window.scrollTo(0, 0);
  };
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (
      !a ||
      a.getAttribute("href")?.startsWith("#") ||
      a.target ||
      a.hasAttribute("download") ||
      !["http:", "https:"].includes(new URL(a.href).protocol) ||
      e.ctrlKey ||
      e.metaKey ||
      e.shiftKey ||
      new URL(a.href).origin !== location.origin
    )
      return;
    const target = new URL(a.href).pathname;
    if (target.startsWith("/studio") || target.startsWith("/orders/")) return;
    if (prefix && !target.startsWith(prefix)) return;
    e.preventDefault();
    navigate(prefix ? target.slice(prefix.length) || "/" : target);
  });
  window.addEventListener("popstate", () => {
    path = prefix
      ? location.pathname.slice(prefix.length) || "/"
      : location.pathname;
    render();
  });
  window.addEventListener("message", (e) => {
    if (
      !editing ||
      e.origin !== location.origin ||
      e.source !== parent ||
      e.data?.type !== "studio-document"
    )
      return;
    doc = e.data.document;
    experience = !!e.data.customerExperienceEnabled;
    if (/^[a-f0-9]{48}$/.test(e.data.workspaceId || "")) workspace = e.data.workspaceId;
    ensureCustomer();
    previewDocumentReceived = true;
    path = e.data.path || "/";
    render();
  });
  const add = (product, variant, qty = 1) => {
    if (orderSubmitting) return;
    if (!visibleProduct(product) || sellingMethod(product) === 'in-store' || soldOut(product)) {
      notify('This item is unavailable for online ordering.', true);
      return;
    }
    const prior = cart.lines.find(
      (l) => l.productId === product.id && l.variantId === variant.id,
    );
    if (prior) prior.qty = Math.min(99, prior.qty + qty);
    else cart.lines.push({ productId: product.id, variantId: variant.id, qty });
    cart.requestId = crypto.randomUUID();
    saveCart();
    notify(product.name + " added to your basket.");
    render();
  };
  const img = (photo, cls = "") =>
    photo?.src
      ? h("img", {
          src: photo.src,
          alt: photo.alt || "",
          class: cls,
          loading: "lazy",
          style: { objectPosition: `${photo.x ?? 50}% ${photo.y ?? 50}%` },
        })
      : h("div", { class: "photo-empty" }, "Photo coming soon");
  // Only replace known starter copy in production; keep owner-authored content and demos intact.
  const productionCopy = {
    'Add the public email or contact channel you want your neighbors to use.': 'For help with an order, open your private order link and choose Contact Danielle.',
    'We would love to hear from you. Add your preferred public contact details in Studio.': 'Your private order page keeps your order questions and replies together.',
    'This is an isolated demo. No real purchases, payments, or fulfillment. Use sample information only. Danielle can replace this with approved terms and privacy copy.': 'Review the sales, cancellation and pickup policy above. For help with an order, choose Contact Danielle on your private order page.',
    'Select an available pickup window in your basket. Tuesday and Friday are editable sample defaults.': 'Select an available pickup window in your basket. Your confirmation and private order page show your pickup details.',
    'This beta only simulates requests. Nothing is charged or sent to the real store.': 'Placing a preorder saves your order before payment. Follow the payment instructions on your private order page. Danielle verifies payment independently.',
    'These are sample pickup and cancellation policies. No real order is placed. Please replace with your approved policies before a real launch.': 'See the sales, cancellation and pickup policy before placing your preorder. For order questions, choose Contact Danielle on your private order page.',
  };
  const customerCopy = text => productionMode && Object.hasOwn(productionCopy, text) ? productionCopy[text] : !experience ? text : text
    .replace(" This is our editable starter story — make it yours.", "")
    .replace(" All schedules shown are examples.", "")
    .replace(" Sample product and price.", "");
  function card(p) {
    let selected = p.variants[0];
    const inStore = sellingMethod(p) === 'in-store';
    const cardPrice = h("span", {}, money(p.price));
    return h(
      "article",
      { class: "product-card" },
      link(
        "/product/" + p.id,
        [
          img(p.images[0]),
          p.placeholder && !experience
            ? h("span", { class: "sample-photo" }, "Sample illustration")
            : null,
        ],
        "product-image",
      ),
      h(
        "div",
        { class: "product-info" },
        h(
          "small",
          {},
          inStore ? p.category : experience ? (soldOut(p) ? 'Sold Out' : p.category) : [p.category, availabilityLabel(p)].filter(Boolean).join(" · "),
        ),
        link("/product/" + p.id, h("h3", {}, p.name)),
        inStore ? h('p', { class: 'fresh-description' }, customerCopy(p.description)) : null,
        h(
          "div",
          { class: "price-line" },
          cardPrice,
          link("/product/" + p.id, "↗", "round-link"),
        ),
        experience ? customer?.favoriteButton(p.id) : null,
        inStore ? h('p', { class: 'availability-status', 'data-availability': soldOut(p) ? 'sold-out' : 'in-store' }, availabilityLabel(p)) : experience ? h("div", { class: "quick-add" },
          p.variants.length > 1 ? h("select", { "aria-label": "Choose variety for " + p.name, onchange: e => { selected = p.variants.find(v => v.id === e.target.value); cardPrice.textContent = money(p.price + selected.extra); } }, p.variants.map(v => h("option", { value: v.id }, v.name + (v.extra ? " · +" + money(v.extra) : "")))) : null,
          button(soldOut(p) ? 'Sold Out' : "Add to basket", () => add(p, selected), { class: "primary-link", disabled: soldOut(p) || isPreview || editing, "aria-label": soldOut(p) ? p.name + " is sold out" : "Add " + p.name + " to basket" })) : null,
      ),
    );
  }
  const visibleProduct = p => !!p && p.active === true && !p.archived && !p.hidden;
  // Customer APIs already combine stock, per-date limits and reservations.
  const soldOut = (p) => p.soldOut === true || p.stock === 0;
  const availabilityLabel = (p) =>
    soldOut(p) ? 'Sold Out' : sellingMethod(p) === 'in-store' ? 'Available in Store' : sellingMethod(p) === 'online' ? 'Available for Pickup' : doc.ui.preorder;
  function freshSection() {
    const products = doc.products.filter(p => visibleProduct(p) && sellingMethod(p) === 'in-store');
    return h('section', { class: 'site-section fresh-section fresh-at-roost', 'aria-labelledby': 'fresh-roost-heading' },
      h('div', { class: 'section-inner' },
        h('div', { class: 'section-copy' }, h('h2', { id: 'fresh-roost-heading' }, 'Fresh at The Roost!'),
          doc.freshAnnouncement?.trim() ? h('p', { class: 'fresh-announcement' }, doc.freshAnnouncement) : null),
        products.length ? h('div', { class: 'product-grid' }, products.map(card)) : h('p', { class: 'fresh-empty' }, 'Check back soon for fresh finds at the farm stand.')));
  }
  function renderSection(section, page) {
    if (section.hidden) return null;
    const s = h("section", {
      class: "site-section section-" + section.type,
      "data-section": section.id,
      style: {
        paddingTop: section.padding + "px",
        paddingBottom: section.padding + "px",
        color: section.color || "",
        backgroundColor: section.background || "",
        textAlign: section.align,
      },
    });
    const heading = h(
      section.type === "hero" ? "h1" : "h2",
      { style: { fontSize: `clamp(2rem,5vw,${section.fontSize}px)` } },
      section.title,
    );
    const copy = h(
      "div",
      { class: "section-copy" },
      h(
        "span",
        { class: "eyebrow" },
          section.type === "hero" ? doc.business.tagline : section.type === "faq" ? doc.ui.faqTitle : page.id === "about" ? doc.business.story : "",
      ),
      heading,
      section.body ? h("p", {}, customerCopy(section.body)) : null,
    );
    if (experience && page.slug === "/" && section.type === "hero")
      copy.append(h("div", { class: "home-choices", "aria-label": "Welcome to Rise & Roost" },
        link("/shop", "Start Shopping", "primary-link"),
        link("/roost", "The Roost", "secondary-button"),
        link("/comments", "Leave a Comment", "secondary-button")));
    else if (["hero", "split", "cta"].includes(section.type))
      copy.append(link(section.link, section.button + "  ↗", "primary-link"));
    if (section.type === "hero" || section.type === "split") {
      const visual = section.image
        ? h(
            "div",
            { class: "editorial-image" },
            h("img", { src: section.image, alt: section.alt || "" }),
          )
        : h(
            "div",
            { class: "hero-art" },
            h("img", {
              src: "/assets/bread.svg",
              alt: "Farmhouse bread illustration",
            }),
            !experience ? h("div", { class: "art-label" }, doc.ui.heroStamp || "SLOW MADE. SOUL FED.") : null,
            h(
              "div",
              { class: "hero-inset" },
              h("img", {
                src: "/assets/eggs.svg",
                alt: "Sample egg illustration",
              }),
              !experience ? h("span", {}, doc.ui.artCaption || "A taste of the everyday good.") : null,
            ),
            !experience ? h(
              "span",
              { class: "sample-photo" },
              "Illustrated placeholders · Your photos go here",
            ) : null,
          );
      s.append(h("div", { class: "section-inner editorial" }, copy, visual));
    } else if (section.type === "products") {
      s.append(
        h(
          "div",
          { class: "section-inner" },
          copy,
          h(
            "div",
            { class: "product-grid" },
            doc.products.filter((p) => visibleProduct(p) && sellingMethod(p) !== 'in-store').map(card),
          ),
          !experience ? h("p", { class: "small-note" }, doc.ui.productNote) : null,
        ),
      );
    } else if (section.type === "faq") {
      s.append(
        h(
          "div",
          { class: "section-inner narrow" },
          copy,
          section.items.map((item) =>
            h(
              "details",
              {},
              h("summary", {}, item.title),
              h("p", {}, customerCopy(item.body)),
            ),
          ),
        ),
      );
    } else if (section.type === "gallery" || section.type === "cards") {
      s.append(
        h(
          "div",
          { class: "section-inner" },
          copy,
          h(
            "div",
            { class: "product-grid" },
            section.items.map((item) =>
              h(
                "article",
                {},
                item.image
                  ? h("img", {
                      class: "gallery-image",
                      src: item.image,
                      alt: item.alt || "",
                    })
                  : null,
                h("h3", {}, item.title),
                h("p", {}, customerCopy(item.body)),
              ),
            ),
          ),
        ),
      );
    } else {
      s.append(h("div", { class: "section-inner narrow" }, copy));
      if (section.type === "visit")
        s.firstChild.append(
          h(
            "div",
            { class: "info-card" },
            h("h3", {}, doc.business.name),
            h("p", {}, doc.business.address),
            h("strong", {}, doc.business.hours),
          ),
        );
      if (section.type === "contact")
        s.firstChild.append(
          h(
            "div",
            { class: "info-card" },
            h("h3", {}, doc.ui.contactTitle),
            h("p", {}, customerCopy(doc.ui.contactBody)),
            doc.business.email
              ? h(
                  "a",
                  { href: "mailto:" + doc.business.email },
                  doc.business.email,
                )
              : h(
                  "p",
                  {},
                  productionMode ? "Use the private link in your order confirmation, or open your order from My Orders in The Roost." : "Public contact details are not configured in this demo.",
                ),
          ),
        );
    }
    if (editing) {
      s.classList.add("editable-section");
      s.prepend(
        button(
          "Edit this section",
          () =>
            parent.postMessage(
              { type: "studio-select", sectionId: section.id, pageId: page.id },
              location.origin,
            ),
          { class: "edit-section" },
        ),
      );
      s.addEventListener("dblclick", (e) => {
        e.preventDefault();
        parent.postMessage(
          { type: "studio-select", sectionId: section.id, pageId: page.id },
          location.origin,
        );
      });
    }
    return s;
  }
  function productDetail(id) {
    const p = doc.products.find((p) => p.id === id && visibleProduct(p));
    if (!p)
      return h(
        "main",
        { class: "section-inner empty-state" },
        h("h1", {}, "This item is unavailable."),
        link("/shop", doc.ui.continue),
      );
    let variant = p.variants[0];
    const price = h(
      "div",
      { class: "detail-price" },
      money(p.price + variant.extra),
    );
    const select = h(
      "select",
      {
        "aria-label": doc.ui.variety || "Variety",
        onchange: (e) => {
          variant = p.variants.find((v) => v.id === e.target.value);
          price.textContent = money(p.price + variant.extra);
        },
      },
      p.variants.map((v) => h("option", { value: v.id }, v.name)),
    );
    const inStore = sellingMethod(p) === 'in-store';
    const action = inStore ? h('p', { class: 'availability-status', 'data-availability': soldOut(p) ? 'sold-out' : 'in-store' }, availabilityLabel(p)) : button(
      soldOut(p)
        ? 'Sold Out'
        : doc.ui.add,
      () => add(p, variant),
      {
        class: "primary-link",
        disabled:
          soldOut(p) || isPreview || editing,
      },
    );
    return h(
      "main",
      { class: "section-inner product-detail" },
      h(
        "div",
        {},
        img(p.images[0], "detail-image"),
        p.placeholder && !experience
          ? h(
              "p",
              { class: "small-note" },
              "Sample illustration · Replace with your own photo",
            )
          : null,
        h(
          "div",
          { class: "thumbnails" },
          p.images.map((photo) =>
            button(img(photo), () => {
              const target = document.querySelector(".detail-image");
              target.src = photo.src;
              target.alt = photo.alt;
              target.style.objectPosition = `${photo.x}% ${photo.y}%`;
            }),
          ),
        ),
      ),
      h(
        "div",
        {},
        link("/shop", "← " + doc.ui.continue),
        h("p", { class: "eyebrow" }, [p.category, availabilityLabel(p)].filter(Boolean).join(" · ")),
        h("h1", {}, p.name),
        h("p", {}, customerCopy(p.description)),
        price,
        !inStore ? h("label", { class: "field" }, doc.ui.variety || "Variety", select) : null,
        action,
        !inStore ? h("p", { class: "small-note" }, customerCopy(doc.ui.policy), productionMode ? [" ", link("/terms#order-policy", "Read the policy")] : null) : null,
      ),
    );
  }
  let receiptPaymentPending = false, receiptRefreshPending = false;
  async function receiptCall(method) {
    const url = new URL(receipt.trackingPath, location.origin);
    const response = await fetch(url.pathname.replace('/orders/', '/api/order-tracking/') + (method ? '/payment-method' : ''), {
      method: method ? 'POST' : 'GET', cache: 'no-store', keepalive: !!method,
      headers: { Authorization: 'Bearer ' + new URLSearchParams(url.hash.slice(1)).get('access'), ...(method ? { 'Content-Type': 'application/json' } : {}) },
      ...(method ? { body: JSON.stringify({ method }) } : {})
    });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || 'Unable to save your payment choice.');
    return result;
  }
  function chooseReceiptPayment(method, event) {
    if (receiptPaymentPending) { event.preventDefault(); return; }
    receiptPaymentPending = true;
    void (async () => {
      try {
        const next = await receiptCall(method);
        if (next.id !== receipt.id || !Number.isSafeInteger(next.version)) throw new Error('The server did not confirm this order.');
        if (next.version >= receipt.version) receipt = next;
      } catch (e) { notify('Your order is saved, but your payment choice was not confirmed. Retry here or through your private tracking link. ' + e.message, true); }
      finally { receiptPaymentPending = false; render(); }
    })();
  }
  async function refreshReceipt() {
    if (!receipt?.trackingPath || document.hidden || receiptPaymentPending || receiptRefreshPending) return;
    receiptRefreshPending = true;
    try {
      const next = await receiptCall();
      if (next.id === receipt.id && next.version >= receipt.version && JSON.stringify(next) !== JSON.stringify(receipt)) { receipt = next; render(); }
    } catch { /* Keep the saved receipt and private recovery link visible offline. */ }
    finally { receiptRefreshPending = false; }
  }
  setInterval(refreshReceipt, 5000);
  window.addEventListener('focus', refreshReceipt);
  window.addEventListener('online', refreshReceipt);
  document.addEventListener('visibilitychange', refreshReceipt);
  function renderCart() {
    if (receipt)
      return h(
        "main",
        { class: "section-inner empty-state receipt", style: { paddingTop: "2rem", paddingBottom: "2rem" } },
        !experience ? h("span", { class: "eyebrow" }, "DEMO · NO PAYMENT") : null,
        h("h1", { style: { fontSize: "clamp(2rem, 6vw, 3rem)" } }, experience ? "Order Received!" : doc.ui.simulated),
        h("p", { class: "confirmation-number" }, "Order number: " + (receipt.orderNumber || receipt.id.slice(0, 10))),
        h("p", {}, "Scheduled pickup: " + pickupLabel(receipt.pickup)),
        experience ? pickupLocation({ pickupAddress: receipt.pickupAddress }) : null,
        !experience ? h(
          "p",
          {},
          doc.ui.orderBy +
            ": " +
            orderByLabel(receipt.pickup),
        ) : null,
        h('section', { 'aria-label': 'Order summary' }, h('h2', { style: { fontSize: '1.5rem' } }, 'Your order'),
          receipt.lines.map(line => h('p', {}, `${line.qty} × ${line.name} (${line.variant}) · ${money(line.qty * line.unitPrice)}`)),
          h('strong', {}, 'Total: ' + money(receipt.total))),
        commerceEnabled ? paymentSelection(receipt, chooseReceiptPayment, receiptPaymentPending) : null,
        receipt.creditApplied ? h('p', {}, 'Subtotal: ' + money(receipt.subtotal) + ' · Return credit: −' + money(receipt.creditApplied) + ' · Remaining payment: ' + money(receipt.total)) : null,
        receipt.trackingPath ? h("p", {}, h("a", { href: receipt.trackingPath, class: "primary-link" }, "View & manage order")) : null,
        h(
          "p",
          {},
          experience ? "Follow your payment and pickup status using your private order link. Payment is confirmed only after independent verification." : "Your beta request was received. Open Track your order for its current payment, preparation, and pickup status. This website has not processed a payment.",
        ),
        receipt.emailOptIn ? h("p", {}, "Your email confirmation is queued. Keep this page until it arrives; your private link always shows the current status.") : h("p", {}, "Save your confirmation below for your records."),
        receipt.trackingPath ? confirmationTools(receipt) : null,
        h("p", { class: "small-note" }, experience ? "Your confirmation is available without email. Signed-in orders are also saved in My Orders in The Roost." : "Save your private tracking link to view this order on another device. Order emails are sent automatically when available."),
        experience ? link("/roost", customer?.member ? "View my Roost orders" : "Explore The Roost", "secondary-button") : null,
        link("/shop", doc.ui.continue, "secondary-button"),
      );
    const lines = cart.lines
      .map((l) => ({
        ...l,
        p: doc.products.find((p) => p.id === l.productId),
        v: doc.products
          .find((p) => p.id === l.productId)
          ?.variants.find((v) => v.id === l.variantId),
      }))
      .filter((l) => l.p && l.v);
    const total = lines.reduce(
      (n, l) => n + l.qty * (l.p.price + l.v.extra),
      0,
    );
    const appliedCredit = checkoutMode === 'member' && customer?.member && customer.credits.enabled ? Math.min(creditChoice, customer.credits.available, total) : 0;
    const remainingDue = total - appliedCredit;
    const invalidBasket = cart.lines.length !== lines.length || lines.some(l =>
      !visibleProduct(l.p) || sellingMethod(l.p) === 'in-store' || soldOut(l.p) ||
      lines.filter(other => other.productId === l.productId).reduce((n, other) => n + other.qty, 0) > l.p.stock);
    const blockedItems = cart.lines.filter(l => {
      const p = doc.products.find(p => p.id === l.productId);
      return !visibleProduct(p) || sellingMethod(p) === 'in-store' || soldOut(p) || !p.variants.some(v => v.id === l.variantId);
    });
    const pickupClosed = p => p.closed ||
      cart.lines.some(line => p.productionRemaining?.[line.productId] !== undefined && p.productionRemaining[line.productId] < cart.lines.filter(l => l.productId === line.productId).reduce((n, l) => n + l.qty, 0)) ||
      calendarNow() >= localInstant(p.cutoffDate, p.cutoffTime) || calendarNow() >= localInstant(p.date, p.start) || p.capacity === 0;
    const eligiblePickups = doc.pickups.filter(p => !pickupClosed(p));
    if (!orderSubmitting && automaticCalendar && !eligiblePickups.some(p => p.id === cart.pickupId)) {
      // An earlier checkout response may have been lost. Keep its retry ID so
      // advancing availability cannot create a second order automatically.
      cart.pickupId = eligiblePickups[0]?.id || ''; saveCart();
    }
    const pickupChoices = h('div', { class: 'pickup-options', role: 'group', 'aria-label': doc.ui.pickup },
      eligiblePickups.map(p => button(pickupLabel(p), () => {
        if (orderSubmitting || pickupClosed(p)) return;
        if (cart.pickupId !== p.id) {
          cart.pickupId = p.id;
          cart.requestId = crypto.randomUUID();
          saveCart();
        }
        render();
        // Rendering replaces the cards. Keep keyboard focus on the tapped date.
        root.querySelectorAll('.pickup-date').forEach(card => {
          if (card.dataset.pickupId === p.id) card.focus({ preventScroll: true });
        });
      }, { class: 'pickup-date', 'data-pickup-id': p.id, 'aria-pressed': cart.pickupId === p.id, disabled: orderSubmitting })),
    );
    const chosen = eligiblePickups.find((p) => p.id === cart.pickupId);
    const customerFields = h("div", { class: "checkout-details" },
      h("h2", {}, "Contact information"),
      h("p", { class: "small-note" }, "All three fields are required so we can contact you about your order. Corrections apply to this order only."),
      ...[["Name", "name", "text", "name"], ["Email address", "email", "email", "email"], ["Phone number", "phone", "tel", "tel"]].map(([label, key, type, autocomplete]) => {
        const error = h('small', { id: 'checkout-' + key + '-error', class: 'small-note', 'aria-live': 'polite' });
        const input = h("input", { name: "checkout-" + key, type, autocomplete, required: true, 'aria-label': label, 'aria-describedby': error.id,
          maxlength: key === "name" ? 80 : key === "phone" ? 32 : 254, value: checkoutProfile[key],
          oninput: e => { checkoutTouched.add(key); checkoutProfile[key] = e.target.value; if (key === "email") checkoutEmail = e.target.value; validate(error.textContent !== ''); updateActionValidity(); },
          onblur: () => validate(true) });
        function validate(show) {
          const message = checkoutContact(checkoutProfile).errors[key] || '';
          input.setCustomValidity(message);
          input.setAttribute('aria-invalid', String(show && !!message));
          error.textContent = show ? message : '';
        }
        validate(checkoutTouched.has(key));
        return h("label", { class: "field" }, label + ' (required)', input, error);
      }));
    const checkoutInvalid = () => orderSubmitting || !checkoutEnabled || doc.orderingPaused || !chosen || pickupClosed(chosen) || invalidBasket || !lines.length || isPreview || editing ||
      commerceEnabled && !policyAccepted ||
      Object.keys(checkoutContact(checkoutProfile).errors).length > 0 || [...customerFields.querySelectorAll('input')].some(input => !input.checkValidity());
    const updateActionValidity = () => {
      action.disabled = checkoutInvalid();
      action.textContent = orderSubmitting ? 'Placing your order…' : experience ? 'Place Order' : doc.ui.checkout;
      action.setAttribute('aria-busy', String(orderSubmitting));
    };
    const action = button(
      orderSubmitting ? "Placing your order…" : experience ? "Place Order" : doc.ui.checkout,
      guard(async () => {
        if (orderSubmitting) return;
        if (invalidBasket) throw new Error('Some items are no longer available for online ordering. Please update your basket before continuing.');
        if (!checkoutEnabled || doc.orderingPaused || !chosen || pickupClosed(chosen)) throw new Error('Ordering is unavailable for this pickup. Please choose another available date.');
        if (commerceEnabled && !policyAccepted) throw new Error("Please read and acknowledge the pickup policy.");
        {
          const fields = [...customerFields.querySelectorAll("input")];
          if (fields.some(input => !input.reportValidity())) return;
          for (const key of ["name", "email", "phone"]) checkoutProfile[key] = customerFields.querySelector('[name="checkout-' + key + '"]').value;
        }
        orderSubmitting = true;
        updateActionValidity();
        try {
          if (!workspace) {
            const created = await request("/api/workspaces", { customerDemo: true });
            workspace = created.id;
            revision = created.publishedRevision;
            prefix = "/demo/" + workspace;
            history.replaceState({}, "", prefix + "/cart");
            cart.originatedAtRoot = true;
            saveCart();
          }
          receipt = await request("/api/orders", {
            storefront: prefix.startsWith("/demo/") ? "demo" : "main",
            workspaceId: workspace,
            revision,
            requestId: cart.requestId,
            pickupId: cart.pickupId,
            customerDetails: checkoutProfile,
            total,
            ...(commerceEnabled ? { policyAccepted, policyVersion: POLICY_VERSION } : {}),
            ...(experience ? { checkoutMode, creditCents: appliedCredit } : {}),
            lines: lines.map((l) => ({
              productId: l.productId,
              variantId: l.variantId,
              qty: l.qty,
              unitPrice: l.p.price + l.v.extra,
            })),
          });
          // Root checkout moves into an isolated demo; clear the originating basket too.
          if (cart.originatedAtRoot) {
            try { localStorage.removeItem("rr-beta-cart:"); } catch {}
          }
          cart = { lines: [], pickupId: "", requestId: crypto.randomUUID() };
          saveCart();
          creditChoice = 0;
          if (experience) void customer.refresh(false);
          render();
        } finally {
          orderSubmitting = false;
          render();
          if (receipt) { window.scrollTo(0, 0); root.querySelector('main')?.focus({ preventScroll: true }); }
        }
      }),
      {
        class: "primary-link",
        type: experience ? "submit" : "button",
        disabled: checkoutInvalid(),
        "aria-busy": orderSubmitting,
      },
    );
    return h(
      "main",
      { class: "section-inner cart-page checkout-page" },
      h("h1", {}, doc.ui.cart),
      invalidBasket ? h('div', { class: 'basket-availability-warning', role: 'status' },
        h('p', {}, 'Some items are no longer available for online ordering. Remove unavailable items or lower their quantities before continuing.'),
        blockedItems.length ? button('Remove unavailable items', () => {
          if (orderSubmitting) return;
          cart.lines = cart.lines.filter(l => !blockedItems.some(blocked => blocked.productId === l.productId && blocked.variantId === l.variantId));
          cart.requestId = crypto.randomUUID(); saveCart(); render();
        }, { class: 'text-button' }) : null) : null,
      experience && lines.length ? h("div", { class: "checkout-mode", "aria-label": "Checkout options" },
        button("Guest checkout", () => { checkoutGuestChosen = true; checkoutMode = "guest"; render(); }, { class: checkoutMode === "guest" ? "active" : "", "aria-pressed": checkoutMode === "guest" }),
        customer?.member ? button("Use my Roost details", () => { checkoutGuestChosen = false; checkoutMode = "member"; for (const key of ["name", "email", "phone"]) if (!checkoutTouched.has(key)) checkoutProfile[key] = customer.member.profile[key] || ""; render(); }, { class: checkoutMode === "member" ? "active" : "", "aria-pressed": checkoutMode === "member" }) : link("/roost", "Already a member? Sign in"),
        h("p", {}, checkoutMode === "guest" ? "No account needed." : "This order will be saved in your Roost.")) : null,
      !lines.length
        ? h(
            "div",
            { class: "empty-state" },
            h("p", {}, doc.ui.empty),
            link("/shop", doc.ui.shop, "primary-link"),
          )
        : h(
            experience ? "form" : "div",
            { class: "cart-layout checkout-redesign", onsubmit: e => e.preventDefault() },
            h(
              "div",
              {},
              customerFields,
              h('section', { class: 'checkout-pickup', 'aria-label': 'Pickup details' },
                h("h2", {}, doc.ui.pickup),
                eligiblePickups.length ? pickupChoices : h('p', { class: 'pickup-empty', role: 'status' },
                  doc.orderingPaused ? 'Ordering is currently paused. No pickup dates are available. Please check back soon.' : 'No eligible pickup dates are available for all items in your basket. Please check back soon or update your basket.'),
                experience ? pickupLocation(doc.business) : null,
                chosen
                  ? h(
                      "div",
                      { class: "deadline" },
                      h("strong", {}, doc.ui.orderBy),
                      h(
                        "p",
                        {},
                        orderByLabel(chosen),
                      ),
                    )
                  : null,
                !experience ? h("p", {}, doc.ui.policy) : null,
              ),
            ),
            h(
              "aside",
              { class: "order-summary" },
              !experience ? h("span", { class: "eyebrow" }, "SIMULATION ONLY") : null,
              h('h2', { style: { fontSize: '1.5rem' } }, 'Your order'),
              chosen ? h('p', { class: 'checkout-selected-pickup' }, h('strong', {}, 'Pickup · '), pickupLabel(chosen)) : null,
              h('div', { class: 'checkout-products' },
              lines.map((l) =>
                h(
                  "div",
                  { class: "basket-line" },
                  img(l.p.images[0]),
                  h(
                    "div",
                    {},
                    h("h3", {}, l.p.name),
                    sellingMethod(l.p) === 'in-store' || soldOut(l.p) || !visibleProduct(l.p) ? h('p', { class: 'availability-status' }, sellingMethod(l.p) === 'in-store' ? 'Available in store only' : soldOut(l.p) ? 'Sold Out' : 'Unavailable') : null,
                    h("p", {}, l.v.name + " · " + money(l.p.price + l.v.extra)),
                    h(
                      "label",
                      {},
                      doc.ui.quantity,
                      h("input", {
                        type: "number",
                        min: 1,
                        max: 99,
                        value: l.qty,
                        "aria-label": doc.ui.quantity + " " + l.p.name,
                        onchange: (e) => {
                          if (orderSubmitting) return;
                          const qty = Math.max(
                            1,
                            Math.min(
                              99,
                              Math.floor(Number(e.target.value) || 1),
                            ),
                          );
                          cart.lines.find(
                            (x) =>
                              x.productId === l.productId &&
                              x.variantId === l.variantId,
                          ).qty = qty;
                          cart.requestId = crypto.randomUUID();
                          saveCart();
                          render();
                        },
                      }),
                    ),
                    button(
                      doc.ui.remove,
                      () => {
                        if (orderSubmitting) return;
                        cart.lines = cart.lines.filter(
                          (x) =>
                            x.productId !== l.productId ||
                            x.variantId !== l.variantId,
                        );
                        cart.requestId = crypto.randomUUID();
                        saveCart();
                        render();
                      },
                      { class: "text-button" },
                    ),
                  ),
                  h("strong", {}, money(l.qty * (l.p.price + l.v.extra))),
                ),
              ),
              ),
              h(
                "div",
                { class: "total" },
                h("span", {}, experience ? appliedCredit > 0 ? "Subtotal" : "Amount due" : "Demo total"),
                h("strong", {}, money(total)),
              ),
              checkoutMode === 'member' && customer?.member && customer.credits.enabled ? h('section', { 'aria-label': 'Return credit at checkout' },
                h('h2', {}, 'Use return credit'), h('p', {}, money(customer.credits.available) + ' available'),
                h('label', { class: 'field' }, h('input', { type: 'checkbox', checked: appliedCredit > 0, onchange: e => { creditChoice = e.target.checked ? Math.min(total, customer.credits.available) : 0; render(); } }), 'Apply my return credit'),
                appliedCredit > 0 ? h('label', { class: 'field' }, 'Credit amount ($)', h('input', { type: 'text', inputmode: 'decimal', value: centsToDollars(appliedCredit), onchange: e => { try { const next = dollarsToCents(e.target.value); if (next > Math.min(total, customer.credits.available)) throw new Error('Credit cannot exceed your available balance or order subtotal.'); creditChoice = next; render(); } catch (problem) { e.target.value = centsToDollars(appliedCredit); notify(problem.message, true); } } })) : null,
                h('p', {}, 'Credit applied: −' + money(appliedCredit)), h('strong', {}, 'Remaining amount due: ' + money(remainingDue)),
                h('p', { class: 'small-note' }, remainingDue === 0 ? 'Fully covered by return credit. No external payment is needed.' : 'Credit is reserved when your order is saved and used after Danielle verifies the remaining payment. Canceled reservations are released.')) : null,
              h("p", { class: "small-note" }, notificationsEnabled
                ? "Your confirmation and order updates will be emailed automatically to your contact email above. No marketing messages. You can always save or print your confirmation."
                : experience ? "Email confirmations are not available yet. Your order number and private tracking link will appear on your confirmation. Save or print it for your records." : "Email is not connected for this beta site. You will receive a private order tracking link instead."),
              commerceEnabled ? h('div', { class: 'checkout-policy' }, h('h3', {}, 'Sales, cancellation & pickup policy'), POLICY.map((paragraph, i) => h('p', {}, i === 2 ? h('strong', {}, paragraph) : paragraph)),
                h('label', { class: 'field' }, h('input', { type: 'checkbox', checked: policyAccepted, required: true, onchange: e => { policyAccepted = e.target.checked; updateActionValidity(); }, 'aria-label': 'I have read and acknowledge the Rise & Roost Sales, Cancellation & Pickup Policy, including the no-refund terms' }), 'I have read and acknowledge the Rise & Roost Sales, Cancellation & Pickup Policy, including the no-refund terms')) : null,
              action,
              h(
                "p",
                { class: "small-note" },
                experience ? (productionMode ? "Your order is saved before payment. Danielle verifies payment manually." : "Test preorder · No payment is processed. Save your private tracking link.") : "No card details. No payment. No real order.",
              ),
            ),
          ),
    );
  }
  function customerPage(page) {
    if (page.slug === "/") {
      // Presentation only: never remove or rewrite sections in the saved document.
      const welcome = page.sections.find(s => s.type === "hero" && !s.hidden) || {
        type: "hero", id: "welcome", title: doc.business.story, body: "", padding: 72, fontSize: 72, align: "left",
      };
      return [renderSection(welcome, page), freshSection()];
    }
    if (page.slug === "/shop") return [h("section", { class: "section-inner shop-page", "aria-label": page.title },
      h("div", { class: "page-intro" }, h("h1", {}, page.title)),
      h("div", { class: "product-grid" }, doc.products.filter(p => visibleProduct(p) && sellingMethod(p) !== 'in-store').map(card))), freshSection()];
    return page.sections.map(s => renderSection(s, page));
  }
  function render() {
    if (!doc) return;
    const t = doc.theme;
    const pageTitle = path === "/" ? "Home" : path === "/roost/settings" ? "Account Settings" : path === "/roost" ? "The Roost" : path === "/comments" ? "Leave a Comment" : path === "/cart" ? "Basket" : path.startsWith("/product/") ? doc.products.find(p => p.id === path.split("/")[2])?.name : doc.pages.find(p => p.slug === path)?.title;
    document.title = doc.business.name + (experience ? " · " + (pageTitle || "Page") : " · Website beta");
    const site = h("div", {
      class: "site-root" + (experience ? " experience" : ""),
      style: {
        "--paper": t.background,
        "--surface": t.surface,
        "--ink": t.ink,
        "--green": t.primary,
        "--accent": t.accent,
        "--muted": t.muted,
        "--heading": `"${t.font}",serif`,
        "--body": `"${t.bodyFont}",sans-serif`,
        "--width": t.width + "px",
        "--radius": t.radius + "px",
        "--button-radius": t.buttonRadius + "px",
        fontSize: t.fontSize + "px",
      },
    });
    if (t.compiledCSS) site.append(h("style", {}, t.compiledCSS));
    site.append(
      h(
        "div",
        { class: "demo-bar", hidden: productionMode && !isPreview },
        isPreview
          ? "UNPUBLISHED PREVIEW · Read only · Simulation disabled"
          : experience ? "Private review · Test orders only · No payments" : "WEBSITE BETA · Sample products · No real payments",
        !experience ? h("a", { href: studioPath }, "Open Website Studio ↗") : null,
      ),
      h("div", { class: "announcement" }, doc.ui.announcement),
      h(
        "header",
        { class: "site-header section-inner" },
        link(
          "/",
          [
            h("img", { src: doc.business.logo, alt: doc.business.logoAlt }),
            h("span", {}, doc.business.name),
          ],
          "brand",
        ),
        experience && path === "/" ? null : h(
          "nav",
          { "aria-label": "Main navigation" },
          experience ? [["/shop", "Shop"], ["/roost", "The Roost"], ["/comments", "Comments"]].map(([href, title]) => {
            const active = path === href || (href === "/shop" && path.startsWith("/product/"));
            const item = link(href, title, active ? "active" : "");
            if (active) item.setAttribute("aria-current", "page");
            return item;
          }) : doc.pages
            .filter((p) => p.showInNav)
            .map((p) => link(p.slug, p.title, path === p.slug ? "active" : "")),
        ),
        link(
          "/cart",
          [
            experience ? "Basket" : doc.ui.cart,
            h(
              "span",
              { class: "basket-count" },
              cart.lines.reduce((n, l) => n + l.qty, 0),
            ),
          ],
          "basket-link",
        ),
      ),
    );
    if (path === "/subscribe") site.append(h("main", {class:"section-inner"}, subscriptionPanel || (marketingSignupEnabled ? subscriptionForm() : h("p", {}, "Bakery email signup will be available soon."))));
    else if (path === "/cart") site.append(renderCart());
    else if (experience && ["/roost", "/roost/settings"].includes(path)) site.append(customer.roost(path === "/roost/settings"));
    else if (experience && path === "/comments") site.append(customer.commentPage());
    else if (path.startsWith("/product/"))
      site.append(productDetail(path.split("/")[2]));
    else {
      const page = doc.pages.find((p) => p.slug === path);
      site.append(
        page
          ? h(
              "main",
              { id: "main-content" },
              experience ? customerPage(page) : [...page.sections.map(s => renderSection(s, page)), ...(['/', '/shop'].includes(page.slug) ? [freshSection()] : [])],
            )
          : h(
              "main",
              { class: "section-inner empty-state" },
              h("h1", {}, "This page is not available."),
              link("/", doc.ui.continue),
            ),
      );
    }
    const main = site.querySelector("main");
    if (path === '/terms') main.prepend(h('section', { id: 'order-policy', class: 'section-inner' }, h('h1', {}, POLICY_TITLE), ...POLICY.map(paragraph => h('p', {}, paragraph))));
    if (experience) site.querySelector(".brand").setAttribute("aria-label", doc.business.name + " home");
    main.id = "main-content";
    main.tabIndex = -1;
    site.prepend(
      h("a", { href: "#main-content", class: "skip-link" }, "Skip to content"),
    );
    if(marketingSignupEnabled && ["/", "/shop"].includes(path)) main.append(subscriptionForm());
    site.append(experience ? h("footer", { class: "site-footer" },
      h("div", { class: "section-inner customer-footer" }, h("p", {}, doc.ui.footer),
        doc.pages.filter(p => p.slug === "/terms").map(p => link(p.slug, p.title)))) :
      h(
        "footer",
        { class: "site-footer" },
        h(
          "div",
          { class: "section-inner footer-grid" },
          h(
            "div",
            {},
            h("h2", {}, doc.business.name),
            h("p", {}, doc.ui.footer),
          ),
          h(
            "div",
            {},
            h("strong", {}, doc.business.hours),
            h("p", {}, experience && doc.business.address === "Add your farm stand address in Website Studio" ? "Pickup details are included with your order." : doc.business.address),
          ),
          h(
            "div",
            {},
            (experience ? doc.pages.filter(p => ["/about", "/visit", "/terms"].includes(p.slug)) : doc.pages).map((p) => link(p.slug, p.title)),
            experience ? link("/comments", "Leave a Comment") : null,
            experience ? h("a", { href: studioPath }, "Website Studio") : null,
            !experience ? h("p", { class: "small-note" }, doc.ui.terms) : null,
            !experience ? h("p", { class: "small-note" }, doc.ui.privacy) : null,
          ),
        ),
      ),
    );
    // Keep the mandatory beta notice outside the editable/scoped theme.
    const betaNotice = site.querySelector(".demo-bar");
    if (productionMode && !isPreview) { betaNotice?.remove(); root.replaceChildren(site); }
    else root.replaceChildren(betaNotice, site);
    // Keep a later selected date visible when another checkout control redraws
    // the list, without moving the customer's page or opening a native picker.
    const pickupOptions = site.querySelector('.pickup-options');
    const selectedPickup = pickupOptions?.querySelector('[aria-pressed="true"]');
    if (selectedPickup) {
      const bottom = selectedPickup.getBoundingClientRect().bottom - pickupOptions.getBoundingClientRect().top;
      if (bottom > pickupOptions.clientHeight) pickupOptions.scrollTop = bottom - pickupOptions.clientHeight + 4;
    }
  }
  let loadSequence = 0;
  function ensureCustomer() {
    if (experience && workspace && customerWorkspace !== workspace) {
      customerWorkspace = workspace;
      customer = createCustomerExperience({ workspaceId: workspace, link, navigate, render, getDocument: () => doc, productCard: card, readOnly: isPreview || editing,
        onMember: member => {
          creditChoice = 0;
          // Clear private values on sign-out/account switches; preserve input typed
          // while the initial authenticated profile request is still in flight.
          if (checkoutMemberId && checkoutMemberId !== member?.id) {
            checkoutProfile = { name: "", email: "", phone: "" }; checkoutTouched.clear(); checkoutGuestChosen = false;
          }
          checkoutMemberId = member?.id || null;
          checkoutMode = member && !checkoutGuestChosen ? "member" : "guest";
          if (member && !checkoutGuestChosen) for (const key of ["name", "email", "phone"]) {
            if (!checkoutTouched.has(key)) checkoutProfile[key] = member.profile[key] || "";
          }
          checkoutEmail = checkoutProfile.email;
        } });
      void customer.refresh();
    }
  }
  const siteEndpoint = () => isPreview
    ? (match[1] === 'studio/preview' ? '/studio' : '') + "/api/preview/" + match[2]
    : "/api/site" + (prefix.startsWith("/demo/") ? "?workspace=" + workspace : "");
  async function load(force = true) {
    const sequence = ++loadSequence;
    const result = await request(
      siteEndpoint(),
    );
    if (sequence !== loadSequence) return;
    if (editing && previewDocumentReceived) return;
    serverOffset = (result.serverNow || Date.now()) - Date.now();
    if (result.id === workspace && (result.revision < revision ||
      (result.revision === revision && result.availabilityRevision < availabilityRevision))) return;
    const changed = result.id !== workspace || result.revision !== revision;
    if (!force && !changed && result.availabilityRevision === availabilityRevision && JSON.stringify(result.document.pickups) === JSON.stringify(doc.pickups)) {
      if (experience && await customer.refresh(false)) render();
      if (experience && path === '/comments') await customer.refreshComments();
      return;
    }
    doc = result.document;
    automaticCalendar = result.studioManagementEnabled === true;
    clearTimeout(calendarTimer);
    if (automaticCalendar) {
      const next = Math.min(...doc.pickups.map(p => localInstant(p.cutoffDate, p.cutoffTime)).filter(at => at > calendarNow()));
      if (Number.isFinite(next)) calendarTimer = setTimeout(() => {
        render(); void load(true).catch(error => notify(error.message, true));
      }, Math.min(2147483647, Math.max(1, next - calendarNow() + 1)));
    }
    productionMode = result.productionMode === true;
    checkoutEnabled = result.checkoutEnabled !== false;
    experience = !!result.customerExperienceEnabled;
    commerceEnabled = !!result.commerceEnabled;
    notificationsEnabled = !!result.notificationsEnabled; marketingSignupEnabled=result.marketingSignupEnabled===true;
    revision = result.revision || 1;
    availabilityRevision = result.availabilityRevision || 0;
    workspace = result.id || workspace;
    ensureCustomer();
    studioPath = result.studioPath || (result.id ? "/studio?workspace=" + result.id : "/studio");
    if (!force && experience) await customer.refresh(false);
    if (!force && experience && path === '/comments') {
      await customer.refreshComments(changed ? false : true);
      if (!changed) return;
    }
    render();
    if (!force && changed) notify("The published website has updated. Please review your basket before requesting.");
  }
  guard(load)();
  if (!editing && !isPreview) {
    setInterval(
      guard(async () => {
        if (document.hidden) return;
        await load(false);
      }),
      5000,
    );
    window.addEventListener("online", guard(load));
    window.addEventListener("focus", guard(() => load(false)));
    document.addEventListener("visibilitychange", guard(async () => {
      if (!document.hidden) await load(false);
    }));
  }
}
