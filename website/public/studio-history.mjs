// Only entries created by this workspace's Studio qualify for header Back.
// Keep form values and search text in memory, never in URLs/history state.
export function studioHistory({ workspace, path, read, apply, canLeave, home, views }) {
  const valid = marker => marker?.workspace === workspace && /^[a-f0-9-]{36}$/.test(marker.session || '') && Number.isSafeInteger(marker.index) && marker.index >= 0 && views.includes(marker.route?.view) && typeof marker.route.selection === 'string' && typeof marker.route.filter === 'string';
  const saved = history.state?.rrStudio;
  const session = valid(saved) ? saved.session : crypto.randomUUID();
  let index = valid(saved) ? saved.index : 0, restoring = false, moving = false;
  const entries = new Map([[index, read()]]);
  const state = route => ({ rrStudio: { workspace, session, index, route: { view: route.view, selection: route.selection, filter: route.filter } } });
  const url = route => path + '#' + encodeURIComponent(route.view);
  history.replaceState(state(read()), '', url(read()));
  function remember() { entries.set(index, read()); }
  function push(route) {
    remember();
    for (const key of entries.keys()) if (key > index) entries.delete(key);
    index++; entries.set(index, route);
    history.pushState(state(route), '', url(route)); apply(route);
  }
  function navigate(route) {
    if (moving || restoring || !canLeave()) return;
    push(route);
  }
  function back() {
    if (moving || restoring) return;
    if (index > 0) { moving = true; history.back(); }
    else navigate(home());
  }
  window.addEventListener('popstate', event => {
    const target = event.state?.rrStudio;
    if (!valid(target) || target.session !== session) return;
    moving = false;
    if (restoring) { restoring = false; return; }
    if (!canLeave()) { restoring = true; history.go(index - target.index); return; }
    remember(); index = target.index;
    const route = entries.get(index) || { ...target.route, search: '', editing: null };
    entries.set(index, route); apply(route);
  });
  return { navigate, back, push, forgetForm(form) { for (const entry of entries.values()) if (entry.editing === form) entry.editing = null; } };
}
