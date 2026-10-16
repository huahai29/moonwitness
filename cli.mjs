#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { standaloneReport } from './scripts/report.mjs';

export async function main(args) {
  const usage = 'Usage: node cli.mjs check <history.json|-> [--reduce] [--max-nodes N] [--max-checks N] [--json] [--out report.json] [--html report.html]\nExit: 0 linearizable, 1 violation, 2 unknown, 3 invalid/input error.';
  if (!args.length || args.includes('--help')) { console.log(usage); return 0; }
  if (args[0] !== 'check' || !args[1] || args[1].startsWith('--')) throw new Error(usage);
  const options = { nodes: 100000, checks: 1000, reduce: false, json: false };
  for (let i = 2; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--reduce') options.reduce = true;
    else if (flag === '--json') options.json = true;
    else if (['--max-nodes', '--max-checks', '--out', '--html'].includes(flag)) {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
      if (flag === '--out') options.out = value;
      else if (flag === '--html') options.html = value;
      else {
        if (!/^\d+$/.test(value)) throw new Error(`${flag} must be an integer`);
        options[flag === '--max-nodes' ? 'nodes' : 'checks'] = Number(value);
      }
    } else throw new Error(`Unknown option: ${flag}`);
  }
  if (!Number.isSafeInteger(options.nodes) || options.nodes < 1 || options.nodes > 1000000 ||
      !Number.isSafeInteger(options.checks) || options.checks < 0 || options.checks > 1000) {
    throw new Error('max-nodes must be 1..1000000; max-checks must be 0..1000');
  }
  const destinations = [options.out, options.html].filter(Boolean).map(p => resolve(p));
  if (new Set(destinations).size !== destinations.length || (args[1] !== '-' && destinations.includes(resolve(args[1])))) {
    throw new Error('Input, JSON output and HTML output must use different paths');
  }
  let source;
  if (args[1] === '-') {
    const chunks = []; let length = 0;
    for await (const chunk of process.stdin) {
      length += chunk.length;
      if (length > 8000000) throw new Error('Input too large');
      chunks.push(chunk);
    }
    source = Buffer.concat(chunks).toString('utf8');
  } else {
    const { stat } = await import('node:fs/promises');
    if ((await stat(args[1])).size > 8000000) throw new Error('Input too large');
    source = await readFile(args[1], 'utf8');
  }
  let analyze;
  try { ({ analyze } = await import('./dist/engine.mjs')); }
  catch (error) { throw new Error(`Cannot load engine. Run npm run build first. ${error.message}`); }
  const result = JSON.parse(analyze(source.replace(/^\uFEFF/, ''), options.nodes, options.reduce ? options.checks : 0));
  const json = JSON.stringify(result, null, 2) + '\n';
  if (options.out) await writeFile(options.out, json, { encoding: 'utf8', flag: 'wx' });
  if (options.html) await writeFile(options.html, await standaloneReport(source, result), { encoding: 'utf8', flag: 'wx' });
  if (options.json) process.stdout.write(json);
  else {
    console.log(`${result.verdict.toUpperCase()}: ${result.message}`);
    if (result.result) console.log(`Explored ${result.result.explored} search nodes; ${result.result.order.length} operations in witness/prefix.`);
    if (result.reduction) console.log(`Reduced ${result.history.operations.length} -> ${result.reduction.history.operations.length} operations; one-minimal=${result.reduction.one_minimal}; ${result.reduction.checks} checks.`);
    if (options.html) console.log(`Offline replay: ${resolve(options.html)}`);
  }
  return { linearizable: 0, violation: 1, unknown: 2, invalid: 3 }[result.verdict] ?? 3;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(error => {
    console.error(`MoonWitness: ${error.message}`); process.exitCode = 3;
  });
}
