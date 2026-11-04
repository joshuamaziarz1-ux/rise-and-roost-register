import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import jsQR from 'jsqr';
import { paymentQR, savedPaymentOptions } from '../public/payment-tiles.mjs';

const destinations = { paypal: 'https://www.paypal.com/ncp/payment/SYNTHETIC_QR_ONLY', venmo: 'https://venmo.com/u/SyntheticQRBusiness', cashapp: 'https://cash.app/$SyntheticQRBusiness' };
function decode(modules) {
  const scale = 5, margin = 4, width = (modules.length + margin * 2) * scale, pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  modules.forEach((row, y) => row.forEach((dark, x) => {
    if (!dark) return;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const index = (((y + margin) * scale + dy) * width + (x + margin) * scale + dx) * 4;
      pixels[index] = pixels[index + 1] = pixels[index + 2] = 0;
    }
  }));
  return jsQR(pixels, width, width, { inversionAttempts: 'dontInvert' })?.data;
}
test('every payment QR decodes to the exact validated destination without invented parameters', () => {
  for (const [provider, destination] of Object.entries(destinations)) {
    const code = paymentQR(provider, destination); assert.equal(code.url, destination); assert.equal(decode(code.modules), destination);
  }
  const long = 'https://www.paypal.com/ncp/payment/' + 'A'.repeat(400);
  assert.equal(decode(paymentQR('paypal', long).modules), long);
  assert.equal(readFileSync(new URL('../public/vendor/qrcode-generator.mjs', import.meta.url), 'utf8'), readFileSync(new URL(import.meta.resolve('qrcode-generator')), 'utf8'));
});
test('payment tiles require an already-saved order number/private link and omit unsafe destinations', () => {
  const id = 'b'.repeat(48), secret = 'c'.repeat(48), order = { id, orderNumber: 'RR-' + id.slice(0, 16).toUpperCase(), trackingPath: '/orders/' + 'a'.repeat(48) + '/' + id + '#access=' + secret, paymentDestinations: Object.fromEntries(Object.entries(destinations).map(([provider, url]) => [provider, { url }])) };
  assert.deepEqual(savedPaymentOptions(order).map(o => o.url), Object.values(destinations));
  for (const partial of [{ ...order, id: '' }, { ...order, orderNumber: '' }, { ...order, trackingPath: '' }, { ...order, trackingPath: order.trackingPath.replace(id, 'd'.repeat(48)) }]) assert.deepEqual(savedPaymentOptions(partial), []);
  const unsafe = structuredClone(order); unsafe.paymentDestinations.paypal.url = 'javascript:alert(1)'; unsafe.paymentDestinations.cashapp.url += '?amount=123'; unsafe.paymentDestinations.unknown = { url: 'https://attacker.test' };
  assert.deepEqual(savedPaymentOptions(unsafe).map(o => o.provider), ['venmo']);
  for (const option of savedPaymentOptions(order)) { assert.equal(option.url.includes(secret), false); assert.equal(option.url.includes(order.orderNumber), false); }
});
