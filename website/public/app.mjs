import { h, button, notify, request, guard } from "./dom.mjs";
import { money, localInstant, pickupLabel } from "./model.mjs";
import { createCustomerExperience } from "./customer.mjs";
import { pickupLocation } from "./pickup-location.mjs";

const root = document.querySelector("#app");
if (
  location.pathname === "/studio" ||
  location.pathname.startsWith("/studio/")
) {
  import("./studio.mjs")
    .then((m) => m.start(root))
    .catch((e) => notify(e.message, true));
} else if (location.pathname.startsWith("/orders/")) {
  import("./tracking.mjs").then((m) => m.start(root)).catch((e) => notify(e.message, true));
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
    checkoutEmail = "",
    emailOptIn = false;
  let experience = false, customer, customerWorkspace = "", checkoutMode = "guest";
  let checkoutProfile = { name: "", email: "", phone: "" };
  const editing = new URLSearchParams(location.search).has("studio-preview");
  let previewDocumentReceived = false;
  const match = location.pathname.match(
    /^\/(demo|preview)\/([a-f0-9]{48})(.*)$/,
  );
  if (match) {
    prefix = "/" + match[1] + "/" + match[2];
    path = match[3] || "/";
    workspace = match[1] === "demo" ? match[2] : "";
    isPreview = match[1] === "preview";
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
      : h("div", { class: "photo-empty" }, "Add your photo in Studio");
  // Presentation-only cleanup of the known starter wording; saved documents stay intact.
  const customerCopy = text => !experience ? text : text
    .replace(" This is our editable starter story — make it yours.", "")
    .replace(" All schedules shown are examples.", "")
    .replace(" Sample product and price.", "");
  function card(p) {
    let selected = p.variants[0];
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
          experience ? (soldOut(p) ? doc.ui.soldOut : p.category) : [p.category, availabilityLabel(p)].filter(Boolean).join(" · "),
        ),
        link("/product/" + p.id, h("h3", {}, p.name)),
        h(
          "div",
          { class: "price-line" },
          cardPrice,
          link("/product/" + p.id, "↗", "round-link"),
        ),
        experience ? h("div", { class: "quick-add" },
          p.variants.length > 1 ? h("select", { "aria-label": "Choose variety for " + p.name, onchange: e => { selected = p.variants.find(v => v.id === e.target.value); cardPrice.textContent = money(p.price + selected.extra); } }, p.variants.map(v => h("option", { value: v.id }, v.name + (v.extra ? " · +" + money(v.extra) : "")))) : null,
          button(soldOut(p) ? doc.ui.soldOut : p.channel === "store" ? doc.ui.inStore : "Add to basket", () => add(p, selected), { class: "primary-link", disabled: soldOut(p) || p.channel === "store" || isPreview || editing, "aria-label": soldOut(p) ? p.name + " is sold out" : "Add " + p.name + " to basket" })) : null,
      ),
    );
  }
  const soldOut = (p) => p.stock === 0 || p.capacity === 0;
  const availabilityLabel = (p) =>
    soldOut(p) ? doc.ui.soldOut : p.channel === "store" ? doc.ui.inStore : doc.ui.preorder;
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
              alt: "Sample bread illustration; upload your own photography in Studio",
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
            doc.products.filter((p) => p.active).map(card),
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
              h("p", {}, item.body),
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
                h("p", {}, item.body),
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
            h("p", {}, doc.ui.contactBody),
            doc.business.email
              ? h(
                  "a",
                  { href: "mailto:" + doc.business.email },
                  doc.business.email,
                )
              : h(
                  "p",
                  {},
                  "Public contact details are not configured in this demo.",
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
    const p = doc.products.find((p) => p.id === id && p.active);
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
    const action = button(
      soldOut(p)
        ? doc.ui.soldOut
        : p.channel === "store"
          ? doc.ui.inStore
          : doc.ui.add,
      () => add(p, variant),
      {
        class: "primary-link",
        disabled:
          soldOut(p) || p.channel === "store" || isPreview || editing,
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
        h("label", { class: "field" }, doc.ui.variety || "Variety", select),
        action,
        h("p", { class: "small-note" }, doc.ui.policy),
      ),
    );
  }
  function renderCart() {
    if (receipt)
      return h(
        "main",
        { class: "section-inner empty-state receipt" },
        !experience ? h("span", { class: "eyebrow" }, "DEMO · NO PAYMENT") : null,
        h("h1", {}, experience ? "Thank you. Your preorder is in." : doc.ui.simulated),
        h("p", {}, "Order number: " + (receipt.orderNumber || receipt.id.slice(0, 10))),
        h("p", {}, pickupLabel(receipt.pickup)),
        experience ? pickupLocation() : null,
        !experience ? h(
          "p",
          {},
          doc.ui.orderBy +
            ": " +
            receipt.pickup.cutoffDate +
            " at " +
            receipt.pickup.cutoffTime +
            " (Indianapolis)",
        ) : null,
        h("h2", {}, money(receipt.total)),
        h(
          "p",
          {},
          experience ? "Follow your payment and pickup status using your private order link. Payment is confirmed only after independent verification." : "Your beta request was received. Open Track your order for its current payment, preparation, and pickup status. This website has not processed a payment.",
        ),
        receipt.trackingPath ? h("p", {}, h("a", { href: receipt.trackingPath, class: "primary-link" }, "Track your order")) : null,
        h("p", { class: "small-note" }, experience ? "Save your private tracking link. This test preorder does not process a payment." : "Save your private tracking link to view this order on another device. Email is optional and is sent only when configured and requested."),
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
    const select = h(
      "select",
      {
        id: "pickup-select",
        "aria-label": doc.ui.pickup,
        onchange: (e) => {
          cart.pickupId = e.target.value;
          cart.requestId = crypto.randomUUID();
          saveCart();
          render();
        },
      },
      h("option", { value: "" }, doc.ui.pickup),
      doc.pickups.map((p) => {
        const closed =
          p.closed ||
          Date.now() >= localInstant(p.cutoffDate, p.cutoffTime) ||
          p.capacity === 0;
        return h(
          "option",
          { value: p.id, selected: cart.pickupId === p.id, disabled: closed },
          pickupLabel(p) + (closed ? " · Closed" : ""),
        );
      }),
    );
    const chosen = doc.pickups.find((p) => p.id === cart.pickupId);
    const emailInput = h("input", {
      type: "email", "aria-label": "Email for order updates", autocomplete: "email", maxlength: 254,
      value: checkoutEmail, disabled: !notificationsEnabled,
      oninput: (e) => { checkoutEmail = e.target.value; },
    });
    const emailConsent = h("input", {
      type: "checkbox", checked: emailOptIn, disabled: !notificationsEnabled,
      "aria-label": "Email me order updates",
      onchange: (e) => { emailOptIn = e.target.checked; emailInput.required = emailOptIn; },
    });
    emailInput.required = emailOptIn;
    const customerFields = experience ? h("div", { class: "checkout-details" },
      h("h2", {}, "Your pickup details"),
      h("p", { class: "small-note" }, "We’ll know who your order is for."),
      ...[["Name", "name", "text", "name"], ["Email (optional)", "email", "email", "email"], ["Phone (optional)", "phone", "tel", "tel"]].map(([label, key, type, autocomplete]) => h("label", { class: "field" }, label,
        h("input", { name: "checkout-" + key, type, autocomplete, required: key === "name", maxlength: key === "name" ? 80 : key === "phone" ? 32 : 254, value: checkoutProfile[key], oninput: e => checkoutProfile[key] = e.target.value })))) : null;
    const action = button(
      experience ? "Place preorder" : doc.ui.checkout,
      guard(async () => {
        if (emailOptIn && !emailInput.reportValidity()) return;
        if (experience) {
          const fields = [...customerFields.querySelectorAll("input")];
          if (fields.some(input => !input.reportValidity())) return;
          for (const key of ["name", "email", "phone"]) checkoutProfile[key] = customerFields.querySelector('[name="checkout-' + key + '"]').value;
        }
        action.disabled = true;
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
            emailOptIn: notificationsEnabled && emailOptIn,
            email: checkoutEmail,
            total,
            ...(experience ? { checkoutMode, customerDetails: checkoutProfile } : {}),
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
          if (experience) void customer.refresh(false);
          render();
        } finally {
          action.disabled = false;
        }
      }),
      {
        class: "primary-link",
        type: experience ? "submit" : "button",
        disabled: !chosen || !lines.length || isPreview || editing,
      },
    );
    return h(
      "main",
      { class: "section-inner cart-page" },
      h("h1", {}, doc.ui.cart),
      experience && lines.length ? h("div", { class: "checkout-mode", "aria-label": "Checkout options" },
        button("Guest checkout", () => { checkoutMode = "guest"; render(); }, { class: checkoutMode === "guest" ? "active" : "", "aria-pressed": checkoutMode === "guest" }),
        customer?.member ? button("Use my Roost details", () => { checkoutMode = "member"; checkoutProfile = { ...customer.member.profile }; render(); }, { class: checkoutMode === "member" ? "active" : "", "aria-pressed": checkoutMode === "member" }) : link("/roost", "Already a member? Sign in"),
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
            { class: "cart-layout", onsubmit: e => e.preventDefault() },
            h(
              "div",
              {},
              lines.map((l) =>
                h(
                  "div",
                  { class: "basket-line" },
                  img(l.p.images[0]),
                  h(
                    "div",
                    {},
                    h("h3", {}, l.p.name),
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
              customerFields,
            ),
            h(
              "aside",
              { class: "order-summary" },
              !experience ? h("span", { class: "eyebrow" }, "SIMULATION ONLY") : null,
              h("h2", {}, doc.ui.pickup),
              select,
              experience ? pickupLocation() : null,
              chosen
                ? h(
                    "div",
                    { class: "deadline" },
                    h("strong", {}, doc.ui.orderBy),
                    h(
                      "p",
                      {},
                      chosen.cutoffDate +
                        " at " +
                        chosen.cutoffTime +
                        " · America/Indiana/Indianapolis",
                    ),
                  )
                : null,
              !experience ? h("p", {}, doc.ui.policy) : null,
              h(
                "div",
                { class: "total" },
                h("span", {}, experience ? "Total" : "Demo total"),
                h("strong", {}, money(total)),
              ),
              !experience || notificationsEnabled ? h("label", { class: "field" }, h("span", {}, "Email for order updates (optional)"), emailInput) : null,
              !experience || notificationsEnabled ? h("label", { class: "field" }, h("span", {}, "Email me order receipt, verified payment, preparation, and pickup readiness"), emailConsent) : null,
              h("p", { class: "small-note" }, notificationsEnabled
                ? "Transactional updates only. Provider acceptance is shown on your private tracking page; inbox delivery is not guaranteed."
                : experience ? "Your confirmation includes a private order tracking link." : "Email is not connected for this beta site. You will receive a private order tracking link instead."),
              action,
              h(
                "p",
                { class: "small-note" },
                experience ? "Test preorder · No payment is processed. Save your private tracking link." : "No card details. No payment. No real order.",
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
      return renderSection(welcome, page);
    }
    if (page.slug === "/shop") return h("section", { class: "section-inner shop-page", "aria-label": page.title },
      h("div", { class: "page-intro" }, h("h1", {}, page.title)),
      h("div", { class: "product-grid" }, doc.products.filter(p => p.active).map(card)));
    return page.sections.map(s => renderSection(s, page));
  }
  function render() {
    if (!doc) return;
    const t = doc.theme;
    const pageTitle = path === "/" ? "Home" : path === "/roost" ? "The Roost" : path === "/comments" ? "Leave a Comment" : path === "/cart" ? "Basket" : path.startsWith("/product/") ? doc.products.find(p => p.id === path.split("/")[2])?.name : doc.pages.find(p => p.slug === path)?.title;
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
        { class: "demo-bar" },
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
        experience && path === "/" && !cart.lines.length ? null : link(
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
    if (path === "/cart") site.append(renderCart());
    else if (experience && path === "/roost") site.append(customer.roost());
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
              experience ? customerPage(page) : page.sections.map(s => renderSection(s, page)),
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
    if (experience) site.querySelector(".brand").setAttribute("aria-label", doc.business.name + " home");
    main.id = "main-content";
    main.tabIndex = -1;
    site.prepend(
      h("a", { href: "#main-content", class: "skip-link" }, "Skip to content"),
    );
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
    root.replaceChildren(betaNotice, site);
  }
  let loadSequence = 0;
  function ensureCustomer() {
    if (experience && workspace && customerWorkspace !== workspace) {
      customerWorkspace = workspace;
      customer = createCustomerExperience({ workspaceId: workspace, link, navigate, render, readOnly: isPreview || editing,
        onMember: member => { checkoutMode = member ? "member" : "guest"; checkoutProfile = member ? { ...member.profile } : { name: "", email: "", phone: "" }; } });
      void customer.refresh();
    }
  }
  const siteEndpoint = () => isPreview
    ? "/api/preview/" + match[2]
    : "/api/site" + (prefix.startsWith("/demo/") ? "?workspace=" + workspace : "");
  async function load(force = true) {
    const sequence = ++loadSequence;
    const result = await request(
      siteEndpoint(),
    );
    if (sequence !== loadSequence) return;
    if (editing && previewDocumentReceived) return;
    if (result.id === workspace && (result.revision < revision ||
      (result.revision === revision && result.availabilityRevision < availabilityRevision))) return;
    const changed = result.id !== workspace || result.revision !== revision;
    if (!force && !changed && result.availabilityRevision === availabilityRevision) {
      if (experience && path === "/roost" && await customer.refresh(false)) render();
      return;
    }
    doc = result.document;
    experience = !!result.customerExperienceEnabled;
    notificationsEnabled = !!result.notificationsEnabled;
    revision = result.revision || 1;
    availabilityRevision = result.availabilityRevision || 0;
    workspace = result.id || workspace;
    ensureCustomer();
    studioPath = result.studioPath || (result.id ? "/studio?workspace=" + result.id : "/studio");
    if (!force && experience && path === "/roost") await customer.refresh(false);
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
