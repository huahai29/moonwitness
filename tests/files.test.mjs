import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readText, writeNew, exportFiles, exportBundle } from '../adapters/file-host.mjs';
import { read_text, write_new } from '../adapters/files.mjs';

test('MoonBit file layer roundtrips Chinese, emoji and BOM in UTF-8', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'witness-文字-'));
  const file = join(directory, '记录.json');
  const source = '\uFEFF{"说明":"并发调用🌙"}\n';
  writeNew(file, source);
  assert.equal(readText(file), source);
  assert.equal(await readFile(file, 'utf8'), source);
});

test('read limits count bytes and malformed UTF-8 is rejected', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'witness-limit-'));
  const file = join(directory, 'text'); await writeFile(file, '月');
  assert.equal(readText(file, 3), '月');
  assert.throws(() => readText(file, 2), /too large/);
  await writeFile(file, Buffer.from([0xff]));
  assert.throws(() => readText(file), /UTF-8/);
  assert.throws(() => readText(file, 0), /limit/);
});

test('partial reads continue to EOF and growth beyond the limit closes the file', () => {
  function fake(source) {
    let offset = 0, closed = 0;
    return { get closed() { return closed; }, openSync: () => 7, fstatSync: () => ({size:0}),
      readSync(fd, buffer, start, count) { const bytes = source.subarray(offset, offset + Math.min(count, 2)); buffer.set(bytes, start); offset += bytes.length; return bytes.length; },
      closeSync() { closed++; },
    };
  }
  const short = fake(Buffer.from('并发🌙'));
  assert.equal(JSON.parse(read_text(short, 'file', 20)).text, '并发🌙');
  assert.equal(short.closed, 1);
  const grown = fake(Buffer.from('123456'));
  assert.match(JSON.parse(read_text(grown, 'file', 5)).error, /too large/);
  assert.equal(grown.closed, 1);
});

test('partial writes preserve all bytes and write failures close the descriptor', () => {
  const output = []; let closed = 0;
  const fs = { openSync(path, flags) { assert.equal(flags, 'wx'); return 5; },
    writeSync(fd, bytes, offset) { output.push(bytes[offset]); return 1; }, closeSync() { closed++; } };
  assert.deepEqual(JSON.parse(write_new(fs, 'file', '中文🌙')), {});
  assert.equal(Buffer.from(output).toString('utf8'), '中文🌙'); assert.equal(closed, 1);
  fs.writeSync = () => { throw new Error('disk full'); };
  assert.match(JSON.parse(write_new(fs, 'file', 'x')).error, /disk full/);
  assert.equal(closed, 2);
  fs.writeSync = (fd, bytes, offset, count) => count;
  fs.closeSync = () => { throw new Error('close failed'); };
  assert.match(JSON.parse(write_new(fs, 'file', 'x')).error, /close failed/);
});

test('exports preflight every destination and refuse normalized path collisions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'witness-path-'));
  const output = join(directory, 'new.json'), htmlPath = join(directory, 'existing.html');
  await writeFile(htmlPath, 'keep');
  assert.throws(() => exportFiles({output, json:'{}', htmlPath, html:'replace'}), /EEXIST/);
  await assert.rejects(access(output)); assert.equal(await readFile(htmlPath, 'utf8'), 'keep');
  assert.throws(() => exportFiles({input:output, output:join(directory, '.', 'new.json'), json:'{}'}), /different paths/);
  assert.throws(() => exportFiles({output, htmlPath:output, json:'{}', html:'x'}), /different paths/);
  await assert.rejects(access(output));
});

test('exclusive creation still rejects a destination created after preflight', () => {
  // write_new always uses wx; a separate existence check cannot weaken it.
  const fs = { openSync(path, flags) { assert.equal(flags, 'wx'); throw new Error('EEXIST: raced'); } };
  assert.match(JSON.parse(write_new(fs, 'file', 'new')).error, /EEXIST/);
});

test('report bundles create a new directory and preserve existing evidence', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'witness-bundle-'));
  const directory = join(parent, '证据');
  exportBundle(directory, '{"记录":1}', '{"结果":2}', '<html>回放</html>');
  assert.equal(readText(join(directory, 'replay.html')), '<html>回放</html>');
  assert.throws(() => exportBundle(directory, '{}', '{}', 'replace'), /EEXIST/);
  assert.equal(readText(join(directory, 'history.json')), '{"记录":1}');
  assert.throws(() => writeNew(join(directory, 'history.json'), '{}'), /EEXIST/);
});

test('CLI rejects oversized stdin through MoonBit file I/O', () => {
  const run = spawnSync(process.execPath, ['cli.mjs', 'check', '-'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), encoding:'utf8', input:Buffer.alloc(8000001, 32),
  });
  assert.equal(run.status, 3);
  assert.match(run.stderr, /Input too large/);
});
