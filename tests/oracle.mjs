// Independent bounded oracle: enumerate whole permutations without the
// production engine's predecessor pruning, memoization or model code.
import assert from 'node:assert/strict';
import { analyze } from '../dist/engine.mjs';

function accepts(history, order) {
  const position = new Map(order.map((op, i) => [op.id, i]));
  for (const a of history.operations) for (const b of history.operations) {
    if (a.end <= b.start && position.get(a.id) >= position.get(b.id)) return false;
  }
  const state = new Map();
  for (const op of order) {
    const key = op.key || '', before = state.get(key) ?? history.initial;
    if (op.kind === 'read' || op.kind === 'get') {
      if (op.output !== before) return false;
    } else if (op.kind === 'write' || op.kind === 'put') {
      if (op.output !== null) return false;
      state.set(key, op.value);
    } else if (op.kind === 'cas') {
      const success = before === op.expected;
      if (op.output !== success) return false;
      if (success) state.set(key, op.value);
    } else if (op.kind === 'add') {
      const after = before + op.value;
      if (after < -2147483648 || after > 2147483647 || op.output !== after) return false;
      state.set(key, after);
    } else throw new Error('oracle received unsupported operation');
  }
  return true;
}
function brute(history) {
  const order = [], used = new Set();
  function enumerate() {
    if (order.length === history.operations.length) return accepts(history, order);
    for (let i = 0; i < history.operations.length; i++) {
      if (used.has(i)) continue;
      used.add(i); order.push(history.operations[i]);
      if (enumerate()) return true;
      order.pop(); used.delete(i);
    }
    return false;
  }
  return enumerate();
}
let seed = 0x20261017;
function random(n) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; }
let passed = 0, violations = 0, reducedCount = 0;
for (let caseIndex = 0; caseIndex < 1500; caseIndex++) {
  const model = ['register', 'kv', 'counter'][caseIndex % 3];
  const kinds = model === 'kv' ? ['get', 'put', 'cas'] : model === 'counter' ? ['read', 'add'] : ['read', 'write', 'cas'];
  const history = { model, initial: random(3) - 1, operations: Array.from({ length: 1 + random(6) }, (_, i) => {
    const start = random(7), kind = kinds[random(kinds.length)];
    return { id: `op-${i}`, client: `client-${i}`, start, end: start + 1 + random(5), kind,
      key: model === 'kv' ? ['x', 'y'][random(2)] : '', value: random(3) - 1, expected: random(3) - 1,
      output: kind === 'cas' ? random(2) === 0 : kind === 'write' || kind === 'put' ? null : random(5) - 2 };
  }) };
  // Every fifth case is made sequential and known-good, balancing the corpus.
  if (caseIndex % 5 === 0) {
    const state = new Map();
    history.operations.forEach((op, i) => {
      op.start = i * 2; op.end = i * 2 + 1;
      const before = state.get(op.key) ?? history.initial;
      if (['read', 'get'].includes(op.kind)) op.output = before;
      else if (['write', 'put'].includes(op.kind)) { op.output = null; state.set(op.key, op.value); }
      else if (op.kind === 'add') { op.output = before + op.value; state.set(op.key, op.output); }
      else { op.output = before === op.expected; if (op.output) state.set(op.key, op.value); }
    });
  }
  const expected = brute(history);
  const result = JSON.parse(analyze(JSON.stringify(history), 100000, caseIndex % 7 === 0 ? 100 : 0));
  assert.equal(result.verdict, expected ? 'linearizable' : 'violation', `oracle disagreement: ${JSON.stringify(history)}`);
  if (expected) {
    passed++;
    assert.equal(result.result.order.length, history.operations.length);
    assert.equal(new Set(result.result.order).size, history.operations.length);
    assert.ok(accepts(history, result.result.order.map(id => history.operations.find(op => op.id === id))));
  } else violations++;
  if (result.reduction) {
    reducedCount++;
    const reduced = result.reduction.history;
    assert.equal(brute(reduced), false, 'reduced counterexample must remain invalid');
    assert.equal(reduced.initial, history.initial);
    if (result.reduction.one_minimal) {
      for (let i = 0; i < reduced.operations.length; i++) assert.equal(brute({ ...reduced, operations: reduced.operations.filter((_, j) => j !== i) }), true);
    }
  }
}
console.log(JSON.stringify({ cases: 1500, linearizable: passed, violations, reductionsVerified: reducedCount, mismatches: 0, seed: '0x20261017' }));
