import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { analyze } from '../dist/engine.mjs';
import { standaloneReport } from './report.mjs';
const destination = process.argv[2];
if (!destination) { console.error('Usage: node scripts/export-demo.mjs <output-directory>'); process.exit(3); }
await mkdir(destination, { recursive: true });
for (const name of ['cas-race', 'legal-overlap']) {
  const source = await readFile(new URL(`../examples/${name}.json`, import.meta.url), 'utf8');
  const result = JSON.parse(analyze(source, 100000, 300));
  await writeFile(join(destination, `${name}-report.json`), JSON.stringify(result, null, 2), { flag: 'wx' });
  await writeFile(join(destination, `${name}-replay.html`), await standaloneReport(source, result), { flag: 'wx' });
}
console.log(`Exported reports: ${resolve(destination)}`);
