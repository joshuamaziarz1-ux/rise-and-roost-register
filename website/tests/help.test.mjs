import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { helpCategories, searchHelp } from '../public/help-content.mjs';
test('owner guide covers every section and real search indexes titles and answers', () => {
  for (const title of ['Home', 'Orders', 'Products & Inventory', 'Pickup Calendar', 'Fresh at The Roost!', 'The Roost', 'Website Content', 'Customer Comments', 'Sales Reports', 'Settings & Payment Configuration', 'How Do I…?', 'Warnings, Messages & What They Mean']) assert.ok(helpCategories.some(c => c.title === title));
  for (const query of ['paused', 'checkout', 'payment', 'inventory', 'sold out', 'hidden', 'pickup', 'calendar', 'deadline', 'price', 'orders', 'announcement', '  PAYment  ', 'independently']) assert.ok(searchHelp(query).length, query);
  assert.equal(searchHelp('no-such-topic-zxcvbnm').length, 0);
  assert.equal(searchHelp(' ').length, helpCategories.length);
  assert.ok(searchHelp('Wednesday noon').some(c => c.topics.some(t => t.title === 'Automatic Wednesday, Thursday and Friday schedule')));
});
test('literal warning headings exist in current source and steps use real controls', () => {
  const sources = ['public/management.mjs', 'server/management.mjs', 'public/dom.mjs'].map(p => readFileSync(p, 'utf8')).join('\n');
  for (const c of helpCategories.filter(c => c.title === 'Warnings, Messages & What They Mean')) for (const t of c.topics) if (t.title.endsWith('.')) assert.ok(sources.includes(t.title), t.title);
  for (const label of ['Save product live', 'Show Product', 'Hide Product', 'Save pickup live', 'Confirm Verify Payment', 'Start Preparing', 'Mark Ready for Pickup', 'Save announcement live', 'Publish website content', 'Resume ordering']) assert.ok(sources.includes(label), label);
});
