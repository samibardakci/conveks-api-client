import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.mjs';
test('SQLite persists scenarios and runs, never session keys; interrupted work is explicit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'conveks-client-test-')),
    file = join(dir, 'test.sqlite');
  try {
    const first = new Store(file);
    first.secrets.set('local', 'ck_live_memory_only');
    first.put('runs', { id: 'r', status: 'running', planId: 'pln_known' });
    first.put('scenarios', {
      id: 'custom',
      name: 'Persisted',
      request: { jobs: [], resources: [] },
    });
    first.close();
    const second = new Store(file);
    assert.equal(second.secrets.size, 0);
    assert.equal(second.get('scenarios', 'custom').name, 'Persisted');
    assert.equal(second.get('runs', 'r').status, 'interrupted');
    assert.equal(second.get('runs', 'r').planId, 'pln_known');
    second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
