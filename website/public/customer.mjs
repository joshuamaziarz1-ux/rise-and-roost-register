import { h, button, field, notify, guard, request } from './dom.mjs';
import { money, pickupLabel } from './model.mjs';
import { paymentLabels, fulfillmentLabels } from './orders.mjs';

const decode = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const encode = value => btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function passkey(options, register) {
  if (!window.PublicKeyCredential || !navigator.credentials) throw new Error('This browser cannot use passkeys. You can always check out as a guest.');
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

export function createCustomerExperience({ workspaceId, link, navigate, render, onMember, readOnly = false }) {
  let member = null, orders = [], recoveryKey = '', error = '', busy = false, loaded = false, pending;
  const joinProfile = { name: '', email: '', phone: '' };
  let profileDraft;
  const api = (path, data) => request(path + (data === undefined ? '?workspace=' + workspaceId : ''), data === undefined ? undefined : { ...data, workspaceId });
  const action = fn => async () => {
    if (busy) return;
    busy = true; error = ''; render();
    try { await fn(); }
    catch (e) { error = e.message; }
    finally { busy = false; render(); }
  };
  async function refresh(rerender = true) {
    if (readOnly) { loaded = true; return; }
    if (pending) return pending;
    pending = (async () => {
      try {
        const result = await api('/api/roost/me');
        const changed = member?.id !== result.member?.id;
        const viewChanged = !loaded || changed || JSON.stringify(orders) !== JSON.stringify(result.orders || []);
        member = result.member; orders = result.orders || []; loaded = true;
        if (changed) { profileDraft = member ? { ...member.profile } : undefined; onMember(member); }
        if (rerender && viewChanged) render();
        return viewChanged;
      } catch (e) { error = e.message; loaded = true; if (rerender) render(); }
      finally { pending = null; }
    })();
    return pending;
  }
  const authenticate = async (kind, profile) => {
    const result = await api('/api/roost/options', { kind, profile });
    const response = await passkey(result.options, kind !== 'login');
    const verified = await api('/api/roost/verify', { response });
    recoveryKey = verified.recoveryKey || '';
    await refresh(false);
  };
  const profileFields = (profile, suffix = '') => h('div', { class: 'customer-fields' },
    field('Name' + suffix, profile.name, v => profile.name = v, { name: 'customer-name', autocomplete: 'name', required: true, maxlength: 80 }),
    field('Email (optional)' + suffix, profile.email, v => profile.email = v, { name: 'customer-email', autocomplete: 'email', type: 'email', maxlength: 254 }),
    field('Phone (optional)' + suffix, profile.phone, v => profile.phone = v, { name: 'customer-phone', autocomplete: 'tel', type: 'tel', maxlength: 32 }));
  function recoveryCard() {
    if (!recoveryKey) return null;
    return h('section', { class: 'recovery-card', 'aria-label': 'Save your recovery key' },
      h('h2', {}, 'Keep a way back in'),
      h('p', {}, 'Save this recovery key in your password manager. Use it if you lose access to your passkeys. It is shown only now.'),
      h('input', { value: recoveryKey, readonly: true, 'aria-label': 'Roost recovery key', autocomplete: 'off' }),
      button('Copy recovery key', guard(async () => { await navigator.clipboard.writeText(recoveryKey); notify('Recovery key copied. Save it in your password manager.'); }), { class: 'secondary-button' }),
      button('I saved my recovery key', () => { recoveryKey = ''; render(); }, { class: 'primary-link' }));
  }
  function roost() {
    if (!loaded) return h('main', { class: 'section-inner roost-page' }, h('h1', {}, 'The Roost'), h('p', { role: 'status' }, 'Opening your Roost…'));
    const heading = h('div', { class: 'page-intro' }, h('h1', {}, member ? 'Welcome back, ' + member.profile.name.split(' ')[0] + '.' : 'Make yourself at home.'),
      h('p', {}, member ? 'Your orders and pickups, all in one place.' : 'The Roost keeps your pickup details and orders together. Joining is always optional.'));
    const result = h('main', { class: 'section-inner roost-page' }, heading, error ? h('p', { role: 'alert', class: 'form-error' }, error) : null, recoveryCard());
    if (member) {
      const profile = profileDraft ||= { ...member.profile };
      const form = h('form', { class: 'roost-profile', onsubmit: async e => {
        e.preventDefault();
        profile.name = form.elements['customer-name'].value; profile.email = form.elements['customer-email'].value; profile.phone = form.elements['customer-phone'].value;
        await action(async () => { await api('/api/roost/profile', { profile }); await refresh(false); onMember(member); notify('Your pickup details are saved.'); })();
      } }, h('h2', {}, 'Your pickup details'), profileFields(profile), h('button', { type: 'submit', class: 'primary-link', disabled: busy }, 'Save my details'));
      result.append(h('div', { class: 'roost-layout' },
        h('section', { class: 'member-orders', 'aria-label': 'Your Roost orders' },
          h('div', { class: 'panel-heading' }, h('h2', {}, 'Your orders'), button('Refresh orders', action(() => refresh(false)), { class: 'text-button', disabled: busy })),
          orders.length ? orders.map(order => h('article', { class: 'member-order' },
            h('div', {}, h('h3', {}, order.orderNumber), h('p', {}, pickupLabel(order.pickup))),
            h('p', {}, order.lines.map(l => `${l.qty} × ${l.name}`).join(', ')),
            h('p', { class: 'order-state' }, paymentLabels[order.paymentStatus || 'not_collected'], ' · ', fulfillmentLabels[order.status || 'pending']),
            h('div', { class: 'member-order-bottom' }, h('strong', {}, money(order.total)), h('a', { href: order.trackingPath, class: 'primary-link' }, 'Track order'))))
            : h('div', { class: 'gentle-empty' }, h('h3', {}, 'Something good is waiting.'), h('p', {}, 'Orders you place while signed in will appear here.'), link('/shop', 'Start Shopping', 'primary-link')),
          h('details', { class: 'claim-order' }, h('summary', {}, 'Add an order placed as a guest'),
            h('p', {}, 'Paste the complete private tracking link from your order confirmation.'),
            h('form', { onsubmit: async e => { e.preventDefault(); const input = e.currentTarget.elements.link; await action(async () => { await api('/api/roost/claim-order', { link: input.value }); await refresh(false); notify('Order added to your Roost.'); })(); } },
              h('label', { class: 'field' }, 'Private tracking link', h('input', { name: 'link', type: 'text', required: true, autocomplete: 'off' })),
              h('button', { type: 'submit', class: 'secondary-button', disabled: busy }, 'Add my order')))),
        h('aside', {}, form, h('section', { class: 'account-controls' },
          h('h2', {}, 'Your sign-in'), h('p', {}, 'This trusted browser stays signed in for up to 30 days. Sign out on shared computers.'),
          button('Add a passkey on this device', action(() => authenticate('add')), { class: 'secondary-button', disabled: busy }),
          button('Sign out of The Roost', action(async () => {
            await api('/api/roost/logout', {}); member = null; orders = []; recoveryKey = ''; profileDraft = undefined;
            Object.assign(joinProfile, { name: '', email: '', phone: '' });
            Object.assign(commentDraft, { name: '', body: '', consent: false }); onMember(null);
          }), { class: 'text-button', disabled: busy })))));
    } else {
      const profile = joinProfile;
      const form = h('form', { class: 'join-roost', onsubmit: async e => {
        e.preventDefault();
        profile.name = form.elements['customer-name'].value; profile.email = form.elements['customer-email'].value; profile.phone = form.elements['customer-phone'].value;
        await action(() => authenticate('register', profile))();
      } }, h('h2', {}, 'A little place of your own'), h('p', {}, 'Save your details, see past orders, and keep track of your next pickup.'), profileFields(profile),
        h('button', { type: 'submit', class: 'primary-link', disabled: busy || readOnly }, busy ? 'Opening passkeys…' : 'Join with a passkey'),
        h('p', { class: 'small-note' }, 'Use Touch ID, your device unlock, or a security key. No password to remember.'));
      result.append(h('div', { class: 'roost-layout' }, form,
        h('section', { class: 'roost-signin' }, h('h2', {}, 'Already part of The Roost?'), h('p', {}, 'Pick up right where you left off.'),
          button('Sign in with a passkey', action(() => authenticate('login')), { class: 'primary-link', disabled: busy || readOnly }),
          h('details', {}, h('summary', {}, 'Recover my membership'), h('p', {}, 'Use the recovery key you saved when you joined. A new recovery key replaces it after use.'),
            h('form', { onsubmit: async e => { e.preventDefault(); const code = e.currentTarget.elements.key.value.trim(); await action(async () => { const r = await api('/api/roost/recover', { recoveryKey: code }); recoveryKey = r.recoveryKey; await refresh(false); })(); } },
              h('label', { class: 'field' }, 'Saved recovery key', h('input', { name: 'key', type: 'password', required: true, autocomplete: 'off' })),
              h('button', { type: 'submit', class: 'secondary-button', disabled: busy || readOnly }, 'Recover my Roost'))),
          h('div', { class: 'guest-reminder' }, h('p', {}, 'Just here for something delicious?'), link('/shop', 'Shop as a guest', 'secondary-button')))));
    }
    if (busy) result.append(h('p', { role: 'status', class: 'small-note' }, 'Please finish the sign-in prompt.'));
    return result;
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
  return { refresh, roost, commentPage, refreshComments: loadComments, get member() { return member; } };
}
