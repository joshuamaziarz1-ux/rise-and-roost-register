import { h, button, field, request as apiRequest, notify } from './dom.mjs';
import { clone, money, pickupLabel, orderByLabel, customerTimestamp, customerTime, localInstant } from './model.mjs';
import { paymentLabels, fulfillmentLabels } from './orders.mjs';

const primary = ['Home', 'Orders', 'Products', 'Calendar', 'More'];
const secondary = ['The Roost', 'Website Content', 'Customer Comments', 'Sales Reports', 'Settings'];
const id = () => crypto.randomUUID();
const price = value => Math.round(Number(value) * 100);
const download = (name, data, type = 'application/json') => {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = h('a', { href: url, download: name }); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const csv = rows => rows.map(row => row.map(v => {
  let s = String(v ?? ''); if (/^\s*[=+@\-]|^[\t\r\n]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}).join(',')).join('\r\n');

export async function start(root, initial, newAccessKey) {
  if (!document.querySelector('link[data-management]')) document.head.append(h('link', { rel: 'stylesheet', href: '/management.css', 'data-management': true }));
  if (!document.querySelector('link[rel=manifest]')) document.head.append(h('link', { rel: 'manifest', href: '/studio.webmanifest' }));
  document.head.append(h('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' }), h('meta', { name: 'apple-mobile-web-app-title', content: 'Website Studio' }), h('link', { rel: 'apple-touch-icon', href: '/assets/logo.webp' }));
  document.title = 'Rise & Roost Website Studio';
  let data = initial, view = 'Home', selection = '', filter = 'all', search = '', period = 'today', from = '', through = '';
  let editing = null, busy = false, pending = null, error = '', connected = navigator.onLine, checking = false, disposed = false, reauth = false;
  const bindings = new WeakMap();
  const workspace = initial.id, storageKey = 'rr-studio-draft:' + workspace;
  const pendingKey = 'rr-studio-pending:' + workspace;
  const request = (path, body) => apiRequest(path, body, { workspaceId: workspace });
  const stamp = at => at ? customerTimestamp(at) : 'Not recorded';
  const marked = () => { if (editing && ['product', 'calendar', 'content'].includes(editing.type)) try { sessionStorage.setItem(storageKey, JSON.stringify(editing)); } catch {} };
  const f = (label, object, key, options = {}) => {
    const set = v => { object[key] = options.type === 'number' ? Number(v) : v; marked(); };
    const node = field(label, object[key] ?? '', set, options), input = node.querySelector('input,textarea,select');
    bindings.set(input, () => set(options.type === 'checkbox' ? input.checked : input.value)); return node;
  };
  const check = (label, object, key) => f(label, object, key, { type: 'checkbox' });
  function go(next, selected = '', nextFilter = 'all') {
    if (editing && !confirm('Leave this form? The latest unfinished product, calendar, or content form is kept in this tab until you save, cancel, or replace it with another form.')) return;
    editing = null; error = ''; selection = selected; filter = nextFilter; search = ''; view = next;
    history.replaceState({}, '', initial.studioPath + '#' + encodeURIComponent(next)); render(); window.scrollTo(0, 0);
  }
  function edit(type, values) { editing = { type, values: clone(values), original: clone(values), revision: data.revision, ledgerVersion: data.ledgerVersion }; error = ''; marked(); render(); }
  const merge = (base, local, remote) => {
    if (JSON.stringify(base) === JSON.stringify(local)) return remote === undefined ? undefined : clone(remote);
    if (local && base && remote && !Array.isArray(local) && typeof local === 'object' && typeof base === 'object' && typeof remote === 'object') {
      const result = clone(remote); for (const key of Object.keys(local)) result[key] = merge(base[key], local[key], remote[key]); return result;
    }
    return local === undefined ? undefined : clone(local);
  };
  function rebase() {
    if (!editing || pending) return;
    if (!confirm('Review and keep your edited fields on the latest saved version? Fields you did not edit will use the other device’s saved values.')) return;
    const e = editing, v = e.values;
    if (e.type === 'product') {
      const current = data.management.products.find(p => p.id === v.product.id);
      if (!current) { error = 'This product no longer exists. Save it as a new product instead.'; chrome(); return; }
      const remote = { ...v, product: { ...current, inventoryMode: current.inventoryMode || 'legacy', archived: !!current.archived, soldOut: !!current.soldOut, lowStockThreshold: current.lowStockThreshold ?? 3 }, dollars: (current.price / 100).toFixed(2), available: current.available };
      e.values = merge(e.original || v, v, remote); e.original = clone(remote);
    } else if (e.type === 'content') { e.values = merge(e.original || v, v, data.draft); e.original = clone(data.draft); }
    else if (e.type === 'calendar') {
      const current = data.published.pickups.find(p => p.id === v.pickup.id);
      if (current) { const remote = { ...v, pickup: current }; e.values = merge(e.original || v, v, remote); e.original = clone(remote); }
    } else if (v.orderId) { const current = data.orders.find(o => o.id === v.orderId); if (current) v.orderVersion = current.version; }
    e.revision = data.revision; e.ledgerVersion = data.ledgerVersion; error = ''; marked(); render();
  }
  async function cancel() {
    if (busy) return;
    const discardDraft = ['product', 'calendar', 'content'].includes(editing?.type) || ['product', 'calendar', 'content'].includes(pending?.form?.type);
    if (pending) {
      busy = true; error = ''; render();
      try {
        const resolved = await request('/api/manage/abandon-operation', { operationId: pending.id });
        data = resolved; notify(resolved.result?.abandoned ? 'The unconfirmed request is canceled.' : 'The server confirms the previous save.');
      } catch (e) { error = 'The previous result is still unconfirmed. Reconnect before starting another action. ' + e.message; busy = false; render(); return; }
      busy = false;
    }
    editing = null; pending = null; error = ''; if (discardDraft) sessionStorage.removeItem(storageKey); sessionStorage.removeItem(pendingKey); render();
  }
  async function refresh(rerender = true) {
    if (checking || disposed) return;
    checking = true;
    const wasReauth = reauth;
    try {
      const q = new URLSearchParams({ period }); if (period === 'custom') { q.set('start', from); q.set('end', through); }
      const next = await request('/api/manage/snapshot?' + q);
      if (next.id !== workspace) throw new Error('This response belongs to another workspace. Sign in to the correct saved website.');
      data = next; connected = true; reauth = false;
      if (pending && !busy) {
        const resolving = pending;
        const status = await request('/api/manage/operation?operationId=' + resolving.id);
        if (status.found && pending === resolving && !busy) {
          data = await request('/api/manage/snapshot?' + q);
          if (pending === resolving && !busy) {
            pending = null; if (editing === resolving.form) { if (['product', 'calendar', 'content'].includes(editing?.type)) sessionStorage.removeItem(storageKey); editing = null; }
            error = ''; sessionStorage.removeItem(pendingKey); notify(status.result?.abandoned ? 'The previous request was canceled.' : 'The server confirms your previous save.');
          }
        }
      }
      if (wasReauth || rerender && !editing && !root.querySelector('.ms-main input[type=search]:focus')) render(); else chrome();
    } catch (e) { connected = false; error = e.message; if (e.status === 401) { reauth = true; render(); } else chrome(); }
    finally { checking = false; }
  }
  function chrome() {
    const status = root.querySelector('#management-connection');
    if (status) { status.textContent = connected ? 'Connected' : 'Offline / reconnecting'; status.classList.toggle('offline', !connected); }
    const notice = root.querySelector('#management-error'); if (notice) { notice.textContent = error; notice.hidden = !error; }
    const conflict = root.querySelector('#management-conflict'); if (conflict) conflict.hidden = !editing || editing.revision === data.revision && editing.ledgerVersion === data.ledgerVersion;
  }
  async function send(path, payload, { keepForm = false } = {}) {
    if (busy) return;
    if (!navigator.onLine) { connected = false; error = 'You’re offline. Your fields are unsaved. Reconnect, then retry.'; chrome(); return; }
    const logical = JSON.stringify({ path, payload });
    if (pending && pending.logical !== logical) { error = 'Confirm the previous save before starting a different change. Use Check connection, then retry the same action.'; chrome(); return; }
    pending ||= { id: id(), logical, form: editing }; try { sessionStorage.setItem(pendingKey, JSON.stringify({ id: pending.id })); } catch {} busy = true; error = ''; render();
    try {
      const result = await request('/api/manage/' + path, { ...payload, operationId: pending.id });
      if (result.management) data = result; else await refresh(false);
      pending = null; sessionStorage.removeItem(pendingKey); if (!keepForm) { if (['product', 'calendar', 'content'].includes(editing?.type)) sessionStorage.removeItem(storageKey); editing = null; }
      connected = true; notify('Saved.');
    } catch (e) {
      error = e.message; if (e.status && e.status < 500) { pending = null; sessionStorage.removeItem(pendingKey); }
      if (!e.status || e.status >= 500) error += ' The result is unconfirmed. Check connection or retry this same action; it will not be applied twice.';
      connected = !!e.status && e.status < 500;
    } finally { busy = false; render(); }
  }
  async function upload(file, onDone) {
    if (!file) return;
    busy = true; error = ''; render();
    try {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 12000000) throw new Error('Choose a JPG, PNG, or WebP photo under 12 MB.');
      const image = await createImageBitmap(file);
      if (image.width * image.height > 40000000) { image.close(); throw new Error('Choose a smaller photo.'); }
      const scale = Math.min(1, 1600 / Math.max(image.width, image.height)), canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
      const encoded = canvas.toDataURL('image/webp', .84), [header, encodedData] = encoded.split(',');
      const photo = await request('/api/upload', { mime: header.match(/data:([^;]+)/)[1], data: encodedData });
      onDone(photo.src); marked(); notify('Photo uploaded. Save the form to use it.');
    } catch (e) { error = e.message; } finally { busy = false; render(); }
  }
  function actions(save, label = 'Save') {
    return h('div', { class: 'ms-form-actions' }, h('button', { type: 'submit', class: 'ms-primary', disabled: busy }, busy ? 'Saving…' : label), button('Cancel', cancel, { class: 'ms-secondary', disabled: busy }));
  }
  function form(title, children, save, label) {
    const changedElsewhere = editing && (editing.revision !== data.revision || editing.ledgerVersion !== data.ledgerVersion);
    return h('form', { class: 'ms-panel ms-edit', onsubmit: async e => { e.preventDefault(); for (const input of e.currentTarget.elements) bindings.get(input)?.(); await save(); } }, h('h2', {}, title), h('div', { id: 'management-conflict', class: 'ms-warning', hidden: !changedElsewhere }, h('p', {}, 'New changes were saved while this form was open. Your unsaved fields are still here.'), button('Review latest and keep my edits', rebase, { class: 'ms-secondary', disabled: !!pending })), children, actions(save, label));
  }
  const panel = (title, ...children) => h('section', { class: 'ms-panel' }, h('h2', {}, title), children);
  const empty = message => h('p', { class: 'ms-empty' }, message);
  const pill = text => h('span', { class: 'ms-pill' }, text);
  const menu = (label, target, count, targetFilter = 'all') => button([h('span', {}, label), count !== undefined ? h('strong', {}, count) : null, h('span', { 'aria-hidden': true }, '›')], () => go(target, '', targetFilter), { class: 'ms-menu' });
  function rangeControls() {
    return h('div', { class: 'ms-ranges', 'aria-label': 'Report period' },
      [['today', 'Today'], ['week', 'Week'], ['month', 'Month'], ['year', 'Year'], ['custom', 'Custom Date']].map(([value, label]) => button(label, async () => {
        period = value; if (value === 'custom') { from ||= data.management.today.range.start; through ||= from; } await refresh();
      }, { 'aria-pressed': period === value })),
      period === 'custom' ? h('div', { class: 'ms-two' }, field('From', from, v => from = v, { type: 'date' }), field('Through', through, v => through = v, { type: 'date' }), button('Apply dates', () => refresh(), { class: 'ms-secondary' })) : null);
  }
  function home() {
    const m = data.management, a = m.attention, t = m.today;
    const pref = m.notifications.preferences;
    const metric = (label, value, dest, filter) => button([h('span', {}, label), h('strong', {}, value)], () => go(dest, '', filter), { class: 'ms-metric' });
    return h('div', {}, h('div', { class: 'ms-welcome' }, h('h1', {}, 'Hi, Danielle!'), h('p', {}, 'Here’s what’s happening at Rise & Roost.')),
      button([h('span', {}, 'Today’s Verified Sales'), h('strong', {}, money(t.verifiedSales)), h('small', {}, 'Payments independently verified today')], () => { period = 'today'; go('Sales Reports'); void refresh(); }, { class: 'ms-sales' }),
      h('div', { class: 'ms-metrics' }, metric('Today’s order value', money(t.orderValue), 'Orders', 'today'), metric('Awaiting verification', a.payments, 'Orders', 'reported'), metric('New orders', a.newOrders, 'Orders', 'pending'), metric('Upcoming pickups', a.upcoming, 'Orders', 'upcoming'), metric('Low-stock products', a.lowStock, 'Products', 'low'), metric('New comments', a.comments, 'Customer Comments', 'pending')),
      panel('Needs Your Attention',
        pref.payments && a.payments ? menu('Review reported payments', 'Orders', a.payments, 'reported') : null,
        pref.orders && a.newOrders ? menu('Review new orders', 'Orders', a.newOrders, 'pending') : null,
        pref.stock && a.lowStock ? menu('Check low inventory', 'Products', a.lowStock, 'low') : null,
        pref.pickups && a.upcoming ? menu('Prepare upcoming pickups', 'Orders', a.upcoming, 'upcoming') : null,
        pref.comments && a.comments ? menu('Read new comments', 'Customer Comments', a.comments, 'pending') : null,
        !Object.values(a).some(Boolean) ? empty('You’re all caught up.') : ![['payments', 'payments'], ['orders', 'newOrders'], ['stock', 'lowStock'], ['pickups', 'upcoming'], ['comments', 'comments']].some(([key, count]) => pref[key] && a[count]) ? empty('Your summary cards show current activity. Attention alerts are off in Settings.') : null),
      menu('Open the pickup calendar & production lists', 'Calendar'));
  }
  function orders() {
    if (selection && !/^\d{4}-\d{2}-\d{2}$/.test(selection)) return orderDetail(data.orders.find(o => o.id === selection));
    const day = data.management.today.range.start;
    const matches = o => {
      if (filter === 'today' && o.businessDate !== day) return false;
      if (filter === 'upcoming' && (['canceled', 'picked-up'].includes(o.status) || localInstant(o.pickup.date, o.pickup.end) <= Date.parse(data.now) || localInstant(o.pickup.date, o.pickup.start) >= Date.parse(data.now) + 2 * 86400000)) return false;
      if (!['all', 'today', 'upcoming'].includes(filter) && o.status !== filter && o.paymentStatus !== filter) return false;
      return !search || [o.orderNumber, o.customer?.name, o.customer?.email, o.customer?.phone, ...o.lines.map(l => l.name)].join(' ').toLowerCase().includes(search.toLowerCase());
    };
    const selected = data.orders.filter(matches);
    return h('div', {}, h('div', { class: 'ms-heading' }, h('h1', {}, 'Orders'), button('Export orders', exportOrders, { class: 'ms-secondary' })),
      field('Search orders or customers', search, value => { search = value; renderList(); }, { type: 'search' }),
      h('div', { class: 'ms-chips' }, [['all', 'All'], ['pending', 'New'], ['reported', 'Payment Reported'], ['preparing', 'Preparing'], ['ready', 'Ready'], ['picked-up', 'Picked Up'], ['canceled', 'Canceled'], ['verified', 'Verified']].map(([value, label]) => button(label, () => { filter = value; render(); }, { 'aria-pressed': value === filter }))),
      h('div', { id: 'ms-order-list' }, orderCards(selected)));
    function renderList() {
      const box = root.querySelector('#ms-order-list');
      box?.replaceChildren(...orderCards(data.orders.filter(matches)));
    }
  }
  function orderCards(items) {
    const cards = items.map(o => button([
      h('div', { class: 'ms-row' }, h('strong', {}, o.customer?.name || 'Guest customer'), pill(fulfillmentLabels[o.status])),
      h('span', {}, o.orderNumber), h('span', {}, pickupLabel(o.pickup)),
      h('div', { class: 'ms-row' }, h('span', {}, paymentLabels[o.paymentStatus] || 'Awaiting Payment'), h('strong', {}, money(o.total))),
    ], () => go('Orders', o.id), { class: 'ms-order-card' }));
    if (!items.length) return [empty('No matching orders.')];
    return [h('div', { class: 'ms-order-cards' }, cards), h('div', { class: 'ms-table-wrap' }, h('table', { class: 'ms-order-table' },
      h('thead', {}, h('tr', {}, ['Order', 'Customer', 'Pickup', 'Payment', 'Fulfillment', 'Total'].map(label => h('th', { scope: 'col' }, label)))),
      h('tbody', {}, items.map(o => h('tr', {}, h('td', {}, o.orderNumber), h('td', {}, button(o.customer?.name || 'Guest customer', () => go('Orders', o.id), { class: 'ms-text' })), h('td', {}, pickupLabel(o.pickup)), h('td', {}, paymentLabels[o.paymentStatus] || 'Awaiting Payment'), h('td', {}, fulfillmentLabels[o.status]), h('td', {}, money(o.total)))))))];
  }
  function orderDetail(o) {
    if (!o) return empty('This order is not available.');
    return h('div', {}, button('← All orders', () => go('Orders'), { class: 'ms-text' }),
      h('div', { class: 'ms-heading' }, h('h1', {}, o.orderNumber), pill(fulfillmentLabels[o.status])),
      panel('Customer & pickup', h('h3', {}, o.customer?.name || 'Guest customer'), h('p', {}, o.customer?.memberId ? 'The Roost member' : 'Guest checkout'),
        o.customer?.email ? h('p', {}, h('a', { href: 'mailto:' + o.customer.email }, o.customer.email)) : null,
        o.customer?.phone ? h('p', {}, h('a', { href: 'tel:' + o.customer.phone }, o.customer.phone)) : null,
        h('p', {}, pickupLabel(o.pickup)), h('p', {}, 'Order by ' + orderByLabel(o.pickup))),
      panel('Order details', o.lines.map(l => h('div', { class: 'ms-row ms-line' }, h('span', {}, l.qty + ' × ' + l.name + ' · ' + l.variant), h('strong', {}, money(l.qty * l.unitPrice)))), h('div', { class: 'ms-row' }, h('strong', {}, 'Total'), h('strong', {}, money(o.total)))),
      panel('Payment', pill(paymentLabels[o.paymentStatus] || 'Awaiting Payment'), h('p', {}, o.verification ? 'Method: ' + o.verification.method.replace(/_/g, ' ') : 'Payment method is recorded when the owner verifies an independent record.'),
        !o.paymentVerifiedAt && o.status !== 'canceled' ? button('Verify payment', () => edit('payment', { orderId: o.id, orderVersion: o.version, method: 'bank_record', evidence: '', independentlyVerified: false }), { class: 'ms-primary' }) : null,
        o.paymentVerifiedAt ? h('p', {}, 'Verified ' + stamp(o.paymentVerifiedAt)) : null,
        o.paymentVerifiedAt ? button('Correct a mistaken verification', () => edit('payment-correction', { orderId: o.id, orderVersion: o.version, reason: '', independentlyChecked: false }), { class: 'ms-text' }) : null,
        (o.refunds || []).map(r => h('p', {}, 'Recorded refund: ' + money(r.amount) + ' · ' + stamp(r.at))),
        o.paymentVerifiedAt ? button('Record an external refund', () => edit('refund', { orderId: o.id, orderVersion: o.version, amount: '', evidence: '', reason: '', independentlyVerified: false }), { class: 'ms-secondary' }) : null),
      panel('Preparation & pickup', h('div', { class: 'ms-action-grid' }, [['preparing', 'Preparing'], ['ready', 'Ready for Pickup'], ['picked-up', 'Picked Up'], ['canceled', 'Cancel order']].filter(([v]) => v !== o.status).map(([status, label]) => button(label, () => edit('status', { orderId: o.id, orderVersion: o.version, status, reason: '', confirmCorrection: false, releaseInventory: false }), { class: status === 'canceled' ? 'ms-secondary' : 'ms-primary' }))),
        o.status === 'canceled' && o.keepInventory ? button('Release canceled reservation', () => edit('status', { orderId: o.id, orderVersion: o.version, status: 'canceled', reason: '', confirmCorrection: false, releaseInventory: true }), { class: 'ms-secondary' }) : null,
        button('Correct a status mistake', () => edit('status', { orderId: o.id, orderVersion: o.version, status: 'pending', reason: '', confirmCorrection: true, releaseInventory: false }), { class: 'ms-text' }),
        h('p', { class: 'ms-note' }, 'Payment and preparation stay separate. Mark Preparing only when work actually begins.')),
      panel('Order history', (o.audit || []).map(e => h('div', { class: 'ms-audit' }, h('strong', {}, e.action), h('span', {}, stamp(e.at)), h('small', {}, e.author || 'Customer / system')))),
      o.trackingPath ? h('a', { href: o.trackingPath, target: '_blank', rel: 'noopener noreferrer', class: 'ms-secondary private-link' }, 'Open customer tracking') : null);
  }
  function exportOrders() {
    const rows = [['Order', 'Placed', 'Customer', 'Email', 'Phone', 'Pickup', 'Total cents', 'Payment', 'Fulfillment', 'Verified at', 'Refund cents']];
    for (const o of data.orders) rows.push([o.orderNumber, stamp(o.at), o.customer?.name, o.customer?.email, o.customer?.phone, pickupLabel(o.pickup), o.total, o.paymentStatus, o.status, o.paymentVerifiedAt ? stamp(o.paymentVerifiedAt) : '', (o.refunds || []).reduce((n, r) => n + r.amount, 0)]);
    download('rise-roost-orders.csv', csv(rows), 'text/csv');
  }
  function products() {
    const products = data.management.products.filter(p => (filter !== 'archived' ? !p.archived : p.archived) && (filter !== 'low' || p.inventoryMode !== 'production' && p.available <= (p.lowStockThreshold ?? 3)));
    return h('div', {}, h('div', { class: 'ms-heading' }, h('h1', {}, 'Products'), button('Add product', () => editProduct(), { class: 'ms-primary' })),
      h('div', { class: 'ms-chips' }, button('Active', () => { filter = 'all'; render(); }, { 'aria-pressed': filter === 'all' }), button('Low stock', () => { filter = 'low'; render(); }, { 'aria-pressed': filter === 'low' }), button('Archived', () => { filter = 'archived'; render(); }, { 'aria-pressed': filter === 'archived' })),
      h('div', { class: 'ms-product-grid' }, products.map(p => h('article', { class: 'ms-panel ms-product' },
        h('img', { src: p.images[0]?.src, alt: p.images[0]?.alt || p.name }),
        h('h2', {}, p.name), h('div', { class: 'ms-row' }, h('strong', {}, money(p.price)), pill(p.archived ? 'Archived' : p.soldOut ? 'Sold Out' : !p.active ? 'Hidden' : 'Visible')),
        h('p', {}, p.inventoryMode === 'production' ? 'Made to order · ' + p.capacity + ' default units per pickup' : p.available + ' available'),
        h('div', { class: 'ms-actions' }, button('Edit product', () => editProduct(p), { class: 'ms-primary' }), button('Duplicate', () => editProduct(p, true), { class: 'ms-secondary' }))))), !products.length ? empty('No products in this view.') : null);
  }
  function editProduct(product, duplicate = false) {
    const p = product ? clone(product) : { id: 'product-' + id(), name: '', description: '', price: 0, stock: 10, capacity: 10, category: '', channel: 'preorder', active: true, images: [{ src: '/assets/bread.svg', alt: '' }], variants: [{ id: 'standard', name: 'Standard', extra: 0 }], inventoryMode: 'physical' };
    if (duplicate) { p.id = 'product-' + id(); p.name += ' copy'; }
    p.archived = !!p.archived; p.soldOut = !!p.soldOut; p.lowStockThreshold ??= 3;
    p.inventoryMode ||= 'legacy';
    edit('product', { product: p, dollars: (p.price / 100).toFixed(2), available: duplicate ? 0 : product?.available ?? p.stock, reason: '' });
  }
  function clockField(label, object, key) {
    const [hour, minute] = String(object[key] || '15:00').split(':').map(Number);
    let hours = hour % 12 || 12, minutes = minute, meridiem = hour >= 12 ? 'PM' : 'AM';
    const write = () => { object[key] = String(hours % 12 + (meridiem === 'PM' ? 12 : 0)).padStart(2, '0') + ':' + String(minutes).padStart(2, '0'); marked(); };
    return h('fieldset', { class: 'ms-clock' }, h('legend', {}, label),
      field(label + ' hour', hours, v => { hours = +v; write(); }, { choices: Array.from({ length: 12 }, (_, i) => i + 1) }),
      field(label + ' minute', String(minutes).padStart(2, '0'), v => { minutes = +v; write(); }, { choices: Array.from({ length: 60 }, (_, i) => ({ value: String(i).padStart(2, '0'), label: String(i).padStart(2, '0') })) }),
      field(label + ' AM/PM', meridiem, v => { meridiem = v; write(); }, { choices: ['AM', 'PM'] }));
  }
  function calendar() {
    const date = selection || data.management.today.range.start, list = data.published.pickups.slice().sort((a, b) => a.date.localeCompare(b.date));
    const orders = data.orders.filter(o => o.pickup.date === date && !['canceled', 'picked-up'].includes(o.status));
    const totals = new Map(); for (const o of orders) for (const l of o.lines) { const k = l.productId + ':' + l.variantId; const v = totals.get(k) || { name: l.name, variant: l.variant, qty: 0 }; v.qty += l.qty; totals.set(k, v); }
    return h('div', {}, h('div', { class: 'ms-heading' }, h('h1', {}, 'Calendar'), button('Add pickup', () => editPickup(), { class: 'ms-primary' })),
      h('div', { class: 'ms-actions' }, button('Set recurring days', () => edit('recurrence', { start: date, end: date, weekdays: [], startTime: '15:00', endTime: '18:00', cutoffTime: '18:00', deadlineDays: 1, capacity: 24 }), { class: 'ms-secondary' }),
        button(data.published.orderingPaused ? 'Resume ordering' : 'Pause new ordering', () => { if (confirm(data.published.orderingPaused ? 'Resume new website orders?' : 'Pause new website orders? Existing confirmed orders will stay intact.')) send('calendar', { revision: data.revision, pickups: data.published.pickups, paused: !data.published.orderingPaused, confirmExistingOrders: true }); }, { class: 'ms-secondary' })),
      data.published.orderingPaused ? h('p', { role: 'status', class: 'ms-warning' }, 'New ordering is paused. Existing orders are protected.') : null,
      h('div', { class: 'ms-calendar-list' }, list.map(p => h('article', { class: 'ms-panel' }, h('div', { class: 'ms-row' }, h('strong', {}, pickupLabel(p)), pill(p.closed ? 'Blocked' : p.event || 'Open')), h('p', {}, 'Order by ' + orderByLabel(p)), h('p', {}, p.capacity + ' order limit'),
        h('div', { class: 'ms-actions' }, button('Edit pickup', () => editPickup(p), { class: 'ms-secondary' }), button('Copy', () => editPickup(p, true), { class: 'ms-secondary' }), button('Pickup & baking lists', () => { selection = p.date; render(); }, { class: 'ms-secondary' }))))),
      panel('Pickup & production lists', field('List date', date, v => { selection = v; render(); }, { type: 'date' }),
        h('div', { class: 'ms-print-list' }, h('h3', {}, date), h('h3', {}, 'Production totals'), [...totals.values()].map(v => h('p', {}, v.qty + ' × ' + v.name + ' · ' + v.variant)),
          h('h3', {}, 'Pickup list'), orders.map(o => h('div', { class: 'ms-audit' }, h('strong', {}, o.customer?.name || 'Guest'), h('span', {}, o.orderNumber + ' · ' + pickupLabel(o.pickup)), h('span', {}, o.lines.map(l => l.qty + ' × ' + l.name + ' (' + l.variant + ')').join(', ')))),
        !orders.length ? empty('No outstanding pickups on this day.') : null,
        button('Print pickup & production lists', () => window.print(), { class: 'ms-primary' }))));
  }
  function editPickup(pickup, copy = false) {
    const today = data.management.today.range.start;
    const p = pickup ? clone(pickup) : { id: 'pickup-' + id(), date: today, start: '15:00', end: '18:00', cutoffDate: today, cutoffTime: '12:00', capacity: 24, closed: false, productionLimits: {} };
    if (copy) { p.id = 'pickup-' + id(); p.closed = false; }
    p.event ||= ''; p.productionLimits ||= {};
    edit('calendar', { pickup: p, confirmExistingOrders: false });
  }
  function members() {
    const members = data.management.members.filter(m => [m.profile.name, m.profile.email, m.profile.phone].join(' ').toLowerCase().includes(search.toLowerCase()));
    const selected = data.management.members.find(m => m.id === selection);
    if (selected) {
      const credits = selected.benefits.filter(b => b.kind !== 'bottle_return').reduce((n, b) => n + (b.kind === 'credit' ? b.amount : -b.amount), 0);
      return h('div', {}, button('← Member directory', () => go('The Roost'), { class: 'ms-text' }), h('h1', {}, selected.profile.name), panel('Contact details', h('p', {}, selected.profile.email || 'No email saved'), h('p', {}, selected.profile.phone || 'No phone saved'), h('p', {}, 'Joined ' + stamp(selected.createdAt))),
        panel('Returns & recorded credits', h('strong', {}, money(credits)), h('p', { class: 'ms-note' }, 'Recorded credits are separate from payments. Checkout redemption and rewards are not activated.'), button('Record return / credit adjustment', () => edit('benefit', { memberId: selected.id, kind: 'bottle_return', amount: '', reason: '' }), { class: 'ms-primary' }), selected.benefits.map(b => h('p', {}, b.kind.replace(/_/g, ' ') + ' · ' + (b.kind === 'bottle_return' ? b.amount + ' bottles' : money(b.amount)) + ' · ' + stamp(b.at) + ' · ' + b.reason))),
        panel('Order history', orderCards(data.orders.filter(o => o.customer?.memberId === selected.id))));
    }
    return h('div', {}, h('h1', {}, 'The Roost'), h('p', {}, 'Optional customer memberships at Rise & Roost.'), field('Search members', search, v => { search = v; renderMemberRows(); }, { type: 'search' }), h('div', { id: 'ms-members' }, members.map(memberCard)));
    function memberCard(m) { return button([h('strong', {}, m.profile.name), h('span', {}, m.profile.email || m.profile.phone || 'No contact saved'), pill(m.orderCount + ' orders')], () => go('The Roost', m.id), { class: 'ms-menu' }); }
    function renderMemberRows() { root.querySelector('#ms-members')?.replaceChildren(...data.management.members.filter(m => [m.profile.name, m.profile.email, m.profile.phone].join(' ').toLowerCase().includes(search.toLowerCase())).map(memberCard)); }
  }
  function comments() {
    const items = data.management.comments.filter(c => (filter === 'all' || c.status === filter) && [c.name, c.body].join(' ').toLowerCase().includes(search.toLowerCase()));
    return h('div', {}, h('h1', {}, 'Customer Comments'), h('div', { class: 'ms-chips' }, ['all', 'pending', 'approved', 'hidden'].map(v => button(v === 'all' ? 'All' : v[0].toUpperCase() + v.slice(1), () => { filter = v; render(); }, { 'aria-pressed': filter === v }))),
      h('form', { onsubmit: e => { e.preventDefault(); render(); } }, field('Search comments', search, v => search = v, { type: 'search' }), h('button', { type: 'submit', class: 'ms-secondary' }, 'Search')),
      items.map(c => panel(c.name, pill(c.status === 'pending' ? 'New' : c.status), h('p', {}, c.body), h('p', { class: 'ms-note' }, stamp(c.created_at)), h('div', { class: 'ms-actions' },
        button('Approve comment', () => moderate(c, 'approved'), { class: 'ms-primary', disabled: busy || c.status === 'approved' }), button('Hide comment', () => { if (confirm('Hide this comment from the website? Its original text will be retained.')) moderate(c, 'hidden'); }, { class: 'ms-secondary', disabled: busy || c.status === 'hidden' })))), !items.length ? empty('No matching comments.') : null);
  }
  async function moderate(c, status) {
    await send('comment', { id: c.id, version: c.version, status });
  }
  function reports() {
    const r = data.management.reports;
    const row = (label, value) => h('div', { class: 'ms-row ms-report-row' }, h('span', {}, label), h('strong', {}, value));
    return h('div', {}, h('h1', {}, 'Sales Reports'), rangeControls(), panel(r.range.start + ' through ' + r.range.end,
      row('Verified payments', money(r.verifiedSales)), row('Recorded refunds', money(r.refunds)), row('Verification corrections', money(r.verificationCorrections)), row('Net verified receipts', money(r.netVerifiedReceipts)),
      row('Order value placed', money(r.orderValue)), row('Orders placed', r.ordersPlaced), row('Reported payments awaiting verification', money(r.reportedValue)), row('Outstanding payments', money(r.outstandingValue)), row('Canceled orders', r.canceledOrders), row('Canceled order value', money(r.canceledOrderValue)), row('Returning Roost members', r.returningMembers)),
      panel('Popular products · verified orders', r.popularProducts.map(p => row(p.name + ' · ' + p.variant, p.quantity + ' · ' + money(p.value)))),
      panel('How totals work', h('p', {}, 'Verified payments use the date an owner checked an independent payment record. Order value uses the order date. A payment report is not a verified sale. Voided verification records are excluded from verified payments; correction totals are disclosed separately and never deducted twice. Refunds use the date the external refund was recorded. Cancellation does not automatically issue or record a refund. Net verified receipts subtract recorded refunds. Returning customers counts identified Roost members; guest identities are not guessed. Roadside Register sales are excluded.'),
        button('Export sales report', () => download('rise-roost-sales.csv', csv([['Range start', 'Range end', 'Verified cents', 'Refund cents', 'Net verified cents', 'Order value cents', 'Orders'], [r.range.start, r.range.end, r.verifiedSales, r.refunds, r.netVerifiedReceipts, r.orderValue, r.ordersPlaced]]), 'text/csv'), { class: 'ms-primary' }), button('Export orders', exportOrders, { class: 'ms-secondary' })));
  }
  function content() {
    return h('div', {}, h('h1', {}, 'Website Content'), h('p', {}, 'Edit wording and photos. The approved customer layout, navigation structure, and visual styling are locked.'),
      button('Edit website content', () => edit('content', clone(data.draft)), { class: 'ms-primary' }),
      panel('Draft & publishing', h('p', {}, !data.hasContentDraft ? 'Your saved content is published.' : 'There is a saved content draft to review.'),
        button('Preview saved draft', async () => {
          try { const r = await request('/api/preview', { revision: data.revision }); root.querySelector('#ms-content-preview')?.replaceChildren(h('iframe', { src: r.path, title: 'Saved website content preview' })); }
          catch (e) { error = e.message; chrome(); }
        }, { class: 'ms-secondary' }), button('Publish website content', () => { if (confirm('Publish this saved wording and photo draft to the isolated preview website? Products and pickup schedules keep their latest live values.')) send('publish', { revision: data.revision }); }, { class: 'ms-primary' }), h('div', { id: 'ms-content-preview' })),
      panel('Revision history', data.versions.map(v => h('div', { class: 'ms-audit' }, h('strong', {}, v.label), h('span', {}, stamp(v.at)), button('Restore wording & images', () => { if (confirm('Restore wording and images from this revision? Current products, stock, prices, and pickup schedules will stay intact.')) send('restore-content', { revision: data.revision, versionId: v.id }); }, { class: 'ms-secondary' })))));
  }
  function settings() {
    let code = '';
    const preferences = clone(data.management.notifications.preferences);
    return h('div', {}, h('h1', {}, 'Settings'),
      panel('Owner access', h('p', {}, 'Current sign-in: secure workspace access. Individual Descope owner accounts are not connected yet. The existing authentication has not been replaced.'), h('p', {}, 'Both owner accounts must be tested and approved before activation. Do not share private access keys in chat.'),
        h('a', { href: data.studioPath, class: 'ms-secondary' }, 'Studio link for this saved website'),
        field('Connection code from your other device', code, v => code = v, { maxlength: 20, autocomplete: 'off' }), button('Review device connection', async () => {
          try { const r = await request('/api/device-review', { code }); if (confirm('Approve the browser showing this exact code for this saved website? Only approve a request you started.')) { await request('/api/device-approve', { code, requestId: r.requestId, confirmed: true }); notify('Device request approved. Finish connecting on that device.'); } }
          catch (e) { error = e.message; chrome(); }
        }, { class: 'ms-primary' })),
      panel('Backup & data protection', h('p', {}, 'Download an owner-only business backup containing website revisions, orders, members, comments, and photos. It excludes sign-in credentials and recovery secrets. Keep downloads private.'),
        button('Download business backup', async () => { try { const backup = await request('/api/manage/export'); download('rise-roost-business-backup.json', JSON.stringify(backup)); notify('Business backup downloaded.'); } catch (e) { error = e.message; chrome(); } }, { class: 'ms-primary' }),
        h('p', { class: 'ms-note' }, 'Saved records are never removed automatically. Cloudflare D1 recovery remains available through the hosting account.')), 
      panel('Notifications', h('p', {}, 'Choose which in-app alerts appear in Needs Your Attention. External email/push services are not enabled. Save failures always remain visible.'),
        [['orders', 'New orders'], ['payments', 'Reported payments'], ['stock', 'Low stock'], ['pickups', 'Upcoming pickups'], ['comments', 'New comments'], ['errors', 'System alerts']].map(([key, label]) => check(label, preferences, key)),
        button('Save alert preferences', () => send('notifications', { preferences }), { class: 'ms-primary' })),
      panel('Install on iPhone', h('p', {}, 'In Safari, open Share → Add to Home Screen. Private business data is fetched securely while online and is not stored in an offline service-worker cache.')),
      panel('Audit history', data.management.audit.slice(0, 60).map(a => h('div', { class: 'ms-audit' }, h('strong', {}, a.action || a.kind), h('span', {}, stamp(a.at)), h('small', {}, a.actor?.name || 'Owner')))),
      button('Sign out', async () => { if (editing && !confirm('Sign out and discard the unsaved form?')) return; try { await request('/api/logout', {}); disposed = true; sessionStorage.removeItem(storageKey); location.reload(); } catch (e) { error = e.message; chrome(); } }, { class: 'ms-secondary' }));
  }
  function editForm() {
    const e = editing, v = e.values;
    if (e.type === 'product') {
      const p = v.product;
      return form(p.name ? 'Edit product' : 'Add product', [f('Product name', p, 'name', { required: true, maxlength: 120 }), f('Price ($)', v, 'dollars', { type: 'number', min: 0, max: 10000, step: '.01', required: true }),
        field('Inventory model', p.inventoryMode, value => { p.inventoryMode = value; marked(); render(); }, { choices: [{ value: 'physical', label: 'Physical stock' }, { value: 'production', label: 'Preorder production' }, { value: 'legacy', label: 'Keep existing stock + capacity' }] }),
        p.inventoryMode !== 'production' ? f('Available units (after existing orders)', v, 'available', { type: 'number', min: 0, max: 10000 }) : null,
        p.inventoryMode !== 'physical' ? f('Default production limit per pickup', p, 'capacity', { type: 'number', min: 0, max: 10000 }) : null,
        check('Sold Out', p, 'soldOut'), check('Visible on the website', p, 'active'), check('Archived (keeps order history)', p, 'archived'),
        p.images.map((photo, index) => h('div', { class: 'ms-photo' }, h('img', { src: photo.src, alt: photo.alt || p.name }), f('Photo description ' + (index + 1), photo, 'alt'), h('label', { class: 'ms-secondary' }, 'Replace photo', h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', disabled: busy, onchange: event => upload(event.target.files[0], src => photo.src = src) })))),
        f('Description', p, 'description', { type: 'textarea', maxlength: 6000 }), f('Category', p, 'category', { maxlength: 100 }), f('Low-stock warning at', p, 'lowStockThreshold', { type: 'number', min: 0, max: 10000 }),
        h('h3', {}, 'Varieties'), p.variants.map((variant, i) => h('div', { class: 'ms-two' }, f('Variety ' + (i + 1), variant, 'name', { required: true }), field('Additional price ' + (i + 1) + ' ($)', (variant.extra / 100).toFixed(2), value => { variant.extra = price(value); marked(); }, { type: 'number', min: 0, max: 10000, step: '.01' }))),
        button('Add variety', () => { p.variants.push({ id: 'variety-' + id(), name: '', extra: 0 }); marked(); render(); }, { class: 'ms-secondary' }), f('Reason for stock / price adjustment', v, 'reason', { maxlength: 500 }),
      ], () => { if (p.archived && !e.original?.product.archived && !confirm('Archive this product? It will leave the storefront while historical orders and photos stay intact.')) return; p.price = price(v.dollars); return send('product', { revision: e.revision, ledgerVersion: e.ledgerVersion, product: p, available: p.inventoryMode === 'production' ? undefined : v.available, reason: v.reason, confirmArchive: p.archived }); }, 'Save product live');
    }
    if (e.type === 'calendar') {
      const p = v.pickup;
      return form('Pickup date', [f('Pickup date', p, 'date', { type: 'date', required: true }), clockField('Pickup start', p, 'start'), clockField('Pickup end', p, 'end'), f('Order-by date', p, 'cutoffDate', { type: 'date', required: true }), clockField('Order-by time', p, 'cutoffTime'), f('Daily order limit', p, 'capacity', { type: 'number', min: 0, max: 10000 }), f('Special event name (optional)', p, 'event', { maxlength: 120 }), check('Block this pickup date', p, 'closed'),
        h('h3', {}, 'Production limits for this date'), data.published.products.filter(p => !p.archived && p.inventoryMode === 'production').map(product => field(product.name + ' units', p.productionLimits[product.id] ?? product.capacity, value => { p.productionLimits[product.id] = +value; marked(); }, { type: 'number', min: 0, max: 10000 })),
        check('I understand existing orders keep their original pickup details', v, 'confirmExistingOrders'),
      ], () => { const pickups = clone(data.published.pickups), i = pickups.findIndex(n => n.id === p.id); if (i < 0) pickups.push(p); else pickups[i] = p; return send('calendar', { revision: e.revision, pickups, paused: !!data.published.orderingPaused, confirmExistingOrders: v.confirmExistingOrders }); }, 'Save pickup live');
    }
    if (e.type === 'recurrence') {
      return form('Recurring pickup days', [f('First date', v, 'start', { type: 'date', required: true }), f('Repeat through', v, 'end', { type: 'date', required: true }), h('div', { class: 'ms-weekdays' }, ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((name, day) => field(name, v.weekdays.includes(day), value => { v.weekdays = value ? [...v.weekdays, day] : v.weekdays.filter(d => d !== day); }, { type: 'checkbox' }))), clockField('Pickup start', v, 'startTime'), clockField('Pickup end', v, 'endTime'), f('Order deadline days before pickup', v, 'deadlineDays', { type: 'number', min: 0, max: 30 }), clockField('Order-by time', v, 'cutoffTime'), f('Daily order limit', v, 'capacity', { type: 'number', min: 1, max: 10000 })], () => {
        const first = Date.parse(v.start + 'T12:00:00Z'), last = Date.parse(v.end + 'T12:00:00Z');
        if (!v.weekdays.length || last < first || last - first > 90 * 86400000) { error = 'Choose recurring days and a date range of no more than 90 days.'; chrome(); return; }
        const pickups = clone(data.published.pickups);
        for (let n = first; n <= last; n += 86400000) if (v.weekdays.includes(new Date(n).getUTCDay())) {
          const date = new Date(n).toISOString().slice(0, 10);
          if (!pickups.some(p => p.date === date && p.start === v.startTime && p.end === v.endTime)) pickups.push({ id: 'pickup-' + id(), date, start: v.startTime, end: v.endTime, cutoffDate: new Date(n - v.deadlineDays * 86400000).toISOString().slice(0, 10), cutoffTime: v.cutoffTime, capacity: v.capacity, closed: false });
        }
        return send('calendar', { revision: e.revision, pickups, paused: !!data.published.orderingPaused, confirmExistingOrders: true });
      }, 'Save recurring pickups');
    }
    if (e.type === 'payment') return form('Verify payment', [h('p', {}, 'Check an independent record for the full order total. This records verification; it does not charge or transfer money.'), f('Payment method', v, 'method', { choices: [{ value: 'bank_record', label: 'Bank transfer record' }, { value: 'cash_record', label: 'Cash received' }, { value: 'external_record', label: 'Other independent record' }] }), f('Independent payment reference', v, 'evidence', { required: true, minlength: 5, maxlength: 500 }), check('I checked an independent record for the full payment', v, 'independentlyVerified')], () => send('verify-payment', { id: v.orderId, orderVersion: v.orderVersion, method: v.method, evidence: v.evidence, independentlyVerified: v.independentlyVerified }), 'Record verified payment');
    if (e.type === 'refund') return form('Record an external refund', [h('p', {}, 'Record a refund only after checking that it happened outside this website. This does not send money or change Square.'), f('Refund amount ($)', v, 'amount', { type: 'number', min: '.01', max: 10000, step: '.01', required: true }), f('Independent refund reference', v, 'evidence', { required: true, minlength: 5, maxlength: 500 }), f('Refund reason', v, 'reason', { required: true, maxlength: 500 }), check('I independently verified this refund', v, 'independentlyVerified')], () => send('refund', { id: v.orderId, orderVersion: v.orderVersion, amount: price(v.amount), evidence: v.evidence, reason: v.reason, independentlyVerified: v.independentlyVerified }), 'Record refund');
    if (e.type === 'payment-correction') return form('Correct a mistaken verification', [h('p', {}, 'Use only if the payment was marked verified by mistake. The original verification and receipt stay in the private audit history as voided records. This does not issue a refund or move money.'), f('Correction reason', v, 'reason', { required: true, minlength: 5, maxlength: 500 }), check('I checked independent records and confirm the verification was a mistake', v, 'independentlyChecked')], () => send('payment-correction', { id: v.orderId, orderVersion: v.orderVersion, reason: v.reason, independentlyChecked: v.independentlyChecked }), 'Void mistaken verification');
    if (e.type === 'status') return form('Update fulfillment', [f('Fulfillment status', v, 'status', { choices: [['pending', 'New'], ['preparing', 'Preparing'], ['ready', 'Ready for Pickup'], ['picked-up', 'Picked Up'], ['canceled', 'Canceled']].map(([value, label]) => ({ value, label })) }), f('Reason for cancellation / correction', v, 'reason', { maxlength: 500 }), check('I confirm this correction if the order is moving backward', v, 'confirmCorrection'), check('I confirm cancellation if Canceled is selected; no refund is processed', v, 'confirmCancellation'), check('Release this canceled order’s items back to available inventory', v, 'releaseInventory')], () => send('fulfillment', { id: v.orderId, orderVersion: v.orderVersion, status: v.status, reason: v.reason, confirmCorrection: v.confirmCorrection, confirmCancellation: v.confirmCancellation === true, releaseInventory: v.releaseInventory }), 'Save order status');
    if (e.type === 'benefit') return form('Record return / credit', [f('Adjustment type', v, 'kind', { choices: [{ value: 'bottle_return', label: 'Bottles returned' }, { value: 'credit', label: 'Credit added (dollars)' }, { value: 'debit', label: 'Credit reduced (dollars)' }] }), f('Bottle quantity or credit dollars', v, 'amount', { type: 'number', min: '.01', step: '.01', required: true }), f('Reason / reference', v, 'reason', { required: true, maxlength: 500 })], () => send('benefit', { memberId: v.memberId, kind: v.kind, amount: v.kind === 'bottle_return' ? Number(v.amount) : price(v.amount), reason: v.reason }), 'Save member adjustment');
    if (e.type === 'content') return contentForm(e);
    return empty('Choose an existing form.');
  }
  function contentForm(e) {
    const doc = e.values; doc.business.pickupAddress ||= { name: 'Rise & Roost', street: '3431 County Rd. 60', city: 'Auburn, IN 46706' };
    return form('Website wording & photos', [f('Announcement', doc.ui, 'announcement', { maxlength: 500 }), f('Welcome / footer message', doc.ui, 'footer', { maxlength: 1000 }), f('Public contact email', doc.business, 'email', { type: 'email', maxlength: 254 }), f('Business hours wording', doc.business, 'hours', { maxlength: 1000 }),
      f('Pickup business name', doc.business.pickupAddress, 'name', { maxlength: 120 }), f('Pickup street address', doc.business.pickupAddress, 'street', { maxlength: 200 }), f('Pickup city, state, ZIP', doc.business.pickupAddress, 'city', { maxlength: 200 }), f('Payment instructions', doc.business, 'paymentInstructions', { type: 'textarea', maxlength: 3000 }),
      doc.pages.map(page => h('details', {}, h('summary', {}, page.title), page.sections.filter(s => !['products'].includes(s.type)).map(section => h('section', { class: 'ms-content-section' }, f(page.title + ' · heading', section, 'title', { maxlength: 1000 }), f(page.title + ' · message', section, 'body', { type: 'textarea', maxlength: 6000 }),
        section.image ? h('img', { src: section.image, alt: section.alt || '', class: 'ms-content-photo' }) : null,
        ['hero', 'split', 'gallery', 'cards'].includes(section.type) ? h('label', { class: 'ms-secondary' }, 'Replace content image', h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', disabled: busy, onchange: event => upload(event.target.files[0], src => section.image = src) })) : null,
        (section.items || []).map((item, i) => h('div', {}, f('Item ' + (i + 1) + ' heading', item, 'title'), f('Item ' + (i + 1) + ' message', item, 'body', { type: 'textarea' }))))))),
    ], () => send('content', { revision: e.revision, document: doc }), 'Save content draft');
  }
  function credentials() {
    if (!newAccessKey) return null;
    return panel('Save this workspace access privately', h('p', {}, 'These details belong only to this private test workspace. Store them in your password manager; they are not recovery for the original beta.'),
      h('input', { value: workspace, readonly: true, 'aria-label': 'Workspace ID' }), h('input', { type: 'password', value: newAccessKey, readonly: true, 'aria-label': 'Private access key', autocomplete: 'off' }),
      button('I saved these details', () => { newAccessKey = ''; render(); }, { class: 'ms-primary' }));
  }
  function render() {
    if (reauth) { root.replaceChildren(h('main', { class: 'ms-loading' }, h('h1', {}, 'Sign-in required'), h('p', {}, 'Your unsaved form is kept in this tab. Sign in to this exact website in a new tab, then check the connection.'), h('a', { href: initial.studioPath, target: '_blank', rel: 'noopener' }, 'Sign in to this website'), button('Check connection', () => refresh()))); return; }
    if (!data.management) { root.replaceChildren(h('main', { class: 'ms-loading' }, 'Opening Rise & Roost Website Studio…')); return; }
    const page = editing ? editForm() : view === 'Home' ? home() : view === 'Orders' ? orders() : view === 'Products' ? products() : view === 'Calendar' ? calendar() : view === 'The Roost' ? members() : view === 'Website Content' ? content() : view === 'Customer Comments' ? comments() : view === 'Sales Reports' ? reports() : view === 'Settings' ? settings() : h('div', {}, h('h1', {}, 'More'), secondary.map(label => menu(label, label)));
    root.replaceChildren(h('div', { class: 'management' },
      h('aside', { class: 'ms-sidebar' }, h('a', { href: initial.studioPath, class: 'ms-brand' }, h('img', { src: '/assets/logo.webp', alt: 'Rise & Roost' }), h('span', {}, 'Rise & Roost', h('small', {}, 'Website Studio'))),
        h('nav', { 'aria-label': 'Studio navigation' }, primary.filter(v => v !== 'More').map(label => button(label, () => go(label), { 'aria-current': view === label ? 'page' : undefined })), h('details', { open: true }, h('summary', {}, 'More'), secondary.map(label => button(label, () => go(label), { 'aria-current': view === label ? 'page' : undefined })))), h('a', { href: initial.publishedPath, target: '_blank', rel: 'noopener', class: 'ms-secondary' }, 'View website')),
      h('div', { class: 'ms-workspace' }, h('header', { class: 'ms-top' }, h('div', { class: 'ms-mobile-brand' }, h('img', { src: '/assets/logo.webp', alt: '' }), h('strong', {}, 'Rise & Roost', h('small', {}, 'Website Studio'))),
        h('span', { id: 'management-connection', role: 'status', class: connected ? '' : 'offline' }, connected ? 'Connected' : 'Offline / reconnecting'), button('Check connection', () => refresh(), { class: 'ms-text' }), pending && !busy ? button('Resolve previous save', cancel, { class: 'ms-text' }) : null),
        h('div', { id: 'management-error', role: 'alert', class: 'ms-error', hidden: !error }, error),
        h('main', { id: 'main-content', class: 'ms-main' }, credentials(), page)),
      h('nav', { class: 'ms-bottom', 'aria-label': 'Primary Studio navigation' }, primary.map(label => button(label, () => go(label), { 'aria-current': view === label || label === 'More' && secondary.includes(view) ? 'page' : undefined })))));
    if (busy) for (const control of root.querySelectorAll('button,input,select,textarea')) control.disabled = true;
  }
  window.addEventListener('beforeunload', event => { if (editing || pending) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('offline', () => { connected = false; error = 'You’re offline. Changes stay unsaved until the server confirms them.'; chrome(); });
  window.addEventListener('online', () => refresh());
  window.addEventListener('focus', () => refresh());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  try { const target = decodeURIComponent(location.hash.slice(1)); if ([...primary, ...secondary].includes(target)) view = target; } catch {}
  try { const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); if (saved?.type && ['product', 'calendar', 'content'].includes(saved.type)) { editing = saved; view = { product: 'Products', calendar: 'Calendar', content: 'Website Content' }[saved.type]; } } catch {}
  try { const saved = JSON.parse(sessionStorage.getItem(pendingKey) || 'null'); if (/^[a-f0-9-]{32,48}$/.test(saved?.id || '')) pending = { id: saved.id, form: editing }; } catch {}
  render(); await refresh();
  setInterval(() => { if (!document.hidden && !busy && !disposed) void refresh(); }, 5000);
}
