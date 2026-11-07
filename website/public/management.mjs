import { dollarsToCents, centsToDollars } from './credit-money.mjs';
import { requestedPickupLabel, providers, defaultCalendar, paymentDestination, configuredPayments } from './commerce.mjs';
import { h, button, field, request as apiRequest, notify } from './dom.mjs';
import { clone, money, pickupLabel, orderByLabel, customerTimestamp, customerTime, localInstant, isOrderingPickup } from './model.mjs';
import { paymentLabels, fulfillmentLabels, notificationLabels } from './orders.mjs';
import { studioHistory } from './studio-history.mjs';
import { createHelpGuide } from './help.mjs';
import { sellingMethod, inventoryMode } from './selling.mjs';

const primary = ['Home', 'Orders', 'Products', 'Calendar', 'More'];
const secondary = ['Marketing', 'The Roost', 'Website Content', 'Customer Comments', 'Sales Reports', 'Settings'];
const id = () => crypto.randomUUID();
const navigationIcon = kind => {
  const namespace = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(namespace, 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', width: '18', height: '18', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) icon.setAttribute(key, value);
  const path = document.createElementNS(namespace, 'path');
  path.setAttribute('d', kind === 'home' ? 'M3 10.5 12 3l9 7.5M5.5 9v11h13V9M9 20v-6h6v6' : 'M19 12H5m6 6-6-6 6-6');
  icon.append(path); return icon;
};
const pickupArrangement = o => o.pickupChange && !o.pickupChange.replacement ? 'Awaiting makeup date · original ' + o.pickupChange.originalDate : pickupLabel(o.pickup);
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
  let emailDraft = null, marketingDraft = null, marketingProcessing = false;
  let editing = null, busy = false, pending = null, error = '', connected = navigator.onLine, checking = false, disposed = false, reauth = false;
  const bindings = new WeakMap();
  const workspace = initial.id, storageKey = 'rr-studio-draft:' + workspace;
  const pendingKey = 'rr-studio-pending:' + workspace;
  const testChecks = new Map();
  const paymentsVersion = () => data.management.settings?.paymentsVersion || 0;
  const paymentFields = provider => { const p = data.management.settings?.payments?.[provider] || {}; return { provider, url: p.url || '', enabled: p.enabled === true, businessConfirmed: p.businessConfirmed === true }; };
  const formChanged = () => editing && (editing.type === 'payment-settings' ? editing.paymentsVersion !== paymentsVersion() : editing.revision !== data.revision || editing.ledgerVersion !== data.ledgerVersion);
  const request = (path, body) => apiRequest((initial.productionOwnerAccess ? '/studio' : '') + path, body, { workspaceId: workspace });
  const stamp = at => at ? customerTimestamp(at) : 'Not recorded';
  const marked = () => { if (editing && ['product', 'calendar', 'content', 'payment-settings', 'fresh-announcement'].includes(editing.type)) try { sessionStorage.setItem(storageKey, JSON.stringify(editing)); } catch {} };
  const f = (label, object, key, options = {}) => {
    const set = v => { object[key] = options.type === 'number' ? Number(v) : v; marked(); };
    const node = field(label, object[key] ?? '', set, options), input = node.querySelector('input,textarea,select');
    bindings.set(input, () => set(options.type === 'checkbox' ? input.checked : input.value)); return node;
  };
  const check = (label, object, key) => f(label, object, key, { type: 'checkbox' });
  const helpGuide = createHelpGuide();
  let navigation;
  const route = () => ({ view, selection, filter, search, editing });
  const homeRoute = () => ({ view: 'Home', selection: '', filter: 'all', search: '', editing: null });
  function canLeave() {
    if (busy || pending) return false;
    return !editing || confirm('Leave this form? The latest unfinished product, calendar, content, announcement or payment link form is kept in this tab until you save, cancel, or replace it with another form.');
  }
  function applyRoute(next) {
    const focusHelpHeading = next.view === 'Settings/Help' || view === 'Settings/Help';
    ({ view, selection, filter, search, editing } = next); error = '';
    render(); window.scrollTo(0, 0);
    if (focusHelpHeading) { const heading = root.querySelector('.ms-main h1'); heading?.setAttribute('tabindex', '-1'); heading?.focus(); }
  }
  function go(next, selected = '', nextFilter = 'all') {
    navigation.navigate({ view: next, selection: selected, filter: nextFilter, search: '', editing: null });
  }
  function edit(type, values) {
    const form = { type, values: clone(values), original: clone(values), revision: data.revision, ledgerVersion: data.ledgerVersion, paymentsVersion: paymentsVersion() };
    navigation.push({ ...route(), editing: form }); marked();
  }
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
    } else if (e.type === 'fresh-announcement') { const remote = { announcement: data.published.freshAnnouncement || '' }; e.values = merge(e.original || v, v, remote); e.original = clone(remote); } else if (e.type === 'content') { e.values = merge(e.original || v, v, data.draft); e.original = clone(data.draft); }
    else if (e.type === 'calendar') {
      const current = data.published.pickups.find(p => p.id === v.pickup.id);
      if (current) { const remote = { ...v, pickup: current }; e.values = merge(e.original || v, v, remote); e.original = clone(remote); }
    } else if (e.type === 'payment-settings') { const remote = paymentFields(v.provider); e.values = merge(e.original || v, v, remote); e.original = clone(remote); e.paymentsVersion = paymentsVersion(); } else if (v.orderId) { const current = data.orders.find(o => o.id === v.orderId); if (current) v.orderVersion = current.version; }
    e.revision = data.revision; e.ledgerVersion = data.ledgerVersion; error = ''; marked(); render();
  }
  async function cancel() {
    if (busy) return;
    const discardDraft = ['product', 'calendar', 'content', 'payment-settings', 'fresh-announcement'].includes(editing?.type) || ['product', 'calendar', 'content', 'payment-settings', 'fresh-announcement'].includes(pending?.form?.type);
    if (pending) {
      busy = true; error = ''; render();
      try {
        const resolved = await request('/api/manage/abandon-operation', { operationId: pending.id });
        data = resolved; notify(resolved.result?.abandoned ? 'The unconfirmed request is canceled.' : 'The server confirms the previous save.');
      } catch (e) { error = 'The previous result is still unconfirmed. Reconnect before starting another action. ' + e.message; busy = false; render(); return; }
      busy = false;
    }
    navigation.forgetForm(editing); editing = null; pending = null; error = ''; if (discardDraft) sessionStorage.removeItem(storageKey); sessionStorage.removeItem(pendingKey); render();
  }
  async function refresh(rerender = true) {
    if (checking || disposed) return;
    checking = true;
    const wasReauth = reauth;
    try {
      const q = new URLSearchParams({ period }); if (period === 'custom') { q.set('start', from); q.set('end', through); }
      const next = await request('/api/manage/snapshot?' + q);
      if (next.id !== workspace) throw new Error('This response belongs to another workspace. Sign in to the correct saved website.');
      if (next.revision < data.revision || next.ledgerVersion < data.ledgerVersion) return;
      data = next; connected = true; reauth = false;
      if (pending && !busy) {
        const resolving = pending;
        const status = await request('/api/manage/operation?operationId=' + resolving.id);
        if (status.found && pending === resolving && !busy) {
          data = await request('/api/manage/snapshot?' + q);
          if (pending === resolving && !busy) {
            pending = null; if (editing === resolving.form) { if (['product', 'calendar', 'content', 'payment-settings', 'fresh-announcement'].includes(editing?.type)) sessionStorage.removeItem(storageKey); navigation.forgetForm(editing); editing = null; }
            error = ''; sessionStorage.removeItem(pendingKey); notify(status.result?.abandoned ? 'The previous request was canceled.' : 'The server confirms your previous save.');
          }
        }
      }
      if (wasReauth || !root.querySelector('.management') || rerender && !editing && !root.querySelector('.ms-main input[type=search]:focus') && !(view === 'Settings/Email' && root.querySelector('.ms-main input:focus')) && !(view === 'Settings/Help' && root.querySelector('.ms-help')?.contains(document.activeElement))) render(); else chrome();
    } catch (e) { connected = false; error = e.message; if (e.status === 401 || (initial.previewDirectAccess || initial.productionOwnerAccess) && [403, 503].includes(e.status)) { reauth = true; render(); } else chrome(); }
    finally { checking = false; }
  }
  function chrome() {
    const status = root.querySelector('#management-connection');
    if (status) { status.textContent = connected ? 'Connected' : 'Offline / reconnecting'; status.classList.toggle('offline', !connected); }
    const notice = root.querySelector('#management-error'); if (notice) { notice.textContent = error; notice.hidden = !error; }
    const reopen = root.querySelector('#management-reopen'); if (reopen) reopen.hidden = connected;
    const conflict = root.querySelector('#management-conflict'); if (conflict) conflict.hidden = !formChanged();
  }
  async function send(path, payload, { keepForm = false, successMessage = 'Saved.' } = {}) {
    if (busy) return;
    if (!navigator.onLine) { connected = false; error = 'You’re offline. Your fields are unsaved. Reconnect, then retry.'; chrome(); return; }
    const logical = JSON.stringify({ path, payload });
    if (pending && pending.logical !== logical) { error = 'Confirm the previous save before starting a different change. Use Check connection, then retry the same action.'; chrome(); return; }
    pending ||= { id: id(), logical, form: editing }; try { sessionStorage.setItem(pendingKey, JSON.stringify({ id: pending.id })); } catch {} busy = true; error = ''; render();
    try {
      const result = await request('/api/manage/' + path, { ...payload, operationId: pending.id });
      if (!result.management || result.id !== workspace || result.result === undefined && result.duplicate !== true) throw new Error('The server did not confirm this save. Your fields are kept; check the connection before retrying.');
      data = result;
      pending = null; sessionStorage.removeItem(pendingKey); if (!keepForm) { if (['product', 'calendar', 'content', 'payment-settings', 'fresh-announcement'].includes(editing?.type)) sessionStorage.removeItem(storageKey); navigation.forgetForm(editing); editing = null; }
      connected = true; notify(successMessage); return result;
    } catch (e) {
      error = e.message; if (e.status && e.status < 500 && !(initial.previewDirectAccess && e.status === 403)) { pending = null; sessionStorage.removeItem(pendingKey); }
      if (initial.previewDirectAccess && [403, 503].includes(e.status)) reauth = true;
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
    const changedElsewhere = formChanged();
    return h('form', { class: 'ms-panel ms-edit', onsubmit: async e => { e.preventDefault(); for (const input of e.currentTarget.elements) bindings.get(input)?.(); try { await save(); } catch (problem) { error = problem.message; render(); } } }, h('h2', {}, title), h('div', { id: 'management-conflict', class: 'ms-warning', hidden: !changedElsewhere }, h('p', {}, 'New changes were saved while this form was open. Your unsaved fields are still here.'), button('Review latest and keep my edits', rebase, { class: 'ms-secondary', disabled: !!pending })), children, actions(save, label));
  }
  const panel = (title, ...children) => h('section', { class: 'ms-panel' }, h('h2', {}, title), children);
  const empty = message => h('p', { class: 'ms-empty' }, message);
  const pill = text => h('span', { class: 'ms-pill' }, text);
  const menu = (label, target, count, targetFilter = 'all') => button([h('span', {}, label), count !== undefined ? h('strong', {}, count) : null, h('span', { 'aria-hidden': true }, '›')], () => go(target, '', targetFilter), { class: 'ms-menu' });
  function rangeControls() {
    return h('div', { class: 'ms-ranges', 'aria-label': 'Report period' },
      [['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'This Week'], ['month', 'This Month'], ['year', 'This Year'], ['custom', 'Custom Date Range']].map(([value, label]) => button(label, async () => {
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
      h('div', { class: 'ms-metrics' }, metric('Today’s order value', money(t.orderValue), 'Orders', 'today'), metric('Awaiting verification', a.payments, 'Orders', 'unverified'), metric('New orders', a.newOrders, 'Orders', 'pending'), metric('Preparing', a.preparing, 'Orders', 'preparing'), metric('Ready for Pickup', a.ready, 'Orders', 'ready'), metric('Customer Contacted', a.contacted, 'Orders', 'contacted'), metric('Pickup Extension Requests', a.extensions, 'Orders', 'extensions'), metric('Pickup Overdue', a.overdue, 'Orders', 'overdue'), metric('Other Attention Items', a.other, 'Orders', 'disputes'), metric('Upcoming pickups', a.upcoming, 'Orders', 'upcoming'), metric('Low-stock products', a.lowStock, 'Products', 'low'), metric('New comments', a.comments, 'Customer Comments', 'pending')),
      panel('Needs Your Attention',
        a.pickupArrangements ? menu('Review pickup arrangement requests', 'Calendar/Changes', a.pickupArrangements) : null,
        a.contacted ? menu('Customer Contacted — review messages', 'Orders', a.contacted, 'contacted') : null,
        a.extensions ? menu('Review pickup extension requests', 'Orders', a.extensions, 'extensions') : null,
        a.overdue ? menu('Review overdue pickups', 'Orders', a.overdue, 'overdue') : null,
        a.other ? menu('Review disputes', 'Orders', a.other, 'disputes') : null,
        pref.payments && a.payments ? menu('Verify payments', 'Orders', a.payments, 'reported') : null,
        pref.orders && a.newOrders ? menu('Review new orders', 'Orders', a.newOrders, 'pending') : null,
        pref.stock && a.lowStock ? menu('Check low inventory', 'Products', a.lowStock, 'low') : null,
        pref.pickups && a.upcoming ? menu('Prepare upcoming pickups', 'Orders', a.upcoming, 'upcoming') : null,
        pref.comments && a.comments ? menu('Read new comments', 'Customer Comments', a.comments, 'pending') : null,
        !Object.values(a).some(Boolean) ? empty('You’re all caught up.') : ![['payments', 'payments'], ['orders', 'newOrders'], ['stock', 'lowStock'], ['pickups', 'upcoming'], ['comments', 'comments']].some(([key, count]) => pref[key] && a[count]) ? empty('Your summary cards show current activity. Attention alerts are off in Settings.') : null),
      pickupReminder(), menu('Pickup Schedule Changes', 'Calendar/Changes'), freshAnnouncementPanel(), menu('Open the pickup calendar & production lists', 'Calendar'));
  }
  function orders() {
    if (selection && !/^\d{4}-\d{2}-\d{2}$/.test(selection)) return orderDetail(data.orders.find(o => o.id === selection));
    const day = data.management.today.range.start;
    const matches = o => {
      if (filter === 'all' && o.attention?.history) return false;
      if (filter === 'history' && !o.attention?.history) return false;
      if (['pending','preparing','ready'].includes(filter) && (o.attention?.history || o.resolution)) return false;
      if (filter === 'unverified' && (o.paymentVerifiedAt || o.status === 'canceled' || o.resolution)) return false;
      if (filter === 'disputes' && !o.dispute?.open) return false;
      if (filter === 'attention' && !o.attention?.needsAttention) return false;
      if (filter === 'contacted' && !o.attention?.customerContacted) return false;
      if (filter === 'extensions' && !o.attention?.extensionRequested) return false;
      if (filter === 'overdue' && !o.attention?.overdue) return false;
      if (filter === 'today' && o.businessDate !== day) return false;
      if (filter === 'upcoming' && (o.resolution || ['canceled', 'picked-up'].includes(o.status) || localInstant(o.pickup.date, o.pickup.end) <= Date.parse(data.now) || localInstant(o.pickup.date, o.pickup.start) >= Date.parse(data.now) + 2 * 86400000)) return false;
      if (!['all', 'today', 'upcoming', 'history', 'unverified', 'attention', 'contacted', 'extensions', 'overdue', 'disputes'].includes(filter) && o.status !== filter && o.paymentStatus !== filter) return false;
      return !search || [o.orderNumber, o.customer?.name, o.customer?.email, o.customer?.phone, ...o.lines.map(l => l.name)].join(' ').toLowerCase().includes(search.toLowerCase());
    };
    const selected = data.orders.filter(matches);
    return h('div', {}, h('div', { class: 'ms-heading' }, h('h1', {}, 'Orders'), button('Export orders', exportOrders, { class: 'ms-secondary' })),
      field('Search orders or customers', search, value => { search = value; renderList(); }, { type: 'search' }),
      h('div', { class: 'ms-chips' }, [['all', 'Active'], ['pending', 'New'], ['preparing', 'Preparing'], ['ready', 'Ready for Pickup'], ['attention', 'Needs Attention'], ['unverified', 'Awaiting Verification'], ['history', 'History']].map(([value, label]) => button(label, () => { filter = value; render(); }, { 'aria-pressed': value === filter }))),
      h('div', { id: 'ms-order-list' }, orderCards(selected)));
    function renderList() {
      const box = root.querySelector('#ms-order-list');
      box?.replaceChildren(...orderCards(data.orders.filter(matches)));
    }
  }
  function orderCards(items) {
    const cards = items.map(o => button([
      h('div', { class: 'ms-row' }, h('strong', {}, o.customer?.name || 'Guest customer'), pill(fulfillmentLabels[o.status])),
      h('span', {}, o.orderNumber), h('span', {}, pickupArrangement(o)), attentionPills(o),
      h('div', { class: 'ms-row' }, h('span', {}, (o.selectedPaymentMethod === 'cash_pickup' ? 'Cash at Pickup · ' : '') + (paymentLabels[o.paymentStatus] || 'Awaiting Payment')), h('strong', {}, money(o.total))),
    ], () => go('Orders', o.id), { class: 'ms-order-card' }));
    if (!items.length) return [empty('No matching orders.')];
    return [h('div', { class: 'ms-order-cards' }, cards), h('div', { class: 'ms-table-wrap' }, h('table', { class: 'ms-order-table' },
      h('thead', {}, h('tr', {}, ['Order', 'Customer', 'Pickup', 'Payment', 'Fulfillment', 'Total'].map(label => h('th', { scope: 'col' }, label)))),
      h('tbody', {}, items.map(o => h('tr', {}, h('td', {}, o.orderNumber), h('td', {}, button(o.customer?.name || 'Guest customer', () => go('Orders', o.id), { class: 'ms-text' })), h('td', {}, pickupArrangement(o)), h('td', {}, paymentLabels[o.paymentStatus] || 'Awaiting Payment'), h('td', {}, fulfillmentLabels[o.status]), h('td', {}, money(o.total)))))))];
  }
  function attentionPills(o) {
    const a = o.attention || {};
    return h('div', { class: 'ms-row' }, o.pickupChange ? pill(!o.pickupChange.replacement ? 'Awaiting makeup date' : o.pickupChange.acknowledgement?.response === 'alternate' ? 'Different arrangement requested' : o.pickupChange.acknowledgement ? 'New pickup confirmed' : 'Pickup changed · awaiting response') : null, a.customerContacted ? pill('Customer Contacted') : null, a.extensionRequested ? pill('Pickup Extension Request') : null, a.extensionApproved ? pill('Extension Approved') : null, a.overdue ? pill('Pickup Overdue') : null, a.resolved ? pill('Resolved') : null, o.dispute?.open ? pill('Payment Dispute') : null, o.resolution ? pill('Owner Reviewed') : null);
  }
  function orderDetail(o) {
    if (!o) return empty('This order is not available.');
    return h('div', {},
      h('div', { class: 'ms-heading' }, h('h1', {}, o.orderNumber), pill(fulfillmentLabels[o.status])),
      o.pickupChange ? panel('Pickup schedule change',h('p',{},o.pickupChange.message),h('p',{},o.pickupChange.replacement?pickupLabel(o.pickupChange.replacement):'Awaiting makeup date'),h('p',{},o.pickupChange.acknowledgement?.response||'Not responded'),button('Review schedule changes',()=>go('Calendar/Changes'),{class:'ms-secondary'}),h('details',{},h('summary',{},'Earlier pickup notices and responses'),(o.pickupChangeHistory||[]).map(c=>h('p',{},'Notice '+c.version+' · '+(c.replacement?pickupLabel(c.replacement):'Date To Be Announced')+' · '+c.message+' · '+(c.acknowledgement?.response||'No response'))))) : null,
      attentionPills(o),
      panel('Payment', h('h3', {}, o.customer?.name || 'Guest customer'), o.selectedPaymentMethod === 'cash_pickup' ? h('p', {}, 'Cash Due: ' + money(o.paymentVerifiedAt || o.status === 'canceled' || o.resolution ? 0 : o.total)) : null, h('strong', {}, (o.selectedPaymentMethod === 'cash_pickup' ? 'Cash amount: ' : 'Remaining payment: ') + money(o.total)), o.creditApplied ? h('p', {}, 'Order subtotal: ' + money(o.subtotal) + ' · Return credit: ' + money(o.creditApplied) + ' (' + o.returnCredit.status + ')') : null, pill(paymentLabels[o.paymentStatus] || 'Awaiting Payment'), h('p', {}, 'Selected method: ' + (o.selectedPaymentMethod === 'cash_pickup' ? 'Cash at Pickup' : providers[o.selectedPaymentMethod] || providers[o.verification?.method] || o.verification?.method || 'Not chosen yet')),
        o.total > 0 && !o.paymentVerifiedAt && o.status !== 'canceled' && !o.resolution ? o.selectedPaymentMethod === 'cash_pickup' ? button('Mark Cash Received', () => edit('cash-received', { orderId: o.id, orderVersion: o.version, amount: o.total, confirmed: false }), { class: 'ms-primary' }) : button('Verify payment', () => edit('payment', { orderId: o.id, orderVersion: o.version, method: o.selectedPaymentMethod || 'paypal', evidence: '', independentlyVerified: false }), { class: 'ms-primary' }) : null,
        o.paymentVerifiedAt ? h('p', {}, 'Verified ' + stamp(o.paymentVerifiedAt)) : null,
        o.paymentVerifiedAt ? button('Correct a mistaken verification', () => edit('payment-correction', { orderId: o.id, orderVersion: o.version, reason: '', independentlyChecked: false }), { class: 'ms-text' }) : null,
        (o.refunds || []).map(r => h('p', {}, 'Recorded refund: ' + money(r.amount) + ' · ' + stamp(r.at))),
        o.paymentVerifiedAt ? button('Record an external refund', () => edit('refund', { orderId: o.id, orderVersion: o.version, amount: '', evidence: '', reason: '', independentlyVerified: false }), { class: 'ms-secondary' }) : null),
      panel('Preparation & pickup',
        !o.resolution && ['pending','preparing'].includes(o.status) ? button(o.status === 'pending' ? 'Start Preparing' : 'Mark Ready for Pickup', () => send('fulfillment', { id: o.id, orderVersion: o.version, status: o.status === 'pending' ? 'preparing' : 'ready' }), { class: 'ms-primary', disabled: busy }) : null,
        o.status === 'ready' ? h('p', {}, 'Ready for Pickup. No further normal action is required.') : null,
        !o.resolution && o.status !== 'picked-up' ? h('details', {}, h('summary', {}, 'Corrections & cancellation'),
          button('Cancel order', () => edit('status', { orderId: o.id, orderVersion: o.version, status: 'canceled', reason: '', confirmCorrection: false, releaseInventory: false }), { class: 'ms-secondary' }),
          button('Correct a status mistake', () => edit('status', { orderId: o.id, orderVersion: o.version, status: 'pending', reason: '', confirmCorrection: true, releaseInventory: false }), { class: 'ms-text' })) : null,
        o.status === 'canceled' && o.keepInventory ? button('Release canceled reservation', () => edit('status', { orderId: o.id, orderVersion: o.version, status: 'canceled', reason: '', confirmCorrection: false, releaseInventory: true }), { class: 'ms-secondary' }) : null),
      panel('Customer & pickup', h('h3', {}, o.customer?.name || 'Guest customer'), h('p', {}, o.customer?.memberId ? 'The Roost member: ' + (data.management.members.find(m => m.id === o.customer.memberId)?.profile.name || o.customer.memberId) : 'Guest checkout'),
        o.customer?.email ? h('p', {}, h('a', { href: 'mailto:' + o.customer.email }, o.customer.email)) : null,
        o.customer?.phone ? h('p', {}, h('a', { href: 'tel:' + o.customer.phone }, o.customer.phone)) : null,
        h('p', {}, pickupArrangement(o)), o.pickupDeadline ? h('p', {}, 'Pickup deadline: ' + stamp(o.pickupDeadline)) : h('p', {}, 'Historical order: no new policy deadline applied'), o.originalPickup && o.extension ? h('p', {}, 'Original pickup: ' + pickupLabel(o.originalPickup)) : null),
      h('details', { class: 'ms-panel' }, h('summary', {}, 'Order details'), o.lines.map(l => h('div', { class: 'ms-row ms-line' }, h('span', {}, l.qty + ' × ' + l.name + ' · ' + l.variant), h('strong', {}, money(l.qty * l.unitPrice)))), h('div', { class: 'ms-row' }, h('strong', {}, 'Total'), h('strong', {}, money(o.total)))),
      panel('Customer messages & pickup arrangements',
        o.contact?.unresolved ? h('p', {}, 'Customer Contacted — awaiting owner review. A request does not approve an extension.') : null,
        (o.messages || []).map(m => h('article', { class: 'ms-audit' }, h('strong', {}, m.sender === 'owner' ? 'Danielle' : o.customer?.name || 'Customer'), h('p', {}, m.body), h('small', {}, stamp(m.at)), (m.requestedDate || m.requestedTime) ? h('p', {}, 'Requested: ' + requestedPickupLabel(m)) : m.topic === 'pickup' ? h('p', {}, 'Pickup delay or more time requested; alternative date/time not specified.') : null)),
        (o.messages || []).filter(m=>m.pickupRequestStatus).map(m=>h('article',{class:'ms-audit'},h('h3',{},'Pickup change request · '+m.pickupRequestStatus), h('p',{},'Original: '+pickupLabel(m.originalPickup)), h('p',{},'Requested: '+requestedPickupLabel(m)), h('p',{},m.body), m.pickupRequestStatus==='pending' ? h('div',{},button('Approve',()=>{if(confirm('Approve this requested pickup schedule?')) send('approve-extension',{id:o.id,orderVersion:o.version,date:m.requestedDate,time:m.requestedTime,requestId:m.id,confirmed:true});},{class:'ms-primary'}),button('Decline',()=>{if(confirm('Decline this request and preserve the original pickup?')) send('decline-pickup-request',{id:o.id,orderVersion:o.version,requestId:m.id,confirmed:true});},{class:'ms-secondary'})) : null)),
        button('Reply to customer', () => edit('reply', { orderId: o.id, orderVersion: o.version, body: '' }), { class: 'ms-secondary' }),
        !['canceled','picked-up'].includes(o.status) && !o.resolution ? button('Approve New Pickup Time', () => edit('extension', { orderId: o.id, orderVersion: o.version, date: o.pickup.date, time: o.pickup.start, confirmed: false }), { class: 'ms-primary' }) : null,
        o.contact?.unresolved ? button('Resolve conversation', () => edit('contact-resolution', { orderId: o.id, orderVersion: o.version, reason: '', confirmed: false }), { class: 'ms-secondary' }) : null),
      panel('Owner review',
        o.selectedPaymentMethod === 'cash_pickup' && !o.paymentVerifiedAt && !o.resolution && o.status !== 'canceled' ? button('Close as Unpaid / Not Picked Up', () => edit('cash-unpaid', { orderId: o.id, orderVersion: o.version, amount: o.total, reason: '', confirmed: false }), { class: 'ms-secondary' }) : null, o.resolution ? h('p', {}, o.resolution.kind + ': ' + o.resolution.reason) : null,
        !o.resolution && !['canceled','picked-up'].includes(o.status) ? button('Review pickup resolution', () => edit('pickup-resolution', { orderId: o.id, orderVersion: o.version, reason: '', resolution: 'reviewed', confirmed: false }), { class: 'ms-secondary' }) : null,
        button(o.dispute?.open ? 'Resolve payment dispute' : 'Record payment dispute', () => edit('dispute', { orderId: o.id, orderVersion: o.version, reason: '', open: !o.dispute?.open, confirmed: false }), { class: 'ms-text' })),
      h('details', { class: 'ms-panel' }, h('summary', {}, 'Order history'), (o.audit || []).map(e => h('div', { class: 'ms-audit' }, h('strong', {}, e.action), h('span', {}, stamp(e.at)), h('small', {}, e.author || 'Customer / system')))),
      o.trackingPath ? h('a', { href: o.trackingPath, target: '_blank', rel: 'noopener noreferrer', class: 'ms-secondary private-link' }, 'Open customer tracking') : null);
  }
  function exportOrders() {
    const rows = [['Order', 'Placed', 'Customer', 'Email', 'Phone', 'Pickup', 'Total cents', 'Payment', 'Fulfillment', 'Verified at', 'Refund cents']];
    for (const o of data.orders) rows.push([o.orderNumber, stamp(o.at), o.customer?.name, o.customer?.email, o.customer?.phone, pickupArrangement(o), o.total, o.paymentStatus, o.status, o.paymentVerifiedAt ? stamp(o.paymentVerifiedAt) : '', (o.refunds || []).reduce((n, r) => n + r.amount, 0)]);
    download('rise-roost-orders.csv', csv(rows), 'text/csv');
  }
  const methodLabels = { online: 'Online Ordering', preorder: 'Preorder', 'in-store': 'In-Store Only' };
  const hiddenProduct = p => p.archived || !p.active;
  function freshAnnouncementPanel() {
    return panel('Fresh at The Roost!', h('p', {}, data.published.freshAnnouncement || 'No daily announcement is displayed.'),
      button('Edit daily announcement', () => edit('fresh-announcement', { announcement: data.published.freshAnnouncement || '' }), { class: 'ms-secondary' }));
  }
  async function setProductVisibility(p, hidden) {
    if (!confirm(hidden ? 'Hide ' + p.name + ' from the website? Existing orders, product details and photos will be kept.' : 'Show ' + p.name + ' on the website again? Its selling method and saved quantities will apply.')) return;
    return send('product-visibility', { id: p.id, hidden, confirmed: true, revision: data.revision, ledgerVersion: data.ledgerVersion }, { successMessage: hidden ? 'Product hidden. Existing orders are kept.' : 'Product is visible again.' });
  }
  function products() {
    const products = data.management.products.filter(p => (filter === 'hidden' ? hiddenProduct(p) : !hiddenProduct(p)) && (filter !== 'low' || inventoryMode(p) !== 'production' && p.available <= (p.lowStockThreshold ?? 3)));
    return h('div', {}, h('div', { class: 'ms-heading' }, h('h1', {}, 'Products'), button('Add product', () => editProduct(), { class: 'ms-primary' })),
      h('div', { class: 'ms-chips' }, button('Active', () => { filter = 'all'; render(); }, { 'aria-pressed': filter === 'all' }), button('Low stock', () => { filter = 'low'; render(); }, { 'aria-pressed': filter === 'low' }), button('Hidden', () => { filter = 'hidden'; render(); }, { 'aria-pressed': filter === 'hidden' })),
      h('div', { class: 'ms-product-grid' }, products.map(p => h('article', { class: 'ms-panel ms-product' },
        h('img', { src: p.images[0]?.src, alt: p.images[0]?.alt || p.name }),
        h('h2', {}, p.name), h('div', { class: 'ms-row' }, h('strong', {}, money(p.price)), pill(hiddenProduct(p) ? 'Hidden' : p.soldOut || (sellingMethod(p) === 'preorder' ? (p.availableToOrder ?? p.capacity) <= 0 : p.available <= 0) ? 'Sold Out' : 'Visible')),
        h('p', {}, methodLabels[sellingMethod(p)]), h('p', {}, sellingMethod(p) === 'preorder' ? p.capacity + ' can be made for each pickup date' : p.available + (sellingMethod(p) === 'in-store' ? ' in the store' : ' available')),
        h('div', { class: 'ms-actions' }, button('Edit product', () => editProduct(p), { class: 'ms-primary' }), button('Duplicate', () => editProduct(p, true), { class: 'ms-secondary' }), button(hiddenProduct(p) ? 'Show Product' : 'Hide Product', () => setProductVisibility(p, !hiddenProduct(p)), { class: 'ms-secondary', disabled: busy }))))), !products.length ? empty('No products in this view.') : null,
      freshAnnouncementPanel());
  }
  function editProduct(product, duplicate = false) {
    const p = product ? clone(product) : { id: 'product-' + id(), name: '', description: '', price: 0, stock: 10, capacity: 10, category: '', channel: 'preorder', active: true, images: [{ src: '/assets/bread.svg', alt: '', x: 50, y: 50 }], variants: [{ id: 'standard', name: 'Standard', extra: 0 }], inventoryMode: 'physical', sellingMethod: 'online' };
    if (duplicate) { p.id = 'product-' + id(); p.name += ' copy'; p.archived = false; p.active = true; }
    p.archived = !!p.archived; p.soldOut = !!p.soldOut; p.lowStockThreshold ??= 3;
    p.inventoryMode ||= 'legacy';
    edit('product', { product: p, dollars: (p.price / 100).toFixed(2), available: duplicate ? 0 : product?.available ?? p.stock });
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
  function pickupOrders(p) { return data.orders.filter(o => o.pickupId === p.id || o.pickup?.id === p.id || o.originalPickup?.id === p.id); }
  const futurePickup = p => localInstant(p.date, p.end) > Date.parse(data.now);
  async function removePickup(p) {
    const count = data.orders.filter(o => (o.originalPickup || o.pickup).date === p.date).length;
    if (!confirm(count ? 'Remove this pickup from new ordering? ' + count + ' existing order' + (count === 1 ? '' : 's') + ' will keep the original pickup details. Contact each customer through Orders if a new arrangement is needed.' : 'Skip this pickup date? It will close to new orders. Other weeks continue automatically.')) return;
    return send('calendar-date', { revision: data.revision, ledgerVersion: data.ledgerVersion, pickup: { ...p, closed: true }, closeDate: true, confirmExistingOrders: count > 0 });
  }
  function pickupReminder() {
    const b=data.management.pickupBooking;
    if (!b) return null;
    return panel('Upcoming Pickup Weeks', h('p', {}, b.approved.length + ' approved upcoming weeks · ' + b.bookableDates + ' bookable dates'), b.approved.length ? h('p',{class:'ms-note'},'Approved: '+b.weeks.filter(w=>b.approved.includes(w.start)).map(w=>w.start+' through '+w.end).join('; ')) : null, b.nextUnapproved ? h('p', {}, 'Next week waiting for approval: ' + b.nextUnapproved) : null, b.message ? h('p', {class: b.paused ? 'ms-note' : 'ms-warning', role:'status'}, b.message) : null, button('Review Upcoming Weeks', () => go('Calendar/Weeks'), {class:'ms-primary'}));
  }
  function pickupWeeks() {
    return h('div', {}, h('h1', {}, 'Customer Booking Approval'), h('p', {}, 'Weeks run Monday through Sunday, Indiana time. Approval never overrides closed dates, deadlines, product availability or capacity.'), (data.management.pickupBooking?.weeks || []).map(w => panel(w.start + ' through ' + w.end,
      pill(w.status), h('p', {}, w.eligibleDates + ' eligible pickup dates · ' + w.orders + ' existing orders'),
      h('details', {}, h('summary', {}, 'Review pickup dates'), w.dates.map(p => h('p', {}, pickupLabel(p) + (p.closed || data.management.pickupClosedDates?.[p.date] ? ' · Closed' : data.management.pickupVisibility?.[p.date] === false ? ' · Hidden at checkout' : '') + ' · Order by ' + orderByLabel(p)))),
      h('div', {class:'ms-actions'}, button(w.status === 'closed' ? 'Reopen / Approve Week' : 'Approve Week', () => send('pickup-week', {week:w.start, status:'approved', ledgerVersion:data.ledgerVersion}), {class:'ms-primary',disabled:busy || w.status==='approved'}), button('Close Week', () => { if (confirm(w.orders ? 'This week has existing customer orders. Closing it will prevent new bookings but will not cancel or move existing orders.' : 'Close this week to new bookings?')) send('pickup-week', {week:w.start,status:'closed',confirmExistingOrders:true,ledgerVersion:data.ledgerVersion}); }, {class:'ms-secondary',disabled:busy || w.status==='closed'})))));
  }
  const pickupChangeDefault = "Something unexpected has come up, and we need to reschedule your pickup. We're sorry for the inconvenience and appreciate your understanding.";
  async function previewPickup(date) {
    try { const p=await request('/api/manage/pickup-preview?date='+encodeURIComponent(date)); edit('pickup-change', {...p, mode:'makeup', reason:'unexpected', message:pickupChangeDefault, replacementDate:'', start:'15:00', end:'18:00', confirmed:false}); } catch(e) { error=e.message; render(); }
  }
  function scheduleChanges() {
    const selectedDate=selection || data.management.today.range.start;
    return h('div', {}, h('h1', {}, 'Pickup Schedule Changes'), field('Original pickup date',selectedDate,v=>{selection=v;}, {type:'date'}),button('Preview affected orders',()=>previewPickup(selection || selectedDate),{class:'ms-primary',disabled:busy}),
      (data.management.pickupChanges || []).map(event=>{
        const orders=data.orders.filter(o=>o.pickupChange?.eventId===event.id), count=response=>orders.filter(o=>o.pickupChange.acknowledgement?.response===response).length;
        return panel('Pickup change · '+event.originalDate, h('p', {}, event.replacement ? pickupLabel(event.replacement) : 'Date To Be Announced'),h('p', {},event.message),h('p', {},orders.length+' orders · '+count('confirmed')+' confirmed · '+count('alternate')+' need another arrangement · '+orders.filter(o=>!o.pickupChange.acknowledgement).length+' not responded'),
          h('p', {},event.contacts.filter(c=>c.contactedVersion!==event.version).length+' customers need direct contact. No email or text delivery is claimed.'),
          button('Update makeup date / message',()=>edit('pickup-change-update',{eventId:event.id,eventVersion:event.version,date:event.originalDate,orders,orderCount:orders.length,customerCount:event.contacts.length,mode:event.replacement?'makeup':'pending',replacementDate:event.replacement?.date||'',start:event.replacement?.start||'15:00',end:event.replacement?.end||'18:00',message:event.message,reason:event.reason,confirmed:false}),{class:'ms-secondary'}),
          event.contacts.map(c=>{const o=data.orders.find(o=>c.orderIds.includes(o.id)), contact={method:'phone'};return h('article',{class:'ms-audit'},h('strong',{},o?.customer?.name||'Guest customer'),h('p',{},[o?.customer?.email,o?.customer?.phone].filter(Boolean).join(' · ')||'No direct contact details saved'),h('p',{},c.orderIds.map(id=>data.orders.find(o=>o.id===id)?.orderNumber).join(', ')),h('p',{},c.orderIds.map(id=>{const o=data.orders.find(o=>o.id===id);return o?.pickupChange?.acknowledgement?.response||'Not responded';}).join(' · ')),h('textarea',{readonly:true,'aria-label':'Copyable customer message'},event.message+' '+(event.replacement?'Your proposed pickup: '+pickupLabel(event.replacement):'A makeup date will be announced.')),field('Contact method',contact.method,v=>{contact.method=v;},{choices:['phone','email','text','in-person','other']}),button('Mark customer contacted',()=>send('pickup-contact',{eventId:event.id,eventVersion:event.version,customerKey:c.key,method:contact.method,ledgerVersion:data.ledgerVersion}),{disabled:busy,class:'ms-secondary'}),h('p',{},c.contactedVersion===event.version?'Contact recorded for this notice.':'Needs direct contact'),c.history.map(v=>h('p',{},v.method+' · '+stamp(v.at)+' · notice '+v.version)));}),
          h('details',{},h('summary',{},'Schedule-change history'),event.revisions.map(r=>h('p',{},'Notice '+r.version+' · '+stamp(r.at)+' · '+(r.replacement?pickupLabel(r.replacement):'Date To Be Announced')+' · '+r.message))));
      }));
  }
  function calendar() {
    const date = selection || data.management.today.range.start, list = data.management.pickups.slice().sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
    const upcoming = list.filter(p => futurePickup(p) && isOrderingPickup(p));
    const olderRecords = list.filter(p => futurePickup(p) && !isOrderingPickup(p));
    const orders = data.orders.filter(o => o.pickup.date === date && !o.resolution && !['canceled', 'picked-up'].includes(o.status));
    const totals = new Map(); for (const o of orders) for (const l of o.lines) { const k = l.productId + ':' + l.variantId; const v = totals.get(k) || { name: l.name, variant: l.variant, qty: 0 }; v.qty += l.qty; totals.set(k, v); }
    const card = p => {
      const associated = pickupOrders(p), future = futurePickup(p);
      return h('article', { class: 'ms-panel' }, h('div', { class: 'ms-row' }, h('strong', {}, pickupLabel(p)), pill(!future ? 'Past pickup' : p.closed || data.management.pickupClosedDates?.[p.date] ? 'Closed to new orders' : !isOrderingPickup(p) ? 'Legacy date — existing orders only' : localInstant(p.cutoffDate, p.cutoffTime) <= Date.parse(data.now) ? 'Ordering deadline passed' : data.management.pickupVisibility?.[p.date] === false ? 'Hidden at checkout' : data.management.pickupBooking?.weeks.find(w=>w.start<=p.date && w.end>=p.date)?.status !== 'approved' ? 'Week awaiting approval' : p.event || 'Open')), h('p', {}, 'Order by ' + orderByLabel(p)), h('p', {}, p.capacity + ' order limit'),
        p.event ? h('p', {}, p.event) : null,
        future ? h('p',{}, 'Show at Checkout: ', button(data.management.pickupVisibility?.[p.date] === false ? 'No' : 'Yes',()=>send('pickup-visibility',{date:p.date,visible:data.management.pickupVisibility?.[p.date]===false,ledgerVersion:data.ledgerVersion}),{class:'ms-secondary',disabled:busy}), data.management.pickupClosedDates?.[p.date] ? ' · Closed by schedule change' : ' · Requires an approved week') : null,
        associated.length ? h('p', { class: 'ms-note' }, associated.length + ' scheduled order' + (associated.length === 1 ? '' : 's') + '. Saved customer commitments are kept.') : null,
        h('div', { class: 'ms-actions' }, future ? button('Edit pickup', () => editPickup(p), { class: 'ms-secondary' }) : null, button('Copy', () => editPickup(p, true), { class: 'ms-secondary' }), future && (!p.closed || !associated.length) ? button('Skip / close date', () => removePickup(p), { class: 'ms-secondary', disabled: busy }) : null, button('Pickup & baking lists', () => go('Calendar', p.date), { class: 'ms-secondary' })),
        associated.length ? h('details', {}, h('summary', {}, 'View scheduled orders'), associated.map(o => button([h('strong', {}, o.orderNumber), h('span', {}, o.customer?.name || 'Guest customer'), h('span', {}, pickupArrangement(o)), pill(fulfillmentLabels[o.status])], () => go('Orders', o.id), { class: 'ms-menu' }))) : null);
    };
    return h('div', {}, h('div', { class: 'ms-heading' }, h('h1', {}, 'Calendar'), button('Add special pickup', () => editPickup(), { class: 'ms-primary' })),
      h('p', { class: 'ms-note' }, 'Wednesday, Thursday and Friday repeat automatically. Customer booking requires an approved week. Order by noon two calendar days before pickup, Indiana time.'),
      h('div', {class:'ms-actions'}, button('Review Upcoming Weeks',()=>go('Calendar/Weeks'),{class:'ms-primary'}), button('Pickup Schedule Changes',()=>go('Calendar/Changes'),{class:'ms-secondary'})),
      h('div', { class: 'ms-actions' },
        button(data.published.orderingPaused ? 'Resume ordering' : 'Pause new ordering', () => { if (confirm(data.published.orderingPaused ? 'Resume new website orders?' : 'Pause new website orders? Existing confirmed orders will stay intact.')) send('calendar', { revision: data.revision, ledgerVersion: data.ledgerVersion, pickups: data.published.pickups, paused: !data.published.orderingPaused, confirmExistingOrders: true }); }, { class: 'ms-secondary' })),
      data.published.orderingPaused ? h('p', { role: 'status', class: 'ms-warning' }, 'New ordering is paused. Existing orders are protected.') : null,
      h('div', { class: 'ms-calendar-list', role: 'region', 'aria-label': 'Upcoming pickup dates' }, upcoming.map(card)), !upcoming.length ? empty('No future pickup dates. Add a pickup when you’re ready.') : null,
      olderRecords.length ? h('details', { class: 'ms-panel' }, h('summary', {}, 'Older pickup records'),
        h('p', { class: 'ms-note' }, 'These older dates are excluded from customer ordering. Records and any existing customer commitments are kept for reference.'), olderRecords.map(card)) : null,
      list.some(p => !futurePickup(p)) ? h('details', { class: 'ms-panel' }, h('summary', {}, 'Past pickup dates'), list.filter(p => !futurePickup(p)).map(card)) : null,
      panel('Pickup & production lists', field('List date', date, v => { selection = v; render(); }, { type: 'date' }),
        h('div', { class: 'ms-print-list' }, h('h3', {}, date), h('h3', {}, 'Production totals'), [...totals.values()].map(v => h('p', {}, v.qty + ' × ' + v.name + ' · ' + v.variant)),
          h('h3', {}, 'Pickup list'), orders.map(o => h('div', { class: 'ms-audit' }, h('strong', {}, o.customer?.name || 'Guest'), button(o.orderNumber, () => go('Orders', o.id), { class: 'ms-text' }), h('span', {}, pickupArrangement(o)), h('span', {}, o.lines.map(l => l.qty + ' × ' + l.name + ' (' + l.variant + ')').join(', ')))),
        !orders.length ? empty('No outstanding pickups on this day.') : null,
        button('Print pickup & production lists', () => window.print(), { class: 'ms-primary' }))));
  }
  function editPickup(pickup, copy = false) {
    const today = data.management.today.range.start;
    const defaultDay = new Date(Date.parse(today + 'T12:00:00Z') + 3 * 86400000).toISOString().slice(0, 10);
    const p = pickup ? clone(pickup) : { id: 'pickup-' + id(), date: defaultDay, ...clone(data.management.pickupSchedule), closed: false, productionLimits: {} };
    if (copy) { p.id = 'pickup-' + id(); p.closed = false; }
    p.event ||= ''; p.productionLimits ||= {};
    edit('calendar', { pickup: p, existing: !!pickup && !copy, confirmExistingOrders: false });
  }
  function members() {
    const members = data.management.members.filter(m => [m.profile.name, m.profile.email, m.profile.phone].join(' ').toLowerCase().includes(search.toLowerCase()));
    const selected = data.management.members.find(m => m.id === selection);
    if (selected) {
      return h('div', {}, h('h1', {}, selected.profile.name), panel('Contact details', h('p', {}, selected.profile.email || 'No email saved'), h('p', {}, selected.profile.phone || 'No phone saved'), h('p', {}, 'Joined ' + stamp(selected.createdAt))),
        panel('Cash at Pickup', h('strong', {}, selected.cashPrivilege?.allowed === false ? 'Disabled' : 'Allowed'), h('p', {}, selected.cashPrivilege?.reason || 'No internal restriction note.'), button(selected.cashPrivilege?.allowed === false ? 'Restore cash privileges' : 'Disable cash privileges', () => edit('cash-privilege', { memberId: selected.id, allowed: selected.cashPrivilege?.allowed === false, reason: selected.cashPrivilege?.reason || '' }), { class: 'ms-secondary' }), h('h3', {}, 'Outstanding and previous cash orders'), orderCards(data.orders.filter(o => o.customer?.memberId === selected.id && o.selectedPaymentMethod === 'cash_pickup'))),
        panel('Return Credits', h('strong', {}, money(selected.credits.available) + ' available'), h('p', {}, money(selected.credits.reserved) + ' reserved'), button('Manage return credits', () => go('The Roost/Return Credits', selected.id), { class: 'ms-primary' }), selected.benefits.length ? h('details', {}, h('summary', {}, 'Legacy recorded returns and credits'), selected.benefits.map(b => h('p', {}, b.kind + ' · ' + b.amount + ' · ' + b.reason))) : null),
        panel('Order history', orderCards(data.orders.filter(o => o.customer?.memberId === selected.id))));
    }
    return h('div', {}, h('h1', {}, 'The Roost'), h('p', {}, 'Optional customer memberships at Rise & Roost.'), button('Return Credits', () => go('The Roost/Return Credits'), { class: 'ms-primary' }), field('Search members', search, v => { search = v; renderMemberRows(); }, { type: 'search' }), h('div', { id: 'ms-members' }, members.map(memberCard)));
    function memberCard(m) { return button([h('strong', {}, m.profile.name), h('span', {}, m.profile.email || m.profile.phone || 'No contact saved'), pill(m.orderCount + ' orders')], () => go('The Roost', m.id), { class: 'ms-menu' }); }
    function renderMemberRows() { root.querySelector('#ms-members')?.replaceChildren(...data.management.members.filter(m => [m.profile.name, m.profile.email, m.profile.phone].join(' ').toLowerCase().includes(search.toLowerCase())).map(memberCard)); }
  }
  function returnCredits() {
    const program = data.management.returnCredits;
    const selected = data.management.members.find(m => m.id === selection);
    const transactions = selected ? program.transactions.filter(t => t.memberId === selected.id) : [];
    const memberButtons = query => data.management.members.filter(m => [m.profile.name, m.profile.email, m.profile.phone].join(' ').toLowerCase().includes(query.toLowerCase())).map(m => button(m.profile.name + ' · ' + (m.profile.email || m.profile.phone || m.id.slice(0, 8)), () => go('The Roost/Return Credits', m.id), { class: 'ms-menu' }));
    return h('div', {}, h('h1', {}, 'Return Credits'), h('p', {}, 'The Roost → Return Credits'),
      panel('Return program', h('strong', {}, program.enabled ? 'Enabled' : 'Paused'), h('p', {}, 'Dollar credits only. No items are eligible until you add and enable them. Existing balances never expire automatically.'),
        !program.enabled ? h('p', {}, 'Before activation, review applicable store-credit, unclaimed-property, tax and accounting requirements with your adviser. No legal policy has been assumed for you.') : null,
        button('Review program settings', () => edit('credit-settings', { enabled: program.enabled, termsReviewed: false, confirmed: false }), { class: 'ms-secondary' })),
      panel('Returnable items', button('Add return item', () => edit('credit-item', { name: '', dollars: '', status: 'active', confirmed: false }), { class: 'ms-primary' }),
        ['active', 'inactive', 'retired'].map(status => h('section', {}, h('h3', {}, status.charAt(0).toUpperCase() + status.slice(1)),
          program.items.filter(i => i.status === status).map(i => h('div', { class: 'ms-audit' }, h('strong', {}, i.name + ' · ' + money(i.cents)), button('Edit ' + i.name, () => edit('credit-item', { ...i, dollars: centsToDollars(i.cents), confirmed: false }), { class: 'ms-secondary' }))),
          !program.items.some(i => i.status === status) ? h('p', {}, 'No ' + status + ' items.') : null))),
      panel('Find a customer', field('Search Roost accounts', '', value => root.querySelector('#credit-members')?.replaceChildren(...memberButtons(value)), { type: 'search' }), h('div', { id: 'credit-members' }, memberButtons(''))),
      selected ? panel(selected.profile.name + ' — Return Credits', h('strong', {}, money(selected.credits.available) + ' available'), h('p', {}, money(selected.credits.reserved) + ' reserved for pending orders'),
        button('Record customer return', () => edit('credit-return', { memberId: selected.id, customerName: selected.profile.name, lines: program.items.filter(i => i.status === 'active').map(i => ({ id: i.id, version: i.version, name: i.name, cents: i.cents, qty: 0 })), confirmed: false }), { class: 'ms-primary', disabled: !program.enabled || !program.items.some(i => i.status === 'active' && i.cents > 0) }),
        button('Correct balance', () => edit('credit-adjust', { memberId: selected.id, direction: 'add', dollars: '', reason: '', confirmed: false }), { class: 'ms-secondary' }),
        [...transactions].reverse().map(t => h('article', { class: 'ms-audit' }, h('strong', {}, t.kind + ' · ' + money(t.amount)), h('p', {}, t.description), h('p', {}, stamp(t.at) + ' · ' + (t.actor?.name || 'Order checkout')),
          ['earned', 'adjusted'].includes(t.kind) && !program.transactions.some(r => r.reversalOf === t.id) ? button('Reverse this transaction', () => edit('credit-reverse', { memberId: selected.id, transactionId: t.id, reason: '', confirmed: false }), { class: 'ms-secondary' }) : null)),
        data.orders.filter(o => o.customer?.memberId === selected.id && o.returnCredit?.status === 'reserved').map(o => h('div', {}, h('p', {}, o.orderNumber + ' · ' + money(o.creditApplied) + ' reserved · pickup deadline ' + stamp(o.pickupDeadline)),
          Date.parse(o.pickupDeadline) < Date.parse(data.now) ? button('Review expired reservation', () => edit('credit-expire', { orderId: o.id, orderVersion: o.version, reason: '', confirmed: false }), { class: 'ms-secondary' }) : h('p', {}, 'To cancel an abandoned order, use Orders → Update fulfillment → Canceled.')))) : null);
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
      row('Order value placed', money(r.orderValue)), row('Return credit used on these orders', money(r.returnCreditUsed || 0)), row('Orders placed', r.ordersPlaced), row('Outstanding payments', money(r.outstandingValue)), row('Canceled orders', r.canceledOrders), row('Canceled order value', money(r.canceledOrderValue)), row('Returning Roost members', r.returningMembers)),
      panel('Sales by payment method', (r.salesByPaymentMethod || []).map(p => row(providers[p.method] || p.method, money(p.value)))),
      panel('Popular products · verified orders', r.popularProducts.map(p => row(p.name + ' · ' + p.variant, p.quantity + ' · ' + money(p.value)))),
      panel('How totals work', h('p', {}, 'Verified payments use the date an owner checked an independent payment record. Order value uses the order date. Voided verification records are excluded from verified payments; correction totals are disclosed separately and never deducted twice. Refunds use the date the external refund was recorded. Cancellation does not automatically issue or record a refund. Net verified receipts subtract recorded refunds. Returning customers counts identified Roost members; guest identities are not guessed. Roadside Register sales are excluded.'),
        button('Export sales report', () => download('rise-roost-sales.csv', csv([['Range start', 'Range end', 'Verified cents', 'Refund cents', 'Net verified cents', 'Order value cents', 'Orders'], [r.range.start, r.range.end, r.verifiedSales, r.refunds, r.netVerifiedReceipts, r.orderValue, r.ordersPlaced]]), 'text/csv'), { class: 'ms-primary' }), button('Export orders', exportOrders, { class: 'ms-secondary' })));
  }
  function content() {
    return h('div', {}, h('h1', {}, 'Website Content'), h('p', {}, 'Edit wording and photos. The approved customer layout, navigation structure, and visual styling are locked.'),
      button('Edit website content', () => edit('content', clone(data.draft)), { class: 'ms-primary' }),
      panel('Draft & publishing', h('p', {}, !data.hasContentDraft ? 'Your saved content is published.' : 'There is a saved content draft to review.'),
        button('Preview saved draft', async () => {
          try { const r = await request('/api/preview', { revision: data.revision }); root.querySelector('#ms-content-preview')?.replaceChildren(h('iframe', { src: r.path, title: 'Saved website content preview' })); }
          catch (e) { error = e.message; chrome(); }
        }, { class: 'ms-secondary' }), button('Publish website content', () => { if (confirm(data.productionOwnerAccess ? 'Publish this saved wording and photo draft? Products and pickup schedules keep their latest live values.' : 'Publish this saved wording and photo draft to the isolated preview website? Products and pickup schedules keep their latest live values.')) send('publish', { revision: data.revision }); }, { class: 'ms-primary' }), h('div', { id: 'ms-content-preview' })),
      panel('Revision history', data.versions.map(v => h('div', { class: 'ms-audit' }, h('strong', {}, v.label), h('span', {}, stamp(v.at)), button('Restore wording & images', () => { if (confirm('Restore wording and images from this revision? Current products, stock, prices, and pickup schedules will stay intact.')) send('restore-content', { revision: data.revision, versionId: v.id }); }, { class: 'ms-secondary' })))));
  }
  function settings() {
    let code = '';
    const business = data.management.settings || { calendar: defaultCalendar(), payments: {} };
    const preferences = clone(data.management.notifications.preferences);
    return h('div', {}, h('h1', {}, 'Settings'), menu('Payments', 'Settings/Payments'), menu('Studio Help Guide', 'Settings/Help'), menu('Customer Email', 'Settings/Email'),
      data.productionOwnerAccess ? panel('Owner access', h('p', {}, 'Signed in as ' + data.owner + '.'), h('p', {}, 'Use your own Cloudflare Access sign-in on each device. Contact the other owner or account administrator for account recovery.'), h('p', {}, 'Session ends ' + stamp(data.sessionExpiresAt) + '.')) : data.previewPinAccess ? panel('Studio access', h('p', {}, 'This device is remembered for up to 30 days. Use Lock Studio whenever you want the PIN required again on this device.'), h('p', {}, 'This shared testing PIN is temporary. Individual owner accounts can replace it before launch.')) : data.previewDirectAccess ? panel('Testing access', h('p', {}, 'Cloudflare Access remembers this browser. No separate Studio sign-in is needed.'), h('p', {}, 'Approved tester: ' + data.previewTesterEmail), h('p', {}, 'Testing session ends ' + stamp(data.previewAccessExpiresAt) + '. Re-verification is needed after expiry, logout, or clearing cookies.'), h('a', { href: '/cdn-cgi/access/logout', class: 'ms-secondary' }, 'Sign out of testing access')) : panel('Owner access', h('p', {}, 'Current sign-in: secure workspace access. Individual Descope owner accounts are not connected yet. The existing authentication has not been replaced.'), h('p', {}, 'Both owner accounts must be tested and approved before activation. Do not share private access keys in chat.'),
        h('a', { href: data.studioPath, class: 'ms-secondary' }, 'Studio link for this saved website'),
        field('Connection code from your other device', code, v => code = v, { maxlength: 20, autocomplete: 'off' }), button('Review device connection', async () => {
          try { const r = await request('/api/device-review', { code }); if (confirm('Approve the browser showing this exact code for this saved website? Only approve a request you started.')) { await request('/api/device-approve', { code, requestId: r.requestId, confirmed: true }); notify('Device request approved. Finish connecting on that device.'); } }
          catch (e) { error = e.message; chrome(); }
        }, { class: 'ms-primary' })),
      panel('Business days', h('p', {}, 'Set business weekdays and closures for pickup deadlines. Existing orders keep their recorded deadlines.'), button('Edit business days', () => edit('business-settings', { calendar: clone(business.calendar || defaultCalendar()), closuresText: (business.calendar?.closures || []).join('\n') }), { class: 'ms-primary' })),
      panel('Backup & data protection', h('p', {}, 'Download an owner-only business backup containing website revisions, orders, members, comments, and photos. It excludes sign-in credentials and recovery secrets. Keep downloads private.'),
        button('Download business backup', async () => { try { const backup = await request('/api/manage/export'); download('rise-roost-business-backup.json', JSON.stringify(backup)); notify('Business backup downloaded.'); } catch (e) { error = e.message; chrome(); } }, { class: 'ms-primary' }),
        h('p', { class: 'ms-note' }, 'Saved records are never removed automatically. Cloudflare D1 recovery remains available through the hosting account.')), 
      panel('Notifications', h('p', {}, 'Choose which in-app alerts appear in Needs Your Attention. Customer email has its own section in Settings. Save failures always remain visible.'),
        [['orders', 'New orders'], ['payments', 'Awaiting payment verification'], ['stock', 'Low stock'], ['pickups', 'Upcoming pickups'], ['comments', 'New comments'], ['errors', 'System alerts']].map(([key, label]) => check(label, preferences, key)),
        button('Save alert preferences', () => send('notifications', { preferences }), { class: 'ms-primary' })),
      panel('Install on iPhone', h('p', {}, 'In Safari, open Share → Add to Home Screen. Private business data is fetched securely while online and is not stored in an offline service-worker cache.')),
      panel('Audit history', data.management.audit.slice(0, 60).map(a => h('div', { class: 'ms-audit' }, h('strong', {}, a.action || a.kind), h('span', {}, stamp(a.at)), h('small', {}, a.actor?.name || 'Owner')))),
      data.productionOwnerAccess ? h('a', { href: '/cdn-cgi/access/logout', class: 'ms-secondary' }, 'Sign out') : !data.previewDirectAccess ? button('Sign out', async () => { if (editing && !confirm('Sign out and discard the unsaved form?')) return; try { await request('/api/logout', {}); disposed = true; sessionStorage.removeItem(storageKey); location.reload(); } catch (e) { error = e.message; chrome(); } }, { class: 'ms-secondary' }) : null);
  }
  function emailSettings() {
    const ledgerVersion = data.ledgerVersion;
    const email = data.management.email, draft = emailDraft || { values: { enabled: email.enabled }, types: clone(email.types), ledgerVersion }, { values, types } = draft;
    const emailCheck = (label, object, key) => field(label, object[key], value => { object[key] = value; emailDraft = draft; }, { type: 'checkbox' });
    const labels = { received:'Order Received', verified:'Payment Confirmed', preparing:'Preparing', ready:'Ready for Pickup', canceled:'Order Canceled', forfeited:'Pickup Forfeited', test:'Studio test' };
    return h('div', {}, h('h1', {}, 'Customer Email'),
      panel('Resend connection', h('p', {}, email.configured ? 'Resend is configured. A test can check service acceptance.' : 'Resend is not configured. Ask the website operator to check the secure connection.'), h('p', {}, 'Sender: ' + email.sender), h('p', {}, email.active ? 'Customer notifications are available to customers who request them at checkout.' : 'Customer sending is disabled. Checkout and ordering have their own separate controls.'),
        !email.releaseEnabled ? h('p', { class:'ms-note' }, 'Initial release safety lock is on. After Danielle approves activation, the website operator must release this lock once. You can then manage notifications here.') : null,
        !email.freePlanConfirmed || !email.deliveryVerified ? h('p', { class:'ms-note' }, 'Before customer activation, the operator must confirm the free-plan allowance and an owner’s successful inbox test.') : null,
        h('p', {}, 'Service acceptance does not confirm inbox delivery. For questions, customers use Contact Danielle on the website; the sending address is not a monitored inbox.')),
      panel('Customer notifications', emailCheck('Enable customer email notifications', values, 'enabled'), Object.keys(types).map(k=>emailCheck(labels[k],types,k)),
        emailDraft && draft.ledgerVersion !== ledgerVersion ? h('p',{class:'ms-note'},'Email activity changed while you were choosing settings. Reload saved email choices and review them before saving.') : null,
        button('Save email settings', async ()=>{ const saved = await send('email-settings',{ ledgerVersion:draft.ledgerVersion, enabled:values.enabled, types }); if (saved) { emailDraft = null; render(); } }, { class:'ms-primary' }), button('Reload saved email choices', ()=>{ emailDraft = null; render(); },{class:'ms-secondary'}), h('p', { class:'ms-note' }, 'Only customers who explicitly request email updates receive them. Turning a type off cancels its waiting messages. Turning it back on applies to future events.')),
      panel('Send a test email', h('p', {}, email.testRecipient ? 'Tests go only to your signed-in owner address: ' + email.testRecipient : 'Sign in with your individual owner account to test.'),
        button('Send test to my owner address', ()=>{ if(confirm('Send one Studio test email to your own authorized owner address? Customer sending stays under its separate controls.')) send('email-test',{ledgerVersion,confirmed:true},{successMessage:'Owner test queued. Refresh delivery history to see the result, then check your inbox and spam folder.'}); },{class:'ms-primary',disabled:!email.configured || !email.testRecipient}), h('p',{class:'ms-note'},'One test per minute, up to five per hour. A test does not enable customer emails.')),
      panel('Recent email attempts', button('Refresh email history', ()=>refresh(),{class:'ms-secondary'}), email.attempts.length ? email.attempts.map(n=>h('div',{class:'ms-audit'},h('strong',{},(n.orderNumber || 'Owner test')+' · '+labels[n.event]),h('p',{},notificationLabels[n.status] || n.status),h('small',{},stamp(n.at)+' · '+n.attempts+' attempt(s)'+(n.errorCode ? ' · '+n.errorCode : '')),
        n.retryAt && ['failed','retry','quota_paused'].includes(n.status) ? h('p',{},'Retry after '+stamp(new Date(n.retryAt).toISOString())) : null,
        n.retryable ? button('Retry failed email',()=>{if(confirm('Retry this original notification? The same identifier and message are reused to prevent duplicates.'))send('email-retry',{ledgerVersion,notificationId:n.id,...(n.orderId?{orderId:n.orderId}:{}),confirmed:true});},{class:'ms-secondary'}) : null)) : empty('No emails have been attempted yet.'), h('p',{class:'ms-note'},'Temporary failures retry automatically while the message is safe to send. Accepted messages are never resent. Messages older than 23 hours need direct contact. Delivery is not automatically confirmed.')));
  }
  async function testPaymentLink(provider) {
    const popup = window.open('about:blank', '_blank'); if (popup) popup.opener = null;
    const response = await send('payment-test-start', { provider, paymentsVersion: paymentsVersion() }, { successMessage: 'Link test started. Check the recipient, then confirm here. Do not send money.' });
    if (!response) { popup?.close(); return; }
    const url = paymentDestination(provider, response.result.url);
    if (popup) { try { popup.location.replace(url); } catch { popup.close(); } }
  }
  function payments() {
    const saved = data.management.settings?.payments || {}, active = configuredPayments(data.management.settings);
    return h('div', {}, h('h1', {}, 'Payments'),
      panel('Cash at Pickup', h('label', { class: 'field' }, h('input', { type: 'checkbox', role: 'switch', 'aria-label': 'Allow Cash at Pickup for Roost Members', checked: data.management.settings?.cashPickupEnabled === true, disabled: busy, onchange: event => send('cash-settings', { enabled: event.target.checked, ledgerVersion: data.ledgerVersion }) }), 'Allow Cash at Pickup for Roost Members'), h('p', {}, 'Members qualify automatically unless restricted. Each member may have one unresolved cash order. Existing cash orders remain manageable when disabled. This does not activate online ordering.')),
      panel('Customer ordering', h('p', { role: 'status' }, data.productionOwnerAccess && (!data.checkoutEnabled || data.published.orderingPaused) ? 'Ordering remains paused. Payment links can be prepared before launch approval.' : Object.keys(active).length ? 'Ready — an enabled payment link has an owner-confirmed test.' : data.management.settings?.cashPickupEnabled === true ? 'Cash at Pickup is enabled for eligible members. Guests need an enabled, tested payment link.' : 'Ordering paused — save, enable and test at least one payment link.'), h('p', {}, 'Studio stays available while payment links are being set up. Payments are always verified manually by Danielle.')),
      Object.entries(providers).map(([provider,label]) => {
        const p = saved[provider] || {}, ready = !!active[provider], test = p.pendingTest;
        return panel(label, pill(!p.url ? 'Not configured' : !p.enabled ? 'Disabled' : ready ? 'Ready' : 'Test required'),
          p.url ? h('p', { style: { overflowWrap: 'anywhere' } }, p.url) : h('p', {}, 'No payment link saved.'),
          button(p.url ? 'Edit ' + label + ' link' : 'Add ' + label + ' link', () => edit('payment-settings', paymentFields(provider)), { class: 'ms-primary' }),
          p.url ? button((p.enabled ? 'Disable ' : 'Enable ') + label, () => send('payment-destination', { ...paymentFields(provider), enabled: !p.enabled, paymentsVersion: paymentsVersion() }), { class: 'ms-secondary', disabled: busy }) : null,
          button('Test ' + label + ' Link', () => testPaymentLink(provider), { class: 'ms-secondary', disabled: busy || !p.url }),
          p.tested?.at ? h('p', { class: 'ms-note' }, 'Last owner-confirmed test: ' + stamp(p.tested.at)) : null,
          test && test.url === p.url ? h('form', { onsubmit: e => { e.preventDefault(); return send('payment-test-confirm', { provider, testId: test.id, confirmed: testChecks.get(test.id) === true, paymentsVersion: paymentsVersion() }, { successMessage: 'Link test confirmed. No payment was sent or verified.' }); } },
            h('p', {}, 'Check the saved destination and correct business recipient. Do not send money for this test.'),
            h('a', { href: p.url, target: '_blank', rel: 'noopener noreferrer', class: 'ms-text' }, 'Open saved ' + label + ' test link'),
            field('I opened the ' + label + ' link and confirmed the correct business recipient', testChecks.get(test.id) || false, value => testChecks.set(test.id,value), { type: 'checkbox', required: true }),
            h('button', { type: 'submit', class: 'ms-primary', disabled: busy }, 'Confirm ' + label + ' Link Test')) : null);
      }), h('p', { class: 'ms-note' }, 'Use payment destinations approved for business sales. Link tests are owner confirmations of the destination, not proof of payment. Editing a link requires a new test.'));
  }
  function editForm() {
    const e = editing, v = e.values;
    if (['pickup-change','pickup-change-update'].includes(e.type)) {
      const review=()=>send(e.type,{date:v.date,eventId:v.eventId,eventVersion:v.eventVersion,orderIds:v.orders.map(o=>o.id),mode:v.mode,replacementDate:v.replacementDate,start:v.start,end:v.end,message:v.message,reason:v.reason,confirmed:v.confirmed,ledgerVersion:e.ledgerVersion});
      return form('Review Pickup Schedule Change', [h('p',{},'Original date: '+v.date+' · '+v.orderCount+' affected orders · '+v.customerCount+' customers'),h('p',{},v.openForBookings?'Original date currently allows new bookings.':'Original date is not currently open for new bookings.'),v.orders.map(o=>h('p',{},o.orderNumber+' · '+(o.customer?.name||'Guest')+' · '+fulfillmentLabels[o.status]+' · '+pickupArrangement(o))),v.manualReview?.length?h('p',{class:'ms-warning'},v.manualReview.length+' orders have existing communications or disputes requiring manual review.'):null,
        f('Internal reason',v,'reason',{choices:[{value:'unexpected',label:'Something unexpected came up.'},{value:'illness-family',label:'Illness or family emergency.'},{value:'other',label:'Other.'}]}),
        f('Pickup arrangement',v,'mode',{choices:[{value:'makeup',label:'Set a Makeup Date'},{value:'pending',label:'Date To Be Announced'}]}),f('Makeup pickup date (for Set a Makeup Date)',v,'replacementDate',{type:'date'}),f('Pickup start time',v,'start',{type:'time'}),f('Pickup end time',v,'end',{type:'time'}),f('Customer message',v,'message',{type:'textarea',required:true,maxlength:2000}),h('p',{},'Notifications: secure order pages and The Roost. No automated email or text service is enabled. Review the event contact list after saving.'),h('p',{},'The original date will close to new bookings. Makeup appointments do not open new customer bookings. Updating a notice preserves earlier responses in history and requires a new acknowledgement.'),check('I reviewed these orders, pickup arrangement and customer message and confirm the change',v,'confirmed')],review,'Confirm pickup schedule change');
    }
    if (e.type === 'cash-privilege') return form(v.allowed ? 'Restore cash privileges' : 'Disable cash privileges', [h('p', {}, 'This changes only Cash at Pickup. The member account, other payments and return credits remain available.'), f('Internal reason (optional)', v, 'reason', { maxlength: 500 })], () => send('cash-privilege', { ...v, ledgerVersion: e.ledgerVersion }), 'Save cash privilege');
    if (['cash-received', 'cash-unpaid'].includes(e.type)) return form(e.type === 'cash-received' ? 'Mark Cash Received' : 'Close as Unpaid / Not Picked Up', [h('strong', {}, 'Cash amount: ' + money(v.amount)), h('p', {}, e.type === 'cash-received' ? 'Confirm only after receiving the full cash amount shown. Reserved return credit will be finalized.' : 'Review the passed pickup deadline and resolve customer communications first. Reserved return credit will be released. This does not charge a fee or restrict the member.'), e.type === 'cash-unpaid' ? f('Review reason', v, 'reason', { required: true, minlength: 5, maxlength: 500 }) : null, check(e.type === 'cash-received' ? 'I received the full cash amount shown' : 'I confirm this unpaid pickup resolution', v, 'confirmed')], () => send(e.type, { id: v.orderId, orderVersion: v.orderVersion, amount: v.amount, reason: v.reason, confirmed: v.confirmed }), e.type === 'cash-received' ? 'Confirm Cash Received' : 'Confirm Close as Unpaid');
    if (e.type === 'credit-settings') return form('Return program settings', [
      h('p', {}, 'Enabling this program permits confirmed returns and member checkout redemption. It does not activate ordering. No credit expiration, cash redemption, transfer or automatic forfeiture policy is introduced.'),
      check('Enable return credits', v, 'enabled'), check('I reviewed applicable legal and accounting requirements for this program', v, 'termsReviewed'), check('I confirm this program change', v, 'confirmed')
    ], () => send('credit-settings', { ...v, ledgerVersion: e.ledgerVersion }), 'Save return program');
    if (e.type === 'credit-item') return form(v.id ? 'Edit return item' : 'Add return item', [
      f('Return item name', v, 'name', { required: true, maxlength: 80 }), f('Credit value ($)', v, 'dollars', { inputmode: 'decimal', required: true }),
      f('Eligibility', v, 'status', { choices: [{ value: 'active', label: 'Active — currently eligible' }, { value: 'inactive', label: 'Inactive — temporarily disabled' }, { value: 'retired', label: 'Retired — kept in history' }] }),
      h('p', {}, 'Values apply to future returns only. Choose Active to reactivate an inactive or retired item. Historical returns are always kept.'), check('I confirm the name, value and eligibility', v, 'confirmed')
    ], () => send('credit-item', { id: v.id, itemVersion: v.version, name: v.name, cents: dollarsToCents(v.dollars), status: v.status, confirmed: v.confirmed, ledgerVersion: e.ledgerVersion }), 'Save return item');
    if (e.type === 'credit-return') {
      const total = () => v.lines.reduce((sum, l) => sum + l.cents * (Number.isSafeInteger(l.qty) ? l.qty : 0), 0);
      const controls = v.lines.map(l => { const node = f(l.name + ' — ' + money(l.cents) + ' each', l, 'qty', { type: 'number', min: 0, max: 100, step: 1 }); node.querySelector('input').addEventListener('input', () => { const review = root.querySelector('#return-review-total'); if (review) review.textContent = 'Credit to add: ' + money(total()); }); return node; });
      return form('Record customer return', [h('h2', {}, v.customerName), controls, h('strong', { id: 'return-review-total' }, 'Credit to add: ' + money(total())), h('p', {}, 'Review the customer, accepted containers, quantities and total before confirming.'), check('I accepted these items and confirm this credit', v, 'confirmed')],
        () => send('credit-return', { memberId: v.memberId, lines: v.lines.filter(l => l.qty > 0).map(({ id, version, qty }) => ({ id, version, qty })), confirmed: v.confirmed, ledgerVersion: e.ledgerVersion }), 'Confirm return credit');
    }
    if (['credit-adjust', 'credit-reverse', 'credit-expire'].includes(e.type)) return form(e.type === 'credit-expire' ? 'Review expired reservation' : e.type === 'credit-reverse' ? 'Reverse return-credit transaction' : 'Correct return-credit balance', [
      h('p', {}, e.type === 'credit-expire' ? 'Check independent payment records and customer communications first. Confirmation cancels this expired unpaid order, releases its credit and inventory, and records your reason. It does not issue an external refund.' : 'Original transactions are retained. Corrections cannot reduce the available balance below zero or consume reserved credit.'),
      e.type === 'credit-adjust' ? [f('Correction direction', v, 'direction', { choices: [{ value: 'add', label: 'Add credit' }, { value: 'subtract', label: 'Reduce credit' }] }), f('Correction amount ($)', v, 'dollars', { inputmode: 'decimal', required: true })] : null,
      f('Recorded reason', v, 'reason', { required: true, minlength: 5, maxlength: 500 }), check('I reviewed the records and confirm this correction', v, 'confirmed')
    ], () => send(e.type, { memberId: v.memberId, transactionId: v.transactionId, id: v.orderId, orderVersion: v.orderVersion, ...(e.type === 'credit-adjust' ? { delta: dollarsToCents(v.dollars) * (v.direction === 'subtract' ? -1 : 1) } : {}), reason: v.reason, confirmed: v.confirmed, ledgerVersion: e.ledgerVersion }), 'Confirm correction');
    if (e.type === 'product') {
      const p = v.product, method = sellingMethod(p), dualLimits = inventoryMode(p) === 'legacy';
      const setMethod = value => { p.sellingMethod = value; p.inventoryMode = value === 'preorder' ? 'production' : 'physical'; p.channel = value === 'in-store' ? 'store' : 'preorder'; p.soldOut = false; marked(); render(); };
      return form(p.name ? 'Edit product' : 'Add product', [f('Product name', p, 'name', { required: true, maxlength: 120 }), f('Price ($)', v, 'dollars', { type: 'number', min: 0, max: 10000, step: '.01', required: true }),
        field('Selling method', method, setMethod, { choices: Object.entries(methodLabels).map(([value, label]) => ({ value, label })) }),
        method === 'preorder' ? f(dualLimits ? 'How many can I make per pickup?' : 'How many can I make?', p, 'capacity', { type: 'number', min: 0, max: 10000 }) : null,
        method !== 'preorder' || dualLimits ? f(method === 'in-store' ? 'How many are in the store?' : dualLimits ? 'How many are available in total?' : 'How many are available?', v, 'available', { type: 'number', min: 0, max: 10000 }) : null,
        h('p', { class: 'ms-note' }, 'Existing orders are already reserved. A quantity of zero shows Sold Out and keeps the product visible.'),
        method === 'preorder' ? panel('Which pickup dates are available?',
          data.management.pickups.filter(p => futurePickup(p) && isOrderingPickup(p) && !p.closed && localInstant(p.cutoffDate, p.cutoffTime) > Date.parse(data.now)).map(pickup => h('p', {}, pickupLabel(pickup))),
          !data.management.pickups.some(p => futurePickup(p) && isOrderingPickup(p) && !p.closed && localInstant(p.cutoffDate, p.cutoffTime) > Date.parse(data.now)) ? h('p', {}, 'No open pickup dates. Review closures and capacity in Calendar.') : null,
          h('p', {}, 'Pickup dates repeat automatically. Use Calendar for closures, special dates and quantity limits.'), button('Open pickup calendar', () => go('Calendar'), { class: 'ms-secondary' })) : null,
        hiddenProduct(p) ? h('p', { class: 'ms-warning' }, 'This product is hidden. Save changes, then use Show Product to display it again.') : null,
        p.images.map((photo, index) => h('div', { class: 'ms-photo' }, h('img', { src: photo.src, alt: photo.alt || p.name }), f('Photo description ' + (index + 1), photo, 'alt'), h('label', { class: 'ms-secondary' }, 'Replace photo', h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', disabled: busy, onchange: event => upload(event.target.files[0], src => photo.src = src) })))),
        f('Description', p, 'description', { type: 'textarea', maxlength: 6000 }), f('Category', p, 'category', { maxlength: 100 }),
        method !== 'preorder' ? f('Low-stock warning at', p, 'lowStockThreshold', { type: 'number', min: 0, max: 10000 }) : null,
        h('h3', {}, 'Varieties'), p.variants.map((variant, i) => h('div', { class: 'ms-two' }, f('Variety ' + (i + 1), variant, 'name', { required: true }), field('Additional price ' + (i + 1) + ' ($)', (variant.extra / 100).toFixed(2), value => { variant.extra = price(value); marked(); }, { type: 'number', min: 0, max: 10000, step: '.01' }))),
        button('Add variety', () => { p.variants.push({ id: 'variety-' + id(), name: '', extra: 0 }); marked(); render(); }, { class: 'ms-secondary' }),
      ], () => { p.price = price(v.dollars); p.soldOut = false; return send('product', { revision: e.revision, ledgerVersion: e.ledgerVersion, product: p, available: method === 'preorder' && !dualLimits ? undefined : v.available, confirmArchive: p.archived }); }, 'Save product live');
    }
    if (e.type === 'fresh-announcement') return form('Fresh at The Roost!', [
      f('Daily announcement', v, 'announcement', { type: 'textarea', maxlength: 240, placeholder: 'Fresh cookies available today!' }),
      h('p', { class: 'ms-note' }, 'Shown on the homepage and Shop. Leave it empty to remove the announcement.'),
      button('Clear announcement', () => { v.announcement = ''; marked(); render(); }, { class: 'ms-secondary' }),
    ], () => send('fresh-announcement', { announcement: v.announcement, revision: e.revision, ledgerVersion: e.ledgerVersion }), 'Save announcement live');
    if (e.type === 'calendar') {
      const p = v.pickup, associated = pickupOrders(p); p.dailyCapacity ??= p.capacity;
      return form('Pickup date', [associated.length ? h('div', { class: 'ms-warning', role: 'note' }, h('strong', {}, associated.length + ' existing order' + (associated.length === 1 ? '' : 's') + ' use this pickup.'), h('p', {}, 'Changes apply to new orders. Existing orders keep their original pickup details and pickup deadline. If the date or time changes, the original pickup closes to new orders and a new date is created. Contact customers through Orders to approve any new arrangement.'), associated.map(o => h('p', {}, o.orderNumber + ' · ' + (o.customer?.name || 'Guest customer') + ' · ' + pickupArrangement(o)))) : null,
        f('Pickup date', p, 'date', { type: 'date', min: data.management.today.range.start, required: true, disabled: v.existing }), clockField('Pickup start', p, 'start'), clockField('Pickup end', p, 'end'), h('p', { class: 'ms-note' }, 'Ordering closes automatically at noon two calendar days before this pickup, Indiana time.'), f('Pickup window order limit', p, 'capacity', { type: 'number', min: 0, max: 10000 }), f('Daily combined order limit', p, 'dailyCapacity', { type: 'number', min: 0, max: 10000 }), f('Special event name (optional)', p, 'event', { maxlength: 120 }), check('Close this pickup to new orders', p, 'closed'),
        h('h3', {}, 'How many can I make for this date?'), data.published.products.filter(p => !hiddenProduct(p) && sellingMethod(p) === 'preorder').map(product => field(product.name + ' units', p.productionLimits[product.id] ?? product.capacity, value => { p.productionLimits[product.id] = +value; marked(); }, { type: 'number', min: 0, max: 10000 })),
        associated.length ? check('I understand existing orders keep their original pickup details', v, 'confirmExistingOrders') : null,
      ], () => send('calendar-date', { revision: e.revision, ledgerVersion: e.ledgerVersion, pickup: p, confirmExistingOrders: v.confirmExistingOrders }), 'Save pickup live');
    }
    if (e.type === 'payment') return form('Verify payment', [h('p', {}, 'Open your payment account and check the customer name and full order total. Confirm below only after you have received the payment.'), f('Payment method', v, 'method', { choices: [...Object.entries(providers).map(([value,label]) => ({ value,label })), { value: 'external_record', label: 'Historical independent record' }] }), f('Transaction reference (optional)', v, 'evidence', { maxlength: 500 }), check('I checked an independent record for the full payment', v, 'independentlyVerified')], () => send('verify-payment', { id: v.orderId, orderVersion: v.orderVersion, method: v.method, evidence: v.evidence, independentlyVerified: v.independentlyVerified }), 'Confirm Verify Payment');
    if (e.type === 'refund') return form('Record an external refund', [h('p', {}, 'Record a refund only after checking that it happened outside this website. This does not send money or change Square.'), f('Refund amount ($)', v, 'amount', { type: 'number', min: '.01', max: 10000, step: '.01', required: true }), f('Independent refund reference', v, 'evidence', { required: true, minlength: 5, maxlength: 500 }), f('Refund reason', v, 'reason', { required: true, maxlength: 500 }), check('I independently verified this refund', v, 'independentlyVerified')], () => send('refund', { id: v.orderId, orderVersion: v.orderVersion, amount: price(v.amount), evidence: v.evidence, reason: v.reason, independentlyVerified: v.independentlyVerified }), 'Record refund');
    if (e.type === 'payment-correction') return form('Correct a mistaken verification', [h('p', {}, 'Use only if the payment was marked verified by mistake. The original verification and receipt stay in the private audit history as voided records. This does not issue a refund or move money.'), f('Correction reason', v, 'reason', { required: true, minlength: 5, maxlength: 500 }), check('I checked independent records and confirm the verification was a mistake', v, 'independentlyChecked')], () => send('payment-correction', { id: v.orderId, orderVersion: v.orderVersion, reason: v.reason, independentlyChecked: v.independentlyChecked }), 'Void mistaken verification');
    if (e.type === 'status') return form('Update fulfillment', [f('Fulfillment status', v, 'status', { choices: [['pending', 'New'], ['preparing', 'Preparing'], ['ready', 'Ready for Pickup'], ['canceled', 'Canceled']].map(([value, label]) => ({ value, label })) }), f('Reason for cancellation / correction', v, 'reason', { maxlength: 500 }), check('I confirm this correction if the order is moving backward', v, 'confirmCorrection'), check('I confirm cancellation if Canceled is selected; no refund is processed', v, 'confirmCancellation'), check('Release this canceled order’s items back to available inventory', v, 'releaseInventory')], () => send('fulfillment', { id: v.orderId, orderVersion: v.orderVersion, status: v.status, reason: v.reason, confirmCorrection: v.confirmCorrection, confirmCancellation: v.confirmCancellation === true, releaseInventory: v.releaseInventory }), 'Save order status');
    if (e.type === 'reply') return form('Reply to customer', [f('Your reply', v, 'body', { type: 'textarea', required: true, maxlength: 2000 })], () => send('reply', { id: v.orderId, orderVersion: v.orderVersion, body: v.body }), 'Send reply');
    if (e.type === 'extension') return form('Approve New Pickup Time', [h('p', {}, 'Only an owner can approve this arrangement. The original schedule and customer request are retained.'), f('Approved pickup date', v, 'date', { type: 'date', required: true }), clockField('Approved pickup time', v, 'time'), check('I confirm this new pickup arrangement', v, 'confirmed')], () => send('approve-extension', { id: v.orderId, orderVersion: v.orderVersion, date: v.date, time: v.time, confirmed: v.confirmed }), 'Approve New Pickup Time');
    if (['contact-resolution','pickup-resolution','dispute'].includes(e.type)) return form(e.type === 'contact-resolution' ? 'Resolve conversation' : e.type === 'dispute' ? 'Payment dispute review' : 'Review pickup resolution', [h('p', {}, 'No money is transferred or refunded by this action. Forfeiture requires a passed deadline with no unresolved communication or dispute.'), e.type === 'pickup-resolution' ? f('Resolution', v, 'resolution', { choices: [{ value: 'reviewed', label: 'Owner reviewed and resolved' }, { value: 'forfeited', label: 'Owner reviewed forfeiture' }] }) : null, f('Owner review and reason', v, 'reason', { type: 'textarea', required: true, maxlength: 500 }), check('I confirm this owner-reviewed decision', v, 'confirmed')], () => send(e.type === 'contact-resolution' ? 'resolve-contact' : e.type === 'dispute' ? 'dispute' : 'resolve-pickup', { id: v.orderId, orderVersion: v.orderVersion, reason: v.reason, confirmed: v.confirmed, resolution: v.resolution, open: v.open }), 'Confirm decision');
    if (e.type === 'payment-settings') return form(providers[v.provider] + ' payment link', [
      f(providers[v.provider] + ' payment URL', v, 'url', { type: 'url', maxlength: 500, placeholder: 'Paste your business payment link' }),
      check('Enabled for customer payments', v, 'enabled'), check('This destination is approved for my business sales', v, 'businessConfirmed'),
      h('p', {}, 'Save the link, then use Test Link and confirm the correct recipient. An edited link needs a new test before checkout can use it.'),
    ], () => send('payment-destination', { ...v, paymentsVersion: e.paymentsVersion }), 'Save payment link');
    if (e.type === 'business-settings') return form('Business days', [
      h('h3', {}, 'Business days for pickup deadlines'), ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((name,day) => field(name, v.calendar.days.includes(day), checked => { v.calendar.days = checked ? [...v.calendar.days,day] : v.calendar.days.filter(d => d !== day); }, { type: 'checkbox' })),
      f('Closures (one YYYY-MM-DD date per line)', v, 'closuresText', { type: 'textarea', maxlength: 5000 }),
    ], () => send('settings', { ledgerVersion: e.ledgerVersion, calendar: { ...v.calendar, closures: v.closuresText.split(/\s+/).filter(Boolean) } }), 'Save business days');
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
  async function lockStudio() {
    if (busy) return;
    marked(); busy = true; render();
    try { await request('/api/studio-pin/lock', {}); disposed = true; editing = null; pending = null; location.assign('/studio'); }
    catch (e) { error = 'Studio could not be locked. ' + e.message; busy = false; render(); }
  }
  function credentials() {
    if (!newAccessKey || initial.previewDirectAccess) return null;
    return panel('Save this workspace access privately', h('p', {}, 'These details belong only to this private test workspace. Store them in your password manager; they are not recovery for the original beta.'),
      h('input', { value: workspace, readonly: true, 'aria-label': 'Workspace ID' }), h('input', { type: 'password', value: newAccessKey, readonly: true, 'aria-label': 'Private access key', autocomplete: 'off' }),
      button('I saved these details', () => { newAccessKey = ''; render(); }, { class: 'ms-primary' }));
  }
  async function processMarketing() {
    if(marketingProcessing)return;
    marketingProcessing=true;
    try {
      for(let step=0;step<1200;step++) {
        const before=data.ledgerVersion;
        if(!await send('marketing-process',{ledgerVersion:data.ledgerVersion}))break;
        if(before===data.ledgerVersion)break;
        const m=data.management.marketing;
        if(m.syncError || !(m.syncRequested || (m.deliveries||[]).some(v=>['queued-review','assembling','queued-send'].includes(v.status)||v.resultsRequested)))break;
      }
    } finally {marketingProcessing=false;render();}
  }
  function marketing() {
    const m=data.management.marketing || {contacts:[],campaigns:[],templates:{}};
    const d=marketingDraft;
    return h('div',{},h('h1',{},'Marketing'),h('p',{},'Fresh from the Roost'),
      panel('Subscribers',h('p',{},m.contacts.filter(c=>c.status==='confirmed').length+' confirmed · '+m.contacts.filter(c=>c.status==='pending').length+' awaiting confirmation · '+m.contacts.filter(c=>c.status==='unsubscribed').length+' unsubscribed'),
        h('p',{},'Customers join voluntarily through a separate email signup. No customer addresses are imported.'),
        m.contacts.map(c=>h('article',{class:'ms-audit'},h('strong',{},c.email),h('p',{},c.status),c.status!=='unsubscribed'?button('Unsubscribe',()=>{if(confirm('Suppress this subscriber immediately?'))send('marketing-suppress',{ledgerVersion:data.ledgerVersion,contactId:c.id});},{class:'ms-secondary'}):null))),
      panel('Campaigns',h('p',{},m.sendingEnabled?'Campaign sending is enabled after final audience review and explicit confirmation.':'Marketing delivery is disabled. Drafts and previews are available. Live sending requires a verified Marketing connection, an accurate mailing address and Danielle’s separate approval.'),
        button('Create campaign',()=>{marketingDraft={template:'products',subject:'New Products',message:'',photo:''};render();},{class:'ms-primary'}),
        d?h('form',{onsubmit:async e=>{e.preventDefault();const saved=await send('marketing-draft',{ledgerVersion:data.ledgerVersion,...d});if(saved){marketingDraft=null;render();}}},
          f('Template',d,'template',{choices:Object.entries(m.templates).map(([value,label])=>({value,label}))}),f('Subject',d,'subject',{required:true,maxlength:150}),f('Message',d,'message',{type:'textarea',required:true,maxlength:12000}),
          f('Product photograph',d,'photo',{choices:[{value:'',label:'No photograph'},...(data.published.products || []).filter(p=>!p.placeholder).flatMap(p=>(p.images||[]).filter(i=>!i.src.endsWith('.svg')).map(i=>({value:i.src,label:p.name})))]}),
          h('button',{type:'submit',class:'ms-primary',disabled:busy},'Save draft'),button('Cancel',()=>{marketingDraft=null;render();},{class:'ms-secondary'})):null,
        m.campaigns.map(c=>h('article',{class:'ms-audit'},h('h3',{},c.subject),h('p',{},c.status+' · '+stamp(c.updatedAt)),button('Edit draft',()=>{marketingDraft={campaignId:c.id,template:c.template,subject:c.subject,message:c.message,photo:c.photo};render();},{class:'ms-secondary'}),
          h('details',{},h('summary',{},'Preview email'),h('iframe',{title:'Email preview: '+c.subject,sandbox:'',srcdoc:c.preview.html,style:{width:'100%',height:'620px',border:'1px solid #d8dfd2'}})),h('p',{},'Delivery results: '+((m.deliveries||[]).filter(v=>v.campaignId===c.id).map(v=>v.status).join(', ')||'no sending attempted.')),
          c.status==='draft'&&m.ownerTestEnabled?button('Review owner test',()=>{const recipient=prompt('Confirmed, opted-in owner email address',data.actor?.email||'');if(recipient)send('marketing-review',{ledgerVersion:data.ledgerVersion,campaignId:c.id,kind:'test',recipient});},{class:'ms-secondary'}):null,
          c.status==='draft'&&m.sendingEnabled?button('Review campaign audience',()=>send('marketing-review',{ledgerVersion:data.ledgerVersion,campaignId:c.id,kind:'campaign'}),{class:'ms-secondary'}):null))),
      panel('Delivery history and audience review',
        h('p',{},m.syncError?'Synchronization needs attention: '+m.syncError:'Subscriber sync: '+(m.syncedAt?stamp(m.syncedAt):'awaiting provider setup')),
        m.connectionReady?button('Synchronize and process pending work',()=>processMarketing(),{class:'ms-secondary',disabled:busy||marketingProcessing}):null,
        (m.deliveries||[]).map(v=>h('article',{class:'ms-audit'},h('h3',{},v.campaign.subject+' · '+(v.kind==='test'?'Owner test':'Campaign')),
          h('p',{},v.status+(v.providerStatus?' · Provider: '+v.providerStatus:'')+(v.error?' · '+v.error:'')+(v.resultsError?' · Results: '+v.resultsError:'')),
          h('p',{},'Sender: orders@rise-and-roost.com'),h('p',{},'Final audience ('+v.recipients.length+'): '+v.recipients.join(', ')),
          h('p',{},'Mailing address: '+v.address),
          v.broadcastId?h('p',{},'Provider broadcast: '+v.broadcastId):null,
          ['sending','unknown','checking','preparing'].includes(v.status)?h('p',{},'Processing or interrupted. Check provider results; a send is never retried automatically.'):null,
          v.status==='reviewed'&&(v.kind==='test'?m.ownerTestEnabled:m.sendingEnabled)?button(v.kind==='test'?'Confirm owner test':'Confirm campaign send',()=>{if(confirm('Send “'+v.campaign.subject+'” to exactly '+v.recipients.length+' reviewed recipient(s)?'))send(v.kind==='test'?'marketing-test':'marketing-send',{ledgerVersion:data.ledgerVersion,deliveryId:v.id,reviewToken:v.reviewToken,confirmed:true});},{class:'ms-primary',disabled:busy}):null,
          v.broadcastId?button('Refresh provider results',async()=>{if(await send('marketing-results',{ledgerVersion:data.ledgerVersion,deliveryId:v.id}))await processMarketing();},{class:'ms-secondary',disabled:busy||marketingProcessing}):null,
          v.providerResults?h('p',{},Object.entries(v.providerResults).map(([kind,recipients])=>kind+': '+recipients.length).join(' · ')):null))),
      panel('Sender details',h('form',{onsubmit:e=>{e.preventDefault();send('marketing-settings',{ledgerVersion:data.ledgerVersion,address:e.currentTarget.elements.address.value});}},h('label',{class:'field'},'Physical mailing address',h('textarea',{name:'address',maxlength:500},m.address || '')),h('button',{type:'submit',class:'ms-primary',disabled:busy},'Save address')),h('p',{},'Use the accurate physical mailing address required in every marketing email.')));
  }
  function render() {
    if (reauth) { root.replaceChildren(h('main', { class: 'ms-loading' }, h('h1', {}, initial.previewPinAccess ? 'Studio is locked' : initial.previewDirectAccess ? 'Testing access needs verification' : 'Sign-in required'), h('p', {}, initial.previewPinAccess ? 'Enter your owner PIN in another tab, then check the connection here. Your unsaved form is kept here.' : initial.previewDirectAccess ? 'Reopen Studio in another tab to verify your Cloudflare Access session. Your unsaved form is kept here.' : 'Your unsaved form is kept in this tab. Sign in to this exact website in a new tab, then check the connection.'), h('a', { href: initial.studioPath, target: '_blank', rel: 'noopener' }, initial.previewPinAccess ? 'Unlock Studio' : initial.previewDirectAccess ? 'Reopen Website Studio' : 'Sign in to this website'), button('Check connection', () => refresh()))); return; }
    if (!data.management) { root.replaceChildren(h('main', { class: 'ms-loading' }, 'Opening Rise & Roost Website Studio…')); return; }
    const page = editing ? editForm() : view === 'Marketing' ? marketing() : view === 'Home' ? home() : view === 'Orders' ? orders() : view === 'Products' ? products() : view === 'Calendar/Weeks' ? pickupWeeks() : view === 'Calendar/Changes' ? scheduleChanges() : view === 'Calendar' ? calendar() : view === 'The Roost/Return Credits' ? returnCredits() : view === 'The Roost' ? members() : view === 'Website Content' ? content() : view === 'Customer Comments' ? comments() : view === 'Sales Reports' ? reports() : view === 'Settings/Email' ? emailSettings() : view === 'Settings/Help' ? helpGuide() : view === 'Settings/Payments' ? payments() : view === 'Settings' ? settings() : h('div', {}, h('h1', {}, 'More'), secondary.map(label => menu(label, label)));
    root.replaceChildren(h('div', { class: 'management' },
      h('aside', { class: 'ms-sidebar' }, h('a', { href: initial.studioPath, class: 'ms-brand' }, h('img', { src: '/assets/logo.webp', alt: 'Rise & Roost' }), h('span', {}, 'Rise & Roost', h('small', {}, 'Website Studio'))),
        h('nav', { 'aria-label': 'Studio navigation' }, primary.filter(v => v !== 'More').map(label => button(label, () => go(label), { 'aria-current': view === label || label === 'Settings' && view.startsWith('Settings/') ? 'page' : undefined })), h('details', { open: true }, h('summary', {}, 'More'), secondary.map(label => button(label, () => go(label), { 'aria-current': view === label || label === 'Settings' && view.startsWith('Settings/') ? 'page' : undefined })))), h('a', { href: initial.publishedPath, target: '_blank', rel: 'noopener', class: 'ms-secondary' }, 'View website')),
      h('div', { class: 'ms-workspace' }, h('header', { class: 'ms-top' }, view === 'Home' && !editing ? null : h('nav', { class: 'ms-history', 'aria-label': 'Studio history' }, button([navigationIcon('home'), h('span', {}, 'Home')], () => go('Home'), { class: 'ms-history-button ms-history-home' }), button([navigationIcon('back'), h('span', {}, 'Back')], () => navigation.back(), { class: 'ms-history-button ms-history-back' })), h('div', { class: 'ms-mobile-brand' }, h('img', { src: '/assets/logo.webp', alt: '' }), h('strong', {}, 'Rise & Roost', h('small', {}, 'Website Studio'))),
        h('span', { id: 'management-connection', role: 'status', class: connected ? '' : 'offline' }, connected ? 'Connected' : 'Offline / reconnecting'), button('Check connection', () => refresh(), { class: 'ms-text' }), initial.previewPinAccess ? button('Lock Studio', lockStudio, { class: 'ms-text' }) : null, initial.previewDirectAccess || initial.productionOwnerAccess ? h('a', { id: 'management-reopen', href: initial.studioPath, target: '_blank', rel: 'noopener', class: 'ms-text', hidden: connected }, 'Reopen Studio') : null, pending && !busy ? button('Resolve previous save', cancel, { class: 'ms-text' }) : null),
        h('div', { id: 'management-error', role: 'alert', class: 'ms-error', hidden: !error }, error),
        h('main', { id: 'main-content', class: 'ms-main' }, credentials(), page)),
      h('nav', { class: 'ms-bottom', 'aria-label': 'Primary Studio navigation' }, primary.map(label => button(label, () => go(label), { 'aria-current': view === label || label === 'More' && (secondary.includes(view) || view.startsWith('Settings/')) ? 'page' : undefined })))));
    if (busy) for (const control of root.querySelectorAll('button,input,select,textarea')) control.disabled = true;
  }
  window.addEventListener('beforeunload', event => { if (editing || pending) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('offline', () => { connected = false; error = 'You’re offline. Changes stay unsaved until the server confirms them.'; chrome(); });
  window.addEventListener('online', () => refresh());
  window.addEventListener('focus', () => refresh());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  try { const target = decodeURIComponent(location.hash.slice(1)); if ([...primary, ...secondary, 'Settings/Payments', 'Settings/Help', 'Settings/Email', 'The Roost/Return Credits'].includes(target)) view = target; } catch {}
  try { const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); if (saved?.type && ['product', 'calendar', 'content', 'payment-settings', 'fresh-announcement'].includes(saved.type)) { editing = saved; view = { product: 'Products', calendar: 'Calendar', content: 'Website Content', 'payment-settings': 'Settings/Payments', 'fresh-announcement': 'Products' }[saved.type]; } } catch {}
  try { const saved = JSON.parse(sessionStorage.getItem(pendingKey) || 'null'); if (/^[a-f0-9-]{32,48}$/.test(saved?.id || '')) pending = { id: saved.id, form: editing }; } catch {}
  navigation = studioHistory({ workspace, path: initial.studioPath, read: route, apply: applyRoute, canLeave, home: homeRoute, views: [...primary, ...secondary, 'Settings/Payments', 'Settings/Help', 'Settings/Email', 'The Roost/Return Credits'] });
  render(); await refresh();
  setInterval(() => { if (!document.hidden && !busy && !disposed) void refresh(); }, 5000);
}
