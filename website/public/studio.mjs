import { h, button, field, request, notify, guard } from "./dom.mjs";
import { seed, clone, money } from "./model.mjs";

export async function start(root) {
  let state,
    doc,
    tab = "Home",
    pageId = "home",
    sectionId = "hero",
    productId = "bread",
    dirty = false,
    timer,
    saving = false,
    accessKey;
  let undo = [],
    redo = [],
    device = 1280,
    frame,
    frameObserver;
  const tabs = [
    "Home",
    "Website",
    "Products",
    "Pickup Schedule",
    "Orders",
    "Business & Copy",
    "Advanced Design",
    "Version History",
  ];
  const name = (s) =>
    s.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
  const preview = () =>
    frame?.contentWindow?.postMessage(
      {
        type: "studio-document",
        document: doc,
        path: doc.pages.find((p) => p.id === pageId)?.slug || "/",
      },
      location.origin,
    );
  const savedLabel = () => {
    const el = document.querySelector("#saved-status");
    if (el)
      el.textContent = saving
        ? "Saving draft…"
        : dirty
          ? "Unsaved draft"
          : "Draft saved";
  };
  const changed = (fn) => {
    undo.push(clone(doc));
    if (undo.length > 50) undo.shift();
    redo = [];
    fn();
    dirty = true;
    savedLabel();
    preview();
    const undoButton = document.querySelector("#undo-draft");
    if (undoButton) undoButton.disabled = false;
    clearTimeout(timer);
    timer = setTimeout(() => guard(save)(), 1000);
  };
  async function save() {
    clearTimeout(timer);
    if (saving) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return save();
    }
    if (!dirty) return;
    saving = true;
    savedLabel();
    const snapshot = JSON.stringify(doc);
    try {
      const result = await request("/api/draft", {
        revision: state.revision,
        document: JSON.parse(snapshot),
      });
      state = result;
      if (snapshot === JSON.stringify(doc)) {
        doc.theme.compiledCSS = result.draft.theme.compiledCSS;
        dirty = false;
      } else {
        clearTimeout(timer);
        timer = setTimeout(() => guard(save)(), 1000);
      }
      preview();
    } finally {
      saving = false;
      savedLabel();
    }
  }
  const textField = (label, obj, key, options) =>
    field(
      label,
      obj[key] ?? "",
      (value) =>
        changed(() => {
          obj[key] = value;
        }),
      options,
    );
  const numberField = (label, obj, key, min = 0, max = 10000) =>
    field(
      label,
      obj[key],
      (value) =>
        changed(() => {
          obj[key] = Math.round(Number(value));
        }),
      { type: "number", min, max },
    );
  function adopt(result) {
    state = result;
    doc = clone(result.draft);
    dirty = false;
    render();
  }
  async function upload(file) {
    if (!file) return null;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 12000000
    )
      throw new Error("Choose a JPG, PNG, or WebP under 12 MB.");
    const bitmap = await createImageBitmap(file);
    if (bitmap.width * bitmap.height > 40000000) {
      bitmap.close();
      throw new Error("This photo is too large. Choose a smaller image.");
    }
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas
      .getContext("2d")
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    // Re-encoding removes metadata and embedded source payloads; Safari can fall back to PNG.
    const dataURL = canvas.toDataURL("image/webp", 0.84),
      [header, data] = dataURL.split(",");
    const result = await request("/api/upload", {
      mime: header.match(/^data:([^;]+)/)[1],
      data,
    });
    return result.src;
  }
  function photoUpload(label, callback) {
    return h(
      "label",
      { class: "upload-button" },
      label,
      h("input", {
        type: "file",
        accept: "image/png,image/jpeg,image/webp",
        "aria-label": label,
        onchange: guard(async (e) => {
          const src = await upload(e.target.files[0]);
          if (src) {
            changed(() => callback(src));
            render();
            notify("Photo uploaded. Adjust its focal point below.");
          }
        }),
      }),
    );
  }
  function login() {
    let id = "",
      key = "";
    root.replaceChildren(
      h(
        "main",
        { class: "studio-login" },
        h(
          "div",
          { class: "login-brand" },
          h("img", { src: "/assets/logo.webp", alt: "Rise & Roost logo" }),
          h("span", {}, "DANIELLE’S WEBSITE STUDIO"),
        ),
        h(
          "div",
          { class: "login-card" },
          h("span", { class: "eyebrow" }, "YOUR OWN LITTLE CORNER OF THE FARM"),
          h("h1", {}, "Make it yours."),
          h(
            "p",
            {},
            "A beautiful beginning, with room for every idea. Create a private demo to edit, preview, and publish sample changes together.",
          ),
          button(
            "Create my private demo",
            guard(async () => {
              const result = await request("/api/workspaces", {});
              accessKey = result.accessKey;
              adopt(result);
            }),
            { class: "primary-link", id: "create-demo" },
          ),
          h(
            "p",
            { class: "small-note" },
            "Isolated sample data. No real store changes. No payments.",
          ),
          h(
            "details",
            {},
            h("summary", {}, "Return to an existing workspace"),
            h(
              "form",
              {
                onsubmit: guard(async (e) => {
                  e.preventDefault();
                  adopt(await request("/api/login", { id, accessKey: key }));
                }),
              },
              field("Workspace ID", id, (v) => (id = v), {
                required: true,
                autocomplete: "off",
              }),
              field("Private access key", key, (v) => (key = v), {
                type: "password",
                required: true,
                autocomplete: "current-password",
              }),
              h(
                "button",
                { class: "secondary-button", type: "submit" },
                "Sign in",
              ),
            ),
          ),
        ),
        h("a", { href: "/" }, "← View the sample storefront"),
      ),
    );
  }
  function quickSetup() {
    const steps = [
      [
        "Business info",
        "Your name, location, contact, and hours.",
        "Business & Copy",
      ],
      [
        "Logo & photos",
        "Start with the farmhouse look. Add your own images.",
        "Website",
      ],
      [
        "Your first products",
        "Photos, descriptions, prices, and varieties.",
        "Products",
      ],
      [
        "Pickup & order deadlines",
        "Dates, local cutoff times, and capacity.",
        "Pickup Schedule",
      ],
      [
        "Preview & publish",
        "Check every screen, then publish your private demo.",
        "Website",
      ],
    ];
    const completed = Object.values(doc.setup || {}).filter(Boolean).length;
    return h(
      "div",
      {},
      h("span", { class: "eyebrow" }, "A GOOD PLACE TO START"),
      h("h2", {}, "Welcome, Danielle."),
      h(
        "p",
        {},
        "Five small steps. One lovely website. Everything starts with sensible defaults, and nothing goes live until you publish.",
      ),
      h(
        "div",
        { class: "progress-track" },
        h("span", { style: { width: (completed / 5) * 100 + "%" } }),
      ),
      h("p", { class: "small-note" }, completed + " of 5 steps checked"),
      steps.map(([title, description, next], i) =>
        h(
          "div",
          { class: "setup-step" },
          h("input", {
            type: "checkbox",
            checked: doc.setup?.[i] || false,
            "aria-label": "Complete " + title,
            onchange: (e) => {
              changed(() => {
                doc.setup ||= {};
                doc.setup[i] = e.target.checked;
              });
              render();
            },
          }),
          button(
            h(
              "span",
              {},
              h("strong", {}, `${i + 1}. ${title}`),
              h("small", {}, description),
            ),
            () => {
              tab = next;
              render();
            },
            { class: "step-link" },
          ),
        ),
      ),
      h(
        "div",
        { class: "studio-note" },
        h("strong", {}, "Simple Edit is your default."),
        h(
          "p",
          {},
          "Write, arrange, and upload here. Professional typography, colors, spacing, and custom CSS are waiting under Advanced Design.",
        ),
      ),
      h(
        "p",
        { class: "small-note" },
        "Square payments and live customer accounts are future integrations. This demo never connects to them.",
      ),
    );
  }
  function websitePanel() {
    const page = doc.pages.find((p) => p.id === pageId) || doc.pages[0];
    pageId = page.id;
    const section =
      page.sections.find((s) => s.id === sectionId) || page.sections[0];
    sectionId = section?.id;
    let nextTitle = "",
      nextSlug = "",
      type = "text";
    const move = (from, to) => {
      if (to < 0 || to >= page.sections.length) return;
      changed(() => {
        const [s] = page.sections.splice(from, 1);
        page.sections.splice(to, 0, s);
      });
      render();
    };
    return h(
      "div",
      {},
      h("span", { class: "eyebrow" }, "SIMPLE EDIT"),
      h("h2", {}, "Your website, your words."),
      field(
        "Page",
        page.id,
        (value) => {
          pageId = value;
          sectionId = "";
          render();
        },
        { choices: doc.pages.map((p) => ({ value: p.id, label: p.title })) },
      ),
      textField("Page title / menu label", page, "title"),
      page.slug !== "/" ? textField("Page path", page, "slug") : null,
      field(
        "Show in main navigation",
        page.showInNav,
        (value) =>
          changed(() => {
            page.showInNav = value;
          }),
        { type: "checkbox" },
      ),
      h(
        "div",
        { class: "row-buttons" },
        button("Move page earlier", () => {
          const i = doc.pages.indexOf(page);
          if (i > 0) {
            changed(() => {
              doc.pages.splice(i, 1);
              doc.pages.splice(i - 1, 0, page);
            });
            render();
          }
        }),
        button("Delete page", () => {
          if (page.slug === "/") return notify("Keep your homepage.", true);
          if (confirm("Delete this page from the draft?")) {
            changed(() => {
              doc.pages = doc.pages.filter((p) => p.id !== page.id);
            });
            render();
          }
        }),
      ),
      h(
        "details",
        {},
        h("summary", {}, "Add a page"),
        field("New page title", "", (v) => (nextTitle = v)),
        field("New page path", "", (v) => (nextSlug = v), {
          placeholder: "/our-farm",
        }),
        button("Add page", () => {
          if (!nextTitle || !/^\/[a-z0-9-]+$/.test(nextSlug))
            return notify("Add a title and a path such as /our-farm.", true);
          changed(() => {
            const id = "page-" + crypto.randomUUID();
            doc.pages.push({
              id,
              slug: nextSlug,
              title: nextTitle,
              showInNav: true,
              sections: [],
            });
            pageId = id;
          });
          render();
        }),
      ),
      h("h3", {}, "Sections"),
      h(
        "p",
        { class: "small-note" },
        "Drag to rearrange, or use the arrow buttons. Click a section in the preview to edit it.",
      ),
      h(
        "div",
        { class: "section-list" },
        page.sections.map((s, i) =>
          h(
            "div",
            {
              class: "section-row " + (s.id === sectionId ? "selected" : ""),
              draggable: true,
              ondragstart: (e) =>
                e.dataTransfer.setData("text/plain", String(i)),
              ondragover: (e) => e.preventDefault(),
              ondrop: (e) => {
                e.preventDefault();
                const from = Number(e.dataTransfer.getData("text/plain"));
                if (
                  Number.isInteger(from) &&
                  from >= 0 &&
                  from < page.sections.length
                )
                  move(from, i);
              },
            },
            button(
              (s.hidden ? "○ " : "▤ ") + (s.title || s.type).slice(0, 34),
              () => {
                sectionId = s.id;
                render();
              },
              { class: "section-select" },
            ),
            button("↑", () => move(i, i - 1), {
              "aria-label": "Move section up",
              disabled: i === 0,
            }),
            button("↓", () => move(i, i + 1), {
              "aria-label": "Move section down",
              disabled: i === page.sections.length - 1,
            }),
          ),
        ),
      ),
      h(
        "div",
        { class: "add-section" },
        field("Section type", type, (value) => (type = value), {
          choices: [
            "hero",
            "text",
            "products",
            "split",
            "cta",
            "faq",
            "gallery",
            "cards",
            "visit",
            "contact",
          ],
        }),
        button("Add section", () => {
          changed(() => {
            const s = clone(seed().pages[0].sections[2]);
            s.id = "section-" + crypto.randomUUID();
            s.type = type;
            s.title = "A new beginning";
            s.body = "Click here and make these words yours.";
            page.sections.push(s);
            sectionId = s.id;
          });
          render();
        }),
      ),
      section
        ? h(
            "div",
            { class: "section-inspector" },
            h("h3", {}, "Edit selected section"),
            textField("Heading", section, "title", {
              type: "textarea",
              id: "section-heading",
            }),
            textField("Body copy", section, "body", { type: "textarea" }),
            textField("Button label", section, "button"),
            textField("Button link", section, "link"),
            photoUpload("Upload section photo", (src) => {
              section.image = src;
            }),
            textField("Photo alt text", section, "alt"),
            section.image
              ? h("img", {
                  class: "editor-thumb",
                  src: section.image,
                  alt: section.alt,
                })
              : null,
            section.image
              ? button("Remove section photo", () => {
                  changed(() => {
                    section.image = "";
                  });
                  render();
                })
              : null,
            ["faq", "cards", "gallery"].includes(section.type)
              ? h(
                  "div",
                  {},
                  section.items.map((item, i) =>
                    h(
                      "div",
                      { class: "sub-card" },
                      textField("Card " + (i + 1) + " title", item, "title"),
                      textField("Card text", item, "body", {
                        type: "textarea",
                      }),
                      photoUpload("Upload card photo " + (i + 1), (src) => {
                        item.image = src;
                      }),
                      textField("Card photo alt text", item, "alt"),
                      button("Remove card", () => {
                        changed(() => section.items.splice(i, 1));
                        render();
                      }),
                    ),
                  ),
                  button("Add card / FAQ", () => {
                    changed(() =>
                      section.items.push({
                        title: "Your heading",
                        body: "Your words go here.",
                        image: "",
                        alt: "",
                      }),
                    );
                    render();
                  }),
                )
              : null,
            h(
              "div",
              { class: "row-buttons" },
              button(section.hidden ? "Show section" : "Hide section", () => {
                changed(() => {
                  section.hidden = !section.hidden;
                });
                render();
              }),
              button("Duplicate section", () => {
                changed(() => {
                  const duplicate = clone(section);
                  duplicate.id = "section-" + crypto.randomUUID();
                  page.sections.push(duplicate);
                  sectionId = duplicate.id;
                });
                render();
              }),
              button("Delete section", () => {
                if (
                  confirm("Delete this section from the draft? You can undo.")
                ) {
                  changed(() =>
                    page.sections.splice(page.sections.indexOf(section), 1),
                  );
                  render();
                }
              }),
            ),
          )
        : h("p", {}, "Add your first section above."),
    );
  }
  function productPanel() {
    const p = doc.products.find((p) => p.id === productId) || doc.products[0];
    return h(
      "div",
      {},
      h("h2", {}, "Good things for the stand."),
      field(
        "Product",
        p?.id || "",
        (value) => {
          productId = value;
          render();
        },
        { choices: doc.products.map((p) => ({ value: p.id, label: p.name })) },
      ),
      button("Add product", () => {
        changed(() => {
          const p = clone(seed().products[0]);
          p.id = "product-" + crypto.randomUUID();
          p.name = "Your new product";
          doc.products.push(p);
          productId = p.id;
        });
        render();
      }),
      p
        ? h(
            "div",
            {},
            textField("Product name", p, "name"),
            textField("Product description", p, "description", {
              type: "textarea",
            }),
            textField("Category", p, "category"),
            field(
              "Price ($)",
              (p.price / 100).toFixed(2),
              (value) =>
                changed(() => {
                  p.price = Math.round(Number(value) * 100);
                }),
              { type: "number", min: 0, step: "0.01" },
            ),
            field(
              "Sales channel",
              p.channel,
              (value) =>
                changed(() => {
                  p.channel = value;
                }),
              {
                choices: [
                  { value: "preorder", label: "Online preorder" },
                  { value: "store", label: "In-store only" },
                ],
              },
            ),
            field(
              "Visible to customers",
              p.active,
              (value) =>
                changed(() => {
                  p.active = value;
                }),
              { type: "checkbox" },
            ),
            numberField("Total demo stock (0 = sold out)", p, "stock"),
            numberField("Maximum units per pickup", p, "capacity"),
            h("h3", {}, "Varieties"),
            p.variants.map((v, i) =>
              h(
                "div",
                { class: "sub-card" },
                textField("Variety " + (i + 1), v, "name"),
                field(
                  "Additional price ($)",
                  (v.extra / 100).toFixed(2),
                  (value) =>
                    changed(() => {
                      v.extra = Math.round(Number(value) * 100);
                    }),
                  { type: "number", step: "0.01", min: 0 },
                ),
                p.variants.length > 1
                  ? button("Remove variety", () => {
                      changed(() => p.variants.splice(i, 1));
                      render();
                    })
                  : null,
              ),
            ),
            button("Add variety", () => {
              changed(() =>
                p.variants.push({
                  id: "var-" + crypto.randomUUID(),
                  name: "New variety",
                  extra: 0,
                }),
              );
              render();
            }),
            h("h3", {}, "Photos & focal point"),
            h(
              "p",
              { class: "small-note" },
              "The first photo is featured. Upload your own photo from Finder; it is resized to 1600 pixels and stripped of metadata. Crop controls choose the focal point.",
            ),
            p.images.map((photo, i) =>
              h(
                "div",
                { class: "photo-editor" },
                h("img", {
                  src: photo.src,
                  alt: photo.alt,
                  style: { objectPosition: photo.x + "% " + photo.y + "%" },
                }),
                textField("Photo " + (i + 1) + " alt text", photo, "alt"),
                numberField("Crop horizontal (%)", photo, "x", 0, 100),
                numberField("Crop vertical (%)", photo, "y", 0, 100),
                photoUpload("Replace photo " + (i + 1), (src) => {
                  photo.src = src;
                  p.placeholder = false;
                }),
                button("Make featured", () => {
                  changed(() => {
                    p.images.splice(i, 1);
                    p.images.unshift(photo);
                  });
                  render();
                }),
                button("Remove photo", () => {
                  changed(() => p.images.splice(i, 1));
                  render();
                }),
              ),
            ),
            photoUpload("Add product photo", (src) => {
              p.images.push({ src, alt: p.name, x: 50, y: 50 });
              p.placeholder = false;
            }),
            button("Archive product", () => {
              if (confirm("Hide this product from the draft storefront?")) {
                changed(() => {
                  p.active = false;
                });
                render();
              }
            }),
          )
        : h("p", {}, "Add your first product."),
    );
  }
  function pickupPanel() {
    return h(
      "div",
      {},
      h("h2", {}, "A good time to stop by."),
      h(
        "p",
        {},
        "Dates and clock times use America/Indiana/Indianapolis, including daylight saving. Every request is rechecked on the server.",
      ),
      doc.pickups.map((p, i) =>
        h(
          "div",
          { class: "sub-card" },
          h("h3", {}, "Pickup window " + (i + 1)),
          textField("Pickup date", p, "date", { type: "date" }),
          textField("Starts at", p, "start", { type: "time" }),
          textField("Ends at", p, "end", { type: "time" }),
          textField("Order-by date", p, "cutoffDate", { type: "date" }),
          textField("Order-by time", p, "cutoffTime", { type: "time" }),
          numberField("Maximum demo orders", p, "capacity"),
          field(
            "Closed / holiday override",
            p.closed,
            (value) =>
              changed(() => {
                p.closed = value;
              }),
            { type: "checkbox" },
          ),
          button("Delete pickup window", () => {
            if (confirm("Delete this pickup window from the draft?")) {
              changed(() => doc.pickups.splice(i, 1));
              render();
            }
          }),
        ),
      ),
      button("Add pickup window", () => {
        changed(() => {
          const p = clone(seed().pickups[0]);
          p.id = "pickup-" + crypto.randomUUID();
          doc.pickups.push(p);
        });
        render();
      }),
    );
  }
  function businessPanel() {
    return h(
      "div",
      {},
      h("h2", {}, "Every word can be yours."),
      h("h3", {}, "Business information"),
      ["name", "tagline", "email", "address", "hours", "story", "logoAlt"].map(
        (key) => textField(name(key), doc.business, key),
      ),
      photoUpload("Upload your logo", (src) => {
        doc.business.logo = src;
      }),
      h("img", {
        class: "editor-thumb",
        src: doc.business.logo,
        alt: doc.business.logoAlt,
      }),
      button("Restore approved logo", () => {
        changed(() => {
          doc.business.logo = "/assets/logo.webp";
        });
        render();
      }),
      h("h3", {}, "Shared website copy"),
      h(
        "p",
        { class: "small-note" },
        "Navigation labels are editable in Website. Page sections hold their own headings and body copy. Required beta safety labels stay visible.",
      ),
      Object.keys(doc.ui).map((key) =>
        textField(name(key), doc.ui, key, { type: "textarea" }),
      ),
    );
  }
  function advancedPanel() {
    const t = doc.theme,
      section = doc.pages
        .find((p) => p.id === pageId)
        ?.sections.find((s) => s.id === sectionId);
    const fonts = [
      "Georgia",
      "Palatino",
      "Garamond",
      "Times New Roman",
      "system-ui",
      "Arial",
      "Verdana",
      "Trebuchet MS",
      "Courier New",
    ];
    return h(
      "div",
      {},
      h("span", { class: "eyebrow" }, "ADVANCED DESIGN"),
      h("h2", {}, "Room for your eye."),
      h(
        "p",
        {},
        "Professional design controls for the public website. These settings never restyle the Register or this secure Studio.",
      ),
      ["background", "surface", "ink", "primary", "accent", "muted"].map(
        (key) => textField(name(key), t, key, { type: "color" }),
      ),
      field(
        "Heading font",
        t.font,
        (value) =>
          changed(() => {
            t.font = value;
          }),
        { choices: fonts },
      ),
      field(
        "Body font",
        t.bodyFont,
        (value) =>
          changed(() => {
            t.bodyFont = value;
          }),
        { choices: fonts },
      ),
      numberField("Page width (px)", t, "width", 600, 1800),
      numberField("Body type size (px)", t, "fontSize", 12, 32),
      numberField("Card corner radius (px)", t, "radius", 0, 80),
      numberField("Button corner radius (px)", t, "buttonRadius", 0, 80),
      section
        ? h(
            "div",
            { class: "sub-card" },
            h("h3", {}, "Selected section: " + section.title.slice(0, 30)),
            textField("Section text color", section, "color", {
              placeholder: "#263b30 or blank",
            }),
            textField("Section background", section, "background", {
              placeholder: "#faf7f0 or blank",
            }),
            numberField(
              "Section heading size (px)",
              section,
              "fontSize",
              16,
              100,
            ),
            numberField(
              "Section vertical spacing (px)",
              section,
              "padding",
              0,
              160,
            ),
            field(
              "Alignment",
              section.align,
              (value) =>
                changed(() => {
                  section.align = value;
                }),
              { choices: ["left", "center", "right"] },
            ),
            button("Reset selected section style", () => {
              changed(() =>
                Object.assign(section, {
                  color: "",
                  background: "",
                  padding: 72,
                  fontSize: 48,
                  align: "left",
                }),
              );
              render();
            }),
          )
        : null,
      textField("Custom CSS (validated on save)", t, "customCSS", {
        type: "textarea",
        placeholder: "h1 { letter-spacing: -2px; }",
      }),
      h(
        "p",
        { class: "small-note" },
        "Selectors are scoped to the public website. No scripts, HTML embeds, imports, external URLs, or security-sensitive CSS. Responsive layout adapts automatically on phone/tablet. CSS changes appear after successful validation and Save Draft.",
      ),
      button("Restore farmhouse theme", () => {
        if (
          confirm(
            "Restore the farmhouse design tokens? Your copy and photos stay in place.",
          )
        ) {
          changed(() => {
            doc.theme = clone(seed().theme);
          });
          render();
        }
      }),
    );
  }
  function ordersPanel() {
    let filter = "";
    const list = h("div");
    const draw = () =>
      list.replaceChildren(
        ...state.orders
          .filter((o) => !filter || o.pickup.date === filter)
          .map((o) =>
            h(
              "div",
              { class: "sub-card" },
              h("h3", {}, "Demo " + o.id.slice(0, 8) + " · " + money(o.total)),
              h("p", {}, o.pickup.date + " · " + o.pickup.start),
              h(
                "p",
                {},
                o.lines
                  .map((l) => `${l.qty} × ${l.name} (${l.variant})`)
                  .join(", "),
              ),
              h("strong", {}, "Payment not collected"),
              field(
                "Fulfillment status",
                o.status,
                guard(async (status) => {
                  await request("/api/order-status", { id: o.id, status });
                  state = await request("/api/studio");
                  draw();
                }),
                { choices: ["pending", "ready", "picked-up", "canceled"] },
              ),
              h(
                "details",
                {},
                h("summary", {}, "Audit history"),
                o.audit.map((a) => h("p", {}, a.at + " · " + a.action)),
              ),
            ),
          ),
      );
    draw();
    return h(
      "div",
      {},
      h("h2", {}, "Demo orders, kept simple."),
      h(
        "p",
        {},
        "Simulated requests only. There is no “mark paid” control. Canceling releases capacity. Real customers, refunds, and Square are not connected.",
      ),
      field(
        "Filter pickup date",
        filter,
        (value) => {
          filter = value;
          draw();
        },
        { type: "date" },
      ),
      button(
        "Refresh orders",
        guard(async () => {
          const fresh = await request("/api/studio");
          state.orders = fresh.orders;
          draw();
        }),
      ),
      list,
      state.orders.length
        ? null
        : h(
            "p",
            {},
            "No demo orders yet. Open the published demo, add a product, and request a simulated preorder.",
          ),
    );
  }
  function versionsPanel() {
    return h(
      "div",
      {},
      h("h2", {}, "A little peace of mind."),
      h(
        "p",
        {},
        "Publishing creates a timestamped version. Restore a version to both the draft and published demo. The last 30 published versions are kept.",
      ),
      state.versions.map((v) =>
        h(
          "div",
          { class: "sub-card" },
          h("h3", {}, v.label),
          h("p", {}, v.at + " · " + v.author),
          button(
            "Restore this version",
            guard(async () => {
              if (
                !confirm(
                  "Restore and publish this earlier version in your private demo? Unsaved changes will be replaced.",
                )
              )
                return;
              clearTimeout(timer);
              await save();
              adopt(
                await request("/api/restore", {
                  revision: state.revision,
                  versionId: v.id,
                }),
              );
              notify("Earlier version restored and published to your demo.");
            }),
          ),
        ),
      ),
    );
  }
  function render() {
    frameObserver?.disconnect();
    const panel = {
      Home: quickSetup,
      Website: websitePanel,
      Products: productPanel,
      "Pickup Schedule": pickupPanel,
      Orders: ordersPanel,
      "Business & Copy": businessPanel,
      "Advanced Design": advancedPanel,
      "Version History": versionsPanel,
    }[tab]();
    const credentials = accessKey
      ? h(
          "div",
          { class: "private-credentials" },
          h(
            "strong",
            {},
            "Save your private demo access before closing this tab.",
          ),
          h(
            "p",
            {},
            "Use this workspace ID and key to sign in on your other Mac or phone. Keep the key private; it grants owner access to this demo.",
          ),
          h(
            "label",
            { class: "field" },
            "Workspace ID",
            h("input", { readonly: true, value: state.id }),
          ),
          h(
            "label",
            { class: "field" },
            "Private access key",
            h("input", { readonly: true, value: accessKey }),
          ),
          button(
            "Copy private access details",
            guard(async () => {
              await navigator.clipboard.writeText(
                "Workspace ID: " +
                  state.id +
                  "\nPrivate access key: " +
                  accessKey +
                  "\nSign in at: " +
                  location.origin +
                  "/studio",
              );
              notify("Private access details copied. Keep them secure.");
            }),
          ),
          button("I saved my access key", () => {
            accessKey = null;
            render();
          }),
        )
      : null;
    frame = h("iframe", {
      title: "Website live preview",
      src: "/?studio-preview=1",
      sandbox: "allow-scripts allow-same-origin",
      onload: preview,
    });
    const previewBox = h("div", { class: "preview-box" }, frame);
    const actions = h(
      "div",
      { class: "studio-actions" },
      button(
        "Undo",
        () => {
          if (!undo.length) return;
          redo.push(clone(doc));
          doc = undo.pop();
          dirty = true;
          clearTimeout(timer);
          render();
          preview();
        },
        { id: "undo-draft", disabled: !undo.length },
      ),
      button(
        "Redo",
        () => {
          if (!redo.length) return;
          undo.push(clone(doc));
          doc = redo.pop();
          dirty = true;
          render();
          preview();
        },
        { disabled: !redo.length },
      ),
      button(
        "Save draft",
        guard(async () => {
          await save();
          notify(
            "Draft saved. Published visitors still see the last published version.",
          );
        }),
        { id: "save-draft" },
      ),
      button(
        "Preview link",
        guard(async () => {
          await save();
          const result = await request("/api/preview", {
            revision: state.revision,
          });
          const el = document.querySelector("#share-preview");
          el.replaceChildren(
            h(
              "a",
              { href: result.path, target: "_blank", rel: "noopener" },
              "Open saved draft preview ↗",
            ),
            h("input", {
              readonly: true,
              value: location.origin + result.path,
              "aria-label": "Shareable draft preview link",
            }),
          );
          notify("Read-only preview ready. It expires in seven days.");
        }),
        { id: "preview-draft" },
      ),
      button(
        "Publish demo",
        guard(async () => {
          await save();
          if (
            !confirm(
              "Publish the saved draft to your isolated demo? This never changes the production store.",
            )
          )
            return;
          adopt(await request("/api/publish", { revision: state.revision }));
          notify(
            "Published to your private demo. Other browsers update within five seconds.",
          );
        }),
        { class: "primary-link", id: "publish-demo" },
      ),
    );
    root.replaceChildren(
      h(
        "div",
        { class: "studio-shell" },
        h(
          "aside",
          { class: "studio-sidebar" },
          h(
            "div",
            { class: "studio-brand" },
            h("img", { src: "/assets/logo.webp", alt: "" }),
            h("span", {}, "Website\nStudio"),
          ),
          h("p", { class: "workspace-badge" }, "PRIVATE DEMO · OWNER"),
          h(
            "nav",
            { "aria-label": "Studio navigation" },
            tabs.map((label) =>
              button(
                label === "Website" ? "Website · Simple Edit" : label,
                () => {
                  tab = label;
                  render();
                },
                { class: label === tab ? "active" : "" },
              ),
            ),
          ),
          h(
            "div",
            { class: "sidebar-bottom" },
            h("p", {}, "Danielle · Demo Owner"),
            h(
              "a",
              { href: "/demo/" + state.id, target: "_blank", rel: "noopener" },
              "View published demo ↗",
            ),
            button(
              "Sign out",
              guard(async () => {
                if (dirty) await save();
                await request("/api/logout", {});
                clearTimeout(timer);
                state = null;
                doc = null;
                accessKey = null;
                login();
              }),
            ),
          ),
        ),
        h(
          "div",
          { class: "studio-workspace" },
          h(
            "header",
            { class: "studio-top" },
            h(
              "div",
              {},
              h(
                "span",
                { class: "eyebrow" },
                "A LITTLE CREATIVITY, A LOT OF POSSIBILITY",
              ),
              h("h1", {}, "Make room for something good."),
              h(
                "p",
                { id: "saved-status", role: "status" },
                dirty ? "Unsaved draft" : "Draft saved",
              ),
            ),
            actions,
          ),
          credentials,
          h("div", { id: "share-preview" }),
          h(
            "div",
            { class: "studio-columns" },
            h(
              "section",
              { class: "editor-panel", "aria-label": tab },
              panel,
              h(
                "details",
                { class: "recovery-tools" },
                h("summary", {}, "Backup & recovery"),
                button("Export design JSON", () => {
                  const a = h("a", {
                    href: URL.createObjectURL(
                      new Blob([JSON.stringify(doc, null, 2)], {
                        type: "application/json",
                      }),
                    ),
                    download: "rise-roost-design.json",
                  });
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
                }),
                h(
                  "label",
                  { class: "upload-button" },
                  "Import design JSON",
                  h("input", {
                    type: "file",
                    accept: "application/json,.json",
                    onchange: guard(async (e) => {
                      const file = e.target.files[0];
                      if (!file || file.size > 1000000)
                        throw new Error("Choose a design JSON under 1 MB.");
                      const imported = JSON.parse(await file.text());
                      if (
                        !confirm(
                          "Replace this draft with the imported design? Publish stays separate.",
                        )
                      )
                        return;
                      changed(() => {
                        doc = imported;
                      });
                      await save();
                      render();
                    }),
                  }),
                ),
                button(
                  "Reload latest draft",
                  guard(async () => {
                    if (
                      dirty &&
                      !confirm(
                        "Discard local unsaved changes? Export them first if you need a copy.",
                      )
                    )
                      return;
                    clearTimeout(timer);
                    adopt(await request("/api/studio"));
                  }),
                ),
              ),
            ),
            h(
              "section",
              { class: "preview-panel", "aria-label": "Device preview" },
              h(
                "div",
                { class: "preview-toolbar" },
                h("strong", {}, "DRAFT PREVIEW"),
                [1280, 820, 390].map((width, i) =>
                  button(
                    ["Desktop", "Tablet", "iPhone"][i],
                    () => {
                      device = width;
                      resize();
                    },
                    { "aria-pressed": device === width },
                  ),
                ),
              ),
              h(
                "p",
                { class: "preview-hint" },
                "Double-click text, or choose Edit this section. Preview never changes the published demo.",
              ),
              previewBox,
            ),
          ),
        ),
      ),
    );
    function resize() {
      const scale = Math.min(1, previewBox.clientWidth / device);
      frame.style.width = device + "px";
      frame.style.height = "1000px";
      frame.style.transform = `scale(${scale})`;
      previewBox.style.height = 1000 * scale + "px";
      document
        .querySelectorAll(".preview-toolbar button")
        .forEach((b, i) =>
          b.setAttribute("aria-pressed", device === [1280, 820, 390][i]),
        );
    }
    frameObserver = new ResizeObserver(resize);
    frameObserver.observe(previewBox);
    frame.addEventListener("load", resize, { once: true });
    requestAnimationFrame(resize);
  }
  window.addEventListener("message", (e) => {
    if (
      e.origin !== location.origin ||
      e.source !== frame?.contentWindow ||
      e.data?.type !== "studio-select"
    )
      return;
    pageId = e.data.pageId;
    sectionId = e.data.sectionId;
    tab = "Website";
    render();
    setTimeout(() => document.querySelector("#section-heading")?.focus(), 100);
  });
  window.addEventListener("beforeunload", (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  window.addEventListener("online", () => {
    if (dirty) guard(save)();
  });
  window.addEventListener(
    "focus",
    guard(async () => {
      if (!state || dirty || saving) return;
      const fresh = await request("/api/studio");
      if (fresh.revision !== state.revision) {
        adopt(fresh);
        notify("Loaded the draft saved on your other device.");
      }
    }),
  );
  try {
    adopt(await request("/api/studio"));
  } catch (e) {
    if (e.status !== 401) notify(e.message, true);
    login();
  }
}
