import qrcode from './vendor/qrcode-generator.mjs';
import { paymentDestination, providers } from './commerce.mjs';
import { h } from './dom.mjs';

const matrices = new Map();
export function paymentQR(provider, destination) {
  const url = paymentDestination(provider, destination);
  if (!matrices.has(url)) {
    if (matrices.size >= 6) matrices.delete(matrices.keys().next().value);
    const code = qrcode(0, 'M'); code.addData(url, 'Byte'); code.make();
    const count = code.getModuleCount();
    matrices.set(url, Array.from({ length: count }, (_, row) => Array.from({ length: count }, (_, column) => code.isDark(row, column))));
  }
  return { url, modules: matrices.get(url) };
}
export function savedPaymentOptions(order) {
  if (!/^[a-f0-9]{48}$/.test(order?.id || '') || !order.orderNumber ||
      !new RegExp('^/orders/[a-f0-9]{48}/' + order.id + '#access=[a-f0-9]{48}$').test(order.trackingPath || '')) return [];
  return Object.entries(providers).flatMap(([provider, label]) => {
    try { return order.paymentDestinations?.[provider] ? [{ provider, label, ...paymentQR(provider, order.paymentDestinations[provider].url) }] : []; }
    catch { return []; } // An invalid/unavailable destination never becomes a link.
  });
}
function qrImage(modules) {
  const namespace = 'http://www.w3.org/2000/svg', size = modules.length + 8;
  const svg = document.createElementNS(namespace, 'svg');
  for (const [name, value] of Object.entries({ xmlns: namespace, viewBox: `0 0 ${size} ${size}`, width: 120, height: 120, class: 'payment-qr', 'aria-hidden': 'true', focusable: 'false', 'shape-rendering': 'crispEdges' })) svg.setAttribute(name, value);
  const background = document.createElementNS(namespace, 'rect');
  for (const [key, value] of Object.entries({ width: size, height: size, fill: '#fff' })) background.setAttribute(key, value);
  const path = document.createElementNS(namespace, 'path'), commands = [];
  modules.forEach((row, y) => row.forEach((dark, x) => { if (dark) commands.push(`M${x + 4},${y + 4}h1v1h-1z`); }));
  path.setAttribute('d', commands.join('')); path.setAttribute('fill', '#000');
  svg.append(background, path); return svg;
}
export function paymentTiles(order, onChoose, disabled = false) {
  return h('div', { class: 'payment-tiles' }, savedPaymentOptions(order).map(({ provider, label, url, modules }) =>
    h('a', { class: 'payment-tile', href: url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Open ' + label, 'aria-disabled': disabled,
      onclick: event => { if (disabled) { event.preventDefault(); return; } onChoose(provider, event); } },
    qrImage(modules), h('strong', {}, label), h('span', {}, 'Tap to open'))));
}
