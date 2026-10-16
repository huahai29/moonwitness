import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../dist/engine.mjs';
import { standaloneReport } from '../scripts/report.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const cli = (args, options = {}) => spawnSync(process.execPath, ['cli.mjs', ...args], { cwd: root, encoding: 'utf8', ...options });

test('CLI communicates all four verdicts with distinct exit codes', () => {
  assert.equal(cli(['check', 'examples/legal-overlap.json']).status, 0);
  assert.equal(cli(['check', 'examples/cas-race.json']).status, 1);
  assert.equal(cli(['check', 'examples/legal-overlap.json', '--max-nodes', '1']).status, 2);
  assert.equal(cli(['check', '-'], { input: '{}' }).status, 3);
});
test('CLI JSON remains parseable on failure and accepts stdin', async () => {
  const source = await readFile(join(root, 'examples/cas-race.json'), 'utf8');
  const run = cli(['check', '-', '--json', '--reduce'], { input: source });
  assert.equal(run.status, 1);
  const report = JSON.parse(run.stdout);
  assert.equal(report.reduction.history.operations.length, 2);
  assert.equal(report.reduction.one_minimal, true);
  assert.ok(report.reduction.replay.frontier.some(op => op.status === 'model_rejected'));
});
test('CLI rejects malformed options and budgets', () => {
  for (const args of [['--wat'], ['check', 'examples/cas-race.json', '--wat'], ['check', 'examples/cas-race.json', '--max-nodes', 'NaN'], ['check', 'examples/cas-race.json', '--max-nodes', '2147483648'], ['check', 'examples/cas-race.json', '--max-checks', '1001']]) {
    assert.equal(cli(args).status, 3);
  }
});
test('JSON boundary rejects oversized histories and noninteger fields', () => {
  const base = { model: 'register', initial: 0, operations: [] };
  for (const initial of [2147483648, 1.5, '0']) assert.equal(JSON.parse(analyze(JSON.stringify({ ...base, initial }), 100, 0)).verdict, 'invalid');
  const operations = Array.from({ length: 257 }, (_, i) => ({ id: `${i}`, client: `${i}`, start: 0, end: 1, kind: 'read', output: 0 }));
  assert.equal(JSON.parse(analyze(JSON.stringify({ ...base, operations }), 100, 0)).verdict, 'invalid');
  assert.equal(JSON.parse(analyze(' '.repeat(2000001), 100, 0)).verdict, 'invalid');
});
test('offline HTML embeds data without script injection or network dependencies', async () => {
  const source = JSON.stringify({ model: 'register', initial: 0, operations: [{ id: '</script><script>window.pwned=1</script>', client: '<img src=x onerror=alert(1)>', start: 0, end: 1, kind: 'read', output: 0 }] });
  const result = JSON.parse(analyze(source, 100, 0));
  const html = await standaloneReport(source, result);
  assert.equal((html.match(/<script\b/g) || []).length, 1);
  assert.equal((html.match(/<\/script>/g) || []).length, 1);
  assert.ok(!html.includes('<script src='));
  assert.ok(html.includes('engineSource='));
});
test('CLI exports reproducible JSON and HTML without overwriting files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moonwitness-'));
  const report = join(dir, 'report.json'), html = join(dir, 'report.html');
  const args = ['check', 'examples/cas-race.json', '--reduce', '--out', report, '--html', html];
  assert.equal(cli(args).status, 1);
  assert.equal(JSON.parse(await readFile(report, 'utf8')).verdict, 'violation');
  assert.ok((await readFile(html, 'utf8')).includes('离线报告'));
  assert.equal(cli(args).status, 3);
  const sentinel = join(dir, 'input.json'); await writeFile(sentinel, '{}');
  assert.equal(cli(['check', sentinel, '--out', sentinel]).status, 3);
  assert.equal(await readFile(sentinel, 'utf8'), '{}');
});
