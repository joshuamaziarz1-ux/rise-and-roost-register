import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const baseline = JSON.parse(readFileSync(new URL('../docs/roost-account-settings/live-baseline.json', import.meta.url)));
const digest = content => createHash('sha256').update(content).digest('hex');
test('live personalized greeting, upper dashboard, checkout and existing styles are preserved exactly', () => {
  const source = readFileSync(new URL('../public/customer.mjs', import.meta.url), 'utf8');
  for (const [name, block] of Object.entries(baseline.preserved_customer_blocks)) {
    const start = source.indexOf(block.start), end = source.indexOf(block.end, start);
    assert(start >= 0 && end > start, name + ' must remain identifiable');
    assert.equal(digest(source.slice(start, end)), block.sha256, name + ' changed from the captured live version');
  }
  for (const file of baseline.unchanged_assets) {
    let bytes = readFileSync(new URL('../public/' + file.file, import.meta.url));
    if (file.normalize_cache_reference) {
      const { from, to } = file.normalize_cache_reference;
      const source = bytes.toString('utf8');
      assert.equal(source.split(from).length, 2, 'only the reviewed module cache reference may change');
      bytes = Buffer.from(source.replace(from, to));
    }
    assert.equal(digest(bytes), file.sha256, file.file + ' changed from live');
  }
});
