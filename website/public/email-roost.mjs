import { h, button, field, notify } from './dom.mjs';
import { money, pickupLabel } from './model.mjs';
import { paymentLabels, fulfillmentLabels } from './orders.mjs';

export function createEmailRoost({ api, render, refresh, action, link, getMember, getOrders, available, legacy, readOnly }) {
  let mode = 'join', name = '', email = '', remember = true, code = '', sent = false, nextResend = 0, displayDraft = '', displayMember = '';
  const send = async () => { await api('/api/roost/email/request', { kind: mode, name, email, remember }); sent = true; code = ''; nextResend = Date.now() + 60000; };
  return function emailRoost() {
    const member = getMember(), orders = getOrders();
    const root = h('main', { class: 'section-inner roost-page' }, h('h1', {}, member ? 'My Roost' : 'Join The Roost'),
      h('p', {}, member ? 'Your free membership, pickup details, and orders.' : 'Free membership. Your name and email are all you need. No password or marketing subscription.'));
    if (member) {
      if (displayMember !== member.id) { displayMember = member.id; displayDraft = member.profile.name; }
      const form = h('form', { class: 'roost-profile', onsubmit: e => { e.preventDefault(); action(async () => { await api('/api/roost/email/profile', { name: displayDraft }); await refresh(false); notify('Your display name is saved.'); })(); } },
        h('h2', {}, 'Your account'), h('p', {}, member.profile.email, ' · Verified email'), h('p', {}, 'Membership: Free member'),
        field('Display name', displayDraft, v => displayDraft = v, { required: true, maxlength: 80, autocomplete: 'name' }),
        h('button', { type: 'submit', class: 'primary-link' }, 'Save display name'));
      root.append(h('div', { class: 'roost-layout' }, h('section', { class: 'member-orders', 'aria-label': 'Your Roost orders' },
        h('h2', {}, 'Your orders'), orders.length ? orders.map(o => h('article', { class: 'member-order' }, h('h3', {}, o.orderNumber), h('p', {}, pickupLabel(o.pickup)),
          h('p', {}, o.lines.map(l => `${l.qty} × ${l.name}`).join(', ')), h('p', {}, paymentLabels[o.paymentStatus], ' · ', fulfillmentLabels[o.status]),
          h('strong', {}, money(o.total)), h('a', { href: o.trackingPath, class: 'primary-link' }, 'Track order'))) : h('p', {}, 'Orders placed while signed in will appear here. Guest orders are not added by matching email.'), link('/shop', 'Shop', 'secondary-button')),
        h('aside', {}, form, h('section', { class: 'account-controls' }, h('h2', {}, 'Your sign-in'),
          h('p', {}, 'Remembered devices stay signed in for up to 90 days. Other sessions last up to 12 hours and end when the browser discards session cookies. Sign out on shared devices.'),
          button('Sign Out', action(async () => { await api('/api/roost/email/logout', {}); await refresh(false); sent = false; name = ''; email = ''; code = ''; displayMember = ''; displayDraft = ''; }), { class: 'secondary-button' })) )));
      return root;
    }
    if (!available()) root.append(h('p', { role: 'status' }, 'Email sign-in is not available yet. Please continue as a guest.'));
    const rememberField = () => h('label', { class: 'field remember-device' }, h('input', { type: 'checkbox', checked: remember, onchange: e => remember = e.target.checked }), 'Remember me on this device');
    if (sent) {
      root.append(h('form', { class: 'join-roost', onsubmit: e => { e.preventDefault(); action(async () => { await api('/api/roost/email/verify', { code }); await refresh(false); sent = false; code = ''; })(); } },
        h('h2', {}, 'Check your email'), h('p', {}, 'Enter the six-digit code sent to ', email, '. It expires in 10 minutes.'),
        field('Verification code', code, v => code = v, { name: 'verification-code', inputmode: 'numeric', autocomplete: 'one-time-code', pattern: '[0-9]{6}', minlength: 6, maxlength: 6, required: true }),
        h('button', { type: 'submit', class: 'primary-link' }, 'Verify and Sign In'),
        button('Resend code', action(async () => { if (Date.now() < nextResend) { notify('Please wait one minute before requesting another code.'); return; } await send(); notify('A new code is on its way.'); }), { class: 'secondary-button' }),
        button('Use a different email', () => { sent = false; code = ''; render(); }, { class: 'text-button' })));
    } else {
      root.append(h('div', { class: 'home-choices' }, button('Join The Roost', () => { mode = 'join'; render(); }, { class: 'secondary-button', 'aria-pressed': mode === 'join' }), button('Sign In', () => { mode = 'login'; render(); }, { class: 'secondary-button', 'aria-pressed': mode === 'login' })),
        h('form', { class: 'join-roost', onsubmit: e => { e.preventDefault(); action(send)(); } },
          h('h2', {}, mode === 'join' ? 'A little place of your own' : 'Welcome back'),
          mode === 'join' ? field('Name', name, v => name = v, { name: 'member-name', autocomplete: 'name', required: true, maxlength: 80 }) : null,
          field('Email', email, v => email = v, { name: 'member-email', autocomplete: 'email', type: 'email', required: true, maxlength: 254 }), rememberField(),
          h('button', { type: 'submit', class: 'primary-link', disabled: !available() || readOnly }, 'Email me a code'),
          h('p', { class: 'small-note' }, 'Remembered devices sign in automatically. You will only need another code after signing out, expiration, or when using a new device.')));
    }
    root.append(link('/shop', 'Continue as Guest', 'secondary-button'), button('Existing passkey membership', legacy, { class: 'text-button' }));
    return root;
  };
}
