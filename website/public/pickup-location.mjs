import { h } from './dom.mjs';

export function pickupLocation(business = {}) {
  const location = business.pickupAddress || { name: 'Rise & Roost', street: '3431 County Rd. 60', city: 'Auburn, IN 46706' };
  const destination = location.street + ', ' + location.city;
  const address = encodeURIComponent(destination);
  const android = /Android/i.test(navigator.userAgent);
  const apple = /iPhone|iPad|iPod|Macintosh/i.test(navigator.userAgent);
  const href = android ? 'geo:0,0?q=' + address
    : apple ? 'https://maps.apple.com/?daddr=' + address
      : 'https://www.google.com/maps/dir/?api=1&destination=' + address;
  return h('section', { class: 'pickup-location', 'aria-label': 'Pickup Location' },
    h('strong', {}, 'Pickup Location'),
    h('address', {}, h('a', {
      href, 'aria-label': 'Get directions to ' + location.name + ', ' + destination,
      ...(android ? {} : { target: '_blank', rel: 'noopener noreferrer' }),
    }, location.name, h('br'), location.street, h('br'), location.city)));
}
