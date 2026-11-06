export const paymentLabels = {
  awaiting_cash: 'Awaiting Cash at Pickup',
  closed_unpaid: 'Closed Unpaid / Not Picked Up',
  not_required: 'No payment required',
  not_collected: "Awaiting Payment Verification",
  reported: "Awaiting Payment Verification",
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
    ["Payment Verified", order.paymentVerifiedAt],
    ["Preparing Your Order", order.preparingAt],
    ["Ready for Pickup", order.readyAt],
  ];
}
