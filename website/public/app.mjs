import { h, button, notify, request, guard } from "./dom.mjs";
import { money, localInstant, pickupLabel } from "./model.mjs";

const root = document.querySelector("#app");
if (
  location.pathname === "/studio" ||
  location.pathname.startsWith("/studio/")
) {
  import("./studio.mjs")
    .then((m) => m.start(root))
    .catch((e) => notify(e.message, true));
} else {
  let doc,
    revision = 1,
    availabilityRevision = 0,
    workspace = "",
    isPreview = false,
    prefix = "",
    path = "/",
    receipt;
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
    if (target.startsWith("/studio")) return;
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
  function card(p) {
    return h(
      "article",
      { class: "product-card" },
      link(
        "/product/" + p.id,
        [
          img(p.images[0]),
          p.placeholder
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
          [p.category, availabilityLabel(p)].filter(Boolean).join(" · "),
        ),
        link("/product/" + p.id, h("h3", {}, p.name)),
        h(
          "div",
          { class: "price-line" },
          h("span", {}, money(p.price)),
          link("/product/" + p.id, "↗", "round-link"),
        ),
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
      section.body ? h("p", {}, section.body) : null,
    );
    if (["hero", "split", "cta"].includes(section.type))
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
            h("div", { class: "art-label" }, doc.ui.heroStamp || "SLOW MADE. SOUL FED."),
            h(
              "div",
              { class: "hero-inset" },
              h("img", {
                src: "/assets/eggs.svg",
                alt: "Sample egg illustration",
              }),
              h("span", {}, doc.ui.artCaption || "A taste of the everyday good."),
            ),
            h(
              "span",
              { class: "sample-photo" },
              "Illustrated placeholders · Your photos go here",
            ),
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
          h("p", { class: "small-note" }, doc.ui.productNote),
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
        p.placeholder
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
        h("p", {}, p.description),
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
        h("span", { class: "eyebrow" }, "DEMO · NO PAYMENT"),
        h("h1", {}, doc.ui.simulated),
        h("p", {}, "Reference: " + receipt.id.slice(0, 10)),
        h("p", {}, pickupLabel(receipt.pickup)),
        h(
          "p",
          {},
          doc.ui.orderBy +
            ": " +
            receipt.pickup.cutoffDate +
            " at " +
            receipt.pickup.cutoffTime +
            " (Indianapolis)",
        ),
        h("h2", {}, money(receipt.total)),
        h(
          "p",
          {},
          "Status: pending · Payment: not collected · No real fulfillment",
        ),
        link("/shop", doc.ui.continue, "primary-link"),
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
    const action = button(
      doc.ui.checkout,
      guard(async () => {
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
            workspaceId: workspace,
            revision,
            requestId: cart.requestId,
            pickupId: cart.pickupId,
            total,
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
          render();
        } finally {
          action.disabled = false;
        }
      }),
      {
        class: "primary-link",
        disabled: !chosen || !lines.length || isPreview || editing,
      },
    );
    return h(
      "main",
      { class: "section-inner cart-page" },
      h("h1", {}, doc.ui.cart),
      !lines.length
        ? h(
            "div",
            { class: "empty-state" },
            h("p", {}, doc.ui.empty),
            link("/shop", doc.ui.shop, "primary-link"),
          )
        : h(
            "div",
            { class: "cart-layout" },
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
            ),
            h(
              "aside",
              { class: "order-summary" },
              h("span", { class: "eyebrow" }, "SIMULATION ONLY"),
              h("h2", {}, doc.ui.pickup),
              select,
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
              h("p", {}, doc.ui.policy),
              h(
                "div",
                { class: "total" },
                h("span", {}, "Demo total"),
                h("strong", {}, money(total)),
              ),
              action,
              h(
                "p",
                { class: "small-note" },
                "No card details. No payment. No real order.",
              ),
            ),
          ),
    );
  }
  function render() {
    if (!doc) return;
    const t = doc.theme;
    document.title = doc.business.name + " · Website beta";
    const site = h("div", {
      class: "site-root",
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
          : "WEBSITE BETA · Sample products · No real payments",
        h("a", { href: "/studio" }, "Open Website Studio ↗"),
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
        h(
          "nav",
          { "aria-label": "Main navigation" },
          doc.pages
            .filter((p) => p.showInNav)
            .map((p) => link(p.slug, p.title, path === p.slug ? "active" : "")),
        ),
        link(
          "/cart",
          [
            doc.ui.cart,
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
    else if (path.startsWith("/product/"))
      site.append(productDetail(path.split("/")[2]));
    else {
      const page = doc.pages.find((p) => p.slug === path);
      site.append(
        page
          ? h(
              "main",
              { id: "main-content" },
              page.sections.map((s) => renderSection(s, page)),
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
    main.id = "main-content";
    main.tabIndex = -1;
    site.prepend(
      h("a", { href: "#main-content", class: "skip-link" }, "Skip to content"),
    );
    site.append(
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
            h("p", {}, doc.business.address),
          ),
          h(
            "div",
            {},
            doc.pages.map((p) => link(p.slug, p.title)),
            h("p", { class: "small-note" }, doc.ui.terms),
            h("p", { class: "small-note" }, doc.ui.privacy),
          ),
        ),
      ),
    );
    // Keep the mandatory beta notice outside the editable/scoped theme.
    const betaNotice = site.querySelector(".demo-bar");
    root.replaceChildren(betaNotice, site);
  }
  async function load() {
    const result = await request(
      isPreview
        ? "/api/preview/" + match[2]
        : "/api/site" + (workspace ? "?workspace=" + workspace : ""),
    );
    if (editing && previewDocumentReceived) return;
    doc = result.document;
    revision = result.revision || 1;
    availabilityRevision = result.availabilityRevision || 0;
    workspace = result.id || workspace;
    render();
  }
  guard(load)();
  if (!editing && !isPreview) {
    setInterval(
      guard(async () => {
        if (document.hidden) return;
        const result = await request(
          "/api/site" + (workspace ? "?workspace=" + workspace : ""),
        );
        if (result.revision !== revision || result.availabilityRevision !== availabilityRevision) {
          const contentChanged = result.revision !== revision;
          doc = result.document;
          revision = result.revision;
          availabilityRevision = result.availabilityRevision;
          render();
          if (contentChanged) notify(
            "The published website has updated. Please review your basket before requesting.",
          );
        }
      }),
      5000,
    );
    window.addEventListener("online", guard(load));
  }
}
