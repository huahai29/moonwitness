import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, analyze_baseline } from '../dist/engine.mjs';
const op = (id, key, start, end, kind, output, value = 0) => ({ id, client: id, key, start, end, kind, output, value });
const run = (history, nodes = 100000, baseline = false) => JSON.parse((baseline ? analyze_baseline : analyze)(JSON.stringify(history), nodes, 0));

export function partitionWorkload(keys, invalid = false) {
  const operations = [];
  for (let k = 0; k < keys; k++) {
    operations.push(op(`w${k}-1`, `key-${k}`, 0, 10, 'put', null, 1));
    operations.push(op(`w${k}-2`, `key-${k}`, 0, 10, 'put', null, 2));
  }
  for (let k = 0; k < keys; k++) operations.push(op(`r${k}`, `key-${k}`, 11, 12, 'get', invalid && k === keys - 1 ? 999 : 2));
  return { model: 'kv', initial: 0, operations };
}

function assertWitness(history, result) {
  assert.equal(result.verdict, 'linearizable');
  assert.equal(new Set(result.result.order).size, history.operations.length);
  const positions = new Map(result.result.order.map((id, i) => [id, i]));
  for (const a of history.operations) for (const b of history.operations) if (a.end <= b.start) assert.ok(positions.get(a.id) < positions.get(b.id));
  assert.equal(result.replay.steps.length, history.operations.length);
  assert.equal(result.replay.frontier.length, 0);
}

test('partition witnesses merge with cross-key real-time edges', () => {
  const history = { model: 'kv', initial: 0, operations: [
    op('read-x', 'x', 0, 2, 'get', 0), op('write-y', 'y', 2, 3, 'put', null, 7),
    op('write-x', 'x', 1, 5, 'put', null, 9), op('read-y', 'y', 5, 6, 'get', 7),
  ] };
  const result = run(history); assertWitness(history, result);
  assert.equal(result.verdict, run(history, 100000, true).verdict);
});
test('partitions share a single total budget', () => {
  const history = { model: 'kv', initial: 0, operations: [op('x', 'x', 0, 1, 'get', 0), op('y', 'y', 0, 1, 'get', 0)] };
  assert.equal(run(history, 1).verdict, 'unknown');
  assert.equal(run(history, 1).result.explored, 1);
  assertWitness(history, run(history, 2));
});
test('partition failure never reports a partial per-key witness as global', () => {
  const result = run(partitionWorkload(3, true));
  assert.equal(result.verdict, 'violation'); assert.deepEqual(result.result.order, []);
});
test('valid many-key histories keep exact state replay', () => {
  const history = partitionWorkload(20); assertWitness(history, run(history));
});
test('partitioned and monolithic exhaustive verdicts agree on varied histories', () => {
  let seed = 771;
  const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  for (let i = 0; i < 400; i++) {
    const operations = Array.from({ length: 2 + random(6) }, (_, j) => {
      const start = random(5), write = random(3) === 0;
      return op(`${j}`, ['x', 'y', 'z'][random(3)], start, start + 1 + random(4), write ? 'put' : 'get', write ? null : random(3), random(3));
    });
    const history = { model: 'kv', initial: random(2), operations };
    const optimized = run(history), baseline = run(history, 100000, true);
    assert.notEqual(baseline.verdict, 'unknown');
    assert.equal(optimized.verdict, baseline.verdict, JSON.stringify(history));
    if (optimized.verdict === 'linearizable') assertWitness(history, optimized);
  }
});
