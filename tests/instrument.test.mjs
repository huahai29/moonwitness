import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, mkdir, copyFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCounterProbe, createRegisterProbe, createKvProbe, WitnessError } from '../adapters/instrument.mjs';

test('counter probe automatically captures concurrent calls and preserves target this', async () => {
  const target = { stored: 0, read() { return this.stored; }, add(delta) { this.stored += delta; return this.stored; } };
  const probe = createCounterProbe(target);
  assert.deepEqual(await Promise.all([probe.add(1), probe.add(1)]), [1, 2]);
  assert.equal(await probe.read(), 2);
  assert.equal(probe.assert().verdict, 'linearizable');
  const history = probe.history();
  assert.deepEqual(history.operations.map(op => op.id), ['op-1', 'op-2', 'op-3']);
  assert.equal(new Set(history.operations.map(op => op.client)).size, 3);
});
test('probe finds actual async lost update and assertion carries evidence', async () => {
  let stored = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const probe = createCounterProbe({ read: () => stored, async add(delta) { const before = stored; await gate; stored = before + delta; return stored; } });
  const first = probe.add(1), second = probe.add(1); release(); await Promise.all([first, second]);
  assert.equal(probe.check().verdict, 'violation');
  assert.throws(() => probe.assert(), error => error instanceof WitnessError && error.verdict === 'violation' && error.result.history.operations.length === 2);
});
test('budget exhaustion remains unknown in assertions', async () => {
  const probe = createCounterProbe({ read: () => 0, add: n => n });
  await probe.read(); await probe.read();
  assert.throws(() => probe.assert({ maxNodes: 1 }), error => error instanceof WitnessError && error.verdict === 'unknown');
});
test('named clients reject overlap before invoking target, but permit sequential calls', async () => {
  let finish, calls = 0;
  const probe = createCounterProbe({ read: () => 0, add: () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
  const alice = probe.client('alice'), request = alice.add(1);
  await assert.rejects(alice.read(), /in-flight/);
  assert.equal(calls, 1); finish(1); await request;
  assert.equal(await alice.read(), 0); // Deliberately inconsistent target, still recorded.
  assert.equal(probe.check().verdict, 'violation');
});
test('pending and rejected target calls cannot produce a passing report', async () => {
  let finish;
  const pending = createCounterProbe({ read: () => new Promise(resolve => { finish = resolve; }), add: x => x });
  const request = pending.read(); assert.throws(() => pending.check(), /pending/); finish(0); await request;
  const failed = createCounterProbe({ read() { throw new Error('timeout'); }, add: x => x });
  await assert.rejects(failed.read(), /timeout/); assert.throws(() => failed.check(), /uncertain/);
});
test('register and KV probes normalize only successful void acknowledgements', async () => {
  let stored = 3;
  const register = createRegisterProbe({ read: () => stored, write: value => { stored = value; }, cas: (expected, next) => { if (stored !== expected) return false; stored = next; return true; } }, { initial: 3 });
  assert.equal(await register.write(4), undefined); assert.equal(await register.cas(4, 5), true); await register.read();
  assert.equal(register.assert().verdict, 'linearizable');
  assert.equal(register.history().operations[0].output, null);
  const values = new Map();
  const kv = createKvProbe({ get: key => values.get(key) ?? 0, put: (key, value) => { values.set(key, value); } });
  await kv.put('x', 9); assert.equal(await kv.get('y'), 0); await kv.get('x');
  assert.equal(kv.assert().strategy, 'independent_keys');
});
test('invalid arguments and exhausted capture limit never call the target', async () => {
  let calls = 0;
  const probe = createCounterProbe({ read: () => { calls++; return 0; }, add: x => { calls++; return x; } });
  await assert.rejects(probe.add(1.5), /integer/); assert.equal(calls, 0);
  for (let i = 0; i < 256; i++) await probe.read();
  await assert.rejects(probe.read(), /256/); assert.equal(calls, 256);
});
test('malformed outputs are rejected and capture remains uncertain', async () => {
  const probe = createRegisterProbe({ read: () => 0, write: () => false });
  await assert.rejects(probe.write(1), /throw on failure/); assert.throws(() => probe.check(), /uncertain/);
  assert.throws(() => createCounterProbe({ read: () => 0 }), /add callback/);
  assert.throws(() => createCounterProbe({}, { initial: 0.5 }), /integer/);
});

test('JSON transport cannot coerce custom arguments or nonfinite acknowledgements', async () => {
  let calls = 0;
  const counter = createCounterProbe({ read: () => 0, add: x => { calls++; return x; } });
  await assert.rejects(counter.add({ toJSON: () => 1 }), /primitive/);
  assert.equal(calls, 0);
  for (const output of [NaN, Infinity, { toJSON: () => null }]) {
    const register = createRegisterProbe({ read: () => 0, write: () => output });
    await assert.rejects(register.write(1), /integer|primitive/);
    assert.throws(() => register.check(), /uncertain/);
  }
});
test('one-call report export works using bundled engine and refuses existing directories', async () => {
  const directory = join(await mkdtemp(join(tmpdir(), 'moonwitness-probe-')), 'evidence');
  const probe = createCounterProbe({ read: () => 0, add: x => x }); await probe.read();
  const saved = await probe.saveReport(directory);
  assert.equal(saved.result.verdict, 'linearizable');
  assert.equal(JSON.parse(await readFile(join(directory, 'history.json'), 'utf8')).operations.length, 1);
  assert.ok((await readFile(join(directory, 'replay.html'), 'utf8')).includes('离线报告'));
  await assert.rejects(probe.saveReport(directory), /EEXIST/);
});

test('unbuilt integration and report export need no dist, node_modules or MoonBit compiler', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moonwitness-fresh-'));
  for (const file of ['adapters/instrument.mjs', 'adapters/recorder.mjs', 'web/engine.mjs', 'web/ui.mjs', 'web/style.css', 'scripts/report.mjs', 'examples/quickstart.mjs']) {
    const destination = join(directory, file);
    await mkdir(join(destination, '..'), { recursive: true });
    await copyFile(new URL(`../${file}`, import.meta.url), destination);
  }
  const run = spawnSync(process.execPath, ['examples/quickstart.mjs', join(directory, 'evidence')], { cwd: directory, encoding: 'utf8', env: { ...process.env, PATH: '' } });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /linearizable/); assert.match(run.stdout, /violation/);
  assert.equal(JSON.parse(await readFile(join(directory, 'evidence', 'correct', 'result.json'), 'utf8')).verdict, 'linearizable');
  assert.equal(JSON.parse(await readFile(join(directory, 'evidence', 'broken', 'result.json'), 'utf8')).verdict, 'violation');
});
