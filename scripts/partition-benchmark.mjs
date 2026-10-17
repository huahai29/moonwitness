import { performance } from 'node:perf_hooks';
import { analyze, analyze_baseline, partition_workload } from '../dist/engine.mjs';

const rows = [];
for (const [keys, invalid] of [[3, true], [5, true], [20, false]]) {
  const source = partition_workload(keys, invalid), row = { keys, operations: keys * 3, scenario: invalid ? 'impossible final-key read' : 'valid independent writes and reads' };
  for (const [name, check] of [['baseline', analyze_baseline], ['partitioned', analyze]]) {
    const samples = []; let result;
    check(source, 100000, 0);
    for (let i = 0; i < 5; i++) { const start = performance.now(); result = JSON.parse(check(source, 100000, 0)); samples.push(performance.now() - start); }
    samples.sort((a, b) => a - b);
    row[name] = { verdict: result.verdict, nodes: result.result.explored, medianMs: Number(samples[2].toFixed(3)) };
  }
  rows.push(row);
}
console.log(JSON.stringify({ runtime: process.version, platform: process.platform, samples: 5, maxNodes: 100000, reduction: false, results: rows }, null, 2));
