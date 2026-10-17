import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { captureSqlite } from '../adapters/sqlite-demo.mjs';
import { analyze } from '../dist/engine.mjs';

const supported = Number(process.versions.node.split('.')[0]) >= 24;
test('file-backed SQLite: application lost update is caught; atomic UPDATE passes', { skip: !supported }, async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const directory = await mkdtemp(join(tmpdir(), 'moonwitness-sqlite-test-'));
  for (const mode of ['broken', 'atomic']) {
    const databasePath = join(directory, `${mode}.sqlite`);
    const captured = await captureSqlite(mode, databasePath);
    const result = JSON.parse(analyze(JSON.stringify(captured.history), 100000, 300));
    assert.equal(result.verdict, mode === 'broken' ? 'violation' : 'linearizable');
    assert.deepEqual(captured.history.operations.slice(0, 2).map(op => op.output), mode === 'broken' ? [1, 1] : [1, 2]);
    assert.equal(captured.finalValue, mode === 'broken' ? 1 : 2);
    assert.ok((await stat(databasePath)).size > 0);
    // Reopen the persisted DB rather than trusting the captured JSON alone.
    const reopened = new DatabaseSync(databasePath, { readOnly: true });
    try { assert.equal(reopened.prepare("SELECT value FROM counters WHERE name='value'").get().value, captured.finalValue); }
    finally { reopened.close(); }
    await assert.rejects(captureSqlite(mode, databasePath), /EEXIST/);
  }
});
test('SQLite adapter refuses unknown modes', async () => {
  await assert.rejects(captureSqlite('unknown'), /mode must/);
});
