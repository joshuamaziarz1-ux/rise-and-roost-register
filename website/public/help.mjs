import { h, button, field } from './dom.mjs';
import { searchHelp } from './help-content.mjs';

// Only the results change while typing, preserving focus and cursor position.
// Local view state survives Studio's background snapshot refreshes.
export function createHelpGuide() {
  let query = '';
  const expanded = new Set();
  return function renderHelpGuide() {
    const results = h('div', { class: 'ms-help-results', id: 'studio-help-results' });
    const status = h('p', { role: 'status', 'aria-live': 'polite', 'aria-atomic': true });
    const input = field('Search the Studio Help Guide', query, value => { query = value; update(); }, { type: 'search', placeholder: 'Try payment, pickup, sold out…', 'aria-controls': 'studio-help-results', autocomplete: 'off' });
    const clear = button('Clear search', () => { query = ''; input.querySelector('input').value = ''; update(); input.querySelector('input').focus(); }, { class: 'ms-secondary' });
    function update() {
      const categories = searchHelp(query);
      const count = categories.reduce((sum, c) => sum + c.topics.length, 0);
      status.textContent = query.trim() ? `${count} matching topic${count === 1 ? '' : 's'} (some also appear in How Do I…?).` : 'Choose a category, or search for a question.';
      clear.hidden = !query;
      results.replaceChildren(...categories.map(category => {
        const details = h('details', { class: 'ms-panel ms-help-category', open: !!query.trim() || expanded.has(category.title) },
          h('summary', {}, category.title, h('span', { class: 'ms-note' }, ` · ${category.topics.length} topics`)),
          category.topics.map(topic => h('article', { class: 'ms-help-topic' }, h('h3', {}, topic.title), topic.paragraphs.map(text => h('p', {}, text)), topic.steps.length ? h('ol', {}, topic.steps.map(step => h('li', {}, step))) : null)));
        details.addEventListener('toggle', () => { if (!query.trim()) { if (details.open) expanded.add(category.title); else expanded.delete(category.title); } });
        return details;
      }));
      if (!count) results.append(h('p', { class: 'ms-empty' }, 'No help topics match your search. Try fewer words, or clear your search to see the full guide.'));
    }
    update();
    return h('div', { class: 'ms-help' }, h('h1', { tabindex: '-1' }, 'Studio Help Guide'),
      h('p', {}, 'Your Rise & Roost owner’s manual. Find everyday answers here, Danielle.'),
      h('div', { class: 'ms-panel' }, input, clear, status), results);
  };
}
