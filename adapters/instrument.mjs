// Node.js convenience host. Capture and I/O only; MoonBit makes every verdict.
import { analyze, probe_input, probe_output } from '../web/engine.mjs';
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
    for (const name of Object.keys(specification)) {
      if (typeof target[name] !== 'function') continue;
      operations[name] = async (...args) => {
        // Validate before invoking the target: rejected SDK calls have no side effects.
        const description = checked(probe_input(model, name, encodeArguments(args))).description;
        if (sequence >= 256) throw new RangeError('Capture is limited to 256 calls; create a fresh probe for another isolated run');
        const id = `op-${sequence + 1}`, identity = client ?? `@call:${id}`;
        if (active.has(identity)) throw new Error(`Client ${identity} already has an in-flight call; use separate clients for concurrent calls`);
        sequence++; active.add(identity);
        try {
          let returned;
          await recorder.record({ id, client: identity, kind: name, ...description }, async () => {
            returned = await target[name](...args);
            return checked(probe_output(name, encodeOutput(returned))).output;
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
      const { exportBundle } = await import('./file-host.mjs');
      const { standaloneReport } = await import('../scripts/report.mjs');
      const source = JSON.stringify(result.history, null, 2);
      const { directory: destination } = exportBundle(directory, source,
        JSON.stringify(result, null, 2), await standaloneReport(source, result));
      return { directory: destination, result };
    },
  };
  return probe;
}
function checked(source) {
  const result = JSON.parse(source);
  if (result.error) throw new TypeError(result.error);
  return result;
}

/** Counter add(delta) returns the value AFTER addition. */
export function createCounterProbe(target, options = {}) {
  return createProbe('counter', target, options, { read: {}, add: {} });
}
/** Integer register; writes resolve void/null, optional CAS returns boolean. */
export function createRegisterProbe(target, options = {}) {
  return createProbe('register', target, options, { read: {}, write: {}, cas: { optional: true } });
}
/** Independent integer keys, each initialized to options.initial (default 0). */
export function createKvProbe(target, options = {}) {
  return createProbe('kv', target, options, { get: {}, put: {}, cas: { optional: true } });
}

// JSON cannot preserve non-finite numbers or custom toJSON conversions. Reject
// these at the language boundary before MoonBit validates operation semantics.
function encodeArguments(args) {
  if (args.some(value => value !== null && !['number', 'string', 'boolean', 'undefined'].includes(typeof value))) throw new TypeError('Operation arguments must be primitive values');
  return JSON.stringify(args);
}
function encodeOutput(value) {
  if (value !== null && value !== undefined && !['number', 'boolean', 'string'].includes(typeof value)) throw new TypeError('Operation output must be a primitive value');
  if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('Operation output must be a finite integer');
  return JSON.stringify(value) ?? 'null';
}
