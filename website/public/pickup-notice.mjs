import { h, button } from "./dom.mjs";
import { pickupLabel } from "./model.mjs";
export function pickupNotice(order, respond, busy = false) {
  const c = order.pickupChange;
  if (!c) return null;
  return h(
    "section",
    { class: "pickup-change-notice", role: "note" },
    h("h2", {}, "Your Pickup Date Has Changed"),
    h("p", {}, "Original pickup: " + c.originalDate),
    h(
      "p",
      {},
      c.replacement
        ? "Proposed pickup: " + pickupLabel(c.replacement)
        : "Date To Be Announced · Awaiting a makeup date",
    ),
    h("p", {}, c.message),
    order.resolution ||
      ["canceled", "picked-up", "completed", "refunded"].includes(order.status)
      ? h("p", {}, "This notice is kept with your order history.")
      : c.acknowledgement
        ? h(
            "p",
            { role: "status" },
            c.acknowledgement.response === "confirmed"
              ? "You confirmed the new pickup day."
              : "Danielle has been asked to help with a different arrangement. Use your private order page to contact Danielle if needed.",
          )
        : c.replacement
          ? h(
              "div",
              { class: "pickup-response-actions" },
              button(
                "The new pickup day works for me.",
                () =>
                  respond({
                    eventId: c.eventId,
                    version: c.version,
                    response: "confirmed",
                  }),
                { disabled: busy },
              ),
              button(
                "I need a different arrangement.",
                () =>
                  respond({
                    eventId: c.eventId,
                    version: c.version,
                    response: "alternate",
                  }),
                { disabled: busy },
              ),
            )
          : h(
              "p",
              {},
              "Please check this page for your new pickup date. No response is needed yet.",
            ),
  );
}
