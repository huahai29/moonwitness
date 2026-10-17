import { performance } from 'node:perf_hooks';
import { analyze, benchmark_workloads } from '../dist/engine.mjs';
const rows = [];
for (const [name, history] of JSON.parse(benchmark_workloads()).map(({name, history}) => [name, history])) {
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
