import { performance } from 'node:perf_hooks';
import { analyze } from '../dist/engine.mjs';
const op = (id, start, end, kind, output, rest = {}) => ({ id, client: id, start, end, kind, output, ...rest });
const scenarios = {
  '128 sequential reads': { model: 'register', initial: 0, operations: Array.from({ length: 128 }, (_, i) => op(`r${i}`, i * 2, i * 2 + 1, 'read', 0)) },
  '62 noise reads + CAS race': { model: 'register', initial: 0, operations: [...Array.from({ length: 62 }, (_, i) => op(`r${i}`, i * 2, i * 2 + 1, 'read', 0)), op('a', 126, 134, 'cas', true, { expected: 0, value: 1 }), op('b', 127, 133, 'cas', true, { expected: 0, value: 2 })] },
  '9 overlapping writes + impossible read': { model: 'register', initial: 0, operations: [...Array.from({ length: 9 }, (_, i) => op(`w${i}`, 0, 10, 'write', null, { value: i + 1 })), op('r', 11, 12, 'read', 999)] },
};
const rows = [];
for (const [name, history] of Object.entries(scenarios)) {
  const source = JSON.stringify(history), samples = [];
  analyze(source, 100000, 300); // warmup
  let result;
  for (let i = 0; i < 5; i++) { const start = performance.now(); result = JSON.parse(analyze(source, 100000, 300)); samples.push(performance.now() - start); }
  samples.sort((a, b) => a - b);
  rows.push({ name, operations: history.operations.length, verdict: result.verdict, nodes: result.result.explored,
    reduced: result.reduction?.history.operations.length ?? null, checks: result.reduction?.checks ?? 0,
    medianMs: Number(samples[2].toFixed(3)) });
}
console.log(JSON.stringify({ runtime: process.version, platform: process.platform, architecture: process.arch, samplesPerScenario: 5, note: 'Local measurements, not a cross-machine performance guarantee', results: rows }, null, 2));
