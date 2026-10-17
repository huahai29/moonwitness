// Run from a fresh clone: node examples/quickstart.mjs
// No JSON editing, MoonBit compiler, npm install or database required.
import { createCounterProbe } from '../adapters/instrument.mjs';

let stored = 0;
const probe = createCounterProbe({
  read: () => stored,
  add: delta => { stored += delta; return stored; },
});
await Promise.all([probe.add(1), probe.add(1)]);
await probe.read();
const result = probe.assert();
console.log(`原子更新：两次加一返回 1、2，最后读取 ${stored} → ${result.verdict}`);

// The same wrapper captures an intentionally broken asynchronous implementation.
let raced = 0, release;
const gate = new Promise(resolve => { release = resolve; });
const broken = createCounterProbe({
  read: () => raced,
  async add(delta) { const before = raced; await gate; raced = before + delta; return raced; },
});
const alice = broken.add(1), bob = broken.add(1); release();
await Promise.all([alice, bob]); await broken.read();
const failed = broken.check();
if (failed.verdict !== 'violation') throw new Error('Expected the demonstration race to be detected');
console.log(`分开读写：两次加一返回 1、1，最后读取 ${raced} → ${failed.verdict}`);

// Optional: node examples/quickstart.mjs <new-output-directory>
if (process.argv[2]) {
  const { mkdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  await mkdir(process.argv[2]);
  await probe.saveReport(join(process.argv[2], 'correct'));
  await broken.saveReport(join(process.argv[2], 'broken'));
  console.log(`原始记录与离线回放报告：${process.argv[2]}`);
}
