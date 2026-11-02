import test from 'node:test';
import assert from 'node:assert/strict';
import dispatcher from '../server/backup-dispatch-worker.mjs';

test('backup dispatcher is disabled by default and exposes no public trigger or secrets', async () => {
  for (const path of ['/', '/backup', '/studio']) {
    const response = dispatcher.fetch(new Request('https://example.test' + path));
    assert.equal(response.status, 404); assert.equal(await response.text(), 'Not found');
  }
  await dispatcher.scheduled({}, {});
  await assert.rejects(dispatcher.scheduled({}, { BACKUP_TRIGGER_ENABLED: 'true', BACKUP_WORKFLOW_REF: 'unreviewed-branch', BACKUP_ACTIONS_TOKEN: 'fixture-only' }), /approved protected backup/);
});
test('backup dispatcher sends only the approved workflow ref; acceptance never reports a backup success', async () => {
  const original = globalThis.fetch; let calls = 0;
  try {
    globalThis.fetch = async (url, options) => {
      calls++; assert.equal(url, 'https://api.github.com/repos/joshuamaziarz1-ux/rise-and-roost-register/actions/workflows/production-business-backup.yml/dispatches');
      assert.deepEqual(JSON.parse(options.body), { ref: 'main' }); assert.equal(options.headers.Authorization, 'Bearer fixture-only');
      return new Response(null, { status: 204 });
    };
    assert.equal(await dispatcher.scheduled({}, { BACKUP_TRIGGER_ENABLED: 'true', BACKUP_WORKFLOW_REF: 'main', BACKUP_ACTIONS_TOKEN: 'fixture-only' }), undefined); assert.equal(calls, 1);
    globalThis.fetch = async () => new Response('unavailable', { status: 503 });
    await assert.rejects(dispatcher.scheduled({}, { BACKUP_TRIGGER_ENABLED: 'true', BACKUP_WORKFLOW_REF: 'main', BACKUP_ACTIONS_TOKEN: 'fixture-only' }), /not accepted/);
  } finally { globalThis.fetch = original; }
});
