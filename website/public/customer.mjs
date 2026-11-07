import { pickupNotice } from './pickup-notice.mjs';
import { h, button, field, notify, guard, request } from './dom.mjs';
import { money, pickupLabel, localInstant } from './model.mjs';
import { paymentLabels, fulfillmentLabels } from './orders.mjs';

const decode = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const encode = value => btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function passkey(options, register) {
  if (!window.PublicKeyCredential || !navigator.credentials) throw new Error('Passkeys are unavailable in this browser. Use your saved recovery key below, or a browser that supports passkeys. Guest checkout is always available.');
  const publicKey = { ...options, challenge: decode(options.challenge) };
  if (register) {
    publicKey.user = { ...options.user, id: decode(options.user.id) };
    publicKey.excludeCredentials = (options.excludeCredentials || []).map(c => ({ ...c, id: decode(c.id) }));
  } else publicKey.allowCredentials = (options.allowCredentials || []).map(c => ({ ...c, id: decode(c.id) }));
  let credential;
  try { credential = await navigator.credentials[register ? 'create' : 'get']({ publicKey }); }
  catch (e) { if (['NotAllowedError', 'AbortError'].includes(e.name)) throw new Error('Passkey sign-in was canceled. Your basket is saved; try again or continue as a guest.'); throw e; }
  const response = { clientDataJSON: encode(credential.response.clientDataJSON) };
  if (register) { response.attestationObject = encode(credential.response.attestationObject); response.transports = credential.response.getTransports?.() || []; }
  else {
    response.authenticatorData = encode(credential.response.authenticatorData);
    response.signature = encode(credential.response.signature);
    response.userHandle = credential.response.userHandle ? encode(credential.response.userHandle) : null;
  }
  return { id: credential.id, rawId: encode(credential.rawId), type: credential.type, response, clientExtensionResults: credential.getClientExtensionResults(), authenticatorAttachment: credential.authenticatorAttachment };
}

export function createCustomerExperience({ workspaceId, link, navigate, render, onMember, getDocument = () => ({}), productCard, readOnly = false }) {
  let member = null, orders = [], devices = [], recoveryKey = '', error = '', busy = false, loaded = false, pending, generation = 0;
  let credits = { available: 0, reserved: 0, enabled: false, items: [], transactions: [] }, favorites = [];
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('rr-roost-' + workspaceId) : null;
  const joinProfile = { name: '', preferredName: '', email: '', phone: '' };
  let profileDraft;
  let entryView = 'welcome', helpOpen = false;
  let passwordLoginEnabled = false;
  const passwordDraft = { username: '', password: '', name: '', currentPassword: '', recoveryKey: '' };
  let simpleLoginEnabled = false, contactDraft = '', codeDraft = '', preferredDraft = '', contactStep = 'contact', linkContact = false, resendAt = 0;
  function showEntry(view) {
    if (busy) return;
    passwordDraft.password = ''; passwordDraft.currentPassword = ''; passwordDraft.recoveryKey = '';
    entryView = view; helpOpen = false; error = ''; render();
    document.querySelector('.roost-entry h1')?.focus();
  }
  let cashPickup = {};
  const api = (path, data) => request(path + (data === undefined ? '?workspace=' + workspaceId : ''), data === undefined ? undefined : { ...data, workspaceId });
  const action = fn => async () => {
    if (busy) return;
    busy = true; error = ''; render();
    try { if (pending) await pending; await fn(); }
    catch (e) { error = e.message; }
    finally { busy = false; render(); }
  };
  function clearPrivate() {
    entryView = 'welcome'; helpOpen = false; contactDraft = ''; codeDraft = ''; preferredDraft = ''; contactStep = 'contact'; linkContact = false;
    Object.keys(passwordDraft).forEach(key => passwordDraft[key] = '');
    generation++; cashPickup = {}; member = null; orders = []; devices = []; favorites = []; credits = { available: 0, reserved: 0, enabled: false, items: [], transactions: [] }; recoveryKey = ''; profileDraft = undefined;
    Object.assign(joinProfile, { name: '', preferredName: '', email: '', phone: '' });
    Object.assign(commentDraft, { name: '', body: '', consent: false }); onMember(null);
  }
  channel?.addEventListener('message', () => { clearPrivate(); loaded = false; render(); void refresh(); });
  window.addEventListener('pagehide', () => { clearPrivate(); loaded = false; render(); });
  window.addEventListener('pageshow', event => { if (event.persisted) { clearPrivate(); loaded = false; render(); void refresh(); } });
  async function refresh(rerender = true, duringAction = false) {
    if (readOnly) { loaded = true; return; }
    if (busy && !duringAction) return false;
    if (pending) return pending;
    const started = generation;
    pending = (async () => {
      try {
        const result = await api('/api/roost/me');
        if (started !== generation) return false;
        passwordLoginEnabled = result.passwordLoginEnabled === true;
        simpleLoginEnabled = result.simpleLoginEnabled === true;
        const changed = member?.id !== result.member?.id;
        if (!result.member && member) { clearPrivate(); }
        const viewChanged = JSON.stringify(cashPickup) !== JSON.stringify(result.cashPickup || {}) || !loaded || changed || JSON.stringify(orders) !== JSON.stringify(result.orders || []) || JSON.stringify(devices) !== JSON.stringify(result.devices || []) || JSON.stringify(credits) !== JSON.stringify(result.credits || { available: 0, reserved: 0, enabled: false, items: [], transactions: [] }) || JSON.stringify(favorites) !== JSON.stringify(result.favorites || []);
        credits = result.credits || { available: 0, reserved: 0, enabled: false, items: [], transactions: [] }; favorites = result.favorites || [];
        cashPickup = result.cashPickup || {}; member = result.member; orders = result.orders || []; devices = result.devices || []; loaded = true;
        if (changed) { profileDraft = member ? { ...member.profile } : undefined; onMember(member); }
        if (rerender && viewChanged) render();
        return viewChanged;
      } catch (e) { if (started !== generation) return false; const hadPrivate = !!member; if (hadPrivate) clearPrivate(); error = e.message; loaded = true; if (rerender || hadPrivate) render(); return hadPrivate; }
      finally { pending = null; }
    })();
    return pending;
  }
  const authenticate = async (kind, profile) => {
    if (kind === 'add' && (!member?.passkeyAdditionUntil || Date.parse(member.passkeyAdditionUntil) <= Date.now())) await authenticate('login');
    const result = await api('/api/roost/options', { kind, profile });
    const response = await passkey(result.options, kind !== 'login');
    const verified = await api('/api/roost/verify', { response });
    await authenticated(verified.recoveryKey || '');
  };
  async function authenticated(key) {
    // A background response from before authentication must not erase the new
    // account/recovery key or repaint the previous account after a sign-in.
    generation++;
    if (pending) await pending;
    recoveryKey = key;
    await refresh(false, true); channel?.postMessage('changed');
  }
  const profileFields = (profile, suffix = '') => h('div', { class: 'customer-fields' },
    field('Preferred name (optional)' + suffix, profile.preferredName || '', v => profile.preferredName = v, { name: 'customer-preferred-name', maxlength: 40 }),
    field('Name' + suffix, profile.name, v => profile.name = v, { name: 'customer-name', autocomplete: 'name', required: true, maxlength: 80 }),
    field('Email (optional)' + suffix, profile.email, v => profile.email = v, { name: 'customer-email', autocomplete: 'email', type: 'email', maxlength: 254 }),
    field('Phone (optional)' + suffix, profile.phone, v => profile.phone = v, { name: 'customer-phone', autocomplete: 'tel', type: 'tel', maxlength: 32 }));
  function recoveryCard() {
    if (!recoveryKey) return null;
    return h('section', { class: 'recovery-card', 'aria-label': 'Save your recovery key' },
      h('h2', {}, passwordLoginEnabled ? 'Save your recovery code' : 'Keep a way back in'),
      passwordLoginEnabled && member?.username ? h('p', {}, 'Username: ' + member.username) : null,
      h('p', {}, passwordLoginEnabled ? 'Save this recovery code in a safe place or your password manager. You will need it if you forget your password. It is shown only now; we cannot send an email or text to reset your password.' : 'Save this recovery key in your password manager. Use it if you lose access to your passkeys. It is shown only now.'),
      h('input', { value: recoveryKey, readonly: true, 'aria-label': 'Roost recovery key', autocomplete: 'off' }),
      button('Copy recovery key', guard(async () => { await navigator.clipboard.writeText(recoveryKey); notify('Recovery key copied. Save it in your password manager.'); }), { class: 'secondary-button' }),
      button('I saved my recovery key', () => { recoveryKey = ''; render(); }, { class: 'primary-link' }));
  }
  function roost() {
    if (!loaded) return h('main', { class: 'section-inner roost-page' }, h('h1', {}, 'The Roost'), h('p', { role: 'status' }, 'Opening your Roost…'));
    if (!member) return entry();
    const heading = h('div', { class: 'page-intro' }, h('h1', {}, member ? greeting() + ', ' + (member.profile.preferredName || member.profile.name.split(' ')[0]) + '.' : 'Make yourself at home.'),
      h('p', {}, member ? 'Welcome back to The Roost.' : 'The Roost keeps your pickup details and orders together. Joining is always optional.'));
    const result = h('main', { class: 'section-inner roost-page' }, heading, error ? h('p', { role: 'alert', class: 'form-error' }, error) : null, recoveryCard());
    if (member) {
      const profile = profileDraft ||= { ...member.profile };
      const form = h('form', { class: 'roost-profile', onsubmit: async e => {
        e.preventDefault();
        profile.preferredName = form.elements['customer-preferred-name'].value; profile.name = form.elements['customer-name'].value; profile.email = form.elements['customer-email'].value; profile.phone = form.elements['customer-phone'].value;
        await action(async () => { await api('/api/roost/profile', { profile }); await refresh(false, true); onMember(member); notify('Your pickup details are saved.'); })();
      } }, h('h2', {}, 'Your pickup details'), profileFields(profile), h('button', { type: 'submit', class: 'primary-link', disabled: busy }, 'Save my details'));
      result.append(dashboard(), h('div', { class: 'roost-layout' },
        h('section', { id: 'my-orders', class: 'member-orders', 'aria-label': 'Your Roost orders' },
          h('div', { class: 'panel-heading' }, h('h2', {}, 'My Orders'), button('Refresh orders', action(() => refresh(false, true)), { class: 'text-button', disabled: busy })),
          orders.length ? orders.map(order => h('article', { class: 'member-order' },
            h('div', {}, h('h3', {}, order.orderNumber), h('p', {}, order.pickupChange && !order.pickupChange.replacement ? 'Awaiting makeup date' : pickupLabel(order.pickup))),
            pickupNotice(order, payload => action(async () => { await api('/api/roost/pickup-response', { ...payload, orderId: order.id }); await refresh(false, true); })(), busy),
            h('p', {}, order.lines.map(l => `${l.qty} × ${l.name}`).join(', ')),
            order.selectedPaymentMethod === 'cash_pickup' ? h('p', {}, 'Cash at Pickup · Cash Due: ' + money(order.paymentVerifiedAt || order.status === 'canceled' || order.resolution ? 0 : order.total)) : null,
            h('p', { class: 'order-state' }, paymentLabels[order.paymentStatus || 'not_collected'], ' · ', fulfillmentLabels[order.status || 'pending']),
            h('div', { class: 'member-order-bottom' }, h('strong', {}, money(order.total)), h('a', { href: order.trackingPath, class: 'primary-link' }, 'Track order')), h('div', { class: 'reorder-links' }, order.lines.map(l => getDocument().products?.some(p => p.id === l.productId) ? link('/product/' + l.productId, 'Reorder ' + l.name, 'text-button') : h('span', { class: 'small-note' }, l.name + ' is currently unavailable')))))
            : h('div', { class: 'gentle-empty' }, h('h3', {}, 'Something good is waiting.'), h('p', {}, 'Orders you place while signed in will appear here.'), link('/shop', 'Start Shopping', 'primary-link')),
          h('details', { class: 'claim-order' }, h('summary', {}, 'Add an order placed as a guest'),
            h('p', {}, 'Paste the complete private tracking link from your order confirmation.'),
            h('form', { onsubmit: async e => { e.preventDefault(); const input = e.currentTarget.elements.link; await action(async () => { await api('/api/roost/claim-order', { link: input.value }); await refresh(false, true); notify('Order added to your Roost.'); })(); } },
              h('label', { class: 'field' }, 'Private tracking link', h('input', { name: 'link', type: 'text', required: true, autocomplete: 'off' })),
              h('button', { type: 'submit', class: 'secondary-button', disabled: busy }, 'Add my order')))),
        h('aside', {}, form, h('section', { class: 'account-controls' },
          h('h2', {}, 'Account Settings'), h('p', {}, 'Welcome back to The Roost! This personal device stays signed in for about 30 days after your last visit, for at most 90 days. Log out on shared computers.'),
          passwordLoginEnabled ? passwordSettings() : simpleLoginEnabled ? contactSettings() : null,
          button('Sign out of all devices', action(async () => { await api('/api/roost/logout-all', {}); clearPrivate(); channel?.postMessage('changed'); }), { class: 'text-button', disabled: busy }),
          h('p', { class: 'small-note' }, passwordLoginEnabled ? 'Your username and password keep your account secure. Your pickup contact details do not grant account access.' : 'Your passkey verifies your Roost membership. Contact details are for pickup, never proof of account ownership.'),
          button('Add a passkey on this device', action(() => authenticate('add')), { class: 'secondary-button', disabled: busy }),
          h('details', { class: 'remembered-devices' }, h('summary', {}, 'Remembered devices'),
            devices.map(device => h('div', { class: 'remembered-device' }, h('p', {}, device.label, device.current ? ' · This device' : ''),
              !device.current ? button('Log out ' + device.label, action(async () => { await api('/api/roost/revoke-device', { deviceId: device.id }); await refresh(false, true); }), { class: 'text-button', disabled: busy }) : null))),
          button('Log Out', action(async () => {
            await api('/api/roost/logout', {}); clearPrivate(); channel?.postMessage('changed');
          }), { class: 'text-button', disabled: busy })))));
      result.append(creditPanel(), favoritesPanel());
    }
    if (busy) result.append(h('p', { role: 'status', class: 'small-note' }, 'Please finish the sign-in prompt.'));
    return result;
  }
  function entry() {
    if (passwordLoginEnabled && entryView !== 'signin') return passwordEntry();
    if (simpleLoginEnabled && entryView !== 'signin') return simpleEntry();
    const title = entryView === 'signin' ? 'Welcome Back!' : entryView === 'join' ? 'Join The Roost' : 'Welcome to The Roost';
    const intro = entryView === 'signin' ? 'Sign in securely to your Roost account.' : entryView === 'join' ? 'Create your account to keep your orders, favorites, and pickup details together.' : 'Your little corner of Rise & Roost.';
    const panel = h('main', { class: 'section-inner roost-page roost-entry', 'data-roost-view': entryView },
      entryView !== 'welcome' ? button('Back', () => showEntry('welcome'), { class: 'text-button entry-back', disabled: busy }) : null,
      h('div', { class: 'page-intro' }, h('h1', { tabindex: -1 }, title), h('p', {}, intro)),
      error ? h('p', { role: 'alert', class: 'form-error' }, error) : null);
    if (entryView === 'welcome') {
      panel.append(h('section', { class: 'roost-welcome' },
        h('p', {}, 'View your orders, save your favorites, and enjoy member benefits. There’s a place for you here.'),
        h('div', { class: 'roost-entry-actions' },
          button('Sign In', () => showEntry('signin'), { class: 'primary-link' }),
          button('Join The Roost', () => showEntry('join'), { class: 'secondary-button' }),
          link('/shop', 'Continue as a Guest', 'entry-guest'))));
    } else if (entryView === 'signin') {
      panel.append(h('section', { class: 'roost-signin' },
        !simpleLoginEnabled && !passwordLoginEnabled ? h('p', {}, 'Email and phone sign-in are not available yet. Use a passkey, your saved recovery key, or continue as a guest.') : null,
        button('Sign in with a Passkey', action(() => authenticate('login')), { class: 'primary-link', disabled: busy || readOnly }),
        h('details', { open: helpOpen, ontoggle: e => { helpOpen = e.currentTarget.open; } },
          h('summary', {}, 'Need help signing in?'),
          h('p', {}, 'Use the recovery key you saved when you joined. Recovery signs out remembered devices and removes old passkeys. Save your replacement key, then add a new passkey.'),
          h('form', { onsubmit: async e => { e.preventDefault(); const code = e.currentTarget.elements.key.value.trim(); await action(async () => { const r = await api('/api/roost/recover', { recoveryKey: code }); await authenticated(r.recoveryKey); })(); } },
            h('label', { class: 'field' }, 'Saved recovery key', h('input', { name: 'key', type: 'password', required: true, autocomplete: 'off' })),
            h('button', { type: 'submit', class: 'secondary-button', disabled: busy || readOnly }, 'Recover my Roost')),
          h('p', { class: 'small-note' }, 'Without a passkey or saved recovery key, contact details alone cannot safely restore access.')),
        link('/shop', 'Continue as a Guest', 'entry-guest')));
    } else {
      const profile = joinProfile;
      const form = h('form', { class: 'join-roost', onsubmit: async e => {
        e.preventDefault();
        profile.preferredName = form.elements['customer-preferred-name'].value; profile.name = form.elements['customer-name'].value; profile.email = form.elements['customer-email'].value; profile.phone = form.elements['customer-phone'].value;
        await action(() => authenticate('register', profile))();
      } }, profileFields(profile),
        h('p', { class: 'small-note' }, 'Your device will help you create a secure sign-in.'),
        h('button', { type: 'submit', class: 'primary-link', disabled: busy || readOnly }, busy ? 'Opening secure sign-in…' : 'Create My Account'));
      panel.append(form);
    }
    if (busy) panel.append(h('p', { role: 'status', class: 'small-note' }, 'Please finish the sign-in prompt.'));
    return panel;
  }
  function passwordFields(kind) {
    const signup = kind === 'register', setup = kind === 'setup', change = kind === 'change', recover = kind === 'recover';
    return [
      signup ? field('Preferred name', passwordDraft.name, v => passwordDraft.name = v, { name: 'name', autocomplete: 'given-name', required: true, maxlength: 40 }) : null,
      !change ? field('Username', passwordDraft.username, v => passwordDraft.username = v, { name: 'username', autocomplete: 'username', autocapitalize: 'none', spellcheck: false, required: true, minlength: 3, maxlength: 30 }) : null,
      recover ? field('Recovery code', passwordDraft.recoveryKey, v => passwordDraft.recoveryKey = v, { name: 'recoveryKey', type: 'password', autocomplete: 'off', required: true, maxlength: 48 }) : null,
      change ? field('Current password', passwordDraft.currentPassword, v => passwordDraft.currentPassword = v, { name: 'currentPassword', type: 'password', autocomplete: 'current-password', required: true, maxlength: 128 }) : null,
      field(signup || setup || change || recover ? 'New password' : 'Password', passwordDraft.password, v => passwordDraft.password = v, { name: 'password', type: 'password', autocomplete: signup || setup || change || recover ? 'new-password' : 'current-password', required: true, minlength: signup || setup || change || recover ? 15 : 1, maxlength: 128 }),
      signup || setup || change || recover ? h('p', { class: 'small-note' }, 'Use at least 15 characters. A short phrase is easy to remember. Your browser can save it for you.') : null
    ];
  }
  function passwordForm(kind) {
    return h('form', { class: 'contact-login password-login', onsubmit: e => {
      e.preventDefault();
      // Read the native fields so password-manager autofill is respected.
      const values = Object.fromEntries(new FormData(e.currentTarget));
      passwordDraft.username = values.username || passwordDraft.username;
      passwordDraft.name = values.name || passwordDraft.name;
      void action(async () => {
        passwordDraft.password = ''; passwordDraft.currentPassword = ''; passwordDraft.recoveryKey = '';
        const result = await api('/api/roost/password/' + kind, values);
        await authenticated(result.recoveryKey || '');
        if (kind === 'setup') notify('Your username and password are ready. This is the same Roost account.');
        if (kind === 'change' || kind === 'recover') notify('Your password is saved. Other devices are signed out.');
      })();
    } }, passwordFields(kind), h('button', { type: 'submit', class: 'primary-link', disabled: busy || readOnly }, kind === 'register' ? 'Create My Account' : kind === 'setup' ? 'Save username and password' : kind === 'change' || kind === 'recover' ? 'Save new password' : 'Sign In'));
  }
  function passwordEntry() {
    const signup = entryView === 'password-join', recover = entryView === 'password-recover';
    return h('main', { class: 'section-inner roost-page roost-entry roost-password-entry', 'data-roost-view': signup ? 'password-join' : recover ? 'password-recover' : 'password-signin' },
      signup || recover ? button('Back to Sign In', () => showEntry('welcome'), { class: 'text-button', disabled: busy }) : null,
      h('div', { class: 'page-intro' }, h('h1', {}, recover ? 'Reset Your Password' : 'Welcome to The Roost!'), h('p', {}, signup ? 'Join our little community.' : recover ? 'Use your username and saved recovery code.' : 'Sign in and make yourself at home.')),
      error ? h('p', { role: 'alert', class: 'form-error' }, error) : null,
      passwordForm(signup ? 'register' : recover ? 'recover' : 'login'),
      signup ? h('p', { class: 'small-note' }, 'Already a member? Sign in with your existing passkey or recovery key first, then add a username in Account Settings. Your orders and favorites stay together.') : null,
      !signup && !recover ? [button('Join The Roost', () => showEntry('password-join'), { class: 'secondary-button', disabled: busy }), button('Forgot password?', () => showEntry('password-recover'), { class: 'text-button', disabled: busy })] : null,
      h('details', {}, h('summary', {}, 'Other sign-in options'), button('Sign in with a Passkey', () => showEntry('signin'), { class: 'text-button', disabled: busy }), h('p', { class: 'small-note' }, 'Existing passkey members can also use their saved recovery key from this option.')),
      link('/shop', 'Continue as a Guest', 'entry-guest'));
  }
  function passwordSettings() {
    return h('section', {}, h('h3', {}, member.username ? 'Your sign-in' : 'Add a username and password'),
      member.username ? h('p', {}, 'Username: ' + member.username) : h('p', {}, 'Add a username to this existing account. Your orders, favorites and passkeys stay with you. Sign in again first if asked.'),
      h('details', {}, h('summary', {}, member.username ? 'Change password' : 'Set up username sign-in'), passwordForm(member.username ? 'change' : 'setup')),
      !member.username ? button('Verify with your existing passkey', action(() => authenticate('login')), { class: 'text-button', disabled: busy }) : null);
  }
  async function startContact() {
    await api('/api/roost/contact/start', { contact: contactDraft, link: linkContact });
    contactStep = 'code'; codeDraft = ''; resendAt = Date.now() + 60000;
  }
  function contactForm() {
    const submit = action(async () => {
      if (contactStep === 'contact') return startContact();
      if (contactStep === 'name') {
        await api('/api/roost/contact/finish', { name: preferredDraft });
        contactStep = 'contact'; await authenticated(''); return;
      }
      const result = await api('/api/roost/contact/verify', { code: codeDraft });
      if (result.registrationRequired) { contactStep = 'name'; return; }
      contactStep = 'contact'; codeDraft = ''; contactDraft = '';
      if (linkContact) { linkContact = false; notify('Your contact is verified for sign-in.'); }
      else await authenticated('');
    });
    const form = h('form', { class: 'contact-login', onsubmit: e => { e.preventDefault(); void submit(); } },
      contactStep === 'contact' ? field('Email or phone number', contactDraft, v => contactDraft = v, { name: 'contact', placeholder: 'Enter your email or phone number', autocomplete: 'username', required: true, maxlength: 254, disabled: busy }) :
      contactStep === 'code' ? field('Six-digit code', codeDraft, v => codeDraft = v, { name: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', pattern: '[0-9]{6}', maxlength: 6, required: true, disabled: busy }) :
      field('Preferred name', preferredDraft, v => preferredDraft = v, { name: 'preferred-name', autocomplete: 'given-name', maxlength: 40, required: true, disabled: busy }),
      h('button', { type: 'submit', class: 'primary-link', disabled: busy }, contactStep === 'code' ? 'Verify & Continue' : 'Continue'));
    if (contactStep === 'code') form.append(
      button('Resend Code', action(async () => { if (Date.now() < resendAt) throw new Error('Please wait one minute before requesting another code.'); await startContact(); }), { class: 'text-button', disabled: busy }),
      button('Change Email or Phone Number', () => { contactStep = 'contact'; codeDraft = ''; error = ''; render(); }, { class: 'text-button', disabled: busy }));
    return form;
  }
  function simpleEntry() {
    linkContact = false;
    return h('main', { class: 'section-inner roost-page roost-entry' },
      h('div', { class: 'page-intro' }, h('h1', {}, contactStep === 'code' ? 'Enter Your Code' : 'Welcome to The Roost!'),
        h('p', {}, contactStep === 'code' ? 'We sent a verification code to your email or phone.' : contactStep === 'name' ? 'What should we call you?' : 'Sign in or join our little community.')),
      error ? h('p', { role: 'alert', class: 'form-error' }, error) : null,
      contactForm(),
      button('Sign in with a Passkey', () => showEntry('signin'), { class: 'text-button', disabled: busy }),
      link('/shop', 'Continue as a Guest', 'entry-guest'));
  }
  function contactSettings() {
    return h('section', {}, h('h3', {}, 'Email or phone sign-in'),
      h('p', {}, 'Verify a contact to sign in with a code. For your security, first sign in again with your passkey or an already verified contact.'),
      button('Verify identity with a passkey', action(() => authenticate('login')), { class: 'text-button', disabled: busy }),
      linkContact ? contactForm() : button('Add a verified email or phone', () => { linkContact = true; contactStep = 'contact'; render(); }, { class: 'secondary-button', disabled: busy }));
  }
  function greeting() {
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Indiana/Indianapolis', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
    return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  }
  const jump = target => () => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  function dashboard() {
    const upcoming = orders.filter(o => !['canceled', 'picked-up'].includes(o.status) && !o.resolution && (o.pickupChange && !o.pickupChange.replacement || localInstant(o.pickup.date, o.pickup.end) > Date.now())).sort((a,b) => localInstant(a.pickup.date, a.pickup.start) - localInstant(b.pickup.date, b.pickup.start))[0];
    return h('div', { class: 'roost-dashboard' },
      orders.some(o => o.pickupChange && !o.pickupChange.acknowledgement && !o.resolution && !['canceled','picked-up'].includes(o.status)) ? h('section',{class:'pickup-change-notice',role:'note'},h('h2',{},'Pickup schedule update'),h('p',{},'Danielle has updated a pickup arrangement. Review the notice in My Orders below.'),button('Review pickup notice',jump('my-orders'),{class:'primary-link'})) : null,
      h('section', {}, h('h2', {}, 'Upcoming Pickup'), upcoming ? [h('strong', {}, upcoming.pickupChange && !upcoming.pickupChange.replacement ? 'Awaiting makeup date' : pickupLabel(upcoming.pickup)), h('p', {}, upcoming.orderNumber + ' · ' + fulfillmentLabels[upcoming.status || 'pending']), h('a', { href: upcoming.trackingPath, class: 'primary-link' }, 'View order details')] : [h('p', {}, 'Your next pickup will be right here.'), link('/shop', 'Find something fresh', 'primary-link')]),
      h('section', {}, h('h2', {}, 'Fresh at The Roost!'), h('p', {}, getDocument().freshAnnouncement || 'See what Danielle has available today.'), link('/shop', 'Browse available products', 'primary-link')),
      h('section', {}, h('h2', {}, 'Your Return Credit: ' + money(credits.available)), credits.reserved ? h('p', {}, money(credits.reserved) + ' reserved for pending orders') : null, button('View credit history and return items', jump('my-return-credits'), { class: 'text-button' })),
      h('nav', { class: 'roost-shortcuts', 'aria-label': 'My Roost' }, button('My Orders', jump('my-orders'), { class: 'secondary-button' }), button('Favorites', jump('my-favorites'), { class: 'secondary-button' })));
  }
  function creditPanel() {
    return h('section', { id: 'my-return-credits', class: 'roost-credit-panel' }, h('h2', {}, 'My Return Credits'), h('strong', { class: 'credit-balance' }, money(credits.available) + ' available'),
      credits.reserved ? h('p', {}, money(credits.reserved) + ' reserved for pending orders. Danielle releases reservations when an order is canceled after review.') : null,
      !credits.enabled ? h('p', {}, 'The return program is currently paused. Your credit history and balance are kept.') : h('p', {}, 'Danielle confirms eligible returns in person. Choose available credit at member checkout.'),
      credits.transactions.length ? h('details', {}, h('summary', {}, 'Credit history (' + credits.transactions.length + ')'), [...credits.transactions].reverse().map(t => h('article', { class: 'credit-transaction' }, h('strong', {}, t.kind.charAt(0).toUpperCase() + t.kind.slice(1) + ' · ' + (['adjusted', 'reversed'].includes(t.kind) ? (t.availableDelta < 0 ? '−' : '+') : '') + money(t.amount)), h('p', {}, t.description), h('time', { datetime: t.at }, new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Indiana/Indianapolis' }).format(new Date(t.at)))))) : h('p', {}, 'Accepted returns will appear here.'),
      h('h3', {}, 'What Can I Return?'), credits.items.length ? credits.items.map(item => h('p', {}, item.name + ' — ' + money(item.cents) + ' credit')) : h('p', {}, 'There are no eligible return items listed right now.'));
  }
  function favoriteButton(productId) {
    if (!member) return null;
    const saved = favorites.includes(productId);
    return button(saved ? 'Remove favorite' : 'Save favorite', action(async () => { await api('/api/roost/favorite', { productId, saved: !saved }); await refresh(false, true); }), { class: 'text-button', disabled: busy || readOnly, 'aria-pressed': saved });
  }
  function favoritesPanel() {
    const products = getDocument().products || [];
    return h('section', { id: 'my-favorites', class: 'roost-favorites' }, h('h2', {}, 'Favorites'), h('p', {}, 'Your familiar favorites, with today’s prices and availability.'),
      favorites.length ? h('div', { class: 'product-grid' }, favorites.map(id => {
        const product = products.find(p => p.id === id && p.active && !p.archived);
        return product ? productCard(product) : h('article', { class: 'gentle-empty' }, h('p', {}, 'This saved product is currently unavailable.'), favoriteButton(id));
      })) : h('p', {}, 'Save a favorite while browsing the shop and it will be waiting here.'), link('/shop', 'Browse the shop', 'primary-link'));
  }
  let comments = null, commentError = '', commentSent = false, commentsLoading, commentsNeedRender = false;
  const commentDraft = { name: '', body: '', consent: false };
  async function loadComments(rerender = true) {
    if (commentsLoading || readOnly) return;
    commentsLoading = true;
    try { const next = (await api('/api/comments')).comments; commentsNeedRender ||= comments === null || JSON.stringify(next) !== JSON.stringify(comments); comments = next; commentError = ''; }
    catch (e) { comments = []; commentError = e.message; }
    finally { commentsLoading = false; if (rerender && commentsNeedRender && !document.activeElement?.closest('.comment-form')) { commentsNeedRender = false; render(); } }
  }
  function commentPage() {
    if (comments === null && !commentsLoading && !readOnly) void loadComments();
    const form = h('form', { class: 'comment-form', onsubmit: async e => {
      e.preventDefault(); const f = e.currentTarget, submit = f.querySelector('button[type=submit]'); submit.disabled = true;
      commentDraft.name = f.elements.name.value; commentDraft.body = f.elements.body.value; commentDraft.consent = f.elements.consent.checked;
      try {
        await api('/api/comments', { name: f.elements.name.value, body: f.elements.body.value, website: f.elements.website.value, publicConsent: f.elements.consent.checked });
        commentSent = true; commentError = ''; commentDraft.body = ''; commentDraft.consent = false; render();
      } catch (e) { commentError = e.message; const alert = f.querySelector('[role=alert]'); alert.textContent = e.message; }
      finally { submit.disabled = false; }
    } }, h('h2', {}, 'We’d love to hear from you.'),
      h('label', { class: 'field' }, 'Your name', h('input', { name: 'name', autocomplete: 'name', required: true, maxlength: 80, value: commentDraft.name || member?.profile.name || '', oninput: e => commentDraft.name = e.target.value })),
      h('label', { class: 'field' }, 'Your comment', h('textarea', { name: 'body', required: true, minlength: 3, maxlength: 1000, rows: 5, value: commentDraft.body, oninput: e => commentDraft.body = e.target.value })),
      h('label', { class: 'comment-honey', 'aria-hidden': true }, 'Website', h('input', { name: 'website', tabindex: -1, autocomplete: 'off' })),
      h('label', { class: 'consent-line' }, h('input', { type: 'checkbox', name: 'consent', required: true, checked: commentDraft.consent, onchange: e => commentDraft.consent = e.target.checked }), 'My name and comment may be shared after review.'),
      h('p', { class: 'small-note' }, 'Please leave out private contact, payment, and order information.'),
      h('p', { role: 'alert', class: 'form-error' }, commentError), h('button', { type: 'submit', class: 'primary-link', disabled: readOnly }, 'Send comment'));
    return h('main', { class: 'section-inner comments-page' }, h('div', { class: 'page-intro' }, h('h1', {}, 'A word from our neighbors.'), h('p', {}, 'A kind note, a favorite bake, or a little feedback. We’re listening.')),
      h('div', { class: 'roost-layout' }, commentSent ? h('section', { class: 'comment-thanks', role: 'status' }, h('h2', {}, 'Thank you for stopping by.'), h('p', {}, 'Your comment is waiting for Danielle’s review.'), button('Leave another comment', () => { commentSent = false; render(); }, { class: 'secondary-button' })) : form,
        h('section', { class: 'neighbor-notes', 'aria-label': 'Comments from our neighbors' }, h('h2', {}, 'Around the farmhouse table'),
          comments?.length ? comments.map(c => h('blockquote', {}, h('p', {}, c.body), h('cite', {}, c.name))) : h('p', {}, 'There’s always room for a good conversation.'))));
  }
  return { refresh, roost, commentPage, refreshComments: loadComments, favoriteButton, get cashPickup() { return cashPickup; }, get credits() { return credits; }, get member() { return member; } };
}
