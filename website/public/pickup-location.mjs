import { h } from './dom.mjs';

const destination = '3431 County Rd. 60, Auburn, IN 46706';

export function pickupLocation() {
  const address = encodeURIComponent(destination);
  const android = /Android/i.test(navigator.userAgent);
  const apple = /iPhone|iPad|iPod|Macintosh/i.test(navigator.userAgent);
  const href = android ? 'geo:0,0?q=' + address
    : apple ? 'https://maps.apple.com/?daddr=' + address
      : 'https://www.google.com/maps/dir/?api=1&destination=' + address;
  return h('section', { class: 'pickup-location', 'aria-label': 'Pickup Location' },
    h('strong', {}, 'Pickup Location'),
    h('address', {}, h('a', {
      href, 'aria-label': 'Get directions to Rise & Roost, ' + destination,
      ...(android ? {} : { target: '_blank', rel: 'noopener noreferrer' }),
    }, 'Rise & Roost', h('br'), '3431 County Rd. 60', h('br'), 'Auburn, IN 46706')));
}
