// Black-box sample acceptance: run the real CLI, including exit codes,
// serialization and shrinking. Expected outcomes are stated per scenario.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { capture } from '../adapters/cas-demo.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = process.argv[2] ? resolve(process.argv[2]) : await mkdtemp(join(tmpdir(), 'moonwitness-samples-'));
await mkdir(destination, { recursive: true });
const op = (id, start, end, kind, output, rest = {}) => ({ id, client: id, start, end, kind, output, ...rest });
const history = (operations, model = 'register', initial = 0) => ({ model, initial, operations });
const samples = [];
for (const [file, title, expected] of [
  ['legal-overlap', '写入期间读取旧值：合法', 'linearizable'],
  ['cas-race', '两个 CAS 都声称成功：违规', 'violation'],
  ['stale-read', '写入结束后读取旧值：违规', 'violation'],
  ['lost-update', '两次加一都返回 1：违规', 'violation'],
]) samples.push({ name: file, title, expected, source: await readFile(join(root, 'examples', `${file}.json`), 'utf8') });
samples.push(
  { name: 'legal-cas', title: 'CAS 一次成功一次失败：合法', expected: 'linearizable', data: history([op('a', 0, 5, 'cas', true, { expected: 0, value: 1 }), op('b', 1, 4, 'cas', false, { expected: 0, value: 2 })]) },
  { name: 'legal-counter', title: '并发加一分别返回 1、2：合法', expected: 'linearizable', data: history([op('a', 0, 5, 'add', 1, { value: 1 }), op('b', 1, 4, 'add', 2, { value: 1 })], 'counter') },
  { name: 'independent-keys', title: '写入 x 不改变 y：合法', expected: 'linearizable', data: history([op('a', 0, 1, 'put', null, { key: 'x', value: 9 }), op('b', 2, 3, 'get', 0, { key: 'y' })], 'kv') },
  { name: 'nonzero-initial', title: '非零初始值读取：合法', expected: 'linearizable', data: history([op('a', 0, 1, 'read', 7)], 'register', 7) },
  { name: 'boundary-stale', title: '结束与开始时间相等仍有先后约束', expected: 'violation', data: history([op('a', 0, 2, 'write', null, { value: 1 }), op('b', 2, 3, 'read', 0)]) },
  { name: 'budget-exhausted', title: '搜索预算不足：未判定', expected: 'unknown', args: ['--max-nodes', '1'], data: history([op('a', 0, 1, 'read', 0), op('b', 2, 3, 'read', 0)]) },
  { name: 'pending-rejected', title: '缺少完成结果：输入无效', expected: 'invalid', data: history([{ id: 'pending', client: 'a', start: 0, end: 2, kind: 'read' }]) },
  { name: 'noise-64', title: '62 次无关读取加 CAS 竞态，缩减到两条', expected: 'violation', reduced: 2, data: history([...Array.from({ length: 62 }, (_, i) => op(`r${i}`, i * 2, i * 2 + 1, 'read', 0)), op('a', 126, 134, 'cas', true, { expected: 0, value: 1 }), op('b', 127, 133, 'cas', true, { expected: 0, value: 2 })]) },
  { name: 'captured-broken', title: '实际执行带竞态的 CAS：违规', expected: 'violation', reduced: 2, data: await capture('broken') },
  { name: 'captured-correct', title: '实际执行修正后的 CAS：通过', expected: 'linearizable', data: await capture('correct') },
);
const rows = [];
for (const sample of samples) {
  const input = join(destination, `${sample.name}-input.json`);
  await writeFile(input, sample.source || JSON.stringify(sample.data, null, 2), { flag: 'wx' });
  const start = performance.now();
  const run = spawnSync(process.execPath, ['cli.mjs', 'check', input, '--json', '--reduce', ...(sample.args || [])], { cwd: root, encoding: 'utf8', timeout: 15000 });
  if (run.error) throw run.error;
  const actual = JSON.parse(run.stdout);
  assert.equal(actual.verdict, sample.expected, sample.name);
  assert.equal(run.status, { linearizable: 0, violation: 1, unknown: 2, invalid: 3 }[sample.expected], `${sample.name}: exit code`);
  if (sample.reduced) {
    assert.equal(actual.reduction.history.operations.length, sample.reduced, sample.name);
    assert.equal(actual.reduction.one_minimal, true, sample.name);
  }
  if (actual.verdict === 'linearizable') {
    assert.equal(actual.result.order.length, actual.history.operations.length);
    assert.equal(actual.replay.steps.length, actual.history.operations.length);
  }
  await writeFile(join(destination, `${sample.name}-result.json`), JSON.stringify(actual, null, 2), { flag: 'wx' });
  rows.push({ name: sample.name, title: sample.title, expected: sample.expected, actual: actual.verdict, exit: run.status,
    inputOperations: actual.history?.operations.length ?? null, reducedOperations: actual.reduction?.history.operations.length ?? null,
    oneMinimal: actual.reduction?.one_minimal ?? null, elapsedMs: Number((performance.now() - start).toFixed(2)), passed: true });
  console.log(`PASS ${sample.name}: ${actual.verdict} (exit ${run.status})`);
}
const report = { generatedAt: new Date().toISOString(), runtime: process.version, cases: rows.length, passed: rows.length, failed: 0, results: rows };
await writeFile(join(destination, 'results.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
const markdown = `# MoonWitness 样例验收报告\n\n通过 ${rows.length}/${rows.length}。以下结果来自实际调用命令行，不是根据预期填写。\n\n| 场景 | 预期 | 实际 | 退出码 | 操作数 → 缩减后 |\n|---|---|---|---|---|\n${rows.map(r => `| ${r.title} | ${r.expected} | ${r.actual} | ${r.exit} | ${r.inputOperations ?? '无效'} → ${r.reducedOperations ?? '不适用'} |`).join('\n')}\n\n每个场景的输入和完整结果均保存在同目录。耗时包含 Node 进程启动，不用于比较核心算法性能。\n\n缩减保持原初始状态；单步删除最小不等于全局最小或唯一根因。\n`;
await writeFile(join(destination, 'REPORT.md'), markdown, { flag: 'wx' });
console.log(`Samples: ${rows.length}/${rows.length} passed. Evidence: ${destination}`);
