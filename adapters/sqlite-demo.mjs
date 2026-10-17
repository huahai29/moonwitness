// A real file-backed SQLite integration, not a simulated database. The broken
// case is an APPLICATION read/modify/write race; it is not a SQLite defect.
import { open, mkdir, mkdtemp } from 'node:fs/promises';
import { writeNew } from './file-host.mjs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Recorder } from './recorder.mjs';

export async function captureSqlite(mode, databasePath) {
  if (!['broken', 'atomic'].includes(mode)) throw new Error('mode must be broken or atomic');
  let DatabaseSync;
  try { ({ DatabaseSync } = await import('node:sqlite')); }
  catch { throw new Error('SQLite demo requires Node.js 24+ with node:sqlite; core checking still supports Node.js 20+.'); }
  if (!databasePath) databasePath = join(await mkdtemp(join(tmpdir(), 'moonwitness-sqlite-')), 'counter.sqlite');
  // Reserve a fresh file; do not reset or reuse a user's database.
  const reserved = await open(databasePath, 'wx'); await reserved.close();
  const first = new DatabaseSync(databasePath);
  let second;
  try {
    first.exec("PRAGMA journal_mode=WAL; CREATE TABLE counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL) STRICT; INSERT INTO counters VALUES ('value', 0);");
    second = new DatabaseSync(databasePath);
    const sqliteVersion = first.prepare('SELECT sqlite_version() AS version').get().version;
    const recorder = new Recorder('counter', 0);
    let release;
    const barrier = new Promise(resolve => { release = resolve; });
    async function increment(db, delta) {
      if (mode === 'atomic') {
        return db.prepare("UPDATE counters SET value=value+? WHERE name='value' RETURNING value").get(delta).value;
      }
      const observed = db.prepare("SELECT value FROM counters WHERE name='value'").get().value;
      await barrier; // Both application calls read before either writes.
      const next = observed + delta;
      db.prepare("UPDATE counters SET value=? WHERE name='value'").run(next);
      return next;
    }
    const alice = recorder.record({ id: 'alice-add', client: 'alice', kind: 'add', value: 1 }, () => increment(first, 1));
    const bob = recorder.record({ id: 'bob-add', client: 'bob', kind: 'add', value: 1 }, () => increment(second, 1));
    release();
    await Promise.all([alice, bob]);
    const finalValue = await recorder.record({ id: 'final-read', client: 'observer', kind: 'read' }, () => first.prepare("SELECT value FROM counters WHERE name='value'").get().value);
    return { history: recorder.history(), finalValue, sqliteVersion, databasePath, mode };
  } finally { second?.close(); first.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (!process.argv[2] || process.argv.length > 3) throw new Error('Usage: node adapters/sqlite-demo.mjs <new-output-directory>');
    const destination = resolve(process.argv[2]); await mkdir(destination, { recursive: true });
    const { analyze } = await import('../dist/engine.mjs');
    const { standaloneReport } = await import('../scripts/report.mjs');
    const cases = [];
    for (const mode of ['broken', 'atomic']) {
      const captured = await captureSqlite(mode, join(destination, `${mode}.sqlite`));
      const source = JSON.stringify(captured.history, null, 2);
      const result = JSON.parse(analyze(source, 100000, 300));
      writeNew(join(destination, `${mode}-history.json`), source);
      writeNew(join(destination, `${mode}-result.json`), JSON.stringify(result, null, 2));
      writeNew(join(destination, `${mode}-replay.html`), await standaloneReport(source, result));
      cases.push({ mode, sqliteVersion: captured.sqliteVersion, finalValue: captured.finalValue, verdict: result.verdict, operations: captured.history.operations.length });
    }
    writeNew(join(destination, 'summary.json'), JSON.stringify({ cases }, null, 2));
    console.log(JSON.stringify({ destination, cases }, null, 2));
    if (cases[0].verdict !== 'violation' || cases[1].verdict !== 'linearizable') process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 3; }
}
