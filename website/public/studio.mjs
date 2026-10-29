import { h, button, field, request as apiRequest, notify, guard } from "./dom.mjs";
import { seed, clone, money } from "./model.mjs";
import { parseAccessDetails } from "./access.mjs";
import { paymentLabels, fulfillmentLabels, notificationLabels, eventLabels } from "./orders.mjs";

export async function start(root) {
  const requestedWorkspace = new URLSearchParams(location.search).get("workspace");
  let loginWorkspace = /^[a-f0-9]{48}$/.test(requestedWorkspace || "") ? requestedWorkspace : "";
  let mainWorkspace = "", pairingTimer, accessKeyWorkspace = "", sessionExpired = false;
  const request = async (path, data) => {
    const target = state?.id || loginWorkspace || undefined;
    try {
      const result = await apiRequest(path, data, { workspaceId: target });
      if (state?.id === target) { sessionExpired = false; root.querySelector("#studio-session-expired")?.remove(); }
      return result;
    } catch (e) {
      if (e.status === 401 && state?.id === target) { sessionExpired = true; showSessionNotice(); }
      throw e;
    }
  };
  function showSessionNotice() {
    if (!state || root.querySelector("#studio-session-expired")) return;
    root.prepend(h("div", { id: "studio-session-expired", role: "alert", class: "sub-card" },
      h("strong", {}, "Sign-in required for this workspace."),
      h("p", {}, "Your session expired or no longer matches. Unsaved edits are still in this tab. Sign in again in a new tab, then retry Save draft here. Creating a private demo will not restore this sign-in."),
      h("a", { href: state.studioPath, target: "_blank", rel: "noopener" }, "Sign in again to this exact workspace")));
  }
  let state,
    doc,
    tab = "Home",
    pageId = "home",
    sectionId = "hero",
    productId = "bread",
    dirty = false,
    timer,
    saving = false,
    publishing = false,
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
    "Comments",
    "Workspace Access",
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
        customerExperienceEnabled: !!state.customerExperienceEnabled,
        workspaceId: state.id,
        path: doc.pages.find((p) => p.id === pageId)?.slug || "/",
      },
      location.origin,
    );
  const savedLabel = () => {
    const el = document.querySelector("#saved-status");
    if (el)
      el.textContent = saving
        ? "Saving draft…"
        : publishing
          ? "Publishing demo…"
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
    clearInterval(pairingTimer);
    sessionExpired = false;
    if (accessKeyWorkspace !== result.id) accessKey = null;
    state = result;
    doc = clone(result.draft);
    dirty = false;
    loginWorkspace = result.id;
    if (result.mainStudioPath) mainWorkspace = new URL(result.mainStudioPath, location.origin).searchParams.get("workspace");
    history.replaceState({}, "", result.studioPath || "/studio?workspace=" + result.id);
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
    clearInterval(pairingTimer);
    let id = loginWorkspace || mainWorkspace, key = "";
    const feedback = h("p", { class: "small-note", role: "status", id: "workspace-signin-feedback" });
    const different = h("div");
    const idField = field("Workspace ID", id, (v) => { id = v.trim(); }, { required: true, name: "workspace", autocomplete: "username", readonly: !!loginWorkspace });
    const keyField = field("Private access key", key, (v) => { key = v; }, { type: "password", required: true, name: "access-key", autocomplete: "current-password" });
    let saved = "";
    const savedField = field("Paste saved access details", saved, (v) => { saved = v; }, { type: "textarea", autocomplete: "off", spellcheck: "false" });
    const apply = button("Use these saved details", guard(() => {
      const parsed = parseAccessDetails(saved);
      savedField.querySelector("textarea").value = ""; saved = "";
      if (loginWorkspace && parsed.id !== loginWorkspace) {
        key = ""; keyField.querySelector("input").value = "";
        feedback.textContent = "These saved details belong to a different workspace. A private demo's key cannot unlock the main website. Your saved sites have not been changed.";
        different.replaceChildren(h("a", { href: "/studio?workspace=" + parsed.id }, "Open the workspace named in these saved details"));
        return;
      }
      id = parsed.id; key = parsed.accessKey;
      idField.querySelector("input").value = id;
      keyField.querySelector("input").value = key;
      feedback.textContent = "The matching ID and key are ready. Select Sign in. These details stay only in this tab.";
      different.replaceChildren();
    }));
    const pairing = h("div");
    const connect = button("Connect from a signed-in computer", guard(async () => {
      connect.disabled = true;
      try {
        const pending = await request("/api/device-start", { workspaceId: id });
        const message = h("p", { role: "status" }, "Waiting for approval from an owner signed in to this exact workspace.");
        let checking = false;
        const check = async () => {
          if (checking) return;
          checking = true;
          try {
            const result = await request("/api/device-claim", { requestId: pending.requestId });
            if (result.status === "connected") { adopt(result); notify("This computer is now signed in to the same workspace."); }
          } catch (e) { clearInterval(pairingTimer); message.textContent = e.message; connect.disabled = false; }
          finally { checking = false; }
        };
        pairing.replaceChildren(h("div", { class: "sub-card" },
          h("h2", {}, "Approve this computer"),
          h("p", {}, "On the already signed-in computer, open Workspace Access, enter this code, and explicitly approve this browser. Keep this window open. Only approve a code you requested yourself."),
          h("output", { "aria-label": "Device connection code" }, pending.code),
          h("p", { class: "small-note" }, "Workspace: " + pending.workspaceId + ". Expires in 10 minutes. The code cannot sign anyone in without owner approval and this browser's private cookie."),
          message, button("Check connection", check)));
        pairingTimer = setInterval(check, 2000);
      } catch (e) { connect.disabled = false; throw e; }
    }), { class: "secondary-button", disabled: !id });
    const form = h("form", { onsubmit: guard(async (e) => {
      e.preventDefault();
      // Read DOM values at submit too: Safari/password-manager autofill may not fire input events.
      id = idField.querySelector("input").value.trim(); key = keyField.querySelector("input").value.trim();
      if (loginWorkspace && id !== loginWorkspace) throw new Error("Use the matching details for the workspace selected on this page.");
      const result = await request("/api/login", { id, accessKey: key });
      key = ""; keyField.querySelector("input").value = "";
      adopt(result);
    }) }, idField, keyField, h("button", { class: "primary-link", type: "submit" }, "Sign in"));
    root.replaceChildren(h("main", { class: "studio-login" },
      h("div", { class: "login-brand" }, h("img", { src: "/assets/logo.webp", alt: "Rise & Roost logo" }), h("span", {}, "DANIELLE’S WEBSITE STUDIO")),
      h("div", { class: "login-card" },
        h("span", { class: "eyebrow" }, id === mainWorkspace && mainWorkspace ? "MAIN BETA WEBSITE" : "WORKSPACE SIGN IN"),
        h("h1", {}, "Make it yours."),
        h("p", {}, mainWorkspace ? "Sign in to the saved website you want to edit. Every separate private demo has a different ID and key." : "Sign in to an existing workspace or create a separate private demo."),
        h("details", { open: !!id }, h("summary", {}, "Return to an existing workspace"), form),
        feedback, different,
        h("details", {}, h("summary", {}, "Use the saved ID and key together"), savedField, apply),
        h("p", { class: "small-note" }, "Sessions expire after 12 hours. An open Studio tab alone is not proof of an active session. If both computers are signed out, you need the original matching key; connecting a device cannot bypass this."),
        connect, pairing,
        mainWorkspace && id !== mainWorkspace ? h("p", {}, h("a", { href: "/studio?workspace=" + mainWorkspace }, "Sign in to the original main website")) : null,
        h("hr"),
        button("Create my private demo", guard(async () => {
          const result = await request("/api/workspaces", {});
          accessKey = result.accessKey; accessKeyWorkspace = result.id;
          adopt(result);
        }), { class: "secondary-button", id: "create-demo" }),
        h("p", { class: "small-note" }, "This creates a different test site. It does not recover or replace the main website or any saved workspace.")),
      h("a", { href: "/" }, "← View the published website")));
  }
  function accessPanel() {
    let code = "", reviewed;
    const reviewBox = h("div");
    return h("div", {}, h("h2", {}, "Workspace Access"),
      h("p", { class: "workspace-badge" }, state.isPrimary ? "BETA WEBSITE · OWNER" : "PRIVATE DEMO · OWNER"),
      h("p", {}, "Workspace ID: " + state.id),
      state.sessionExpiresAt ? h("p", {}, "This session expires: " + new Date(state.sessionExpiresAt).toLocaleString() + ".") : null,
      h("p", {}, state.isReview ? "This is an isolated review workspace. It cannot change the original beta website or authorize access to its Studio." : state.isPrimary ? "This is Danielle's original main website. Public website orders appear in this workspace's Orders dashboard." : "This is a separate private demo. It cannot authorize access to the original main website."),
      h("p", {}, h("a", { href: state.studioPath }, "Studio link for this exact workspace")),
      !state.isPrimary && state.mainStudioPath ? h("p", {}, h("a", { href: state.mainStudioPath }, "Open the original main website sign-in")) : null,
      h("h3", {}, "Connect another computer"),
      h("p", {}, "On the other computer, open this workspace's Studio link and choose Connect from a signed-in computer. Enter the code it shows below, review the workspace, and approve only the browser you requested."),
      field("Code from the other computer", code, (v) => { code = v; reviewed = null; reviewBox.replaceChildren(); }, { autocomplete: "off", spellcheck: "false", maxlength: 20 }),
      button("Review connection request", guard(async () => {
        reviewed = await request("/api/device-review", { code });
        let confirmed = false;
        const approve = button("Approve this computer", guard(async () => {
          if (!confirmed) return notify("Confirm that this is the code on your own other computer before approving.", true);
          approve.disabled = true;
          try {
            await request("/api/device-approve", { code, requestId: reviewed.requestId, confirmed });
            reviewBox.replaceChildren(h("p", { role: "status" }, "Approved. Only the browser that started this request can finish connecting. Check that computer now."));
          } finally { approve.disabled = false; }
        }));
        reviewBox.replaceChildren(h("div", { class: "sub-card" },
          h("h3", {}, reviewed.isPrimary ? "Connect to the main beta website" : "Connect to this private demo"),
          h("p", {}, "Workspace: " + reviewed.workspaceId),
          field("I recognize this code from my other computer and want that browser to edit this exact workspace", confirmed, (v) => { confirmed = v; }, { type: "checkbox" }), approve));
      })), reviewBox,
      h("p", { class: "small-note" }, "Codes expire after 10 minutes and can be used once. The owner session must still be valid when the other computer connects. Keys are never disclosed or reset. Each connected computer receives its own 12-hour session."));
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
    const refreshOrders = async () => {
      const fresh = await request("/api/studio");
      state.orders = fresh.orders;
      state.notificationsEnabled = fresh.notificationsEnabled;
      draw();
    };
    const update = async (path, order, values) => {
      await request(path, { id: order.id, version: order.version || 1, ...values });
      await refreshOrders();
    };
    const card = (o) => {
      const box = h("article", { class: "sub-card", "aria-label": "Order " + o.orderNumber },
        h("h3", {}, o.orderNumber + " · " + money(o.total)),
        h("p", {}, "BETA ORDER · " + o.pickup.date + " · " + o.pickup.start),
        o.customer?.name ? h("p", {}, "Pickup for " + o.customer.name + (o.customer.phone ? " · " + o.customer.phone : "")) : null,
        h("p", {}, o.lines.map((l) => `${l.qty} × ${l.name} (${l.variant})`).join(", ")),
        h("p", {}, h("strong", {}, paymentLabels[o.paymentStatus] || "Awaiting payment report")),
        h("p", {}, "Preparation: " + (fulfillmentLabels[o.status] || o.status)));
      if (o.trackingPath) box.append(h("p", {}, h("a", { href: o.trackingPath, target: "_blank", rel: "noopener noreferrer" }, "Open private customer status")),
        h("p", { class: "small-note" }, "Share this private link only with the customer. It does not grant Studio access."));
      else box.append(button("Create customer tracking link", guard(() => update("/api/order-link", o, {}))));
      if (o.paymentStatus === "verified") {
        box.append(h("p", {}, "Verified: " + o.paymentVerifiedAt),
          h("p", {}, "Independent reference (private): " + o.verification.evidence),
          h("p", {}, "Beta paid receipt: " + o.paidReceipt.number));
      } else if (o.status !== "canceled") {
        let evidence = "", method = "external_record", checked = false;
        const verify = button("Record independently verified payment", guard(async () => {
          if (!checked) return notify("Check an independent payment record before confirming verification.", true);
          verify.disabled = true;
          try {
            await update("/api/order-payment", o, { independentlyVerified: checked, method, evidence });
            notify("Payment verification recorded and a beta paid receipt created. Preparation has not changed.");
          } finally { verify.disabled = false; }
        }));
        box.append(h("details", {}, h("summary", {}, "Verify payment against independent records"),
          h("p", {}, "A customer's payment report is not proof of payment. Check your independent bank, cash, or other payment record before using this control. This records manual verification only; it does not contact or modify Square."),
          field("Independent payment record", method, (v) => { method = v; }, { choices: [
            { value: "external_record", label: "External payment record" },
            { value: "bank_record", label: "Bank record" },
            { value: "cash_record", label: "Cash receipt record" },
          ] }),
          field("Private verification reference", evidence, (v) => { evidence = v; }, { maxlength: 500, placeholder: "Reference or record checked; no card or bank account details" }),
          field("I checked an independent payment record for the full order total", checked, (v) => { checked = v; }, { type: "checkbox" }),
          verify));
      }
      const allowed = {
        pending: ["pending", "preparing", "ready", "canceled"],
        preparing: ["preparing", "ready", "canceled"],
        ready: ["ready", "picked-up", "canceled"],
        "picked-up": ["picked-up"], canceled: ["canceled"],
      }[o.status] || [o.status];
      box.append(field("Fulfillment status", o.status, guard(async (status) => {
        try { await update("/api/order-fulfillment", o, { status }); }
        catch (e) { draw(); throw e; }
      }), { choices: allowed.map((value) => ({ value, label: fulfillmentLabels[value] || value })) }),
      h("p", { class: "small-note" }, "Change preparation only when work actually begins. Ready for Pickup updates the customer's page immediately. Payment status stays separate; cancellation does not issue a refund."),
      h("details", {}, h("summary", {}, "Email notification activity"),
        o.customer?.emailOptIn ? [h("p", {}, "Customer requested transactional email updates."),
          (o.notifications || []).map((n) => h("p", {}, `${eventLabels[n.event]}: ${notificationLabels[n.status] || "Submission not confirmed"}${n.acceptedAt ? " · " + n.acceptedAt : ""}`))]
          : h("p", {}, "Email updates not requested. The private status page works without email.")),
      h("details", {}, h("summary", {}, "Audit history"), o.audit.map((a) => h("p", {}, a.at + " · " + a.action))));
      return box;
    };
    const draw = () => list.replaceChildren(...state.orders.filter((o) => !filter || o.pickup.date === filter).map(card));
    draw();
    return h("div", {}, h("h2", {}, "Orders & customer tracking"),
      h("p", {}, "Manage payment verification, preparation, and pickup separately. Beta orders do not charge customers or process Square payments. Saved statuses and customer tracking links work across devices without publishing the website again."),
      h("p", { class: "small-note" }, state.notificationsEnabled
        ? "Optional transactional email is connected. Provider acceptance is recorded; delivery is not claimed."
        : "Email sending is off until a verified sender and a beta-only email service are configured. Customer status pages work now."),
      field("Filter pickup date", filter, (v) => { filter = v; draw(); }, { type: "date" }),
      button("Refresh orders", guard(refreshOrders)), list,
      !state.orders.length ? h("p", {}, "No demo orders yet. Open the published website, add a product, and request a simulated preorder.") : null);
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
  function commentsPanel() {
    const list = h("div", { class: "comment-moderation" });
    const draw = comments => {
      list.replaceChildren(...(comments.length ? comments.map(c => h("article", { class: "sub-card" },
        h("div", { class: "panel-heading" }, h("h3", {}, c.name), h("strong", {}, c.status === "approved" ? "Visible on website" : c.status === "hidden" ? "Hidden" : "Waiting for review")),
        h("p", {}, c.body), h("p", { class: "small-note" }, new Date(c.createdAt).toLocaleDateString()),
        ...[...["pending", "hidden"].includes(c.status) ? ["approved"] : [], ...c.status !== "hidden" ? ["hidden"] : []].map(status => button(status === "approved" ? "Approve comment" : "Hide comment", guard(async () => {
          const result = await request("/api/studio-comments", { id: c.id, version: c.version, status }); draw(result.comments);
          notify(status === "approved" ? "Comment approved for the website." : "Comment hidden. Its original text is preserved.");
        }), { class: status === "approved" ? "primary-link" : "secondary-button" })))) : [h("p", {}, "No comments yet. New comments will appear here before anyone can see them on the website.")]));
    };
    const refresh = async () => draw((await request("/api/studio-comments")).comments);
    void guard(refresh)();
    return h("div", {}, h("h2", {}, "Comments from your neighbors"),
      h("p", {}, "Review each comment before it appears on the website. Hide a comment at any time; its original text stays saved."),
      button("Refresh comments", guard(refresh), { class: "secondary-button" }), list);
  }
  function render() {
    frameObserver?.disconnect();
    const panel = {
      Home: quickSetup,
      Website: websitePanel,
      Products: productPanel,
      "Pickup Schedule": pickupPanel,
      Orders: ordersPanel,
      Comments: commentsPanel,
      "Workspace Access": accessPanel,
      "Business & Copy": businessPanel,
      "Advanced Design": advancedPanel,
      "Version History": versionsPanel,
    }[tab]();
    const credentials = accessKey && accessKeyWorkspace === state.id
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
                  (state.studioPath || "/studio?workspace=" + state.id),
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
          if (publishing) return;
          publishing = true;
          document.querySelector("#publish-demo").disabled = true;
          try {
            await save();
            if (!confirm("Publish the saved draft to your isolated demo? This never changes the production store.")) return;
            savedLabel();
            const snapshot = JSON.stringify(doc);
            const result = await request("/api/publish", { revision: state.revision });
            if (snapshot === JSON.stringify(doc)) adopt(result);
            else {
              // Keep edits made while a slower network request was publishing.
              state = result;
              dirty = true;
              preview();
              clearTimeout(timer);
              timer = setTimeout(() => guard(save)(), 1000);
            }
            notify(result.isPrimary ? "Published to the beta website. Other browsers update within five seconds." : "Published to your private demo. Other browsers update within five seconds.");
          } finally {
            publishing = false;
            savedLabel();
            const action = document.querySelector("#publish-demo");
            if (action) action.disabled = false;
          }
        }),
        { class: "primary-link", id: "publish-demo", disabled: publishing },
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
          h("p", { class: "workspace-badge" }, state.isPrimary ? state.isReview ? "REVIEW WEBSITE · OWNER" : "BETA WEBSITE · OWNER" : "PRIVATE DEMO · OWNER"),
          h(
            "nav",
            { "aria-label": "Studio navigation" },
            tabs.filter(label => label !== "Comments" || state.customerExperienceEnabled).map((label) =>
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
              { href: state.publishedPath || "/demo/" + state.id, target: "_blank", rel: "noopener" },
              state.isPrimary ? "View published website ↗" : "View published demo ↗",
            ),
            h("p", { class: "small-note", id: "publishing-destination" },
              state.isReview ? "Publishing updates only this isolated review website. The public beta is unchanged." : state.isPrimary ? "Publish demo updates the main beta website on every device." : "This is a separate test workspace. Publishing updates its demo link, not the main beta website."),
            !state.isPrimary && state.mainStudioPath ? h("a", { href: state.mainStudioPath }, "Sign in to the main website workspace ↗") : null,
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
                publishing ? "Publishing demo…" : dirty ? "Unsaved draft" : "Draft saved",
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
    if (sessionExpired) showSessionNotice();
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
      const workspaceId = state.id;
      const revision = state.revision;
      const fresh = await request("/api/studio");
      if (state?.id === workspaceId && fresh.id === workspaceId && state.revision === revision && !dirty && !saving && !publishing && fresh.revision > state.revision) {
        adopt(fresh);
        notify("Loaded the draft saved on your other device.");
      }
    }),
  );
  try {
    const info = await apiRequest("/api/studio-info");
    mainWorkspace = info.mainWorkspaceId || "";
    if (!loginWorkspace) loginWorkspace = mainWorkspace;
  } catch {
    // A generic URL must not silently fall back to whichever demo cookie exists.
    if (!loginWorkspace) {
      login();
      notify("The default workspace could not be confirmed. Open your saved exact Studio URL or enter its matching access details.", true);
      return;
    }
  }
  try {
    const current = await request("/api/studio");
    if (loginWorkspace && current.id !== loginWorkspace) login();
    else adopt(current);
  } catch (e) {
    if (e.status !== 401) notify(e.message, true);
    login();
  }
}
