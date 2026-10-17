// Node.js convenience host. Capture and I/O only; MoonBit makes every verdict.
import { analyze } from '../web/engine.mjs';
import { Recorder } from './recorder.mjs';

function integer(value, label) {
  if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) throw new TypeError(`${label} must be a signed 32-bit integer`);
  return value;
}
function budget(value, maximum, label, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be ${minimum}..${maximum}`);
  return value;
}
export class WitnessError extends Error {
  constructor(result) {
    const reason = { violation: 'Observed calls violate the declared atomic-operation model', unknown: 'Search budget exhausted; no verdict', invalid: 'Invalid captured history' }[result.verdict] || 'Check failed';
    super(reason); this.name = 'WitnessError'; this.verdict = result.verdict; this.result = result;
  }
}

function createProbe(model, target, options, specification) {
  const initial = integer(options.initial ?? 0, 'initial');
  const defaultNodes = budget(options.maxNodes ?? 100000, 1000000, 'maxNodes', 1);
  const defaultChecks = budget(options.maxChecks ?? 300, 1000, 'maxChecks');
  if (!target || typeof target !== 'object') throw new TypeError('target must be an object of operation callbacks');
  for (const [name, definition] of Object.entries(specification)) {
    if (!definition.optional && typeof target[name] !== 'function') throw new TypeError(`Provide target.${name} callback`);
    if (target[name] !== undefined && typeof target[name] !== 'function') throw new TypeError(`target.${name} must be a function`);
  }
  const recorder = new Recorder(model, initial), active = new Set(); let sequence = 0;
  function actor(client) {
    if (client !== undefined && (typeof client !== 'string' || !client || client.startsWith('@call:'))) throw new TypeError('client must be a nonempty string outside reserved @call: namespace');
    const operations = {};
    for (const [name, definition] of Object.entries(specification)) {
      if (typeof target[name] !== 'function') continue;
      operations[name] = async (...args) => {
        // Validate before invoking the target: rejected SDK calls have no side effects.
        const description = definition.input(args);
        if (sequence >= 256) throw new RangeError('Capture is limited to 256 calls; create a fresh probe for another isolated run');
        const id = `op-${sequence + 1}`, identity = client ?? `@call:${id}`;
        if (active.has(identity)) throw new Error(`Client ${identity} already has an in-flight call; use separate clients for concurrent calls`);
        sequence++; active.add(identity);
        try {
          let returned;
          await recorder.record({ id, client: identity, kind: name, ...description }, async () => {
            returned = await target[name](...args);
            return definition.output(returned);
          });
          return returned;
        } finally { active.delete(identity); }
      };
    }
    return operations;
  }
  const probe = {
    ...actor(),
    client: client => actor(client),
    history: () => recorder.history(),
    check(settings = {}) {
      const nodes = budget(settings.maxNodes ?? defaultNodes, 1000000, 'maxNodes', 1);
      const checks = settings.shrink === false ? 0 : budget(settings.maxChecks ?? defaultChecks, 1000, 'maxChecks');
      return JSON.parse(analyze(JSON.stringify(recorder.history()), nodes, checks));
    },
    assert(settings = {}) {
      const result = probe.check(settings);
      if (result.verdict !== 'linearizable') throw new WitnessError(result);
      return result;
    },
    async saveReport(directory, settings = {}) {
      const result = probe.check(settings);
      const { mkdir, writeFile } = await import('node:fs/promises');
      const { join, resolve } = await import('node:path');
      const { standaloneReport } = await import('../scripts/report.mjs');
      // Reserve a new directory to avoid mixing evidence from different runs.
      const destination = resolve(directory); await mkdir(destination);
      const source = JSON.stringify(result.history, null, 2);
      await writeFile(join(destination, 'history.json'), source, { flag: 'wx' });
      await writeFile(join(destination, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
      await writeFile(join(destination, 'replay.html'), await standaloneReport(source, result), { flag: 'wx' });
      return { directory: destination, result };
    },
  };
  return probe;
}
const none = args => { if (args.length) throw new TypeError('This operation takes no arguments'); return {}; };
const value = args => { if (args.length !== 1) throw new TypeError('Provide exactly one integer'); return { value: integer(args[0], 'value') }; };
const cas = args => { if (args.length !== 2) throw new TypeError('Provide expected and next integers'); return { expected: integer(args[0], 'expected'), value: integer(args[1], 'value') }; };
const key = arg => { if (typeof arg !== 'string') throw new TypeError('key must be a string'); return arg; };
const number = output => integer(output, 'operation output');
const ack = output => { if (output !== undefined && output !== null) throw new TypeError('write/put callback must resolve void or null; throw on failure'); return null; };
const boolean = output => { if (typeof output !== 'boolean') throw new TypeError('CAS callback must return boolean'); return output; };

/** Counter read() and add(delta); add MUST return the value AFTER addition. */
export function createCounterProbe(target, options = {}) {
  return createProbe('counter', target, options, { read: { input: none, output: number }, add: { input: value, output: number } });
}
/** Integer register; writes resolve void/null, optional CAS returns boolean. */
export function createRegisterProbe(target, options = {}) {
  return createProbe('register', target, options, { read: { input: none, output: number }, write: { input: value, output: ack }, cas: { input: cas, output: boolean, optional: true } });
}
/** Independent integer keys, each initialized to options.initial (default 0). */
export function createKvProbe(target, options = {}) {
  return createProbe('kv', target, options, {
    get: { input: args => { if (args.length !== 1) throw new TypeError('get requires a key'); return { key: key(args[0]) }; }, output: number },
    put: { input: args => { if (args.length !== 2) throw new TypeError('put requires key and value'); return { key: key(args[0]), value: integer(args[1], 'value') }; }, output: ack },
    cas: { input: args => { if (args.length !== 3) throw new TypeError('cas requires key, expected and next'); return { key: key(args[0]), expected: integer(args[1], 'expected'), value: integer(args[2], 'value') }; }, output: boolean, optional: true },
  });
}
