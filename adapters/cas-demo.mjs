import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { Recorder } from './recorder.mjs';

export async function capture(mode = 'broken') {
  if (!['broken', 'correct'].includes(mode)) throw new Error('mode must be broken or correct');
  let value = 0;
  let release;
  const barrier = new Promise(done => { release = done; });
  async function brokenCas(expected, next) {
    const seen = value;
    await barrier; // Both clients have read 0 before either writes.
    if (seen !== expected) return false;
    value = next;
    return true;
  }
  function correctCas(expected, next) {
    if (value !== expected) return false;
    value = next;
    return true;
  }
  const recorder = new Recorder();
  const cas = mode === 'broken' ? brokenCas : correctCas;
  const first = recorder.record({ id: 'alice-cas', client: 'alice', kind: 'cas', expected: 0, value: 1 }, () => cas(0, 1));
  const second = recorder.record({ id: 'bob-cas', client: 'bob', kind: 'cas', expected: 0, value: 2 }, () => cas(0, 2));
  release();
  await Promise.all([first, second]);
  return recorder.history();
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    const mode = args[0] || 'broken';
    if (args.length > 2) throw new Error('Usage: node adapters/cas-demo.mjs [broken|correct] [output.json]');
    const json = JSON.stringify(await capture(mode), null, 2) + '\n';
    if (args[1]) await writeFile(args[1], json, { flag: 'wx' });
    else process.stdout.write(json);
  } catch (error) { console.error(error.message); process.exitCode = 3; }
}
