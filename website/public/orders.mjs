export const paymentLabels = {
  not_collected: "Awaiting payment report",
  reported: "Payment Reported · awaiting verification",
  verified: "Payment Verified",
  refunded: 'Refunded · independently recorded',
  partially_refunded: 'Partially refunded · independently recorded',
};
export const fulfillmentLabels = {
  pending: "Order Received",
  preparing: "Preparing Your Order",
  ready: "Ready for Pickup",
  "picked-up": "Picked Up",
  canceled: "Canceled",
};
export const notificationLabels = {
  queued: "Email queued",
  sending: "Email submission pending",
  retry: "Email submission will retry",
  accepted: "Email service accepted the message; delivery is not confirmed",
  failed: "Email could not be submitted; check your status page",
  expired: "Email submission could not be confirmed; check your status page",
};
export const eventLabels = {
  received: "Order Received",
  verified: "Payment Verified",
  preparing: "Preparing Your Order",
  ready: "Ready for Pickup",
};
export function trackingPath(workspaceId, order) {
  return order.trackingKey
    ? `/orders/${workspaceId}/${order.id}#access=${order.trackingKey}`
    : "";
}
export function stages(order) {
  return [
    ["Order Received", order.at],
    ["Payment Reported", order.paymentReportedAt],
    ["Payment Verified", order.paymentVerifiedAt],
    ["Preparing Your Order", order.preparingAt],
    ["Ready for Pickup", order.readyAt],
    ["Picked Up", order.pickedUpAt],
  ];
}
