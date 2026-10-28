import { trackingPath, eventLabels } from "../public/orders.mjs";

export const BETA_ORIGIN = "https://rise-roost-beta.joshua-maziarz1.workers.dev";
export const emailAddress = (value) => typeof value === "string" &&
  value.length <= 254 && /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/.test(value);
export function emailConfigured(env) {
  return env.ORDER_EMAIL_ENABLED === "true" && !!env.RESEND_API_KEY &&
    emailAddress(env.ORDER_EMAIL_FROM) && /^[a-f0-9]{48}$/.test(env.PUBLIC_WORKSPACE_ID || "");
}
export function enqueue(order, event, at, makeToken) {
  if (!order.customer?.emailOptIn || !eventLabels[event]) return;
  order.notifications ||= [];
  if (!order.notifications.some((n) => n.event === event))
    order.notifications.push({ id: makeToken(), event, at, status: "queued", attempts: 0 });
}
export function customerOrder(order, workspaceId) {
  // Never return customer email, verification evidence, request IDs, internal audit,
  // provider credentials, or another customer's order in a tracking response.
  const fields = ["id", "orderNumber", "at", "lines", "total", "pickup", "status",
    "paymentStatus", "simulated", "paymentReportedAt", "paymentVerifiedAt",
    "preparingAt", "readyAt", "pickedUpAt", "canceledAt", "paidReceipt"];
  const result = Object.fromEntries(fields.filter((k) => order[k] !== undefined).map((k) => [k, order[k]]));
  result.orderNumber ||= "RR-" + order.id.slice(0, 16).toUpperCase();
  result.trackingPath = trackingPath(workspaceId, order);
  result.notifications = (order.notifications || []).map(({ event, status, acceptedAt }) => ({ event, status, acceptedAt }));
  result.emailOptIn = !!order.customer?.emailOptIn;
  result.version = order.version || 1;
  return result;
}
