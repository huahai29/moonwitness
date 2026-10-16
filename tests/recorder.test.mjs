import test from 'node:test';
import assert from 'node:assert/strict';
import { capture } from '../adapters/cas-demo.mjs';
import { Recorder } from '../adapters/recorder.mjs';
import { analyze } from '../dist/engine.mjs';

test('actual broken CAS produces a violating history; corrected CAS passes', async () => {
  const broken = await capture('broken'), correct = await capture('correct');
  assert.deepEqual(broken.operations.map(op => op.output), [true, true]);
  assert.equal(JSON.parse(analyze(JSON.stringify(broken), 100000, 100)).verdict, 'violation');
  assert.deepEqual(correct.operations.map(op => op.output), [true, false]);
  assert.equal(JSON.parse(analyze(JSON.stringify(correct), 100000, 100)).verdict, 'linearizable');
});
test('recorder refuses to silently discard failed or pending calls', async () => {
  const failed = new Recorder();
  await assert.rejects(failed.record({ id: 'x' }, async () => { throw new Error('uncertain timeout'); }));
  assert.throws(() => failed.history(), /uncertain/);
  const pending = new Recorder(); let finish;
  const running = pending.record({ id: 'x' }, () => new Promise(resolve => { finish = resolve; }));
  assert.throws(() => pending.history(), /pending/);
  finish(0); await running;
  assert.equal(pending.history().operations.length, 1);
});
